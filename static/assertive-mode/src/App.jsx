
// static/assertive-mode/src/App.jsx
// Assertive variant of the CARE workflow. The assistant now drives the investigation by issuing
// sequential tasks that collect the exact identifiers the LLM needs to resolve the ticket.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  invokeBridge,
  onBridgeEvent,
  requestConfluence,
} from './utils/forgeBridge';
import {
  cleanseTroubleshootingPlaceholder,
  extractCustomerFirstNameFromNote,
} from './utils/internalNotes';

import ConsumerIntake from './components/ConsumerIntake';
import TaskCommander from './components/TaskCommander';
import ResponseFinalizer from './components/ResponseFinalizer';
import UtilitiesPanel from './components/UtilitiesPanel';
import StageProgress from './components/StageProgress';
import numeralGlyph from './assets/1.gif';
import wordmarkGlyph from './assets/global.png';

const COMPANY_SUMMARY = 'List your company summary here.';

const STAGES = {
  INTAKE: 'intake',
  WORKBENCH: 'workbench',
  FINALIZE: 'finalize',
};

const ANALYSIS_FUNCTION_KEY = 'analyze-assertive';
const RESPONSE_FUNCTION_KEY = 'gen-response';

const JOB_STATUS = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const ACTIVE_JOB_STATUSES = [JOB_STATUS.QUEUED, JOB_STATUS.IN_PROGRESS];
const JOB_STATUS_POLL_INTERVAL_MS = 30000;

const careTitleStyle = {
  margin: 0,
  fontWeight: 400,
  fontSize: '20px',
  lineHeight: 1.2,
};

const careTitleLetterStyle = {
  fontWeight: 700,
};

function App() {
  const [stage, setStage] = useState(STAGES.INTAKE);
  const [formData, setFormData] = useState({
    agentName: '',
    originalPortalRequest: '',
    conversationActivity: '',
  });
  const [attachments, setAttachments] = useState([]);

  const [analysisResult, setAnalysisResult] = useState(null);
  const [caseStatus, setCaseStatus] = useState('new');
  const [internalNoteDraft, setInternalNoteDraft] = useState('');
  const [taskQueue, setTaskQueue] = useState([]);
  const [taskResponses, setTaskResponses] = useState({});
  const [taskSnapshot, setTaskSnapshot] = useState(null);
  const [finalOutput, setFinalOutput] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [serviceStatus, setServiceStatus] = useState('checking');
  const [needsInitialization, setNeedsInitialization] = useState(false);
  const [instanceInfo, setInstanceInfo] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const [usageStats, setUsageStats] = useState(null);
  const [isRefreshingUsage, setIsRefreshingUsage] = useState(false);
  const [usageLastUpdated, setUsageLastUpdated] = useState(null);
  const [storageReady, setStorageReady] = useState(null);
  const [latestLlmCharacters, setLatestLlmCharacters] = useState(null);
  const [isWarming, setIsWarming] = useState(false);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [showUtilities, setShowUtilities] = useState(false);
  const [utilitiesButtonHover, setUtilitiesButtonHover] = useState(false);

  const [analysisJob, setAnalysisJob] = useState(null);
  const [responseJob, setResponseJob] = useState(null);
  const [isResponsePending, setIsResponsePending] = useState(false);
  const [isReanalysisPending, setIsReanalysisPending] = useState(false);

  const jobPollersRef = useRef(new Map());

  useEffect(() => {
    let stillMounted = true;
    const deriveFirstName = (displayName = '') => {
      const trimmed = displayName.trim();
      if (!trimmed) {
        return '';
      }
      const [firstToken] = trimmed.split(/\s+/);
      return firstToken || trimmed;
    };

    const hydrateAgentName = async () => {
      try {
        const response = await requestConfluence('/wiki/rest/api/user/current');
        if (!response || !response.ok) {
          return;
        }
        const profile = await response.json();
        if (!stillMounted) {
          return;
        }
        const candidate = deriveFirstName(profile?.displayName || profile?.publicName || '');
        if (!candidate) {
          return;
        }
        setFormData((previous) => {
          if (previous.agentName && previous.agentName.trim().length > 0) {
            return previous;
          }
          return {
            ...previous,
            agentName: candidate,
          };
        });
      } catch (error) {
        console.warn('Unable to prefill agent name from Confluence', error);
      }
    };

    hydrateAgentName();

    return () => {
      stillMounted = false;
    };
  }, []);

  const appendExecutionLog = useCallback((logEntry) => {
    setExecutionLogs((prev) => [logEntry, ...prev].slice(0, 10));
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const result = await invokeBridge('health');
      if (result?.vectorSearch) {
        const stats = result.vectorSearch;
        setInstanceInfo((previous) => ({
          ...previous,
          ...stats,
          vectorsInMemory:
            typeof stats.loaded === 'boolean'
              ? stats.loaded
              : previous?.vectorsInMemory ?? false,
        }));
      }
    } catch (err) {
      console.error('Health check failed', err);
    }
  }, []);

  const fetchUsageStats = useCallback(async () => {
    setIsRefreshingUsage(true);
    try {
      const result = await invokeBridge('usage-stats');
      if (result?.success && result.totals) {
        setUsageStats(result.totals);
        setUsageLastUpdated(new Date().toISOString());
      } else {
        setUsageStats(null);
      }
    } catch (err) {
      console.error('Usage stats fetch failed', err);
      setUsageStats(null);
    } finally {
      setIsRefreshingUsage(false);
    }
  }, []);

  const checkStorageStatus = useCallback(async () => {
    setStorageReady(null);
    try {
      const result = await invokeBridge('check-storage');
      if (result?.success) {
        setDebugInfo(result);
        setStorageReady(true);
      } else {
        setDebugInfo(null);
        setStorageReady(false);
      }
    } catch (err) {
      console.error('Knowledge base check failed', err);
      setDebugInfo(null);
      setStorageReady(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    fetchUsageStats();
    checkStorageStatus();
    return () => {
      jobPollersRef.current.forEach(({ timer }) => {
        if (timer) {
          clearInterval(timer);
        }
      });
      jobPollersRef.current.clear();
    };
  }, [checkHealth, fetchUsageStats, checkStorageStatus]);

  useEffect(() => {
    if (isWarming) {
      setServiceStatus('checking');
      return;
    }

    if (instanceInfo?.vectorsInMemory) {
      setServiceStatus('ready');
    } else if (storageReady === false) {
      setServiceStatus('error');
    } else if (storageReady === true) {
      setServiceStatus('cold');
    } else {
      setServiceStatus('checking');
    }
  }, [instanceInfo, storageReady, isWarming]);

  const serviceIndicator = useMemo(
    () => getServiceIndicator(serviceStatus, isWarming),
    [serviceStatus, isWarming]
  );

  const analysisJobActive =
    analysisJob && ACTIVE_JOB_STATUSES.includes(analysisJob.status || '');

  const responseJobActive =
    responseJob && ACTIVE_JOB_STATUSES.includes(responseJob.status || '');

  const stopPollingJob = useCallback((jobId) => {
    const existing = jobPollersRef.current.get(jobId);
    if (existing?.timer) {
      clearInterval(existing.timer);
    }
    jobPollersRef.current.delete(jobId);
  }, []);

  const initialiseTaskQueue = useCallback((tasks, options = {}) => {
    setTaskQueue(tasks);
    const { previousResponsesById = null, previousResponsesByTitle = null } = options || {};
    if (previousResponsesById || previousResponsesByTitle) {
      const preserved = {};
      tasks.forEach((task) => {
        const direct = previousResponsesById ? previousResponsesById[task.id] : null;
        const fallback = previousResponsesByTitle
          ? previousResponsesByTitle[normalizeTaskKey(task)]
          : null;
        const restored = direct || fallback;
        if (restored) {
          preserved[task.id] = restored;
        }
      });
      setTaskResponses(preserved);
    } else {
      setTaskResponses({});
    }
  }, []);

  const processJobUpdate = useCallback(
    (jobType, update) => {
      if (!jobType || !update) {
        return;
      }

      const jobId = update.jobId || update.id;
      const status = update.status;
      const llmCharacters = update.llmCharacters;
      const vectorStats = update.vectorStats;
      const logs = update.logs || [];
      const result = update.result;
      const errorInfo = update.error;

      if (jobType === 'analysis') {
        setAnalysisJob((prev) => ({
          ...(prev || {}),
          id: jobId || prev?.id,
          status: status || prev?.status,
          createdAt: update.createdAt || prev?.createdAt,
          expiresAt: update.expiresAt || prev?.expiresAt,
          updatedAt: update.updatedAt || update.completedAt || prev?.updatedAt,
        }));

        if (status === JOB_STATUS.COMPLETED && result) {
          const tasks = deriveTaskQueue(result);
          const shapedResult = {
            summary: result.summary,
            internalNote: result.internalNote,
            recommendationPlan: result.recommendationPlan || {},
            knowledgeBaseArticles: result.knowledgeBaseArticles || [],
            taskQueue: tasks,
            caseStatus: result.caseStatus || caseStatus,
            rawText: result.rawText,
            jobId,
            completedAt: update.completedAt || update.updatedAt,
          };

          setAnalysisResult(shapedResult);
          setCaseStatus(shapedResult.caseStatus);
          setInternalNoteDraft(shapedResult.internalNote || '');

          const preservationOptions = taskSnapshot
            ? {
                previousResponsesById: taskSnapshot.responsesById,
                previousResponsesByTitle: taskSnapshot.responsesByTitle,
              }
            : null;
          initialiseTaskQueue(tasks, preservationOptions || undefined);
          setTaskSnapshot(null);
          setIsReanalysisPending(false);
          setFinalOutput(null);

          if (llmCharacters) {
            setLatestLlmCharacters(llmCharacters);
          }

          if (vectorStats) {
            setInstanceInfo({
              instanceId: vectorStats.instanceId,
              loadedAt: vectorStats.loadedAt,
              vectorsInMemory: vectorStats.loaded,
            });
          }

          if (logs.length) {
            appendExecutionLog({
              operation: 'Assertive Context Analysis',
              logs,
              duration: update.duration || 0,
              hasError: false,
            });
          }

          stopPollingJob(jobId);
          setStage(STAGES.WORKBENCH);
        } else if (status === JOB_STATUS.FAILED || status === JOB_STATUS.CANCELLED) {
          const message =
            errorInfo?.message ||
            (status === JOB_STATUS.CANCELLED
              ? 'Context analysis was cancelled.'
              : 'Context analysis failed.');
          setError(message);

          appendExecutionLog({
            operation: 'Assertive Context Analysis',
            logs,
            duration: update.duration || 0,
            hasError: true,
          });

          stopPollingJob(jobId);
          setIsReanalysisPending(false);
          setTaskSnapshot(null);
        }
      }

      if (jobType === 'response') {
        setResponseJob((prev) => ({
          ...(prev || {}),
          id: jobId || prev?.id,
          status: status || prev?.status,
          createdAt: update.createdAt || prev?.createdAt,
          expiresAt: update.expiresAt || prev?.expiresAt,
          updatedAt: update.updatedAt || update.completedAt || prev?.updatedAt,
        }));

        if (status === JOB_STATUS.COMPLETED && result) {
          const shapedOutput = {
            emailDraft: result.emailDraft,
            internalNote: result.internalNote,
            caseStatus: result.caseStatus || caseStatus,
            rawText: result.rawText,
            jobId,
            completedAt: update.completedAt || update.updatedAt,
          };

          setFinalOutput(shapedOutput);
          setCaseStatus(shapedOutput.caseStatus || caseStatus);

          if (llmCharacters) {
            setLatestLlmCharacters(llmCharacters);
          }

          if (logs.length) {
            appendExecutionLog({
              operation: 'Final Response',
              logs,
              duration: update.duration || 0,
              hasError: false,
            });
          }

          stopPollingJob(jobId);
          setStage(STAGES.FINALIZE);
        } else if (status === JOB_STATUS.FAILED || status === JOB_STATUS.CANCELLED) {
          const message =
            errorInfo?.message ||
            (status === JOB_STATUS.CANCELLED
              ? 'Response generation was cancelled.'
              : 'Response generation failed.');
          setError(message);

          appendExecutionLog({
            operation: 'Final Response',
            logs,
            duration: update.duration || 0,
            hasError: true,
          });

          stopPollingJob(jobId);
        }
      }
    },
    [
      appendExecutionLog,
      caseStatus,
      initialiseTaskQueue,
      stopPollingJob,
      taskSnapshot,
    ]
  );
  const pollJobStatus = useCallback(
    async (jobId, jobType) => {
      if (!jobId) {
        return;
      }

      try {
        const response = await invokeBridge('get-job-status', { jobId });
        if (response?.success && response.job) {
          processJobUpdate(response.job.jobType || jobType, response.job);
        }
      } catch (err) {
        console.error('Job status poll failed', err);
      }
    },
    [processJobUpdate]
  );

  const startPollingJob = useCallback(
    (jobId, jobType) => {
      if (!jobId) {
        return;
      }

      stopPollingJob(jobId);

      const timer = setInterval(() => {
        pollJobStatus(jobId, jobType);
      }, JOB_STATUS_POLL_INTERVAL_MS);

      jobPollersRef.current.set(jobId, { timer, jobType });
      pollJobStatus(jobId, jobType);
    },
    [pollJobStatus, stopPollingJob]
  );

  useEffect(() => {
    const analysisHandler = () => {
      if (analysisJob?.id) {
        pollJobStatus(analysisJob.id, 'analysis');
      }
    };

    const responseHandler = () => {
      if (responseJob?.id) {
        pollJobStatus(responseJob.id, 'response');
      }
    };

    let active = true;
    const unsubscribers = [];

    const subscribe = async (eventName, handler) => {
      try {
        const unsubscribe = await onBridgeEvent(eventName, handler);
        if (!active) {
          unsubscribe?.();
        } else {
          unsubscribers.push(unsubscribe);
        }
      } catch (error) {
        console.warn(`Failed to subscribe to ${eventName}`, error);
      }
    };

    subscribe('job-analysis-completed', analysisHandler);
    subscribe('job-analysis-failed', analysisHandler);
    subscribe('job-analysis-cancelled', analysisHandler);
    subscribe('job-response-completed', responseHandler);
    subscribe('job-response-failed', responseHandler);
    subscribe('job-response-cancelled', responseHandler);

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (err) {
          console.warn('Event unsubscribe failed', err);
        }
      });
    };
  }, [analysisJob?.id, responseJob?.id, pollJobStatus]);

  const handleAddAttachments = async (files) => {
    if (!files || files.length === 0) {
      return;
    }

    const encodedFiles = [];
    for (const file of Array.from(files)) {
      // eslint-disable-next-line no-await-in-loop
      const base64 = await fileToBase64(file);
      encodedFiles.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        type: file.type,
        size: file.size,
        data: base64,
      });
    }
    setAttachments((prev) => [...prev, ...encodedFiles]);
  };

  const handleRemoveAttachment = (id) => {
    setAttachments((prev) => prev.filter((file) => file.id !== id));
  };

  const resetWorkflow = () => {
    if (analysisJob?.id) {
      stopPollingJob(analysisJob.id);
    }
    if (responseJob?.id) {
      stopPollingJob(responseJob.id);
    }
    setStage(STAGES.INTAKE);
    setFormData((previous) => ({
      agentName: previous.agentName,
      originalPortalRequest: '',
      conversationActivity: '',
    }));
    setAttachments([]);
    setAnalysisResult(null);
    setCaseStatus('new');
    setInternalNoteDraft('');
    setTaskQueue([]);
    setTaskResponses({});
    setTaskSnapshot(null);
    setFinalOutput(null);
    setError(null);
    setAnalysisJob(null);
    setResponseJob(null);
    setIsResponsePending(false);
    setIsReanalysisPending(false);
  };

  const submitAnalysisRequest = async ({
    caseStatusOverride,
    agentFindings = [],
    resetWorkbenchState = true,
    isReanalysis = false,
  } = {}) => {
    setLoading(true);
    setError(null);
    setNeedsInitialization(false);

    const resolvedCaseStatus =
      typeof caseStatusOverride === 'string' && caseStatusOverride.length > 0
        ? caseStatusOverride
        : formData.conversationActivity.trim()
        ? 'ongoing'
        : 'new';

    setCaseStatus(resolvedCaseStatus);
    if (resetWorkbenchState) {
      setInternalNoteDraft('');
      setAnalysisResult(null);
      setTaskQueue([]);
      setTaskResponses({});
      setTaskSnapshot(null);
    }

    let requestSucceeded = false;

    try {
      const payload = {
        originalPortalRequest: formData.originalPortalRequest,
        conversationActivity: formData.conversationActivity,
        attachments: attachments.map(({ name, type, data, size }) => ({
          name,
          type,
          size,
          data,
        })),
        companySummary: COMPANY_SUMMARY,
        caseStatus: resolvedCaseStatus,
      };

      if (Array.isArray(agentFindings) && agentFindings.length > 0) {
        payload.agentFindings = agentFindings;
      }

      const result = await invokeBridge(ANALYSIS_FUNCTION_KEY, payload);

      if (result?._meta?.llmCharacters) {
        setLatestLlmCharacters(result._meta.llmCharacters);
      }

      if (!result?.success) {
        if (result?.needsInitialization) {
          setNeedsInitialization(true);
        }
        throw new Error(result?.error || 'Analysis failed');
      }

      if (result._debug) {
        appendExecutionLog({
          operation: 'Assertive Context Analysis',
          logs: result._debug.executionLog || [],
          duration: result._debug.duration || 0,
          hasError: false,
        });
      }

      if (result._meta?.vectorStats) {
        const stats = result._meta.vectorStats;
        setInstanceInfo((previous) => ({
          ...previous,
          ...stats,
          vectorsInMemory:
            typeof stats.loaded === 'boolean'
              ? stats.loaded
              : previous?.vectorsInMemory ?? false,
        }));
      }

      if (result.job) {
        setAnalysisJob(result.job);
        startPollingJob(result.job.id, 'analysis');
      }

      fetchUsageStats();
      requestSucceeded = true;
      return true;
    } catch (err) {
      console.error('Failed during analysis stage', err);
      appendExecutionLog({
        operation: 'Assertive Context Analysis',
        logs: [],
        duration: 0,
        hasError: true,
        errorMessage: err.message,
      });
      setError(err.message || 'Unexpected error while analysing the case');
      return false;
    } finally {
      setLoading(false);
      if (isReanalysis && !requestSucceeded) {
        setIsReanalysisPending(false);
        setTaskSnapshot(null);
      }
    }
  };

  const handleIntakeSubmit = async () => {
    await submitAnalysisRequest({
      resetWorkbenchState: true,
      isReanalysis: false,
    });
  };

  const handleReanalyzeSubmit = async () => {
    if (!analysisResult || analysisJobActive || isReanalysisPending) {
      return;
    }

    const agentFindings = buildAgentFindingsFromTasks(taskQueue, taskResponses);
    if (agentFindings.length === 0) {
      return;
    }

    setTaskSnapshot(createTaskResponseSnapshot(taskQueue, taskResponses));
    setIsReanalysisPending(true);

    await submitAnalysisRequest({
      caseStatusOverride: caseStatus,
      agentFindings,
      resetWorkbenchState: false,
      isReanalysis: true,
    });
  };

  const handleTaskSubmission = (taskId, submission) => {
    setTaskResponses((prev) => ({
      ...prev,
      [taskId]: {
        ...submission,
        completed: true,
        confirmedAt: new Date().toISOString(),
      },
    }));
  };

  const handleTaskUndo = (taskId) => {
    setTaskResponses((prev) => {
      const cloned = { ...prev };
      delete cloned[taskId];
      return cloned;
    });
  };

  const handleFinalizeSubmit = async () => {
    if (!analysisResult) {
      return;
    }

    setLoading(true);
    setError(null);
    setIsResponsePending(true);

    try {
      const selectedCustomerSteps = (analysisResult.recommendationPlan?.customerSteps || [])
        .filter((step) =>
          typeof step.includeInEmailByDefault === 'boolean'
            ? step.includeInEmailByDefault
            : true
        )
        .map((step) => ({
          id: step.id,
          description: step.description,
          includeInEmail: true,
        }));

      const completedAgentSteps = buildAgentStepResults(taskQueue, taskResponses);

      const internalNotePayload = cleanseTroubleshootingPlaceholder(
        internalNoteDraft,
        completedAgentSteps
      );
      const customerName = extractCustomerFirstNameFromNote(internalNotePayload);

      const payload = {
        companySummary: COMPANY_SUMMARY,
        originalPortalRequest: formData.originalPortalRequest,
        conversationActivity: formData.conversationActivity,
        attachments: attachments.map(({ name, type, data, size }) => ({
          name,
          type,
          size,
          data,
        })),
        summary: analysisResult.summary,
        internalNote: internalNotePayload,
        recommendationPlan: analysisResult.recommendationPlan,
        selectedCustomerSteps,
        agentStepResults: completedAgentSteps,
        knowledgeBaseArticles: analysisResult.knowledgeBaseArticles || [],
        caseStatus,
        agentName: formData.agentName || '',
        customerName,
        allowOptionalNotes: true,
      };

      const result = await invokeBridge(RESPONSE_FUNCTION_KEY, payload);

      if (result?._meta?.llmCharacters) {
        setLatestLlmCharacters(result._meta.llmCharacters);
      }

      if (!result?.success) {
        if (result?.needsInitialization) {
          setNeedsInitialization(true);
        }
        throw new Error(result?.error || 'Response generation failed');
      }

      if (result._debug) {
        appendExecutionLog({
          operation: 'Final Response',
          logs: result._debug.executionLog || [],
          duration: result._debug.duration || 0,
          hasError: false,
        });
      }

      setFinalOutput(null);

      if (result.job) {
        setResponseJob(result.job);
        startPollingJob(result.job.id, 'response');
      }

      fetchUsageStats();
      setIsResponsePending(false);
    } catch (err) {
      console.error('Failed during finalisation stage', err);
      appendExecutionLog({
        operation: 'Final Response',
        logs: [],
        duration: 0,
        hasError: true,
        errorMessage: err.message,
      });
      setError(err.message || 'Unexpected error while creating the final email');
      setIsResponsePending(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleUtilitiesPanel = useCallback(() => {
    setShowUtilities((previous) => !previous);
  }, []);

  const allTasksCompleted =
    taskQueue.length === 0 ||
    taskQueue.every((task) => taskResponses[task.id]?.completed);

  const canReanalyze =
    stage === STAGES.WORKBENCH &&
    Object.values(taskResponses || {}).some((entry) => entry?.completed) &&
    !analysisJobActive &&
    !isReanalysisPending &&
    !loading;

  const workbenchIsLoading = loading || responseJobActive || isReanalysisPending;
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>
      <style>
        {`
          @keyframes statusPulse {
            0% { box-shadow: 0 0 0 0 rgba(0, 82, 204, 0.4); }
            70% { box-shadow: 0 0 0 10px rgba(0, 82, 204, 0); }
            100% { box-shadow: 0 0 0 0 rgba(0, 82, 204, 0); }
          }

          @keyframes statusPulseAlert {
            0% { box-shadow: 0 0 0 0 rgba(191, 38, 0, 0.45); }
            70% { box-shadow: 0 0 0 12px rgba(191, 38, 0, 0); }
            100% { box-shadow: 0 0 0 0 rgba(191, 38, 0, 0); }
          }
        `}
      </style>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          gap: '12px',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 0,
              columnGap: 0,
              marginBottom: '6px',
            }}
          >
            <img
              src={numeralGlyph}
              alt="Company logo"
              style={{
                height: '46px',
                width: 'auto',
                display: 'block',
              }}
            />
            <img
              src={wordmarkGlyph}
              alt="Company wordmark"
              style={{
                height: '46px',
                width: 'auto',
                display: 'block',
              }}
            />
          </div>
          <h1 style={careTitleStyle}>
            <span style={careTitleLetterStyle}>C</span>onsumer{' '}
            <span style={careTitleLetterStyle}>A</span>ssistance{' '}
            <span style={careTitleLetterStyle}>R</span>esponse{' '}
            <span style={careTitleLetterStyle}>E</span>ngine
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={toggleUtilitiesPanel}
            onMouseEnter={() => setUtilitiesButtonHover(true)}
            onMouseLeave={() => setUtilitiesButtonHover(false)}
            title={showUtilities ? 'Hide the utilities toolbox' : 'Open diagnostics and admin tools'}
            style={{
              padding: '10px 18px',
              backgroundColor: utilitiesButtonHover ? '#0B66FF' : '#0052CC',
              color: 'white',
              border: 'none',
              borderRadius: '24px',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: showUtilities ? '0 4px 12px rgba(0, 82, 204, 0.3)' : 'none',
              transform: utilitiesButtonHover ? 'translateY(-1px)' : 'none',
              transition: 'box-shadow 0.2s ease, background-color 0.2s ease, transform 0.2s ease',
            }}
          >
            {showUtilities ? 'Close Utilities' : 'Open Utilities'}
          </button>
        </div>
      </header>

      <StageProgress currentStage={stage} />

      {needsInitialization && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#FFF8E1',
            border: '1px solid #F5C04E',
            borderRadius: '12px',
            marginBottom: '24px',
          }}
        >
          <strong>Warm-up required:</strong> the knowledge base has not been initialised. Use the
          Utilities panel to warm the cache before analysing cases.
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#FFEBE6',
            border: '1px solid #FF8B8B',
            borderRadius: '12px',
            marginBottom: '24px',
            color: '#172B4D',
          }}
        >
          {error}
        </div>
      )}

      <main>
        {analysisJobActive && (
          <JobStatusBanner
            job={analysisJob}
            label="Request has been accepted."
          />
        )}

        {responseJobActive && (
          <JobStatusBanner
            job={responseJob}
            label="Request has been accepted."
          />
        )}

        {stage === STAGES.INTAKE && (
          <ConsumerIntake
            formData={formData}
            onChange={setFormData}
            onSubmit={handleIntakeSubmit}
            loading={loading || analysisJobActive}
            isAnalyzing={loading || analysisJobActive}
            attachments={attachments}
            onAddAttachments={handleAddAttachments}
            onRemoveAttachment={handleRemoveAttachment}
          />
        )}

        {stage === STAGES.WORKBENCH && analysisResult && (
          <TaskCommander
            analysis={analysisResult}
            caseStatus={caseStatus}
            internalNote={internalNoteDraft}
            onInternalNoteChange={setInternalNoteDraft}
            taskQueue={taskQueue}
            taskResponses={taskResponses}
            onSubmitTask={handleTaskSubmission}
            onUndoTask={handleTaskUndo}
            onReanalyze={handleReanalyzeSubmit}
            onGenerateResponse={handleFinalizeSubmit}
            isReanalyzing={isReanalysisPending}
            isGeneratingResponse={isResponsePending}
            canReanalyze={canReanalyze}
            canGenerateResponse={allTasksCompleted && !isResponsePending}
            loading={workbenchIsLoading}
          />
        )}

        {stage === STAGES.FINALIZE && finalOutput && (
          <ResponseFinalizer
            result={finalOutput}
            caseStatus={caseStatus}
            onReset={resetWorkflow}
            loading={loading || responseJobActive}
          />
        )}
      </main>

      <UtilitiesPanel
        visible={showUtilities}
        onClose={() => setShowUtilities(false)}
        usageStats={usageStats}
        onRefreshUsage={fetchUsageStats}
        onWarmKnowledgeBase={async () => {
          setIsWarming(true);
          setLoading(true);
          setError(null);
          try {
            const result = await invokeBridge('debug-load-vectors');
            if (result?.success) {
              await checkHealth();
              await checkStorageStatus();
            } else {
              throw new Error(result?.error || 'Failed to warm knowledge base');
            }
          } catch (err) {
            console.error('Warm knowledge base failed', err);
            setError(err.message || 'Unable to warm knowledge base');
          } finally {
            setIsWarming(false);
            setLoading(false);
          }
        }}
        serviceIndicator={serviceIndicator}
        debugInfo={debugInfo}
        executionLogs={executionLogs}
        isBusy={loading || analysisJobActive || responseJobActive}
        isWarming={isWarming}
        instanceInfo={instanceInfo}
        latestLlmCharacters={latestLlmCharacters}
        isRefreshingUsage={isRefreshingUsage}
        usageLastUpdated={usageLastUpdated}
      />
    </div>
  );
}

function JobStatusBanner({ job, label }) {
  const statusLabel =
    job.status === JOB_STATUS.QUEUED ? 'Queued for processing' : 'Running in OpenAI';

  return (
    <section style={jobBannerStyle}>
      <div>
        <div style={jobBannerTitleStyle}>{label}</div>
        <div style={jobBannerMetaStyle}>
          {statusLabel}. Job id: <code>{job.id}</code>
        </div>
      </div>
    </section>
  );
}

const jobBannerStyle = {
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  padding: '16px 20px',
  borderRadius: '12px',
  border: '1px solid #4C9AFF',
  backgroundColor: '#DEEBFF',
  marginBottom: '20px',
  color: '#0747A6',
  gap: '12px',
};

const jobBannerTitleStyle = {
  fontWeight: 700,
  fontSize: '16px',
};

const jobBannerMetaStyle = {
  marginTop: '4px',
  fontSize: '13px',
};

function buildAgentFindingsFromTasks(tasks, responses) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  return tasks
    .map((task) => {
      const response = responses[task.id];
      if (!response?.completed) {
        return null;
      }

      const segments = [];
      if (response.inputs) {
        Object.entries(response.inputs).forEach(([field, value]) => {
          segments.push(`${field}: ${value}`);
        });
      }
      if (response.notes) {
        segments.push(`Notes: ${response.notes}`);
      }
      return {
        id: task.id,
        description: task.title || task.instruction || `Task ${task.id}`,
        notes: segments.join(' | ') || 'Confirmation captured.',
      };
    })
    .filter(Boolean);
}

function buildAgentStepResults(tasks, responses) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  return tasks
    .map((task) => {
      const response = responses[task.id];
      if (!response?.completed) {
        return null;
      }
      const valuePairs = response.inputs
        ? Object.entries(response.inputs)
            .map(([field, value]) => `${field}: ${value}`)
            .join(' | ')
        : '';
      const aggregatedNotes = [valuePairs, response.notes].filter(Boolean).join(' | ');
      return {
        id: task.id,
        description: task.title || task.instruction || `Task ${task.id}`,
        completed: true,
        notes: aggregatedNotes,
      };
    })
    .filter(Boolean);
}

function deriveTaskQueue(result = {}) {
  const explicitQueue = Array.isArray(result.taskQueue) ? result.taskQueue : [];
  if (explicitQueue.length > 0) {
    return explicitQueue.map((task, index) => normaliseTask(task, index));
  }
  const agentSteps = result.recommendationPlan?.agentSteps || [];
  return agentSteps.map((step, index) =>
    normaliseTask(
      {
        id: step.id,
        title: step.title || step.name,
        instruction: step.description,
        purpose: step.purpose,
        tool: step.tool,
        expectedInputs: step.expectedInputs,
        blockedBy: step.blockedBy,
        produces: step.produces,
      },
      index
    )
  );
}

function normaliseTask(task = {}, index = 0) {
  return {
    id: task.id || `task_${index + 1}`,
    title: task.title || task.name || `Internal action ${index + 1}`,
    instruction: task.instruction || task.description || 'Follow internal instructions.',
    purpose: task.purpose || task.reason || '',
    tool: task.tool || task.system || 'Internal tooling',
    requiresHumanInput: task.requiresHumanInput !== false,
    expectedInputs: Array.isArray(task.expectedInputs) ? task.expectedInputs : [],
    successCriteria: task.successCriteria || '',
    blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy : [],
    produces: Array.isArray(task.produces) ? task.produces : [],
  };
}

function normalizeTaskKey(task = {}) {
  const title = (task.title || task.name || task.instruction || '').trim().toLowerCase();
  if (!title) {
    return null;
  }
  const tool = (task.tool || '').trim().toLowerCase();
  return `${title}|${tool}`;
}

function createTaskResponseSnapshot(tasks = [], responses = {}) {
  const byId = {};
  const byTitle = {};
  tasks.forEach((task) => {
    const response = responses[task.id];
    if (response?.completed) {
      byId[task.id] = response;
      const key = normalizeTaskKey(task);
      if (key) {
        byTitle[key] = response;
      }
    }
  });
  return {
    responsesById: byId,
    responsesByTitle: byTitle,
  };
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getServiceIndicator(status, isWarming) {
  if (isWarming) {
    return {
      label: 'Warming cache...',
      icon: '>>',
      background: '#E6FCFF',
      border: '#4C9AFF',
      textColor: '#0747A6',
      pulseAnimation: 'statusPulse 1.4s ease-in-out infinite',
    };
  }

  switch (status) {
    case 'ready':
      return {
        label: 'OK available',
        icon: 'OK',
        background: '#E3FCEF',
        border: '#79F2C0',
        textColor: '#006644',
        pulseAnimation: 'none',
      };
    case 'cold':
      return {
        label: 'Warming cache recommended',
        icon: '!',
        background: '#FFF7DB',
        border: '#FFE380',
        textColor: '#947303',
        pulseAnimation: 'statusPulse 1.4s ease-in-out infinite',
      };
    case 'error':
      return {
        label: 'Attention needed',
        icon: '!',
        background: '#FFEBE6',
        border: '#FF8B8B',
        textColor: '#BF2600',
        pulseAnimation: 'statusPulseAlert 1.6s ease-in-out infinite',
      };
    case 'checking':
    default:
      return {
        label: 'Checking...',
        icon: '..',
        background: '#DEEBFF',
        border: '#4C9AFF',
        textColor: '#0747A6',
        pulseAnimation: 'statusPulse 1.4s ease-in-out infinite',
      };
  }
}

export default App;
