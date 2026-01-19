// static/hello-world/src/components/ConsumerIntake.jsx
// Step 1 user experience: capture the original portal request, the full conversation,
// and any supporting imagery before invoking the AI pipeline.

import React from 'react';

import CaseLoadingOverlay, { SHARED_FLAVOR_WORDS } from './CaseLoadingOverlay';

const instructions = {
  agentName:
    'Type your name exactly how it should appear at the end of the email, e.g., Marvin',
  originalPortalRequest:
    "In the Jira ticket, click on 'View request in portal' and paste the content here",
  conversationActivity:
    'Copy here the entire email conversation history, including all the internal notes.',
};

// The guided list walks the agent through deterministic milestones before we loop over the fun filler words.
const ANALYSIS_GUIDED_MESSAGES = [
  'Submitting background job',
  'Reading the emails',
  'Preparing vector conversion',
  'Vectorizing the texts',
  'Machine learning started',
  'Running vector search in the knowledge base',
  'Vector search complete',
  'Reading knowledge base articles',
  'Building context analysis',
  'Context analysis complete',
  'Writing case summary',
  'Evaluating troubleshooting',
  'Preparing internal notes',
  'Choosing actions',
];

export default function ConsumerIntake({
  formData,
  onChange,
  onSubmit,
  loading,
  isAnalyzing = false,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
}) {
  const handleChange = (field, value) => {
    onChange((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const portalText = formData.originalPortalRequest.trim();
  const conversationText = formData.conversationActivity.trim();
  const portalIssues = [];
  if (!portalText) {
    portalIssues.push({
      type: 'error',
      message:
        "Paste the full original portal request so the assistant sees the customer's first message.",
    });
  } else if (portalText.length < 40) {
    portalIssues.push({
      type: 'warning',
      message: 'The portal request looks short. Double-check that the entire message is included.',
    });
  }

  const conversationIssues = [];
  if (conversationText) {
    if (!/Edit/i.test(conversationText) || !/Delete/i.test(conversationText)) {
      conversationIssues.push({
        type: 'warning',
        message:
          'Tip: Separate each reply with "Edit" and "Delete" just like the Jira portal to help the assistant split entries accurately.',
      });
    }
    if (!/Internal note/i.test(conversationText)) {
      conversationIssues.push({
        type: 'info',
        message:
          'No "Internal note" entries detected. Add them if private context exists so the LLM keeps them internal.',
      });
    }
    if (conversationText.length < 200) {
      conversationIssues.push({
        type: 'warning',
        message: 'Conversation transcript seems short. Confirm you captured the full history.',
      });
    }
  }

  // Determine if any validation rule flagged a true error so we can surface a red field state.
  const conversationHasError = conversationIssues.some((issue) => issue.type === 'error');

  const conversationWordCount = conversationText
    ? conversationText.split(/\s+/).filter(Boolean).length
    : 0;

  const portalHasError = portalIssues.some((issue) => issue.type === 'error');
  const readyForAnalysis = !portalHasError;

  const portalTextareaStyle = {
    ...textareaStyle,
    borderColor: portalHasError ? '#FF8B8B' : '#B3BAC5',
    boxShadow: portalHasError ? '0 0 0 2px rgba(255, 139, 139, 0.2)' : 'none',
  };

  const conversationTextareaStyle = {
    ...textareaStyle,
    minHeight: '220px',
    borderColor: conversationHasError ? '#FF8B8B' : '#B3BAC5',
    boxShadow: conversationHasError ? '0 0 0 2px rgba(255, 139, 139, 0.2)' : 'none',
  };

  if (isAnalyzing) {
    return (
      <section style={cardStyle}>
        <CaseLoadingOverlay
          active={isAnalyzing}
          guidedMessages={ANALYSIS_GUIDED_MESSAGES}
          flavorWords={SHARED_FLAVOR_WORDS}
        />
      </section>
    );
  }

  return (
    <section style={cardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={stepPillStyle}>Step 1</div>
          <h2 style={sectionTitleStyle}>Gather the customer conversation</h2>
          <p style={sectionLeadStyle}>
            Paste the original portal submission and the full email conversation so the assistant
            can understand the entire customer context.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <fieldset style={fieldsetStyle}>
          <label style={labelStyle}>Your Name</label>
          <input
            type="text"
            value={formData.agentName || ''}
            onChange={(event) => handleChange('agentName', event.target.value)}
            placeholder={instructions.agentName}
            style={textInputStyle}
          />
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <label style={labelStyle}>Original Portal Request</label>
          <textarea
            value={formData.originalPortalRequest}
            onChange={(event) => handleChange('originalPortalRequest', event.target.value)}
            placeholder={instructions.originalPortalRequest}
            style={portalTextareaStyle}
          />
          <div style={statusMetaStyle}>
            <span style={wordCountStyle}>Characters: {portalText.length}</span>
          </div>
          {portalIssues.map((issue, index) => (
            <p
              key={`portal-issue-${index}`}
              style={{
                ...helperTextStyle,
                color: issue.type === 'error' ? '#BF2600' : '#0052CC',
              }}
            >
              {issue.message}
            </p>
          ))}
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <label style={labelStyle}>Conversation Activity</label>
          <textarea
            value={formData.conversationActivity}
            onChange={(event) => handleChange('conversationActivity', event.target.value)}
            placeholder={instructions.conversationActivity}
            style={conversationTextareaStyle}
          />
          <div style={statusMetaStyle}>
            <span style={wordCountStyle}>Word count: {conversationWordCount}</span>
          </div>
          {conversationIssues.map((issue, index) => {
            const tone =
              issue.type === 'error'
                ? '#BF2600'
                : issue.type === 'warning'
                ? '#0052CC'
                : '#172B4D';
            return (
              <p
                key={`conversation-issue-${index}`}
                style={{
                  ...helperTextStyle,
                  color: tone,
                }}
              >
                {issue.message}
              </p>
            );
          })}
          {!conversationText && (
            <p style={helperTextStyle}>
              Leave this blank for brand new customer requests. Add the full email thread when
              responding to an existing case.
            </p>
          )}
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <label style={labelStyle}>Image Attachments</label>
          <div
            style={{
              border: '1px dashed #B3BAC5',
              borderRadius: '12px',
              padding: '20px',
              backgroundColor: '#FAFBFC',
              textAlign: 'center',
            }}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                onAddAttachments(event.target.files);
                event.target.value = '';
              }}
              style={{ display: 'block', margin: '0 auto 12px' }}
            />
            <p style={{ margin: 0, color: '#5E6C84' }}>
              Attach annotated screenshots or supporting photos. These will be summarised for the
              analysis step.
            </p>
          </div>
          {attachments.length > 0 && (
            <ul style={attachmentListStyle}>
              {attachments.map((file) => (
                <li key={file.id} style={attachmentItemStyle}>
                  <div>
                    <strong>{file.name}</strong>
                    <div style={{ fontSize: '12px', color: '#5E6C84' }}>
                      {(file.size / 1024).toFixed(1)} KB | {file.type}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveAttachment(file.id)}
                    style={removeButtonStyle}
                    type="button"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>

      <div style={actionsRowStyle}>
        <button
          onClick={onSubmit}
          disabled={!readyForAnalysis || loading}
          style={{
            ...primaryButtonStyle,
            opacity: !readyForAnalysis || loading ? 0.6 : 1,
            cursor: !readyForAnalysis || loading ? 'not-allowed' : 'pointer',
          }}
          type="button"
        >
          {loading ? 'Analysing conversation...' : 'Analyse conversation'}
        </button>
      </div>
    </section>
  );
}

const cardStyle = {
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: '32px',
  boxShadow: '0 12px 32px rgba(9, 30, 66, 0.08)',
  border: '1px solid rgba(9, 30, 66, 0.06)',
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  marginBottom: '24px',
};

const stepPillStyle = {
  display: 'inline-block',
  backgroundColor: '#DEEBFF',
  color: '#0747A6',
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

const fieldsetStyle = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const labelStyle = {
  fontWeight: 700,
  fontSize: '14px',
  color: '#172B4D',
};

const textareaStyle = {
  width: '100%',
  minHeight: '160px',
  padding: '14px',
  borderRadius: '12px',
  border: '1px solid #B3BAC5',
  fontSize: '14px',
  lineHeight: 1.5,
  resize: 'vertical',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

const helperTextStyle = {
  margin: 0,
  fontSize: '12px',
  color: '#5E6C84',
};

const textInputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid #B3BAC5',
  fontSize: '14px',
  lineHeight: 1.4,
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

const statusMetaStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '11px',
  color: '#6B778C',
};

const wordCountStyle = {
  fontFamily: 'monospace',
};

const attachmentListStyle = {
  listStyle: 'none',
  padding: 0,
  margin: '12px 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const attachmentItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  backgroundColor: '#F4F5F7',
  borderRadius: '12px',
};

const removeButtonStyle = {
  backgroundColor: 'transparent',
  border: '1px solid #BF2600',
  color: '#BF2600',
  borderRadius: '20px',
  padding: '6px 12px',
  cursor: 'pointer',
};

const actionsRowStyle = {
  marginTop: '32px',
  display: 'flex',
  justifyContent: 'flex-end',
};

const primaryButtonStyle = {
  backgroundColor: '#0052CC',
  color: 'white',
  border: 'none',
  padding: '12px 28px',
  borderRadius: '999px',
  fontSize: '15px',
  fontWeight: 600,
  transition: 'transform 0.1s ease',
};
