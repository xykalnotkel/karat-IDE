import { api } from './api';
import {
  discoverExtensions,
  setWorkerHostEnabled,
  workerHostEnabled,
  InstalledExtension,
} from './extensions';
import { icon } from './icons';
import { isMobile } from './mobile';
import { invoke, isTauri } from './transport';
import { el, esc, toast } from './ui';

interface OpenVsxExtension {
  namespace: string;
  name: string;
  displayName?: string;
  version: string;
  description?: string;
  downloadCount?: number;
  verified?: boolean;
  files?: { download?: string };
}

export class ExtensionsView {
  private list = el('div', 'extensions-list');
  private gallery = el('div', 'extensions-gallery');
  private search: HTMLInputElement;

  constructor(mount: HTMLElement) {
    const header = el('div', 'side-header');
    header.innerHTML = '<span>EXTENSIONS</span>';
    const actions = el('div', 'side-actions');
    const install = el('button', 'icon-btn', icon('download'));
    install.title = 'Install extension from folder';
    install.onclick = () => void this.installFolder();
    const vsix = el('button', 'icon-btn', icon('package'));
    vsix.title = 'Install a local VSIX';
    vsix.hidden = isMobile;
    vsix.onclick = () => void this.installVsix();
    const refresh = el('button', 'icon-btn', icon('refresh'));
    refresh.title = 'Refresh extensions';
    refresh.onclick = () => void this.refresh();
    actions.append(install, vsix, refresh);
    header.append(actions);

    const searchBox = el('div', 'extension-search');
    this.search = el('input');
    this.search.placeholder = 'Search Open VSX…';
    this.search.setAttribute('aria-label', 'Search Open VSX');
    const searchButton = el('button', 'icon-btn', icon('search'));
    searchButton.title = 'Search Open VSX';
    searchButton.onclick = () => void this.searchOpenVsx();
    this.search.onkeydown = (event) => {
      if (event.key === 'Enter') void this.searchOpenVsx();
    };
    searchBox.append(this.search, searchButton);
    mount.append(header, searchBox, this.list, this.gallery);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.list.innerHTML = '<div class="git-group">Installed</div>';
    const extensions = await discoverExtensions();
    if (!extensions.length) {
      this.list.append(el('div', 'extensions-empty compact', '<span>No extensions installed.</span>'));
      return;
    }
    for (const extension of extensions) this.list.append(this.card(extension));
  }

  private card(extension: InstalledExtension): HTMLElement {
    const card = el('article', 'extension-card');
    card.innerHTML = `
      <div class="extension-mark">${esc(extension.name.slice(0, 1).toUpperCase())}</div>
      <div class="extension-info">
        <div class="extension-title">${esc(extension.name)}</div>
        <div class="extension-meta">v${esc(extension.version)} · ${esc(extension.author)}</div>
        <div class="extension-desc">${esc(extension.description || 'Workspace extension')}</div>
        ${extension.permissions.length ? `<div class="extension-meta">Permissions: ${esc(extension.permissions.join(', '))}</div>` : ''}
      </div>`;
    if (extension.worker) {
      const enabled = workerHostEnabled(extension.id);
      const worker = el('button', `worker-toggle${enabled ? ' enabled' : ''}`, enabled ? 'Worker enabled' : 'Enable worker');
      worker.title = 'Experimental restricted JavaScript worker host';
      worker.onclick = () => {
        if (!enabled) {
          const consent = confirm(
            `EXPERIMENTAL EXTENSION CODE\n\nEnable restricted JavaScript for “${extension.name}”? ` +
              'Its code will run in an isolated Web Worker without Karat file, shell, Node.js, or network APIs. ' +
              'This is limited Karat compatibility—not the VS Code Extension Host. Only enable extensions you trust.',
          );
          if (!consent) return;
        }
        setWorkerHostEnabled(extension.id, !enabled);
        toast(`Restricted worker ${enabled ? 'disabled' : 'enabled'}. Reloading…`, 'info');
        window.setTimeout(() => location.reload(), 500);
      };
      card.append(worker);
    }
    const remove = el('button', 'icon-btn extension-remove', icon('trash', 14));
    remove.title = `Uninstall ${extension.name}`;
    remove.onclick = async () => {
      if (!confirm(`Uninstall extension “${extension.name}”?`)) return;
      try {
        await api.remove(extension.folder);
        setWorkerHostEnabled(extension.id, false);
        toast(`${extension.name} uninstalled. Reloading…`, 'ok');
        window.setTimeout(() => location.reload(), 450);
      } catch (error) {
        toast(`Uninstall failed: ${String(error)}`, 'error');
      }
    };
    card.append(remove);
    return card;
  }

  private async searchOpenVsx(): Promise<void> {
    const query = this.search.value.trim();
    if (!query) return;
    this.gallery.innerHTML = '<div class="extensions-loading">Searching Open VSX…</div>';
    try {
      const response = await fetch(`https://open-vsx.org/api/-/search?size=20&query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = (await response.json()) as { extensions?: OpenVsxExtension[] };
      const extensions = result.extensions ?? [];
      this.gallery.innerHTML = '<div class="git-group">Open VSX results</div>';
      if (!extensions.length) this.gallery.append(el('div', 'extensions-empty compact', 'No results.'));
      for (const extension of extensions) this.gallery.append(this.marketCard(extension));
    } catch (error) {
      this.gallery.innerHTML = `<div class="extensions-empty compact">${esc(`Open VSX failed: ${String(error)}`)}</div>`;
    }
  }

  private marketCard(extension: OpenVsxExtension): HTMLElement {
    const card = el('article', 'extension-card marketplace-card');
    const title = extension.displayName || extension.name;
    card.innerHTML = `
      <div class="extension-mark market">${esc(title.slice(0, 1).toUpperCase())}</div>
      <div class="extension-info">
        <div class="extension-title">${esc(title)} ${extension.verified ? '<span class="verified">✓</span>' : ''}</div>
        <div class="extension-meta">${esc(extension.namespace)} · v${esc(extension.version)} · ${(extension.downloadCount ?? 0).toLocaleString()} downloads</div>
        <div class="extension-desc">${esc(extension.description || 'Open VSX extension')}</div>
      </div>`;
    const button = el('button', 'btn extension-install', 'Install');
    button.onclick = () => void this.installOpenVsx(extension, button);
    card.append(button);
    return card;
  }

  private async installOpenVsx(extension: OpenVsxExtension, button: HTMLButtonElement): Promise<void> {
    if (!isTauri) {
      toast('Open VSX installation requires the Karat desktop or Android app', 'info', 5000);
      return;
    }
    const downloadUrl = extension.files?.download;
    if (!downloadUrl) {
      toast('This Open VSX result has no VSIX download', 'error');
      return;
    }
    button.disabled = true;
    button.textContent = 'Installing…';
    try {
      const id = await invoke<string>('install_openvsx_extension', {
        namespace: extension.namespace,
        name: extension.name,
        downloadUrl,
      });
      toast(`${id} installed with safe Karat compatibility mode`, 'ok', 5000);
      await this.refresh();
      button.textContent = 'Installed';
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Install';
      toast(`Install failed: ${error instanceof Error ? error.message : String(error)}`, 'error', 7000);
    }
  }

  private async installFolder(): Promise<void> {
    if (!isTauri) {
      toast('Web mode: copy the extension into .karat/extensions/<name>.', 'info', 5000);
      return;
    }
    if (isMobile) {
      toast('Android: install extensions directly from Open VSX below.', 'info', 5000);
      this.search.focus();
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const folder = await open({ directory: true, multiple: false, title: 'Select extension folder' });
      if (typeof folder !== 'string') return;
      const id = await invoke<string>('install_extension', { source: folder });
      toast(`Extension ${id} installed. Reloading…`, 'ok');
      window.setTimeout(() => location.reload(), 450);
    } catch (error) {
      toast(`Install failed: ${error instanceof Error ? error.message : String(error)}`, 'error', 6000);
    }
  }

  private async installVsix(): Promise<void> {
    if (!isTauri || isMobile) return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const source = await open({
        directory: false,
        multiple: false,
        title: 'Install VSIX',
        filters: [{ name: 'VS Code Extension', extensions: ['vsix'] }],
      });
      if (typeof source !== 'string') return;
      const id = await invoke<string>('install_vsix', { source });
      toast(`${id} imported in safe compatibility mode`, 'ok', 5000);
      await this.refresh();
    } catch (error) {
      toast(`VSIX import failed: ${error instanceof Error ? error.message : String(error)}`, 'error', 7000);
    }
  }
}
