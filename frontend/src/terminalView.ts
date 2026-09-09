import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Channel } from '@tauri-apps/api/core';
import { invoke, isTauri } from './transport';
import { b64encode, b64decode } from './ui';
import { store } from './state';
import { webAuthToken } from './api';
import { isMobile } from './mobile';
import { preferences, Preferences } from './preferences';

interface TermEvent {
  t: string;
  d?: string | null;
}

interface ShellProfile {
  id: string;
  label: string;
}

export class TerminalView {
  private term: Terminal;
  private fit: FitAddon;
  private ws: WebSocket | null = null;
  private termId: string | null = null;
  private channel: Channel<TermEvent> | null = null;
  private mobileConnected = false;
  private mobileBuffer = '';
  private mobileCwd = '';
  private mobileBusy = false;
  private mount: HTMLElement;

  onTogglePanel: () => void = () => {};

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.term = new Terminal({
      fontSize: preferences.terminalFontSize,
      fontFamily: "Menlo,Consolas,'Courier New',monospace",
      cursorBlink: true,
      scrollback: 5000,
      theme: this.theme(),
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(mount);
    this.term.onData((d) => {
      if (isMobile && isTauri) {
        this.handleMobileInput(d);
      } else if (isTauri) {
        if (this.termId) {
          invoke('term_input', { id: this.termId, data: b64encode(d) }).catch(() => {});
        }
      } else {
        this.send({ t: 'in', d: b64encode(d) });
      }
    });
    new ResizeObserver(() => this.refit()).observe(mount);
    document.getElementById('term-new')!.addEventListener('click', () => this.connect());
    document.getElementById('term-clear')!.addEventListener('click', () => this.clear());
    void this.loadProfiles();
    document.getElementById('panel-hide')!.addEventListener('click', () => this.onTogglePanel());
  }

  private profile(): string | null {
    return (document.getElementById('term-profile') as HTMLSelectElement).value || null;
  }

  private async loadProfiles(): Promise<void> {
    const select = document.getElementById('term-profile') as HTMLSelectElement;
    if (isMobile) {
      const option = document.createElement('option');
      option.value = 'android-sh';
      option.textContent = 'Android sandbox shell';
      select.replaceChildren(option);
      select.disabled = true;
      return;
    }
    try {
      const profiles = isTauri
        ? await invoke<ShellProfile[]>('term_profiles')
        : await fetch('/api/terminal/profiles', {
            headers: webAuthToken ? { Authorization: `Bearer ${webAuthToken}` } : {},
          }).then(async (response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return (await response.json()) as ShellProfile[];
          });
      select.replaceChildren(
        ...profiles.map((profile) => {
          const option = document.createElement('option');
          option.value = profile.id;
          option.textContent = profile.label;
          return option;
        }),
      );
      const saved = localStorage.getItem('karat:terminal-profile');
      if (saved && profiles.some((profile) => profile.id === saved)) select.value = saved;
      select.onchange = () => {
        localStorage.setItem('karat:terminal-profile', select.value);
        this.connect();
      };
    } catch {
      const fallback = document.createElement('option');
      fallback.textContent = 'Default shell';
      fallback.value = '';
      select.replaceChildren(fallback);
    }
  }

  private theme() {
    return store.theme === 'dark'
      ? {
          background: '#1e1e1e',
          foreground: '#cccccc',
          cursor: '#aeafad',
          selectionBackground: '#264f78',
          black: '#1e1e1e', red: '#f87171', green: '#6ee7a2', yellow: '#facc6b',
          blue: '#72a7ff', magenta: '#c084fc', cyan: '#5eead4', white: '#d6d6d6',
          brightBlack: '#737373', brightRed: '#fca5a5', brightGreen: '#86efac',
          brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
          brightCyan: '#99f6e4', brightWhite: '#ffffff',
        }
      : {
          background: '#ffffff',
          foreground: '#242424',
          cursor: '#005fb8',
          selectionBackground: '#add6ff',
          black: '#242424', red: '#b42318', green: '#18794e', yellow: '#8a6100',
          blue: '#005fb8', magenta: '#7e22ce', cyan: '#087f8c', white: '#e5e7eb',
          brightBlack: '#616161', brightRed: '#d92d20', brightGreen: '#218358',
          brightYellow: '#a16207', brightBlue: '#2563eb', brightMagenta: '#9333ea',
          brightCyan: '#0e7490', brightWhite: '#ffffff',
        };
  }

  applyTheme(): void {
    this.term.options.theme = this.theme();
  }

  applyPreferences(value: Preferences): void {
    this.term.options.fontSize = value.terminalFontSize;
    this.refit();
  }

  connect(): void {
    if (isTauri) void this.connectTauri();
    else this.connectWeb();
  }

  private async connectTauri(): Promise<void> {
    this.disconnect();
    if (isMobile) {
      this.mobileConnected = true;
      this.term.writeln('\x1b[94mKarat Android sandbox shell\x1b[0m');
      this.term.writeln('\x1b[90mCommands run in private workspace · 30s timeout · no root\x1b[0m');
      this.mobilePrompt();
      this.term.focus();
      return;
    }
    this.term.writeln('\x1b[90mConnecting to shell…\x1b[0m');
    try {
      const channel = new Channel<TermEvent>();
      channel.onmessage = (m) => this.handleEvent(m);
      this.channel = channel;
      this.termId = await invoke<string>('term_spawn', {
        cols: this.term.cols,
        rows: this.term.rows,
        profile: this.profile(),
        onData: channel,
      });
      this.refit();
    } catch (e) {
      this.term.writeln(`\r\n\x1b[91m${e instanceof Error ? e.message : String(e)}\x1b[0m`);
      this.termId = null;
    }
  }

  private connectWeb(): void {
    this.disconnect();
    this.term.writeln('\x1b[90mConnecting to shell…\x1b[0m');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({
      cols: String(this.term.cols),
      rows: String(this.term.rows),
    });
    if (webAuthToken) params.set('token', webAuthToken);
    if (this.profile()) params.set('profile', this.profile()!);
    const ws = new WebSocket(`${proto}://${location.host}/ws/term?${params}`);
    this.ws = ws;
    ws.onopen = () => this.refit();
    ws.onmessage = (ev) => {
      try {
        this.handleEvent(JSON.parse(ev.data as string) as TermEvent);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        this.term.writeln('\r\n\x1b[90m[disconnected]\x1b[0m');
      }
    };
    ws.onerror = () => {
      this.term.writeln('\r\n\x1b[91m[connection error]\x1b[0m');
    };
  }

  private handleEvent(m: TermEvent): void {
    if (m.t === 'out' && m.d) this.term.write(b64decode(m.d));
    else if (m.t === 'exit') {
      this.term.writeln('\r\n\x1b[90m[shell exited — press + for a new terminal]\x1b[0m');
      this.termId = null;
    } else if (m.t === 'err') this.term.writeln(`\r\n\x1b[91m${m.d ?? 'error'}\x1b[0m`);
  }

  private mobilePrompt(): void {
    const place = this.mobileCwd ? `/${this.mobileCwd}` : '~';
    this.term.write(`\r\n\x1b[92mkarat\x1b[90m:${place}\x1b[0m$ `);
  }

  private handleMobileInput(data: string): void {
    if (!this.mobileConnected || this.mobileBusy) return;
    for (const char of data) {
      if (char === '\r' || char === '\n') {
        const command = this.mobileBuffer.trim();
        this.mobileBuffer = '';
        this.term.write('\r\n');
        if (command) void this.runMobileCommand(command);
        else this.mobilePrompt();
      } else if (char === '\u007f') {
        if (this.mobileBuffer) {
          this.mobileBuffer = this.mobileBuffer.slice(0, -1);
          this.term.write('\b \b');
        }
      } else if (char === '\u0003') {
        this.mobileBuffer = '';
        this.term.write('^C');
        this.mobilePrompt();
      } else if (char >= ' ' && char !== '\u007f') {
        this.mobileBuffer += char;
        this.term.write(char);
      }
    }
  }

  private normalizeMobileCwd(input: string): string | null {
    const absolute = input.startsWith('/') ? input.slice(1) : [this.mobileCwd, input].filter(Boolean).join('/');
    const parts: string[] = [];
    for (const part of absolute.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return parts.join('/');
  }

  private async runMobileCommand(command: string): Promise<void> {
    if (command === 'clear') {
      this.term.clear();
      this.mobilePrompt();
      return;
    }
    if (command === 'pwd') {
      this.term.writeln(this.mobileCwd ? `/workspace/${this.mobileCwd}` : '/workspace');
      this.mobilePrompt();
      return;
    }
    if (command === 'help') {
      this.term.writeln('\x1b[96mBuilt-ins:\x1b[0m cd, pwd, clear, help');
      this.term.writeln('Android commands commonly include ls, cat, cp, mv, mkdir, grep, sed, and toybox.');
      this.mobilePrompt();
      return;
    }
    if (/^cd(?:\s|$)/.test(command)) {
      const target = command.replace(/^cd\s*/, '').trim() || '/';
      const next = this.normalizeMobileCwd(target);
      try {
        await invoke('mobile_term_run', { command: 'pwd', cwd: next ?? '' });
        this.mobileCwd = next ?? '';
      } catch (error) {
        this.term.writeln(`\x1b[91mcd: ${String(error)}\x1b[0m`);
      }
      this.mobilePrompt();
      return;
    }
    this.mobileBusy = true;
    try {
      const result = await invoke<{ output: string; status: number; truncated: boolean }>('mobile_term_run', {
        command,
        cwd: this.mobileCwd,
      });
      if (result.output) this.term.write(result.output.replace(/\n/g, '\r\n'));
      if (result.truncated) this.term.writeln('\r\n\x1b[93m[output truncated at 256 KB]\x1b[0m');
      if (result.status !== 0) this.term.writeln(`\r\n\x1b[91m[exit ${result.status}]\x1b[0m`);
    } catch (error) {
      this.term.writeln(`\r\n\x1b[91m${error instanceof Error ? error.message : String(error)}\x1b[0m`);
    } finally {
      this.mobileBusy = false;
      this.mobilePrompt();
    }
  }

  disconnect(): void {
    this.mobileConnected = false;
    this.mobileBuffer = '';
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
    if (this.termId) {
      const id = this.termId;
      this.termId = null;
      if (isTauri) invoke('term_kill', { id }).catch(() => {});
    }
    this.channel = null;
  }

  get connected(): boolean {
    if (isMobile && isTauri) return this.mobileConnected;
    return isTauri ? this.termId !== null : !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  clear(): void {
    this.term.clear();
  }

  focus(): void {
    this.term.focus();
  }

  refit(): void {
    try {
      if (!this.mount.isConnected || this.mount.clientWidth === 0) return;
      this.fit.fit();
      if (isTauri) {
        if (this.termId) {
          invoke('term_resize', {
            id: this.termId,
            cols: this.term.cols,
            rows: this.term.rows,
          }).catch(() => {});
        }
      } else {
        this.send({ t: 'rs', cols: this.term.cols, rows: this.term.rows });
      }
    } catch {
      /* container not laid out yet */
    }
  }

  /** Type a command into the shell (used by "Run in Terminal"). */
  runCommand(cmd: string): void {
    if (isMobile && isTauri) {
      if (this.mobileConnected && !this.mobileBusy) {
        this.term.write(cmd + '\r\n');
        void this.runMobileCommand(cmd);
      }
    } else if (isTauri) {
      if (this.termId) {
        invoke('term_input', { id: this.termId, data: b64encode(cmd + '\n') }).catch(() => {});
      }
    } else {
      this.send({ t: 'in', d: b64encode(cmd + '\n') });
    }
    this.term.focus();
  }

  private send(o: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(o));
    }
  }
}
