// RIVAL 클라이언트 (1단계: 닉네임 + 로비 + 리더보드 + 이동 테스트)
(function () {
  const $ = (id) => document.getElementById(id);

  // ---- 내 정체성: 브라우저에 저장된 랜덤 id + 닉네임 ----
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  let myId = safeGet('rival_id');
  if (!myId) {
    myId = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    safeSet('rival_id', myId);
  }
  let myNick = safeGet('rival_nick') || '';

  function show(name) {
    ['screen-nick', 'screen-lobby', 'game'].forEach((id) => $(id).classList.toggle('hidden', id !== name));
  }

  async function api(path, body) {
    const res = await fetch('/api/rival' + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '서버 오류');
    return data;
  }

  // ---- 닉네임 ----
  async function submitNick() {
    $('nick-err').textContent = '';
    try {
      const r = await api('/join', { id: myId, nick: $('nick-input').value });
      myNick = r.nick;
      safeSet('rival_nick', myNick);
      enterLobby();
    } catch (e) {
      $('nick-err').textContent = e.message;
    }
  }
  $('nick-btn').onclick = submitNick;
  $('nick-input').onkeydown = (e) => { if (e.key === 'Enter') submitNick(); };
  $('nick-change').onclick = () => { $('nick-input').value = myNick; show('screen-nick'); };

  // ---- 로비 + 리더보드 ----
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
      $('board-empty').classList.toggle('hidden', rows.length > 0);
    } catch (e) {
      $('board-empty').textContent = '리더보드를 불러오지 못했어요.';
      $('board-empty').classList.remove('hidden');
    }
  }

  function enterLobby() {
    $('lobby-nick').textContent = myNick;
    show('screen-lobby');
    loadBoard();
  }

  // ---- 게임(이동 테스트용 맵) ----
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  let mobilePlaying = false; // 모바일은 포인터 잠금이 없어서 별도 플래그로 "플레이 중" 표시
  const joy = { x: 0, y: 0 }; // 조이스틱 방향 (-1~1). y가 +면 뒤로
  $('controls-hint').innerHTML = isTouch
    ? '왼쪽 화면: 이동(끝까지 밀면 달리기) · 오른쪽 화면: 드래그로 시점 · 점프 버튼<br>폰을 <b>가로</b>로 돌려서 플레이하세요.'
    : 'PC: WASD 이동 · 마우스 시점 · Space 점프 · Shift 달리기 · Esc 나가기';
  let started = false, renderer, scene, camera, raf, last;
  const boxes = []; // 충돌용 상자 {minX,maxX,minY,maxY,minZ,maxZ}
  const keys = {};
  const P = { x: 0, y: 1.7, z: 8, vy: 0, yaw: 0, pitch: 0, onGround: true };
  const EYE = 1.7, RADIUS = 0.4;

  function addBox(x, y, z, w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    scene.add(m);
    boxes.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  function buildWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87a7c7);
    scene.fog = new THREE.Fog(0x87a7c7, 30, 90);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(10, 20, 5);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x5b6b4f }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    // 바깥 벽
    addBox(0, 2, -30, 60, 4, 1, 0x888e9a);
    addBox(0, 2, 30, 60, 4, 1, 0x888e9a);
    addBox(-30, 2, 0, 1, 4, 60, 0x888e9a);
    addBox(30, 2, 0, 1, 4, 60, 0x888e9a);
    // 엄폐물(상자)
    addBox(-6, 1, -4, 4, 2, 2, 0xb5793a);
    addBox(6, 1, -8, 3, 2, 3, 0xb5793a);
    addBox(0, 0.75, -2, 2, 1.5, 2, 0x8a5a2b);
    addBox(-10, 1.5, 6, 2, 3, 6, 0x6d7a8c);
    addBox(10, 0.5, 4, 5, 1, 5, 0xc9a45a); // 올라갈 수 있는 낮은 상자
    addBox(0, 2, -16, 10, 4, 1.5, 0x6d7a8c);
  }

  function resize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  // 간단한 상자 충돌: x, z 방향을 따로 확인
  function hitsBox(x, y, z) {
    const feet = y - EYE, head = y + 0.2;
    for (const b of boxes) {
      if (x + RADIUS > b.minX && x - RADIUS < b.maxX && z + RADIUS > b.minZ && z - RADIUS < b.maxZ
          && head > b.minY && feet < b.maxY - 0.01) return b;
    }
    return null;
  }

  function step(dt) {
    const joyMag = Math.hypot(joy.x, joy.y);
    const run = keys['ShiftLeft'] || keys['ShiftRight'] || joyMag > 0.9; // 조이스틱 끝까지 밀면 달리기
    const speed = run ? 8 : 5;
    let fx = joy.x, fz = joy.y;
    if (keys['KeyW']) fz -= 1;
    if (keys['KeyS']) fz += 1;
    if (keys['KeyA']) fx -= 1;
    if (keys['KeyD']) fx += 1;
    const len = Math.max(1, Math.hypot(fx, fz)); // 1보다 작으면(조이스틱 살짝) 그대로 둬서 천천히 걷기
    fx /= len; fz /= len;
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    const dx = (fx * cos + fz * sin) * speed * dt;
    const dz = (-fx * sin + fz * cos) * speed * dt;
    if (!hitsBox(P.x + dx, P.y, P.z)) P.x += dx;
    if (!hitsBox(P.x, P.y, P.z + dz)) P.z += dz;

    // 점프 + 중력
    if (keys['Space'] && P.onGround) { P.vy = 7.5; P.onGround = false; }
    P.vy -= 20 * dt;
    let ny = P.y + P.vy * dt;
    P.onGround = false;
    if (P.vy < 0) {
      // 떨어지는 중: 상자 윗면이나 바닥에 착지
      let floorY = 0;
      for (const b of boxes) {
        if (P.x + RADIUS > b.minX && P.x - RADIUS < b.maxX && P.z + RADIUS > b.minZ && P.z - RADIUS < b.maxZ
            && P.y - EYE >= b.maxY - 0.05 && b.maxY > floorY) floorY = b.maxY;
      }
      if (ny - EYE <= floorY) { ny = floorY + EYE; P.vy = 0; P.onGround = true; }
    } else if (hitsBox(P.x, ny, P.z)) {
      P.vy = 0; ny = P.y; // 머리 부딪힘
    }
    P.y = ny;
    if (P.y < -20) { P.x = 0; P.y = EYE; P.z = 8; P.vy = 0; } // 혹시 떨어지면 리스폰
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (document.pointerLockElement || mobilePlaying) step(dt);
    camera.position.set(P.x, P.y, P.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(P.pitch, P.yaw, 0);
    renderer.render(scene, camera);
  }

  function startGame() {
    show('game');
    if (!started) {
      started = true;
      renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera = new THREE.PerspectiveCamera(80, 1, 0.1, 200);
      buildWorld();
      resize();
      window.addEventListener('resize', resize);
    }
    Object.assign(P, { x: 0, y: EYE, z: 8, vy: 0, yaw: 0, pitch: 0 });
    $('click-to-play').textContent = isTouch ? '화면을 터치해서 시작' : '클릭해서 시작 (Esc: 로비로)';
    $('click-to-play').classList.remove('hidden');
    $('touch-ui').classList.toggle('hidden', !isTouch);
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function leaveGame() {
    cancelAnimationFrame(raf);
    mobilePlaying = false;
    joy.x = joy.y = 0;
    keys['Space'] = false;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    if (document.pointerLockElement) document.exitPointerLock();
    enterLobby();
  }

  $('play-btn').onclick = startGame;
  $('click-to-play').onclick = () => {
    if (!isTouch) { $('c').requestPointerLock(); return; }
    mobilePlaying = true;
    $('click-to-play').classList.add('hidden');
    // 전체화면 + 가로 고정 시도 (아이폰 사파리는 막혀 있어서 실패해도 괜찮음)
    try {
      const req = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      if (req) Promise.resolve(req.call(document.documentElement)).catch(() => {});
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) {}
  };
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    if ($('game').classList.contains('hidden')) return;
    $('click-to-play').classList.toggle('hidden', locked);
  });
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' && !$('game').classList.contains('hidden')) e.preventDefault();
    // Esc: 포인터 잠금이 풀린 상태에서 한 번 더 누르면 로비로
    if (e.code === 'Escape' && !$('game').classList.contains('hidden') && !document.pointerLockElement) leaveGame();
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
  document.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return;
    P.yaw -= e.movementX * 0.0022;
    P.pitch -= e.movementY * 0.0022;
    P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch));
  });

  // ---- 모바일 터치 조작 ----
  (function setupTouch() {
    const JOY_R = 50; // 조이스틱이 최대로 기우는 거리(px)
    const base = $('joy-base'), knob = $('joy-knob');
    let joyId = null, joyOrigin = null, lookId = null, lookLast = null;
    const findTouch = (list, id) => { for (const t of list) if (t.identifier === id) return t; return null; };

    // 왼쪽: 손가락을 처음 댄 자리가 조이스틱 중심이 됨(떠다니는 조이스틱)
    $('joy-zone').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (joyId !== null) return;
      const t = e.changedTouches[0];
      joyId = t.identifier;
      joyOrigin = { x: t.clientX, y: t.clientY };
      base.style.left = t.clientX + 'px';
      base.style.top = t.clientY + 'px';
      knob.style.transform = 'translate(0,0)';
      base.classList.remove('hidden');
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
    const joyEnd = (e) => {
      if (!findTouch(e.changedTouches, joyId)) return;
      joyId = null; joy.x = joy.y = 0;
      base.classList.add('hidden');
    };
    $('joy-zone').addEventListener('touchend', joyEnd);
    $('joy-zone').addEventListener('touchcancel', joyEnd);

    // 오른쪽: 드래그하면 시점 회전
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
      P.yaw -= (t.clientX - lookLast.x) * 0.005;
      P.pitch -= (t.clientY - lookLast.y) * 0.005;
      P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch));
      lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    const lookEnd = (e) => { if (findTouch(e.changedTouches, lookId)) lookId = null; };
    $('look-zone').addEventListener('touchend', lookEnd);
    $('look-zone').addEventListener('touchcancel', lookEnd);

    // 버튼들
    const jump = $('btn-jump');
    jump.addEventListener('touchstart', (e) => { e.preventDefault(); keys['Space'] = true; }, { passive: false });
    const jumpEnd = (e) => { e.preventDefault(); keys['Space'] = false; };
    jump.addEventListener('touchend', jumpEnd, { passive: false });
    jump.addEventListener('touchcancel', jumpEnd, { passive: false });
    $('btn-exit').addEventListener('touchstart', (e) => { e.preventDefault(); leaveGame(); }, { passive: false });
  })();

  // ---- 시작 ----
  if (myNick) {
    // 저장된 닉네임을 서버에 다시 등록(서버가 재시작돼 기록이 날아갔어도 복구)
    api('/join', { id: myId, nick: myNick }).then(enterLobby).catch(() => { show('screen-nick'); });
  } else {
    show('screen-nick');
  }
})();
