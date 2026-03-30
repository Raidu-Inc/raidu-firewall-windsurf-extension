/**
 * Logging, audit trail, and stats helpers.
 * All files created with restrictive permissions (owner-only).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AuditEntry, Stats } from './types';

const DEFAULT_LOG_DIR = path.join(os.homedir(), '.raidu', 'logs');
const DEFAULT_STATS: Stats = { totalScans: 0, piiFound: 0, secretsFound: 0, promptsBlocked: 0, commandsBlocked: 0, sessionsAudited: 0 };

export function createLogger(logDir?: string) {
  const dir = logDir || DEFAULT_LOG_DIR;
  const auditPath = path.join(dir, 'audit.jsonl');
  const statsPath = path.join(dir, 'stats.json');
  const debugPath = path.join(dir, 'debug.log');

  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700); } catch {}

  function debug(msg: string): void {
    try {
      const ts = new Date().toISOString().slice(11, 19);
      fs.appendFileSync(debugPath, `${ts} | ${msg.slice(0, 200)}\n`, { mode: 0o600 });
    } catch {}
  }

  function audit(entry: AuditEntry): void {
    try {
      fs.appendFileSync(auditPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 });
    } catch {}
  }

  function loadStats(): Stats {
    try { return JSON.parse(fs.readFileSync(statsPath, 'utf-8')); }
    catch { return { ...DEFAULT_STATS }; }
  }

  function saveStats(s: Stats): void {
    try { fs.writeFileSync(statsPath, JSON.stringify(s, null, 2), { mode: 0o600 }); } catch {}
  }

  function incStat(key: string, n = 1): Stats {
    const s = loadStats();
    (s as Record<string, number>)[key] = ((s as Record<string, number>)[key] || 0) + n;
    saveStats(s);
    return s;
  }

  return { debug, audit, loadStats, saveStats, incStat, dir, auditPath, statsPath, debugPath };
}

export type Logger = ReturnType<typeof createLogger>;
