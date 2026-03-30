/**
 * Handlers: pre_mcp_tool_use, post_mcp_tool_use
 */

import { scanText, formatEntities, entitySummary, createLogger } from '../lib';
import type { WindsurfHookEvent } from '../types';

const logger = createLogger();

export function handlePreMCPToolUse(event: WindsurfHookEvent): { block: boolean; message?: string } {
  const input = JSON.stringify(event.tool_info?.mcp_tool_arguments || '');
  const { entities } = scanText(input, undefined, logger.debug);

  if (entities.length > 0) {
    logger.incStat('commandsBlocked');
    const toolName = `${event.tool_info?.mcp_server_name}:${event.tool_info?.mcp_tool_name}`;
    logger.audit({ event: 'pre_mcp_tool_use', action: 'blocked', tool: toolName, entities: entitySummary(entities), trajectoryId: event.trajectory_id });
    return { block: true, message: `Raidu Firewall: Blocked MCP tool ${toolName}. Input contains ${formatEntities(entities)}.` };
  }

  return { block: false };
}

export function handlePostMCPToolUse(event: WindsurfHookEvent): { block: false } {
  logger.audit({ event: 'post_mcp_tool_use', action: 'logged', trajectoryId: event.trajectory_id });
  return { block: false };
}
