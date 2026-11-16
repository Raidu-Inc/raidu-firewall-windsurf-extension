/**
 * Raidu API client for PII validation.
 * Uses execFileSync (no shell injection risk).
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { APIValidationResult, BlockReport, EvidenceVerdict } from './types';

const MAX_API_INPUT = 100_000;
const DEFAULT_TOKEN_PATH = path.join(os.homedir(), '.raidu', 'token');
const DEFAULT_API_BASE = 'https://sandbox.raidu.com';

export function resolveApiBase(config?: APIClientConfig): string {
  return config?.apiBase || process.env.RAIDU_API_BASE || DEFAULT_API_BASE;
}

export interface APIClientConfig {
  apiBase?: string;
  tokenFilePath?: string;
}

export function getToken(tokenFilePath?: string): string | null {
  try {
    return fs.readFileSync(tokenFilePath || DEFAULT_TOKEN_PATH, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

export function hasToken(): boolean {
  return getToken() !== null;
}

export function validateViaAPI(
  input: string,
  config?: APIClientConfig,
  logger?: (msg: string) => void,
): APIValidationResult | null {
  const apiBase = resolveApiBase(config);
  const token = getToken(config?.tokenFilePath);
  const log = logger || (() => {});

  if (!token) {
    log('API: no token, skipping');
    return null;
  }

  const safeInput = input.slice(0, MAX_API_INPUT);
  const body = JSON.stringify({ input: safeInput });
  const url = `${apiBase}/api/guardrails/ide/validate`;
  const startMs = performance.now();

  log(`API: POST ${url} (${body.length}B)`);

  try {
    const result = execFileSync(
      'curl',
      ['-fsSL', '-X', 'POST', '-H', `Authorization: Bearer ${token}`, '-H', 'Content-Type: application/json', '-d', body, url],
      { timeout: 8000, encoding: 'utf-8' as BufferEncoding, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    const latencyMs = (performance.now() - startMs).toFixed(0);
    const parsed = JSON.parse(result as string);

    log(`API: ${latencyMs}ms | passed=${parsed.passed} | entities=${parsed.entities?.length || 0} | serverMs=${parsed.processingTimeMs || '?'}`);

    return parsed;
  } catch (err: unknown) {
    const latencyMs = (performance.now() - startMs).toFixed(0);
    log(`API: FAILED after ${latencyMs}ms | ${(err as Error).message?.slice(0, 150)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Block reports (called from the detached flusher, never from a hook directly)
// ---------------------------------------------------------------------------

/**
 * POST a batch of block reports. Returns per-report verdicts in request order,
 * or null on any failure (no token, network, non-2xx), so the caller requeues.
 */
export function postBlockReports(
  reports: BlockReport[],
  logger?: (msg: string) => void,
): EvidenceVerdict[] | null {
  const token = getToken();
  if (!token || reports.length === 0) return null;

  const url = `${resolveApiBase()}/api/guardrails/ide/report`;
  const body = JSON.stringify({ reports });

  try {
    const result = execFileSync(
      'curl',
      [
        '-fsSL',
        '-X',
        'POST',
        '-H',
        `Authorization: Bearer ${token}`,
        '-H',
        'Content-Type: application/json',
        '--data-binary',
        '@-',
        url,
      ],
      // Body over stdin, not argv: keeps it out of the process list.
      { input: body, timeout: 15000, encoding: 'utf-8' as BufferEncoding, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const parsed = JSON.parse(result as string) as { results?: EvidenceVerdict[] };
    if (!Array.isArray(parsed.results)) return null;
    return parsed.results;
  } catch (err: unknown) {
    logger?.(`API: report FAILED | ${(err as Error).message?.slice(0, 150)}`);
    return null;
  }
}
