// static/assertive-mode/src/constants/dataFields.js
// Centralises the validation hints used by the assertive workflow so every task input mirrors
// the DATA_EXTRACTION_RULES enforced in the LLM prompt.

const emailPattern =
  /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const guidPattern =
  /^[A-F0-9]{8}-?[A-F0-9]{4}-?[A-F0-9]{4}-?[A-F0-9]{4}-?[A-F0-9]{12}$/i;

const makeRegexRule = (regex) => (value) => regex.test(value);

export const DATA_FIELD_RULES = {
  customer_name: {
    label: 'Customer name',
    helper: 'Match the subscription owner exactly. Letters, spaces, apostrophes only.',
    example: 'Alex Smith',
    validate: makeRegexRule(/^[A-Za-z.'\-\s]{2,}$/),
    normalise: (value) => value.replace(/\s+/g, ' ').trim(),
  },
  contact_email: {
    label: 'Contact email',
    helper: 'Email supplied by the customer (ticket/chat/email).',
    example: 'traveler@example.com',
    validate: (value) => emailPattern.test(value),
    normalise: (value) => value.trim(),
  },
  account_email: {
    label: 'Account email',
    helper: 'Email stored on the subscription profile (Apple relay, etc.).',
    example: 'user@privaterelay.appleid.com',
    validate: (value) => emailPattern.test(value),
    normalise: (value) => value.trim(),
  },
  payment_id: {
    label: 'Stripe payment ID',
    helper: 'Stripe payments start with "pi_".',
    example: 'pi_3OhSgVBit3S5Oi9N02qJfUnh',
    validate: makeRegexRule(/^pi_[A-Za-z0-9]+$/),
    normalise: (value) => value.trim(),
  },
  payment_date: {
    label: 'Payment date',
    helper: 'Render as "Month DD, YYYY".',
    example: 'February 8, 2024',
    validate: makeRegexRule(/^[A-Za-z]+\s\d{1,2},\s\d{4}$/),
    normalise: (value) => value.trim(),
  },
  amount: {
    label: 'Amount',
    helper: 'Include the numeric value and ISO currency (e.g., 10.99 AUD).',
    example: '29.99 USD',
    validate: makeRegexRule(/^\d+(\.\d{1,2})?\s?[A-Z]{3}$/),
    normalise: (value) => value.trim().toUpperCase(),
  },
  card_last4: {
    label: 'Card last 4',
    helper: 'Exactly four digits from the payment method.',
    example: '8978',
    validate: makeRegexRule(/^\d{4}$/),
    normalise: (value) => value.trim(),
  },
};

export const getFieldRule = (fieldKey) => DATA_FIELD_RULES[fieldKey];

export const validateFieldValue = (fieldKey, value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return 'This field is required.';
  }
  const rule = getFieldRule(fieldKey);
  if (rule?.validate && !rule.validate(trimmed)) {
    return rule.error || `Value does not match the expected format for ${rule.label || fieldKey}.`;
  }
  return null;
};

export const normaliseFieldValue = (fieldKey, value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const rule = getFieldRule(fieldKey);
  if (rule?.normalise) {
    return rule.normalise(trimmed);
  }
  return trimmed;
};

