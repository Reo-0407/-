// RIVAL 클라이언트: 닉네임/로비/리더보드 + 매치(봇 대전, 라운드제) + 사격/재장전/조준 + 모바일 조작
(function () {
  const $ = (id) => document.getElementById(id);
  const W = window.RivalWeapons, Sfx = window.Sfx, Phys = window.RivalPhys;
  const DEG = Math.PI / 180, EYE = 1.7;
  const ROUND_TIME = 90, COUNTDOWN = 3, BETWEEN = 3.2;
  const qs = new URLSearchParams(location.search);
  const WIN_ROUNDS = Math.max(1, parseInt(qs.get('rounds'), 10) || 5); // 먼저 이기면 승리하는 라운드 수 (테스트용으로 ?rounds=1 가능)
  const DEBUG = qs.has('debug');
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // =====================================================================
  // 저장소 / 내 정체성 / 서버 통신
  // =====================================================================
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  let myId = safeGet('rival_id');
  if (!myId) { myId = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); safeSet('rival_id', myId); }
  let myNick = safeGet('rival_nick') || '';
  let myStats = null;

  async function api(path, body) {
    const res = await fetch('/api/rival' + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '서버 오류');
    return data;
  }

  function show(name) {
    ['screen-nick', 'screen-lobby', 'game'].forEach((id) => $(id).classList.toggle('hidden', id !== name));
  }

  // =====================================================================
  // 설정 (브라우저에 저장)
  // =====================================================================
  const defaults = { sens: 1, fov: 80, auto: isTouch, mode: 2, diff: 'normal', loadout: { primary: 'ar', secondary: 'pistol', melee: 'knife', utility: 'frag' } };
  let settings = Object.assign({}, defaults);
  try { Object.assign(settings, JSON.parse(safeGet('rival_settings') || '{}')); } catch (e) {}
  settings.loadout = Object.assign({}, defaults.loadout, settings.loadout);
  ['primary', 'secondary', 'melee', 'utility'].forEach((s) => { const id = settings.loadout[s]; if (!W.list[id] || W.list[id].slot !== s) settings.loadout[s] = defaults.loadout[s]; });
  const saveSettings = () => safeSet('rival_settings', JSON.stringify(settings));

  // =====================================================================
  // 닉네임
  // =====================================================================
  async function submitNick() {
    $('nick-err').textContent = '';
    try {
      const r = await api('/join', { id: myId, nick: $('nick-input').value });
      myNick = r.nick; myStats = r.stats;
      safeSet('rival_nick', myNick);
      enterLobby();
    } catch (e) { $('nick-err').textContent = e.message; }
  }
  $('nick-btn').onclick = submitNick;
  $('nick-input').onkeydown = (e) => { if (e.key === 'Enter') submitNick(); };
  $('nick-change').onclick = () => { $('nick-input').value = myNick; show('screen-nick'); };

  // =====================================================================
  // 로비: 리더보드 / 로드아웃 / 설정
  // =====================================================================
  async function loadBoard() {
    try {
      const rows = await api('/leaderboard');
      const tb = $('board').querySelector('tbody');
      tb.innerHTML = '';
      rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        const medal = ['🥇', '🥈', '🥉'][i] || i + 1;
        [medal, r.nick, r.wins, r.kills, r.deaths].forEach((v, ci) => {
          const td = document.createElement('td');
          td.textContent = v; // textContent: 닉네임에 HTML이 들어가도 그냥 글자로만 표시됨
          if (ci === 1 && r.nick === myNick) td.style.color = '#ff4d5e';
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      $('board-empty').textContent = '아직 기록이 없어요. 첫 번째 주인공이 되세요!';
      $('board-empty').classList.toggle('hidden', rows.length > 0);
    } catch (e) {
      $('board-empty').textContent = '리더보드를 불러오지 못했어요.';
      $('board-empty').classList.remove('hidden');
    }
  }

  function weaponInfoText(id) {
    const w = W.list[id];
    if (w.util) return w.name + ': ' + w.desc;
    if (w.melee) return w.name + ': ' + w.desc + ' — 데미지 ' + w.dmg + ', 초당 ' + (w.rpm / 60).toFixed(1) + '회';
    const reload = w.shell ? '한 발씩 ' + w.shell + '초' : w.reload + '초';
    return w.name + ': ' + w.desc + ' — 데미지 ' + w.dmg + (w.pellets ? '×' + w.pellets : '') + ', 탄창 ' + w.mag + '발, 재장전 ' + reload;
  }

  function renderLoadout() {
    const box = $('loadout');
    box.innerHTML = '';
    [['primary', '주무기'], ['secondary', '보조'], ['melee', '근접'], ['utility', '유틸']].forEach(([slot, label]) => {
      const row = document.createElement('div'); row.className = 'slotrow';
      const sp = document.createElement('span'); sp.textContent = label; row.appendChild(sp);
      W.bySlot(slot).forEach((id) => {
        const b = document.createElement('button');
        b.className = 'chip' + (settings.loadout[slot] === id ? ' on' : '');
        b.textContent = W.list[id].name;
        b.onclick = () => { settings.loadout[slot] = id; saveSettings(); renderLoadout(); $('weapon-info').textContent = weaponInfoText(id); };
        row.appendChild(b);
      });
      box.appendChild(row);
    });
  }

  function initSettingsUI() {
    $('set-mode').value = String(settings.mode);
    $('set-diff').value = settings.diff;
    $('set-sens').value = settings.sens; $('v-sens').textContent = settings.sens;
    $('set-fov').value = settings.fov; $('v-fov').textContent = settings.fov;
    $('set-auto').checked = !!settings.auto;
    $('set-mode').onchange = (e) => { settings.mode = +e.target.value; saveSettings(); };
    $('set-diff').onchange = (e) => { settings.diff = e.target.value; saveSettings(); };
    $('set-sens').oninput = (e) => { settings.sens = +e.target.value; $('v-sens').textContent = settings.sens; saveSettings(); };
    $('set-fov').oninput = (e) => { settings.fov = +e.target.value; $('v-fov').textContent = settings.fov; saveSettings(); };
    $('set-auto').onchange = (e) => { settings.auto = e.target.checked; saveSettings(); };
    renderLoadout();
    $('weapon-info').textContent = weaponInfoText(settings.loadout.primary);
    $('controls-hint').innerHTML = isTouch
      ? '왼쪽 화면: 이동(끝까지 밀면 달리기) · 오른쪽 화면: 드래그로 시점<br>발사/조준(누를 때마다 켜기·끄기)/장전/점프 버튼 · 아래 버튼으로 무기 교체<br>폰을 <b>가로</b>로 돌려서 플레이하세요.'
      : 'PC: WASD 이동 · 마우스 시점 · 좌클릭 발사 · 우클릭 조준 · R 장전<br>1·2·3·4 또는 휠 무기 교체(4=유틸) · Tab 점수판 · Space 점프 · Shift 달리기 · Esc 일시정지';
  }

  function enterLobby() {
    $('lobby-nick').textContent = myNick;
    $('my-stats').textContent = myStats ? '내 전적: ' + myStats.wins + '승 ' + myStats.losses + '패 · ' + myStats.kills + '킬 ' + myStats.deaths + '데스' : '';
    show('screen-lobby');
    loadBoard();
  }

  // =====================================================================
  // 3D 세계
  // =====================================================================
  let renderer, scene, camera, gunScene, gunCam, world, phys, botsApi;
  let started = false, raf = 0, last = 0, now = 0, mobilePlaying = false;
  const boxes = [];
  const keys = {};
  const joy = { x: 0, y: 0 };
  const inp = { fire: false, adsHold: false, adsToggle: false };

  // 플레이어 (봇과 같은 모양의 entity)
  const P = { id: 'me', name: '나', team: 'A', isBot: false, x: 0, y: EYE, z: 27, vy: 0, onGround: true, yaw: 0, pitch: 0, hp: 100, alive: true, firedT: 0, kills: 0, deaths: 0, flashT: 0 };
  let guns = [], cur = 0, lastCur = 0, switchT = 0;
  let adsT = 0, recoilAcc = 0, vmKick = 0, vmRaise = 0, swingT = 0, flashT = 0, dmgT = 0, hmT = 0, xhGap = 8, bannerT = 0, deadCamY = EYE;
  let lastHurt = 0, vm = null, curFov = 80, spawnPoint = { x: 0, z: 27, yaw: 0 };

  const all = () => [P].concat(botsApi ? botsApi.bots : []);
  const enemiesOf = (team) => all().filter((e) => e.team !== team && e.alive);

  function initGL() {
    renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !isTouch });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
    renderer.autoClear = false;
    if (!isTouch) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    camera = new THREE.PerspectiveCamera(80, 1, 0.05, 220);
    camera.rotation.order = 'YXZ';
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9db7d4);
    scene.fog = new THREE.Fog(0x9db7d4, 45, 130);
    world = RivalMap.build(scene, { shadows: !isTouch });
    world.boxes.forEach((b) => boxes.push(b));
    phys = Phys.create(boxes);
    // 손에 든 총은 별도 장면에 그려서 벽에 파묻히지 않게 함
    gunScene = new THREE.Scene();
    gunScene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(1, 2, 1); gunScene.add(dl);
    gunCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
    makeFx();
    botsApi = RivalBots.create({ scene, phys, boxes, phase: () => match.phase, enemiesOf, shoot, smoked });
    window.addEventListener('resize', resize);
    resize();
  }

  function resize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = gunCam.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); gunCam.updateProjectionMatrix();
  }

  // =====================================================================
  // 효과 (총알 궤적, 불꽃)
  // =====================================================================
  const tracers = [], sparks = [];
  let tIdx = 0, sIdx = 0;
  function makeFx() {
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 }));
      m.visible = false; scene.add(m); tracers.push({ m, t: 0 });
    }
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0xffc060 }));
      m.visible = false; scene.add(m); sparks.push({ m, t: 0 });
    }
  }
  function tracer(ax, ay, az, bx, by, bz) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 1.5) return;
    const tr = tracers[tIdx++ % tracers.length];
    tr.m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    tr.m.scale.z = len;
    tr.m.lookAt(bx, by, bz);
    tr.m.visible = true; tr.t = 0.07;
  }
  function spark(x, y, z, color) {
    const s = sparks[sIdx++ % sparks.length];
    s.m.position.set(x, y, z); s.m.material.color.setHex(color); s.m.scale.setScalar(1); s.m.visible = true; s.t = 0.25;
  }
  function updateFx(dt) {
    tracers.forEach((tr) => { if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) tr.m.visible = false; } });
    sparks.forEach((s) => { if (s.t > 0) { s.t -= dt; s.m.scale.setScalar(Math.max(0.01, s.t / 0.25)); if (s.t <= 0) s.m.visible = false; } });
  }

  // =====================================================================
  // 전투: 총알 계산 / 데미지 / 처치
  // =====================================================================
  function spreadDir(dx, dy, dz, deg) {
    if (deg <= 0.001) return [dx, dy, dz];
    let ux, uy, uz; // d 와 수직인 기준축 u, v
    if (Math.abs(dy) < 0.99) { ux = dz; uy = 0; uz = -dx; } else { ux = 1; uy = 0; uz = 0; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const r = Math.tan(deg * DEG) * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    const k1 = r * Math.cos(a), k2 = r * Math.sin(a);
    const x = dx + ux * k1 + vx * k2, y = dy + uy * k1 + vy * k2, z = dz + uz * k1 + vz * k2;
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  }

  // 광선을 쏴서 가장 먼저 맞는 것(벽 또는 적의 머리/몸)을 찾음
  function castRay(shooter, ox, oy, oz, dx, dy, dz, max) {
    const tWall = phys.rayBoxes(ox, oy, oz, dx, dy, dz, max);
    let best = isFinite(tWall) ? tWall : max, hitE = null, head = false;
    const list = all();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e === shooter || !e.alive || e.team === shooter.team) continue;
      const feet = e.y - EYE;
      const th = Phys.raySphere(ox, oy, oz, dx, dy, dz, e.x, e.y - 0.1, e.z, 0.24); // 머리
      const tb = Phys.rayAABB(ox, oy, oz, dx, dy, dz, e.x - 0.32, e.x + 0.32, feet, e.y - 0.25, e.z - 0.32, e.z + 0.32); // 몸통
      let t = -1, h = false;
      if (th >= 0 && (tb < 0 || th <= tb)) { t = th; h = true; } else if (tb >= 0) t = tb;
      if (t >= 0 && t < best) { best = t; hitE = e; head = h; }
    }
    return { t: best, e: hitE, head, wall: !hitE && isFinite(tWall) };
  }

  function muzzlePos(s, dx, dy, dz) {
    if (s === P) { // 화면 오른쪽 아래, 총구 쪽
      const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      return [P.x + dx * 0.6 + rx * 0.2, P.y + dy * 0.6 - 0.15, P.z + dz * 0.6 + rz * 0.2];
    }
    const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
    return [s.x + 0.2 * c - 0.55 * n, s.y - 0.55, s.z - 0.2 * n - 0.55 * c];
  }

  // 한 번 발사 (플레이어/봇 공용). 펠릿(샷건)은 여러 알이 각자 날아감.
  function shoot(shooter, ox, oy, oz, dx, dy, dz, w, spread) {
    shooter.firedT = 0.8;
    if (shooter.isBot) shooter.muzzleT = 0.05;
    const isMe = shooter === P;
    const dP = isMe ? 0 : Math.hypot(shooter.x - P.x, shooter.y - P.y, shooter.z - P.z);
    Sfx.shot(w.sfx, isMe ? 1 : Math.max(0, 1 - dP / 60) * 0.7);
    const mz = muzzlePos(shooter, dx, dy, dz);
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) {
      const d = spreadDir(dx, dy, dz, spread);
      const r = castRay(shooter, ox, oy, oz, d[0], d[1], d[2], 300);
      const px = ox + d[0] * r.t, py = oy + d[1] * r.t, pz = oz + d[2] * r.t;
      if (r.e) {
        let dmg = w.dmg * W.falloff(w, r.t);
        if (r.head) dmg *= w.head; else if (py < r.e.y - EYE + 0.7) dmg *= 0.85; // 다리는 약간 약함
        spark(px, py, pz, 0xff3030);
        damage(r.e, dmg, r.head, shooter, w);
      } else if (r.wall) spark(px, py, pz, 0xffc060);
      tracer(mz[0], mz[1], mz[2], px, py, pz);
    }
  }

  function damage(t, amount, head, attacker, w) {
    if (!t.alive || match.phase !== 'live') return;
    amount = Math.max(1, Math.round(amount));
    t.hp = Math.max(0, t.hp - amount);
    if (t === P) { dmgT = Math.min(0.8, dmgT + 0.4); if (now - lastHurt > 0.12) { lastHurt = now; Sfx.hurt(); } } else t.flash = 0.12;
    if (attacker === P) { hitmark(head); Sfx.hit(head); }
    if (t.hp <= 0) kill(t, attacker, head, w);
  }

  function kill(t, a, head, w) {
    t.alive = false; t.deaths++;
    if (a !== t) a.kills++; // 수류탄 자폭은 킬로 세지 않음
    if (a === P && a !== t) { match.kills++; Sfx.kill(); }
    if (t === P) { match.deaths++; inp.adsToggle = false; $('btn-ads').classList.remove('on'); P.flashT = 0; }
    feed(a === t ? t.name + '  [' + w.name + ' 자폭]' : a.name + '  [' + w.name + (head ? ' · 헤드샷' : '') + ']  ' + t.name, a === P || t === P);
    checkRoundEnd();
  }

  function hitmark(head) {
    const h = $('hitmark');
    h.className = 'on' + (head ? ' head' : '');
    hmT = 0.12;
  }

  function feed(text, mine) {
    const d = document.createElement('div');
    d.textContent = text; if (mine) d.className = 'me';
    const box = $('feed'); box.appendChild(d);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 4500);
  }

  function setBanner(html, sec) { $('banner').innerHTML = html; bannerT = sec || 0; }

  // =====================================================================
  // 매치 / 라운드
  // =====================================================================
  const match = { phase: 'idle', round: 0, score: { A: 0, B: 0 }, timer: 0, phaseT: 0, teamSize: 2, diff: 'normal', kills: 0, deaths: 0, lastCount: 99 };

  function startMatch() {
    P.name = myNick || '나';
    match.teamSize = settings.mode; match.diff = settings.diff;
    match.round = 0; match.score.A = match.score.B = 0; match.kills = match.deaths = 0; match.phase = 'ready';
    P.kills = P.deaths = 0;
    $('result').classList.add('hidden'); sbOpen = false;
    $('feed').innerHTML = '';
    setBanner('');
    showOverlay('준비 완료', (match.teamSize + ' vs ' + match.teamSize + ' · ' + botsApi.DIFFS[match.diff].name + ' · ' + WIN_ROUNDS + '선승'), '시작');
  }

  function setupGuns() {
    guns = [W.create(settings.loadout.primary), W.create(settings.loadout.secondary), W.create(settings.loadout.melee), W.create(settings.loadout.utility)];
    cur = 0; lastCur = 0; switchT = 0.3; adsT = 0; vmRaise = 1;
    inp.adsToggle = false; $('btn-ads').classList.remove('on');
    setViewmodel(guns[0].id);
    renderSlots();
  }

  function startRound() {
    match.round++;
    match.phase = 'countdown'; match.phaseT = COUNTDOWN; match.lastCount = 99;
    botsApi.clear(); clearThrown(); P.flashT = 0;
    const sA = shuffle(world.spawns.A.slice()), sB = shuffle(world.spawns.B.slice());
    const n = match.teamSize, names = shuffle(botsApi.NAMES.slice());
    spawnPoint = sA[0];
    Object.assign(P, { x: spawnPoint.x, y: EYE, z: spawnPoint.z, vy: 0, onGround: true, yaw: spawnPoint.yaw, pitch: 0, hp: 100, alive: true, firedT: 0 });
    deadCamY = EYE; recoilAcc = 0;
    setupGuns();
    for (let i = 1; i < n; i++) botsApi.spawn({ team: 'A', name: '🤖' + names.pop(), diff: match.diff, x: sA[i].x, z: sA[i].z, yaw: sA[i].yaw });
    for (let i = 0; i < n; i++) botsApi.spawn({ team: 'B', name: '🤖' + names.pop(), diff: match.diff, x: sB[i].x, z: sB[i].z, yaw: sB[i].yaw });
  }

  function aliveCount(team) { return all().filter((e) => e.team === team && e.alive).length; }
  function hpSum(team) { return all().filter((e) => e.team === team && e.alive).reduce((s, e) => s + e.hp, 0); }

  function checkRoundEnd(timeUp) {
    if (match.phase !== 'live') return;
    const a = aliveCount('A'), b = aliveCount('B');
    if (b === 0) endRound('A', '적을 모두 처치!');
    else if (a === 0) endRound('B', '팀이 전멸했어요');
    else if (timeUp) {
      const ha = hpSum('A'), hb = hpSum('B');
      endRound(ha > hb ? 'A' : hb > ha ? 'B' : null, '시간 종료 · 남은 체력 ' + ha + ' : ' + hb);
    }
  }

  function endRound(winner, why) {
    match.phase = 'between'; match.phaseT = BETWEEN;
    if (winner) match.score[winner]++;
    const mine = winner === 'A';
    if (winner) (mine ? Sfx.win : Sfx.lose)();
    setBanner((winner ? (mine ? '🏆 라운드 승리!' : '라운드 패배') : '무승부') + '<small>' + why + ' · ' + match.score.A + ' : ' + match.score.B + '</small>', BETWEEN);
    inp.fire = false;
  }

  function updateMatch(dt) {
    if (match.phase === 'countdown') {
      match.phaseT -= dt;
      const c = Math.ceil(match.phaseT);
      if (c !== match.lastCount && c > 0) { match.lastCount = c; Sfx.beep(false); setBanner(c + '<small>라운드 ' + match.round + '</small>', 0); }
      if (match.phaseT <= 0) { match.phase = 'live'; match.timer = ROUND_TIME; Sfx.beep(true); setBanner('시작!', 0.8); }
    } else if (match.phase === 'live') {
      match.timer -= dt;
      if (match.timer <= 0) { match.timer = 0; checkRoundEnd(true); }
    } else if (match.phase === 'between') {
      match.phaseT -= dt;
      if (match.phaseT <= 0) {
        if (match.score.A >= WIN_ROUNDS || match.score.B >= WIN_ROUNDS) finishMatch();
        else startRound();
      }
    }
  }

  async function finishMatch() {
    match.phase = 'over';
    const won = match.score.A > match.score.B;
    setBanner('');
    if (document.pointerLockElement) document.exitPointerLock();
    $('res-title').textContent = won ? '🏆 승리!' : '패배';
    $('res-score').textContent = '라운드 ' + match.score.A + ' : ' + match.score.B;
    $('res-stats').textContent = '이번 매치: ' + match.kills + '킬 ' + match.deaths + '데스 · 기록을 저장하는 중…';
    $('result').classList.remove('hidden');
    try {
      const r = await api('/report', { id: myId, kills: Math.min(match.kills, 50), deaths: Math.min(match.deaths, 50), won });
      myStats = r.stats;
      $('res-stats').textContent = '이번 매치: ' + match.kills + '킬 ' + match.deaths + '데스 · 리더보드에 기록됐어요!';
    } catch (e) {
      $('res-stats').textContent = '이번 매치: ' + match.kills + '킬 ' + match.deaths + '데스 · (기록 저장 실패: ' + e.message + ')';
    }
  }

  // =====================================================================
  // 플레이어: 이동 / 조준 / 사격 / 재장전 / 무기 교체
  // =====================================================================
  const camDir = () => { const cp = Math.cos(P.pitch); return [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp]; };

  function switchTo(i) {
    if (i === cur || i < 0 || i > 3 || !P.alive) return;
    W.cancelReload(guns[cur]);
    lastCur = cur; cur = i; switchT = 0.28; vmRaise = 1; adsT = 0;
    inp.adsToggle = false; $('btn-ads').classList.remove('on');
    setViewmodel(guns[cur].id);
    renderSlots();
  }

  function doReload() {
    if (!P.alive || match.phase !== 'live') return;
    if (W.reload(guns[cur])) Sfx.reload();
  }

  function meleeAttack(w) {
    const d = camDir();
    let best = null, bd = 1e9;
    for (const e of enemiesOf('A')) {
      const dx = e.x - P.x, dy = (e.y - 0.6) - P.y, dz = e.z - P.z, dist = Math.hypot(dx, dy, dz);
      if (dist > w.range[0] + 0.4 || dist >= bd) continue;
      if ((dx * d[0] + dy * d[1] + dz * d[2]) / dist < 0.72) continue; // 정면 약 45도 안
      if (phys.rayBoxes(P.x, P.y, P.z, dx / dist, dy / dist, dz / dist, dist) < dist - 0.3) continue;
      best = e; bd = dist;
    }
    swingT = 0.22; Sfx.shot('swing', 1);
    if (best) damage(best, w.dmg, false, P, w);
  }

  function autoFireProbe(w) {
    if (!(settings.auto && isTouch) || w.melee) return false;
    const d = camDir();
    return !!castRay(P, P.x, P.y, P.z, d[0], d[1], d[2], w.range[1]).e;
  }

  function updatePlayer(dt) {
    const live = match.phase === 'live';
    const g = guns[cur], w = g.w;
    if (P.firedT > 0) P.firedT -= dt;
    if (switchT > 0) switchT -= dt;

    // 이동
    let fx = joy.x, fz = joy.y;
    if (keys['KeyW']) fz -= 1; if (keys['KeyS']) fz += 1;
    if (keys['KeyA']) fx -= 1; if (keys['KeyD']) fx += 1;
    const canMove = P.alive && (live || match.phase === 'ready');
    if (!canMove) { fx = 0; fz = 0; }
    const joyMag = Math.hypot(joy.x, joy.y);
    const sprint = (keys['ShiftLeft'] || keys['ShiftRight'] || joyMag > 0.9) && !(inp.fire);
    const wantAds = P.alive && live && !w.melee && !w.util && !g.reload && (inp.adsHold || inp.adsToggle);
    const len = Math.max(1, Math.hypot(fx, fz));
    fx /= len; fz /= len;
    const speed = 5.5 * w.move * (wantAds ? 0.7 : 1) * (sprint ? 1.3 : 1);
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    const px = P.x, pz = P.z;
    if (P.alive) {
      phys.tryMove(P, P.x + (fx * cos + fz * sin) * speed * dt, P.z);
      phys.tryMove(P, P.x, P.z + (-fx * sin + fz * cos) * speed * dt);
      phys.gravity(P, dt, !!keys['Space'] && live);
      if (P.y < -20) Object.assign(P, { x: spawnPoint.x, z: spawnPoint.z, y: EYE, vy: 0 });
    }
    const moving = Math.hypot(P.x - px, P.z - pz) / Math.max(dt, 1e-4) > 1;

    // 조준(ADS)
    adsT += ((wantAds ? 1 : 0) - adsT) * Math.min(1, dt * 12);

    // 사격
    const auto = P.alive && live && switchT <= 0 && !sprint && autoFireProbe(w);
    const trigger = P.alive && live && switchT <= 0 && (inp.fire || auto);
    const shots = W.update(g, dt, trigger);
    if (g.empty) { Sfx.empty(); Sfx.reload(); }
    if (P.flashT > 0) P.flashT = Math.max(0, P.flashT - dt);
    if (shots > 0) {
      if (w.util) useUtility(g, w);
      else if (w.melee) meleeAttack(w);
      else {
        const d = camDir();
        let sp = lerp(w.spread[0], w.spread[1], adsT);
        sp *= moving ? lerp(1.6, 1.25, adsT) : 1;
        if (!P.onGround) sp *= 2.2;
        shoot(P, P.x, P.y, P.z, d[0], d[1], d[2], w, sp);
        const rk = w.recoil * (1 - 0.4 * adsT) * DEG;
        P.pitch = clamp(P.pitch + rk, -1.5, 1.5); recoilAcc += rk;
        P.yaw += (Math.random() - 0.5) * rk * 0.6;
        vmKick = 1; flashT = 0.045;
      }
    }
    if (!w.melee && !w.util && g.ammo <= 0 && !g.reload && live && P.alive) doReload();
    // 반동 회복 (쏘고 있지 않을 때 화면이 천천히 내려옴)
    if (!trigger && recoilAcc > 0) {
      const rec = Math.min(recoilAcc, (recoilAcc * 5 + 0.6 * DEG) * dt);
      P.pitch -= rec; recoilAcc -= rec;
    }

    // 시야각 / 감도 / 조준점
    curFov = lerp(settings.fov, w.fov || settings.fov, adsT);
    if (Math.abs(camera.fov - curFov) > 0.01) { camera.fov = curFov; camera.updateProjectionMatrix(); }
    const spreadNow = w.melee || w.util ? 1 : lerp(w.spread[0], w.spread[1], adsT) * (moving ? 1.4 : 1) * (P.onGround ? 1 : 2);
    const gapTarget = 4 + Math.tan(spreadNow * DEG) / Math.tan(curFov * 0.5 * DEG) * (window.innerHeight / 2);
    xhGap += (Math.min(gapTarget, 90) - xhGap) * Math.min(1, dt * 15);
    $('xh').style.setProperty('--gap', xhGap.toFixed(1) + 'px');
    $('xh').classList.toggle('off', !!(w.scope && adsT > 0.5) || !P.alive);
    $('scope').classList.toggle('hidden', !(w.scope && adsT > 0.85 && P.alive));

    // 죽었을 때 카메라가 바닥으로 내려감
    deadCamY = P.alive ? P.y : lerp(deadCamY, 0.45, Math.min(1, dt * 4));
    updateViewmodel(dt, moving && P.onGround);
  }

  // =====================================================================
  // 유틸리티: 수류탄 / 섬광탄 / 연막탄 / 치료 음료
  // =====================================================================
  const nades = [], smokes = [], blasts = [];
  const NADE_COLOR = { frag: 0x3f5a2e, flash: 0xb8bcc4, smoke: 0x6e7580 };
  let nadeGeo = null, sbOpen = false, sbT = 0;

  function useUtility(g, w) {
    if (w.util === 'heal') {
      if (P.hp >= 100) { g.ammo = 1; Sfx.empty(); return; } // 체력이 가득이면 안 씀(돌려줌)
      P.hp = Math.min(100, P.hp + w.heal); Sfx.drink(); feed('치료 음료로 체력 ' + w.heal + ' 회복', true);
    } else throwNade(w);
    swingT = 0.22;
    if (g.ammo <= 0) switchTo(lastCur === 3 ? 0 : lastCur); // 다 쓰면 직전 무기로 복귀
  }

  function inBox(x, y, z) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x > b.minX - 0.08 && x < b.maxX + 0.08 && y > b.minY - 0.08 && y < b.maxY + 0.08 && z > b.minZ - 0.08 && z < b.maxZ + 0.08) return true;
    }
    return false;
  }

  function throwNade(w) {
    const d = camDir();
    if (!nadeGeo) nadeGeo = new THREE.SphereGeometry(0.08, 10, 8);
    const m = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({ color: NADE_COLOR[w.util] }));
    scene.add(m);
    let x = P.x + d[0] * 0.5, y = P.y - 0.1 + d[1] * 0.5, z = P.z + d[2] * 0.5;
    if (inBox(x, y, z)) { x = P.x; y = P.y - 0.1; z = P.z; } // 벽에 바싹 붙어 던지면 벽 속으로 들어가지 않게
    nades.push({ w, type: w.util, x, y, z, vx: d[0] * 15, vy: d[1] * 15 + 3.2, vz: d[2] * 15, t: w.fuse, m, owner: P });
    Sfx.shot('swing', 1);
  }

  function addBlast(x, y, z, r, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    m.position.set(x, y, z); scene.add(m);
    blasts.push({ m, t: 0.35, r });
  }

  function addSmoke(x, z, r) {
    const group = new THREE.Group(); group.position.set(x, 1.3, z);
    const mt = new THREE.MeshBasicMaterial({ color: 0xb4b8bf, transparent: true, opacity: 0.92, depthWrite: false });
    const geo = new THREE.SphereGeometry(r * 0.6, 12, 10);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(geo, mt);
      m.position.set((Math.random() - 0.5) * r * 0.9, (Math.random() - 0.5) * r * 0.5, (Math.random() - 0.5) * r * 0.9);
      group.add(m);
    }
    group.scale.setScalar(0.3);
    scene.add(group);
    smokes.push({ x, y: 1.3, z, r, age: 0, life: 10, group, mt, geo });
  }

  // 선분(a→b)이 연막 구 안을 지나가는지 (봇의 시야 차단용)
  function smoked(ax, ay, az, bx, by, bz) {
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      if (s.age < 0.5) continue;
      const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1;
      const t = clamp(((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / l2, 0, 1);
      if (Math.hypot(ax + dx * t - s.x, ay + dy * t - s.y, az + dz * t - s.z) <= s.r * 0.8) return true;
    }
    return false;
  }

  function explode(n) {
    const w = n.w, dP = Math.hypot(n.x - P.x, n.y - P.y, n.z - P.z);
    if (n.type === 'smoke') { Sfx.smokePop(); addSmoke(n.x, n.z, w.radius); return; }
    const flashing = n.type === 'flash';
    if (flashing) { Sfx.flashBang(Math.max(0.2, 1 - dP / 60)); addBlast(n.x, n.y, n.z, 1.4, 0xffffff); }
    else { Sfx.boom(Math.max(0.15, 1 - dP / 50)); addBlast(n.x, n.y, n.z, w.radius * 0.5, 0xffa040); }
    all().forEach((e) => {
      if (!e.alive || (e !== P && e.team === n.owner.team)) return; // 아군은 안전, 던진 나는 영향받음
      const cy = e.y - (flashing ? 0.2 : 0.6);
      const dx = e.x - n.x, dy = cy - (n.y + 0.2), dz = e.z - n.z, d = Math.hypot(dx, dy, dz);
      if (d > w.radius) return;
      if (d > 0.4 && phys.rayBoxes(n.x, n.y + 0.2, n.z, dx / d, dy / d, dz / d, d) < d - 0.3) return; // 벽이 막아줌
      if (!flashing) { damage(e, w.dmg * (1 - d / w.radius), false, n.owner, w); return; }
      const toB = [-dx / (d || 1), -dy / (d || 1), -dz / (d || 1)];
      if (e === P) { // 폭발 쪽을 쳐다보고 있을수록 오래 멂
        const v = camDir(), f = (v[0] * toB[0] + v[1] * toB[1] + v[2] * toB[2] + 1) / 2;
        P.flashT = Math.max(P.flashT, (0.8 + 3.2 * f) * (1 - 0.5 * d / w.radius));
      } else {
        const front = (-Math.sin(e.yaw)) * toB[0] + (-Math.cos(e.yaw)) * toB[2];
        e.blindT = Math.max(e.blindT || 0, front > -0.2 ? 3 : 0.8);
      }
    });
  }

  function updateThrown(dt) {
    for (let i = nades.length - 1; i >= 0; i--) {
      const n = nades[i];
      n.t -= dt; n.vy -= 18 * dt;
      const nx = n.x + n.vx * dt;
      if (inBox(nx, n.y, n.z)) { n.vx *= -0.45; n.vz *= 0.8; } else n.x = nx;
      const nz = n.z + n.vz * dt;
      if (inBox(n.x, n.y, nz)) { n.vz *= -0.45; n.vx *= 0.8; } else n.z = nz;
      let ny = n.y + n.vy * dt;
      if (ny < 0.08) { ny = 0.08; n.vy = Math.abs(n.vy) > 1.5 ? -n.vy * 0.4 : 0; n.vx *= 0.85; n.vz *= 0.85; }
      else if (inBox(n.x, ny, n.z)) { n.vy = n.vy < 0 && Math.abs(n.vy) > 1.5 ? -n.vy * 0.4 : n.vy < 0 ? 0 : -n.vy * 0.3; n.vx *= 0.85; n.vz *= 0.85; ny = n.y; }
      n.y = ny;
      n.m.position.set(n.x, n.y, n.z);
      if (n.t <= 0) { explode(n); scene.remove(n.m); n.m.material.dispose(); nades.splice(i, 1); }
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i]; b.t -= dt;
      const k = 1 - Math.max(0, b.t) / 0.35;
      b.m.scale.setScalar(Math.max(0.05, b.r * k)); b.m.material.opacity = Math.max(0, 0.85 * (1 - k));
      if (b.t <= 0) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); blasts.splice(i, 1); }
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const sm = smokes[i]; sm.age += dt;
      sm.group.scale.setScalar(Math.min(1, 0.3 + sm.age * 1.2));
      sm.mt.opacity = sm.age > sm.life - 2 ? Math.max(0, 0.92 * (sm.life - sm.age) / 2) : 0.92;
      if (sm.age >= sm.life) { scene.remove(sm.group); sm.mt.dispose(); sm.geo.dispose(); smokes.splice(i, 1); }
    }
  }

  function clearThrown() {
    nades.forEach((n) => { scene.remove(n.m); n.m.material.dispose(); }); nades.length = 0;
    blasts.forEach((b) => { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); }); blasts.length = 0;
    smokes.forEach((sm) => { scene.remove(sm.group); sm.mt.dispose(); sm.geo.dispose(); }); smokes.length = 0;
  }

  // =====================================================================
  // 점수판 (Tab 키 / 모바일은 위쪽 점수 상자를 탭)
  // =====================================================================
  function renderScoreboard() {
    const rows = all().slice().sort((a, b) => (a.team === b.team ? 0 : a.team === 'A' ? -1 : 1) || b.kills - a.kills);
    const body = $('sb-body'); body.innerHTML = '';
    rows.forEach((e) => {
      const tr = document.createElement('tr'); tr.className = e.team === 'A' ? 'a' : 'b';
      [e === P ? (myNick || '나') + ' (나)' : e.name, e.team === 'A' ? '우리' : '상대', e.kills, e.deaths, e.alive ? e.hp : '사망'].forEach((v) => {
        const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  // =====================================================================
  // 손에 든 총 (뷰모델)
  // =====================================================================
  function setViewmodel(id) {
    if (vm) gunScene.remove(vm);
    vm = RivalModels.viewmodel(id, 0x3b82f6); // 파란 팀 소매
    gunScene.add(vm);
  }
  function updateViewmodel(dt, moving) {
    if (!vm) return;
    const g = guns[cur], w = g.w;
    const hip = w.melee || w.util ? [0.2, -0.2, -0.36] : [0.24, -0.25, -0.42], ads = [0, -0.105, -0.34];
    let x = lerp(hip[0], ads[0], adsT), y = lerp(hip[1], ads[1], adsT), z = lerp(hip[2], ads[2], adsT), rx = 0, rz = 0, ry = 0;
    if (moving) { x += Math.sin(now * 8) * 0.008 * (1 - adsT); y += Math.abs(Math.sin(now * 8)) * 0.008 * (1 - adsT); }
    vmKick = Math.max(0, vmKick - dt * 10); z += vmKick * 0.05; rx += vmKick * 0.1;
    if (g.reload && !w.shell) { const p = clamp(g.reload.t / g.reload.total, 0, 1), k = Math.sin(Math.PI * p); y -= 0.13 * k; rz += 0.5 * k; rx -= 0.35 * k; }
    else if (g.reload && w.shell) { const k = 0.5 + 0.5 * Math.sin(now * 12); y -= 0.06; rx -= 0.25; z += 0.02 * k; }
    vmRaise = Math.max(0, vmRaise - dt * 4.5); y -= vmRaise * 0.35;
    if (swingT > 0) { swingT -= dt; const k = Math.sin(Math.PI * (1 - clamp(swingT / 0.22, 0, 1))); rx -= k * 0.9; ry += k * 0.5; x -= k * 0.16; }
    vm.position.set(x, y, z); vm.rotation.set(rx, ry, rz); vm.scale.setScalar(0.88);
    vm.visible = P.alive && !(w.scope && adsT > 0.8);
    if (vm.userData.flash) { vm.userData.flash.visible = flashT > 0; if (flashT > 0) flashT -= dt; }
  }

  // =====================================================================
  // HUD
  // =====================================================================
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function renderSlots() {
    const box = $('slots'), tbox = $('touch-slots');
    box.innerHTML = ''; tbox.innerHTML = '';
    guns.forEach((g, i) => {
      const s = document.createElement('div'); s.className = 's' + (i === cur ? ' on' : ''); s.textContent = (i + 1) + ' ' + g.w.name; box.appendChild(s);
      const b = document.createElement('button'); b.className = i === cur ? 'on' : ''; b.textContent = g.w.name;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); switchTo(i); }, { passive: false });
      tbox.appendChild(b);
    });
  }
  function updateHud(dt) {
    const g = guns[cur], w = g.w;
    setText('hp-text', String(P.hp));
    const hf = $('hp-fill'); hf.style.width = P.hp + '%'; hf.style.background = P.hp > 60 ? '#4cd964' : P.hp > 30 ? '#ffcc00' : '#ff3b30';
    setText('ammo-main', w.melee ? '—' : String(g.ammo));
    setText('ammo-name', w.name + (w.melee ? '' : w.util ? (g.ammo > 0 ? ' · 발사 버튼으로 사용' : ' · 사용함') : ' · ' + (g.reload ? '장전 중…' : '∞')));
    const rb = $('reloadbar');
    if (g.reload) { rb.classList.remove('hidden'); rb.firstElementChild.style.width = Math.min(100, g.reload.t / g.reload.total * 100) + '%'; } else rb.classList.add('hidden');
    setText('sc-me', String(match.score.A)); setText('sc-foe', String(match.score.B));
    const t = Math.max(0, Math.ceil(match.timer));
    setText('sc-timer', match.phase === 'live' || match.phase === 'between' ? Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') : '--');
    setText('sc-round', '라운드 ' + Math.max(1, match.round) + ' · ' + WIN_ROUNDS + '선승 · 생존 ' + aliveCount('A') + ' vs ' + aliveCount('B'));
    // 맞춤 표시 / 피격 화면 / 배너 시간
    if (hmT > 0) { hmT -= dt; if (hmT <= 0) $('hitmark').className = ''; }
    dmgT = Math.max(0, dmgT - dt * 1.4); $('dmgflash').style.opacity = dmgT.toFixed(2);
    $('flashov').style.opacity = clamp(P.flashT / 1.5, 0, 1).toFixed(2);
    $('sb').classList.toggle('hidden', !sbOpen);
    if (sbOpen) { sbT -= dt; if (sbT <= 0) { sbT = 0.3; renderScoreboard(); } }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0 && match.phase === 'live') $('banner').innerHTML = ''; }
    if (!P.alive && match.phase === 'live') { if (!hudCache.dead) { hudCache.dead = 1; setBanner('사망<small>라운드가 끝날 때까지 기다려 주세요</small>', 0); } } else hudCache.dead = 0;
  }

  // =====================================================================
  // 메인 루프
  // =====================================================================
  const running = () => !!document.pointerLockElement || mobilePlaying;

  function update(dt) {
    now += dt;
    updateMatch(dt);
    updatePlayer(dt);
    botsApi.update(dt, now, match.phase === 'live');
    updateThrown(dt);
    updateFx(dt);
    updateHud(dt);
  }

  function render() {
    camera.position.set(P.x, deadCamY, P.z);
    camera.rotation.set(P.pitch + (P.alive ? 0 : -0.5), P.yaw, 0);
    renderer.clear();
    renderer.render(scene, camera);
    if (vm && vm.visible) { renderer.clearDepth(); renderer.render(gunScene, gunCam); }
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (running()) update(dt);
    render();
  }

  // =====================================================================
  // 시작 / 일시정지 / 나가기
  // =====================================================================
  function showOverlay(title, sub, btn) {
    $('ov-title').textContent = title; $('ov-sub').textContent = sub; $('ov-resume').textContent = btn;
    $('overlay').classList.remove('hidden');
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    inp.fire = false; inp.adsHold = false; joy.x = joy.y = 0;
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  function enterGame() {
    show('game');
    if (!started) { started = true; initGL(); }
    Sfx.init();
    $('touch-ui').classList.toggle('hidden', !isTouch);
    camera.fov = settings.fov; camera.updateProjectionMatrix();
    mobilePlaying = false;
    startMatch();
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function resume() {
    Sfx.init();
    if (match.phase === 'ready') startRound();
    if (!isTouch) { $('c').requestPointerLock(); return; }
    mobilePlaying = true; hideOverlay();
    try { // 전체화면 + 가로 고정 시도 (아이폰 사파리는 막혀 있어서 실패해도 괜찮음)
      const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) Promise.resolve(req.call(el)).catch(() => {});
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) {}
  }

  function leaveGame() {
    cancelAnimationFrame(raf);
    mobilePlaying = false; joy.x = joy.y = 0;
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    inp.fire = false; inp.adsHold = false; inp.adsToggle = false;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    if (document.pointerLockElement) document.exitPointerLock();
    if (botsApi) botsApi.clear();
    match.phase = 'idle';
    $('result').classList.add('hidden'); showOverlayHidden();
    enterLobby();
  }
  function showOverlayHidden() { $('overlay').classList.add('hidden'); }

  $('play-btn').onclick = enterGame;
  $('ov-resume').onclick = resume;
  $('ov-exit').onclick = leaveGame;
  $('res-lobby').onclick = leaveGame;
  $('res-again').onclick = () => { $('result').classList.add('hidden'); startMatch(); };

  document.addEventListener('pointerlockchange', () => {
    if ($('game').classList.contains('hidden')) return;
    if (document.pointerLockElement) hideOverlay();
    else if (match.phase !== 'over' && match.phase !== 'idle') showOverlay('일시정지', '', '계속하기');
  });

  // =====================================================================
  // 입력: 키보드 / 마우스
  // =====================================================================
  const inGame = () => !$('game').classList.contains('hidden');
  document.addEventListener('keydown', (e) => {
    if (!inGame()) return;
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (e.code === 'Tab') { sbOpen = true; sbT = 0; }
    if (!document.pointerLockElement) return;
    if (e.code === 'KeyR') doReload();
    else if (e.code === 'Digit1') switchTo(0);
    else if (e.code === 'Digit2') switchTo(1);
    else if (e.code === 'Digit3') switchTo(2);
    else if (e.code === 'Digit4') switchTo(3);
    else if (e.code === 'KeyQ') switchTo(lastCur);
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') sbOpen = false; });
  document.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return;
    const k = 0.0022 * settings.sens * (Math.tan(curFov * 0.5 * DEG) / Math.tan(settings.fov * 0.5 * DEG)); // 확대하면 감도도 같이 줄임
    P.yaw -= e.movementX * k;
    P.pitch = clamp(P.pitch - e.movementY * k, -1.5, 1.5);
  });
  document.addEventListener('mousedown', (e) => {
    if (!document.pointerLockElement) return;
    if (e.button === 0) inp.fire = true; else if (e.button === 2) inp.adsHold = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) inp.fire = false; else if (e.button === 2) inp.adsHold = false;
  });
  document.addEventListener('contextmenu', (e) => { if (inGame()) e.preventDefault(); });
  document.addEventListener('wheel', (e) => {
    if (!document.pointerLockElement) return;
    switchTo((cur + (e.deltaY > 0 ? 1 : 3)) % 4);
  }, { passive: true });

  // =====================================================================
  // 입력: 모바일 터치
  // =====================================================================
  (function setupTouch() {
    const JOY_R = 50;
    const base = $('joy-base'), knob = $('joy-knob');
    let joyId = null, joyOrigin = null, lookId = null, lookLast = null;
    const findTouch = (list, id) => { for (const t of list) if (t.identifier === id) return t; return null; };

    // 왼쪽: 손가락을 처음 댄 자리가 조이스틱 중심(떠다니는 조이스틱)
    $('joy-zone').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (joyId !== null) return;
      const t = e.changedTouches[0];
      joyId = t.identifier; joyOrigin = { x: t.clientX, y: t.clientY };
      base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px';
      knob.style.transform = 'translate(0,0)'; base.classList.remove('hidden');
    }, { passive: false });
    $('joy-zone').addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = findTouch(e.changedTouches, joyId);
      if (!t) return;
      let dx = t.clientX - joyOrigin.x, dy = t.clientY - joyOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      joy.x = dx / JOY_R; joy.y = dy / JOY_R;
    }, { passive: false });
    const joyEnd = (e) => { if (!findTouch(e.changedTouches, joyId)) return; joyId = null; joy.x = joy.y = 0; base.classList.add('hidden'); };
    $('joy-zone').addEventListener('touchend', joyEnd);
    $('joy-zone').addEventListener('touchcancel', joyEnd);

    // 오른쪽: 드래그로 시점 회전
    $('look-zone').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (lookId !== null) return;
      const t = e.changedTouches[0];
      lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    $('look-zone').addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = findTouch(e.changedTouches, lookId);
      if (!t || !mobilePlaying) return;
      const k = 0.0045 * settings.sens * (Math.tan(curFov * 0.5 * DEG) / Math.tan(settings.fov * 0.5 * DEG));
      P.yaw -= (t.clientX - lookLast.x) * k;
      P.pitch = clamp(P.pitch - (t.clientY - lookLast.y) * k, -1.5, 1.5);
      lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    const lookEnd = (e) => { if (findTouch(e.changedTouches, lookId)) lookId = null; };
    $('look-zone').addEventListener('touchend', lookEnd);
    $('look-zone').addEventListener('touchcancel', lookEnd);

    // 버튼들
    const hold = (el, down, up) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
      const end = (e) => { e.preventDefault(); up(); };
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
    };
    hold($('btn-fire'), () => { inp.fire = true; $('btn-fire').classList.add('on'); }, () => { inp.fire = false; $('btn-fire').classList.remove('on'); });
    hold($('btn-jump'), () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
    $('btn-ads').addEventListener('touchstart', (e) => { e.preventDefault(); inp.adsToggle = !inp.adsToggle; $('btn-ads').classList.toggle('on', inp.adsToggle); }, { passive: false });
    $('btn-reload').addEventListener('touchstart', (e) => { e.preventDefault(); doReload(); }, { passive: false });
    $('hud-top').addEventListener('touchstart', (e) => { e.preventDefault(); sbOpen = !sbOpen; sbT = 0; }, { passive: false });
    $('btn-exit').addEventListener('touchstart', (e) => { e.preventDefault(); if (confirm('매치를 나갈까요? (기록은 저장되지 않아요)')) leaveGame(); }, { passive: false });
  })();

  // 주소 끝에 ?debug 를 붙였을 때만 테스트용으로 내부 상태를 노출
  if (DEBUG) {
    window.__rival = {
      P, keys, inp, boxes, match, W, joy,
      get guns() { return guns; }, get cur() { return cur; }, get bots() { return botsApi.bots; },
      all, switchTo, doReload, startRound, castRay, get nav() { return botsApi.nav; },
      get ads() { return adsT; }, nades, smokes, blasts, smoked, get sbOpen() { return sbOpen; },
    };
  }

  // ---- 시작 ----
  initSettingsUI();
  if (myNick) {
    // 저장된 닉네임을 서버에 다시 등록(서버가 재시작돼 기록이 날아갔어도 복구)
    api('/join', { id: myId, nick: myNick }).then((r) => { myStats = r.stats; enterLobby(); }).catch(() => { show('screen-nick'); });
  } else {
    show('screen-nick');
  }
})();
