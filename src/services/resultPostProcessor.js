// src/services/resultPostProcessor.js
// Shared helpers that transform the raw JSON strings returned by OpenAI into the structured payloads
// expected by the Forge app. Housing the logic here allows both the webhook handler and any future
// synchronous fallbacks to reuse consistent parsing rules.

import { translateTerms } from './termTranslator';

export const sanitiseJson = (payload) => {
  if (!payload) {
    return payload;
  }

  const trimmed = payload.trim();
  if (trimmed.startsWith('```json')) {
    return trimmed.replace(/```json\s*/i, '').replace(/```$/, '').trim();
  }
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/```/, '').replace(/```$/, '').trim();
  }
  return trimmed;
};

export const parseAnalysisResponse = (text) => {
  try {
    const cleaned = sanitiseJson(text);
    const parsed = JSON.parse(cleaned);
    if (!parsed.summary || !parsed.internalNote || !parsed.recommendationPlan) {
      throw new Error('Analysis output missing required fields.');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse analysis response: ${error.message}`);
  }
};

export const parseFinalResponse = (text) => {
  try {
    const cleaned = sanitiseJson(text);
    const parsed = JSON.parse(cleaned);
    if (!parsed.emailDraft || !parsed.internalNote) {
      throw new Error('Missing emailDraft or internalNote in response.');
    }
    return {
      ...parsed,
      // Step 3 is the only customer-facing surface that needs the glossary rewrite,
      // so we keep the enforcement here to guarantee every outbound email is cleaned.
      emailDraft: translateTerms(parsed.emailDraft),
    };
  } catch (error) {
    throw new Error(`Failed to parse final response: ${error.message}`);
  }
};

export const normaliseRecommendationPlan = (plan = {}) => ({
  customerSteps: Array.isArray(plan.customerSteps) ? plan.customerSteps : [],
  agentSteps: Array.isArray(plan.agentSteps) ? plan.agentSteps : [],
  toolSuggestions: Array.isArray(plan.toolSuggestions) ? plan.toolSuggestions : [],
});

export const enrichArticles = (articles = [], searchResults = []) => {
  if (!Array.isArray(articles) || articles.length === 0) {
    return searchResults.map((result) => ({
      title: result.metadata?.title || 'Knowledge Base Article',
      link: result.metadata?.link || '',
      contentSnippet: (result.metadata?.content || '').slice(0, 480),
    }));
  }

  return articles.map((article, index) => {
    const fallback = searchResults[index]?.metadata || {};
    return {
      title: article.title || fallback.title || `Article ${index + 1}`,
      link: article.link || fallback.link || '',
      contentSnippet:
        article.contentSnippet ||
        article.content ||
        (fallback.content ? fallback.content.slice(0, 480) : ''),
    };
  });
};

