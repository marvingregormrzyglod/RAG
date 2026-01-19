// src/utils/readKbJson.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolve and read a knowledge base JSON file regardless of deployment layout.
 * @param {string|URL} moduleUrlOrFileUrl - Either import.meta.url from the caller or a pre-resolved file URL.
 * @param {string} [relativePath] - Optional relative path when the first argument is a module URL string.
 */
export default async function readKbJson(moduleUrlOrFileUrl, relativePath) {
  const candidates = [];

  if (typeof relativePath === 'undefined') {
    // When the caller already resolved the URL (for example via new URL()), use it directly.
    candidates.push(moduleUrlOrFileUrl);
  } else {
    const moduleUrl = moduleUrlOrFileUrl;

    // 1) Resolve using URL semantics relative to the caller module.
    candidates.push(new URL(relativePath, moduleUrl));

    // 2) Resolve using filesystem paths derived from the caller directory.
    const moduleDir = path.dirname(fileURLToPath(moduleUrl));
    candidates.push(path.resolve(moduleDir, relativePath));

    // 3 & 4) Resolve relative to the runtime working directory (covers Forge bundle layouts).
    const normalized = path
      .normalize(relativePath)
      .replace(/^(\.\.[/\\])+/, '')
      .replace(/^([.][/\\])+/, '');
    candidates.push(path.resolve(process.cwd(), normalized));
    candidates.push(path.resolve(process.cwd(), 'src', normalized));
  }

  const errors = [];

  for (const target of candidates) {
    try {
      const raw = await fs.readFile(target, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      errors.push({
        target: typeof target === 'string' ? target : target.href,
        code: error.code,
      });
    }
  }

  const assetLabel =
    typeof relativePath === 'undefined'
      ? (moduleUrlOrFileUrl && moduleUrlOrFileUrl.toString
          ? moduleUrlOrFileUrl.toString()
          : 'unknown asset')
      : relativePath;

  console.error('[KnowledgeBase] Failed to locate JSON asset', {
    asset: assetLabel,
    attempts: errors,
  });

  throw new Error(`Knowledge base asset not found: ${assetLabel}`);
}
