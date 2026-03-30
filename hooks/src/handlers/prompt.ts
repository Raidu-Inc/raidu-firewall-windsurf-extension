/**
 * Handler: pre_user_prompt
 * Scans prompt for PII via API + local fallback.
 */

import { scanText, formatEntities, redactText, copyToClipboard, entitySummary, createLogger } from '../lib';
import type { WindsurfHookEvent } from '../types';

const logger = createLogger();

export function handlePreUserPrompt(event: WindsurfHookEvent): { block: boolean; message?: string } {
  const prompt = event.tool_info?.user_prompt || '';
  if (!prompt) return { block: false };

  logger.incStat('totalScans');
  const result = scanText(prompt, undefined, logger.debug);

  if (result.entities.length > 0) {
    logger.incStat('piiFound', result.entities.length);
    logger.incStat('promptsBlocked');

    const safeVersion = result.sanitizedInput || redactText(prompt, result.entities);
    if (safeVersion !== prompt) copyToClipboard(safeVersion, logger.debug);

    logger.audit({
      event: 'pre_user_prompt',
      action: 'blocked',
      source: result.source,
      entities: entitySummary(result.entities),
      scanTimeMs: result.scanTimeMs,
      trajectoryId: event.trajectory_id,
    });

    return {
      block: true,
      message: `Raidu Firewall: Detected ${formatEntities(result.entities)} in your prompt. A compliant version is in your clipboard.`,
    };
  }

  logger.audit({ event: 'pre_user_prompt', action: 'allowed', scanTimeMs: result.scanTimeMs, trajectoryId: event.trajectory_id });
  return { block: false };
}
