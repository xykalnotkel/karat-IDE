import { api, Entry } from './api';
import { el, esc, toast } from './ui';
import { icon } from './icons';

function parentDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export class Explorer {
  private tree = el('div', 'tree');
  private expanded = new Set<string>(['']);
  private selected: string | null = null;

  onOpen: (path: string) => void = () => {};
  onRenamed: (from: string, to: string) => void = () => {};
  onDeleted: (path: string) => void = () => {};
  onChanged: () => void = () => {};

  constructor(mount: HTMLElement) {
    const header = el('div', 'side-header');
    header.innerHTML = '<span>EXPLORER</span>';
    const actions = el('div', 'side-actions');
    const bNewFile = el('button', 'icon-btn', icon('newFile'));
    bNewFile.title = 'New File';
    bNewFile.onclick = () => void this.create(false);
    const bNewFolder = el('button', 'icon-btn', icon('newFolder'));
    bNewFolder.title = 'New Folder';
    bNewFolder.onclick = () => void this.create(true);
    const bRefresh = el('button', 'icon-btn', icon('refresh'));
    bRefresh.title = 'Refresh';
    bRefresh.onclick = () => void this.refresh();
    actions.append(bNewFile, bNewFolder, bRefresh);
    header.append(actions);
    mount.append(header, el('div', 'ws-label', 'WORKSPACE'), this.tree);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.tree.innerHTML = '';
    await this.renderDir('', this.tree, 0);
  }

  createInRoot(isDir: boolean): void {
    this.selected = null;
    void this.create(isDir);
  }

  private baseDir(): string {
    if (!this.selected) return '';
    const row = this.tree.querySelector(
      `.tree-row[data-path="${CSS.escape(this.selected)}"]`,
    );
    if (row?.classList.contains('is-dir')) return this.selected;
    return parentDir(this.selected);
  }

  private async renderDir(dir: string, container: HTMLElement, depth: number): Promise<void> {
    let entries: Entry[];
    try {
      entries = await api.list(dir);
    } catch (e) {
      container.append(el('div', 'tree-error', esc('Failed to load: ' + (e as Error).message)));
      return;
    }
    if (entries.length === 0) {
      if (depth === 0) {
        container.append(el('div', 'tree-empty', 'Empty workspace — create a file to begin.'));
      }
      return;
    }
    for (const e of entries) {
      const open = this.expanded.has(e.path);
      const row = el(
        'div',
        'tree-row' +
          (e.is_dir ? ' is-dir' : '') +
          (this.selected === e.path ? ' selected' : ''),
      );
      row.dataset.path = e.path;
      row.style.setProperty('--depth', String(depth));
      row.title = e.path;
      row.innerHTML =
        `<span class="twisty">${
          e.is_dir ? icon(open ? 'chevronDown' : 'chevronRight', 14) : ''
        }</span>` +
        `<span class="tree-icon">${icon(e.is_dir ? 'folder' : 'file', 15)}</span>` +
        `<span class="tree-name">${esc(e.name)}</span>` +
        `<span class="row-actions"><button data-act="rename" title="Rename">${icon(
          'pencil',
          13,
        )}</button>` +
        `<button data-act="delete" title="Delete">${icon('trash', 13)}</button></span>`;
      row.addEventListener('click', (ev) => {
        const btn = (ev.target as HTMLElement).closest('button');
        if (btn) {
          ev.stopPropagation();
          const act = (btn as HTMLElement).dataset.act;
          if (act === 'rename') void this.renameEntry(e);
          else if (act === 'delete') void this.deleteEntry(e);
          return;
        }
        this.select(e.path);
        if (e.is_dir) {
          if (this.expanded.has(e.path)) this.expanded.delete(e.path);
          else this.expanded.add(e.path);
          void this.refresh();
        } else {
          this.onOpen(e.path);
        }
      });
      container.append(row);
      if (e.is_dir && open) {
        const sub = el('div', 'tree-children');
        container.append(sub);
        await this.renderDir(e.path, sub, depth + 1);
      }
    }
  }

  private select(path: string): void {
    this.selected = path;
    this.tree.querySelectorAll('.tree-row.selected').forEach((n) => n.classList.remove('selected'));
    this.tree
      .querySelector(`.tree-row[data-path="${CSS.escape(path)}"]`)
      ?.classList.add('selected');
  }

  private async create(isDir: boolean): Promise<void> {
    const name = prompt(isDir ? 'Folder name:' : 'File name (can include sub/path):');
    if (!name || !name.trim()) return;
    const base = this.baseDir();
    const full = (base ? base + '/' : '') + name.trim().replace(/^\/+/, '');
    try {
      if (isDir) await api.mkdir(full);
      else await api.save(full, '');
      this.expanded.add(base);
      // Expand intermediate dirs for nested paths.
      const parts = full.split('/');
      let acc = '';
      for (const p of parts.slice(0, -1)) {
        acc = acc ? acc + '/' + p : p;
        this.expanded.add(acc);
      }
      this.onChanged();
      await this.refresh();
      if (!isDir) this.onOpen(full);
      toast(isDir ? `Folder created: ${full}` : `File created: ${full}`, 'ok');
    } catch (e) {
      toast('Create failed: ' + (e as Error).message, 'error');
    }
  }

  private async renameEntry(e: Entry): Promise<void> {
    const name = prompt('Rename to:', e.name);
    if (!name || !name.trim() || name.trim() === e.name) return;
    const to = (parentDir(e.path) ? parentDir(e.path) + '/' : '') + name.trim();
    try {
      await api.rename(e.path, to);
      if (this.selected === e.path) this.selected = to;
      if (e.is_dir) {
        for (const p of [...this.expanded]) {
          if (p === e.path || p.startsWith(e.path + '/')) {
            this.expanded.delete(p);
            this.expanded.add(to + p.slice(e.path.length));
          }
        }
      }
      this.onRenamed(e.path, to);
      this.onChanged();
      await this.refresh();
    } catch (err) {
      toast('Rename failed: ' + (err as Error).message, 'error');
    }
  }

  private async deleteEntry(e: Entry): Promise<void> {
    if (!confirm(`Delete ${e.is_dir ? 'folder' : 'file'} "${e.path}"?`)) return;
    try {
      await api.remove(e.path);
      if (this.selected === e.path) this.selected = null;
      this.onDeleted(e.path);
      this.onChanged();
      await this.refresh();
      toast(`Deleted: ${e.path}`, 'ok');
    } catch (err) {
      toast('Delete failed: ' + (err as Error).message, 'error');
    }
  }
}
