// src/services/termTranslator.js
// Utility that rewrites internal telecom jargon into customer-friendly wording.
// Only the customer-facing Step 3 email needs this sanitisation right now, but
// centralising the logic keeps the Forge resolver, webhook, and UI layers aligned.

import { CUSTOMER_FRIENDLY_TERMS } from '../constants/customerTerms';

const escapeRegex = (literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compiledTerms = (CUSTOMER_FRIENDLY_TERMS || [])
  .filter(
    (entry) =>
      entry &&
      typeof entry.internal === 'string' &&
      entry.internal.trim().length > 0 &&
      typeof entry.customerFriendly === 'string' &&
      entry.customerFriendly.trim().length > 0
  )
  .map((entry) => {
    const internal = entry.internal.trim();
    const singular = entry.customerFriendly.trim();
    const plural =
      typeof entry.pluralFriendly === 'string' && entry.pluralFriendly.trim().length > 0
        ? entry.pluralFriendly.trim()
        : `${singular}s`;

    // Most telecom abbreviations pluralise with a trailing "s" (MSISDN -> MSISDNs),
    // so the regex simply makes that suffix optional. We anchor the match with
    // word boundaries to avoid replacing unrelated substrings (e.g., "CMSISDN").
    const pattern = new RegExp(`\\b${escapeRegex(internal)}s?\\b`, 'gi');

    return {
      pattern,
      apply: (match) => {
        const isPlural = /s$/i.test(match);
        return isPlural ? plural : singular;
      },
    };
  });

/**
 * Replaces any internal shorthand with its customer-friendly equivalent.
 * The function is deliberately defensive so it can be called on every
 * outbound email draft without worrying about undefined values.
 *
 * @param {string} candidateText - Raw email body returned by the LLM.
 * @returns {string} Sanitised text safe for customer delivery.
 */
export function translateTerms(candidateText) {
  if (typeof candidateText !== 'string' || candidateText.length === 0) {
    return typeof candidateText === 'string' ? candidateText : '';
  }

  if (compiledTerms.length === 0) {
    return candidateText;
  }

  return compiledTerms.reduce(
    (output, term) => output.replace(term.pattern, (match) => term.apply(match)),
    candidateText
  );
}

export default translateTerms;
