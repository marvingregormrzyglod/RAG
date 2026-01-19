// src/services/vectorSearch.js
import readKbJson from '../utils/readKbJson';
import { metadataUrl, chunkUrls } from '../knowledge-base/bundledAssets';

class OptimizedVectorSearch {
  constructor() {
    this.instanceId = `vs-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
    this.embeddings = null;
    this.metadata = null;
    this.dimension = 3072;
    this.count = 0;
    this.loaded = false;
    this.loadedAt = null;
    this.loadCount = 0;
    this.firstLoadedBy = null;

    console.log(`[VectorSearch:${this.instanceId}] New instance created`);
  }

  /**
   * Load embeddings directly from the bundled JSON knowledge base.
   */
  async load(requestContext = {}) {
    const logPrefix = `[VectorSearch:${this.instanceId}]`;
    const logs = [];

    this.loadCount += 1;
    const log = (msg) => {
      console.log(`${logPrefix} ${msg}`);
      logs.push(`${logPrefix} ${msg}`);
    };
    log(`load() called (count: ${this.loadCount})`);

    if (this.loaded) {
      log('�o" Vectors already loaded, reusing existing data');
      log(`Originally loaded at: ${this.loadedAt}`);
      log(`Originally loaded by: ${this.firstLoadedBy || 'unknown'}`);
      return { logs, reused: true };
    }

    log('Starting fresh load from bundled knowledge base...');
    const startTime = Date.now();

    const meta = await readKbJson(metadataUrl);
    if (!meta?.chunks) {
      throw new Error('Knowledge base metadata missing from bundled package.');
    }

    const totalChunks = chunkUrls.length;
    if (meta.chunks !== totalChunks) {
      console.warn(
        `${logPrefix} Metadata chunk count (${meta.chunks}) does not match bundled asset count (${totalChunks}).`
      );
    }

    this.count = meta.totalArticles;
    this.dimension = meta.dimension;
    this.embeddings = new Float32Array(this.count * this.dimension);
    this.metadata = new Array(this.count);

    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(totalChunks / BATCH_SIZE);
    let offset = 0;

    for (let batchStart = 0; batchStart < totalChunks; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalChunks);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      log(`Loading batch ${batchNum}/${totalBatches}: chunks ${batchStart}-${batchEnd - 1}`);

      const chunkPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const chunkUrl = chunkUrls[i];
        chunkPromises.push(
          readKbJson(chunkUrl).catch((error) => {
            console.error(`${logPrefix} Failed to read chunk_${i}.json`, error);
            return null;
          })
        );
      }

      const chunkData = await Promise.all(chunkPromises);

      for (const chunk of chunkData) {
        if (!chunk?.articles) {
          continue;
        }

        for (const article of chunk.articles) {
          this.embeddings.set(article.embedding, offset * this.dimension);
          this.metadata[offset] = article.metadata;
          offset += 1;
        }
      }
    }

    this.loaded = true;
    this.loadedAt = new Date().toISOString();
    this.firstLoadedBy = requestContext.accountId || requestContext.userId || 'unknown';

    const loadTime = Date.now() - startTime;
    log(`�o" Loaded ${this.count} vectors in ${loadTime}ms`);
    log(`Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
    log(`Loaded at: ${this.loadedAt}`);
    log(`Loaded by: ${this.firstLoadedBy}`);

    return { logs, loadTime };
  }

  /**
   * Optimized cosine similarity using typed arrays.
   */
  cosineSimilarity(queryVec, docIndex) {
    let dotProduct = 0;
    let queryMag = 0;
    let docMag = 0;
    const offset = docIndex * this.dimension;

    const remainder = this.dimension % 4;
    const limit = this.dimension - remainder;

    let i = 0;
    for (; i < limit; i += 4) {
      const q0 = queryVec[i];
      const q1 = queryVec[i + 1];
      const q2 = queryVec[i + 2];
      const q3 = queryVec[i + 3];

      const d0 = this.embeddings[offset + i];
      const d1 = this.embeddings[offset + i + 1];
      const d2 = this.embeddings[offset + i + 2];
      const d3 = this.embeddings[offset + i + 3];

      dotProduct += q0 * d0 + q1 * d1 + q2 * d2 + q3 * d3;
      queryMag += q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3;
      docMag += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
    }

    for (; i < this.dimension; i += 1) {
      const q = queryVec[i];
      const d = this.embeddings[offset + i];
      dotProduct += q * d;
      queryMag += q * q;
      docMag += d * d;
    }

    return dotProduct / (Math.sqrt(queryMag) * Math.sqrt(docMag));
  }

  /**
   * Search for similar vectors.
   */
  search(queryEmbedding, k = 3, filters = {}) {
    if (!this.loaded) {
      throw new Error('Index not loaded. Call load() first.');
    }

    const startTime = Date.now();

    const queryVec =
      queryEmbedding instanceof Float32Array ? queryEmbedding : new Float32Array(queryEmbedding);

    const scores = new Array(this.count);

    for (let i = 0; i < this.count; i += 1) {
      scores[i] = {
        index: i,
        score: this.cosineSimilarity(queryVec, i),
        metadata: this.metadata[i],
      };
    }

    let filtered = scores;

    if (filters.identifiedAccount) {
      filtered = scores.filter((s) => this.matchesAccount(s.metadata, filters.identifiedAccount));
    }

    if (filters.excludeAccountSpecific && !filters.identifiedAccount) {
      const accountKeywords = [
        'barclays',
        'reckitt benckiser',
        'hsbc',
        'lloyds',
        'natwest',
        'santander',
        'standard chartered',
        'vodafone',
        'bt',
        'ee',
      ];

      filtered = filtered.filter((s) => {
        const title = s.metadata.title.toLowerCase();
        const content = s.metadata.content.substring(0, 200).toLowerCase();
        return !accountKeywords.some((kw) => title.includes(kw) || content.includes(kw));
      });
    }

    filtered.sort((a, b) => b.score - a.score);
    const results = filtered.slice(0, k);

    const searchTime = Date.now() - startTime;
    console.log(
      `[VectorSearch:${this.instanceId}] Search completed in ${searchTime}ms (${this.count} vectors)`
    );

    return results;
  }

  /**
   * Check if document matches account.
   */
  matchesAccount(metadata, account) {
    const title = metadata.title.toLowerCase();
    const content = metadata.content.substring(0, 200).toLowerCase();
    const accountLower = account.toLowerCase();

    return title.includes(accountLower) || content.includes(accountLower);
  }

  /**
   * Get index statistics.
   */
  getStats() {
    return {
      instanceId: this.instanceId,
      loaded: this.loaded,
      loadedAt: this.loadedAt,
      loadCount: this.loadCount,
      firstLoadedBy: this.firstLoadedBy,
      count: this.count,
      dimension: this.dimension,
      memorySizeMB: (this.embeddings?.byteLength || 0) / (1024 * 1024),
    };
  }
}

const vectorSearch = new OptimizedVectorSearch();
export default vectorSearch;
