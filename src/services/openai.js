// src/services/openai.js
import fetch from 'node-fetch';
import { storage } from '@forge/api';
import rateLimiter from './rateLimiter';

class OpenAIService {
  constructor() {
    this.setEmbeddingModel('text-embedding-3-large');
    this.setChatModel('gpt-5-mini');
    this.baseUrl = 'https://api.openai.com/v1';
    this.cachedApiKey = null;
  }

  /**
   * Resolve the OpenAI API key using multiple fallbacks so the app remains flexible
   * across Forge environments. We first check the current invocation context to read
   * environment variables injected by Forge, then look at process.env for local
   * development, and finally attempt to read from secure storage if the key was
   * persisted there.
   */
  async getApiKey(requestContext = {}) {
    if (this.cachedApiKey) {
      return this.cachedApiKey;
    }

    const { environmentVariables = {} } = requestContext;
    let apiKey = environmentVariables.OPENAI_API_KEY;

    // 2. Fall back to process.env which supports local scripts and tunnelling.
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY;
    }

    // 3. As a final fallback, look in Forge secure storage for a persisted secret.
    if (!apiKey) {
      try {
        apiKey = await storage.getSecret('openaiApiKey');
      } catch (error) {
        console.warn('[OpenAIService] Unable to read openaiApiKey from storage', error);
      }
    }

    if (!apiKey) {
      throw new Error(
        'OpenAI API key not configured. Set it with `forge variables set --encrypt OPENAI_API_KEY <value>` or store it via `forge storage set secret openaiApiKey <value>`.'
      );
    }

    this.cachedApiKey = apiKey;
    return apiKey;
  }

  /**
   * Create embedding for text
   */
  async createEmbedding(text, requestContext = {}) {
    // Check rate limits
    await rateLimiter.canMakeRequest();

    const apiKey = await this.getApiKey(requestContext);

    // Calculate estimated cost using the full payload so administrators see accurate usage.
    const estimatedCost = rateLimiter.calculateEmbeddingCost(text, {
      model: this.embedModel,
    });

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.embedModel,
        input: text
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    // Track the call
    await rateLimiter.trackCall('embeddings', estimatedCost);

    // Normalize for cosine similarity
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    
    return new Float32Array(embedding.map(val => val / magnitude));
  }

  /**
   * Create chat completion. When background mode is requested we return the raw Response object so
   * the caller can persist the job handle and exit the Forge invocation quickly. Otherwise this
   * behaves exactly like the existing synchronous helper and returns the generated text.
   */
  async createCompletion(
    prompt,
    systemPrompt,
    requestContext = {},
    options = { background: false, metadata: undefined }
  ) {
    // Check rate limits
    await rateLimiter.canMakeRequest();
    
    const apiKey = await this.getApiKey(requestContext);
    
    // Estimate cost
    const { promptTokens, completionTokens } = rateLimiter.estimateCompletionTokens(prompt, systemPrompt);
    const estimatedCost = rateLimiter.calculateCompletionCost(promptTokens, completionTokens, {
      model: this.chatModel,
    });
    
    const body = {
      model: this.chatModel,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' }
    };

    if (options.background) {
      body.background = true;
      body.store = true;
    }

    if (options.metadata) {
      body.metadata = options.metadata;
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    // Track the call
    await rateLimiter.trackCall('completions', estimatedCost);

    if (options.background) {
      return data;
    }

    return this.extractResponseText(data);
  }

  /**
   * Extract text from response
   */
  extractResponseText(response) {
    if (response.output && response.output.length > 0) {
      for (const item of response.output) {
        if (item.content) {
          for (const block of item.content) {
            if (block.type === 'output_text') {
              return block.text.trim();
            }
          }
        }
      }
    }
    return 'No output returned';
  }

  /**
   * Retrieve a previously created background response. This is used by the webhook handler to fetch
   * the final output once OpenAI signals completion.
   */
  async retrieveCompletion(responseId, requestContext = {}) {
    const apiKey = await this.getApiKey(requestContext);

    const response = await fetch(`${this.baseUrl}/responses/${responseId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (retrieve): ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Cancel an in-flight background response. Agents can call this when they abort a workflow so
   * compute is not wasted.
   */
  async cancelCompletion(responseId, requestContext = {}) {
    const apiKey = await this.getApiKey(requestContext);

    const response = await fetch(`${this.baseUrl}/responses/${responseId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (cancel): ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Centralised helper so the rate limiter and API wrapper always agree on which chat model is live.
   */
  setChatModel(modelName) {
    this.chatModel = modelName;
    rateLimiter.setCompletionModel(modelName);
  }

  setEmbeddingModel(modelName) {
    this.embedModel = modelName;
    rateLimiter.setEmbeddingModel(modelName);
  }
}

export default new OpenAIService();
