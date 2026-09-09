import { api } from './api';
import { discoverExtensions, InstalledExtension } from './extensions';
import { icon } from './icons';
import { invoke, isTauri } from './transport';
import { el, esc, toast } from './ui';

export class ExtensionsView {
  private list = el('div', 'extensions-list');

  constructor(mount: HTMLElement) {
    const header = el('div', 'side-header');
    header.innerHTML = '<span>EXTENSIONS</span>';
    const actions = el('div', 'side-actions');
    const install = el('button', 'icon-btn', icon('download'));
    install.title = 'Install extension from folder';
    install.onclick = () => void this.installFolder();
    const refresh = el('button', 'icon-btn', icon('refresh'));
    refresh.title = 'Refresh extensions';
    refresh.onclick = () => void this.refresh();
    actions.append(install, refresh);
    header.append(actions);
    mount.append(header, this.list);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.list.innerHTML = '';
    const extensions = await discoverExtensions();
    if (!extensions.length) {
      this.list.append(
        el(
          'div',
          'extensions-empty',
          '<b>No extensions installed</b><span>Install a folder containing <code>extension.json</code>.</span>',
        ),
      );
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
      </div>`;
    const remove = el('button', 'icon-btn extension-remove', icon('trash', 14));
    remove.title = `Uninstall ${extension.name}`;
    remove.onclick = async () => {
      if (!confirm(`Uninstall extension “${extension.name}”?`)) return;
      try {
        await api.remove(extension.folder);
        toast(`${extension.name} uninstalled. Reloading…`, 'ok');
        window.setTimeout(() => location.reload(), 450);
      } catch (error) {
        toast(`Uninstall failed: ${String(error)}`, 'error');
      }
    };
    card.append(remove);
    return card;
  }

  private async installFolder(): Promise<void> {
    if (!isTauri) {
      toast('Web mode: copy the extension into .karat/extensions/<name>.', 'info', 5000);
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
}
