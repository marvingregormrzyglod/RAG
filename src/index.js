// src/index.js - Main Forge backend entry point
import Resolver from '@forge/resolver';
import vectorSearch from './services/vectorSearch';
import rateLimiter from './services/rateLimiter';

const resolver = new Resolver();

// Load vectors on first use per invocation
async function ensureVectorsLoaded(requestContext = {}) {
  if (!vectorSearch.loaded) {
    await vectorSearch.load(requestContext);
  }
}

// Default resolver
resolver.define('resolver', async (req) => {
  console.log('[Resolver] Default resolver called', req);
  return { success: true, message: 'Resolver ready' };
});

resolver.define('getText', (req) => {
  console.log(req);
  return 'Hello, world!';
});

// Health check
resolver.define('health', async ({ payload, context }) => {
  const stats = vectorSearch.getStats();
  
  return {
    status: 'healthy',
    vectorSearch: stats,
    timestamp: new Date().toISOString()
  };
});

// Usage stats
resolver.define('usage-stats', async ({ payload, context }) => {
  const usage = await rateLimiter.getUsage();
  const dailyUsage = usage.dailyUsage || {
    calls: 0,
    cost: 0,
    embeddings: 0,
    completions: 0,
  };

  return {
    success: true,
    totals: {
      calls: dailyUsage.calls || 0,
      cost: dailyUsage.cost || 0,
      embeddings: dailyUsage.embeddings || 0,
      completions: dailyUsage.completions || 0,
    },
  };
});

// Import handlers
import analyzeIssueHandler from './handlers/analyzeIssue';
import analyzeAssertiveHandler from './handlers/analyzeAssertive';
import generateResponseHandler from './handlers/generateResponse';
import getJobStatusHandler from './handlers/getJobStatus';
import cancelJobHandler from './handlers/cancelJob';
import checkStorageHandler from './handlers/checkStorage';
import debugLoadVectorsHandler from './handlers/debugLoadVectors';

// Check storage status (no vector loading)
resolver.define('check-storage', checkStorageHandler);

// Wrapper to ensure vectors are loaded
const withVectors = (handler) => async (req) => {
  try {
    await ensureVectorsLoaded(req.context || {});
    return handler(req);
  } catch (error) {
    console.error('[withVectors] Failed to load vectors:', error);
    return {
      success: false,
      error: error.message || 'Failed to load knowledge base',
      needsInitialization: true
    };
  }
};

// Register handlers with vector loading
resolver.define('analyze-issue', withVectors(analyzeIssueHandler));
resolver.define('analyze-assertive', withVectors(analyzeAssertiveHandler));
resolver.define('gen-response', withVectors(generateResponseHandler));
resolver.define('debug-load-vectors', debugLoadVectorsHandler);
resolver.define('get-job-status', getJobStatusHandler);
resolver.define('cancel-job', cancelJobHandler);

export const handler = resolver.getDefinitions();
