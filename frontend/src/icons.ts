// Minimal inline SVG icon set (16x16, stroke = currentColor).

const P: Record<string, string> = {
  files: `<rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/>`,
  search: `<circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/>`,
  git: `<circle cx="5" cy="5" r="1.8"/><circle cx="5" cy="11" r="1.8"/><circle cx="11" cy="8" r="1.8"/><path d="M5 6.8v2.4M6.5 6.2c2.5 0 1 3.6 3.5 3.6"/>`,
  gear: `<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3"/>`,
  newFile: `<path d="M4.5 1.5h4l3 3V9"/><path d="M8.5 1.5v3h3"/><path d="M11 11.5v4M9 13.5h4"/>`,
  newFolder: `<path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 2h4.5v5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1z"/><path d="M12 10v4M10 12h4"/>`,
  refresh: `<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 1.5v3h-3"/>`,
  chevronRight: `<path d="M6 4l4 4-4 4"/>`,
  chevronDown: `<path d="M4 6l4 4 4-4"/>`,
  chevronUp: `<path d="M4 10l4-4 4 4"/>`,
  close: `<path d="M4 4l8 8M12 4l-8 8"/>`,
  plus: `<path d="M8 3v10M3 8h10"/>`,
  trash: `<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/><path d="M6.5 7v4M9.5 7v4"/>`,
  pencil: `<path d="M11.5 2.5l2 2L5 13H3v-2z"/>`,
  check: `<path d="M3 8.5l3.5 3.5L13 4.5"/>`,
  terminal: `<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M5 6.5l2 2-2 2M8.5 11H11"/>`,
  sun: `<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"/>`,
  moon: `<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 4.6 4.6 0 1 0 13 9.5z"/>`,
  file: `<path d="M4.5 1.5h4l3 3v10h-7z"/><path d="M8.5 1.5v3h3"/>`,
  folder: `<path d="M1.5 4a1 1 0 0 1 1-1h3l1.5 2h5.5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1z"/>`,
  play: `<path d="M5 2.5l8 5.5-8 5.5z"/>`,
  extensions: `<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><path d="M11.5 9v5M9 11.5h5"/>`,
  download: `<path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 13h10"/>`,
  github: `<path d="M8 1.7a6.3 6.3 0 0 0-2 12.3c.3.1.4-.1.4-.3v-1.2c-1.8.4-2.2-.8-2.2-.8-.3-.7-.7-.9-.7-.9-.6-.4 0-.4 0-.4.6 0 1 .7 1 .7.6 1 1.5.7 1.9.5.1-.4.2-.7.4-.8-1.4-.2-2.9-.7-2.9-3.1 0-.7.2-1.2.7-1.7-.1-.2-.3-.8.1-1.7 0 0 .6-.2 1.8.7a6.5 6.5 0 0 1 3.3 0c1.2-.9 1.8-.7 1.8-.7.4.9.2 1.5.1 1.7.4.5.7 1 .7 1.7 0 2.4-1.5 2.9-2.9 3.1.2.2.4.6.4 1.1v1.8c0 .2.1.4.4.3A6.3 6.3 0 0 0 8 1.7z"/>`,
  preview: `<path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>`,
  external: `<path d="M9 2h5v5M14 2L7.5 8.5"/><path d="M12 9v4H3V4h4"/>`,
  package: `<path d="M2 5l6-3 6 3v6l-6 3-6-3z"/><path d="M2 5l6 3 6-3M8 8v6"/>`,
};

export function icon(name: string, size = 16): string {
  const body = P[name] ?? P.file;
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
