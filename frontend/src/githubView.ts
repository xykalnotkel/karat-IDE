import { icon } from './icons';
import { invoke, isTauri } from './transport';
import { el, esc, toast } from './ui';

interface GitHubUser {
  login: string;
  name: string | null;
  public_repos: number;
}

interface GitHubRepo {
  full_name: string;
  html_url: string;
  private: boolean;
  language: string | null;
  description: string | null;
}

interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

interface DeviceToken {
  accessToken?: string;
  error?: string;
  errorDescription?: string;
}

const TOKEN_KEY = 'karat:github-token';

export class GitHubView {
  private body = el('div', 'github-body');
  private token = sessionStorage.getItem(TOKEN_KEY) || '';
  private cancelled = false;

  constructor(mount: HTMLElement) {
    const header = el('div', 'side-header');
    header.innerHTML = '<span>GITHUB</span>';
    const refresh = el('button', 'icon-btn', icon('refresh'));
    refresh.title = 'Refresh GitHub';
    refresh.onclick = () => void this.render();
    const actions = el('div', 'side-actions');
    actions.append(refresh);
    header.append(actions);
    mount.append(header, this.body);
    void this.render();
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return (await response.json()) as T;
  }

  async render(): Promise<void> {
    this.cancelled = true;
    this.body.innerHTML = '';
    if (!this.token) {
      this.renderLogin();
      return;
    }
    try {
      const [user, repos] = await Promise.all([
        this.request<GitHubUser>('/user'),
        this.request<GitHubRepo[]>('/user/repos?sort=updated&per_page=30'),
      ]);
      this.body.innerHTML = `
        <section class="github-user">
          <div class="github-avatar">${esc(user.login.slice(0, 1).toUpperCase())}</div>
          <div><b>${esc(user.name || user.login)}</b><span>@${esc(user.login)} · ${user.public_repos} public repos</span></div>
        </section>`;
      const logout = el('button', 'btn wide', 'Sign out of this session');
      logout.onclick = () => {
        this.token = '';
        sessionStorage.removeItem(TOKEN_KEY);
        void this.render();
      };
      this.body.append(logout, el('div', 'git-group', 'Recently updated repositories'));
      for (const repo of repos) {
        const row = el('a', 'github-repo');
        row.setAttribute('href', repo.html_url);
        row.setAttribute('target', '_blank');
        row.setAttribute('rel', 'noreferrer');
        row.innerHTML = `<b>${esc(repo.full_name)}</b><span>${repo.private ? 'Private' : 'Public'}${repo.language ? ` · ${esc(repo.language)}` : ''}</span><small>${esc(repo.description || 'No description')}</small>`;
        row.onclick = (event) => {
          if (!isTauri) return;
          event.preventDefault();
          void this.openExternal(repo.html_url);
        };
        this.body.append(row);
      }
    } catch (error) {
      this.token = '';
      sessionStorage.removeItem(TOKEN_KEY);
      toast(`GitHub login expired or invalid: ${String(error)}`, 'error', 5000);
      this.renderLogin();
    }
  }

  private renderLogin(): void {
    this.body.innerHTML = `
      <div class="integration-intro">${icon('github', 30)}<b>Connect GitHub</b><span>Browse your repositories using a session-only token.</span></div>
      <label class="field-label">Fine-grained personal access token</label>
      <input class="github-token" type="password" autocomplete="off" placeholder="github_pat_… or ghp_…">
      <button class="btn primary wide github-token-login">Sign in with token</button>
      <div class="integration-separator"><span>or Device Flow</span></div>
      <label class="field-label">GitHub OAuth App Client ID</label>
      <input class="github-client" autocomplete="off" placeholder="OAuth App client ID">
      <button class="btn wide github-device-login">Sign in through GitHub</button>
      <p class="integration-note">Tokens remain in session storage and are cleared when the WebView session ends. Device Flow requires an OAuth App with Device Flow enabled.</p>`;
    const tokenInput = this.body.querySelector('.github-token') as HTMLInputElement;
    (this.body.querySelector('.github-token-login') as HTMLButtonElement).onclick = () => {
      const value = tokenInput.value.trim();
      if (value.length < 20) {
        toast('Enter a valid fine-grained GitHub token', 'error');
        return;
      }
      this.setToken(value);
    };
    const clientInput = this.body.querySelector('.github-client') as HTMLInputElement;
    clientInput.value = localStorage.getItem('karat:github-client-id') || '';
    const deviceButton = this.body.querySelector('.github-device-login') as HTMLButtonElement;
    deviceButton.disabled = !isTauri;
    deviceButton.title = isTauri ? 'Use GitHub Device Flow' : 'Device Flow is available in the Karat app';
    deviceButton.onclick = () => void this.deviceLogin(clientInput.value.trim());
  }

  private async openExternal(url: string): Promise<void> {
    try {
      if (isTauri) {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      toast(`Could not open browser: ${String(error)}`, 'error');
    }
  }

  private setToken(token: string): void {
    this.token = token;
    sessionStorage.setItem(TOKEN_KEY, token);
    void this.render();
  }

  private async deviceLogin(clientId: string): Promise<void> {
    if (!clientId) {
      toast('Enter the OAuth App client ID first', 'error');
      return;
    }
    localStorage.setItem('karat:github-client-id', clientId);
    this.cancelled = false;
    try {
      const code = await invoke<DeviceCode>('github_device_start', { clientId });
      this.body.innerHTML = `
        <div class="device-flow">
          ${icon('github', 34)}
          <b>Enter this code on GitHub</b>
          <button class="device-code" title="Copy code">${esc(code.userCode)}</button>
          <a href="${esc(code.verificationUri)}" target="_blank" rel="noreferrer">${esc(code.verificationUri)} ${icon('external', 13)}</a>
          <span>Waiting for authorization…</span>
          <button class="btn device-cancel">Cancel</button>
        </div>`;
      (this.body.querySelector('.device-code') as HTMLButtonElement).onclick = async () => {
        await navigator.clipboard.writeText(code.userCode);
        toast('Device code copied', 'ok');
      };
      const verificationLink = this.body.querySelector('.device-flow a') as HTMLAnchorElement;
      verificationLink.onclick = (event) => {
        if (!isTauri) return;
        event.preventDefault();
        void this.openExternal(code.verificationUri);
      };
      (this.body.querySelector('.device-cancel') as HTMLButtonElement).onclick = () => {
        this.cancelled = true;
        this.renderLogin();
      };
      const deadline = Date.now() + code.expiresIn * 1000;
      let interval = Math.max(code.interval, 5);
      while (!this.cancelled && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, interval * 1000));
        if (this.cancelled) return;
        const result = await invoke<DeviceToken>('github_device_poll', {
          clientId,
          deviceCode: code.deviceCode,
        });
        if (result.accessToken) {
          this.setToken(result.accessToken);
          toast('GitHub connected', 'ok');
          return;
        }
        if (result.error === 'slow_down') interval += 5;
        else if (result.error && result.error !== 'authorization_pending') {
          throw new Error(result.errorDescription || result.error);
        }
      }
      if (!this.cancelled) throw new Error('GitHub device code expired');
    } catch (error) {
      toast(`GitHub sign-in failed: ${error instanceof Error ? error.message : String(error)}`, 'error', 6000);
      this.renderLogin();
    }
  }
}
