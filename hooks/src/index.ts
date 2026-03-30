/**
 * Raidu Firewall Hook for Windsurf
 *
 * Reads Windsurf hook event JSON from stdin, dispatches to handlers.
 * Exit code 0 = allow, exit code 2 = block (pre_ hooks only).
 */

import { createLogger } from './lib';
import type { WindsurfHookEvent } from './types';
import { handlePreUserPrompt } from './handlers/prompt';
import { handlePreReadCode, handlePreWriteCode, handlePostWriteCode } from './handlers/file';
import { handlePreRunCommand, handlePostRunCommand } from './handlers/command';
import { handlePreMCPToolUse, handlePostMCPToolUse } from './handlers/mcp';
import { handlePostCascadeResponse } from './handlers/response';

const MAX_STDIN = 1_048_576;
const logger = createLogger();

type HandlerResult = { block: boolean; message?: string };

const handlers: Record<string, (event: WindsurfHookEvent) => HandlerResult> = {
  pre_user_prompt: handlePreUserPrompt,
  pre_read_code: handlePreReadCode,
  pre_write_code: handlePreWriteCode,
  post_write_code: handlePostWriteCode,
  pre_run_command: handlePreRunCommand,
  post_run_command: handlePostRunCommand,
  pre_mcp_tool_use: handlePreMCPToolUse,
  post_mcp_tool_use: handlePostMCPToolUse,
  post_cascade_response: handlePostCascadeResponse,
};

async function main(): Promise<void> {
  let input = '';
  let bytes = 0;

  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_STDIN) {
      logger.debug(`REJECTED: stdin exceeded ${MAX_STDIN} bytes`);
      process.stdout.write('{}');
      return;
    }
    input += chunk;
  }

  if (!input.trim()) { process.stdout.write('{}'); return; }

  let event: WindsurfHookEvent;
  try { event = JSON.parse(input.trim()); }
  catch { process.stdout.write('{}'); return; }

  const hookName = event.agent_action_name;
  logger.debug(`${hookName} | ${bytes}B`);

  let result: HandlerResult = { block: false };
  try {
    const handler = handlers[hookName];
    if (handler) result = handler(event);
    else logger.debug(`unhandled: ${hookName}`);
  } catch (err: unknown) {
    logger.debug(`ERR ${hookName}: ${(err as Error).message?.slice(0, 100)}`);
  }

  if (result.block) {
    process.stdout.write(result.message || 'Blocked by Raidu Firewall');
    process.exit(2);
  }

  process.stdout.write('{}');
}

main();
