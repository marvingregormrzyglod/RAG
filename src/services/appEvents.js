// src/services/appEvents.js
// Lightweight wrapper around Forge App Events publish API so handlers can emit updates without
// repeating boilerplate error handling.

import { appEvents } from '@forge/events';

const logResult = (result, key) => {
  if (!result) {
    return;
  }

  if (result.type === 'success') {
    if (Array.isArray(result.failedEvents) && result.failedEvents.length > 0) {
      console.warn(`[AppEvents] Some events failed for key "${key}"`, result.failedEvents);
    }
    return;
  }

  console.error(
    `[AppEvents] Failed to publish event "${key}" (${result.errorType}): ${result.errorMessage}`
  );
};

export const publishAppEvent = async (key) => {
  try {
    const result = await appEvents.publish({ key });
    logResult(result, key);
    return result;
  } catch (error) {
    console.error(`[AppEvents] Unexpected error publishing event "${key}"`, error);
    return null;
  }
};

