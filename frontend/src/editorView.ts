import * as monaco from 'monaco-editor';
import { api } from './api';
import { store } from './state';
import { el, esc, toast } from './ui';
import { icon } from './icons';
import { languageFor } from './lang';
import { fileIconKind } from './fileIcons';

export class EditorView {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private models = new Map<string, monaco.editor.ITextModel>();
  private savedVersion = new Map<string, number>();

  onCursor: (line: number, col: number, lang: string) => void = () => {};
  onDocument: (path: string | null, content: string) => void = () => {};

  constructor(
    editorMount: HTMLElement,
    private tabsEl: HTMLElement,
    private welcomeEl: HTMLElement,
  ) {
    this.editor = monaco.editor.create(editorMount, {
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13,
      fontFamily: "'JetBrains Mono','Fira Code',Consolas,'Courier New',monospace",
      fontLigatures: true,
      padding: { top: 10 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderWhitespace: 'selection',
      stickyScroll: { enabled: true },
      scrollBeyondLastLine: false,
      tabSize: 2,
      insertSpaces: true,
      fixedOverflowWidgets: true,
    });
    this.editor.onDidChangeModelContent(() => this.renderTabs());
    this.editor.onDidChangeCursorPosition((e) =>
      this.onCursor(e.position.lineNumber, e.position.column, this.activeLang()),
    );
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void this.saveActive();
    });
    this.applyTheme();
    this.renderTabs();
  }

  applyTheme(): void {
    monaco.editor.setTheme(store.theme === 'dark' ? 'vs-dark' : 'vs');
  }

  activePath(): string | null {
    return store.active;
  }

  activeContent(): string {
    return this.editor.getModel()?.getValue() ?? '';
  }

  private emitDocument(): void {
    this.onDocument(store.active, this.activeContent());
  }

  private activeLang(): string {
    return store.active ? languageFor(store.active) : 'plaintext';
  }

  private uri(path: string): monaco.Uri {
    return monaco.Uri.parse('inmemory://karat/' + path);
  }

  async openFile(path: string, line?: number): Promise<void> {
    let model = this.models.get(path);
    if (!model) {
      let content: string;
      try {
        content = (await api.read(path)).content;
      } catch (e) {
        toast('Cannot open: ' + (e as Error).message, 'error');
        // Drop stale tabs (deleted / binary files).
        store.tabs = store.tabs.filter((t) => t !== path);
        if (store.active === path) store.active = null;
        store.save();
        this.renderTabs();
        return;
      }
      model = monaco.editor.createModel(content, languageFor(path), this.uri(path));
      this.models.set(path, model);
      this.savedVersion.set(path, model.getAlternativeVersionId());
    }
    if (!store.tabs.includes(path)) store.tabs.push(path);
    store.active = path;
    store.save();
    this.editor.setModel(model);
    this.editor.focus();
    if (line && line > 0) {
      this.editor.revealLineInCenter(line);
      this.editor.setPosition({ lineNumber: line, column: 1 });
    }
    const pos = this.editor.getPosition();
    if (pos) this.onCursor(pos.lineNumber, pos.column, this.activeLang());
    this.renderTabs();
  }

  setActive(path: string): void {
    const model = this.models.get(path);
    if (!model) {
      void this.openFile(path);
      return;
    }
    store.active = path;
    store.save();
    this.editor.setModel(model);
    this.editor.focus();
    const pos = this.editor.getPosition();
    if (pos) this.onCursor(pos.lineNumber, pos.column, this.activeLang());
    this.renderTabs();
  }

  isDirty(path: string): boolean {
    const model = this.models.get(path);
    if (!model) return false;
    return model.getAlternativeVersionId() !== this.savedVersion.get(path);
  }

  async saveActive(): Promise<void> {
    if (store.active) await this.save(store.active);
  }

  async save(path: string): Promise<void> {
    const model = this.models.get(path);
    if (!model) return;
    try {
      await api.save(path, model.getValue());
      this.savedVersion.set(path, model.getAlternativeVersionId());
      this.renderTabs();
    } catch (e) {
      toast('Save failed: ' + (e as Error).message, 'error');
    }
  }

  async saveAll(): Promise<void> {
    let n = 0;
    for (const t of [...store.tabs]) {
      if (this.isDirty(t)) {
        await this.save(t);
        n++;
      }
    }
    if (n > 0) toast(`Saved ${n} file(s)`, 'ok');
  }

  closeTab(path: string): void {
    if (
      this.isDirty(path) &&
      !confirm(`"${path}" has unsaved changes. Close without saving?`)
    ) {
      return;
    }
    const model = this.models.get(path);
    if (model) model.dispose();
    this.models.delete(path);
    this.savedVersion.delete(path);
    store.tabs = store.tabs.filter((t) => t !== path);
    if (store.active === path) {
      store.active = store.tabs.length ? store.tabs[store.tabs.length - 1] : null;
      const next = store.active ? this.models.get(store.active) ?? null : null;
      this.editor.setModel(next);
    }
    store.save();
    this.renderTabs();
  }

  /** Close every tab (used when switching workspace folder). */
  closeAll(): void {
    const dirty = store.tabs.filter((t) => this.isDirty(t));
    if (dirty.length > 0 && !confirm(`You have ${dirty.length} unsaved file(s). Discard changes?`)) {
      return;
    }
    for (const t of [...store.tabs]) {
      const m = this.models.get(t);
      if (m) m.dispose();
      this.models.delete(t);
      this.savedVersion.delete(t);
    }
    store.tabs = [];
    store.active = null;
    this.editor.setModel(null);
    store.save();
    this.renderTabs();
  }

  /** Close a file or a whole renamed/deleted directory subtree. */
  closeUnder(path: string): void {
    const doomed = store.tabs.filter((t) => t === path || t.startsWith(path + '/'));
    for (const t of doomed) this.closeTab(t);
  }

  /** Retarget open tabs after a rename (file or directory). */
  retarget(from: string, to: string): void {
    const move = (oldP: string, newP: string) => {
      const model = this.models.get(oldP);
      if (model) {
        this.models.delete(oldP);
        this.models.set(newP, model);
        monaco.editor.setModelLanguage(model, languageFor(newP));
        const v = this.savedVersion.get(oldP);
        this.savedVersion.delete(oldP);
        if (v !== undefined) this.savedVersion.set(newP, v);
      }
    };
    for (const t of [...store.tabs]) {
      const nt = t === from ? to : t.startsWith(from + '/') ? to + t.slice(from.length) : null;
      if (nt) {
        move(t, nt);
        store.tabs[store.tabs.indexOf(t)] = nt;
        if (store.active === t) store.active = nt;
      }
    }
    store.save();
    this.renderTabs();
  }

  focus(): void {
    this.editor.focus();
  }

  renderTabs(): void {
    this.tabsEl.innerHTML = '';
    for (const t of store.tabs) {
      const name = t.split('/').pop() || t;
      const dirty = this.isDirty(t);
      const tab = el(
        'div',
        'tab' + (t === store.active ? ' active' : '') + (dirty ? ' dirty' : ''),
      );
      tab.title = t + (dirty ? ' (unsaved)' : '');
      tab.setAttribute('role', 'tab');
      tab.innerHTML = `<span class="tab-file-icon ${fileIconKind(name, false)}">${icon('file', 14)}</span><span class="tab-name">${esc(name)}</span>`;
      const x = el('button', 'tab-close', dirty ? '<span class="dot"></span>' : icon('close', 14));
      x.title = 'Close';
      x.onclick = (ev) => {
        ev.stopPropagation();
        this.closeTab(t);
      };
      tab.append(x);
      tab.onclick = () => this.setActive(t);
      tab.onauxclick = (ev) => {
        if (ev.button === 1) this.closeTab(t);
      };
      this.tabsEl.append(tab);
    }
    this.welcomeEl.hidden = store.tabs.length > 0;
    this.emitDocument();
  }
}
