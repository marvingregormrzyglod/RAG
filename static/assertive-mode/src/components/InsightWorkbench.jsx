// static/hello-world/src/components/InsightWorkbench.jsx
// Step 2 workbench: display the AI summary, editable internal note, and the structured plan.
// The component is intentionally verbose so that future maintainers understand every UI decision.

import React, { useMemo } from 'react';

import CaseLoadingOverlay, { SHARED_FLAVOR_WORDS } from './CaseLoadingOverlay';

const RESPONSE_LOADING_MESSAGES = [
  'Loading',
  'Actions accepted',
  'Determining action outcomes',
  'Refreshing context',
  'Updating internal note',
  'Internal note complete',
  'Drafting response email',
  'Making adjustments',
  'Response email complete',
];

export default function InsightWorkbench({
  loading,
  analysis,
  caseStatus = 'new',
  internalNote,
  onInternalNoteChange,
  onBack,
  onProceed,
  customerSelections,
  onToggleCustomer,
  agentProgress,
  onToggleAgent,
  onAgentNotesChange,
  onReanalyze,
  canReanalyze = false,
  isReanalyzing = false,
  isGeneratingResponse = false,
}) {
  const plan = analysis.recommendationPlan || {};
  const customerSteps = plan.customerSteps || [];
  const agentSteps = plan.agentSteps || [];
  const knowledgeBaseArticles = analysis.knowledgeBaseArticles || [];
  const statusLabel = caseStatus === 'ongoing' ? 'Ongoing case' : 'New case';
  const statusStyle = caseStatus === 'ongoing' ? ongoingStatusStyle : newStatusStyle;
  const rankedPlanItems = useMemo(() => {
    const decoratedCustomers = customerSteps.map((step, index) => ({
      ...step,
      __type: 'customer',
      __rank: derivePlanRank(step, index + 1),
      __sequence: index,
    }));
    const decoratedAgents = agentSteps.map((step, index) => ({
      ...step,
      __type: 'internal',
      __rank: derivePlanRank(step, customerSteps.length + index + 1),
      __sequence: customerSteps.length + index,
    }));
    return [...decoratedCustomers, ...decoratedAgents].sort((a, b) => {
      if (a.__rank === b.__rank) {
        return a.__sequence - b.__sequence;
      }
      return a.__rank - b.__rank;
    });
  }, [customerSteps, agentSteps]);

  if (loading) {
    return (
      <section style={cardStyle}>
        <CaseLoadingOverlay
          active={loading}
          guidedMessages={RESPONSE_LOADING_MESSAGES}
          flavorWords={SHARED_FLAVOR_WORDS}
        />
      </section>
    );
  }

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <div>
          <div style={stepPillStyle}>Step 2</div>
          <div style={{ ...caseStatusBadgeStyle, ...statusStyle }}>{statusLabel}</div>
          <h2 style={sectionTitleStyle}>The ticket has been analyzed for you</h2>
          <p style={sectionLeadStyle}>
            Read the summary, update the internal note if needed, and decide which steps the
            customer must follow before we create the final response.
          </p>
        </div>
        <button onClick={onBack} style={secondaryButtonStyle} type="button">
          Start over
        </button>
      </div>

      <div style={contentStackStyle}>
        <article style={panelStyle}>
          <h3 style={panelTitleStyle}>Case summary</h3>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{analysis.summary}</p>
        </article>

        <article style={panelStyle}>
          <h3 style={panelTitleStyle}>Internal Note</h3>
          <p style={panelHelperStyle}>
            When making edits, please retain the pretty formatting.
          </p>
          <textarea
            value={internalNote}
            onChange={(event) => onInternalNoteChange(event.target.value)}
            style={internalNoteStyle}
          />
        </article>

        <article style={panelStyle}>
          <h3 style={panelTitleStyle}>Knowledge Base Context</h3>
          {knowledgeBaseArticles.length === 0 ? (
            <EmptyState message="No knowledge base matches were referenced." />
          ) : (
            <ul style={listStyle}>
              {knowledgeBaseArticles.map((article) => (
                <li key={article.title} style={listItemStyle}>
                  <strong>{article.title}</strong>
                  {article.link && (
                    <div style={{ marginTop: '4px' }}>
                      <a href={article.link} target="_blank" rel="noreferrer">
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
          <h3 style={panelTitleStyle}>Action plan</h3>
          <p style={panelHelperStyle}>
            Work from the top. Customer actions become part of the outbound reply, while internal actions are tasks you complete in our tooling. When you mark an internal action as done, add any quick findings so the next agent can see what happened.
          </p>

          {rankedPlanItems.length === 0 ? (
            <EmptyState message="The assistant did not provide a recommendation plan for this case." />
          ) : (
            <div style={planListStyle}>
              {rankedPlanItems.map((step, index) => {
                const isCustomerStep = step.__type === 'customer';
                const progress = agentProgress[step.id] || { completed: false, notes: '' };
                const isSelected = isCustomerStep
                  ? Boolean(customerSelections[step.id])
                  : Boolean(progress.completed);
                const notesValue = progress.notes || '';
                const planItemStyle = getPlanItemStyle(isCustomerStep, isSelected);

                return (
                  <div
                    key={`${step.__type}-${step.id}`}
                    style={{
                      ...planItemStyle,
                      ...(isCustomerStep ? planItemCustomerOffsetStyle : planItemInternalOffsetStyle),
                    }}
                  >
                    <div style={planItemHeaderStyle}>
                      <span
                        style={{
                          ...planBadgeStyle,
                          ...(isCustomerStep ? customerBadgeStyle : internalBadgeStyle),
                        }}
                      >
                        {isCustomerStep ? 'Customer action' : 'Internal action'}
                      </span>
                      <span style={planRankStyle}>Priority {String(index + 1).padStart(2, '0')}</span>
                    </div>

                    <label style={planItemContentStyle}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() =>
                          isCustomerStep ? onToggleCustomer(step.id) : onToggleAgent(step.id)
                        }
                        style={planCheckboxStyle}
                      />
                      <div>
                        <div style={planDescriptionStyle}>{step.description}</div>
                        {isCustomerStep && step.requiresCustomerConfirmation && (
                          <p style={planMetaStyle}>Customer confirmation required after completion.</p>
                        )}
                      </div>
                    </label>

                    {!isCustomerStep && isSelected && (
                      <textarea
                        value={notesValue}
                        placeholder="Share any helpful notes or tool output (optional)."
                        onChange={(event) => onAgentNotesChange(step.id, event.target.value)}
                        style={notesFieldStyle}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </div>

      <footer style={actionsRowStyle}>
        <button
          onClick={onReanalyze}
          disabled={!canReanalyze || loading}
          style={{
            ...reanalyzeButtonStyle,
            opacity: !canReanalyze || loading ? 0.5 : 1,
            cursor: !canReanalyze || loading ? 'not-allowed' : 'pointer',
          }}
          type="button"
        >
          {isReanalyzing ? 'Re-forging analysis…' : 'Re-forge analysis'}
        </button>
        <button
          onClick={onProceed}
          disabled={loading}
          style={{ ...primaryButtonStyle, opacity: loading ? 0.6 : 1 }}
          type="button"
        >
          {isGeneratingResponse ? 'Preparing final response…' : 'Generate response draft'}
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

const planListStyle = {
  marginTop: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const planItemBaseStyle = {
  borderRadius: '16px',
  padding: '20px',
  borderWidth: '1px',
  borderStyle: 'solid',
  transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
};

const planItemCustomerBaseStyle = {
  backgroundColor: '#E6FCFF',
  borderColor: '#79E2F2',
  boxShadow: '0 4px 12px rgba(0, 184, 217, 0.15)',
};

const planItemCustomerSelectedStyle = {
  backgroundColor: '#B3F5FF',
  borderColor: '#00B8D9',
  boxShadow: '0 6px 16px rgba(0, 184, 217, 0.35)',
};

const planItemInternalBaseStyle = {
  backgroundColor: '#F4F5F7',
  borderColor: '#C1C7D0',
  boxShadow: '0 4px 12px rgba(9, 30, 66, 0.15)',
  borderStyle: 'dashed',
};

const planItemInternalSelectedStyle = {
  backgroundColor: '#DFE1E6',
  borderColor: '#42526E',
  boxShadow: '0 6px 16px rgba(9, 30, 66, 0.35)',
  borderStyle: 'solid',
};

const planItemCustomerOffsetStyle = {
  marginLeft: '32px',
};

const planItemInternalOffsetStyle = {
  marginRight: '32px',
};

const planItemHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
  flexWrap: 'wrap',
  gap: '8px',
};

const planBadgeStyle = {
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const customerBadgeStyle = {
  backgroundColor: '#091E42',
  color: 'white',
};

const internalBadgeStyle = {
  backgroundColor: '#FF5630',
  color: 'white',
};

const planRankStyle = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#42526E',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const planItemContentStyle = {
  display: 'flex',
  gap: '16px',
  alignItems: 'flex-start',
  cursor: 'pointer',
};

const planCheckboxStyle = {
  width: '24px',
  height: '24px',
  accentColor: '#0052CC',
  cursor: 'pointer',
  marginTop: '4px',
};

const planDescriptionStyle = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#172B4D',
  lineHeight: 1.5,
};

const planMetaStyle = {
  ...panelHelperStyle,
  marginTop: '6px',
};

const notesFieldStyle = {
  width: '100%',
  minHeight: '110px',
  borderRadius: '12px',
  border: '1px solid #B3BAC5',
  padding: '12px',
  fontSize: '13px',
  resize: 'vertical',
  marginTop: '12px',
};

const listStyle = {
  listStyle: 'none',
  padding: 0,
  margin: '12px 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const listItemStyle = {
  padding: '12px',
  borderRadius: '12px',
  backgroundColor: '#F4F5F7',
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
  backgroundColor: '#36B37E',
  color: 'white',
  border: 'none',
  padding: '12px 28px',
  borderRadius: '999px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

const reanalyzeButtonStyle = {
  backgroundColor: '#F4F5F7',
  color: '#172B4D',
  border: '1px solid #C1C7D0',
  padding: '12px 24px',
  borderRadius: '999px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

function derivePlanRank(step, fallbackIndex) {
  if (!step || typeof step !== 'object') {
    return fallbackIndex;
  }
  if (typeof step.importance === 'number') {
    return step.importance;
  }
  if (typeof step.priority === 'number') {
    return step.priority;
  }
  if (typeof step.rank === 'number') {
    return step.rank;
  }
  return fallbackIndex;
}

function getPlanItemStyle(isCustomerStep, isSelected) {
  if (isCustomerStep) {
    return {
      ...planItemBaseStyle,
      ...(isSelected ? planItemCustomerSelectedStyle : planItemCustomerBaseStyle),
    };
  }
  return {
    ...planItemBaseStyle,
    ...(isSelected ? planItemInternalSelectedStyle : planItemInternalBaseStyle),
  };
}
