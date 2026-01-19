// src/services/rateLimiter.js
import { storage } from '@forge/api';

// Pricing is expressed per token so we can reuse the same helper across models without having to
// remember whether a vendor quoted their pricing per 1K, 100K, or 1M tokens. Each entry contains
// the current public pricing announced by OpenAI in USD per token.
const MODEL_PRICING = Object.freeze({
  'gpt-5-mini': {
    inputPerToken: 0.25 / 1000000,
    cachedInputPerToken: 0.025 / 1000000,
    outputPerToken: 2.0 / 1000000,
  },
  'gpt-5.1': {
    inputPerToken: 1.25 / 1000000,
    cachedInputPerToken: 0.125 / 1000000,
    outputPerToken: 10.0 / 1000000,
  },
});
const DEFAULT_COMPLETION_MODEL = 'gpt-5-mini';
const EMBEDDING_PRICING = Object.freeze({
  'text-embedding-3-large': {
    costPerToken: 0.13 / 1000000,
  },
});
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';

class RateLimiter {
  constructor() {
    this.dailyLimit = 1000; // Max API calls per day
    this.hourlyLimit = 100; // Max API calls per hour
    this.costLimit = 10.0; // Max USD per day
    this.defaultCompletionModel = DEFAULT_COMPLETION_MODEL;
    this.defaultEmbeddingModel = DEFAULT_EMBEDDING_MODEL;
  }

  /**
   * Get current usage stats
   */
  async getUsage() {
    const today = this.getDateKey();
    const hour = this.getHourKey();
    
    const dailyUsage = await storage.get(`usage_daily_${today}`) || {
      calls: 0,
      cost: 0,
      embeddings: 0,
      completions: 0
    };
    
    const hourlyUsage = await storage.get(`usage_hourly_${hour}`) || {
      calls: 0
    };
    
    return { dailyUsage, hourlyUsage };
  }

  /**
   * Check if request is allowed
   */
  async canMakeRequest() {
    const { dailyUsage, hourlyUsage } = await this.getUsage();
    
    if (dailyUsage.calls >= this.dailyLimit) {
      throw new Error('Daily API call limit reached. Please try again tomorrow.');
    }
    
    if (hourlyUsage.calls >= this.hourlyLimit) {
      throw new Error('Hourly API call limit reached. Please try again in an hour.');
    }
    
    if (dailyUsage.cost >= this.costLimit) {
      throw new Error('Daily cost limit reached. Please try again tomorrow.');
    }
    
    return true;
  }

  /**
   * Track an API call
   */
  async trackCall(type, cost) {
    const today = this.getDateKey();
    const hour = this.getHourKey();
    
    // Update daily usage
    const dailyUsage = await storage.get(`usage_daily_${today}`) || {
      calls: 0,
      cost: 0,
      embeddings: 0,
      completions: 0
    };
    
    dailyUsage.calls += 1;
    dailyUsage.cost += cost;
    dailyUsage[type] += 1;
    
    await storage.set(`usage_daily_${today}`, dailyUsage);
    
    // Update hourly usage
    const hourlyUsage = await storage.get(`usage_hourly_${hour}`) || {
      calls: 0
    };
    
    hourlyUsage.calls += 1;
    
    await storage.set(`usage_hourly_${hour}`, hourlyUsage);
    
    console.log(`[RateLimiter] Tracked ${type} call. Daily: ${dailyUsage.calls}/${this.dailyLimit}, Cost: $${dailyUsage.cost.toFixed(4)}`);
    
    return dailyUsage;
  }

  /**
   * Calculate cost for embedding
   */
  calculateEmbeddingCost(text, options = {}) {
    const { model = this.defaultEmbeddingModel } = options;
    const pricing = this.getEmbeddingPricing(model);
    // Rough estimate: 1 token ≈ 4 characters
    const tokens = Math.ceil(text.length / 4);
    return tokens * pricing.costPerToken;
  }

  /**
   * Calculate cost for completion
   */
  calculateCompletionCost(promptTokens, completionTokens, options = {}) {
    const {
      cachedPromptTokens = 0,
      model = this.defaultCompletionModel,
    } = options;

    const pricing = this.getCompletionPricing(model);
    const billablePromptTokens = Math.max(promptTokens - cachedPromptTokens, 0);
    const cachedTokens = Math.min(cachedPromptTokens, promptTokens);
    const promptCost = billablePromptTokens * pricing.inputPerToken;
    const cachedCost = cachedTokens * pricing.cachedInputPerToken;
    const completionCost = completionTokens * pricing.outputPerToken;

    return promptCost + cachedCost + completionCost;
  }

  /**
   * Allow services (like the OpenAI wrapper) to declare the currently active completion model so
   * rate calculations and usage dashboards stay perfectly aligned.
   */
  setCompletionModel(modelName = DEFAULT_COMPLETION_MODEL) {
    if (MODEL_PRICING[modelName]) {
      this.defaultCompletionModel = modelName;
      return;
    }

    console.warn(
      `[RateLimiter] Unknown completion model "${modelName}". Falling back to ${this.defaultCompletionModel}.`
    );
  }

  getCompletionPricing(modelName = this.defaultCompletionModel) {
    if (MODEL_PRICING[modelName]) {
      return MODEL_PRICING[modelName];
    }

    return MODEL_PRICING[this.defaultCompletionModel] || MODEL_PRICING[DEFAULT_COMPLETION_MODEL];
  }

  setEmbeddingModel(modelName = DEFAULT_EMBEDDING_MODEL) {
    if (EMBEDDING_PRICING[modelName]) {
      this.defaultEmbeddingModel = modelName;
      return;
    }

    console.warn(
      `[RateLimiter] Unknown embedding model "${modelName}". Falling back to ${this.defaultEmbeddingModel}.`
    );
  }

  getEmbeddingPricing(modelName = this.defaultEmbeddingModel) {
    if (EMBEDDING_PRICING[modelName]) {
      return EMBEDDING_PRICING[modelName];
    }

    return (
      EMBEDDING_PRICING[this.defaultEmbeddingModel] || EMBEDDING_PRICING[DEFAULT_EMBEDDING_MODEL]
    );
  }

  /**
   * Estimate completion tokens
   */
  estimateCompletionTokens(prompt, systemPrompt) {
    // Rough estimate: 1 token ≈ 4 characters
    const promptTokens = Math.ceil((prompt.length + systemPrompt.length) / 4);
    // Assume completion is roughly 50% of prompt length
    const completionTokens = Math.ceil(promptTokens * 0.5);
    return { promptTokens, completionTokens };
  }

  getDateKey() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  getHourKey() {
    const now = new Date();
    return `${now.toISOString().split('T')[0]}_${now.getUTCHours()}`; // YYYY-MM-DD_HH
  }
}

export default new RateLimiter();
