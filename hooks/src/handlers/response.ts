/**
 * Handler: post_cascade_response
 * Scans AI response for PII leaks (post-hoc, can't block).
 */

import { scanTextLocal, entitySummary, createLogger } from '../lib';
import type { WindsurfHookEvent } from '../types';

const logger = createLogger();

const CURSORIGNORE_BLOCKED = [
  /permission denied/i,
  /access is blocked/i,
  /excluded/i,
  /can't read.*\.env/i,
  /cannot read.*\.env/i,
  /blocked.*\.env/i,
];

export function handlePostCascadeResponse(event: WindsurfHookEvent): { block: false } {
  const text = event.tool_info?.response || '';
  if (!text) return { block: false };

  // Detect file access blocks from response text
  if (CURSORIGNORE_BLOCKED.some((p) => p.test(text))) {
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'post_cascade_response', action: 'data_blocked', reason: 'Raidu Firewall blocked sensitive file access', trajectoryId: event.trajectory_id });
    return { block: false };
  }

  // Scan for PII leaks
  const { entities } = scanTextLocal(text);
  if (entities.length > 0) {
    logger.incStat('piiFound', entities.length);
    logger.audit({ event: 'post_cascade_response', action: 'leak_in_response', entities: entitySummary(entities), trajectoryId: event.trajectory_id });
  }

  return { block: false };
}
