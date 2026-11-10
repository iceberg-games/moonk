// Tiny WebAudio synth: no audio files. Call unlock() from a user gesture (the Enter VR click).
let ctx = null, master = null;
export function unlock() { if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return; ctx = new A(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); } if (ctx.state === 'suspended') ctx.resume(); }
function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
  if (!ctx) return; const t = ctx.currentTime + delay; const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.2, freq = 1200, delay = 0 } = {}) {
  if (!ctx) return; const t = ctx.currentTime + delay; const n = Math.floor(ctx.sampleRate * dur); const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; const g = ctx.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
export const sfx = {
  tap(power = 0.5, surface = 0) { tone(180 + surface * 70, 0.09, { type: 'triangle', vol: 0.15 + 0.3 * power, slide: -80 }); noise(0.06, { vol: 0.1 + 0.2 * power, freq: 900 + surface * 400 }); },
  tag() { tone(520, 0.25, { type: 'sawtooth', vol: 0.3, slide: -420 }); tone(260, 0.3, { type: 'square', vol: 0.2, slide: -200, delay: 0.05 }); },
  caught() { tone(300, 0.5, { type: 'sawtooth', vol: 0.35, slide: -250 }); noise(0.3, { vol: 0.3, freq: 400 }); },
  roar() { tone(90, 0.9, { type: 'sawtooth', vol: 0.4, slide: -40 }); noise(0.8, { vol: 0.25, freq: 300 }); },
  clank() { tone(220, 0.35, { type: 'square', vol: 0.35, slide: -60 }); tone(660, 0.3, { type: 'triangle', vol: 0.3, slide: -200, delay: 0.04 }); noise(0.2, { vol: 0.3, freq: 2200 }); },
  tick() { tone(900, 0.04, { type: 'square', vol: 0.12 }); },
  vote() { tone(660, 0.12, { type: 'triangle', vol: 0.3 }); tone(990, 0.15, { type: 'triangle', vol: 0.3, delay: 0.1 }); },
  buy() { tone(784, 0.1, { type: 'triangle', vol: 0.3 }); tone(1046, 0.1, { type: 'triangle', vol: 0.3, delay: 0.09 }); tone(1318, 0.2, { type: 'triangle', vol: 0.3, delay: 0.18 }); },
  deny() { tone(160, 0.2, { type: 'square', vol: 0.25 }); },
  form() { tone(120, 0.5, { type: 'sawtooth', vol: 0.4, slide: 300 }); noise(0.4, { vol: 0.25, freq: 600 }); },
  start() { tone(440, 0.15, { type: 'triangle', vol: 0.3 }); tone(660, 0.3, { type: 'triangle', vol: 0.3, delay: 0.15 }); },
};
export function buzz(src, power = 0.5, ms = 40) {
  try { const gp = src && src.gamepad; const a = gp?.hapticActuators?.[0]; if (a?.pulse) a.pulse(power, ms); else gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: power, weakMagnitude: power }); } catch { /* */ }
}
