/**
 * Installs Raidu hooks into ~/.codeium/windsurf/hooks.json on activation.
 * Removes on deactivation/uninstall.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const WINDSURF_HOOKS_FILE = path.join(os.homedir(), '.codeium', 'windsurf', 'hooks.json');
const RAIDU_MARKER = '__raidu_managed';

const ALL_HOOK_EVENTS = [
  'pre_user_prompt',
  'pre_read_code',
  'post_read_code',
  'pre_write_code',
  'post_write_code',
  'pre_run_command',
  'post_run_command',
  'pre_mcp_tool_use',
  'post_mcp_tool_use',
  'post_cascade_response',
];

interface HooksConfig {
  hooks: Record<string, Array<{ command: string; show_output: boolean; [key: string]: unknown }>>;
}

export function installHooks(extensionPath: string): void {
  const hookBinary = path.join(extensionPath, 'hooks', 'dist', 'index.js');
  if (!fs.existsSync(hookBinary)) {
    console.warn(`Raidu: Hook binary not found at ${hookBinary}`);
    return;
  }

  const command = `node ${hookBinary}`;

  let config: HooksConfig = { hooks: {} };
  try {
    if (fs.existsSync(WINDSURF_HOOKS_FILE)) {
      config = JSON.parse(fs.readFileSync(WINDSURF_HOOKS_FILE, 'utf-8'));
    }
  } catch {
    config = { hooks: {} };
  }

  for (const event of ALL_HOOK_EVENTS) {
    if (!config.hooks[event]) config.hooks[event] = [];
    config.hooks[event] = config.hooks[event].filter(
      (h) => !h[RAIDU_MARKER] && !h.command.includes('raidu'),
    );
    config.hooks[event].push({
      command,
      show_output: false,
      [RAIDU_MARKER]: true,
    });
  }

  try {
    fs.mkdirSync(path.dirname(WINDSURF_HOOKS_FILE), { recursive: true });
    fs.writeFileSync(WINDSURF_HOOKS_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  } catch (err) {
    console.warn(`Raidu: Failed to write hooks: ${err}`);
  }
}

export function removeHooks(): void {
  if (!fs.existsSync(WINDSURF_HOOKS_FILE)) return;

  try {
    const config: HooksConfig = JSON.parse(fs.readFileSync(WINDSURF_HOOKS_FILE, 'utf-8'));
    let hasOther = false;

    for (const event of Object.keys(config.hooks)) {
      config.hooks[event] = config.hooks[event].filter(
        (h) => !h[RAIDU_MARKER] && !h.command.includes('raidu'),
      );
      if (config.hooks[event].length > 0) hasOther = true;
      else delete config.hooks[event];
    }

    if (hasOther) {
      fs.writeFileSync(WINDSURF_HOOKS_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
    } else {
      fs.unlinkSync(WINDSURF_HOOKS_FILE);
    }
  } catch {}
}
