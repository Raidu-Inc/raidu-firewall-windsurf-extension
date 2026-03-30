/**
 * Handlers: pre_run_command, post_run_command
 * Scan shell commands, block exfiltration, detect PII in output.
 */

import { scanText, scanTextLocal, formatEntities, entitySummary, isExfiltrationCommand, checkInputForSensitiveFiles, loadPolicy, createLogger } from '../lib';
import type { WindsurfHookEvent } from '../types';

const logger = createLogger();
const policy = loadPolicy();

export function handlePreRunCommand(event: WindsurfHookEvent): { block: boolean; message?: string } {
  const command = event.tool_info?.command_line || '';
  if (!command) return { block: false };

  logger.incStat('totalScans');

  // Check if command references sensitive files
  const fileHit = checkInputForSensitiveFiles({ command }, policy);
  if (fileHit) {
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'pre_run_command', action: 'blocked', command: command.slice(0, 500), reason: fileHit, trajectoryId: event.trajectory_id });
    return { block: true, message: `Raidu Firewall: ${fileHit}` };
  }

  // Scan for secrets in command
  const { entities } = scanText(command, undefined, logger.debug);
  if (entities.length > 0) {
    logger.incStat('piiFound', entities.length);
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'pre_run_command', action: 'blocked', command: command.slice(0, 500), entities: entitySummary(entities), trajectoryId: event.trajectory_id });
    return { block: true, message: `Raidu Firewall: Blocked command. Contains ${formatEntities(entities)}.` };
  }

  // Check exfiltration
  if (isExfiltrationCommand(command)) {
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'pre_run_command', action: 'blocked', command: command.slice(0, 500), reason: 'data exfiltration', trajectoryId: event.trajectory_id });
    return { block: true, message: 'Raidu Firewall: Blocked command. Data exfiltration pattern detected.' };
  }

  logger.audit({ event: 'pre_run_command', action: 'allowed', command: command.slice(0, 200), trajectoryId: event.trajectory_id });
  return { block: false };
}

export function handlePostRunCommand(event: WindsurfHookEvent): { block: false } {
  // post hooks can't block, just detect leaks
  const output = (event.tool_info as Record<string, unknown>)?.output as string || '';
  if (output) {
    const { entities } = scanTextLocal(output);
    if (entities.length > 0) {
      logger.incStat('piiFound', entities.length);
      logger.audit({ event: 'post_run_command', action: 'leak_detected', entities: entitySummary(entities), trajectoryId: event.trajectory_id });
    }
  }
  return { block: false };
}
