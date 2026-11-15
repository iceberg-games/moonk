// WebSocket client for the MOONK game server.
// Dev: Vite proxies /ws -> the local game server (port 8830) so the HTTPS page
// does not open a mixed-content ws:// socket. Production builds should set
// VITE_WS_URL to a wss:// host at build time. Auto-reconnect is intentionally
// simple: a dropped socket returns the lobby computer to an offline state
// (the caller shows Retry); a dropped in-round socket also leaves the room.
export function wsUrl() {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q;
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
export class Net {
  constructor() { this.h = {}; this.ws = null; this.id = null; this.open = false; this.url = null; }
  on(t, fn) { (this.h[t] ||= []).push(fn); return this; }
  _emit(t, m) { (this.h[t] || []).forEach((f) => { try { f(m); } catch (e) { console.warn(e); } }); }
  connect(url = wsUrl()) {
    if (this.open && this.ws && this.ws.readyState === 1 && this.url === url) return Promise.resolve();
    if (this._pending && this.url === url) return this._pending;
    this.url = url;
    const pending = new Promise((ok, bad) => {
      const prev = this.ws;
      this.ws = null;
      this.open = false;
      if (prev) { try { prev.onclose = null; prev.onerror = null; prev.onmessage = null; prev.close(); } catch { /* */ } }
      let settled = false;
      const finish = (fn, arg) => { if (settled) return; settled = true; if (this._pending === pending) this._pending = null; fn(arg); };
      let ws;
      try { ws = this.ws = new WebSocket(url); } catch (e) { queueMicrotask(() => finish(bad, new Error('Could not reach the game server'))); return; }
      const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } finish(bad, new Error('Could not reach the game server')); }, 8000);
      ws.onopen = () => { if (this.ws !== ws) return; this.open = true; clearTimeout(timer); finish(ok); };
      ws.onerror = () => { /* settled by onclose or the timeout */ };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        const was = this.open;
        this.open = false;
        clearTimeout(timer);
        if (!settled) finish(bad, new Error('Could not reach the game server'));
        this._emit('close', { wasOpen: was });
      };
      ws.onmessage = (e) => { if (this.ws !== ws) return; let m; try { m = JSON.parse(e.data); } catch { return; } this._emit(m.t, m); };
    });
    this._pending = pending;
    return pending;
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
}
