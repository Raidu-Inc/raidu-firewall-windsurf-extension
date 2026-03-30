/**
 * Text scanning (API + local), redaction, formatting, clipboard.
 */

import { execFileSync } from 'node:child_process';
import { validateViaAPI, type APIClientConfig } from './api';
import { PIIScanner } from './scanner';
import type { EntityMatch, ScanResult, ScanResultWithSource } from './types';

export const MAX_SCAN_SIZE = 100_000;

const localScanner = new PIIScanner();

/**
 * Scan text for PII. API first (if configured), local fallback.
 * Returns entities, scan time, source, and optional sanitized input from API.
 */
export function scanText(
  text: string,
  apiConfig?: APIClientConfig,
  logger?: (msg: string) => void,
): ScanResultWithSource {
  if (!text || text.length > MAX_SCAN_SIZE) {
    return { entities: [], scanTimeMs: 0, source: 'local' };
  }

  const start = performance.now();
  const apiResult = validateViaAPI(text, apiConfig, logger);

  if (apiResult && !apiResult.passed && apiResult.entities && apiResult.entities.length > 0) {
    const entities: EntityMatch[] = apiResult.entities.map((e) => ({
      type: e.type || 'UNKNOWN',
      value: '',
      start: e.start ?? 0,
      end: e.end ?? 0,
      score: e.confidence ?? 1.0,
    }));
    logger?.(`scan: API found ${entities.length} entities (${entities.map((e) => e.type).join(', ')})`);
    return { entities, scanTimeMs: apiResult.processingTimeMs ?? performance.now() - start, source: 'api', sanitizedInput: apiResult.sanitizedInput };
  }

  if (apiResult && apiResult.passed) {
    const localCheck = localScanner.scan(text);
    if (localCheck.entities.length > 0) {
      logger?.(`scan: API passed but local found ${localCheck.entities.length} entities`);
      return { ...localCheck, source: 'local' };
    }
    return { entities: [], scanTimeMs: performance.now() - start, source: 'api' };
  }

  const localResult = localScanner.scan(text);
  logger?.(`scan: local fallback (${localResult.entities.length} entities, ${localResult.scanTimeMs.toFixed(1)}ms)`);
  return { ...localResult, source: 'local' };
}

/** Local-only scan (for post-hoc detection where API call would be too slow). */
export function scanTextLocal(text: string): ScanResult {
  if (!text || text.length > MAX_SCAN_SIZE) return { entities: [], scanTimeMs: 0 };
  return localScanner.scan(text);
}

/** Format entities as human-readable string: "2 ssn, 1 email" */
export function formatEntities(entities: EntityMatch[]): string {
  const types = [...new Set(entities.map((e) => e.type))];
  return types.map((t) => `${entities.filter((e) => e.type === t).length} ${t.replace(/_/g, ' ').toLowerCase()}`).join(', ');
}

/** Replace entities with typed placeholders: [SSN_1], [EMAIL_1] */
export function redactText(text: string, entities: EntityMatch[]): string {
  const withPositions = entities.filter((e) => e.start !== e.end);
  if (withPositions.length === 0) return text;
  const sorted = [...withPositions].sort((a, b) => b.start - a.start);
  let out = text;
  const counters: Record<string, number> = {};
  for (const e of sorted) {
    counters[e.type] = (counters[e.type] || 0) + 1;
    out = `${out.slice(0, e.start)}[${e.type}_${counters[e.type]}]${out.slice(e.end)}`;
  }
  return out;
}

/** Copy text to system clipboard (cross-platform). */
export function copyToClipboard(text: string, logger?: (msg: string) => void): void {
  try {
    switch (process.platform) {
      case 'darwin':
        execFileSync('pbcopy', [], { input: text, timeout: 2000 });
        break;
      case 'linux':
        try { execFileSync('xclip', ['-selection', 'clipboard'], { input: text, timeout: 2000 }); }
        catch { execFileSync('xsel', ['--clipboard', '--input'], { input: text, timeout: 2000 }); }
        break;
      case 'win32':
        execFileSync('clip', [], { input: text, timeout: 2000 });
        break;
    }
  } catch {
    logger?.('clipboard: failed to copy');
  }
}

/** Extract entity type + score (no raw values, safe for audit logs). */
export function entitySummary(entities: EntityMatch[]): Array<{ type: string; score: number }> {
  return entities.map((e) => ({ type: e.type, score: e.score }));
}
