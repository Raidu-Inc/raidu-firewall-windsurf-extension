export { PIIScanner } from './scanner';
export { DEFAULT_POLICY, loadPolicy, isSensitiveFile, checkInputForSensitiveFiles, findSensitiveAccess, isExfiltrationCommand, globToRegex, EXFIL_PATTERNS } from './policy';
export { validateViaAPI, getToken } from './api';
export type { APIClientConfig } from './api';
export { scanText, scanTextLocal, formatEntities, redactText, copyToClipboard, entitySummary, MAX_SCAN_SIZE } from './redaction';
export { createLogger } from './audit';
export { reportBlock, reportScanBlockIfUnrecorded, WINDSURF_EVENT } from './report';
export type { Logger } from './audit';
export type { EntityMatch, ScanResult, ScanResultWithSource, APIValidationResult, Policy, Stats, AuditEntry, EngineConfig, BlockReport, BlockDetector } from './types';
