// src/services/jobStore.js
// This module centralises how we persist and retrieve asynchronous job metadata in Forge Storage.
// By funnelling all storage access through this helper we can keep the resolver logic lean while
// guaranteeing consistent key naming, retention policies, and defensive copies of large payloads.

import crypto from 'crypto';
import { storage } from '@forge/api';
import { startsWith } from '@forge/storage';

export const JobStatus = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const JOB_KEY_PREFIX = 'async-job:';
const DEFAULT_RETENTION_DAYS = 14;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Forge storage does not currently offer TTL per key, so we record the expiry timestamp on the
 * document itself and rely on a scheduled cleanup to prune stale records.
 */
const computeExpiryTimestamp = (retentionDays = DEFAULT_RETENTION_DAYS) =>
  new Date(Date.now() + retentionDays * MILLIS_PER_DAY).toISOString();

const nowIso = () => new Date().toISOString();

const buildJobKey = (jobId) => `${JOB_KEY_PREFIX}${jobId}`;

const truncate = (value, maxLength = 4096) => {
  if (!value || typeof value !== 'string') {
    return value;
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
};

const normaliseSearchResult = (result = {}) => ({
  title: truncate(result.metadata?.title || result.title || 'Knowledge Base Article', 256),
  link: result.metadata?.link || result.link || '',
  contentSnippet: truncate(
    result.metadata?.content || result.contentSnippet || result.content || '',
    1024
  ),
});

const safeClone = (value) => JSON.parse(JSON.stringify(value));

export const createJobRecord = async ({
  jobId,
  jobType,
  status,
  invoker,
  llmCharacters,
  promptLength,
  systemPromptLength,
  promptFingerprint,
  vectorStats,
  auxiliaryData = {},
  retentionDays = DEFAULT_RETENTION_DAYS,
  logs = [],
}) => {
  const timestamp = nowIso();

  const record = {
    jobId,
    jobType,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: computeExpiryTimestamp(retentionDays),
    invoker: invoker ? safeClone(invoker) : null,
    llmCharacters: llmCharacters ? safeClone(llmCharacters) : null,
    request: {
      promptLength,
      systemPromptLength,
      promptFingerprint: promptFingerprint || null,
    },
    vectorStats: vectorStats ? safeClone(vectorStats) : null,
    auxiliaryData: {
      ...safeClone(auxiliaryData),
      searchResults: Array.isArray(auxiliaryData.searchResults)
        ? auxiliaryData.searchResults.map(normaliseSearchResult)
        : undefined,
    },
    result: null,
    error: null,
    processedWebhookIds: [],
    logs,
  };

  await storage.set(buildJobKey(jobId), record);
  return record;
};

export const getJobRecord = async (jobId) => storage.get(buildJobKey(jobId));

export const updateJobRecord = async (jobId, updates = {}) => {
  const key = buildJobKey(jobId);
  const existing = (await storage.get(key)) || {
    jobId,
    createdAt: nowIso(),
    processedWebhookIds: [],
  };

  const merged = {
    ...existing,
    ...updates,
    status: updates.status || existing.status,
    updatedAt: nowIso(),
  };

  if (updates.result !== undefined) {
    merged.result = safeClone(updates.result);
  }

  if (updates.error !== undefined) {
    merged.error = safeClone(updates.error);
  }

  if (updates.llmCharacters) {
    merged.llmCharacters = safeClone(updates.llmCharacters);
  }

  if (updates.vectorStats) {
    merged.vectorStats = safeClone(updates.vectorStats);
  }

  if (updates.auxiliaryData) {
    merged.auxiliaryData = {
      ...(existing.auxiliaryData || {}),
      ...safeClone(updates.auxiliaryData),
    };
  }

  await storage.set(key, merged);
  return merged;
};

export const listExpiredJobs = async () => {
  const expired = [];
  let cursor;

  do {
    const query = storage.query().where('key', startsWith(JOB_KEY_PREFIX));
    const response = cursor ? await query.cursor(cursor).getMany() : await query.getMany();

    if (response?.results?.length) {
      for (const { value } of response.results) {
        if (value?.expiresAt && new Date(value.expiresAt).getTime() <= Date.now()) {
          expired.push(value);
        }
      }
    }
    cursor = response?.nextCursor;
  } while (cursor);

  return expired;
};

export const deleteJobRecord = async (jobId) => storage.delete(buildJobKey(jobId));

export const fingerprintPrompt = (prompt, systemPrompt) => {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(typeof prompt === 'string' ? prompt : JSON.stringify(prompt || ''));
    hash.update('::');
    hash.update(typeof systemPrompt === 'string' ? systemPrompt : JSON.stringify(systemPrompt || ''));
    return hash.digest('hex');
  } catch (error) {
    console.warn('[jobStore] Failed to fingerprint prompt', error);
    return null;
  }
};
