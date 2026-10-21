// RIVAL 봇 AI: 길찾기(A*) + 시야 판정 + 교전(조준/좌우 이동/재장전)
// 상태: 적을 보면 "교전", 못 보면 마지막으로 본 곳이나 적이 있을 법한 곳으로 "이동(수색)".
(function () {
  const W = window.RivalWeapons;

  // 난이도: react 반응 시간(초), aim 추가 조준 오차(도), head 머리를 노릴 확률, turn 회전 속도(rad/s), strafe 좌우 이동 정도
  const DIFFS = {
    easy:   { name: '쉬움',   react: 0.85, aim: 6.0, head: 0.04, turn: 3.0,  strafe: 0.5 },
    normal: { name: '보통',   react: 0.5,  aim: 3.0, head: 0.10, turn: 5.0,  strafe: 0.8 },
    hard:   { name: '어려움', react: 0.3,  aim: 1.4, head: 0.22, turn: 8.0,  strafe: 1.0 },
    insane: { name: '지옥',   react: 0.15, aim: 0.5, head: 0.40, turn: 14.0, strafe: 1.25 },
  };
  const NAMES = ['Viper', 'Ghost', 'Nova', 'Blaze', 'Echo', 'Rogue', 'Hawk', 'Frost', 'Zed', 'Pixel', 'Kuma', 'Rex', 'Luna', 'Orca', 'Jinx', 'Volt'];
  const PRIMARIES = ['ar', 'ar', 'burst', 'smg', 'smg', 'shotgun', 'sniper', 'lmg'];

  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function create(G) {
    const phys = G.phys;
    const bots = [];

    // ---------------- 길찾기용 격자 ----------------
    const HALF = 32, N = 64;
    const obs = G.boxes.filter((b) => b.minY < 1.8 && b.maxY > 0.3); // 지상에서 걸어서 못 지나가는 것들
    const walk = new Uint8Array(N * N);
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const cx = -HALF + ix + 0.5, cz = -HALF + iz + 0.5;
        let ok = 1;
        for (let i = 0; i < obs.length; i++) {
          const b = obs[i];
          if (cx + 0.55 > b.minX && cx - 0.55 < b.maxX && cz + 0.55 > b.minZ && cz - 0.55 < b.maxZ) { ok = 0; break; }
        }
        walk[iz * N + ix] = ok;
      }
    }
    const cellOf = (x, z) => [clamp(Math.floor(x + HALF), 0, N - 1), clamp(Math.floor(z + HALF), 0, N - 1)];
    function nearestWalkable(x, z) {
      const [cx, cz] = cellOf(x, z);
      for (let r = 0; r <= 8; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const ix = cx + dx, iz = cz + dz;
            if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
            if (walk[iz * N + ix]) return iz * N + ix;
          }
        }
      }
      return -1;
    }

    // 선분(a→b)이 장애물에 걸리는지. 장애물을 0.45m 부풀려서 검사(몸 두께 고려)
    function segBlocked(ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az;
      for (let i = 0; i < obs.length; i++) {
        const b = obs[i];
        const minX = b.minX - 0.45, maxX = b.maxX + 0.45, minZ = b.minZ - 0.45, maxZ = b.maxZ + 0.45;
        let t0 = 0, t1 = 1, hit = true;
        if (Math.abs(dx) < 1e-9) { if (ax < minX || ax > maxX) hit = false; }
        else {
          let a = (minX - ax) / dx, c = (maxX - ax) / dx;
          if (a > c) { const s = a; a = c; c = s; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) hit = false;
        }
        if (hit) {
          if (Math.abs(dz) < 1e-9) { if (az < minZ || az > maxZ) hit = false; }
          else {
            let a = (minZ - az) / dz, c = (maxZ - az) / dz;
            if (a > c) { const s = a; a = c; c = s; }
            t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) hit = false;
          }
        }
        if (hit) return true;
      }
      return false;
    }

    const gScore = new Float32Array(N * N), parent = new Int32Array(N * N), closed = new Uint8Array(N * N);
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

    function findPath(sx, sz, tx, tz) {
      const s = nearestWalkable(sx, sz), g = nearestWalkable(tx, tz);
      if (s < 0 || g < 0) return null;
      gScore.fill(1e9); closed.fill(0); parent.fill(-1);
      const gx = g % N, gz = (g / N) | 0;
      const h = (i) => { const dx = Math.abs((i % N) - gx), dz = Math.abs(((i / N) | 0) - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
      const open = [[h(s), s]]; // [f, 칸번호] 최소 힙
      gScore[s] = 0;
      const push = (item) => { open.push(item); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
      const pop = () => {
        const top = open[0], last = open.pop();
        if (open.length) { open[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } }
        return top;
      };
      let found = false;
      while (open.length) {
        const cur = pop()[1];
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === g) { found = true; break; }
        const cx = cur % N, cz = (cur / N) | 0;
        for (const [dx, dz, cost] of DIRS) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const ni = nz * N + nx;
          if (!walk[ni] || closed[ni]) continue;
          if (dx && dz && (!walk[cz * N + nx] || !walk[nz * N + cx])) continue; // 모서리 파고들기 금지
          const ng = gScore[cur] + cost;
          if (ng < gScore[ni]) { gScore[ni] = ng; parent[ni] = cur; push([ng + h(ni), ni]); }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let i = g; i !== -1; i = parent[i]) cells.push(i);
      cells.reverse();
      const pts = [[sx, sz]].concat(cells.map((i) => [-HALF + (i % N) + 0.5, -HALF + ((i / N) | 0) + 0.5]));
      // 직선으로 갈 수 있는 구간은 건너뛰어 부드럽게
      const out = [];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && segBlocked(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
        out.push(pts[j]);
        i = j;
      }
      return out;
    }

    // ---------------- 봇 생성/제거 ----------------
    function spawn(opts) { // opts: { team, name, diff, x, z, yaw, primary }
      const pid = opts.primary || PRIMARIES[Math.floor(Math.random() * PRIMARIES.length)];
      const m = RivalModels.humanoid(opts.team, pid, opts.name);
      m.tag.visible = opts.team === 'A'; // 이름표는 아군만
      const b = {
        isBot: true, id: 'bot' + Math.random().toString(36).slice(2, 7), name: opts.name, team: opts.team,
        x: opts.x, z: opts.z, y: 1.7, vy: 0, onGround: true, yaw: opts.yaw, pitch: 0,
        hp: 100, alive: true, firedT: 0, kills: 0, deaths: 0,
        diff: DIFFS[opts.diff] || DIFFS.normal,
        gun: W.create(pid), pistol: W.create('pistol'),
        mesh: m, target: null, targetVisible: false, lastSeen: null, lastSeenT: -99, reactT: 0.5, aimHead: false,
        percT: Math.random() * 0.12, strafeDir: 0, strafeT: 0, path: null, pathT: 0, huntT: 0, goal: null,
        stuckT: 0, lastPX: opts.x, lastPZ: opts.z, stuckCheckT: 0.5, walkPhase: 0, moving: false, flash: 0, deadT: 0, blindT: 0, muzzleT: 0,
      };
      m.root.position.set(b.x, 0, b.z);
      m.root.rotation.y = b.yaw;
      G.scene.add(m.root);
      bots.push(b);
      return b;
    }

    // 라운드마다 봇을 지울 때 전용 재질/이름표 텍스처를 반납(공유 조각은 그대로 둠)
    function clear() {
      bots.forEach((b) => {
        G.scene.remove(b.mesh.root);
        b.mesh.torso.material.dispose();
        b.mesh.tag.material.map.dispose(); b.mesh.tag.material.dispose();
      });
      bots.length = 0;
    }

    // ---------------- 인지: 가장 가까운 "보이는" 적 찾기 ----------------
    function perceive(b, now) {
      if (b.blindT > 0) { b.targetVisible = false; return; } // 섬광탄에 눈이 멂
      const enemies = G.enemiesOf(b.team);
      let best = null, bd = 1e9;
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = e.x - b.x, dz = e.z - b.z, dy = (e.y - 0.5) - b.y;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 75 || dist >= bd) continue;
        const ang = angDiff(b.yaw, Math.atan2(-dx, -dz));
        const heard = e.firedT > 0 && dist < 32; // 총소리가 들리면 방향을 알아챔
        if (Math.abs(ang) > 1.15 && dist > 7 && !heard) continue; // 시야각 약 130도
        const t = phys.rayBoxes(b.x, b.y, b.z, dx / dist, dy / dist, dz / dist, dist);
        if (t < dist - 0.6) continue; // 중간에 벽이 있음
        if (G.smoked(b.x, b.y, b.z, e.x, e.y - 0.5, e.z)) continue; // 연막 속
        best = e; bd = dist;
      }
      if (best) {
        if (b.target !== best) { b.target = best; b.reactT = b.diff.react * (0.8 + Math.random() * 0.4); b.aimHead = Math.random() < b.diff.head; }
        b.targetVisible = true;
        b.lastSeen = { x: best.x, z: best.z };
        b.lastSeenT = now;
      } else {
        b.targetVisible = false;
        if (b.target && now - b.lastSeenT > 3.5) b.target = null;
      }
    }

    function pickGoal(b, now) {
      if (b.lastSeen && now - b.lastSeenT < 8) { b.goal = { x: b.lastSeen.x, z: b.lastSeen.z }; return; }
      b.lastSeen = null;
      const enemies = G.enemiesOf(b.team).filter((e) => e.alive);
      if (!enemies.length) { b.goal = null; return; }
      let best = enemies[0], bd = 1e9;
      for (const e of enemies) { const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < bd) { bd = d; best = e; } }
      b.goal = { x: best.x + (Math.random() - 0.5) * 10, z: best.z + (Math.random() - 0.5) * 10 }; // 대략적인 위치로 수색
    }

    function preferredDist(w) {
      if (w.melee) return 1.5;
      if (w.scope) return 34;
      if (w.pellets) return 7;
      if (w.range[0] < 25) return 11;
      return 20;
    }

    function turnToward(b, wantYaw, wantPitch, dt) {
      const maxTurn = b.diff.turn * dt;
      b.yaw += clamp(angDiff(b.yaw, wantYaw), -maxTurn, maxTurn);
      b.pitch += clamp(wantPitch - b.pitch, -maxTurn, maxTurn);
    }

    // ---------------- 봇 한 마리 한 프레임 ----------------
    function think(b, dt, now) {
      const D = b.diff, w = b.gun.w;
      if (b.target && !b.target.alive) { b.target = null; b.targetVisible = false; }
      b.percT -= dt;
      if (b.percT <= 0) { b.percT = 0.12; perceive(b, now); }
      if (b.firedT > 0) b.firedT -= dt;
      if (b.blindT > 0) b.blindT -= dt;

      let trigger = false, mx = 0, mz = 0, speed = 0;
      const sin = Math.sin(b.yaw), cos = Math.cos(b.yaw);
      const fwdX = -sin, fwdZ = -cos, rightX = cos, rightZ = -sin;

      if (b.target && b.targetVisible && b.target.alive) {
        const t = b.target;
        const ty = t.y - (b.aimHead ? 0.1 : 0.55);
        const dx = t.x - b.x, dz = t.z - b.z, dy = ty - b.y, hd = Math.hypot(dx, dz), dist = Math.hypot(hd, dy);
        const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, hd);
        turnToward(b, wantYaw, wantPitch, dt);
        b.reactT -= dt;
        const err = Math.abs(angDiff(b.yaw, wantYaw)) + Math.abs(wantPitch - b.pitch);
        if (b.reactT <= 0 && err < 0.07 && dist < w.range[1] * 0.9) trigger = true;

        // 거리 유지 + 좌우 이동(스트레이프)
        const pref = preferredDist(w);
        const radial = hd > pref + 3 ? 1 : hd < pref - 3 ? -1 : 0;
        b.strafeT -= dt;
        if (b.strafeT <= 0) { b.strafeDir = [-1, 0, 1, 1, -1][Math.floor(Math.random() * 5)]; b.strafeT = 0.4 + Math.random() * 1.1; }
        mx = fwdX * radial + rightX * b.strafeDir * D.strafe;
        mz = fwdZ * radial + rightZ * b.strafeDir * D.strafe;
        speed = 3.4 * w.move;
        if (b.gun.reload) speed *= 0.7;
        b.path = null;
      } else {
        // 이동(수색): 목표까지 길찾기
        b.pathT -= dt; b.huntT -= dt;
        if (b.huntT <= 0 || !b.goal) { pickGoal(b, now); b.huntT = 5; b.pathT = 0; }
        if (b.goal && (b.pathT <= 0 || !b.path)) {
          b.path = findPath(b.x, b.z, b.goal.x, b.goal.z);
          b.pathT = 1.2;
        }
        if (b.path && b.path.length) {
          const p = b.path[0];
          const dx = p[0] - b.x, dz = p[1] - b.z, d = Math.hypot(dx, dz);
          if (d < 0.7) { b.path.shift(); if (!b.path.length && b.lastSeen) b.lastSeen = null; }
          else {
            mx = dx / d; mz = dz / d; speed = 4.6 * w.move;
            turnToward(b, Math.atan2(-dx, -dz), 0, dt);
          }
        }
        if (b.gun.ammo < w.mag * 0.5) { b.stuckT = 0; W.reload(b.gun); } // 싸움이 없을 때 미리 장전
      }

      // 이동 적용 (같은 충돌 규칙)
      const len = Math.hypot(mx, mz);
      b.moving = len > 0.01 && speed > 0;
      if (b.moving) {
        const k = speed * dt / Math.max(1, len);
        phys.tryMove(b, b.x + mx * k, b.z);
        phys.tryMove(b, b.x, b.z + mz * k);
      }
      phys.gravity(b, dt, false);

      // 끼임 감지 → 길을 새로 찾음
      b.stuckCheckT -= dt;
      if (b.stuckCheckT <= 0) {
        b.stuckCheckT = 0.6;
        if (b.moving && Math.hypot(b.x - b.lastPX, b.z - b.lastPZ) < 0.25) { b.path = null; b.pathT = 0; b.huntT = 0; if (b.target) b.goal = { x: b.target.x, z: b.target.z }; }
        b.lastPX = b.x; b.lastPZ = b.z;
      }

      // 탄이 없으면 재장전
      if (b.gun.ammo <= 0 && !b.gun.reload) W.reload(b.gun);

      // 발사
      const shots = W.update(b.gun, dt, trigger);
      if (shots > 0) {
        const dirX = -Math.sin(b.yaw) * Math.cos(b.pitch), dirY = Math.sin(b.pitch), dirZ = -Math.cos(b.yaw) * Math.cos(b.pitch);
        const base = w.scope ? w.spread[1] : (w.spread[0] + w.spread[1]) / 2;
        G.shoot(b, b.x, b.y, b.z, dirX, dirY, dirZ, w, Math.hypot(base * 0.6, D.aim));
      }
    }

    // ---------------- 매 프레임 ----------------
    function update(dt, now, live) {
      for (const b of bots) {
        const m = b.mesh;
        if (!b.alive) { // 쓰러지는 연출
          b.deadT += dt; m.tag.visible = false; if (m.flash) m.flash.visible = false;
          m.root.rotation.x = Math.min(Math.PI / 2, b.deadT * 4);
          m.root.position.y = Math.min(0.15, b.deadT * 0.6); // 누운 몸이 바닥에 닿도록 살짝 띄움
          continue;
        }
        if (live) think(b, dt, now); else { b.moving = false; phys.gravity(b, dt, false); }
        m.root.position.set(b.x, b.y - 1.7, b.z);
        m.root.rotation.y = b.yaw;
        if (b.moving) b.walkPhase += dt * 9;
        const sw = b.moving ? Math.sin(b.walkPhase) * 0.7 : 0;
        m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
        if (m.flash) { if (b.muzzleT > 0) b.muzzleT -= dt; m.flash.visible = b.muzzleT > 0; }
        if (b.flash > 0) { b.flash -= dt; m.torso.material.emissive.setHex(b.flash > 0 ? 0xaa1111 : 0x000000); }
      }
    }

    return { bots, spawn, clear, update, DIFFS, NAMES, PRIMARIES, nav: { walk, findPath } };
  }

  window.RivalBots = { create, DIFFS, NAMES };
})();
