// RIVAL 3D 모델: 무기(손에 든 것/봇이 든 것), 사람 모양 캐릭터, 이름표
// 전부 상자/원통 조합이라 그림 파일이 필요 없고 가벼움. 같은 크기/색 조각은 재사용(캐시)해서 메모리를 아낌.
(function () {
  const geoCache = {}, matCache = {};
  const box = (w, h, d) => geoCache['b' + w + ',' + h + ',' + d] || (geoCache['b' + w + ',' + h + ',' + d] = new THREE.BoxGeometry(w, h, d));
  const cyl = (r, len) => geoCache['c' + r + ',' + len] || (geoCache['c' + r + ',' + len] = new THREE.CylinderGeometry(r, r, len, 12));
  const sph = (r) => geoCache['s' + r] || (geoCache['s' + r] = new THREE.SphereGeometry(r, 12, 10));
  const mat = (c) => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c }));

  const DARK = 0x23262c, MID = 0x3a3f4a, LIGHT = 0x6b7280, WOOD = 0x6b4a2b, ACC = 0xd9a21b, METAL = 0x9aa0aa, OLIVE = 0x4a5a3a, SKIN = 0xf0c8a0;

  // 부품 표기: ['b', 가로, 높이, 길이, x, y, z, 색]  /  ['c', 반지름, 길이, x, y, z, 색, 눕힘(true면 앞뒤로 누운 원통)]  /  ['s', 반지름, x, y, z, 색]
  // 좌표 기준: 총구는 -z 방향, 오른손으로 쥔 손잡이가 원점 근처.
  const WEAPONS = {
    ar: { tip: 0.82, grip: [0, -0.09, -0.02], fore: [0, -0.045, -0.5], parts: [
      ['b', .06, .09, .34, 0, 0, -.19, DARK], ['b', .07, .07, .28, 0, -.005, -.47, MID], ['b', .022, .022, .2, 0, .005, -.7, DARK], ['b', .036, .036, .05, 0, .005, -.82, DARK],
      ['b', .03, .02, .4, 0, .055, -.3, LIGHT], ['b', .01, .04, .012, 0, .06, -.64, DARK], ['b', .03, .035, .02, 0, .075, -.06, DARK],
      ['b', .045, .15, .07, 0, -.12, -.2, MID], ['b', .04, .1, .05, 0, -.085, .0, DARK], ['b', .05, .1, .2, 0, -.02, .12, DARK], ['b', .03, .03, .1, 0, .01, .0, MID], ['b', .062, .012, .1, 0, .02, -.2, ACC]] },
    burst: { tip: 0.78, grip: [0, -0.09, -0.02], fore: [0, -0.05, -0.42], parts: [
      ['b', .06, .09, .3, 0, 0, -.16, OLIVE], ['b', .068, .075, .2, 0, -.005, -.4, DARK], ['b', .022, .022, .22, 0, .005, -.62, DARK], ['b', .034, .034, .06, 0, .005, -.74, DARK],
      ['b', .04, .045, .11, 0, .07, -.2, DARK], ['b', .02, .02, .02, 0, .075, -.2, ACC], ['b', .045, .12, .06, 0, -.105, -.2, DARK], ['b', .04, .1, .05, 0, -.085, 0, DARK], ['b', .05, .09, .2, 0, -.015, .11, OLIVE]] },
    smg: { tip: 0.55, grip: [0, -0.085, -0.02], fore: [0, -0.07, -0.28], parts: [
      ['b', .06, .1, .3, 0, 0, -.15, MID], ['b', .042, .042, .16, 0, .01, -.38, DARK], ['b', .03, .03, .05, 0, .01, -.48, DARK], ['b', .035, .19, .05, 0, -.145, -.17, DARK],
      ['b', .04, .09, .05, 0, -.08, -.02, DARK], ['b', .03, .05, .15, 0, .0, .08, METAL], ['b', .03, .025, .1, 0, .06, -.1, LIGHT], ['b', .05, .012, .1, 0, .055, -.2, ACC]] },
    shotgun: { tip: 0.95, grip: [0, -0.08, 0.02], fore: [0, -0.06, -0.5], parts: [
      ['b', .055, .08, .3, 0, 0, -.12, DARK], ['c', .02, .62, 0, .02, -.56, METAL, true], ['c', .017, .5, 0, -.03, -.5, METAL, true], ['b', .06, .055, .2, 0, -.04, -.5, WOOD],
      ['b', .05, .11, .26, 0, -.035, .14, WOOD], ['b', .04, .09, .05, 0, -.075, .0, WOOD], ['b', .008, .02, .008, 0, .05, -.86, ACC]] },
    sniper: { tip: 1.15, grip: [0, -0.085, 0.0], fore: [0, -0.05, -0.4], parts: [
      ['b', .06, .085, .46, 0, 0, -.2, OLIVE], ['c', .016, .55, 0, .01, -.7, DARK, true], ['b', .034, .034, .06, 0, .01, -.98, DARK],
      ['c', .027, .3, 0, .095, -.22, DARK, true], ['c', .032, .04, 0, .095, -.07, DARK, true], ['c', .032, .04, 0, .095, -.37, DARK, true], ['b', .02, .03, .03, 0, .06, -.1, METAL], ['b', .02, .03, .03, 0, .06, -.34, METAL],
      ['b', .06, .11, .32, 0, -.015, .2, WOOD], ['b', .02, .02, .07, .05, .02, -.04, METAL], ['b', .04, .09, .05, 0, -.08, .0, DARK], ['b', .03, .08, .05, 0, -.07, -.28, MID]] },
    lmg: { tip: 0.95, grip: [0, -0.09, 0.0], fore: [0, -0.06, -0.45], parts: [
      ['b', .08, .1, .4, 0, 0, -.2, DARK], ['b', .11, .12, .13, 0, -.115, -.22, OLIVE], ['b', .05, .05, .32, 0, 0, -.55, MID], ['c', .017, .35, 0, .005, -.8, METAL, true], ['b', .03, .03, .05, 0, .005, -.97, DARK],
      ['b', .01, .12, .01, .035, -.06, -.7, METAL], ['b', .01, .12, .01, -.035, -.06, -.7, METAL], ['b', .03, .05, .03, 0, .075, -.2, METAL], ['b', .05, .1, .22, 0, -.02, .12, DARK], ['b', .04, .09, .05, 0, -.09, 0, DARK]] },
    pistol: { tip: 0.3, grip: [0, -0.07, 0.0], fore: [0, -0.06, -0.06], parts: [
      ['b', .036, .045, .2, 0, .012, -.1, MID], ['b', .034, .03, .17, 0, -.02, -.08, DARK], ['b', .035, .1, .05, 0, -.07, -.005, DARK], ['b', .012, .012, .02, 0, .04, -.2, ACC], ['b', .014, .014, .015, 0, .038, -.02, METAL]] },
    revolver: { tip: 0.42, grip: [0, -0.075, 0.01], fore: [0, -0.06, -0.12], parts: [
      ['b', .04, .07, .1, 0, 0, -.05, METAL], ['b', .026, .032, .24, 0, .018, -.22, METAL], ['c', .033, .075, 0, .005, -.1, LIGHT, true], ['b', .04, .1, .06, 0, -.075, .01, WOOD], ['b', .012, .02, .02, 0, .045, .0, DARK], ['b', .02, .025, .03, 0, -.02, -.19, METAL]] },
    knife: { tip: 0, grip: [0, -0.0, -0.03], fore: null, parts: [
      ['b', .012, .05, .22, 0, 0, -.22, 0xdfe3e8], ['b', .006, .01, .2, 0, -.02, -.22, 0x9aa0aa], ['b', .06, .018, .012, 0, 0, -.105, DARK], ['b', .026, .03, .11, 0, -.004, -.03, DARK]] },
    axe: { tip: 0, grip: [0, 0, -0.1], fore: null, parts: [
      ['b', .028, .028, .56, 0, 0, -.2, WOOD], ['b', .016, .15, .13, 0, .04, -.5, 0xbfc4cc], ['b', .026, .05, .05, 0, .0, -.44, METAL], ['b', .012, .03, .07, 0, .03, -.38, 0x8c9199]] },
    // ---- 유틸리티 ----
    frag: { tip: 0, grip: [0, 0, -0.02], fore: null, parts: [['s', .045, 0, 0, -.05, 0x3f5a2e], ['b', .012, .02, .05, 0, .05, -.06, METAL], ['b', .02, .01, .06, .02, .05, -.1, METAL], ['c', .012, .02, 0, .045, -.05, DARK, false]] },
    flash: { tip: 0, grip: [0, 0, -0.02], fore: null, parts: [['c', .03, .13, 0, 0, -.05, 0xb8bcc4, false], ['c', .032, .02, 0, .07, -.05, DARK, false], ['b', .01, .02, .05, .02, .08, -.08, METAL]] },
    smoke: { tip: 0, grip: [0, 0, -0.02], fore: null, parts: [['c', .032, .14, 0, 0, -.05, 0x6e7580, false], ['c', .034, .02, 0, .08, -.05, DARK, false], ['b', .03, .02, .02, 0, 0, .04 - .05, ACC]] },
    heal: { tip: 0, grip: [0, 0, -0.02], fore: null, parts: [['c', .032, .12, 0, 0, -.05, 0x2f8fe5, false], ['c', .034, .02, 0, .07, -.05, METAL, false], ['c', .0335, .04, 0, 0, -.05, 0xffffff, false]] },
  };

  function addParts(g, parts) {
    parts.forEach((p) => {
      let m;
      if (p[0] === 'b') { m = new THREE.Mesh(box(p[1], p[2], p[3]), mat(p[7])); m.position.set(p[4], p[5], p[6]); }
      else if (p[0] === 'c') { m = new THREE.Mesh(cyl(p[1], p[2]), mat(p[6])); m.position.set(p[3], p[4], p[5]); if (p[7]) m.rotation.x = Math.PI / 2; }
      else { m = new THREE.Mesh(sph(p[1]), mat(p[5])); m.position.set(p[2], p[3], p[4]); }
      g.add(m);
    });
  }

  function weapon(id) {
    const def = WEAPONS[id], g = new THREE.Group();
    addParts(g, def.parts);
    if (def.tip) { // 총구 불꽃 (평소엔 숨김)
      const f = new THREE.Mesh(box(0.11, 0.11, 0.03), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
      f.position.z = -def.tip - 0.02; f.visible = false; g.add(f); g.userData.flash = f;
    }
    g.userData.def = def;
    return g;
  }

  // 1인칭 손에 든 총: 무기 + 양손/소매
  function viewmodel(id, sleeve) {
    const g = new THREE.Group(), w = weapon(id), def = WEAPONS[id];
    g.add(w);
    const arm = (pos, len) => { // 손 + 팔(뒤쪽 카메라 방향으로 뻗음)
      const hand = new THREE.Mesh(box(0.065, 0.06, 0.1), mat(SKIN)); hand.position.set(pos[0], pos[1], pos[2]); g.add(hand);
      const fore = new THREE.Mesh(box(0.075, 0.075, len), mat(sleeve)); fore.position.set(pos[0] + (pos[0] >= 0 ? 0.03 : -0.05), pos[1] - 0.045, pos[2] + len / 2 + 0.04);
      fore.rotation.x = 0.28; g.add(fore);
    };
    arm(def.grip, 0.38);
    if (def.fore) arm(def.fore, 0.55);
    g.userData.flash = w.userData.flash;
    return g;
  }

  // 이름표 (아군만 벽 너머로도 보이게 해서 위치를 알려줌)
  function nameTag(name, team) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#0009'; x.fillRect(0, 8, 256, 48);
    x.fillStyle = team === 'A' ? '#8fc0ff' : '#ff9aa0'; x.fillText(name, 128, 33);
    const t = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(1.5, 0.375, 1); s.position.y = 2.1; s.renderOrder = 10;
    return s;
  }

  // 사람 모양 캐릭터 (원점 = 발바닥, 정면 = -z)
  function humanoid(team, weaponId, name) {
    const shirt = team === 'A' ? 0x3b82f6 : 0xe5484d, dark = team === 'A' ? 0x1f3f7a : 0x7a1f26;
    const root = new THREE.Group(); root.rotation.order = 'YXZ';
    const put = (parent, geo, m, x, y, z, rx, ry) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (ry) o.rotation.y = ry; parent.add(o); return o; };
    const legs = [];
    [-0.12, 0.12].forEach((x) => { // 다리: 엉덩이를 축으로 흔들림 + 부츠
      const pv = new THREE.Group(); pv.position.set(x, 0.82, 0);
      put(pv, box(0.18, 0.78, 0.2), mat(0x2a2f3a), 0, -0.41, 0);
      put(pv, box(0.2, 0.12, 0.28), mat(0x15171c), 0, -0.74, -0.03);
      put(pv, box(0.2, 0.08, 0.22), mat(0x3a4150), 0, -0.2, 0.0);
      root.add(pv); legs.push(pv);
    });
    put(root, box(0.46, 0.08, 0.26), mat(0x1c1f26), 0, 0.84, 0); // 벨트
    const torso = put(root, box(0.46, 0.5, 0.26), new THREE.MeshLambertMaterial({ color: shirt }), 0, 1.12, 0); // 몸통(맞았을 때 깜빡이도록 전용 재질)
    put(root, box(0.5, 0.36, 0.3), mat(MID), 0, 1.16, 0); // 방탄 조끼
    put(root, box(0.1, 0.12, 0.06), mat(DARK), -0.12, 1.02, -0.17); put(root, box(0.1, 0.12, 0.06), mat(DARK), 0.12, 1.02, -0.17); // 탄창 주머니
    put(root, box(0.52, 0.09, 0.28), mat(shirt), 0, 1.36, 0); // 어깨 (팀 색)
    put(root, box(0.1, 0.07, 0.1), mat(SKIN), 0, 1.44, 0); // 목
    const head = put(root, box(0.26, 0.26, 0.26), mat(SKIN), 0, 1.6, 0);
    put(root, box(0.3, 0.12, 0.3), mat(dark), 0, 1.73, 0.0); // 헬멧
    put(root, box(0.3, 0.05, 0.1), mat(dark), 0, 1.66, -0.15); // 챙
    put(root, box(0.2, 0.06, 0.02), mat(0x0e1218), 0, 1.6, -0.135); // 고글(앞쪽 표시)
    // 들고 있는 총 (가슴 앞에 고정) + 양팔이 그 총의 손잡이/앞쪽 받침에 닿도록 연결
    const def = WEAPONS[weaponId || 'ar'], M = [0.12, 1.15, -0.12];
    const mount = new THREE.Group(); mount.position.set(M[0], M[1], M[2]); root.add(mount);
    const gun = weapon(weaponId || 'ar'); mount.add(gun);
    const rh = [M[0] + def.grip[0], M[1] + def.grip[1], M[2] + def.grip[2]];
    const lh = def.fore ? [M[0] + def.fore[0], M[1] + def.fore[1], M[2] + def.fore[2]] : [-0.05, 1.1, -0.3];
    const limb = (from, to, w) => { // 두 점을 잇는 팔
      const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const m = new THREE.Mesh(box(w, w, len), mat(shirt));
      m.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
      m.lookAt(to[0], to[1], to[2]); root.add(m);
    };
    limb([0.3, 1.3, 0], rh, 0.11); put(root, box(0.1, 0.1, 0.1), mat(SKIN), rh[0], rh[1], rh[2]);
    limb([-0.3, 1.3, 0], lh, 0.11); put(root, box(0.1, 0.1, 0.1), mat(SKIN), lh[0], lh[1], lh[2]);
    const tag = nameTag(name || '', team);
    root.add(tag);
    return { root, legs, torso, head, gun, flash: gun.userData.flash, tag };
  }

  window.RivalModels = { weapon, viewmodel, humanoid, nameTag, WEAPONS, SKIN };
})();
