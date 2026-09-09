export interface Preferences {
  editorFontSize: number;
  terminalFontSize: number;
  tabSize: 2 | 4 | 8;
  wordWrap: boolean;
  minimap: boolean;
  stickyScroll: boolean;
  fontLigatures: boolean;
  renderWhitespace: 'none' | 'selection' | 'all';
  autoSave: boolean;
}

const KEY = 'karat:preferences:v1';

export const defaultPreferences: Preferences = {
  editorFontSize: 13,
  terminalFontSize: 13,
  tabSize: 2,
  wordWrap: false,
  minimap: true,
  stickyScroll: true,
  fontLigatures: true,
  renderWhitespace: 'selection',
  autoSave: false,
};

export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Preferences>;
    return {
      editorFontSize: clampNumber(value.editorFontSize, 11, 24, defaultPreferences.editorFontSize),
      terminalFontSize: clampNumber(value.terminalFontSize, 11, 22, defaultPreferences.terminalFontSize),
      tabSize: value.tabSize === 4 || value.tabSize === 8 ? value.tabSize : 2,
      wordWrap: typeof value.wordWrap === 'boolean' ? value.wordWrap : defaultPreferences.wordWrap,
      minimap: typeof value.minimap === 'boolean' ? value.minimap : defaultPreferences.minimap,
      stickyScroll:
        typeof value.stickyScroll === 'boolean' ? value.stickyScroll : defaultPreferences.stickyScroll,
      fontLigatures:
        typeof value.fontLigatures === 'boolean' ? value.fontLigatures : defaultPreferences.fontLigatures,
      renderWhitespace:
        value.renderWhitespace === 'none' || value.renderWhitespace === 'all'
          ? value.renderWhitespace
          : 'selection',
      autoSave: typeof value.autoSave === 'boolean' ? value.autoSave : defaultPreferences.autoSave,
    };
  } catch {
    return { ...defaultPreferences };
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

export let preferences = loadPreferences();

export function savePreferences(next: Preferences): void {
  preferences = next;
  localStorage.setItem(KEY, JSON.stringify(next));
}
