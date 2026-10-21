// RIVAL 무기 수치표 + 발사/재장전 상태 머신 (플레이어와 봇이 똑같이 사용)
// 밸런스를 바꾸려면 아래 숫자만 고치면 됨. 수치는 실제 게임 복제가 아니라 "그럴듯하게" 정한 값.
//   dmg      한 발(또는 한 알) 데미지      head   머리 배율        rpm     분당 발사 수
//   mag      탄창 크기                     reload 재장전 시간(초)   spread  퍼짐 각도(도) [허리사격, 정조준]
//   recoil   발사 때 화면이 위로 튀는 각도(도)   range 데미지 감소 거리(m) [온전한 거리, 최소 데미지가 되는 거리]
//   fov      정조준 시 시야각          move   이동 속도 배율     auto    꾹 누르면 연사
(function () {
  const list = {
    // ---- 주무기 ----
    ar:      { name: '돌격소총', slot: 'primary', dmg: 20, head: 2, rpm: 600, mag: 30, reload: 2.2, spread: [1.1, 0.2], recoil: 0.55, range: [35, 80], fov: 58, move: 0.95, auto: true, sfx: 'rifle', desc: '만능형 연사 소총' },
    burst:   { name: '점사소총', slot: 'primary', dmg: 22, head: 2, rpm: 300, mag: 24, reload: 2.0, spread: [0.9, 0.12], recoil: 0.7, range: [45, 90], fov: 52, move: 0.95, burst: 3, burstGap: 0.07, cooldown: 0.34, sfx: 'rifle', desc: '3발씩 끊어 쏘는 중거리 소총' },
    smg:     { name: '기관단총', slot: 'primary', dmg: 15, head: 1.8, rpm: 900, mag: 25, reload: 1.8, spread: [1.7, 0.7], recoil: 0.32, range: [18, 45], fov: 68, move: 1.05, auto: true, sfx: 'smg', desc: '근거리 최강, 이동이 빨라요' },
    shotgun: { name: '샷건', slot: 'primary', dmg: 10, head: 1.5, rpm: 70, mag: 6, reload: 0.5, startup: 0.45, shell: 0.5, pellets: 8, spread: [4.2, 3.2], recoil: 2.4, range: [10, 24], fov: 66, move: 0.95, sfx: 'shotgun', desc: '한 발씩 장전(0.5초), 근거리 한방' },
    sniper:  { name: '저격총', slot: 'primary', dmg: 90, head: 2, rpm: 42, mag: 5, reload: 2.8, spread: [7, 0.02], recoil: 3.2, range: [200, 300], fov: 20, move: 0.85, scope: true, sfx: 'sniper', desc: '헤드샷 즉사, 조준 필수' },
    lmg:     { name: '기관총', slot: 'primary', dmg: 18, head: 1.8, rpm: 750, mag: 100, reload: 4.5, spread: [1.9, 0.7], recoil: 0.5, range: [30, 75], fov: 62, move: 0.78, auto: true, sfx: 'lmg', desc: '탄이 많지만 재장전이 길고 느려요' },
    // ---- 보조무기 ----
    pistol:  { name: '권총', slot: 'secondary', dmg: 18, head: 2, rpm: 360, mag: 15, reload: 1.5, spread: [1.3, 0.35], recoil: 0.6, range: [25, 55], fov: 64, move: 1.0, sfx: 'pistol', desc: '한 번 누를 때 한 발' },
    revolver:{ name: '리볼버', slot: 'secondary', dmg: 55, head: 2, rpm: 120, mag: 6, reload: 2.5, spread: [1.0, 0.25], recoil: 2.0, range: [40, 80], fov: 56, move: 1.0, sfx: 'revolver', desc: '느리지만 두 방이면 쓰러져요' },
    // ---- 근접무기 ----
    knife:   { name: '칼', slot: 'melee', melee: true, dmg: 40, head: 1, rpm: 130, mag: 0, reload: 0, range: [2.3, 2.3], move: 1.15, auto: true, sfx: 'swing', desc: '빠르고 이동이 가장 빨라요' },
    axe:     { name: '도끼', slot: 'melee', melee: true, dmg: 75, head: 1, rpm: 55, mag: 0, reload: 0, range: [2.7, 2.7], move: 1.0, sfx: 'swing', desc: '느리지만 두 번이면 끝' },
    // ---- 유틸리티 (한 라운드에 1개, 쓰면 직전 무기로 자동 복귀) ----
    frag:    { name: '수류탄', slot: 'utility', util: 'frag', dmg: 110, rpm: 60, mag: 1, fuse: 1.8, radius: 6, move: 1.0, desc: '1.8초 뒤 폭발, 반경 6m (나도 맞아요)' },
    flash:   { name: '섬광탄', slot: 'utility', util: 'flash', rpm: 60, mag: 1, fuse: 1.2, radius: 25, move: 1.0, desc: '쳐다보는 적의 시야를 하얗게 (나도 쳐다보면 눈이 멀어요)' },
    smoke:   { name: '연막탄', slot: 'utility', util: 'smoke', rpm: 60, mag: 1, fuse: 1.0, radius: 3.4, move: 1.0, desc: '10초 동안 연기로 시야를 가려요' },
    heal:    { name: '치료 음료', slot: 'utility', util: 'heal', rpm: 60, mag: 1, heal: 40, move: 1.0, desc: '체력 40 회복 (가득 차 있으면 못 써요)' },
  };

  const bySlot = (slot) => Object.keys(list).filter((k) => list[k].slot === slot);

  // ---- 발사 상태 머신 ----
  function create(id) {
    const w = list[id];
    return { id, w, ammo: w.mag, cd: 0, reload: null, burstLeft: 0, prevTrig: false, empty: false };
  }

  // 재장전 시작. 탄창에 탄이 남아 있으면 조금 더 빠름(0.85배). 근접무기/가득 찬 탄창은 무시.
  function reload(g) {
    const w = g.w;
    if (w.melee || w.util || g.reload || g.ammo >= w.mag) return false;
    if (w.shell) g.reload = { t: 0, next: w.startup, total: w.startup + (w.mag - g.ammo - 1) * w.shell };
    else g.reload = { t: 0, total: w.reload * (g.ammo > 0 ? 0.85 : 1) };
    g.burstLeft = 0;
    return true;
  }

  function cancelReload(g) { g.reload = null; g.burstLeft = 0; }

  // 매 프레임 호출. trigger = 방아쇠를 당기고 있는지. 이번 프레임에 나간 발수(0 또는 1)를 돌려줌.
  function update(g, dt, trigger) {
    const w = g.w;
    let shots = 0;
    g.empty = false;
    if (g.cd > 0) g.cd -= dt;
    const edge = trigger && !g.prevTrig; // 이번 프레임에 새로 누름
    g.prevTrig = trigger;

    if (g.reload) {
      const r = g.reload;
      r.t += dt;
      if (w.shell) {
        while (r.t >= r.next && g.ammo < w.mag) { g.ammo++; r.next += w.shell; g.shellLoaded = true; }
        if (g.ammo >= w.mag) g.reload = null;
        else if (trigger && g.ammo > 0) g.reload = null; // 샷건은 장전 중에 쏘면 장전이 멈춤
      } else if (r.t >= r.total) {
        g.ammo = w.mag;
        g.reload = null;
      }
    }
    if (g.reload) return 0;

    if (g.burstLeft > 0) { // 점사 진행 중 (방아쇠를 놔도 끝까지 나감)
      if (g.cd <= 0 && g.ammo > 0) {
        g.ammo--; g.burstLeft--; shots = 1;
        g.cd = g.burstLeft > 0 ? w.burstGap : w.cooldown;
      } else if (g.ammo <= 0) g.burstLeft = 0;
      return shots;
    }
    if (g.cd > 0 || !trigger || !(w.auto || edge)) return 0;

    if (w.melee) { g.cd = 60 / w.rpm; return 1; }
    if (w.util) { if (g.ammo <= 0) return 0; g.ammo--; g.cd = 0.6; return 1; } // 유틸리티: 한 번 쓰면 끝
    if (g.ammo <= 0) { g.empty = true; reload(g); return 0; } // 탄이 없는데 방아쇠를 당기면 "딸깍" 후 자동 장전
    g.ammo--; shots = 1;
    if (w.burst) { g.burstLeft = w.burst - 1; g.cd = w.burstGap; }
    else g.cd = 60 / w.rpm;
    return shots;
  }

  // 거리에 따른 데미지 배율 (온전한 거리 이후 1.0 → 0.4 까지 선형 감소)
  function falloff(w, dist) {
    const r0 = w.range[0], r1 = w.range[1];
    if (dist <= r0) return 1;
    if (dist >= r1) return 0.4;
    return 1 - 0.6 * (dist - r0) / (r1 - r0);
  }

  window.RivalWeapons = { list, bySlot, create, reload, cancelReload, update, falloff };
})();
