import { api } from './api';
import type { Command } from './palette';
import type { TerminalView } from './terminalView';
import { toast } from './ui';

interface ExtensionCommand {
  id: string;
  title: string;
  terminal?: string;
}

interface ExtensionManifest {
  id: string;
  name: string;
  version?: string;
  commands?: ExtensionCommand[];
}

interface ExtensionRegistry {
  extensions: ExtensionManifest[];
}

/**
 * Loads declarative, workspace-local Karat extensions. v1 intentionally does
 * not execute arbitrary JavaScript: extensions contribute commands that only
 * run after the user selects them from the command palette.
 */
export async function loadWorkspaceExtensions(terminal: TerminalView): Promise<Command[]> {
  let registry: ExtensionRegistry;
  try {
    const { content } = await api.read('.karat/extensions.json');
    registry = JSON.parse(content) as ExtensionRegistry;
  } catch {
    return [];
  }
  if (!Array.isArray(registry.extensions)) return [];

  const commands: Command[] = [];
  for (const extension of registry.extensions.slice(0, 100)) {
    if (!extension || typeof extension.id !== 'string' || typeof extension.name !== 'string') continue;
    for (const contribution of extension.commands?.slice(0, 100) ?? []) {
      if (
        typeof contribution.id !== 'string' ||
        typeof contribution.title !== 'string' ||
        typeof contribution.terminal !== 'string'
      ) {
        continue;
      }
      commands.push({
        id: `extension.${extension.id}.${contribution.id}`,
        label: `${extension.name}: ${contribution.title}`,
        hint: extension.version ?? 'workspace extension',
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
