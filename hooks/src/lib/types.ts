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
}

/** API validation response from Raidu backend. */
export interface APIValidationResult {
  passed: boolean;
  entities?: Array<{ type: string; start?: number; end?: number; confidence?: number }>;
  sanitizedInput?: string;
  summary?: { pii?: number; pci?: number; phi?: number; secrets?: number };
  processingTimeMs?: number;
}

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
