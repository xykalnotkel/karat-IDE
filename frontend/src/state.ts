// Persistent UI state (tabs, theme, layout) in localStorage.

export type SideView = 'explorer' | 'search' | 'git' | 'github' | 'extensions' | 'settings';

interface Persisted {
  tabs: string[];
  active: string | null;
  view: SideView;
  theme: 'dark' | 'light';
  panel: boolean;
  sidebar: boolean;
}

class Store {
  tabs: string[] = [];
  active: string | null = null;
  view: SideView = 'explorer';
  theme: 'dark' | 'light' = 'dark';
  panel = true;
  sidebar = true;

  load(): void {
    try {
      const raw = localStorage.getItem('karat:v1');
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<Persisted>;
      if (Array.isArray(s.tabs)) this.tabs = s.tabs.filter((t) => typeof t === 'string');
      if (typeof s.active === 'string' || s.active === null) this.active = s.active ?? null;
      if (
        s.view === 'explorer' ||
        s.view === 'search' ||
        s.view === 'git' ||
        s.view === 'github' ||
        s.view === 'extensions' ||
        s.view === 'settings'
      ) {
        this.view = s.view;
      }
      if (s.theme === 'dark' || s.theme === 'light') this.theme = s.theme;
      if (typeof s.panel === 'boolean') this.panel = s.panel;
      if (typeof s.sidebar === 'boolean') this.sidebar = s.sidebar;
      if (this.active && !this.tabs.includes(this.active)) this.active = null;
    } catch {
      /* corrupted state — start fresh */
    }
  }

  save(): void {
    const s: Persisted = {
      tabs: this.tabs,
      active: this.active,
      view: this.view,
      theme: this.theme,
      panel: this.panel,
      sidebar: this.sidebar,
    };
    try {
      localStorage.setItem('karat:v1', JSON.stringify(s));
    } catch {
      /* storage full/blocked — ignore */
    }
  }
}

export const store = new Store();
