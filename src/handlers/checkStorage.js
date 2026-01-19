// src/handlers/checkStorage.js
import readKbJson from '../utils/readKbJson';
import { metadataUrl, chunkUrls } from '../knowledge-base/bundledAssets';

export default async () => {
  console.log('[CheckStorage] Inspecting bundled knowledge base metadata...');

  try {
    const metadata = await readKbJson(metadataUrl);

    // Attempt to read the first chunk to ensure embeddings are packaged correctly.
    if (!chunkUrls.length) {
      throw new Error('No embedding chunks bundled with the app.');
    }
    await readKbJson(chunkUrls[0]);

    console.log(
      `[CheckStorage] Bundled KB: ${chunkUrls.length} chunks, ${metadata.totalArticles} articles`
    );

    return {
      success: true,
      hasChunks: true,
      totalChunks: chunkUrls.length,
      totalArticles: metadata.totalArticles,
      dimension: metadata.dimension,
      message: 'Knowledge base packaged with the app is ready to load',
    };
  } catch (error) {
    console.error('[CheckStorage] Error reading bundled knowledge base:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
