// src/handlers/cleanupJobs.js
// Scheduled trigger handler that trims completed/failed job records after their retention window
// expires. This keeps Forge Storage tidy and avoids leaving background responses behind forever.

import { deleteJobRecord, listExpiredJobs } from '../services/jobStore';

export const run = async () => {
  const expiredJobs = await listExpiredJobs();

  if (!expiredJobs.length) {
    return {
      success: true,
      pruned: 0,
      message: 'No expired jobs to delete.',
    };
  }

  let deleted = 0;
  for (const job of expiredJobs) {
    await deleteJobRecord(job.jobId);
    deleted += 1;
  }

  return {
    success: true,
    pruned: deleted,
    message: `Removed ${deleted} expired job${deleted === 1 ? '' : 's'} from storage.`,
  };
};
