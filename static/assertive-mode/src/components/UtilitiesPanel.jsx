// static/hello-world/src/components/UtilitiesPanel.jsx
// Centralises administrative and diagnostic tooling in a compact floating panel.

import React, { useState } from 'react';

export default function UtilitiesPanel({
  visible,
  onClose,
  usageStats,
  onRefreshUsage,
  onWarmKnowledgeBase,
  serviceIndicator,
  debugInfo,
  executionLogs,
  isBusy,
  isWarming,
  instanceInfo,
  latestLlmCharacters,
  isRefreshingUsage,
  usageLastUpdated,
}) {
  if (!visible) {
    return null;
  }

  const [refreshHover, setRefreshHover] = useState(false);
  const [warmHover, setWarmHover] = useState(false);
  const [closeHover, setCloseHover] = useState(false);

  const indicator =
    serviceIndicator || {
      label: 'Status unavailable',
      background: '#F4F5F7',
      border: 'rgba(9, 30, 66, 0.2)',
      textColor: '#172B4D',
    };
  const formatNumber = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '0';
    }
    return value.toLocaleString();
  };
  // Helpers inside UI kit are limited, so we rely on Intl to keep the OpenAI spend readout consistent with USD reporting.
  const formatCurrency = (value, currency = 'USD') => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '$0.00';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  };
  const llmSummary = latestLlmCharacters
    ? {
        total: formatNumber(latestLlmCharacters.total),
        embedding: formatNumber(latestLlmCharacters.embedding),
        completion: formatNumber(latestLlmCharacters.completion),
        recordedAt: latestLlmCharacters.recordedAt
          ? new Date(latestLlmCharacters.recordedAt).toLocaleTimeString()
          : null,
      }
    : null;
  const vectorMeta = {
    vectorsLoaded:
      typeof instanceInfo?.vectorsInMemory === 'boolean'
        ? instanceInfo.vectorsInMemory
          ? 'Yes'
          : 'No'
        : 'Pending',
    loadedAt: instanceInfo?.loadedAt
      ? new Date(instanceInfo.loadedAt).toLocaleTimeString()
      : 'Pending',
    totalChunks: debugInfo?.totalChunks ?? 'Unknown',
    totalArticles: debugInfo?.totalArticles ?? 'Unknown',
  };

  return (
    <aside style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h3 style={{ margin: 0 }}>Utilities</h3>
        </div>
        <button
          onClick={onClose}
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => setCloseHover(false)}
          style={{
            ...closeButtonStyle,
            color: closeHover ? '#8B0000' : '#42526E',
          }}
          type="button"
        >
          Close
        </button>
      </div>

      <section style={sectionStyle}>
        <div style={sectionHeadingStyle}>
          <span>Vector Status</span>
          <span
            style={{
              ...statusBadgeStyle,
              backgroundColor: indicator.background,
              color: indicator.textColor,
              border: `1px solid ${indicator.border || 'transparent'}`,
            }}
          >
            {indicator.label}
          </span>
        </div>
        <p style={helperTextStyle}>
          Warm the knowledge base cache if the status indicator signals attention.
        </p>
        <button
          onClick={onWarmKnowledgeBase}
          onMouseEnter={() => setWarmHover(true)}
          onMouseLeave={() => setWarmHover(false)}
          title="Load the bundled embeddings into the current runtime cache"
          style={{
            ...primaryButtonStyle,
            backgroundColor: warmHover ? '#0B66FF' : '#0052CC',
            opacity: isBusy || isWarming ? 0.7 : 1,
            cursor: isBusy || isWarming ? 'wait' : 'pointer',
            transform: warmHover && !(isBusy || isWarming) ? 'translateY(-1px)' : 'none',
          }}
          type="button"
          disabled={isBusy || isWarming}
        >
          {isWarming ? 'Warming...' : isBusy ? 'Working...' : 'Warm knowledge base'}
        </button>
        {isWarming && (
          <p style={{ ...helperTextStyle, marginTop: '8px' }}>
            Hold tight - vector cache warming usually finishes within a minute.
          </p>
        )}
        <div style={vectorMetaCardStyle}>
          <div>
            <strong>Vectors loaded:</strong> {vectorMeta.vectorsLoaded}
          </div>
          <div>
            <strong>Loaded at:</strong> {vectorMeta.loadedAt}
          </div>
          <div>
            <strong>Total chunks:</strong> {vectorMeta.totalChunks}
          </div>
          <div>
            <strong>Total articles:</strong> {vectorMeta.totalArticles}
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeadingStyle}>
          <span>API usage</span>
          <button
            onClick={onRefreshUsage}
            onMouseEnter={() => setRefreshHover(true)}
            onMouseLeave={() => setRefreshHover(false)}
            disabled={isRefreshingUsage}
            title="Pull the latest OpenAI usage and cost estimates"
            style={{
              ...linkButtonStyle,
              color: refreshHover ? '#0B66FF' : '#0052CC',
              cursor: isRefreshingUsage ? 'wait' : 'pointer',
              opacity: isRefreshingUsage ? 0.6 : 1,
            }}
            type="button"
          >
            {isRefreshingUsage ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {isRefreshingUsage && (
          <p style={{ ...helperTextStyle, marginTop: '4px' }}>Refreshing usage data...</p>
        )}
        {usageStats ? (
          <div style={usageTotalsCardStyle}>
            <div style={usageTotalsItemStyle}>
              <span style={usageTotalsLabelStyle}>Calls</span>
              <strong>{formatNumber(usageStats.calls)}</strong>
            </div>
            <div style={usageTotalsItemStyle}>
              <span style={usageTotalsLabelStyle}>Cost</span>
              <strong>{formatCurrency(usageStats.cost)}</strong>
            </div>
            <div style={usageTotalsItemStyle}>
              <span style={usageTotalsLabelStyle}>Embeddings</span>
              <strong>{formatNumber(usageStats.embeddings)}</strong>
            </div>
            <div style={usageTotalsItemStyle}>
              <span style={usageTotalsLabelStyle}>Completions</span>
              <strong>{formatNumber(usageStats.completions)}</strong>
            </div>
          </div>
        ) : (
          <p style={helperTextStyle}>Usage metrics will appear after the first API call.</p>
        )}
        {!isRefreshingUsage && usageLastUpdated && (
          <p style={{ ...helperTextStyle, marginTop: '8px' }}>
            Last refreshed at {new Date(usageLastUpdated).toLocaleTimeString()}.
          </p>
        )}
        {usageStats && (
          <p style={{ ...helperTextStyle, marginTop: '12px' }}>
            Embeddings count every vectorization request we send for context gathering, while completions track the generated AI responses. Both figures feed into the calls counter and estimated USD cost shown above.
          </p>
        )}
        {llmSummary ? (
          <div style={llmCounterCardStyle}>
            <div style={llmCounterHeaderStyle}>Last LLM payload</div>
            <div style={llmCounterTotalStyle}>{llmSummary.total} characters</div>
            <div style={llmCounterMetaStyle}>
              Embedding: {llmSummary.embedding} | Completion: {llmSummary.completion}
            </div>
            {llmSummary.recordedAt && (
              <div style={llmCounterMetaStyle}>Captured at {llmSummary.recordedAt}</div>
            )}
          </div>
        ) : usageStats ? (
          <p style={{ ...helperTextStyle, marginTop: '12px' }}>
            Run an analysis to capture the latest LLM payload size.
          </p>
        ) : null}
      </section>
      <section style={sectionStyle}>
        <div style={sectionHeadingStyle}>
          <span>Execution logs</span>
        </div>
        {executionLogs && executionLogs.length > 0 ? (
          <div style={logContainerStyle}>
            {executionLogs.map((log, index) => (
              <details
                key={`${log.operation}-${index}`}
                open={index === 0 && log.hasError}
                style={logDetailStyle}
              >
                <summary style={logSummaryStyle}>
                  {log.operation} - {(log.duration / 1000).toFixed(2)}s
                  {log.hasError && <span style={{ color: '#BF2600', marginLeft: '8px' }}>Error</span>}
                </summary>
                {log.errorMessage && (
                  <div style={logLineStyle}>Error: {log.errorMessage}</div>
                )}
                {(log.logs || []).map((line, idx) => (
                  <div key={idx} style={logLineStyle}>
                    {line}
                  </div>
                ))}
              </details>
            ))}
          </div>
        ) : (
          <p style={helperTextStyle}>Execution history appears once a resolver runs.</p>
        )}
      </section>
    </aside>
  );
}

const panelStyle = {
  position: 'absolute',
  top: '80px',
  right: '0',
  width: '360px',
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: '24px',
  boxShadow: '0 18px 40px rgba(9, 30, 66, 0.18)',
  border: '1px solid rgba(9, 30, 66, 0.08)',
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const panelHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
};

const helperTextStyle = {
  color: '#5E6C84',
  fontSize: '13px',
  margin: '6px 0 0',
};

const closeButtonStyle = {
  backgroundColor: 'transparent',
  border: 'none',
  color: '#42526E',
  cursor: 'pointer',
  fontWeight: 600,
};

const sectionStyle = {
  borderTop: '1px solid rgba(9, 30, 66, 0.08)',
  paddingTop: '16px',
};

const sectionHeadingStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontWeight: 600,
};

const statusBadgeStyle = {
  borderRadius: '999px',
  padding: '4px 10px',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const primaryButtonStyle = {
  backgroundColor: '#0052CC',
  color: 'white',
  border: 'none',
  borderRadius: '999px',
  padding: '10px 20px',
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: '12px',
};

const vectorMetaCardStyle = {
  marginTop: '12px',
  padding: '12px',
  backgroundColor: '#F4F5F7',
  borderRadius: '12px',
  fontSize: '12px',
  color: '#5E6C84',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const linkButtonStyle = {
  backgroundColor: 'transparent',
  border: 'none',
  color: '#0052CC',
  cursor: 'pointer',
  fontWeight: 600,
};

const usageTotalsCardStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '12px',
  marginTop: '12px',
  fontSize: '13px',
};

const usageTotalsItemStyle = {
  backgroundColor: '#F4F5F7',
  borderRadius: '12px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontWeight: 600,
};

const usageTotalsLabelStyle = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#6B778C',
};

const llmCounterCardStyle = {
  marginTop: '16px',
  padding: '12px 16px',
  borderRadius: '12px',
  border: '1px solid rgba(9, 30, 66, 0.1)',
  backgroundColor: '#F7F8FA',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const llmCounterHeaderStyle = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#5E6C84',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const llmCounterTotalStyle = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#0747A6',
};

const llmCounterMetaStyle = {
  fontSize: '12px',
  color: '#42526E',
};

const logContainerStyle = {
  marginTop: '12px',
  maxHeight: '200px',
  overflowY: 'auto',
  borderRadius: '12px',
  backgroundColor: '#F4F5F7',
  padding: '8px',
};

const logDetailStyle = {
  marginBottom: '8px',
  backgroundColor: 'white',
  borderRadius: '8px',
  border: '1px solid rgba(9, 30, 66, 0.08)',
};

const logSummaryStyle = {
  padding: '8px 12px',
  fontWeight: 600,
  cursor: 'pointer',
};

const logLineStyle = {
  padding: '6px 12px',
  fontFamily: 'monospace',
  fontSize: '12px',
  borderTop: '1px solid rgba(9, 30, 66, 0.05)',
};
