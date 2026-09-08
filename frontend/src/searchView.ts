import { api } from './api';
import { el, esc } from './ui';

export class SearchView {
  onOpen: (path: string, line: number) => void = () => {};
  private input: HTMLInputElement;
  private results = el('div', 'search-results');
  private meta = el('div', 'search-meta');

  constructor(mount: HTMLElement) {
    const header = el('div', 'side-header');
    header.innerHTML = '<span>SEARCH</span>';
    const box = el('div', 'search-box');
    this.input = el('input', 'search-input');
    this.input.placeholder = 'Search in files…';
    this.input.spellcheck = false;
    const btn = el('button', 'btn', 'Search');
    btn.onclick = () => void this.run();
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.run();
    });
    box.append(this.input, btn);
    mount.append(header, box, this.meta, this.results);
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }

  async run(): Promise<void> {
    const q = this.input.value.trim();
    this.results.innerHTML = '';
    this.meta.textContent = '';
    if (!q) return;
    this.meta.textContent = 'Searching…';
    try {
      const { results, truncated } = await api.search(q);
      const files = new Set(results.map((r) => r.path)).size;
      this.meta.textContent =
        results.length === 0
          ? 'No results'
          : `${results.length} result(s) in ${files} file(s)${truncated ? ' (truncated)' : ''}`;
      let last = '';
      for (const h of results) {
        if (h.path !== last) {
          last = h.path;
          this.results.append(el('div', 'hit-file', esc(h.path)));
        }
        const row = el('div', 'hit-row');
        row.innerHTML = `<span class="hit-line">${h.line}</span><span class="hit-text">${esc(
          h.text,
        )}</span>`;
        row.title = `${h.path}:${h.line}`;
        row.onclick = () => this.onOpen(h.path, h.line);
        this.results.append(row);
      }
    } catch (e) {
      this.meta.textContent = 'Search failed: ' + (e as Error).message;
    }
  }
}
