/**
 * Handlers: pre_run_command, post_run_command
 * Scan shell commands, block exfiltration, detect PII in output.
 */

import { scanText, scanTextLocal, formatEntities, entitySummary, isExfiltrationCommand, findSensitiveAccess, loadPolicy, createLogger, reportBlock, reportScanBlockIfUnrecorded, WINDSURF_EVENT } from '../lib';
import type { WindsurfHookEvent } from '../types';

const logger = createLogger();
const policy = loadPolicy();

export function handlePreRunCommand(event: WindsurfHookEvent): { block: boolean; message?: string } {
  const command = event.tool_info?.command_line || '';
  if (!command) return { block: false };

  logger.incStat('totalScans');

  // Check if command references sensitive files
  const hit = findSensitiveAccess({ command }, policy);
  if (hit) {
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'pre_run_command', action: 'blocked', command: command.slice(0, 500), reason: hit.message, trajectoryId: event.trajectory_id });
    reportBlock(event, {
      event: WINDSURF_EVENT.pre_run_command,
      kind: hit.kind,
      detector: 'local',
      tool: 'Shell',
      rule: hit.rule,
      fileName: hit.fileName,
    });
    return { block: true, message: `Raidu Firewall: ${hit.message}` };
  }

  // Scan for secrets in command
  const scan = scanText(command, undefined, logger.debug);
  const { entities } = scan;
  if (entities.length > 0) {
    logger.incStat('piiFound', entities.length);
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'pre_run_command', action: 'blocked', command: command.slice(0, 500), entities: entitySummary(entities), trajectoryId: event.trajectory_id });
    reportScanBlockIfUnrecorded(event, scan, { event: WINDSURF_EVENT.pre_run_command, tool: 'Shell' });
    return { block: true, message: `Raidu Firewall: Blocked command. Contains ${formatEntities(entities)}.` };
  }

  // Check exfiltration
  if (isExfiltrationCommand(command)) {
    logger.incStat('commandsBlocked');
    logger.audit({ event: 'pre_run_command', action: 'blocked', command: command.slice(0, 500), reason: 'data exfiltration', trajectoryId: event.trajectory_id });
    reportBlock(event, { event: WINDSURF_EVENT.pre_run_command, kind: 'exfiltration', detector: 'local', tool: 'Shell' });
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
