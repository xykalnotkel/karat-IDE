import { api } from './api';
import type { Command } from './palette';
import type { TerminalView } from './terminalView';
import { toast } from './ui';

export interface ExtensionCommand {
  id: string;
  title: string;
  terminal?: string;
}

export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  folder: string;
  commands: ExtensionCommand[];
}

interface RawManifest {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  description?: unknown;
  author?: unknown;
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

/**
 * Extension v1 is intentionally declarative. It never evaluates third-party
 * JavaScript; contributed terminal commands only run after an explicit click.
 */
export async function loadWorkspaceExtensions(terminal: TerminalView): Promise<Command[]> {
  const extensions = await discoverExtensions();
  const commands: Command[] = [];
  for (const extension of extensions) {
    for (const contribution of extension.commands.slice(0, 100)) {
      if (typeof contribution.terminal !== 'string') continue;
      commands.push({
        id: `extension.${extension.id}.${contribution.id}`,
        label: `${extension.name}: ${contribution.title}`,
        hint: `${extension.version} · ${extension.author}`,
        run: () => {
          if (!terminal.connected) terminal.connect();
          window.setTimeout(() => terminal.runCommand(contribution.terminal!), 350);
          toast(`Extension command: ${contribution.title}`, 'info');
        },
      });
    }
  }
  return commands;
}
