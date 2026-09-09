const EXTENSION_KIND: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', scss: 'css', less: 'css',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json', md: 'markdown', mdx: 'markdown',
  rs: 'rust', py: 'python', java: 'java', kt: 'kotlin', kts: 'kotlin',
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
  go: 'go', php: 'php', rb: 'ruby', swift: 'swift', dart: 'dart',
  yml: 'yaml', yaml: 'yaml', toml: 'config', ini: 'config', env: 'config',
  xml: 'xml', svg: 'svg', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ps1: 'powershell', bat: 'terminal', cmd: 'terminal',
  sql: 'database', sqlite: 'database', db: 'database', lock: 'lock', zip: 'archive', vsix: 'package',
};

const SPECIAL_FILE: Record<string, string> = {
  dockerfile: 'docker', 'docker-compose.yml': 'docker', 'docker-compose.yaml': 'docker',
  'package.json': 'npm', 'package-lock.json': 'npm', 'cargo.toml': 'rust', 'cargo.lock': 'rust',
  'readme.md': 'readme', license: 'license', 'license.md': 'license', '.gitignore': 'git',
};

const SPECIAL_FOLDER: Record<string, string> = {
  src: 'source', source: 'source', assets: 'assets', public: 'public', images: 'images', img: 'images',
  test: 'test', tests: 'test', spec: 'test', docs: 'docs', examples: 'examples',
  node_modules: 'node', '.git': 'git', '.github': 'github', '.karat': 'karat',
  android: 'android', ios: 'ios', windows: 'windows', linux: 'linux', dist: 'build', build: 'build',
};

export function fileIconKind(name: string, isDirectory: boolean): string {
  const lower = name.toLowerCase();
  if (isDirectory) return `folder-${SPECIAL_FOLDER[lower] || 'default'}`;
  if (SPECIAL_FILE[lower]) return `file-${SPECIAL_FILE[lower]}`;
  const extension = lower.includes('.') ? lower.split('.').pop() || '' : '';
  return `file-${EXTENSION_KIND[extension] || 'default'}`;
}
