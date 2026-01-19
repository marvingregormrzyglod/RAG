// src/handlers/analyzeAssertive.js
// Variant of the analysis handler that asks the LLM to produce an assertive, task-driven plan.
import ExecutionLogger from '../utils/executionLogger';
import openaiService from '../services/openai';
import vectorSearch from '../services/vectorSearch';
import { createJobRecord, fingerprintPrompt, JobStatus } from '../services/jobStore';
import { buildAssertiveTaskPrompt } from '../services/promptBuilder';
import { publishAppEvent } from '../services/appEvents';

export default async ({ payload, context = {} }) => {
  const logger = new ExecutionLogger('AssertiveContextAnalysis');
  logger.log('Handler started');

  const {
    originalPortalRequest = '',
    conversationActivity = '',
    attachments = [],
    companySummary = '',
    caseStatus = 'new',
    agentFindings = [],
  } = payload;

  let llmCharacters = null;
  let timestamp = null;

  try {
    const agentFindingsNarrative = Array.isArray(agentFindings)
      ? agentFindings
          .map((finding, index) => {
            const description = finding.description || `Agent observation ${index + 1}`;
            const notes = typeof finding.notes === 'string' ? finding.notes.trim() : '';
            return `${description} :: ${notes || 'No additional notes supplied.'}`;
          })
          .join('\n')
      : '';

    const queryText = [originalPortalRequest, conversationActivity, agentFindingsNarrative]
      .filter((section) => typeof section === 'string' && section.trim().length > 0)
      .join('\n\n');

    const embeddingCharacters = queryText.length;
    logger.log('Creating embedding for intake text', { length: queryText.length });
    const embeddingStart = Date.now();
    const queryEmbedding = await openaiService.createEmbedding(queryText, context);
    logger.log('Embedding generated', { duration: Date.now() - embeddingStart });

    logger.log('Running vector search for related knowledge base entries');
    const searchStart = Date.now();
    const searchResults = vectorSearch.search(queryEmbedding, 3);
    logger.log('Vector search complete', {
      results: searchResults.length,
      duration: Date.now() - searchStart,
    });

    logger.log('Building assertive context analysis prompt');
    const prompt = buildAssertiveTaskPrompt({
      companySummary,
      originalPortalRequest,
      conversationActivity,
      attachments,
      searchResults: searchResults.map((result) => ({
        title: result.metadata?.title,
        link: result.metadata?.link,
        content: result.metadata?.content,
      })),
      caseStatus,
      agentFindings,
    });
    const systemPrompt =
      'You are the assertive support orchestrator. Respond with strict JSON as instructed.';
    const completionCharacters = prompt.length + systemPrompt.length;

    llmCharacters = {
      embedding: embeddingCharacters,
      completion: completionCharacters,
      total: embeddingCharacters + completionCharacters,
    };
    timestamp = new Date().toISOString();

    logger.log('Submitting OpenAI background job for assertive context analysis');
    const aiStart = Date.now();
    const backgroundJob = await openaiService.createCompletion(
      prompt,
      systemPrompt,
      context,
      {
        background: true,
        metadata: {
          jobType: 'context-analysis',
          source: 'analyze-assertive-handler',
          interactionMode: 'assertive',
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
      jobType: 'analysis',
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
        searchResults,
        agentFindings,
        interactionMode: 'assertive',
      },
      logs: logger.getFormattedLogs(),
    });

    logger.log('Background job persisted to storage', {
      jobId: jobRecord.jobId,
      status: jobRecord.status,
      expiresAt: jobRecord.expiresAt,
    });

    await publishAppEvent('job-analysis-pending');

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
    console.error('[AssertiveContextAnalysis] Error:', error);
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
