<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let logoUri: string;

  const dispatch = createEventDispatcher<{ login: void }>();

  let agreed = false;
</script>

<div class="welcome">
  {#if logoUri}
    <img class="logo" src={logoUri} alt="Raidu" width="56" height="56" />
  {/if}
  <h2 class="title">Raidu Firewall</h2>
  <p class="desc">
    AI governance and data protection for your development environment.
    Connect to monitor scans, detect PII leaks, and enforce security policies.
  </p>

  <div class="terms-box">
    <label class="checkbox-row">
      <input type="checkbox" bind:checked={agreed} />
      <span class="checkbox-text">
        I have read and agree to the
        <a href="https://raidu.com/terms" class="link">Terms of Service</a>
        and
        <a href="https://raidu.com/privacy" class="link">Privacy Policy</a>
      </span>
    </label>

    <div class="disclaimer">
      <p class="disclaimer-title">Disclaimer of Warranties</p>
      <p class="disclaimer-text">
        Raidu is provided on an "AS IS" and "AS AVAILABLE" basis. We do not warrant that the service will be
        error-free or that it will successfully identify or block all potential risks or security vulnerabilities.
      </p>
      <p class="disclaimer-title">User Responsibility</p>
      <p class="disclaimer-text">
        Raidu is a tool designed to assist in governance and is not a substitute for professional human review.
        You are solely responsible for verifying the accuracy, safety, and compliance of any code or output.
      </p>
    </div>
  </div>

  <button class="connect-btn" disabled={!agreed} on:click={() => dispatch('login')}>
    Connect to Raidu
  </button>
  <span class="subtitle">Sign in with your Raidu account</span>

  <p class="footer-disclaimer">
    While Raidu uses state-of-the-art models to provide best-in-class guardrails,
    AI is probabilistic. We recommend Raidu as a layer of defense, not your only defense.
  </p>
</div>

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    text-align: center;
  }
  .logo {
    border-radius: 12px;
    margin-bottom: 12px;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0 0 6px 0;
  }
  .desc {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
    margin: 0 0 16px 0;
    max-width: 260px;
  }

  .terms-box {
    width: 100%;
    max-width: 280px;
    margin-bottom: 16px;
    text-align: left;
  }
  .checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 10px;
  }
  .checkbox-row input[type="checkbox"] {
    margin-top: 2px;
    accent-color: var(--vscode-button-background);
  }
  .checkbox-text {
    font-size: 11px;
    color: var(--vscode-foreground);
    line-height: 1.4;
  }
  .link {
    color: var(--vscode-textLink-foreground, #4fc1ff);
    text-decoration: none;
  }
  .link:hover {
    text-decoration: underline;
  }

  .disclaimer {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
    border-radius: 4px;
    padding: 10px;
    max-height: 120px;
    overflow-y: auto;
  }
  .disclaimer-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0 0 3px 0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .disclaimer-title:not(:first-child) {
    margin-top: 8px;
  }
  .disclaimer-text {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
    margin: 0;
  }

  .connect-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    padding: 8px 20px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    font-weight: 500;
  }
  .connect-btn:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }
  .connect-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .subtitle {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 8px;
  }

  .footer-disclaimer {
    font-size: 9px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.6;
    line-height: 1.5;
    margin-top: 16px;
    max-width: 260px;
    font-style: italic;
  }
</style>
