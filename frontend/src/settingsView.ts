import { defaultPreferences, preferences, Preferences, savePreferences } from './preferences';
import { el, toast } from './ui';

export class SettingsView {
  onChange: (preferences: Preferences) => void = () => {};
  private form = el('div', 'settings-form');

  constructor(mount: HTMLElement) {
    const header = el('div', 'side-header');
    header.innerHTML = '<span>SETTINGS</span>';
    const reset = el('button', 'btn settings-reset', 'Reset');
    reset.onclick = () => {
      savePreferences({ ...defaultPreferences });
      this.render();
      this.onChange(preferences);
      toast('Editor settings reset', 'ok');
    };
    header.append(reset);
    mount.append(header, this.form);
    this.render();
  }

  private render(): void {
    this.form.innerHTML = `
      <label>Editor font size <output>${preferences.editorFontSize}px</output>
        <input name="editorFontSize" type="range" min="11" max="24" value="${preferences.editorFontSize}">
      </label>
      <label>Terminal font size <output>${preferences.terminalFontSize}px</output>
        <input name="terminalFontSize" type="range" min="11" max="22" value="${preferences.terminalFontSize}">
      </label>
      <label>Tab size
        <select name="tabSize"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="8">8 spaces</option></select>
      </label>
      <label>Whitespace
        <select name="renderWhitespace"><option value="none">Hidden</option><option value="selection">Selection</option><option value="all">Always</option></select>
      </label>
      ${this.toggle('wordWrap', 'Word wrap', preferences.wordWrap)}
      ${this.toggle('minimap', 'Minimap', preferences.minimap)}
      ${this.toggle('stickyScroll', 'Sticky scroll', preferences.stickyScroll)}
      ${this.toggle('fontLigatures', 'Font ligatures', preferences.fontLigatures)}
      ${this.toggle('autoSave', 'Auto-save after edits', preferences.autoSave)}
      <p class="settings-note">Settings are stored locally on this device and apply immediately.</p>`;
    (this.form.querySelector('[name="tabSize"]') as HTMLSelectElement).value = String(preferences.tabSize);
    (this.form.querySelector('[name="renderWhitespace"]') as HTMLSelectElement).value =
      preferences.renderWhitespace;
    this.form.oninput = () => this.collect();
    this.form.onchange = () => this.collect();
  }

  private toggle(name: keyof Preferences, label: string, checked: boolean): string {
    return `<label class="setting-toggle"><span>${label}</span><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}></label>`;
  }

  private collect(): void {
    const read = (name: string) => this.form.querySelector(`[name="${name}"]`) as HTMLInputElement;
    const next: Preferences = {
      editorFontSize: Number(read('editorFontSize').value),
      terminalFontSize: Number(read('terminalFontSize').value),
      tabSize: Number(read('tabSize').value) as 2 | 4 | 8,
      renderWhitespace: read('renderWhitespace').value as Preferences['renderWhitespace'],
      wordWrap: read('wordWrap').checked,
      minimap: read('minimap').checked,
      stickyScroll: read('stickyScroll').checked,
      fontLigatures: read('fontLigatures').checked,
      autoSave: read('autoSave').checked,
    };
    savePreferences(next);
    this.form.querySelectorAll('input[type="range"]').forEach((range) => {
      const output = range.parentElement?.querySelector('output');
      if (output) output.textContent = `${(range as HTMLInputElement).value}px`;
    });
    this.onChange(next);
  }
}
