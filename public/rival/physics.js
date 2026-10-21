// RIVAL 충돌/이동/광선(총알) 계산. 플레이어와 봇이 똑같이 사용.
// 캐릭터(entity)는 { x, y, z, vy, onGround } 를 가진 객체. y 는 "눈 높이"(발 높이 = y - EYE).
(function () {
  const EYE = 1.7, RADIUS = 0.4, STEP_H = 0.55;

  function create(boxes) {
    // (x,y,z)에 서 있을 때 겹치는 상자들 중 가장 높은 윗면 높이. 안 겹치면 null
    function blockTop(x, y, z) {
      const feet = y - EYE, head = y + 0.2;
      let top = null;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (x + RADIUS > b.minX && x - RADIUS < b.maxX && z + RADIUS > b.minZ && z - RADIUS < b.maxZ
            && head > b.minY && feet < b.maxY - 0.01) {
          if (top === null || b.maxY > top) top = b.maxY;
        }
      }
      return top;
    }
    const hitsBox = (x, y, z) => blockTop(x, y, z) !== null;

    // 이동 시도: 막히면 계단 높이(0.55m) 이하일 때 올라서고, 아니면 막힘
    function tryMove(e, nx, nz) {
      const top = blockTop(nx, e.y, nz);
      if (top === null) { e.x = nx; e.z = nz; return; }
      if (!e.onGround) return;
      const need = top - (e.y - EYE);
      if (need > 0 && need <= STEP_H && !hitsBox(nx, e.y + need + 0.02, nz)) {
        e.y += need + 0.02; e.x = nx; e.z = nz;
      }
    }

    // 중력 + 점프 + 착지 + 머리 부딪힘
    function gravity(e, dt, jump) {
      if (jump && e.onGround) { e.vy = 7.5; e.onGround = false; }
      e.vy -= 20 * dt;
      let ny = e.y + e.vy * dt;
      e.onGround = false;
      if (e.vy < 0) {
        let floorY = 0;
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (e.x + RADIUS > b.minX && e.x - RADIUS < b.maxX && e.z + RADIUS > b.minZ && e.z - RADIUS < b.maxZ
              && e.y - EYE >= b.maxY - 0.05 && b.maxY > floorY) floorY = b.maxY;
        }
        if (ny - EYE <= floorY) { ny = floorY + EYE; e.vy = 0; e.onGround = true; }
      } else if (hitsBox(e.x, ny, e.z)) {
        e.vy = 0; ny = e.y;
      }
      e.y = ny;
    }

    // 광선(총알/시야)이 처음 부딪히는 거리. 안 부딪히면 Infinity. (d 는 길이 1로 정규화된 방향)
    function rayBoxes(ox, oy, oz, dx, dy, dz, max) {
      let best = max;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        let t0 = 0, t1 = best;
        if (Math.abs(dx) < 1e-9) { if (ox < b.minX || ox > b.maxX) continue; }
        else {
          let a = (b.minX - ox) / dx, c = (b.maxX - ox) / dx;
          if (a > c) { const s = a; a = c; c = s; }
          if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue;
        }
        if (Math.abs(dy) < 1e-9) { if (oy < b.minY || oy > b.maxY) continue; }
        else {
          let a = (b.minY - oy) / dy, c = (b.maxY - oy) / dy;
          if (a > c) { const s = a; a = c; c = s; }
          if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue;
        }
        if (Math.abs(dz) < 1e-9) { if (oz < b.minZ || oz > b.maxZ) continue; }
        else {
          let a = (b.minZ - oz) / dz, c = (b.maxZ - oz) / dz;
          if (a > c) { const s = a; a = c; c = s; }
          if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue;
        }
        if (t0 < best) best = t0;
      }
      return best >= max ? Infinity : best;
    }

    return { blockTop, hitsBox, tryMove, gravity, rayBoxes };
  }

  // 광선 vs 구 (머리 판정용). 맞으면 거리, 아니면 -1
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = ox - cx, ly = oy - cy, lz = oz - cz;
    const b = lx * dx + ly * dy + lz * dz;
    const c = lx * lx + ly * ly + lz * lz - r * r;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    const t = -b - s;
    if (t >= 0) return t;
    return -b + s >= 0 ? 0 : -1;
  }

  // 광선 vs 상자 하나 (몸통 판정용). 맞으면 거리, 아니면 -1
  function rayAABB(ox, oy, oz, dx, dy, dz, minX, maxX, minY, maxY, minZ, maxZ) {
    let t0 = 0, t1 = Infinity;
    const o = [ox, oy, oz], d = [dx, dy, dz], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) return -1; continue; }
      let a = (mn[k] - o[k]) / d[k], c = (mx[k] - o[k]) / d[k];
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) return -1;
    }
    return t0;
  }

  window.RivalPhys = { create, raySphere, rayAABB, EYE, RADIUS, STEP_H };
})();
