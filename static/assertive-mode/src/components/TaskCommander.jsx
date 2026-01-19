// static/assertive-mode/src/components/TaskCommander.jsx
// Assertive Step 2 UI: renders the authoritative task queue, captures human confirmations,
// and keeps the internal note editable while the assistant drives the workflow.

import React, { useEffect, useMemo, useState } from 'react';
import {
  DATA_FIELD_RULES,
  getFieldRule,
  validateFieldValue,
  normaliseFieldValue,
} from '../constants/dataFields';
import CaseLoadingOverlay, { SHARED_FLAVOR_WORDS } from './CaseLoadingOverlay';

const caseStatusBadgeStyle = {
  display: 'inline-block',
  marginTop: '8px',
  marginBottom: '8px',
  padding: '4px 12px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const newStatusStyle = {
  backgroundColor: '#E3FCEF',
  color: '#006644',
};

const ongoingStatusStyle = {
  backgroundColor: '#FFF0B3',
  color: '#593800',
};

const EMPTY_GUIDED_MESSAGES = Object.freeze([]);

export default function TaskCommander({
  analysis,
  caseStatus,
  internalNote,
  onInternalNoteChange,
  taskQueue,
  taskResponses,
  onSubmitTask,
  onUndoTask,
  onReanalyze,
  onGenerateResponse,
  isReanalyzing,
  isGeneratingResponse,
  canReanalyze,
  canGenerateResponse,
  loading,
}) {
  if (loading) {
    return (
      <section style={cardStyle}>
        <CaseLoadingOverlay
          active
          guidedMessages={EMPTY_GUIDED_MESSAGES}
          flavorWords={SHARED_FLAVOR_WORDS}
        />
      </section>
    );
  }

  const summary = analysis?.summary || '';
  const knowledgeBaseArticles = analysis?.knowledgeBaseArticles || [];

  const activeTask = useMemo(() => {
    if (!Array.isArray(taskQueue) || taskQueue.length === 0) {
      return null;
    }
    const openTask = taskQueue.find((task) => !taskResponses[task.id]?.completed);
    return openTask || taskQueue[taskQueue.length - 1];
  }, [taskQueue, taskResponses]);

  const [inputValues, setInputValues] = useState({});
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!activeTask) {
      setInputValues({});
      setNotes('');
      setErrors({});
      return;
    }
    const previous = taskResponses[activeTask.id];
    const autoPrefills = derivePrefilledInputs(activeTask);
    if (previous?.inputs) {
      setInputValues({
        ...autoPrefills,
        ...previous.inputs,
      });
    } else {
      setInputValues(autoPrefills);
    }
    setNotes(previous?.notes || '');
    setErrors({});
  }, [activeTask, taskResponses]);

  const handleInputChange = (field, value) => {
    setInputValues((prev) => ({
      ...prev,
      [field]: value,
    }));
    setErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }));
  };

  const handleSubmit = () => {
    if (!activeTask) {
      return;
    }
    const expectedInputs = Array.isArray(activeTask.expectedInputs)
      ? activeTask.expectedInputs
      : [];
    const validationErrors = {};
    const normalisedInputs = {};
    expectedInputs.forEach((input) => {
      const key = input.field || input.id;
      const value = inputValues[key] || '';
      const needsValue = input.optional !== true;
      if (!needsValue && !value) {
        return;
      }
      const error = validateFieldValue(key, value);
      if (error) {
        validationErrors[key] = error;
      } else {
        normalisedInputs[key] = normaliseFieldValue(key, value);
      }
    });

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    onSubmitTask(activeTask.id, {
      inputs: normalisedInputs,
      notes: notes.trim(),
    });
  };

  const handleUndo = (taskId) => {
    onUndoTask(taskId);
    if (activeTask && activeTask.id === taskId) {
      setInputValues({});
      setNotes('');
      setErrors({});
    }
  };

  const completedCount = taskQueue.filter((task) => taskResponses[task.id]?.completed).length;
  const totalTasks = taskQueue.length;

  return (
    <section style={cardStyle}>
      <header style={headerRowStyle}>
        <div>
          <div style={stepPillStyle}>Step 2</div>
          <div
            style={{
              ...caseStatusBadgeStyle,
              ...(caseStatus === 'ongoing' ? ongoingStatusStyle : newStatusStyle),
            }}
          >
            {caseStatus === 'ongoing' ? 'Ongoing case' : 'New case'}
          </div>
          <h2 style={sectionTitleStyle}>Assertive plan is in control</h2>
          <p style={sectionLeadStyle}>
            Follow each task exactly as written. Provide the requested identifiers so the assistant can
            make the final decision on behalf of the user.
          </p>
        </div>
      </header>

      <div style={contentStackStyle}>
        <article style={panelStyle}>
          <h3 style={panelTitleStyle}>Case summary</h3>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{summary}</p>
        </article>

        <article style={panelStyle}>
          <h3 style={panelTitleStyle}>Internal note</h3>
          <p style={panelHelperStyle}>
            Maintain the exact formatting. The assistant will refresh it again once tasks finish.
          </p>
          <textarea
            value={internalNote}
            onChange={(event) => onInternalNoteChange(event.target.value)}
            style={internalNoteStyle}
          />
        </article>

        <article style={panelStyle}>
          <h3 style={panelTitleStyle}>Knowledge base context</h3>
          {knowledgeBaseArticles.length === 0 ? (
            <EmptyState message="No knowledge base matches were referenced." />
          ) : (
            <ul style={kbListStyle}>
              {knowledgeBaseArticles.map((article) => (
                <li key={`${article.title}-${article.link}`} style={kbListItemStyle}>
                  <strong>{article.title}</strong>
                  {resolveArticleLink(article) && (
                    <div style={{ marginTop: '4px' }}>
                      <a href={resolveArticleLink(article)} target="_blank" rel="noreferrer">
                        View article
                      </a>
                    </div>
                  )}
                  {article.contentSnippet && (
                    <p style={{ ...panelHelperStyle, marginTop: '8px' }}>{article.contentSnippet}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article style={panelStyle}>
          <div style={tasksHeaderStyle}>
            <div>
              <h3 style={panelTitleStyle}>Assertive task queue</h3>
              <p style={panelHelperStyle}>
                {totalTasks === 0
                  ? 'No additional inputs are required. Proceed to the final response.'
                  : `Complete ${totalTasks - completedCount} more task${
                      totalTasks - completedCount === 1 ? '' : 's'
                    } before re-checking with the assistant.`}
              </p>
            </div>
            <div style={taskProgressBadgeStyle}>
              {completedCount}/{totalTasks || 0} complete
            </div>
          </div>

          {totalTasks === 0 ? (
            <EmptyState message="The assistant can proceed immediately—no manual data collection required." />
          ) : (
            <>
              <div style={taskListStyle}>
                {taskQueue.map((task, index) => {
                  const response = taskResponses[task.id];
                  const isActive = activeTask && activeTask.id === task.id && !response?.completed;
                  const isComplete = Boolean(response?.completed);
                  return (
                    <div
                      key={task.id}
                      style={{
                        ...taskListItemStyle,
                        ...(isComplete ? taskCompleteStyle : {}),
                        ...(isActive ? taskActiveStyle : {}),
                      }}
                    >
                      <div style={taskListHeaderStyle}>
                        <span style={taskOrdinalStyle}>#{String(index + 1).padStart(2, '0')}</span>
                        <span style={taskToolBadgeStyle}>{task.tool || 'Internal tooling'}</span>
                        <span
                          style={{
                            ...taskStatusBadgeStyle,
                            backgroundColor: isComplete ? '#E3FCEF' : '#FFF7DB',
                            color: isComplete ? '#006644' : '#8B572A',
                          }}
                        >
                          {isComplete ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                      <div style={taskTitleStyle}>{task.title || task.instruction}</div>
                      {task.purpose && <p style={panelHelperStyle}>{task.purpose}</p>}
                      {isComplete && response?.inputs && (
                        <ul style={capturedListStyle}>
                          {Object.entries(response.inputs).map(([field, value]) => (
                            <li key={`${task.id}-${field}`}>
                              <em>{DATA_FIELD_RULES[field]?.label || field}:</em> {value}
                            </li>
                          ))}
                          {response.notes && (
                            <li>
                              <em>Notes:</em> {response.notes}
                            </li>
                          )}
                        </ul>
                      )}
                      {isComplete && (
                        <button
                          type="button"
                          style={editButtonStyle}
                          onClick={() => handleUndo(task.id)}
                        >
                          Edit response
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {activeTask && !taskResponses[activeTask.id]?.completed && (
                <div style={activeTaskFormStyle}>
                  <h4 style={activeTaskTitleStyle}>
                    Current task: {activeTask.title || activeTask.instruction}
                  </h4>
                  <p style={{ ...panelHelperStyle, marginBottom: '12px' }}>{activeTask.instruction}</p>
                  {activeTask.blockedBy && activeTask.blockedBy.length > 0 && (
                    <p style={{ ...panelHelperStyle, color: '#C05717' }}>
                      Blocked by: {activeTask.blockedBy.join(', ')}
                    </p>
                  )}
                  {Array.isArray(activeTask.expectedInputs) && activeTask.expectedInputs.length > 0 ? (
                    activeTask.expectedInputs.map((input) => {
                      const key = input.field || input.id;
                      const rule = getFieldRule(key);
                      return (
                        <label key={`${activeTask.id}-${key}`} style={fieldLabelStyle}>
                          {input.label || rule?.label || key}
                          <textarea
                            value={inputValues[key] || ''}
                            onChange={(event) => handleInputChange(key, event.target.value)}
                            style={{
                              ...fieldInputStyle,
                              borderColor: errors[key] ? '#FF8B8B' : '#B3BAC5',
                            }}
                            placeholder={
                              input.placeholder ||
                              rule?.example ||
                              'Enter the value exactly as it appears in the tool.'
                            }
                          />
                          <span style={fieldHelperStyle}>
                            {input.formatHint || rule?.helper || 'Provide the requested value in ASCII.'}
                          </span>
                          {errors[key] && <span style={fieldErrorStyle}>{errors[key]}</span>}
                        </label>
                      );
                    })
                  ) : (
                    <p style={{ ...panelHelperStyle, marginBottom: '12px' }}>
                      No specific identifiers requested—add quick confirmation notes below if relevant.
                    </p>
                  )}
                  <label style={fieldLabelStyle}>
                    Observations / confirmation (optional)
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      style={fieldInputStyle}
                      placeholder="Example: Confirmed subscription S-6652385 belongs to Alex Smith."
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                      ...primaryButtonStyle,
                      opacity: loading ? 0.6 : 1,
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading ? 'Submitting...' : 'Confirm for assistant'}
                  </button>
                </div>
              )}
            </>
          )}
        </article>
      </div>

      <footer style={actionsRowStyle}>
        <button
          onClick={onReanalyze}
          disabled={!canReanalyze || loading}
          style={{
            ...secondaryButtonStyle,
            opacity: !canReanalyze || loading ? 0.5 : 1,
          }}
          type="button"
        >
          {isReanalyzing ? 'Re-forging analysis…' : 'Re-forge analysis'}
        </button>
        <button
          onClick={onGenerateResponse}
          disabled={!canGenerateResponse || loading}
          style={{
            ...primaryButtonStyle,
            opacity: !canGenerateResponse || loading ? 0.5 : 1,
          }}
          type="button"
        >
          {isGeneratingResponse ? 'Preparing final response…' : 'Create final response'}
        </button>
      </footer>
    </section>
  );
}

function EmptyState({ message }) {
  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: '#F4F5F7',
        borderRadius: '12px',
        color: '#5E6C84',
        fontSize: '13px',
      }}
    >
      {message}
    </div>
  );
}

const cardStyle = {
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: '32px',
  boxShadow: '0 12px 32px rgba(9, 30, 66, 0.08)',
  border: '1px solid rgba(9, 30, 66, 0.06)',
};

const headerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: '24px',
  gap: '12px',
};

const stepPillStyle = {
  display: 'inline-block',
  backgroundColor: '#EAE6FF',
  color: '#403294',
  borderRadius: '999px',
  padding: '4px 12px',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const sectionTitleStyle = {
  margin: '8px 0 4px',
};

const sectionLeadStyle = {
  margin: 0,
  color: '#5E6C84',
};

const contentStackStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const panelStyle = {
  backgroundColor: '#FDFDFD',
  borderRadius: '16px',
  padding: '24px',
  border: '1px solid rgba(9, 30, 66, 0.05)',
  boxShadow: '0 6px 16px rgba(9, 30, 66, 0.04)',
};

const panelTitleStyle = {
  margin: 0,
  fontSize: '18px',
};

const panelHelperStyle = {
  margin: '8px 0 0',
  fontSize: '12px',
  color: '#5E6C84',
  lineHeight: 1.4,
};

const internalNoteStyle = {
  width: '100%',
  minHeight: '320px',
  marginTop: '16px',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid #B3BAC5',
  fontFamily: 'monospace',
  fontSize: '13px',
  lineHeight: 1.6,
  resize: 'vertical',
};

const kbListStyle = {
  listStyle: 'none',
  padding: 0,
  margin: '12px 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const kbListItemStyle = {
  padding: '12px',
  borderRadius: '12px',
  backgroundColor: '#F4F5F7',
};

const tasksHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
};

const taskProgressBadgeStyle = {
  backgroundColor: '#EAE6FF',
  color: '#403294',
  borderRadius: '999px',
  padding: '6px 14px',
  fontWeight: 700,
};

const taskListStyle = {
  marginTop: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const taskListItemStyle = {
  borderRadius: '14px',
  border: '1px solid rgba(9, 30, 66, 0.08)',
  padding: '16px',
  backgroundColor: 'white',
};

const taskActiveStyle = {
  borderColor: '#0052CC',
  boxShadow: '0 4px 12px rgba(0, 82, 204, 0.3)',
};

const taskCompleteStyle = {
  backgroundColor: '#E3FCEF',
  borderColor: '#57D9A3',
};

const taskListHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
  marginBottom: '8px',
};

const taskOrdinalStyle = {
  fontWeight: 700,
  fontSize: '12px',
  color: '#7A869A',
};

const taskToolBadgeStyle = {
  backgroundColor: '#F4F5F7',
  color: '#42526E',
  borderRadius: '999px',
  padding: '4px 10px',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const taskStatusBadgeStyle = {
  marginLeft: 'auto',
  borderRadius: '999px',
  padding: '4px 10px',
  fontSize: '11px',
  letterSpacing: '0.04em',
  fontWeight: 700,
};

const taskTitleStyle = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#172B4D',
};

const capturedListStyle = {
  marginTop: '8px',
  listStyle: 'disc',
  paddingInlineStart: '20px',
  color: '#172B4D',
  fontSize: '13px',
};

const editButtonStyle = {
  marginTop: '8px',
  backgroundColor: 'transparent',
  border: '1px dashed #0052CC',
  color: '#0052CC',
  borderRadius: '20px',
  padding: '6px 14px',
  cursor: 'pointer',
};

const activeTaskFormStyle = {
  marginTop: '24px',
  padding: '20px',
  borderRadius: '14px',
  border: '1px solid #0B66FF',
  backgroundColor: '#F0F8FF',
};

const activeTaskTitleStyle = {
  margin: '0 0 6px',
};

const fieldLabelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginBottom: '16px',
  fontWeight: 600,
  fontSize: '13px',
};

const fieldInputStyle = {
  borderRadius: '10px',
  border: '1px solid #B3BAC5',
  padding: '10px 12px',
  resize: 'vertical',
  minHeight: '64px',
  fontSize: '13px',
  lineHeight: 1.5,
};

const fieldHelperStyle = {
  fontWeight: 400,
  color: '#5E6C84',
  fontSize: '12px',
};

const fieldErrorStyle = {
  color: '#BF2600',
  fontSize: '12px',
};

const actionsRowStyle = {
  marginTop: '32px',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  flexWrap: 'wrap',
  alignItems: 'center',
};

const primaryButtonStyle = {
  backgroundColor: '#0052CC',
  color: 'white',
  border: 'none',
  padding: '12px 28px',
  borderRadius: '999px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  backgroundColor: '#F4F5F7',
  color: '#172B4D',
  border: '1px solid #C1C7D0',
  padding: '12px 24px',
  borderRadius: '999px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

const emailRegex =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const inferValueFromTaskContext = (fieldKey, task = {}) => {
  const text = [task.instruction, task.title, task.purpose].filter(Boolean).join(' ');
  if (!text) {
    return null;
  }

  switch (fieldKey) {
    case 'subscription_id': {
      const appleWatch = text.match(/S-\d{6,}/i);
      if (appleWatch) {
        return appleWatch[0].toUpperCase();
      }
      const numericMatch = text.match(/\b\d{8,12}\b(?=[^a-zA-Z0-9]{0,10}(?:subscription|plan))/i);
      return numericMatch ? numericMatch[0] : null;
    }
    case 'contact_email':
    case 'account_email': {
      const emailMatch = text.match(emailRegex);
      return emailMatch ? emailMatch[0] : null;
    }
    case 'payment_id': {
      const match = text.match(/pi_[A-Za-z0-9]+/);
      return match ? match[0] : null;
    }
    case 'imsi': {
      const match = text.match(/IMSI[^0-9]*([0-9]{15})/i);
      return match ? match[1] : null;
    }
    case 'msisdn': {
      const match = text.match(/MSISDN[^0-9]*([0-9]{10,12})/i);
      return match ? match[1] : null;
    }
    case 'iccid': {
      const match = text.match(/8944\d{15}/);
      return match ? match[0] : null;
    }
    default:
      return null;
  }
};

const derivePrefilledInputs = (task) => {
  const expectedInputs = Array.isArray(task?.expectedInputs) ? task.expectedInputs : [];
  return expectedInputs.reduce((acc, input) => {
    const key = input.field || input.id;
    const inferred = inferValueFromTaskContext(key, task);
    if (inferred) {
      try {
        acc[key] = normaliseFieldValue(key, inferred);
      } catch (error) {
        acc[key] = inferred;
      }
    }
    return acc;
  }, {});
};

const resolveArticleLink = (article = {}) =>
  article.link || article.url || article.source || article.href || '';
