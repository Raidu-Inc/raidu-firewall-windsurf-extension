/**
 * Authentication service for Raidu Firewall.
 *
 * Flow:
 *  1. login()         - opens browser: {apiBase}/login?ide_callback=windsurf&tool=windsurf&state=xxx
 *  2. handleCallback  - receives windsurf://raidu.raidu-firewall/callback?token=xxx&state=xxx
 *                       (or the same URL pasted via "Raidu: Paste Login Callback URL")
 *  3. loadConfig      - GET /api/auth/ide/config (user, org, workspaces)
 *  4. logout()        - clears everything
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import * as settings from '../config/settings';

// ---------------------------------------------------------------------------
// State (persisted in globalState to survive extension host restart)
// ---------------------------------------------------------------------------

let _context: vscode.ExtensionContext | undefined;

const STATE_KEY = 'raidu.pendingAuthState';

// Kept in globalState (survives an extension host restart in this window) AND in
// ~/.raidu/login-state (lets another editor window complete the login).
function setPendingState(state: string): void {
  _context?.globalState.update(STATE_KEY, state);
  settings.savePendingState(state);
}

function getPendingStates(): string[] {
  return [_context?.globalState.get<string>(STATE_KEY), settings.readPendingState()].filter(
    (s): s is string => !!s,
  );
}

function clearPendingState(): void {
  _context?.globalState.update(STATE_KEY, undefined);
  settings.clearPendingState();
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
  // tool=windsurf records the pairing against the Windsurf entry in Tower's tool
  // registry, which is what Connect your tools reads to show it as connected.
  const loginUrl = `${apiBase}/login?ide_callback=windsurf&tool=windsurf&state=${state}`;

  console.log('[Raidu] Login: opening', `${apiBase}/login?ide_callback=windsurf&tool=windsurf`);
  await vscode.env.openExternal(vscode.Uri.parse(loginUrl));

  // The browser redirect (windsurf://raidu.raidu-firewall/callback?...) is routed
  // by the OS to whichever app owns the windsurf:// scheme. That is not this
  // window in an Extension Development Host, in another editor window, or in
  // Devin Desktop (which registers devin://), so let the user paste it instead.
  const PASTE = 'Paste callback URL';
  void vscode.window
    .showInformationMessage(
      'Raidu: Complete login in your browser. If the editor does not reconnect automatically, copy the callback URL and paste it here.',
      PASTE,
    )
    .then((choice) => {
      if (choice === PASTE) return promptForCallbackUrl();
    });
}

export async function promptForCallbackUrl(): Promise<void> {
  const input = await vscode.window.showInputBox({
    title: 'Raidu: Paste login callback URL',
    prompt: 'e.g. windsurf://raidu.raidu-firewall/callback?token=...&state=...',
    ignoreFocusOut: true,
    password: true,
  });
  if (!input) return;

  let uri: vscode.Uri;
  try {
    uri = vscode.Uri.parse(input.trim(), true);
  } catch {
    vscode.window.showErrorMessage('Raidu: That does not look like a valid callback URL.');
    return;
  }
  await handleCallback(uri);
}

// ---------------------------------------------------------------------------
// OAuth callback handler
// ---------------------------------------------------------------------------

export async function handleCallback(uri: vscode.Uri): Promise<void> {
  // Never log the URI itself: its query carries the IDE token.
  console.log('[Raidu] Callback received:', uri.path);

  const params = new URLSearchParams(uri.query);
  const state = params.get('state');
  const token = params.get('token');

  // Accept state from this window or from another window that started login.
  // Both are persisted, so an extension host restart during the browser
  // redirect no longer needs the old "accept any token" fallback, which let a
  // crafted link log the editor into someone else's account.
  if (!state || !getPendingStates().includes(state)) {
    vscode.window.showErrorMessage('Raidu: Authentication failed (state mismatch). Please run "Raidu: Connect" again.');
    return;
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
// Cross-window sync: pick up logins/logouts completed in another editor window
// ---------------------------------------------------------------------------

export function watchTokenFile(context: vscode.ExtensionContext): void {
  let lastToken = settings.readTokenFile();

  const onChange = async () => {
    const token = settings.readTokenFile();
    if (token === lastToken) return;
    lastToken = token;

    if (token) {
      await settings.adoptToken(token);
      await loadConfig(token);
    } else {
      _profile = undefined;
    }
    vscode.commands.executeCommand('raidu.refreshUI');
  };

  fs.watchFile(settings.TOKEN_FILE, { interval: 1000 }, () => {
    void onChange();
  });
  context.subscriptions.push({ dispose: () => fs.unwatchFile(settings.TOKEN_FILE) });
}

// ---------------------------------------------------------------------------
// URI handler registration
// ---------------------------------------------------------------------------

export function registerUriHandler(context: vscode.ExtensionContext): void {
  _context = context;
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        if (uri.path === '/connect') {
          void handleConnectRequest(uri);
          return;
        }
        handleCallback(uri);
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Connect request from the Tower console
// ---------------------------------------------------------------------------

/** Origin plus path, without trailing slashes, or undefined if not a usable Tower URL. */
function normalizeTowerUrl(raw: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return undefined;
  }
  // A Tower is reached over https. Plain http only for a Tower on this machine.
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) return undefined;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return undefined;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

/**
 * windsurf://raidu.raidu-firewall/connect?tower=<url>, opened by "Connect with a
 * link" on the Tower console's Connect your tools page.
 *
 * The link only asks the extension to START a login, which is exactly what
 * "Raidu: Connect" does; that login mints the state and accepts its own
 * callback. Starting a login is harmless; moving the extension to another
 * Tower is not, because every prompt would then be checked there. Anyone can
 * craft this link, so a Tower other than the configured one needs the person
 * to confirm.
 */
export async function handleConnectRequest(uri: vscode.Uri): Promise<void> {
  const requested = new URLSearchParams(uri.query).get('tower');

  if (requested) {
    const tower = normalizeTowerUrl(requested);
    if (!tower) {
      vscode.window.showErrorMessage(
        'Raidu: The connect link names a Tower address that is not a valid https URL. Nothing was changed.',
      );
      return;
    }

    const current = normalizeTowerUrl(settings.getApiBase());
    if (tower.toLowerCase() !== current?.toLowerCase()) {
      const SWITCH = 'Switch and connect';
      const choice = await vscode.window.showWarningMessage(
        `Raidu: Connect this editor to ${tower}?`,
        {
          modal: true,
          detail:
            `Raidu is currently set to ${settings.getApiBase()}. After switching, your prompts and tool calls ` +
            "are checked by the new Tower. Continue only if you started this from your own organisation's Raidu console.",
        },
        SWITCH,
      );
      if (choice !== SWITCH) return;
      await vscode.workspace.getConfiguration('raidu').update('apiBase', tower, vscode.ConfigurationTarget.Global);
    }
  }

  await login();
}
