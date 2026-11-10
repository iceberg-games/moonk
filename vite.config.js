import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
// Dev serves HTTPS (self-signed) because WebXR needs a secure context; the Quest can open https://<LAN-IP>:5190 .
// /ws is proxied to the local game server so the page stays on one https origin (no mixed-content ws:// problems).
// Production: set VITE_BASE (e.g. /moonk/) and VITE_WS_URL (wss://your-server) at build time.
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: command === 'serve' && process.env.NO_HTTPS !== '1' ? [basicSsl()] : [],
  server: { host: '0.0.0.0', port: 5190, proxy: { '/ws': { target: 'ws://127.0.0.1:8830', ws: true, rewrite: (p) => p.replace(/^\/ws/, '') } } },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
}));
