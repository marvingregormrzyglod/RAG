// src/handlers/getJobStatus.js
// Lightweight resolver that retrieves the persisted background job metadata so the custom UI can
// render progress indicators or display the final LLM output once the webhook finishes processing.

import { getJobRecord } from '../services/jobStore';

export default async ({ payload }) => {
  const jobId = payload?.jobId;

  if (!jobId) {
    return {
      success: false,
      error: 'Job identifier is required to check status.',
    };
  }

  const record = await getJobRecord(jobId);

  if (!record) {
    return {
      success: false,
      error: `No background job found for id ${jobId}.`,
    };
  }

  const { processedWebhookIds, ...sanitised } = record;

  return {
    success: true,
    job: sanitised,
  };
};

