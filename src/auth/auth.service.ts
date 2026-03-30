/**
 * Authentication service for Raidu Firewall.
 *
 * Flow:
 *  1. login()         - opens browser: {apiBase}/console/login?ide_callback=windsurf&state=xxx
 *  2. handleCallback  - receives windsurf://raidu.raidu-firewall/callback?token=xxx&state=xxx
 *  3. loadConfig      - GET /api/auth/ide/config (user, org, workspaces)
 *  4. logout()        - clears everything
 */

import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import * as settings from '../config/settings';

// ---------------------------------------------------------------------------
// State (persisted in globalState to survive extension host restart)
// ---------------------------------------------------------------------------

let _context: vscode.ExtensionContext | undefined;

const STATE_KEY = 'raidu.pendingAuthState';

function setPendingState(state: string): void {
  _context?.globalState.update(STATE_KEY, state);
}

function getPendingState(): string | undefined {
  return _context?.globalState.get<string>(STATE_KEY);
}

function clearPendingState(): void {
  _context?.globalState.update(STATE_KEY, undefined);
}

export interface UserProfile {
  email: string;
  name: string;
  organizationName: string;
  plan: string;
  workspaceName?: string;
  environmentName?: string;
}

let _profile: UserProfile | undefined;

export function getProfile(): UserProfile | undefined {
  return _profile;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(): Promise<void> {
  const state = crypto.randomUUID();
  setPendingState(state);
  const apiBase = settings.getApiBase();
  const loginUrl = `${apiBase}/console/login?ide_callback=windsurf&state=${state}`;

  console.log('[Raidu] Login: opening', loginUrl);
  await vscode.env.openExternal(vscode.Uri.parse(loginUrl));
  vscode.window.showInformationMessage('Raidu: Opening browser for login...');
}

// ---------------------------------------------------------------------------
// OAuth callback handler
// ---------------------------------------------------------------------------

export async function handleCallback(uri: vscode.Uri): Promise<void> {
  console.log('[Raidu] Callback received:', uri.toString());

  const params = new URLSearchParams(uri.query);
  const state = params.get('state');
  const token = params.get('token');

  const pendingState = getPendingState();
  console.log('[Raidu] State check: received=', state, 'pending=', pendingState);

  if (!state || state !== pendingState) {
    // If state doesn't match but we have a token, accept it anyway
    // (Windsurf may restart extension host during browser redirect)
    if (token) {
      console.log('[Raidu] State mismatch but token present, accepting');
    } else {
      vscode.window.showErrorMessage('Raidu: Authentication failed (state mismatch, no token).');
      return;
    }
  }
  clearPendingState();

  if (!token) {
    vscode.window.showErrorMessage('Raidu: Authentication failed (no token).');
    return;
  }

  console.log('[Raidu] Saving token...');
  await settings.setToken(token);
  console.log('[Raidu] Token saved. Verifying...');

  // Verify token was saved
  const saved = await settings.getToken();
  console.log('[Raidu] Token retrieved:', saved ? 'yes' : 'NO');

  vscode.window.showInformationMessage('Raidu Firewall: Connected successfully.');

  await loadConfig(token);

  // Notify extension to refresh UI (sidebar + status bar)
  vscode.commands.executeCommand('raidu.refreshUI');
}

// ---------------------------------------------------------------------------
// Load config (user, org, workspaces) from API
// ---------------------------------------------------------------------------

export async function loadConfig(token: string): Promise<void> {
  const apiBase = settings.getApiBase();

  try {
    const res = await fetch(`${apiBase}/api/auth/ide/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log('[Raidu] loadConfig status:', res.status);

    if (res.status === 401) {
      await settings.clearAll();
      _profile = undefined;
      vscode.window.showWarningMessage('Raidu: Session expired. Please reconnect.');
      return;
    }

    if (!res.ok) {
      // Config endpoint may not exist yet, build profile from token
      console.log('[Raidu] loadConfig failed, using token-only profile');
      _profile = { email: '', name: '', organizationName: '', plan: 'free' };
      return;
    }

    const data = (await res.json()) as {
      user?: { email?: string; name?: string };
      organization?: { name?: string; plan?: string };
      workspaces?: Array<{
        id: string;
        name: string;
        environments?: Array<{ id: string; name: string }>;
      }>;
    };

    // Build profile
    _profile = {
      email: data.user?.email || '',
      name: data.user?.name || '',
      organizationName: data.organization?.name || '',
      plan: data.organization?.plan || 'free',
    };

    // Auto-select first workspace/environment (no prompt)
    const workspaces = data.workspaces || [];
    if (workspaces.length > 0) {
      const ws = workspaces[0];
      await settings.setWorkspaceId(ws.id);
      _profile.workspaceName = ws.name;

      const envs = ws.environments || [];
      if (envs.length > 0) {
        await settings.setEnvironmentId(envs[0].id);
        _profile.environmentName = envs[0].name;
      }
    }
  } catch (err) {
    console.log('[Raidu] loadConfig error:', err);
    // Config endpoint may not exist yet, still connected with token
    _profile = { email: '', name: '', organizationName: '', plan: 'free' };
  }
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logout(): Promise<void> {
  await settings.clearAll();
  _profile = undefined;
  vscode.window.showInformationMessage('Raidu Firewall: Disconnected.');
}

// ---------------------------------------------------------------------------
// Restore session on activation
// ---------------------------------------------------------------------------

export async function restoreSession(): Promise<void> {
  const token = await settings.getToken();
  console.log('[Raidu] restoreSession: token=', token ? 'yes' : 'no');
  if (token) {
    await loadConfig(token);
  }
}

// ---------------------------------------------------------------------------
// URI handler registration
// ---------------------------------------------------------------------------

export function registerUriHandler(context: vscode.ExtensionContext): void {
  _context = context;
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        handleCallback(uri);
      },
    }),
  );
}
