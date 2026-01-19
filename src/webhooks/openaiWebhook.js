// src/webhooks/openaiWebhook.js
// Web trigger that receives OpenAI webhook callbacks and updates Forge Storage with the finished
// background response. The handler verifies the Standard Webhooks signature, retrieves the final
// response payload, and emits Forge events so the UI can update in real time.

import openaiService from '../services/openai';
import {
  getJobRecord,
  updateJobRecord,
  JobStatus,
} from '../services/jobStore';
import {
  enrichArticles,
  normaliseRecommendationPlan,
  parseAnalysisResponse,
  parseFinalResponse,
} from '../services/resultPostProcessor';
import { publishAppEvent } from '../services/appEvents';
import { storage } from '@forge/api';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_TOLERANCE_SECONDS = 300;

const ensureAgentSignature = (draft, agentName) => {
  if (!draft) {
    return draft;
  }
  const trimmedName = (agentName || '').trim();
  if (!trimmedName) {
    return draft;
  }

  const desiredSignature = `Best regards,\n\n${trimmedName}`;

  if (draft.includes(desiredSignature)) {
    return draft;
  }

  const teamSignaturePattern = /Best regards,\s*\n\s*\nSupport Team/gi;
  if (draft.match(teamSignaturePattern)) {
    return draft.replace(teamSignaturePattern, desiredSignature);
  }

  const normalisedBody = draft.replace(/\s+$/, '');
  return `${normalisedBody}\n\n${desiredSignature}`;
};

const normaliseHeaderValue = (value) => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const normaliseSignatureHeader = (headers, candidates = []) => {
  for (const name of candidates) {
    if (headers[name]) {
      return normaliseHeaderValue(headers[name]);
    }
  }
  return undefined;
};

const sanitizeHeadersForLogging = (headers = {}) => {
  const sensitivePatterns = ['signature', 'secret', 'authorization', 'token', 'key', 'auth'];
  const sanitized = {};

  Object.keys(headers).forEach((key) => {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitivePatterns.some((pattern) => lowerKey.includes(pattern));

    if (isSensitive) {
      const value = String(headers[key] || '');
      if (value.length > 8) {
        sanitized[key] = `${value.slice(0, 4)}...${value.slice(-4)}`;
      } else if (value.length > 0) {
        sanitized[key] = '***';
      } else {
        sanitized[key] = '';
      }
    } else {
      sanitized[key] = headers[key];
    }
  });

  return sanitized;
};

const sanitizeSecretForLogging = (secret) => {
  if (!secret || typeof secret !== 'string') {
    return '[NOT SET]';
  }
  if (secret.length > 12) {
    return `${secret.slice(0, 6)}...${secret.slice(-4)} (${secret.length} chars)`;
  }
  return `***...*** (${secret.length} chars)`;
};

const parseOpenAiSignature = (signatureHeader = '') => {
  if (typeof signatureHeader !== 'string' || signatureHeader.trim().length === 0) {
    return null;
  }

  const signatureParts = signatureHeader.split(',').map((part) => part.trim());
  let timestamp = null;
  const signatures = [];

  signatureParts.forEach((part) => {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) {
      return;
    }
    const key = part.slice(0, eqIndex);
    const value = part.slice(eqIndex + 1);
    if (!key || !value) {
      return;
    }

    if (key === 't') {
      timestamp = Number(value);
    } else if (key.startsWith('v')) {
      signatures.push(value);
    }
  });

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  return {
    timestamp,
    signatures,
  };
};

const parseSvixSignature = (signatureHeader = '') => {
  if (typeof signatureHeader !== 'string' || signatureHeader.trim().length === 0) {
    return null;
  }

  const signatures = signatureHeader
    .split(',')
    .map((part) => part.trim())
    .map((part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) return [null, null];
      return [part.slice(0, eqIndex), part.slice(eqIndex + 1)];
    })
    .filter(([version, value]) => version && value)
    .map(([, value]) => value);

  if (signatures.length === 0) {
    return null;
  }

  return { signatures };
};

const decodeSignatureCandidate = (signature, expectedLength) => {
  if (!signature) {
    return null;
  }

  const candidates = ['base64', 'hex'];

  for (const encoding of candidates) {
    try {
      const decoded = Buffer.from(signature, encoding);
      if (decoded.length === expectedLength) {
        return decoded;
      }
    } catch (error) {
      // Ignore and try the next encoding
    }
  }

  return null;
};

const deriveStandardSecretKey = (secret) => {
  if (typeof secret !== 'string' || secret.length === 0) {
    return null;
  }

  // Standard/Svix unbranded headers expect the secret to be provided as
  // "whsec_" + base64(key). We must strip the prefix and base64-decode to
  // obtain the raw HMAC key bytes.
  const trimmed = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  try {
    const key = Buffer.from(trimmed, 'base64');
    return key.length > 0 ? key : null;
  } catch (e) {
    return null;
  }
};

const matchesSignature = (secret, payload, signatures) => {
  const computed = createHmac('sha256', secret).update(payload).digest();

  return signatures.some((signature) => {
    const provided = decodeSignatureCandidate(signature, computed.length);
    if (!provided) {
      console.warn('[OpenAIWebhook] Failed to decode provided signature candidate');
      return false;
    }

    return timingSafeEqual(provided, computed);
  });
};

const parseStandardSignature = (signatureHeader = '') => {
  if (typeof signatureHeader !== 'string' || signatureHeader.trim().length === 0) {
    return null;
  }

  const segments = signatureHeader.split(',').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  const signatures = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (!segment) {
      continue;
    }

    if (segment.includes('=')) {
      const eqIndex = segment.indexOf('=');
      if (eqIndex === -1) continue;
      const key = segment.slice(0, eqIndex).trim();
      const value = segment.slice(eqIndex + 1).trim();
      if (key && key.startsWith('v') && value) {
        signatures.push(value);
      }
      continue;
    }

    if (segment.startsWith('v')) {
      const next = segments[index + 1];
      if (next && !next.startsWith('v')) {
        signatures.push(next);
        index += 1;
      }
    }
  }

  if (signatures.length === 0) {
    return null;
  }

  return { signatures };
};

const unwrapWebhookEvent = (rawBody, headers, secret) => {
  console.log('[OpenAIWebhook] Webhook verification starting', {
    bodyLength: rawBody?.length || 0,
    bodyPreview: rawBody?.slice(0, 100) || '',
    headerKeys: Object.keys(headers || {}),
    sanitizedHeaders: sanitizeHeadersForLogging(headers),
    secretStatus: sanitizeSecretForLogging(secret),
  });

  const openAiSignatureHeader = normaliseSignatureHeader(headers, [
    'x-openai-signature',
    'openai-signature',
  ]);
  const svixSignatureHeader = normaliseSignatureHeader(headers, ['svix-signature']);
  const standardSignatureHeader = normaliseSignatureHeader(headers, ['webhook-signature']);
  const webhookIdHeader = normaliseSignatureHeader(headers, ['webhook-id']);

  console.log('[OpenAIWebhook] Detected signature headers', {
    hasOpenAI: !!openAiSignatureHeader,
    hasSvix: !!svixSignatureHeader,
    hasStandard: !!standardSignatureHeader,
  });

  if (webhookIdHeader) {
    console.log('[OpenAIWebhook] Incoming webhook ID detected', { webhookId: webhookIdHeader });
  } else {
    console.warn('[OpenAIWebhook] No webhook-id header found on inbound request');
  }

  if (!openAiSignatureHeader && !svixSignatureHeader && !standardSignatureHeader) {
    console.error('[OpenAIWebhook] No signature headers found');
    throw new Error('Missing webhook signature headers.');
  }

  let payloadVerified = false;

  if (openAiSignatureHeader) {
    console.log('[OpenAIWebhook] Attempting OpenAI signature verification');
    const parsed = parseOpenAiSignature(openAiSignatureHeader);
    if (!parsed) {
      console.error('[OpenAIWebhook] Failed to parse OpenAI signature header');
      throw new Error('Malformed OpenAI webhook signature header.');
    }

    const { timestamp, signatures } = parsed;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(nowSeconds - timestamp);

    console.log('[OpenAIWebhook] OpenAI signature parsed', {
      timestamp,
      nowSeconds,
      timeDiff,
      signaturesCount: signatures.length,
      toleranceSeconds: SIGNATURE_TOLERANCE_SECONDS,
    });

    if (timeDiff > SIGNATURE_TOLERANCE_SECONDS) {
      console.error('[OpenAIWebhook] OpenAI timestamp outside tolerance', { timeDiff, tolerance: SIGNATURE_TOLERANCE_SECONDS });
      throw new Error('OpenAI webhook timestamp outside the allowed tolerance.');
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    payloadVerified = matchesSignature(secret, signedPayload, signatures);
    console.log('[OpenAIWebhook] OpenAI signature verification result', { verified: payloadVerified });
  }

  if (!payloadVerified && svixSignatureHeader) {
    console.log('[OpenAIWebhook] Attempting Svix signature verification');
    const parsed = parseSvixSignature(svixSignatureHeader);
    const timestampHeader =
      headers['svix-timestamp'] || headers['x-openai-timestamp'] || headers['openai-timestamp'];
    const svixIdHeader = normaliseHeaderValue(headers['svix-id']);

    if (!parsed || !timestampHeader || !svixIdHeader) {
      console.error('[OpenAIWebhook] Malformed Svix signature headers', { hasParsed: !!parsed, hasTimestamp: !!timestampHeader, hasId: !!svixIdHeader });
      throw new Error('Malformed Svix webhook signature headers.');
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      console.error('[OpenAIWebhook] Invalid Svix timestamp', { timestampHeader });
      throw new Error('Invalid Svix webhook timestamp.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(nowSeconds - timestamp);

    console.log('[OpenAIWebhook] Svix signature parsed', {
      timestamp,
      nowSeconds,
      timeDiff,
      signaturesCount: parsed.signatures.length,
      toleranceSeconds: SIGNATURE_TOLERANCE_SECONDS,
    });

    if (timeDiff > SIGNATURE_TOLERANCE_SECONDS) {
      console.error('[OpenAIWebhook] Svix timestamp outside tolerance', { timeDiff, tolerance: SIGNATURE_TOLERANCE_SECONDS });
      throw new Error('Svix webhook timestamp outside the allowed tolerance.');
    }

    const trimmedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;

    let key;
    try {
      key = Buffer.from(trimmedSecret, 'base64');
    } catch (error) {
      console.error('[OpenAIWebhook] Failed to decode Svix secret', error);
      throw new Error('Failed to decode Svix webhook secret.');
    }

    if (key.length === 0) {
      console.error('[OpenAIWebhook] Decoded Svix secret is empty');
      throw new Error('Decoded Svix webhook secret is empty.');
    }

    // Svix-branded headers sign: "id.timestamp.body"
    const signedPayload = `${svixIdHeader}.${timestampHeader}.${rawBody}`;
    const computed = createHmac('sha256', key).update(signedPayload).digest();

    payloadVerified = parsed.signatures.some((signature) => {
      try {
        const provided = Buffer.from(signature, 'base64');
        if (provided.length !== computed.length) {
          console.warn('[OpenAIWebhook] Svix signature length mismatch', { providedLength: provided.length, computedLength: computed.length });
          return false;
        }
        return timingSafeEqual(provided, computed);
      } catch (error) {
        console.warn('[OpenAIWebhook] Failed to decode Svix signature', error);
        return false;
      }
    });
    console.log('[OpenAIWebhook] Svix signature verification result', { verified: payloadVerified });
  }

  if (!payloadVerified && standardSignatureHeader) {
    console.log('[OpenAIWebhook] Attempting Standard signature verification');
    const parsed = parseStandardSignature(standardSignatureHeader);
    const timestampHeader = normaliseHeaderValue(
      normaliseSignatureHeader(headers, [
        'webhook-timestamp',
        'svix-timestamp',
        'x-openai-timestamp',
        'openai-timestamp',
      ])
    );

    if (!parsed || !timestampHeader || !webhookIdHeader) {
      console.error('[OpenAIWebhook] Malformed Standard signature headers', { hasParsed: !!parsed, hasTimestamp: !!timestampHeader, hasId: !!webhookIdHeader });
      throw new Error('Malformed Standard webhook signature headers.');
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      console.error('[OpenAIWebhook] Invalid Standard timestamp', { timestampHeader });
      throw new Error('Invalid Standard webhook timestamp.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(nowSeconds - timestamp);

    console.log('[OpenAIWebhook] Standard signature parsed', {
      timestamp,
      nowSeconds,
      timeDiff,
      signaturesCount: parsed.signatures.length,
      toleranceSeconds: SIGNATURE_TOLERANCE_SECONDS,
    });

    if (timeDiff > SIGNATURE_TOLERANCE_SECONDS) {
      console.error('[OpenAIWebhook] Standard timestamp outside tolerance', { timeDiff, tolerance: SIGNATURE_TOLERANCE_SECONDS });
      throw new Error('Standard webhook timestamp outside the allowed tolerance.');
    }

    // Standard (unbranded) headers sign: "id.timestamp.body"
    const signedPayload = `${webhookIdHeader}.${timestampHeader}.${rawBody}`;
    const secretKey = deriveStandardSecretKey(secret);

    if (!secretKey) {
      console.error('[OpenAIWebhook] Failed to derive Standard webhook secret key');
      throw new Error('Invalid Standard webhook secret.');
    }

    console.log('[OpenAIWebhook] Standard secret key derived', { keyLength: secretKey.length });

    payloadVerified = matchesSignature(secretKey, signedPayload, parsed.signatures);
    console.log('[OpenAIWebhook] Standard signature verification result', { verified: payloadVerified });
  }

  if (!payloadVerified) {
    console.error('[OpenAIWebhook] All signature verification methods failed');
    throw new Error('Webhook signature verification failed.');
  }

  console.log('[OpenAIWebhook] Webhook signature verification succeeded');

  try {
    const parsed = JSON.parse(rawBody);
    console.log('[OpenAIWebhook] Webhook payload parsed successfully', {
      eventType: parsed?.type,
      dataId: parsed?.data?.id,
      dataStatus: parsed?.data?.status,
    });
    return parsed;
  } catch (error) {
    console.error('[OpenAIWebhook] Failed to parse webhook payload as JSON', error);
    throw new Error('Invalid webhook payload.');
  }
};

const normaliseHeaders = (headers = {}) => {
  const normalised = {};
  Object.keys(headers || {}).forEach((key) => {
    normalised[key.toLowerCase()] = headers[key];
  });
  return normalised;
};

const ensureWebhookSecret = async (context = {}) => {
  let secret = context.environmentVariables?.OPENAI_WEBHOOK_SECRET;

  if (!secret) {
    secret = process.env.OPENAI_WEBHOOK_SECRET;
  }

  if (!secret) {
    try {
      secret = await storage.getSecret('openaiWebhookSecret');
    } catch (error) {
      console.warn('[OpenAIWebhook] Unable to read openaiWebhookSecret from storage', error);
    }
  }

  return secret;
};

const buildProcessedList = (existing = [], webhookId) => {
  if (!webhookId) {
    return existing;
  }
  const set = new Set(existing);
  set.add(webhookId);
  return Array.from(set);
};

const eventKeyFor = (jobType = 'response', suffix) => {
  const prefix = jobType === 'analysis' ? 'job-analysis' : 'job-response';
  return `${prefix}-${suffix}`;
};

const extractOutputText = (response) => {
  try {
    return openaiService.extractResponseText(response);
  } catch (error) {
    console.error('[OpenAIWebhook] Failed to extract output text', error);
    return null;
  }
};

export const run = async (event = {}, context = {}) => {
  console.log('[OpenAIWebhook] === Webhook handler invoked ===');

  const headers = normaliseHeaders(event.headers || {});
  const rawBody =
    typeof event.body === 'string' ? event.body : JSON.stringify(event.body || {});

  const webhookSecret = await ensureWebhookSecret(context);
  if (!webhookSecret) {
    console.error('[OpenAIWebhook] OPENAI_WEBHOOK_SECRET not configured');
    return {
      statusCode: 401,
      body: 'Webhook secret not configured',
    };
  }

  console.log('[OpenAIWebhook] Webhook secret loaded, starting verification');

  let webhookEvent;
  try {
    webhookEvent = unwrapWebhookEvent(rawBody, headers, webhookSecret);
  } catch (error) {
    console.error('[OpenAIWebhook] Invalid webhook signature', error);
    return {
      statusCode: 400,
      body: 'Invalid webhook signature',
    };
  }

  const webhookId = normaliseHeaderValue(headers['webhook-id']);
  const jobId = webhookEvent?.data?.id;
  const eventType = webhookEvent?.type;

  console.log('[OpenAIWebhook] Webhook event details', {
    webhookId,
    jobId,
    eventType,
    dataStatus: webhookEvent?.data?.status,
  });

  if (!jobId) {
    console.warn('[OpenAIWebhook] Received event without response id', webhookEvent);
    return { statusCode: 200, body: 'Ack: missing job id' };
  }

  const trackedJob = await getJobRecord(jobId);
  if (!trackedJob) {
    console.warn('[OpenAIWebhook] No tracked job found for', jobId);
    return { statusCode: 200, body: 'Ack: job not tracked' };
  }

  if (webhookId && trackedJob.processedWebhookIds?.includes(webhookId)) {
    console.log('[OpenAIWebhook] Duplicate webhook ignored for', jobId);
    return { statusCode: 200, body: 'Ack: duplicate' };
  }

  let responsePayload;
  try {
    responsePayload = await openaiService.retrieveCompletion(jobId, context);
  } catch (error) {
    console.error('[OpenAIWebhook] Failed to retrieve response from OpenAI', error);
    await updateJobRecord(jobId, {
      status: JobStatus.FAILED,
      error: {
        reason: 'retrieve_failed',
        message: error.message,
        stack: error.stack,
      },
      processedWebhookIds: buildProcessedList(trackedJob.processedWebhookIds, webhookId),
    });
    await publishAppEvent(eventKeyFor(trackedJob.jobType, 'failed'));
    return { statusCode: 200, body: 'Ack: retrieve failed' };
  }

  const outputText = extractOutputText(responsePayload);
  const processedWebhookIds = buildProcessedList(trackedJob.processedWebhookIds, webhookId);

  if (responsePayload.status === 'completed' && outputText) {
    let result = { rawText: outputText };

    if (trackedJob.jobType === 'analysis') {
      const parsed = parseAnalysisResponse(outputText);
      const recommendationPlan = normaliseRecommendationPlan(parsed.recommendationPlan);
      const knowledgeBaseArticles = enrichArticles(
        parsed.knowledgeBaseArticles,
        trackedJob.auxiliaryData?.searchResults || []
      );
      const taskQueue = Array.isArray(parsed.taskQueue) ? parsed.taskQueue : [];

      result = {
        ...result,
        summary: parsed.summary,
        internalNote: parsed.internalNote,
        recommendationPlan,
        knowledgeBaseArticles,
        taskQueue,
        toolSuggestions: recommendationPlan.toolSuggestions,
        caseStatus: trackedJob.auxiliaryData?.caseStatus,
      };
    } else {
      const parsed = parseFinalResponse(outputText);
      result = {
        ...result,
        emailDraft: ensureAgentSignature(parsed.emailDraft, trackedJob.auxiliaryData?.agentName),
        internalNote: parsed.internalNote,
        caseStatus: trackedJob.auxiliaryData?.caseStatus,
      };
    }

    const updated = await updateJobRecord(jobId, {
      status: JobStatus.COMPLETED,
      result,
      error: null,
      processedWebhookIds,
    });
    await publishAppEvent(eventKeyFor(updated.jobType, 'completed'));

    return { statusCode: 200, body: 'Ack: completed' };
  }

  const failureStatus =
    responsePayload.status === 'cancelled' ? JobStatus.CANCELLED : JobStatus.FAILED;

  const failure = {
    message: responsePayload.error?.message || responsePayload.error || 'Unknown failure',
    details: responsePayload.error?.code ? responsePayload.error : undefined,
    status: responsePayload.status || eventType,
  };

  const updated = await updateJobRecord(jobId, {
    status: failureStatus,
    error: failure,
    processedWebhookIds,
  });
  const suffix = failureStatus === JobStatus.CANCELLED ? 'cancelled' : 'failed';
  await publishAppEvent(eventKeyFor(updated.jobType, suffix));

  return { statusCode: 200, body: 'Ack: failure' };
};
