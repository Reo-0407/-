const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// 게임 정의 (템플릿). 세부 파라미터(목표값 등)는 라운드 시작할 때 그때그때 생성.
// ---------------------------------------------------------------------------
const GAME_DEFS = {
  numberMatch: {
    id: 'numberMatch',
    name: '숫자 맞추기 대전',
    category: '협동',
    teamBased: false,
    duration: 15,
    tutorialText:
      '제한시간 15초 안에 1~5 중 마음에 드는 숫자를 하나 골라주세요.\n' +
      '참가자 절반보다 많은 사람이 같은 숫자를 고르면 성공이에요!\n' +
      '다 같이 눈치껏 숫자를 맞춰봐요.'
  },
  averageGuess: {
    id: 'averageGuess',
    name: '평균 맞추기',
    category: '협동',
    teamBased: false,
    duration: 20,
    tutorialText: null // 라운드 시작 시 목표값 포함해서 동적으로 생성
  },
  noticeGame: {
    id: 'noticeGame',
    name: '눈치게임',
    category: '대결',
    teamBased: true,
    duration: 12,
    tutorialText:
      '1부터 "생존자 수"까지 중 숫자를 하나 골라주세요 (겹치면 안 돼요!).\n' +
      '같은 숫자를 고른 사람은 모두 탈락해요.\n' +
      '제한시간 안에 숫자를 안 고르면 자동 탈락!\n' +
      '마지막까지 살아남는 사람이 최종 승리자예요. 같은 팀 친구가 우승하면 팀 전원 보너스 점수!\n' +
      '여러 라운드에 걸쳐 진행됩니다.'
  },
  bombNumber: {
    id: 'bombNumber',
    name: '폭탄 숫자 피하기',
    category: '벌칙',
    teamBased: false,
    duration: 10,
    tutorialText:
      '1~5 중 하나를 고르세요.\n' +
      '그 중 하나는 미리 정해진 "폭탄 숫자"예요 (아무도 몰라요!).\n' +
      '폭탄 숫자를 고른 사람은 벌칙 대상이 됩니다.'
  }
};

const GENDER_LABEL = { m: '남', f: '여', na: '비공개' };

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createInitialState() {
  return {
    phase: 'setup', // setup | lobby | tutorial | playing | roundResult | result
    maxPlayers: 4,
    players: [], // {id, nickname, gender, team, score, connected, claimed, socketId}
    currentGame: null,
    history: [], // {gameName, category, ts, summary}
    penaltyOverlay: null // {text, ts}
  };
}

let state = createInitialState();
let roundTimer = null;
let roundResultTimer = null;
let penaltyTimer = null;

function connectedPlayers() {
  return state.players.filter((p) => p.connected);
}

function broadcast() {
  io.emit('state', sanitizeState());
}

// 진행 중(playing) 라운드에서는 남이 뭘 골랐는지 새기 전까지 값은 숨기고
// "누가 제출했는지"만 보여준다.
function sanitizeState() {
  const s = JSON.parse(JSON.stringify(state));
  if (s.currentGame && s.currentGame.phase === 'playing') {
    s.currentGame.submittedIds = Object.keys(s.currentGame.submissions || {});
    delete s.currentGame.submissions;
  }
  return s;
}

function clearTimers() {
  if (roundTimer) clearTimeout(roundTimer);
  if (roundResultTimer) clearTimeout(roundResultTimer);
  roundTimer = null;
  roundResultTimer = null;
}

// ---------------------------------------------------------------------------
// 게임 시작 / 라운드 진행
// ---------------------------------------------------------------------------
function startGame(gameId) {
  const def = GAME_DEFS[gameId];
  if (!def) return;
  clearTimers();

  const data = { min: 1, max: 5 };
  let tutorialText = def.tutorialText;

  if (gameId === 'averageGuess') {
    data.min = 1;
    data.max = 100;
    data.target = randInt(30, 70);
    data.tolerance = 5;
    tutorialText =
      `1~100 사이의 숫자를 하나 골라주세요.\n` +
      `모두가 고른 숫자의 평균이 ${data.target}에 가까우면(오차 ±${data.tolerance}) 성공이에요!\n` +
      `너무 크거나 작은 숫자만 고르면 실패할 수 있어요, 서로 다른 숫자로 균형을 맞춰보세요.`;
  } else if (gameId === 'noticeGame') {
    data.aliveIds = connectedPlayers().map((p) => p.id);
    data.round = 1;
    data.max = Math.max(2, data.aliveIds.length);
    data.min = 1;
  } else if (gameId === 'bombNumber') {
    data.bomb = randInt(1, 5);
  }

  state.currentGame = {
    gameId,
    name: def.name,
    category: def.category,
    teamBased: def.teamBased,
    duration: def.duration,
    tutorialText,
    data,
    phase: 'tutorial',
    readyIds: [],
    submissions: {},
    roundEndsAt: null,
    lastRoundSummary: null,
    finalSummary: null
  };
  state.phase = 'tutorial';
  broadcast();
}

function beginRound() {
  if (!state.currentGame) return;
  clearTimers();
  const cg = state.currentGame;
  cg.phase = 'playing';
  cg.submissions = {};
  cg.roundEndsAt = Date.now() + cg.duration * 1000;
  state.phase = 'playing';
  broadcast();
  roundTimer = setTimeout(resolveRound, cg.duration * 1000);
}

function eligiblePlayerIds() {
  const cg = state.currentGame;
  if (!cg) return [];
  if (cg.gameId === 'noticeGame') return cg.data.aliveIds;
  return connectedPlayers().map((p) => p.id);
}

function maybeAutoResolve() {
  const cg = state.currentGame;
  if (!cg || cg.phase !== 'playing') return;
  const need = eligiblePlayerIds();
  const got = Object.keys(cg.submissions);
  if (need.length > 0 && need.every((id) => got.includes(id))) {
    resolveRound();
  }
}

function addScore(playerId, delta) {
  const p = state.players.find((pl) => pl.id === playerId);
  if (p) p.score += delta;
}

function resolveRound() {
  const cg = state.currentGame;
  if (!cg || cg.phase !== 'playing') return;
  clearTimers();

  if (cg.gameId === 'numberMatch') {
    resolveNumberMatch(cg);
  } else if (cg.gameId === 'averageGuess') {
    resolveAverageGuess(cg);
  } else if (cg.gameId === 'noticeGame') {
    resolveNoticeGame(cg);
    return; // 자체적으로 다음 라운드/종료 처리
  } else if (cg.gameId === 'bombNumber') {
    resolveBombNumber(cg);
  }
  finishGame(cg);
}

function resolveNumberMatch(cg) {
  const counts = {};
  Object.values(cg.submissions).forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });
  const total = eligiblePlayerIds().length;
  let bestNum = null;
  let bestCount = 0;
  Object.entries(counts).forEach(([num, cnt]) => {
    if (cnt > bestCount) {
      bestCount = cnt;
      bestNum = num;
    }
  });
  const success = bestCount > total / 2;
  if (success) {
    eligiblePlayerIds().forEach((id) => addScore(id, 1));
  }
  cg.finalSummary = {
    success,
    text: success
      ? `${bestCount}명이 [${bestNum}]을(를) 골라서 성공! 전원 +1점`
      : `숫자가 흩어졌어요 (최다 ${bestCount}명). 실패!`,
    choices: cg.submissions
  };
}

function resolveAverageGuess(cg) {
  const vals = Object.values(cg.submissions).map(Number);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const success = Math.abs(avg - cg.data.target) <= cg.data.tolerance;
  if (success) {
    eligiblePlayerIds().forEach((id) => addScore(id, 1));
  }
  cg.finalSummary = {
    success,
    text: `평균 ${avg.toFixed(1)} (목표 ${cg.data.target}±${cg.data.tolerance}) → ${
      success ? '성공! 전원 +1점' : '실패!'
    }`,
    choices: cg.submissions
  };
}

function resolveBombNumber(cg) {
  const bomb = cg.data.bomb;
  const hit = [];
  const safe = [];
  Object.entries(cg.submissions).forEach(([id, v]) => {
    if (Number(v) === bomb) hit.push(id);
    else safe.push(id);
  });
  // 제출 안 한 사람은 안전 처리하지 않음(패널티 대상 아님, 그냥 0점)
  safe.forEach((id) => addScore(id, 1));
  cg.finalSummary = {
    success: null,
    text: `폭탄 숫자는 [${bomb}] 이었습니다! 벌칙 대상: ${
      hit.length ? hit.map((id) => nameOf(id)).join(', ') : '없음 (아무도 안 골랐어요)'
    }`,
    choices: cg.submissions,
    penaltyTargets: hit
  };
}

function nameOf(id) {
  const p = state.players.find((pl) => pl.id === id);
  return p ? p.nickname : '???';
}

function resolveNoticeGame(cg) {
  const counts = {};
  cg.data.aliveIds.forEach((id) => {
    const v = cg.submissions[id];
    if (v === undefined) return; // 미제출 = 탈락 처리 아래에서
    counts[v] = counts[v] || [];
    counts[v].push(id);
  });

  const eliminated = [];
  const survivedThisRound = [];
  cg.data.aliveIds.forEach((id) => {
    const v = cg.submissions[id];
    if (v === undefined) {
      eliminated.push(id); // 시간 초과 = 탈락
      return;
    }
    if (counts[v].length > 1) {
      eliminated.push(id); // 숫자 겹침 = 탈락
    } else {
      survivedThisRound.push(id);
    }
  });

  eliminated.forEach((id) => {
    cg.data.aliveIds = cg.data.aliveIds.filter((x) => x !== id);
  });

  cg.lastRoundSummary = {
    round: cg.data.round,
    choices: cg.submissions,
    eliminated,
    survivors: [...cg.data.aliveIds]
  };

  if (cg.data.aliveIds.length <= 1) {
    const winnerId = cg.data.aliveIds[0] || null;
    let teamBonusText = '';
    if (winnerId) {
      addScore(winnerId, 3);
      if (cg.teamBased) {
        const winner = state.players.find((p) => p.id === winnerId);
        const teammates = state.players.filter(
          (p) => p.team === winner.team && p.id !== winnerId && p.connected
        );
        teammates.forEach((p) => addScore(p.id, 1));
        if (teammates.length) {
          teamBonusText = ` ${winner.team === 'A' ? '🔵 A팀' : '🔴 B팀'} 동료들도 +1점!`;
        }
      }
    }
    cg.finalSummary = {
      success: !!winnerId,
      text: winnerId
        ? `최종 승리자: ${nameOf(winnerId)}! (+3점)${teamBonusText}`
        : '아무도 살아남지 못했습니다. 전원 탈락 무승부!',
      winnerId
    };
    finishGame(cg);
    return;
  }

  if (cg.data.round >= 6) {
    // 안전장치: 6라운드까지 못 끝나면 생존자 전원 공동 승리 처리
    cg.data.aliveIds.forEach((id) => addScore(id, 1));
    cg.finalSummary = {
      success: true,
      text: `라운드 한도 도달! 생존자 ${cg.data.aliveIds
        .map((id) => nameOf(id))
        .join(', ')} 공동 승리 (+1점씩)`
    };
    finishGame(cg);
    return;
  }

  // 다음 라운드 준비 (결과를 잠깐 보여준 뒤 자동 진행)
  cg.phase = 'roundResult';
  cg.data.round += 1;
  cg.data.max = Math.max(2, cg.data.aliveIds.length);
  state.phase = 'roundResult';
  broadcast();
  roundResultTimer = setTimeout(() => {
    cg.submissions = {};
    beginRound();
  }, 4000);
}

function finishGame(cg) {
  cg.phase = 'result';
  state.phase = 'result';
  state.history.push({
    gameName: cg.name,
    category: cg.category,
    ts: Date.now(),
    summary: cg.finalSummary ? cg.finalSummary.text : ''
  });
  broadcast();
}

// ---------------------------------------------------------------------------
// Socket.io 이벤트
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.emit('state', sanitizeState());

  socket.on('admin:setup', ({ maxPlayers }) => {
    const n = Math.max(2, Math.min(12, Number(maxPlayers) || 4));
    state = createInitialState();
    state.maxPlayers = n;
    const teamOrder = ['A', 'B'];
    state.players = Array.from({ length: n }, (_, i) => ({
      id: 'p' + i,
      nickname: null,
      gender: null,
      team: teamOrder[i % 2],
      score: 0,
      connected: false,
      claimed: false,
      socketId: null
    }));
    state.phase = 'lobby';
    broadcast();
  });

  // 새로운 플레이어가 빈 자리에 자기 닉네임/성별을 입력해서 입장
  socket.on('player:register', ({ nickname, gender }) => {
    if (state.phase === 'setup') return;
    const nick = String(nickname || '').trim().slice(0, 12);
    if (!nick) {
      socket.emit('registerFailed', { reason: 'empty' });
      return;
    }
    const slot = state.players.find((p) => !p.claimed);
    if (!slot) {
      socket.emit('registerFailed', { reason: 'full' });
      return;
    }
    slot.nickname = nick;
    slot.gender = gender || 'na';
    slot.claimed = true;
    slot.connected = true;
    slot.socketId = socket.id;
    socket.data.playerId = slot.id;
    socket.emit('registered', { playerId: slot.id });
    broadcast();
  });

  // 새로고침/재접속 시 이미 입장했던 자리로 복귀
  socket.on('player:join', ({ playerId }) => {
    const p = state.players.find((pl) => pl.id === playerId);
    if (!p || !p.claimed) return;
    p.connected = true;
    p.socketId = socket.id;
    socket.data.playerId = playerId;
    broadcast();
  });

  socket.on('admin:autoAssignTeams', () => {
    const shuffled = [...state.players].sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => {
      p.team = i % 2 === 0 ? 'A' : 'B';
    });
    broadcast();
  });

  socket.on('admin:setPlayerTeam', ({ playerId, team }) => {
    const p = state.players.find((pl) => pl.id === playerId);
    if (p) p.team = team;
    broadcast();
  });

  socket.on('admin:startGame', ({ gameId }) => {
    if (state.phase !== 'lobby') return;
    startGame(gameId);
  });

  socket.on('player:ready', () => {
    const cg = state.currentGame;
    const pid = socket.data.playerId;
    if (!cg || cg.phase !== 'tutorial' || !pid) return;
    if (!cg.readyIds.includes(pid)) cg.readyIds.push(pid);
    const need = connectedPlayers().map((p) => p.id);
    broadcast();
    if (need.length > 0 && need.every((id) => cg.readyIds.includes(id))) {
      beginRound();
    }
  });

  socket.on('admin:forceStart', () => {
    const cg = state.currentGame;
    if (!cg || cg.phase !== 'tutorial') return;
    beginRound();
  });

  socket.on('player:submit', ({ value }) => {
    const cg = state.currentGame;
    const pid = socket.data.playerId;
    if (!cg || cg.phase !== 'playing' || !pid) return;
    if (!eligiblePlayerIds().includes(pid)) return;
    cg.submissions[pid] = value;
    broadcast();
    maybeAutoResolve();
  });

  socket.on('admin:endRoundNow', () => {
    if (state.currentGame && state.currentGame.phase === 'playing') resolveRound();
  });

  socket.on('admin:sendPenalty', ({ text }) => {
    if (!text) return;
    state.penaltyOverlay = { text: String(text).slice(0, 200), ts: Date.now() };
    broadcast();
    if (penaltyTimer) clearTimeout(penaltyTimer);
    penaltyTimer = setTimeout(() => {
      state.penaltyOverlay = null;
      broadcast();
    }, 10000);
  });

  socket.on('admin:clearPenalty', () => {
    state.penaltyOverlay = null;
    if (penaltyTimer) clearTimeout(penaltyTimer);
    broadcast();
  });

  socket.on('admin:backToLobby', () => {
    clearTimers();
    state.currentGame = null;
    state.phase = 'lobby';
    broadcast();
  });

  socket.on('admin:resetHistory', () => {
    state.history = [];
    state.players.forEach((p) => (p.score = 0));
    broadcast();
  });

  socket.on('admin:fullReset', () => {
    clearTimers();
    state = createInitialState();
    broadcast();
  });

  socket.on('disconnect', () => {
    const pid = socket.data.playerId;
    if (pid) {
      const p = state.players.find((pl) => pl.id === pid);
      if (p && p.socketId === socket.id) {
        p.connected = false;
        p.socketId = null;
        broadcast();
      }
    }
  });
});

app.get('/api/games', (req, res) => {
  res.json(Object.values(GAME_DEFS).map((g) => ({ id: g.id, name: g.name, category: g.category })));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`풀빌라 파티 게임 서버 실행 중: http://localhost:${PORT}`);
});
