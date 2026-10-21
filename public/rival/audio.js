// RIVAL 효과음: Web Audio API로 직접 합성 (음원 파일 없음).
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 막기 때문에 Sfx.init()을 버튼 클릭 안에서 불러야 함.
(function () {
  let ctx = null, master = null, noiseBuf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    // 1초짜리 흰 소음 (총소리의 "치익" 부분 재료)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function noise(dur, freq, q, vol, type) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  function tone(f0, f1, dur, vol, type) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // kind별 총소리 (소음 길이, 소음 중심 주파수, 쿵 소리 시작/끝 주파수)
  const GUN = {
    rifle:    [0.14, 1900, 0.9, 150, 55, 0.5],
    smg:      [0.09, 2600, 0.9, 190, 80, 0.4],
    shotgun:  [0.32, 900, 0.6, 110, 35, 0.9],
    sniper:   [0.5, 1200, 0.5, 90, 28, 1.0],
    lmg:      [0.15, 1500, 0.8, 120, 45, 0.55],
    pistol:   [0.11, 2200, 0.9, 170, 70, 0.4],
    revolver: [0.3, 1100, 0.6, 100, 35, 0.8],
  };

  function shot(kind, vol) {
    vol = vol === undefined ? 1 : vol;
    if (!ctx || vol < 0.03) return;
    if (kind === 'swing') { noise(0.18, 1400, 1.2, 0.35 * vol, 'highpass'); return; }
    const p = GUN[kind] || GUN.rifle;
    noise(p[0], p[1], p[2], p[5] * vol);
    tone(p[3], p[4], p[0] * 1.3, p[5] * 0.9 * vol);
  }

  window.Sfx = {
    init,
    shot,
    // 맞췄을 때 (머리면 높은 "띵")
    hit(head) { tone(head ? 1500 : 900, head ? 1900 : 600, 0.08, 0.25, 'square'); if (head) tone(2300, 2300, 0.12, 0.15, 'sine'); },
    kill() { tone(500, 900, 0.18, 0.3, 'triangle'); },
    hurt() { noise(0.12, 250, 0.8, 0.5, 'lowpass'); tone(110, 60, 0.15, 0.4); },
    empty() { tone(1200, 900, 0.03, 0.2, 'square'); },
    reload() { noise(0.05, 3000, 2, 0.25); setTimeout(() => noise(0.06, 2000, 2, 0.3), 160); },
    beep(high) { tone(high ? 1100 : 700, high ? 1100 : 700, 0.12, 0.25, 'square'); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, 0.22, 0.25, 'triangle'), i * 120)); },
    // 폭발은 멀수록 작게 (vol 0~1)
    boom(vol) { vol = vol === undefined ? 1 : vol; noise(0.7, 500, 0.4, 0.9 * vol, 'lowpass'); tone(90, 28, 0.6, 0.9 * vol); },
    flashBang(vol) { vol = vol === undefined ? 1 : vol; noise(0.25, 4000, 0.6, 0.6 * vol, 'highpass'); tone(3200, 2800, 0.5, 0.18 * vol, 'sine'); },
    smokePop() { noise(0.35, 700, 0.5, 0.35, 'bandpass'); },
    drink() { tone(300, 520, 0.12, 0.2, 'sine'); setTimeout(() => tone(340, 600, 0.12, 0.2, 'sine'), 170); setTimeout(() => tone(500, 800, 0.15, 0.22, 'triangle'), 360); },
    lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, f * 0.95, 0.3, 0.25, 'sawtooth'), i * 160)); },
  };
})();
