// RIVAL 맵 "창고 단지" — 64x64m 야드 + 2층 중앙 건물 + 컨테이너 + 고가 통로 + 엄폐물
// 좌표 규칙: x = 좌우, y = 높이, z = 앞뒤. 남쪽(z+)이 A팀 스폰, 북쪽(z-)이 B팀 스폰.
// 맵은 전부 "상자(박스)" 조합이라 충돌 계산이 단순하고 폰에서도 가볍게 돌아감.
(function () {
  const TILE = { crate: 1.2, metal: 2.4, hazard: 1.2, brick: 2.5, concrete: 2.5, floor: 4, plain: 4 };
  const texCache = {}, matCache = {};

  function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  // 그림 파일 없이 캔버스로 직접 그리는 무늬(텍스처)
  const painters = {
    concrete(g, S) {
      g.fillStyle = '#b9bcc2'; g.fillRect(0, 0, S, S);
      const r = rnd(7);
      for (let i = 0; i < 700; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * 0.09 + ')'; g.fillRect(r() * S, r() * S, 3, 3); }
      g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 4; g.strokeRect(0, 0, S, S);
    },
    floor(g, S) {
      g.fillStyle = '#7b8089'; g.fillRect(0, 0, S, S);
      const r = rnd(11);
      for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * 0.1 + ')'; g.fillRect(r() * S, r() * S, 3, 3); }
      g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 3; g.strokeRect(0, 0, S, S);
      g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
    },
    brick(g, S) {
      g.fillStyle = '#cdbfb0'; g.fillRect(0, 0, S, S);
      const rows = 8, bh = S / rows, bw = S / 4;
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let c = -1; c < 5; c++) {
          const shade = 70 + ((row * 7 + c * 13) % 5) * 6;
          g.fillStyle = 'rgb(' + (150 + shade / 3) + ',' + (80 + shade / 5) + ',' + (62 + shade / 6) + ')';
          g.fillRect(c * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
        }
      }
    },
    crate(g, S) {
      g.fillStyle = '#c4915a'; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(80,45,15,.45)'; g.lineWidth = 3;
      for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, i * S / 5); g.lineTo(S, i * S / 5); g.stroke(); }
      g.strokeStyle = '#6b4521'; g.lineWidth = 14; g.strokeRect(7, 7, S - 14, S - 14);
      g.lineWidth = 10; g.beginPath(); g.moveTo(10, 10); g.lineTo(S - 10, S - 10); g.moveTo(S - 10, 10); g.lineTo(10, S - 10); g.stroke();
    },
    metal(g, S) {
      const n = 16;
      for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#e9e9e9' : '#bfbfbf'; g.fillRect(i * S / n, 0, S / n, S); }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, S, 8); g.fillRect(0, S - 8, S, 8);
    },
    hazard(g, S) {
      g.fillStyle = '#f2c500'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#1b1b1b';
      for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * S / 4, 0); g.lineTo(i * S / 4 + S / 8, 0); g.lineTo(i * S / 4 + S / 8 + S / 2, S); g.lineTo(i * S / 4 + S / 2, S); g.fill(); }
    },
    plain(g, S) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); },
  };

  function tex(kind) {
    if (!texCache[kind]) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      painters[kind](c.getContext('2d'), 128);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      texCache[kind] = t;
    }
    return texCache[kind];
  }

  function mat(kind, color) {
    const key = kind + ':' + color;
    if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial({ map: tex(kind), color });
    return matCache[key];
  }

  // 박스 6면의 무늬(UV)를 실제 크기에 맞게 반복시켜서 늘어나 보이지 않게 함
  function scaleUV(geo, w, h, d, tile) {
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x, -x, +y, -y, +z, -z 면
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
      }
    }
    uv.needsUpdate = true;
  }

  function build(scene, opts) {
    opts = opts || {};
    const boxes = [];
    const W = 0xffffff;

    // 두 모서리 좌표로 박스 생성 (순서 상관없음). collide=false면 장식(부딪히지 않음)
    function box(x0, x1, y0, y1, z0, z1, kind, color, collide, shadow) {
      const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
      const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
      const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
      const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
      if (w <= 0 || h <= 0 || d <= 0) return;
      const geo = new THREE.BoxGeometry(w, h, d);
      scaleUV(geo, w, h, d, TILE[kind] || 2.5);
      const m = new THREE.Mesh(geo, mat(kind, color === undefined ? W : color));
      m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      m.castShadow = !!opts.shadows && shadow !== false;
      m.receiveShadow = !!opts.shadows;
      scene.add(m);
      if (collide !== false) boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
    }
    const deco = (x0, x1, y0, y1, z0, z1, kind, color) => box(x0, x1, y0, y1, z0, z1, kind, color, false, false);

    // 계단: 한 칸씩 위로 쌓은 박스. 플레이어는 자동으로 올라감(최대 0.55m 턱)
    function stairsZ(x0, x1, zStart, dirZ, n, rise, run, kind, color) {
      for (let i = 0; i < n; i++) box(x0, x1, 0, rise * (i + 1), zStart + dirZ * run * i, zStart + dirZ * run * (i + 1), kind, color);
    }
    function stairsX(z0, z1, xStart, dirX, n, rise, run, kind, color) {
      for (let i = 0; i < n; i++) box(xStart + dirX * run * i, xStart + dirX * run * (i + 1), 0, rise * (i + 1), z0, z1, kind, color);
    }
    function barrel(x, z, color) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), new THREE.MeshLambertMaterial({ color }));
      m.position.set(x, 0.55, z);
      m.castShadow = !!opts.shadows; m.receiveShadow = !!opts.shadows;
      scene.add(m);
      boxes.push({ minX: x - 0.42, maxX: x + 0.42, minY: 0, maxY: 1.1, minZ: z - 0.42, maxZ: z + 0.42 });
    }
    const mirrorZ = (fn) => { fn(1); fn(-1); }; // 남북 대칭으로 같은 구조물을 한 쌍 만듦(공평한 맵)

    // ---------------- 조명 ----------------
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x586070, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2dd, 0.75);
    sun.position.set(30, 60, 20);
    if (opts.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 150;
      sun.shadow.bias = -0.0008;
    }
    scene.add(sun);

    // ---------------- 바닥 / 바깥 벽 / 먼 도시 ----------------
    box(-80, 80, -0.3, 0, -80, 80, 'floor', W, false, false);
    box(-33, 33, 0, 7, -33, -32, 'concrete', 0xd0d3d9); // 북
    box(-33, 33, 0, 7, 32, 33, 'concrete', 0xd0d3d9);   // 남
    box(-33, -32, 0, 7, -32, 32, 'concrete', 0xd0d3d9); // 서
    box(32, 33, 0, 7, -32, 32, 'concrete', 0xd0d3d9);   // 동
    // 벽 아래쪽 위험 표시 띠 (장식)
    deco(-32, 32, 0, 0.5, -32, -31.9, 'hazard', W); deco(-32, 32, 0, 0.5, 31.9, 32, 'hazard', W);
    deco(-32, -31.9, 0, 0.5, -32, 32, 'hazard', W); deco(31.9, 32, 0, 0.5, -32, 32, 'hazard', W);
    const r = rnd(42);
    for (let i = 0; i < 26; i++) { // 벽 바깥 멀리 보이는 건물들(장식)
      const a = (i / 26) * Math.PI * 2, dist = 52 + r() * 22, bw = 6 + r() * 8, bh = 10 + r() * 28;
      const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
      deco(cx - bw / 2, cx + bw / 2, 0, bh, cz - bw / 2, cz + bw / 2, 'concrete', 0x6a7690);
    }

    // ---------------- 스폰 구역 ----------------
    deco(-13, 13, 0, 0.04, 21, 31, 'plain', 0x2a52a8);   // A팀(남쪽) 파란 바닥
    deco(-13, 13, 0, 0.04, -31, -21, 'plain', 0xa83a3f); // B팀(북쪽) 빨간 바닥
    mirrorZ((s) => { // 스폰 앞 낮은 엄폐벽
      box(-11, -6, 0, 1.3, 19 * s, 19.4 * s, 'concrete', 0xd0d3d9);
      box(6, 11, 0, 1.3, 19 * s, 19.4 * s, 'concrete', 0xd0d3d9);
    });
    // 중앙 차선 (장식)
    mirrorZ((s) => { deco(-0.12, 0.12, 0, 0.03, 9 * s, 21 * s, 'plain', 0xf5f5f5); });

    // ---------------- 중앙 2층 건물 ----------------
    const BRICK = 0xffffff, TOP = 0xd0d3d9;
    // 남/북 벽: 가운데 문(폭 3m)
    mirrorZ((s) => {
      box(-9.3, -1.5, 0, 4, 6.7 * s, 7.3 * s, 'brick', BRICK);
      box(1.5, 9.3, 0, 4, 6.7 * s, 7.3 * s, 'brick', BRICK);
      box(-1.5, 1.5, 3.2, 4, 6.7 * s, 7.3 * s, 'brick', BRICK); // 문 위 가로대
    });
    // 서쪽 벽: 창문 2개
    box(-9.3, -8.7, 0, 4, -7.3, -4, 'brick', BRICK);
    box(-9.3, -8.7, 0, 1.0, -4, -1, 'brick', BRICK); box(-9.3, -8.7, 3.4, 4, -4, -1, 'brick', BRICK);
    box(-9.3, -8.7, 0, 4, -1, 1, 'brick', BRICK);
    box(-9.3, -8.7, 0, 1.0, 1, 4, 'brick', BRICK); box(-9.3, -8.7, 3.4, 4, 1, 4, 'brick', BRICK);
    box(-9.3, -8.7, 0, 4, 4, 7.3, 'brick', BRICK);
    // 동쪽 벽: 창문 2개 + 가운데 문
    box(8.7, 9.3, 0, 4, -7.3, -4, 'brick', BRICK);
    box(8.7, 9.3, 0, 1.0, -4, -1.5, 'brick', BRICK); box(8.7, 9.3, 3.4, 4, -4, -1.5, 'brick', BRICK);
    box(8.7, 9.3, 3.2, 4, -1.5, 1.5, 'brick', BRICK);
    box(8.7, 9.3, 0, 1.0, 1.5, 4, 'brick', BRICK); box(8.7, 9.3, 3.4, 4, 1.5, 4, 'brick', BRICK);
    box(8.7, 9.3, 0, 4, 4, 7.3, 'brick', BRICK);
    // 2층 바닥(슬래브): 계단 구멍 x[-8.7,-6.3] z[0,5.8]을 비워둠
    box(-9.3, 9.3, 4, 4.4, -7.3, 0, 'concrete', TOP);
    box(-9.3, 9.3, 4, 4.4, 5.8, 7.3, 'concrete', TOP);
    box(-9.3, -8.7, 4, 4.4, 0, 5.8, 'concrete', TOP);
    box(-6.3, 9.3, 4, 4.4, 0, 5.8, 'concrete', TOP);
    // 1층 안에서 2층으로 올라가는 계단 (북쪽 끝에서 시작 → 남쪽으로 올라감)
    stairsZ(-8.7, -6.5, -3.0, 1, 11, 0.4, 0.8, 'concrete', 0xb0b4bb);
    // 2층 난간(1.2m): 바깥 둘레 + 계단 구멍 옆 안전바
    box(-9.3, 9.3, 4.4, 5.6, -7.3, -6.7, 'concrete', TOP);
    box(-9.3, 9.3, 4.4, 5.6, 6.7, 7.3, 'concrete', TOP);
    box(-9.3, -8.7, 4.4, 5.6, -6.7, 6.7, 'concrete', TOP);
    box(8.7, 9.3, 4.4, 5.6, -6.7, 6.7, 'concrete', TOP);
    box(-6.5, -6.1, 4.4, 5.4, 0, 5.8, 'metal', 0x888888);
    // 2층 엄폐물
    box(2, 4, 4.4, 5.4, -4.5, -2.5, 'crate', W);
    box(-3, -1.8, 4.4, 5.6, 1.5, 3.5, 'concrete', TOP);
    box(4.5, 5.7, 4.4, 5.6, 2.8, 4.0, 'crate', W);
    // 1층 안쪽 엄폐물
    box(-1, 1, 0, 1.2, -1, 1, 'crate', W);
    box(4, 5.2, 0, 1.2, -5.5, -4.3, 'crate', W);
    box(4, 7, 0, 1.0, 3.5, 3.9, 'concrete', TOP);
    // 건물 앞 엄폐 방벽(문을 가려줌)
    mirrorZ((s) => { box(-2.5, 2.5, 0, 0.95, 11.6 * s, 12.2 * s, 'hazard', W); });

    // ---------------- 동쪽: 화물 컨테이너 + 오르는 계단 ----------------
    mirrorZ((s) => {
      const color = s === 1 ? 0xb3402f : 0x2f6bb3;
      box(17, 19.4, 0, 2.6, -13 * s, -1 * s, 'metal', color);
      stairsZ(17, 19.4, -16 * s, s, 5, 0.52, 0.6, 'crate', W); // 컨테이너 위로 올라가는 상자 계단
      box(22, 24.4, 0, 2.6, -9 * s, -3 * s, 'metal', s === 1 ? 0xd9a21b : 0x3a9a5b);
      box(22.5, 23.7, 0, 1.2, -12 * s, -10.8 * s, 'crate', W);
    });

    // ---------------- 서쪽: 고가 통로(플랫폼) + 계단 ----------------
    mirrorZ((s) => {
      box(-25, -17, 2.6, 3.0, -14 * s, -6 * s, 'concrete', 0xb0b4bb); // 바닥판
      [[-25, -24.2, -14, -13.2], [-17.8, -17, -14, -13.2], [-25, -24.2, -6.8, -6], [-17.8, -17, -6.8, -6]]
        .forEach((p) => box(p[0], p[1], 0, 2.6, p[2] * s, p[3] * s, 'concrete', 0x9aa0aa)); // 기둥 4개
      stairsX(-11 * s, -9 * s, -10.6, -1, 8, 0.375, 0.8, 'metal', 0x6d7480); // 올라가는 계단
      // 난간 (계단 입구 쪽만 열려 있음)
      box(-25, -17, 3, 4, -14 * s, -13.8 * s, 'metal', 0x6d7480);
      box(-25, -17, 3, 4, -6.2 * s, -6 * s, 'metal', 0x6d7480);
      box(-25, -24.8, 3, 4, -14 * s, -6 * s, 'metal', 0x6d7480);
      box(-17.2, -17, 3, 4, -14 * s, -11 * s, 'metal', 0x6d7480);
      box(-17.2, -17, 3, 4, -9 * s, -6 * s, 'metal', 0x6d7480);
      box(-22, -20.8, 3, 4.2, -11 * s, -9.8 * s, 'crate', W); // 플랫폼 위 엄폐 상자
    });

    // ---------------- 중간 지대 엄폐물 (남북 대칭) ----------------
    mirrorZ((s) => {
      // 낮은 방벽
      box(-4, 4, 0, 0.95, -20 * s, -19.4 * s, 'hazard', W);
      box(10, 13.5, 0, 0.95, -20 * s, -19.4 * s, 'hazard', W);
      box(-16, -12.5, 0, 0.95, -22 * s, -21.4 * s, 'hazard', W);
      // 상자 더미 (2단 쌓기)
      box(-13, -11.8, 0, 1.2, -27 * s, -25.8 * s, 'crate', W);
      box(-13, -11.8, 0, 1.2, -25.8 * s, -24.6 * s, 'crate', W);
      box(-13, -11.8, 1.2, 2.4, -27 * s, -25.8 * s, 'crate', W);
      box(8, 9.2, 0, 1.2, -25 * s, -23.8 * s, 'crate', W);
      box(8, 9.2, 1.2, 2.4, -25 * s, -23.8 * s, 'crate', W);
      box(-21, -18.6, 0, 2.4, -22 * s, -19.6 * s, 'crate', W); // 큰 상자 벽
      box(5, 6.2, 0, 1.2, -17 * s, -15.8 * s, 'crate', W);
      box(-8, -6.8, 0, 1.2, -13.5 * s, -12.3 * s, 'crate', W);
      box(26, 27.2, 0, 1.2, -20 * s, -18.8 * s, 'crate', W);
      // 콘크리트 기둥
      box(-5.5, -4.5, 0, 4, -15 * s, -14 * s, 'concrete', TOP);
      box(4.5, 5.5, 0, 4, -15 * s, -14 * s, 'concrete', TOP);
      box(-1, 1, 0, 2.2, -17 * s, -16 * s, 'concrete', TOP);
      // 드럼통
      barrel(-28, -18 * s, 0x3c7a4a); barrel(-27, -19.2 * s, 0xb3402f); barrel(-28.6, -19.6 * s, 0x2f6bb3);
      barrel(28, -23 * s, 0xd9a21b); barrel(29.2, -22.2 * s, 0x3c7a4a);
      // 가로등 (장식)
      deco(13.85, 14.15, 0, 6, -16.15 * s, -15.85 * s, 'plain', 0x33383f);
      deco(-14.15, -13.85, 0, 6, -16.15 * s, -15.85 * s, 'plain', 0x33383f);
      deco(13.4, 14.6, 6, 6.2, -16.5 * s, -15.5 * s, 'plain', 0xfff3b0);
      deco(-14.6, -13.4, 6, 6.2, -16.5 * s, -15.5 * s, 'plain', 0xfff3b0);
    });

    // 스폰 위치: 팀당 7곳. yaw 0 = 북쪽(-z) 바라봄, PI = 남쪽(+z) 바라봄
    const spawns = { A: [], B: [] };
    for (let i = -3; i <= 3; i++) {
      spawns.A.push({ x: i * 3, z: 27, yaw: 0 });
      spawns.B.push({ x: i * 3, z: -27, yaw: Math.PI });
    }
    return { boxes, spawns, name: '창고 단지' };
  }

  window.RivalMap = { build };
})();
