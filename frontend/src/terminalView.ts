import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Channel } from '@tauri-apps/api/core';
import { invoke, isTauri } from './transport';
import { b64encode, b64decode } from './ui';
import { store } from './state';

interface TermEvent {
  t: string;
  d?: string | null;
}

export class TerminalView {
  private term: Terminal;
  private fit: FitAddon;
  private ws: WebSocket | null = null;
  private termId: string | null = null;
  private channel: Channel<TermEvent> | null = null;
  private mount: HTMLElement;

  onTogglePanel: () => void = () => {};

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.term = new Terminal({
      fontSize: 13,
      fontFamily: "Menlo,Consolas,'Courier New',monospace",
      cursorBlink: true,
      scrollback: 5000,
      theme: this.theme(),
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(mount);
    this.term.onData((d) => {
      if (isTauri) {
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
    document.getElementById('panel-hide')!.addEventListener('click', () => this.onTogglePanel());
  }

  private theme() {
    return store.theme === 'dark'
      ? {
          background: '#1e1e1e',
          foreground: '#cccccc',
          cursor: '#aeafad',
          selectionBackground: '#264f78',
        }
      : {
          background: '#ffffff',
          foreground: '#333333',
          cursor: '#333333',
          selectionBackground: '#add6ff',
        };
  }

  applyTheme(): void {
    this.term.options.theme = this.theme();
  }

  connect(): void {
    if (isTauri) void this.connectTauri();
    else this.connectWeb();
  }

  private async connectTauri(): Promise<void> {
    this.disconnect();
    this.term.writeln('\x1b[90mConnecting to shell…\x1b[0m');
    try {
      const channel = new Channel<TermEvent>();
      channel.onmessage = (m) => this.handleEvent(m);
      this.channel = channel;
      this.termId = await invoke<string>('term_spawn', {
        cols: this.term.cols,
        rows: this.term.rows,
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
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/term?cols=${this.term.cols}&rows=${this.term.rows}`,
    );
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

  disconnect(): void {
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
    if (isTauri) {
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
