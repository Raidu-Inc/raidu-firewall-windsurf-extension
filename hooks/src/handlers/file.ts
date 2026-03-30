/**
 * Handlers: pre_read_code, pre_write_code, post_write_code
 * Block sensitive file access by name pattern.
 */

import { isSensitiveFile, loadPolicy, createLogger, scanTextLocal, entitySummary } from '../lib';
import type { WindsurfHookEvent } from '../types';

const logger = createLogger();
const policy = loadPolicy(undefined, process.env.ROOT_WORKSPACE_PATH);

export function handlePreReadCode(event: WindsurfHookEvent): { block: boolean; message?: string } {
  const filePath = event.tool_info?.file_path || '';
  const hit = isSensitiveFile(filePath, policy);

  if (hit) {
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'pre_read_code', action: 'blocked', filePath, reason: hit, trajectoryId: event.trajectory_id });
    return { block: true, message: `Raidu Firewall: Blocked reading ${filePath.split('/').pop()} (policy: ${hit}).` };
  }

  logger.audit({ event: 'pre_read_code', action: 'allowed', filePath, trajectoryId: event.trajectory_id });
  return { block: false };
}

export function handlePreWriteCode(event: WindsurfHookEvent): { block: boolean; message?: string } {
  const filePath = event.tool_info?.file_path || '';
  const hit = isSensitiveFile(filePath, policy);

  if (hit) {
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'pre_write_code', action: 'blocked', filePath, reason: hit, trajectoryId: event.trajectory_id });
    return { block: true, message: `Raidu Firewall: Blocked writing to ${filePath.split('/').pop()} (policy: ${hit}).` };
  }

  return { block: false };
}

export function handlePostWriteCode(event: WindsurfHookEvent): { block: false } {
  const edits = event.tool_info?.edits || [];
  const leaked: Array<{ type: string; score: number }> = [];

  for (const edit of edits) {
    if (edit.new_string) {
      leaked.push(...entitySummary(scanTextLocal(edit.new_string).entities));
    }
  }

  if (leaked.length > 0) {
    logger.incStat('secretsFound', leaked.length);
    logger.audit({ event: 'post_write_code', action: 'secret_written', filePath: event.tool_info?.file_path, entities: leaked, trajectoryId: event.trajectory_id });
  }

  return { block: false };
}
