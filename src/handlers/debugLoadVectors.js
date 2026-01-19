// src/handlers/debugLoadVectors.js
import vectorSearch from '../services/vectorSearch';

export default async ({ payload, context }) => {
  console.log('[DebugLoadVectors] ========== START ==========');
  const startTime = Date.now();

  try {
    console.log('[DebugLoadVectors] Loading vectors from bundled knowledge base...');
    await vectorSearch.load(context || {});

    const loadTime = Date.now() - startTime;
    const stats = vectorSearch.getStats();

    console.log('[DebugLoadVectors] ========== SUCCESS ==========');
    console.log(`[DebugLoadVectors] Loaded ${stats.count} vectors in ${loadTime}ms`);
    console.log(`[DebugLoadVectors] Memory: ${stats.memorySizeMB.toFixed(2)} MB`);
    console.log('[DebugLoadVectors] Vectors remain cached while this container stays warm');

    return {
      success: true,
      articlesLoaded: stats.count,
      loadTimeMs: loadTime,
      memoryMB: parseFloat(stats.memorySizeMB.toFixed(2)),
      dimension: stats.dimension,
      message: 'Vectors loaded into memory for this container lifecycle',
    };
  } catch (error) {
    console.error('[DebugLoadVectors] ========== ERROR ==========');
    console.error('[DebugLoadVectors]', error.message);

    return {
      success: false,
      error: error.message,
    };
  }
};
