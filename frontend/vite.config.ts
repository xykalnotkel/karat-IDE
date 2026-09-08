import { defineConfig } from 'vite';
import monacoPluginPkg from 'vite-plugin-monaco-editor';

// The package ships CJS with a double-wrapped default export under native ESM.
type PluginFn = (opts?: Record<string, unknown>) => unknown;
const monacoEditorPlugin =
  ((monacoPluginPkg as unknown as { default?: PluginFn }).default ??
    (monacoPluginPkg as unknown as PluginFn)) as PluginFn;

export default defineConfig({
  plugins: [monacoEditorPlugin({})],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
    },
  },
});
