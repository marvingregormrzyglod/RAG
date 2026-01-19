// src/constants/customerTerms.js
// Central glossary describing which internal telecom identifiers should be rewritten
// before anything reaches the customer. Keeping the list in one place makes future
// additions safe because both backend utilities and UI layers can import the same
// canonical definitions without duplicating regex logic.

export const CUSTOMER_FRIENDLY_TERMS = [
  {
    // Engineers and billing teams insist on saying MSISDN, but customers only know this
    // value as their phone number. We capture both the singular and plural phrasing so
    // the translator can preserve grammar automatically.
    internal: 'MSISDN',
    customerFriendly: 'phone number',
    pluralFriendly: 'phone numbers',
    rationale:
      'MSISDN is shorthand for Mobile Station International Subscriber Directory Number. The acronym never appears in customer marketing copy so we always rewrite it.',
  },
];

export default CUSTOMER_FRIENDLY_TERMS;
