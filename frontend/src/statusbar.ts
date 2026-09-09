import { el, esc } from './ui';
import { icon } from './icons';

export class StatusBar {
  private left = el('div', 'sb-left');
  private right = el('div', 'sb-right');
  private branchBtn: HTMLElement;
  private posEl: HTMLElement;
  private langEl: HTMLElement;

  onBranchClick: () => void = () => {};
  onPanelClick: () => void = () => {};

  constructor(mount: HTMLElement) {
    this.branchBtn = el('button', 'sb-item', `${icon('git', 13)} <span>no repo</span>`);
    this.branchBtn.title = 'Source Control';
    (this.branchBtn as HTMLButtonElement).onclick = () => this.onBranchClick();
    const panelBtn = el('button', 'sb-item', icon('terminal', 13));
    panelBtn.title = 'Toggle panel';
    (panelBtn as HTMLButtonElement).onclick = () => this.onPanelClick();
    this.left.append(this.branchBtn, panelBtn);

    this.posEl = el('div', 'sb-item', 'Ln 1, Col 1');
    this.langEl = el('div', 'sb-item', 'plaintext');
    const enc = el('div', 'sb-item', 'UTF-8');
    const eol = el('div', 'sb-item', 'LF');
    const ver = el('div', 'sb-item', 'Karat v0.3.0 · XySpace');
    this.right.append(this.posEl, this.langEl, enc, eol, ver);
    mount.append(this.left, this.right);
  }

  setBranch(b: string | null): void {
    this.branchBtn.innerHTML = `${icon('git', 13)} <span>${b ? esc(b) : 'no repo'}</span>`;
  }

  setCursor(line: number, col: number, lang: string): void {
    this.posEl.textContent = `Ln ${line}, Col ${col}`;
    this.langEl.textContent = lang;
  }
}
