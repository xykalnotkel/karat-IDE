import { api } from './api';
import { el, esc, fuzzy } from './ui';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Item {
  label: string;
  sub?: string;
  run: () => void;
}

const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', 'build', '.git', 'out', '.venv']);

export class Palette {
  private root = document.getElementById('palette')!;
  private input = document.getElementById('palette-input') as HTMLInputElement;
  private list = document.getElementById('palette-list') as HTMLUListElement;
  private commands: Command[] = [];
  private files: string[] = [];
  private filesLoaded = false;
  private items: Item[] = [];
  private sel = 0;

  onOpenFile: (path: string) => void = () => {};

  constructor() {
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.hide();
    });
    this.input.addEventListener('input', () => {
      this.sel = 0;
      this.render();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.move(-1);
      } else if (e.key === 'Enter') {
        const it = this.items[this.sel];
        if (it) {
          this.hide();
          it.run();
        }
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  register(cmds: Command[]): void {
    this.commands.push(...cmds);
  }

  showCommands(): void {
    this.input.value = '>';
    this.show();
  }

  showFiles(): void {
    this.input.value = '';
    this.show();
    void this.ensureFiles().then(() => this.render());
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  reloadFiles(): void {
    this.filesLoaded = false;
    this.files = [];
  }

  private show(): void {
    this.root.hidden = false;
    this.sel = 0;
    this.render();
    this.input.focus();
    this.input.select();
  }

  private async ensureFiles(): Promise<void> {
    if (this.filesLoaded) return;
    this.filesLoaded = true;
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (out.length > 4000) return;
      let entries: { name: string; path: string; is_dir: boolean }[] = [];
      try {
        entries = await api.list(dir);
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        if (e.is_dir) {
          if (SKIP_DIRS.has(e.name)) continue;
          await walk(e.path);
        } else {
          out.push(e.path);
          if (out.length > 4000) return;
        }
      }
    };
    await walk('');
    this.files = out.sort();
  }

  private move(d: number): void {
    if (!this.items.length) return;
    this.sel = (this.sel + d + this.items.length) % this.items.length;
    this.render();
    this.list.querySelector('.pal-sel')?.scrollIntoView({ block: 'nearest' });
  }

  private render(): void {
    const q = this.input.value;
    if (q.startsWith('>')) {
      const needle = q.slice(1).trim().toLowerCase();
      this.items = this.commands
        .filter(
          (c) =>
            !needle ||
            c.label.toLowerCase().includes(needle) ||
            fuzzy(c.label.toLowerCase(), needle),
        )
        .map((c) => ({ label: c.label, sub: c.hint, run: c.run }));
    } else {
      const needle = q.trim().toLowerCase();
      const pool = needle ? this.files.filter((f) => fuzzy(f.toLowerCase(), needle)) : this.files;
      this.items = pool.slice(0, 60).map((f) => ({
        label: f.split('/').pop() || f,
        sub: f,
        run: () => this.onOpenFile(f),
      }));
    }
    if (this.sel >= this.items.length) this.sel = 0;
    this.list.innerHTML = '';
    this.items.forEach((it, i) => {
      const li = el('li', 'pal-item' + (i === this.sel ? ' pal-sel' : ''));
      li.innerHTML = `<span class="pal-label">${esc(it.label)}</span>${
        it.sub ? `<span class="pal-sub">${esc(it.sub)}</span>` : ''
      }`;
      li.onclick = () => {
        this.hide();
        it.run();
      };
      li.onmousemove = () => {
        if (this.sel !== i) {
          this.sel = i;
          this.render();
        }
      };
      this.list.append(li);
    });
    if (this.items.length === 0) this.list.append(el('li', 'pal-empty', 'No matches'));
  }
}
