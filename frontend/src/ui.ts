// Small DOM / formatting helpers shared by all views.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

export function toast(msg: string, kind: 'info' | 'ok' | 'error' = 'info', ms = 3500): void {
  const wrap = document.getElementById('toasts')!;
  const t = el('div', `toast ${kind}`, esc(msg));
  wrap.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

export function showModal(title: string, bodyHTML: string): void {
  const modal = document.getElementById('modal')!;
  const box = document.getElementById('modal-box')!;
  box.innerHTML = `<button class="modal-close" aria-label="Close">×</button><h2>${esc(
    title,
  )}</h2><div class="modal-body">${bodyHTML}</div>`;
  modal.hidden = false;
  box.querySelector('.modal-close')!.addEventListener('click', hideModal);
  modal.onclick = (e) => {
    if (e.target === modal) hideModal();
  };
}

export function hideModal(): void {
  document.getElementById('modal')!.hidden = true;
}

export function modalOpen(): boolean {
  return !document.getElementById('modal')!.hidden;
}

// --- unicode-safe base64 (for terminal bytes over JSON) ---

export function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64decode(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// --- subsequence fuzzy match for quick-open ---

export function fuzzy(hay: string, needle: string): boolean {
  let j = 0;
  for (let i = 0; i < hay.length && j < needle.length; i++) {
    if (hay[i] === needle[j]) j++;
  }
  return j === needle.length;
}
