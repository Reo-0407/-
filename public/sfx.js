// 저작권 걱정 없는 합성 효과음/배경음 (Web Audio API 오실레이터로 즉석 생성)
const SFX = (() => {
  let ctx = null;
  let bgmOn = false;
  let bgmTimer = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type = 'sine', vol = 0.2) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, c.currentTime + start);
      gain.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + start + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + start);
      osc.stop(c.currentTime + start + dur + 0.05);
    } catch (e) {
      /* 오디오 미지원 환경은 조용히 무시 */
    }
  }

  return {
    unlock() {
      getCtx();
    },
    tick() {
      tone(880, 0, 0.12, 'square', 0.15);
    },
    success() {
      tone(523, 0, 0.15, 'sine', 0.2);
      tone(659, 0.12, 0.15, 'sine', 0.2);
      tone(784, 0.24, 0.3, 'sine', 0.25);
    },
    fail() {
      tone(220, 0, 0.3, 'sawtooth', 0.18);
      tone(150, 0.15, 0.4, 'sawtooth', 0.18);
    },
    click() {
      tone(600, 0, 0.05, 'square', 0.1);
    },
    penalty() {
      tone(140, 0, 0.4, 'square', 0.22);
      tone(100, 0.2, 0.5, 'square', 0.22);
    },
    startBgm() {
      if (bgmOn) return;
      bgmOn = true;
      const chords = [
        [261.6, 329.6, 392.0],
        [293.7, 349.2, 440.0],
        [246.9, 311.1, 392.0],
        [261.6, 329.6, 392.0]
      ];
      let i = 0;
      const playChord = () => {
        if (!bgmOn) return;
        chords[i % chords.length].forEach((f) => tone(f, 0, 3.6, 'sine', 0.03));
        i++;
      };
      playChord();
      bgmTimer = setInterval(playChord, 4000);
    },
    stopBgm() {
      bgmOn = false;
      if (bgmTimer) clearInterval(bgmTimer);
      bgmTimer = null;
    },
    isBgmOn() {
      return bgmOn;
    }
  };
})();
