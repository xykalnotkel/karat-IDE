import { api } from './api';
import type { Command } from './palette';
import type { TerminalView } from './terminalView';
import { toast } from './ui';

export interface ExtensionCommand {
  id: string;
  title: string;
  terminal?: string;
  worker?: string;
}

export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  folder: string;
  worker: string;
  permissions: string[];
  commands: ExtensionCommand[];
}

interface RawManifest {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  description?: unknown;
  author?: unknown;
  worker?: unknown;
  permissions?: unknown;
  commands?: unknown;
}

function parseManifest(raw: RawManifest, folder: string): InstalledExtension | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const commands = Array.isArray(raw.commands)
    ? raw.commands.filter(
        (item): item is ExtensionCommand =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as ExtensionCommand).id === 'string' &&
          typeof (item as ExtensionCommand).title === 'string',
      )
    : [];
  return {
    id: raw.id,
    name: raw.name,
    version: typeof raw.version === 'string' ? raw.version : '0.0.0',
    description: typeof raw.description === 'string' ? raw.description : '',
    author: typeof raw.author === 'string' ? raw.author : 'Unknown author',
    folder,
    worker:
      typeof raw.worker === 'string' &&
      /^[A-Za-z0-9_./-]+\.js$/.test(raw.worker) &&
      Array.isArray(raw.permissions) &&
      raw.permissions.includes('experimentalWorker')
        ? raw.worker
        : '',
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions.filter((item): item is string => typeof item === 'string').slice(0, 20)
      : [],
    commands,
  };
}

/** Discover `.karat/extensions/<folder>/extension.json` manifests. */
export async function discoverExtensions(): Promise<InstalledExtension[]> {
  const found: InstalledExtension[] = [];
  try {
    const folders = await api.list('.karat/extensions');
    for (const folder of folders.filter((entry) => entry.is_dir).slice(0, 100)) {
      try {
        const { content } = await api.read(`${folder.path}/extension.json`);
        const extension = parseManifest(JSON.parse(content) as RawManifest, folder.path);
        if (extension) found.push(extension);
      } catch {
        // A broken extension must never stop the editor from starting.
      }
    }
  } catch {
    // No extensions directory yet.
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export function workerHostEnabled(id: string): boolean {
  return localStorage.getItem(`karat:extension-worker:${id}`) === 'enabled';
}

export function setWorkerHostEnabled(id: string, enabled: boolean): void {
  const key = `karat:extension-worker:${id}`;
  if (enabled) localStorage.setItem(key, 'enabled');
  else localStorage.removeItem(key);
}

async function runWorkerCommand(extension: InstalledExtension, command: string): Promise<void> {
  const source = (await api.read(`${extension.folder}/${extension.worker}`)).content;
  const bootstrap = `
    globalThis.fetch = () => Promise.reject(new Error('network permission denied'));
    globalThis.XMLHttpRequest = undefined;
    globalThis.WebSocket = undefined;
    globalThis.EventSource = undefined;
    globalThis.importScripts = undefined;
    globalThis.Worker = undefined;
    ${source}
    self.onmessage = async (event) => {
      try {
        const handlers = globalThis.karatExtension && globalThis.karatExtension.commands;
        if (!handlers || typeof handlers[event.data.command] !== 'function') throw new Error('worker command not registered');
        const value = await handlers[event.data.command]({ workspace: 'restricted', arguments: [] });
        self.postMessage({ ok: true, value });
      } catch (error) {
        self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    };`;
  const url = URL.createObjectURL(new Blob([bootstrap], { type: 'text/javascript' }));
  const worker = new Worker(url);
  try {
    const result = await new Promise<{ ok: boolean; value?: unknown; error?: string }>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('extension worker timed out after 5 seconds')), 5000);
      worker.onmessage = (event) => {
        window.clearTimeout(timer);
        resolve(event.data as { ok: boolean; value?: unknown; error?: string });
      };
      worker.onerror = (event) => {
        window.clearTimeout(timer);
        reject(new Error(event.message));
      };
      worker.postMessage({ command });
    });
    if (!result.ok) throw new Error(result.error || 'extension worker failed');
    const text = typeof result.value === 'string' ? result.value : JSON.stringify(result.value ?? 'Done');
    toast(`${extension.name}: ${text.slice(0, 240)}`, 'ok', 5000);
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

/** Load declarative commands and explicitly enabled restricted workers. */
export async function loadWorkspaceExtensions(terminal: TerminalView): Promise<Command[]> {
  const extensions = await discoverExtensions();
  const commands: Command[] = [];
  for (const extension of extensions) {
    for (const contribution of extension.commands.slice(0, 100)) {
      if (typeof contribution.terminal === 'string') {
        commands.push({
          id: `extension.${extension.id}.${contribution.id}`,
          label: `${extension.name}: ${contribution.title}`,
          hint: `${extension.version} · terminal command`,
          run: () => {
            if (!terminal.connected) terminal.connect();
            window.setTimeout(() => terminal.runCommand(contribution.terminal!), 350);
            toast(`Extension command: ${contribution.title}`, 'info');
          },
        });
      } else if (
        typeof contribution.worker === 'string' &&
        extension.worker &&
        workerHostEnabled(extension.id)
      ) {
        commands.push({
          id: `extension.${extension.id}.${contribution.id}`,
          label: `${extension.name}: ${contribution.title}`,
          hint: `${extension.version} · restricted worker`,
          run: () => void runWorkerCommand(extension, contribution.worker!),
        });
      }
    }
  }
  return commands;
}
