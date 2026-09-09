import './styles.css';
import { api } from './api';
import { store, SideView } from './state';
import { el, esc, toast, showModal, hideModal, modalOpen } from './ui';
import { icon } from './icons';
import { invoke, isTauri } from './transport';
import { isMobile } from './mobile';
import { Explorer } from './explorer';
import { EditorView } from './editorView';
import { TerminalView } from './terminalView';
import { SearchView } from './searchView';
import { GitView } from './gitView';
import { Palette, Command } from './palette';
import { StatusBar } from './statusbar';
import { runnerFor } from './lang';
import { loadWorkspaceExtensions } from './extensions';

// ---------- theme ----------

function applyTheme(): void {
  document.documentElement.dataset.theme = store.theme;
  document.getElementById('theme-btn')!.innerHTML = icon(store.theme === 'dark' ? 'sun' : 'moon');
}

function showShortcuts(): void {
  const rows: [string, string][] = [
    ['Ctrl+S', 'Save active file'],
    ['Ctrl+P', 'Quick open file'],
    ['Ctrl+Shift+P', 'Command palette'],
    ['Ctrl+Shift+F', 'Search in files'],
    ['Ctrl+B', 'Toggle sidebar'],
    ['Ctrl+`', 'Toggle terminal panel'],
    ['Ctrl+F', 'Find in file (editor)'],
    ['Middle-click tab', 'Close tab'],
    ['Esc', 'Close dialog / palette'],
  ];
  showModal(
    'Keyboard Shortcuts',
    `<table>${rows
      .map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`)
      .join('')}</table>`,
  );
}

function showAbout(): void {
  showModal(
    'About Karat',
    `<p><b>Karat v0.1.0</b> — a lightweight IDE crafted with Rust.</p>
     <p>Desktop: Tauri + Rust core with files, search, Git, and PTY terminal.<br>
     Android: private-workspace editor and search. Web: local Axum backend.</p>
     <p>Roadmap: Language Server Protocol, debugging (DAP), extensions.</p>`,
  );
}

// ---------- workspace root ----------

async function ensureRoot(): Promise<void> {
  if (!isTauri) return;
  if (isMobile) {
    // No folder picker on mobile — use the app's private storage.
    const dir = await invoke<string>('default_root');
    await invoke('set_root', { path: dir });
    localStorage.setItem('karat:root', dir);
    return;
  }
  const saved = localStorage.getItem('karat:root') || '';
  if (saved) {
    try {
      await invoke('set_root', { path: saved });
      return;
    } catch {
      localStorage.removeItem('karat:root');
    }
  }
  // First run (or a folder was moved): start in a guaranteed writable user
  // location. On Windows this is Documents/Karat Workspace.
  const dir = await invoke<string>('default_root');
  await invoke('set_root', { path: dir });
  localStorage.setItem('karat:root', dir);
}

// ---------- app ----------

function start(): void {
  const editor = new EditorView(
    document.getElementById('editor')!,
    document.getElementById('tabs')!,
    document.getElementById('welcome')!,
  );
  const explorer = new Explorer(document.getElementById('view-explorer')!);
  const searchView = new SearchView(document.getElementById('view-search')!);
  const gitView = new GitView(document.getElementById('view-git')!);
  const terminal = new TerminalView(document.getElementById('terminal')!);
  const palette = new Palette();
  const status = new StatusBar(document.getElementById('statusbar')!);

  const sidebar = document.getElementById('sidebar')!;
  const panel = document.getElementById('panel')!;
  const activitybar = document.getElementById('activitybar')!;
  const menuPop = document.getElementById('menu-pop')!;

  function toggleTheme(): void {
    store.theme = store.theme === 'dark' ? 'light' : 'dark';
    store.save();
    applyTheme();
    editor.applyTheme();
    terminal.applyTheme();
  }

  async function refreshTitle(): Promise<void> {
    if (!isTauri) return;
    try {
      const root = await invoke<string>('get_root');
      const base = root.replace(/\\/g, '/').split('/').filter(Boolean).pop() || root;
      document.title = `${base} — Karat`;
    } catch {
      /* keep default title */
    }
  }

  async function openFolder(): Promise<void> {
    if (!isTauri) {
      toast('Open Folder is only available in the desktop app', 'info');
      return;
    }
    if (isMobile) {
      toast('The mobile app uses its own private storage', 'info');
      return;
    }
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sel = await open({ directory: true, multiple: false, title: 'Open workspace folder' });
    if (typeof sel !== 'string') return;
    try {
      await invoke('set_root', { path: sel });
      localStorage.setItem('karat:root', sel);
      editor.closeAll();
      palette.reloadFiles();
      await explorer.refresh();
      await gitView.refresh();
      await refreshTitle();
      toast('Opened: ' + sel, 'ok');
    } catch (e) {
      toast('Cannot open folder: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  }

  // ----- sidebar / panel -----

  // Git depends on the `git` CLI, which doesn't exist on mobile — hide it there.
  const VIEWS: { id: SideView; icon: string; title: string }[] = [
    { id: 'explorer', icon: 'files', title: 'Explorer' },
    { id: 'search', icon: 'search', title: 'Search (Ctrl+Shift+F)' },
    ...(isMobile ? [] : [{ id: 'git' as SideView, icon: 'git', title: 'Source Control' }]),
  ];

  function setSidebar(show: boolean): void {
    store.sidebar = show;
    store.save();
    sidebar.classList.toggle('closed', !show);
  }

  function setPanel(show: boolean): void {
    // Native PTYs are deliberately desktop/web-only.
    if (isMobile) show = false;
    store.panel = show;
    store.save();
    panel.classList.toggle('closed', !show);
    if (show) {
      if (!terminal.connected) terminal.connect();
      else terminal.refit();
    }
  }

  function syncView(): void {
    for (const v of VIEWS) {
      document.getElementById(`view-${v.id}`)!.hidden = store.view !== v.id;
    }
    // Keep the hidden git section out of the way on mobile.
    if (isMobile) document.getElementById('view-git')!.hidden = true;
    activitybar.querySelectorAll('.act-btn[data-view]').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.view === store.view),
    );
  }

  function setView(v: SideView): void {
    if (v === 'git' && isMobile) return;
    if (store.view === v && !sidebar.classList.contains('closed')) {
      setSidebar(false);
      return;
    }
    store.view = v;
    store.save();
    syncView();
    setSidebar(true);
  }

  for (const v of VIEWS) {
    const b = el('button', 'act-btn', icon(v.icon, 22));
    b.title = v.title;
    b.dataset.view = v.id;
    b.onclick = () => setView(v.id);
    activitybar.append(b);
  }
  activitybar.append(el('div', 'act-spacer'));
  // No script runners on mobile — hide the Run button there.
  if (!isMobile) {
    const runBtn = el('button', 'act-btn', icon('play', 22));
    runBtn.title = 'Run Active File in Terminal';
    runBtn.onclick = () => void runActiveFile();
    activitybar.append(runBtn);
  }
  const settingsBtn = el('button', 'act-btn', icon('gear', 22));
  settingsBtn.title = 'Command Palette';
  settingsBtn.onclick = () => palette.showCommands();
  activitybar.append(settingsBtn);

  // ----- cross-view wiring -----

  explorer.onOpen = (p) => void editor.openFile(p);
  explorer.onRenamed = (f, t) => {
    editor.retarget(f, t);
    palette.reloadFiles();
    if (!isMobile) void gitView.refresh();
  };
  explorer.onDeleted = (p) => {
    editor.closeUnder(p);
    palette.reloadFiles();
    if (!isMobile) void gitView.refresh();
  };
  explorer.onChanged = () => {
    palette.reloadFiles();
    if (!isMobile) void gitView.refresh();
  };
  searchView.onOpen = (p, l) => void editor.openFile(p, l);
  if (!isMobile) {
    gitView.onOpen = (p) => void editor.openFile(p);
    gitView.onBranch = (b) => status.setBranch(b);
  }
  editor.onCursor = (l, c, lang) => status.setCursor(l, c, lang);
  palette.onOpenFile = (p) => void editor.openFile(p);
  terminal.onTogglePanel = () => setPanel(false);
  status.onBranchClick = () => {
    if (isMobile) return;
    setView('git');
    void gitView.refresh();
  };
  status.onPanelClick = () => setPanel(!store.panel);

  // ----- run active file -----

  async function runActiveFile(): Promise<void> {
    const active = editor.activePath();
    if (!active) {
      toast('No file open to run', 'error');
      return;
    }
    await editor.save(active);
    let cmd: string | null = null;
    try {
      const names = new Set((await api.list('')).map((e) => e.name));
      if (names.has('Cargo.toml')) {
        cmd = 'cargo run';
      } else if (names.has('package.json')) {
        try {
          const pkg = JSON.parse((await api.read('package.json')).content) as {
            scripts?: Record<string, string>;
          };
          const scripts = Object.keys(pkg.scripts ?? {});
          if (scripts.includes('dev')) cmd = 'npm run dev';
          else if (scripts.includes('start')) cmd = 'npm start';
          else {
            toast('package.json has no dev/start script', 'error');
            return;
          }
        } catch {
          toast('Cannot read package.json', 'error');
          return;
        }
      } else if (names.has('Makefile')) {
        cmd = 'make';
      }
    } catch (e) {
      toast('Run failed: ' + (e as Error).message, 'error');
      return;
    }
    if (!cmd) {
      const runner = runnerFor(active);
      if (!runner) {
        toast('No runner for this file type — run it manually in the terminal', 'error');
        return;
      }
      cmd = `${runner} '${active.replace(/'/g, `'\\''`)}'`;
    }
    setPanel(true);
    if (!terminal.connected) {
      terminal.connect();
      await new Promise((r) => setTimeout(r, 700));
    }
    terminal.runCommand(cmd);
    toast(`Running: ${cmd}`, 'info');
  }

  // ----- menus -----

  interface MenuItem {
    label?: string;
    shortcut?: string;
    action?: () => void;
    sep?: boolean;
  }

  const MENUS: { label: string; items: MenuItem[] }[] = [
    {
      label: 'File',
      items: [
        ...(isTauri && !isMobile
          ? [
              { label: 'Open Folder…', action: () => void openFolder() },
              { sep: true },
            ]
          : []),
        { label: 'New File', action: () => explorer.createInRoot(false) },
        { label: 'New Folder', action: () => explorer.createInRoot(true) },
        { sep: true },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => void editor.saveActive() },
        { label: 'Save All', action: () => void editor.saveAll() },
        { sep: true },
        {
          label: 'Close Tab',
          action: () => {
            const a = editor.activePath();
            if (a) editor.closeTab(a);
          },
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Command Palette…',
          shortcut: 'Ctrl+Shift+P',
          action: () => palette.showCommands(),
        },
        { label: 'Quick Open…', shortcut: 'Ctrl+P', action: () => palette.showFiles() },
        { sep: true },
        { label: 'Explorer', action: () => setView('explorer') },
        {
          label: 'Search',
          action: () => {
            setView('search');
            searchView.focus();
          },
        },
        ...(isMobile ? [] : [{ label: 'Source Control', action: () => setView('git') }]),
        { sep: true },
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => setSidebar(!store.sidebar) },
        { label: 'Toggle Panel', shortcut: 'Ctrl+`', action: () => setPanel(!store.panel) },
        { sep: true },
        { label: 'Toggle Theme', action: () => toggleTheme() },
      ],
    },
    {
      label: 'Terminal',
      items: [
        {
          label: 'New Terminal',
          action: () => {
            setPanel(true);
            terminal.connect();
          },
        },
        { label: 'Clear Terminal', action: () => terminal.clear() },
        ...(isMobile
          ? []
          : [{ sep: true }, { label: 'Run Active File', action: () => void runActiveFile() }]),
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', action: showShortcuts },
        { label: 'About Karat', action: showAbout },
      ],
    },
  ];

  const menusNav = document.getElementById('menus')!;
  let openMenu = -1;

  function closeMenu(): void {
    menuPop.hidden = true;
    openMenu = -1;
    menusNav.querySelectorAll('.menu-btn').forEach((b) => b.classList.remove('open'));
  }

  function renderMenu(m: { items: MenuItem[] }, anchor: HTMLElement): void {
    menuPop.innerHTML = '';
    for (const it of m.items) {
      if (it.sep) {
        menuPop.append(el('div', 'menu-sep'));
        continue;
      }
      const row = el(
        'div',
        'menu-item',
        `<span>${esc(it.label ?? '')}</span>${
          it.shortcut ? `<span class="menu-shortcut">${esc(it.shortcut)}</span>` : ''
        }`,
      );
      row.onclick = () => {
        closeMenu();
        it.action?.();
      };
      menuPop.append(row);
    }
    const r = anchor.getBoundingClientRect();
    menuPop.style.left = `${r.left}px`;
    menuPop.style.top = `${r.bottom + 4}px`;
    menuPop.hidden = false;
  }

  MENUS.forEach((m, i) => {
    const b = el('button', 'menu-btn', esc(m.label));
    b.onclick = (e) => {
      e.stopPropagation();
      if (openMenu === i) {
        closeMenu();
        return;
      }
      openMenu = i;
      menusNav.querySelectorAll('.menu-btn').forEach((x) => x.classList.remove('open'));
      b.classList.add('open');
      renderMenu(m, b);
    };
    b.onmouseenter = () => {
      if (openMenu !== -1 && openMenu !== i) {
        openMenu = i;
        menusNav.querySelectorAll('.menu-btn').forEach((x) => x.classList.remove('open'));
        b.classList.add('open');
        renderMenu(m, b);
      }
    };
    menusNav.append(b);
  });

  document.addEventListener('click', (e) => {
    if (!menuPop.hidden && !(e.target as HTMLElement).closest('#menu-pop')) closeMenu();
  });

  // ----- palette commands -----

  const commands: Command[] = [
    ...(isTauri && !isMobile
      ? [{ id: 'file.open', label: 'File: Open Folder…', run: () => void openFolder() }]
      : []),
    { id: 'file.new', label: 'File: New File', run: () => explorer.createInRoot(false) },
    { id: 'file.folder', label: 'File: New Folder', run: () => explorer.createInRoot(true) },
    { id: 'file.save', label: 'File: Save', hint: 'Ctrl+S', run: () => void editor.saveActive() },
    { id: 'file.saveAll', label: 'File: Save All', run: () => void editor.saveAll() },
    {
      id: 'file.close',
      label: 'View: Close Tab',
      run: () => {
        const a = editor.activePath();
        if (a) editor.closeTab(a);
      },
    },
    { id: 'view.explorer', label: 'View: Show Explorer', run: () => setView('explorer') },
    {
      id: 'view.search',
      label: 'View: Show Search',
      hint: 'Ctrl+Shift+F',
      run: () => {
        setView('search');
        searchView.focus();
      },
    },
    ...(isMobile ? [] : [{ id: 'view.git', label: 'View: Show Source Control', run: () => setView('git') }]),
    {
      id: 'view.sidebar',
      label: 'View: Toggle Sidebar',
      hint: 'Ctrl+B',
      run: () => setSidebar(!store.sidebar),
    },
    {
      id: 'view.panel',
      label: 'View: Toggle Panel',
      hint: 'Ctrl+`',
      run: () => setPanel(!store.panel),
    },
    { id: 'view.theme', label: 'Preferences: Toggle Theme', run: () => toggleTheme() },
    {
      id: 'term.new',
      label: 'Terminal: New Terminal',
      run: () => {
        setPanel(true);
        terminal.connect();
      },
    },
    { id: 'term.clear', label: 'Terminal: Clear', run: () => terminal.clear() },
    ...(isMobile
      ? []
      : [
          {
            id: 'term.run',
            label: 'Run: Run Active File in Terminal',
            run: () => void runActiveFile(),
          },
        ]),
    ...(isMobile ? [] : [{ id: 'git.refresh', label: 'Git: Refresh', run: () => void gitView.refresh() }]),
    { id: 'help.keys', label: 'Help: Keyboard Shortcuts', run: showShortcuts },
    { id: 'help.about', label: 'Help: About Karat', run: showAbout },
  ];
  palette.register(commands);
  if (!isMobile) {
    void loadWorkspaceExtensions(terminal).then((extensionCommands) => {
      palette.register(extensionCommands);
      if (extensionCommands.length) toast(`Loaded ${extensionCommands.length} extension command(s)`, 'ok');
    });
  }

  // ----- global shortcuts -----

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (palette.visible) palette.hide();
      else if (!menuPop.hidden) closeMenu();
      else if (modalOpen()) hideModal();
      return;
    }
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 's' && !e.shiftKey) {
      e.preventDefault();
      void editor.saveActive();
    } else if (k === 'p' && e.shiftKey) {
      e.preventDefault();
      palette.showCommands();
    } else if (k === 'p') {
      e.preventDefault();
      palette.showFiles();
    } else if (e.key === '`' && !e.shiftKey) {
      e.preventDefault();
      setPanel(!store.panel);
    } else if (k === 'b' && !e.shiftKey) {
      e.preventDefault();
      setSidebar(!store.sidebar);
    } else if (k === 'f' && e.shiftKey) {
      e.preventDefault();
      setView('search');
      searchView.focus();
    }
  });

  // ----- titlebar / welcome buttons -----

  document.getElementById('quickopen-btn')!.onclick = () => palette.showFiles();
  document.getElementById('theme-btn')!.onclick = () => toggleTheme();
  document.getElementById('term-new')!.innerHTML = icon('plus', 15);
  document.getElementById('term-clear')!.innerHTML = icon('trash', 15);
  document.getElementById('panel-hide')!.innerHTML = icon('chevronDown', 15);
  document.getElementById('w-new')!.onclick = () => explorer.createInRoot(false);
  document.getElementById('w-palette')!.onclick = () => palette.showCommands();
  document.getElementById('w-open')!.onclick = () => palette.showFiles();

  // ----- init -----

  sidebar.classList.toggle('closed', !store.sidebar);
  panel.classList.toggle('closed', !store.panel);
  if (isMobile) setPanel(false); // no PTY on phones (yet)
  syncView();

  (async () => {
    const wantActive = store.active;
    for (const t of [...store.tabs]) {
      await editor.openFile(t);
    }
    if (wantActive && store.tabs.includes(wantActive)) {
      editor.setActive(wantActive);
    } else {
      editor.renderTabs();
    }
    if (!isMobile) {
      terminal.connect();
      void gitView.refresh();
    }
    void refreshTitle();
    if (isMobile) {
      toast('Mobile build: files live in private app storage. Git is desktop-only for now.', 'info', 5000);
    }
  })();
}

// ---------- boot ----------

store.load();
applyTheme();
ensureRoot()
  .then(start)
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    document.body.innerHTML = `<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:sans-serif;background:#1e1e1e;color:#ccc"><p>Karat failed to start: ${esc(
      msg,
    )}</p></div>`;
  });
