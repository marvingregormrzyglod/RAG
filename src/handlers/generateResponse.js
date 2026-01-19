// src/handlers/generateResponse.js
import ExecutionLogger from '../utils/executionLogger';
import openaiService from '../services/openai';
import vectorSearch from '../services/vectorSearch';
import { createJobRecord, fingerprintPrompt, JobStatus } from '../services/jobStore';
import { buildFinalResponsePrompt } from '../services/promptBuilder';
import { publishAppEvent } from '../services/appEvents';

export default async ({ payload, context = {} }) => {
  const logger = new ExecutionLogger('FinalResponse');
  logger.log('Handler started');

  const {
    companySummary = '',
    originalPortalRequest = '',
    conversationActivity = '',
    attachments = [],
    summary = '',
    internalNote = '',
    recommendationPlan = {},
    selectedCustomerSteps = [],
    agentStepResults = [],
    knowledgeBaseArticles = [],
    caseStatus = 'new',
    agentName = '',
    customerName = '',
    allowOptionalNotes = false,
  } = payload;

  let llmCharacters = null;
  let timestamp = null;

  try {
    logger.log('Building final response prompt');
    const prompt = buildFinalResponsePrompt(
      {
        companySummary,
        originalPortalRequest,
        conversationActivity,
        attachments,
        summary,
        internalNote,
        recommendationPlan,
        selectedCustomerSteps,
        agentStepResults,
        knowledgeBaseArticles,
        caseStatus,
        agentName,
        customerName,
      },
      { allowOptionalNotes }
    );

    const systemPrompt =
      'You are assisting a customer support agent. Respond with strict JSON as instructed.';
    const completionCharacters = prompt.length + systemPrompt.length;

    llmCharacters = {
      embedding: 0,
      completion: completionCharacters,
      total: completionCharacters,
    };
    timestamp = new Date().toISOString();

    logger.log('Submitting OpenAI background job for final response synthesis');
    const aiStart = Date.now();
    const backgroundJob = await openaiService.createCompletion(
      prompt,
      systemPrompt,
      context,
      {
        background: true,
        metadata: {
          jobType: 'final-response',
          source: 'generate-response-handler',
        },
      }
    );
    logger.log('OpenAI acknowledged background job', {
      duration: Date.now() - aiStart,
      jobId: backgroundJob.id,
      status: backgroundJob.status,
    });

    const vectorStats = vectorSearch.getStats();
    const promptFingerprint = fingerprintPrompt(prompt, systemPrompt);

    const jobRecord = await createJobRecord({
      jobId: backgroundJob.id,
      jobType: 'response',
      status: backgroundJob.status || JobStatus.QUEUED,
      invoker: {
        accountId: context.accountId,
        siteId: context.siteId,
        environmentId: context.environmentId,
        moduleKey: context.moduleKey,
      },
      llmCharacters: {
        ...llmCharacters,
        recordedAt: timestamp,
      },
      promptLength: prompt.length,
      systemPromptLength: systemPrompt.length,
      promptFingerprint,
      vectorStats,
      auxiliaryData: {
        caseStatus,
        summary,
        internalNote,
        recommendationPlan,
        selectedCustomerSteps,
        agentStepResults,
        knowledgeBaseArticles,
        agentName,
        customerName,
      },
      logs: logger.getFormattedLogs(),
    });

    logger.log('Background job persisted to storage', {
      jobId: jobRecord.jobId,
      status: jobRecord.status,
      expiresAt: jobRecord.expiresAt,
    });

    await publishAppEvent('job-response-pending');

    logger.log('Handler complete (async job queued)', {
      totalDuration: logger.getDuration(),
      llmCharacters,
    });

    return {
      success: true,
      job: {
        id: jobRecord.jobId,
        status: jobRecord.status,
        type: jobRecord.jobType,
        createdAt: jobRecord.createdAt,
        expiresAt: jobRecord.expiresAt,
      },
      caseStatus,
      _meta: {
        vectorStats,
        timestamp,
        llmCharacters: {
          ...llmCharacters,
          recordedAt: timestamp,
        },
      },
      _debug: {
        executionLog: logger.getFormattedLogs(),
        duration: logger.getDuration(),
      },
    };
  } catch (error) {
    logger.log('ERROR', { message: error.message });
    console.error('[FinalResponse] Error:', error);
    return {
      success: false,
      error: error.message,
      _meta: llmCharacters
        ? {
            llmCharacters: {
              ...llmCharacters,
              recordedAt: timestamp || new Date().toISOString(),
            },
          }
        : undefined,
      _debug: {
        executionLog: logger.getFormattedLogs(),
        duration: logger.getDuration(),
      },
    };
  }
};
