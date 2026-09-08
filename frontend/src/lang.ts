// Filename -> Monaco language id, plus simple "run in terminal" mapping.

const MAP: Record<string, string> = {
  rs: 'rust',
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  py: 'python',
  pyi: 'python',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  xml: 'xml',
  sql: 'sql',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  r: 'r',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  hs: 'haskell',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  clj: 'clojure',
  vim: 'vim',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gitignore: 'ignore',
  ignore: 'ignore',
  tex: 'latex',
  vue: 'vue',
  svelte: 'html',
};

export function languageFor(path: string): string {
  const base = (path.split('/').pop() || '').toLowerCase();
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'dockerfile';
  if (base === 'makefile' || base === 'gnumakefile') return 'makefile';
  const dot = base.lastIndexOf('.');
  if (dot === -1) return 'plaintext';
  return MAP[base.slice(dot + 1)] ?? 'plaintext';
}

/** Interpreter used by the "Run Active File" command. Null = no runner. */
export function runnerFor(path: string): string | null {
  const ext = (path.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'py':
      return 'python3';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'node';
    case 'sh':
      return 'bash';
    case 'rb':
      return 'ruby';
    case 'php':
      return 'php';
    case 'lua':
      return 'lua';
    case 'pl':
      return 'perl';
    default:
      return null;
  }
}
