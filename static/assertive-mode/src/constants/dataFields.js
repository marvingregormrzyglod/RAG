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
  subscription_id: {
    label: 'Subscription ID',
    helper: 'Apple Watch subscriptions use S-#######. All others are numeric identifiers (8-12 digits).',
    example: 'S-6652385',
    validate: makeRegexRule(/^(S-\d{6,}|[0-9]{8,14})$/),
    normalise: (value) => value.replace(/\s+/g, '').toUpperCase(),
  },
  payment_id: {
    label: 'Stripe payment ID',
    helper: 'Stripe payments start with "pi_".',
    example: 'pi_3OhSgVBit3S5Oi9N02qJfUnh',
    validate: makeRegexRule(/^pi_[A-Za-z0-9]+$/),
    normalise: (value) => value.trim(),
  },
  correlation_id: {
    label: 'Correlation ID',
    helper: 'Trace, GUID, or reference code from internal tooling.',
    example: '4f8c2d53-7a41-4ea5-ae1c-897b8b0e9b0f',
    validate: (value) => guidPattern.test(value) || /^[A-Za-z0-9._-]{6,}$/.test(value),
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
  eid: {
    label: 'EID',
    helper: '32 digits starting with 8904. Remove spaces and dashes.',
    example: '89049032007108882600155708439609',
    validate: makeRegexRule(/^8904\d{28}$/),
    normalise: (value) => value.replace(/\D/g, ''),
  },
  iccid: {
    label: 'ICCID',
    helper: '19 digits starting with 8944.',
    example: '8944472600003345367',
    validate: makeRegexRule(/^8944\d{15}$/),
    normalise: (value) => value.replace(/\D/g, ''),
  },
  msisdn: {
    label: 'MSISDN',
    helper: 'International phone number with country code (10-12 digits).',
    example: '61485916067',
    validate: makeRegexRule(/^\d{10,12}$/),
    normalise: (value) => value.replace(/\s+/g, ''),
  },
  imsi: {
    label: 'IMSI',
    helper: '15-digit value (first 3 = MCC, next 2 = MNC).',
    example: '262420140403017',
    validate: makeRegexRule(/^\d{15}$/),
    normalise: (value) => value.replace(/\D/g, ''),
  },
  imsi_type: {
    label: 'IMSI type',
    helper: 'Two-letter ISO country abbreviation tied to the IMSI.',
    example: 'DE',
    validate: makeRegexRule(/^[A-Z]{2}$/),
    normalise: (value) => value.trim().toUpperCase(),
  },
  country: {
    label: 'Country',
    helper: 'Full country name from telemetry.',
    example: 'Germany',
    validate: makeRegexRule(/^[A-Za-z\s]{2,}$/),
    normalise: (value) => value.replace(/\s+/g, ' ').trim(),
  },
  network: {
    label: 'Network',
    helper: 'Carrier name as shown in Grafana.',
    example: 'Vodafone',
    validate: (value) => value.trim().length >= 2,
    normalise: (value) => value.replace(/\s+/g, ' ').trim(),
  },
  tadig: {
    label: 'TADIG',
    helper: 'Five-character code [A-Z]{3}[A-Z0-9]{2}.',
    example: 'DEUD2',
    validate: makeRegexRule(/^[A-Z]{3}[A-Z0-9]{2}$/),
    normalise: (value) => value.trim().toUpperCase(),
  },
  mcc: {
    label: 'MCC',
    helper: 'Three-digit mobile country code. Keep leading zeros.',
    example: '262',
    validate: makeRegexRule(/^\d{3}$/),
    normalise: (value) => value.trim(),
  },
  mnc: {
    label: 'MNC',
    helper: 'Two-digit (sometimes three) mobile network code.',
    example: '02',
    validate: makeRegexRule(/^\d{2,3}$/),
    normalise: (value) => value.trim(),
  },
  lu_date_4g: {
    label: 'LU date (4G)',
    helper: 'Timestamp from Grafana representing the last 4G location update.',
    example: '2024-05-11T08:45:00Z',
    validate: (value) => value.trim().length > 5,
    normalise: (value) => value.trim(),
  },
  lu_date_voice: {
    label: 'LU date (Voice)',
    helper: 'Timestamp from Grafana representing the last voice location update.',
    example: '2024-05-11T08:45:00Z',
    validate: (value) => value.trim().length > 5,
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
