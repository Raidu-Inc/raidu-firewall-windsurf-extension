/**
 * Policy engine: file sensitivity checks, glob matching, command blocking.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Policy } from './types';

export const DEFAULT_POLICY: Policy = {
  files: {
    blocked: [
      '.env', '.env.local', '.env.production', '.env.staging', '.env.development', '*.env',
      'credentials*', 'secrets*',
      '*.pem', '*.key', '*.p12', '*.pfx', '*.jks', '*.keystore',
      'id_rsa', 'id_ed25519', 'id_ecdsa',
      '.netrc', '.pgpass', '.npmrc', '.pypirc',
      '.aws/*', '.aws/credentials', '.ssh/*', '.kube/*', '.kube/config',
      'docker-compose*.yml', 'docker-compose*.yaml',
    ],
    allowed: ['.env.example', '.env.sample', '.env.template'],
  },
  commands: {
    blocked: [
      'printenv', 'env$', 'set$',
      'echo.*\\$.*KEY', 'echo.*\\$.*SECRET', 'echo.*\\$.*TOKEN', 'echo.*\\$.*PASSWORD',
    ],
  },
};

export function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped, 'i');
}

/** Load policy from cache file, merge with ignore patterns if present, fall back to defaults. */
export function loadPolicy(policyCachePath?: string, projectDir?: string): Policy {
  let policy: Policy = { ...DEFAULT_POLICY, files: { ...DEFAULT_POLICY.files, blocked: [...DEFAULT_POLICY.files.blocked], allowed: [...DEFAULT_POLICY.files.allowed] } };

  if (policyCachePath) {
    try {
      const cached = JSON.parse(fs.readFileSync(policyCachePath, 'utf-8'));
      if (cached?.files?.blocked && Array.isArray(cached.files.blocked) && cached.files.blocked.length > 0) {
        policy = cached as Policy;
      }
    } catch {}
  }

  // Merge IDE ignore patterns if present
  if (projectDir) {
    for (const ignoreFile of ['.cursorignore', '.windsurf/ignore']) {
      try {
        const content = fs.readFileSync(path.join(projectDir, ignoreFile), 'utf-8');
        const existing = new Set(policy.files.blocked);
        for (const line of content.split('\n')) {
          const p = line.trim();
          if (p && !p.startsWith('#') && !existing.has(p)) {
            policy.files.blocked.push(p);
            existing.add(p);
          }
        }
      } catch {}
    }
  }

  return policy;
}

/** Check if a file path matches blocked patterns. Returns the matched pattern or null. */
export function isSensitiveFile(filePath: string, policy: Policy): string | null {
  const name = path.basename(filePath);
  for (const p of policy.files.allowed || []) {
    if (globToRegex(p).test(name) || globToRegex(p).test(filePath)) return null;
  }
  for (const p of policy.files.blocked) {
    if (globToRegex(p).test(name) || globToRegex(p).test(filePath)) return p;
  }
  return null;
}

export interface SensitiveAccess {
  /** User-facing reason, as shown in the block message. */
  message: string;
  kind: 'sensitive_file' | 'command_policy';
  /** The policy pattern that matched. */
  rule: string;
  /** Basename of the file, when the input named one. */
  fileName?: string;
}

/** Check tool input (file_path, glob, command) against policy, with structured details. */
export function findSensitiveAccess(input: Record<string, unknown>, policy: Policy): SensitiveAccess | null {
  if (input.file_path) {
    const hit = isSensitiveFile(input.file_path as string, policy);
    if (hit) {
      const fileName = path.basename(input.file_path as string);
      return { message: `Blocked access to ${fileName} (policy: ${hit})`, kind: 'sensitive_file', rule: hit, fileName };
    }
  }
  if (input.glob) {
    for (const p of policy.files.blocked) {
      if (globToRegex(p).test(input.glob as string))
        return { message: `Blocked search for sensitive files (${input.glob})`, kind: 'sensitive_file', rule: p };
    }
  }
  if (input.command) {
    for (const p of policy.files.blocked) {
      if (globToRegex(p).test(input.command as string))
        return { message: `Blocked shell access to ${p}`, kind: 'sensitive_file', rule: p };
    }
    for (const p of policy.commands.blocked) {
      try {
        if (new RegExp(p, 'i').test(input.command as string))
          return { message: `Blocked command (policy: ${p})`, kind: 'command_policy', rule: p };
      } catch {}
    }
  }
  return null;
}

/** Check tool input (file_path, glob, command) against policy. */
export function checkInputForSensitiveFiles(input: Record<string, unknown>, policy: Policy): string | null {
  return findSensitiveAccess(input, policy)?.message ?? null;
}

export const EXFIL_PATTERNS: RegExp[] = [
  /curl\s+.*(-d|--data)/i, /wget\s+.*--post/i, /scp\s+.*@/, /rsync\s+.*@/, /nc\s+-/,
];

export function isExfiltrationCommand(command: string): boolean {
  return EXFIL_PATTERNS.some((p) => p.test(command));
}
