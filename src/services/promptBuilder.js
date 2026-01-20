// src/services/promptBuilder.js
// This creates Jira-ready prompts for customer facing output, and internal company notes.

export const INTERNAL_NOTE_TEMPLATE = `
============================================================

ISSUE OVERVIEW
------------------------------------------------------------
- [Describe each issue briefly on a new line, prefixed with a dash]


TROUBLESHOOTING STEPS
------------------------------------------------------------
- [Log entry 1: Describe what the customer already tried or what we already asked them to do]
- [Log entry 2]
- [Log entry 3]
[...]


CUSTOMER DETAILS
------------------------------------------------------------
Name:             [CUSTOMER_NAME]
Contact Email:    [CONTACT_EMAIL]
Account Email:    [ACCOUNT_EMAIL]


BILLING INFORMATION
------------------------------------------------------------
Payment ID:       [PAYMENT_ID]
Payment Date:     [PAYMENT_DATE]
Amount:           [AMOUNT]
Card Last 4:      [CARD_LAST4]

============================================================
`.trim();

const CORE_BRAND_CONTEXT = 'List your products and terminology here.';

const ROUTING_AND_POLICY_RULES = 'List your routing and escalation rules here.';

const WRITING_GUARDRAILS = `
Writing guardrails:
- Use "we" or "our" pronouns; never "I" or "me".
- Never include em dashes or any other long dash characters; rely on commas or periods.
- Never ask the agent or customer to upload screenshots as proof unless a human explicitly requested that (not the case here). Rely on text confirmations instead.
- Never promise or suggest generating payment receipts or invoices (Stripe or otherwise) or emailing them to the customer.
- Support agents may not impersonate customers or log into customer-owned accounts; they must describe the steps for the customer to complete.
- Rephrase every customer-facing step so it sounds friendly and conversational; do not quote KB content verbatim.
- TROUBLESHOOTING STEPS inside the internal note must log what we already advised or what the customer confirmed, not instructions for someone else.
- Treat any JSON context provided in these prompts as read-only background; never copy "Recommendation plan" objects, customer step arrays, or similar JSON into the internal note or customer email.`.trim();

// Data extraction reminders ensure the LLM consistently classifies identifiers and account metadata before formatting the internal note.
const DATA_EXTRACTION_RULES = `
General handling:
- Populate placeholders only when a source explicitly supplies the value; otherwise use "N/A" and mention missing data in the case summary.
- Keep all identifiers in ASCII, preserve the original casing, and obey the formatting rules below for dates, currency, and IDs.

Customer details:
- Contact Email is the address the customer used in their outreach (ticket, chat, email). Capture it verbatim.
- Account Email is the address stored on the customer's account profile (for example an Apple private relay). When both exist, explain the difference in the internal note summary.
- Customer Name should match the account or subscription owner referenced in the case; if multiple names appear, pick the one tied to the supplied subscription.

Billing information:
- Payment ID follows the Stripe 'pi_' pattern (example 'pi_3OhSgVBit3S5Oi9N02qJfUnh'). Copy it exactly.
- Payment Date must be rendered as 'Month DD, YYYY' (example 'February 8, 2024') regardless of the incoming format. Include timezone details in the narrative if the source mentions them.
- Amount should contain the numeric value plus currency (example '10.99 AUD'). Keep the decimal precision supplied by the billing system.
- Card Last 4 must be four digits only (example '8978'). If a longer fragment surfaces, redact everything except the last four digits.

Disambiguation:
- If a value is inferred or partially redacted, explain the assumption in the TROUBLESHOOTING STEPS or issue overview so future readers understand the provenance.`.trim();

const ASSERTIVE_FIELD_SCHEMA = `
Field taxonomy for assertive task inputs (map the "field" and "validator" to these identifiers):
- customer_name: Full name tied to the subscription owner. Accept letters, spaces, apostrophes.
- contact_email: Email supplied in the customer's outreach. Preserve casing.
- account_email: Email tied to the subscription account profile (Apple private relay, etc.).
- payment_id: Stripe transaction id starting with "pi_".
- payment_date: Render as "Month DD, YYYY".
- amount: Numeric + currency (e.g., "10.99 AUD").
- card_last4: Exactly four digits from the payment instrument.

Every expected input must reference one of the validators above so the UI can enforce formatting. Never request screenshots, uploads, or hyperlinks.`.trim();

const CUSTOMER_LANGUAGE_RULES = `
Customer-facing language rules:
- Avoid acronyms or identifiers or jargon in customer emails. Translate them into plain statements.
- Do not mention internal tools (Salesforce, Stripe portal names) in customer-facing text; describe only the outcome.
- Keep explanations short, warm, and free from system codes or raw identifiers unless the customer explicitly provided them first.`.trim();

const ASSERTIVE_TASK_RULES = `
Assertive workflow directives:
- The LLM is the authority. Never offer optional checklists or "choose your own action" phrasing.
- Break work into sequential tasks that explicitly name the internal tool.
- Only create a new task when it depends on data the agent must gather manually. Everything else should be reasoned out automatically by the model.
- Each task must explain why the data point is needed and how it feeds the resolution.
- Keep the queue short (3-6 tasks) and focus on highest-leverage actions.
- Tasks must never ask the agent to impersonate customers, upload files, or share screenshots. Request text confirmations only.
- Whenever a task collects a data point covered by DATA_EXTRACTION_RULES, remind the agent of the exact expected pattern.
- When a task depends on another, list its ids inside "blockedBy".
- After the agent provides all required values, the model will be re-invoked. Plan the queue so the second call has everything it needs to craft the final response.`.trim();

export function buildContextAnalysisPrompt(
  {
    companySummary,
    originalPortalRequest,
    conversationActivity,
    attachments,
    searchResults,
    caseStatus = 'new',
    agentFindings = [],
  },
  { allowOptionalNotes = false } = {}
) {
  const knowledgeBaseText = buildKnowledgeBaseSummary(searchResults);
  const attachmentSummary = buildAttachmentSummary(attachments);
  const agentFindingsSummary = buildAgentFindingsSummary(agentFindings);

  const isOngoing = caseStatus === 'ongoing';
  const conversationSection =
    conversationActivity && conversationActivity.trim().length > 0
      ? conversationActivity
      : 'None. This is the very first customer message.';
  const caseDescriptor = isOngoing
    ? 'Ongoing case (customer has already been answered).'
    : 'New case (first response required).';

  // Keep the structured plan/context JSON visible to the model for traceability,
  // but the WRITING_GUARDRAILS section explicitly forbids copying those blocks into outputs.
  const optionalNoteGuidance = allowOptionalNotes
    ? 'After completing the template block you may append a section titled "OPTIONAL NOTES" which contains scratchpad bullets for temporary reasoning. Keep it short, factual, and clearly separate from the template so future agents can delete it when no longer needed.'
    : 'Do not add any text before or after the template block.';

  return `
You are assisting a customer support agent. Always work in plain ASCII text.

Company summary:
${companySummary}

Essential product and policy context (apply even if company summary is empty):
${CORE_BRAND_CONTEXT}

Routing and escalation rules:
${ROUTING_AND_POLICY_RULES}

Writing guardrails that must always be respected:
${WRITING_GUARDRAILS}

Structured data extraction rules for the internal note fields:
${DATA_EXTRACTION_RULES}

Original portal request:
${originalPortalRequest}

Case status: ${caseDescriptor}

Conversation history (entries separated by "Edit" and "Delete"; "Internal note" entries are private to the agent):
${conversationSection}

Attachments:
${attachmentSummary || 'No attachments were provided.'}

Agent-confirmed findings since the previous analysis (treat these as factual observations):
${agentFindingsSummary}

Knowledge base matches:
${knowledgeBaseText}

Your goals:
0. Determine and state the exact product or partner classification and mention the evidence used.
1. Understand what the customer needs and where the ticket stands today.
2. Produce a concise case summary (plain text, single paragraph).
3. Generate an internal note that follows this template exactly (ASCII only, keep spacing intact). Reproduce every heading, divider line, colon alignment, and placeholder label exactly as shown (ISSUE OVERVIEW, TROUBLESHOOTING STEPS, CUSTOMER DETAILS, etc.). ${allowOptionalNotes ? 'Once the template text is complete, you may append an "OPTIONAL NOTES" section if you need temporary scratchpad bullets.' : ''}
${INTERNAL_NOTE_TEMPLATE}
4. Produce a recommendation plan that includes:
   - customerSteps: array of objects { "id": string, "description": string, "includeInEmailByDefault": boolean }
   - agentSteps: array of objects { "id": string, "description": string }
   - toolSuggestions: array of objects { "tool": string, "purpose": string }
5. Return the knowledge base snippets that influenced your recommendations in knowledgeBaseArticles.
   Each article object must be { "title": string, "link": string, "contentSnippet": string }.

Output MUST be a JSON object with this exact shape:
{
  "summary": "...",
  "internalNote": "...",
  "recommendationPlan": {
    "customerSteps": [],
    "agentSteps": [],
    "toolSuggestions": []
  },
  "knowledgeBaseArticles": []
}

`;
}

export function buildAssertiveTaskPrompt({
  companySummary,
  originalPortalRequest,
  conversationActivity,
  attachments,
  searchResults,
  caseStatus = 'new',
  agentFindings = [],
}) {
  const knowledgeBaseText = buildKnowledgeBaseSummary(searchResults);
  const attachmentSummary = buildAttachmentSummary(attachments);
  const agentFindingsSummary = buildAgentFindingsSummary(agentFindings);
  const isOngoing = caseStatus === 'ongoing';
  const conversationSection =
    conversationActivity && conversationActivity.trim().length > 0
      ? conversationActivity
      : 'None. This is the very first customer message.';
  const caseDescriptor = isOngoing
    ? 'Ongoing case (customer has already been answered).'
    : 'New case (first response required).';

  return `
You are the assertive support orchestrator. Always respond in ASCII.

Company summary:
${companySummary}

Essential product and policy context:
${CORE_BRAND_CONTEXT}

Routing and escalation rules that must always be enforced:
${ROUTING_AND_POLICY_RULES}

Writing and logging guardrails:
${WRITING_GUARDRAILS}

Structured data extraction rules for internal note fields:
${DATA_EXTRACTION_RULES}

Assertive task construction guidance:
${ASSERTIVE_TASK_RULES}

Field taxonomy for validating human-provided inputs:
${ASSERTIVE_FIELD_SCHEMA}

Customer-facing language reminders (apply when drafting summaries and customer steps later in the workflow):
${CUSTOMER_LANGUAGE_RULES}

Original portal request:
${originalPortalRequest}

Case status: ${caseDescriptor}

Conversation history (entries separated by "Edit" and "Delete"; "Internal note" entries are private):
${conversationSection}

Attachments:
${attachmentSummary || 'No attachments were provided.'}

Agent findings supplied since the last analysis:
${agentFindingsSummary}
Agent findings list the internal tasks already completed (id, description, notes). Treat them as authoritative and do not recreate those tasks unless new evidence contradicts the earlier result.

Knowledge base matches:
${knowledgeBaseText}


`.trim();
}

export function buildFinalResponsePrompt(
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
    caseStatus = 'new',
    agentName = '',
    customerName = '',
  },
  { allowOptionalNotes = false } = {}
) {
  const attachmentSummary = buildAttachmentSummary(attachments);
  const knowledgeBaseText = buildKnowledgeBaseSummary(knowledgeBaseArticles);
  const trimmedAgentName = (agentName || '').trim();
  // Agent signatures should feel personal, so only use the provided agent name without a team fallback.
  const signatureName = trimmedAgentName.length > 0 ? trimmedAgentName : '';
  const greetingName = deriveCustomerFirstName(customerName, internalNote);
  const greetingTarget = greetingName || 'Customer';
  const expectedGreeting = `Dear ${greetingTarget},`;

  const isOngoing = caseStatus === 'ongoing';
  const conversationSection =
    conversationActivity && conversationActivity.trim().length > 0
      ? conversationActivity
      : 'None. This reply will be the first response to the customer.';
  const greetingInstruction = [
    `- Always open with "${expectedGreeting}" (use "Dear Customer," if no verified name is available).`,
    isOngoing
      ? '- Do not include a "Thank you for contacting our Support Team." line at the beginning.'
      : '- Immediately follow the greeting with "Thank you for contacting our Support Team."',
    '- Never start the customer email with "Hello" or "Hi".',
  ].join('\n   ');
  const caseDescriptor = isOngoing
    ? 'Ongoing case (customer has already received responses).'
    : 'New case (first response required).';

  return `
You are assisting a consumer support agent with the final pass on a ticket.
Always use plain ASCII text. Do not output Markdown or emojis.

Company summary:
${companySummary}

Essential product and policy context (apply even if company summary is empty):
${CORE_BRAND_CONTEXT}

Routing and escalation rules:
${ROUTING_AND_POLICY_RULES}

Writing guardrails that must always be respected:
${WRITING_GUARDRAILS}

Structured data extraction rules for the internal note fields:
${DATA_EXTRACTION_RULES}

Customer language guardrails (apply to every word of the final email):
${CUSTOMER_LANGUAGE_RULES}

Original portal request:
${originalPortalRequest}

Case status: ${caseDescriptor}

Conversation history (entries separated by "Edit" and "Delete"; "Internal note" entries are private):
${conversationSection}

Attachments:
${attachmentSummary || 'No attachments were provided.'}

Current case summary:
${summary}

Internal note (agent may have edited since the last call). Ensure the template stays intact:
${internalNote}

Recommendation plan (as originally proposed):
${JSON.stringify(recommendationPlan, null, 2)}

Customer steps selected for inclusion in the email:
${JSON.stringify(selectedCustomerSteps, null, 2)}

Internal actions marked as complete (with notes where supplied):
${JSON.stringify(agentStepResults, null, 2)}

Knowledge base context that must inform the response:
${knowledgeBaseText}

The JSON context above is reference only. Never copy or append those JSON objects or their headings into the refreshed internal note or the customer email; summarise the relevant details instead.

Deliverables:
1. emailDraft - a complete customer email that:
   - references only the customer steps where includeInEmail is true
   - acknowledges any completed agent actions where relevant to the customer
   - adopts a professional, empathetic tone
   ${greetingInstruction}
   - ends with "Best regards,\\n\\n${signatureName}"
   - clearly communicates any required decline or escalation dictated by the routing rules using "we" language.
2. internalNote - refreshed internal note after considering new evidence, still following the template exactly (same headings, dividers, and column alignment) and logging troubleshooting progress rather than future instructions.${allowOptionalNotes ? ' After the template block you may append an OPTIONAL NOTES section for temporary scratchpad bullets if necessary.' : ''}

Output MUST be JSON shaped as:
{
  "emailDraft": "...",
  "internalNote": "..."
}
`;
}

function deriveCustomerFirstName(explicitCustomerName, internalNote) {
  const sanitizedExplicit = sanitizePersonName(explicitCustomerName);
  if (sanitizedExplicit) {
    return sanitizedExplicit.split(/\s+/)[0] || '';
  }

  const extracted = extractCustomerNameFromInternalNote(internalNote);
  if (extracted) {
    return extracted.split(/\s+/)[0] || '';
  }

  return '';
}

function extractCustomerNameFromInternalNote(internalNote = '') {
  if (typeof internalNote !== 'string' || !internalNote) {
    return '';
  }

  const match = internalNote.match(/^\s*Name:\s*(.+)$/im);
  if (!match) {
    return '';
  }

  return sanitizePersonName(match[1]);
}

function sanitizePersonName(name = '') {
  if (typeof name !== 'string') {
    return '';
  }

  const trimmed = name.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') {
    return '';
  }

  if (/^\[[^\]]+\]$/.test(trimmed)) {
    return '';
  }

  return trimmed.replace(/\s+/g, ' ').trim();
}

function buildKnowledgeBaseSummary(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return 'No knowledge base context was provided.';
  }

  return results
    .map((entry, index) => {
      const title = entry.title || entry.metadata?.title || `Article ${index + 1}`;
      const link = entry.link || entry.metadata?.link || 'Not provided';
      const content =
        entry.content ||
        entry.contentSnippet ||
        entry.metadata?.content ||
        'No extract provided.';
      return `Title: ${title}\nLink: ${link}\nContent: ${content}`;
    })
    .join('\n\n---\n\n');
}

function buildAttachmentSummary(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return '';
  }

  return attachments
    .map((file, index) => {
      return `Attachment ${index + 1}: ${file.name || 'Unnamed'} (${file.type || 'Unknown type'}) - base64 preview: ${
        file.data || ''
      }`;
    })
    .join('\n');
}

function buildAgentFindingsSummary(agentFindings = []) {
  if (!Array.isArray(agentFindings) || agentFindings.length === 0) {
    return 'None provided. Assume only the original intake context is available.';
  }

  return agentFindings
    .map((finding, index) => {
      const description = finding.description || `Agent step ${index + 1}`;
      const notes = finding.notes ? finding.notes.trim() : '';
      const normalizedNotes = notes.length > 0 ? notes : 'No additional notes were supplied.';
      return `${index + 1}. ${description}\n   Notes: ${normalizedNotes}`;
    })
    .join('\n');
}

