import { icon } from './icons';
import { esc, toast } from './ui';

export class LivePreview {
  private frame: HTMLIFrameElement;
  private timer = 0;
  private visible = false;
  private path: string | null = null;
  private content = '';

  constructor(private mount: HTMLElement) {
    mount.innerHTML = `<div class="preview-header"><span>${icon('preview', 15)} LIVE PREVIEW</span><button class="icon-btn preview-close" title="Close preview">${icon('close')}</button></div>`;
    this.frame = document.createElement('iframe');
    this.frame.className = 'preview-frame';
    this.frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    this.frame.setAttribute('title', 'Karat live HTML preview');
    mount.append(this.frame);
    (mount.querySelector('.preview-close') as HTMLButtonElement).onclick = () => this.hide();
  }

  update(path: string | null, content: string): void {
    this.path = path;
    this.content = content;
    if (!this.visible) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 180);
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    if (!this.path || !/\.html?$/i.test(this.path)) {
      toast('Open an HTML file to use Live Preview', 'info');
      return;
    }
    this.visible = true;
    this.mount.hidden = false;
    document.body.classList.add('preview-open');
    this.render();
  }

  hide(): void {
    this.visible = false;
    this.mount.hidden = true;
    document.body.classList.remove('preview-open');
  }

  private render(): void {
    if (!this.path || !/\.html?$/i.test(this.path)) return;
    const baseNotice = `<!-- Karat Live Preview: ${esc(this.path)}. Relative workspace assets require a future preview server. -->`;
    this.frame.srcdoc = `${baseNotice}\n${this.content}`;
  }
}
