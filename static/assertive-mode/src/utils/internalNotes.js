// static/hello-world/src/utils/internalNotes.js
// Shared helpers for parsing and maintaining internal note content.

const TROUBLESHOOTING_PLACEHOLDER_REGEX =
  /^\s*-\s*No prior troubleshooting performed, this is a new case\.\s*$/i;

export function cleanseTroubleshootingPlaceholder(note, agentSteps = []) {
  if (typeof note !== 'string' || !note) {
    return note;
  }

  if (!Array.isArray(agentSteps) || agentSteps.length === 0) {
    return note;
  }

  const hasProgress = agentSteps.some((step) => step && step.completed);
  if (!hasProgress) {
    return note;
  }

  if (!TROUBLESHOOTING_PLACEHOLDER_REGEX.test(note)) {
    return note;
  }

  const sanitizedLines = note
    .split('\n')
    .filter((line) => !TROUBLESHOOTING_PLACEHOLDER_REGEX.test(line));

  return sanitizedLines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function extractCustomerFirstNameFromNote(internalNote = '') {
  if (typeof internalNote !== 'string' || !internalNote) {
    return '';
  }

  const match = internalNote.match(/^\s*Name:\s*(.+)$/im);
  if (!match) {
    return '';
  }

  const sanitized = sanitizePersonName(match[1]);
  if (!sanitized) {
    return '';
  }

  const [firstName] = sanitized.split(/\s+/);
  return firstName || '';
}

function sanitizePersonName(input = '') {
  if (typeof input !== 'string') {
    return '';
  }

  const trimmed = input.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') {
    return '';
  }

  if (/^\[[^\]]+\]$/.test(trimmed)) {
    return '';
  }

  return trimmed.replace(/\s+/g, ' ').trim();
}
