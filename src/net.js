// WebSocket client for the MOONK game server. Auto-reconnect is intentionally simple: a dropped socket returns to the menu.
export function wsUrl() {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q;
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';   // dev: vite proxies /ws -> :8787
}
export class Net {
  constructor() { this.h = {}; this.ws = null; this.id = null; this.open = false; }
  on(t, fn) { (this.h[t] ||= []).push(fn); return this; }
  connect(url = wsUrl()) {
    return new Promise((ok, bad) => {
      const ws = this.ws = new WebSocket(url);
      ws.onopen = () => { this.open = true; ok(); };
      ws.onerror = () => bad(new Error('Could not reach the game server'));
      ws.onclose = () => { this.open = false; (this.h.close || []).forEach((f) => f()); };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } (this.h[m.t] || []).forEach((f) => f(m)); };
    });
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
}
