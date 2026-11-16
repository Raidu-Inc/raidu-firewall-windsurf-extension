/** PII/secret entity detected by the scanner. */
export interface EntityMatch {
  type: string;
  value: string;
  start: number;
  end: number;
  score: number;
}

/** Result from scanText or scanTextLocal. */
export interface ScanResult {
  entities: EntityMatch[];
  scanTimeMs: number;
}

/** Extended scan result with API source info. */
export interface ScanResultWithSource extends ScanResult {
  source: 'api' | 'local';
  sanitizedInput?: string;
  /**
   * Set only when entities were found but Tower has NO violation row for them,
   * i.e. the block must be reported via /ide/report. Undefined when /validate
   * already stored the row (or nothing was found).
   */
  detector?: BlockDetector;
}

/** API validation response from Raidu backend. */
export interface APIValidationResult {
  passed: boolean;
  entities?: Array<{ type: string; start?: number; end?: number; confidence?: number }>;
  sanitizedInput?: string;
  summary?: { pii?: number; pci?: number; phi?: number; secrets?: number };
  processingTimeMs?: number;
  /** Whether Tower stored the violation row (newer servers only). */
  evidence?: EvidenceVerdict;
}

// ---------------------------------------------------------------------------
// Block reports to Tower (POST /api/guardrails/ide/report)
// ---------------------------------------------------------------------------

/** Why Tower has no violation for this block yet. */
export type BlockDetector = 'local' | 'api_unavailable' | 'api_unrecorded';

/**
 * Metadata-only description of a block. Never carries prompt/command/file content.
 *
 * `event` uses the names Tower's IDE_BLOCK_EVENTS accepts (shared with the
 * Cursor extension); Windsurf hook names are mapped onto them in report.ts.
 */
export interface BlockReport {
  event:
    | 'beforeSubmitPrompt'
    | 'preToolUse'
    | 'beforeShellExecution'
    | 'beforeMCPExecution'
    | 'beforeReadFile'
    | 'beforeTabFileRead';
  kind: 'sensitive_data' | 'sensitive_file' | 'exfiltration' | 'command_policy';
  detector: BlockDetector;
  tool?: string;
  entityTypes?: string[];
  rule?: string;
  fileName?: string;
  ideConversationId?: string;
  ideGenerationId?: string;
  occurredAt?: string;
}

export type EvidenceVerdict =
  | { outcome: 'stored' }
  | { outcome: 'not_applicable' }
  | { outcome: 'failed'; reason: string };

/** Policy definition for file and command blocking. */
export interface Policy {
  files: {
    blocked: string[];
    allowed: string[];
  };
  commands: {
    blocked: string[];
  };
}

/** Aggregated scan stats. */
export interface Stats {
  totalScans: number;
  piiFound: number;
  secretsFound: number;
  promptsBlocked: number;
  commandsBlocked: number;
  sessionsAudited: number;
  [key: string]: number;
}

/** Single entry in the audit trail. */
export interface AuditEntry {
  timestamp?: string;
  event: string;
  action: string;
  [key: string]: unknown;
}

/** Configuration for the engine. */
export interface EngineConfig {
  apiBase?: string;
  tokenFilePath?: string;
  logDir?: string;
  policyCachePath?: string;
}
