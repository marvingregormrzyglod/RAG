// src/handlers/cancelJob.js
// Allows the UI to cancel an in-flight OpenAI background response

import openaiService from '../services/openai';
import { getJobRecord, updateJobRecord, JobStatus } from '../services/jobStore';
import { publishAppEvent } from '../services/appEvents';

const FINAL_STATUSES = new Set([
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
]);

export default async ({ payload, context = {} }) => {
  const jobId = payload?.jobId;

  if (!jobId) {
    return {
      success: false,
      error: 'Job identifier is required to request cancellation.',
    };
  }

  const record = await getJobRecord(jobId);

  if (!record) {
    return {
      success: false,
      error: `No background job found for id ${jobId}.`,
    };
  }

  if (FINAL_STATUSES.has(record.status)) {
    return {
      success: true,
      job: record,
      message: `Job already settled with status ${record.status}.`,
    };
  }

  const cancelResponse = await openaiService.cancelCompletion(jobId, context);

  const updated = await updateJobRecord(jobId, {
    status: JobStatus.CANCELLED,
    result: null,
    error: {
      reason: 'cancelled_by_user',
      message: 'Job cancelled at the request of the agent.',
      openaiStatus: cancelResponse?.status,
    },
  });

  const { processedWebhookIds, ...sanitised } = updated;

  const eventKey =
    updated.jobType === 'analysis' ? 'job-analysis-cancelled' : 'job-response-cancelled';
  await publishAppEvent(eventKey);

  return {
    success: true,
    job: sanitised,
  };
};

