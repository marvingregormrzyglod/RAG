// static/hello-world/src/components/ResponseFinalizer.jsx
// Step 3: present the generated customer email and the refreshed internal note so the agent can close the loop.

import React, { useState } from 'react';
import { extractCustomerFirstNameFromNote } from '../utils/internalNotes';

export default function ResponseFinalizer({ result, onReset, loading, caseStatus = 'new' }) {
  const [copied, setCopied] = useState(false);
  const recipientName = extractCustomerFirstNameFromNote(result?.internalNote || '');
  const preparedEmailDraft = ensureGreetingForCase(result.emailDraft || '', recipientName);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preparedEmailDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy email draft', err);
    }
  };

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <div>
          <div style={stepPillStyle}>Step 3</div>
          <div
            style={{
              ...statusBadgeStyle,
              ...(caseStatus === 'ongoing' ? ongoingStatusStyle : newStatusStyle),
            }}
          >
            {caseStatus === 'ongoing' ? 'Ongoing case' : 'New case'}
          </div>
          <h2 style={sectionTitleStyle}>Deliver the response</h2>
          <p style={sectionLeadStyle}>
            Share the generated email with the customer and update the ticket with the internal note
            so everything stays aligned in Jira.
          </p>
        </div>
        <button onClick={onReset} style={secondaryButtonStyle} type="button" disabled={loading}>
          Start a new ticket
        </button>
      </div>

      <article style={panelStyle}>
        <h3 style={panelTitleStyle}>Customer email draft</h3>
        <textarea value={preparedEmailDraft} readOnly style={emailDraftStyle} />
        <div style={actionsRowStyle}>
          <button onClick={handleCopy} style={primaryButtonStyle} type="button">
            {copied ? 'Copied to clipboard' : 'Copy email draft'}
          </button>
        </div>
      </article>

      <article style={panelStyle}>
        <h3 style={panelTitleStyle}>Updated internal note</h3>
        <textarea value={result.internalNote || ''} readOnly style={internalNoteStyle} />
      </article>
    </section>
  );
}

const cardStyle = {
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: '32px',
  boxShadow: '0 12px 32px rgba(9, 30, 66, 0.08)',
  border: '1px solid rgba(9, 30, 66, 0.06)',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const headerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
};

const stepPillStyle = {
  display: 'inline-block',
  backgroundColor: '#E6FCFF',
  color: '#0065FF',
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

const statusBadgeStyle = {
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

const sectionLeadStyle = {
  margin: 0,
  color: '#5E6C84',
};

const secondaryButtonStyle = {
  backgroundColor: 'transparent',
  border: '1px solid #A5ADBA',
  color: '#42526E',
  padding: '10px 20px',
  borderRadius: '999px',
  cursor: 'pointer',
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

const panelBodyStyle = {
  margin: '12px 0 0',
  color: '#172B4D',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
};

const emailDraftStyle = {
  width: '100%',
  minHeight: '320px',
  marginTop: '16px',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid #B3BAC5',
  fontSize: '14px',
  lineHeight: 1.6,
  fontFamily: 'sans-serif',
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
};

const actionsRowStyle = {
  marginTop: '16px',
  display: 'flex',
  justifyContent: 'flex-end',
};

const primaryButtonStyle = {
  backgroundColor: '#0052CC',
  color: 'white',
  border: 'none',
  padding: '12px 24px',
  borderRadius: '999px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

/**
 * Ensures ongoing cases never skip a greeting. We only prepend the greeting when it is missing
 * because the LLM sometimes produces one already for new cases and we do not want duplicates.
 */
function ensureGreetingForCase(draft, customerName = '') {
  const safeDraft = typeof draft === 'string' ? draft : '';
  const trimmedName = (customerName || '').trim();
  const greetingTarget = trimmedName || 'Customer';
  const greeting = `Dear ${greetingTarget},`;

  const trimmedStart = safeDraft.trimStart();
  const leadingWhitespaceLength = safeDraft.length - trimmedStart.length;
  const preservedWhitespace =
    leadingWhitespaceLength > 0 ? safeDraft.slice(0, leadingWhitespaceLength) : '';

  let body = trimmedStart;
  if (trimmedStart.length > 0) {
    const [firstLine, ...rest] = trimmedStart.split(/\r?\n/);
    if (/^(dear|hello|hi)\b/i.test(firstLine)) {
      body = rest.join('\n').replace(/^\s*/, '');
    }
  }

  if (!body) {
    return `${greeting}\n\n`;
  }

  return `${preservedWhitespace}${greeting}\n\n${body}`;
}

