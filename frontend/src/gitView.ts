import { api, GitFile, GitStatus } from './api';
import { el, esc, toast } from './ui';
import { icon } from './icons';

export class GitView {
  onOpen: (path: string) => void = () => {};
  onBranch: (branch: string | null) => void = () => {};
  private list = el('div', 'git-list');
  private msg: HTMLInputElement;
  private branchEl = el('div', 'git-branch');

  constructor(mount: HTMLElement) {
    const header = el('div', 'side-header');
    header.innerHTML = '<span>SOURCE CONTROL</span>';
    const acts = el('div', 'side-actions');
    const bRefresh = el('button', 'icon-btn', icon('refresh'));
    bRefresh.title = 'Refresh';
    bRefresh.onclick = () => void this.refresh();
    acts.append(bRefresh);
    header.append(acts);

    const commitBox = el('div', 'git-commit');
    this.msg = el('input', 'git-msg');
    this.msg.placeholder = 'Commit message…';
    const bCommit = el('button', 'btn primary', 'Commit');
    bCommit.onclick = () => void this.commit();
    this.msg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.commit();
    });
    commitBox.append(this.msg, bCommit);

    const stageAll = el('button', 'btn wide', 'Stage all');
    stageAll.onclick = async () => {
      try {
        await api.gitAdd([]);
        toast('All changes staged', 'ok');
        void this.refresh();
      } catch (e) {
        toast('Stage failed: ' + (e as Error).message, 'error');
      }
    };

    mount.append(header, this.branchEl, commitBox, stageAll, this.list);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    let st: GitStatus;
    try {
      st = await api.gitStatus();
    } catch (e) {
      this.list.innerHTML = `<div class="git-empty">${esc('Failed: ' + (e as Error).message)}</div>`;
      return;
    }
    if (!st.repo) {
      this.branchEl.innerHTML = '';
      this.onBranch(null);
      this.list.innerHTML =
        '<div class="git-empty">Not a git repository.<br/>Run <code>git init</code> in the terminal.</div>';
      return;
    }
    this.onBranch(st.branch ?? null);
    this.branchEl.innerHTML = `${icon('git', 14)} <b>${esc(st.branch || '')}</b>`;
    const files = st.files ?? [];
    this.list.innerHTML = '';
    if (files.length === 0) {
      this.list.append(el('div', 'git-empty', 'No changes.'));
      return;
    }
    const isStaged = (f: GitFile) => f.staged !== ' ' && f.staged !== '?';
    const staged = files.filter(isStaged);
    const changes = files.filter((f) => !isStaged(f));
    if (staged.length) {
      this.list.append(el('div', 'git-group', 'Staged Changes'));
      staged.forEach((f) => this.list.append(this.row(f, true)));
    }
    if (changes.length) {
      this.list.append(el('div', 'git-group', 'Changes'));
      changes.forEach((f) => this.list.append(this.row(f, false)));
    }
  }

  private badge(f: GitFile): string {
    if (f.staged === '?' || f.unstaged === '?') return 'U';
    if (f.staged === 'A' || f.unstaged === 'A') return 'A';
    if (f.staged === 'D' || f.unstaged === 'D') return 'D';
    if (f.staged === 'R' || f.unstaged === 'R') return 'R';
    return 'M';
  }

  private row(f: GitFile, staged: boolean): HTMLElement {
    const row = el('div', 'git-row');
    const b = this.badge(f);
    row.innerHTML =
      `<span class="git-badge b-${b}">${b}</span>` +
      `<span class="git-path" title="${esc(f.path)}">${esc(f.path)}</span>`;
    if (!staged) {
      const btn = el('button', 'icon-btn sm', icon('plus', 14));
      btn.title = 'Stage';
      btn.onclick = async (ev) => {
        ev.stopPropagation();
        try {
          await api.gitAdd([f.path]);
          void this.refresh();
        } catch (e) {
          toast('Stage failed: ' + (e as Error).message, 'error');
        }
      };
      row.append(btn);
    }
    row.onclick = () => this.onOpen(f.path);
    return row;
  }

  private async commit(): Promise<void> {
    const m = this.msg.value.trim();
    if (!m) {
      toast('Write a commit message first', 'error');
      return;
    }
    try {
      const r = await api.gitCommit(m);
      if (r.ok) {
        toast('Committed', 'ok');
        this.msg.value = '';
        void this.refresh();
      } else {
        toast('Commit failed: ' + r.output, 'error', 6000);
      }
    } catch (e) {
      toast('Commit failed: ' + (e as Error).message, 'error');
    }
  }
}
