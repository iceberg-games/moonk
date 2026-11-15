import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
// Hour-4 isolated client: HTTPS 8862, /ws -> game server 8861. Do not use the shared 5190/8830 pair.
export default defineConfig({
  root: new URL('../..', import.meta.url).pathname,
  plugins: [basicSsl()],
  server: {
    host: '0.0.0.0',
    port: 8862,
    strictPort: true,
    proxy: { '/ws': { target: 'ws://127.0.0.1:8861', ws: true, rewrite: (p) => p.replace(/^\/ws/, '') } },
  },
});
