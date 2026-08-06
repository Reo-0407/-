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
    minPlayers: 1,
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
    minPlayers: 1,
    duration: 20,
    tutorialText: null
  },
  sumTarget: {
    id: 'sumTarget',
    name: '총합 맞추기',
    category: '협동',
    teamBased: false,
    minPlayers: 1,
    duration: 20,
    tutorialText: null
  },
  colorCollect: {
    id: 'colorCollect',
    name: '색깔 다 모으기',
    category: '협동',
    teamBased: false,
    minPlayers: 1,
    duration: 25,
    tutorialText: null
  },
  orderRelay: {
    id: 'orderRelay',
    name: '순서 릴레이',
    category: '협동',
    teamBased: false,
    minPlayers: 2,
    duration: 45,
    tutorialText:
      '모두에게 비밀 순서(1번부터)가 주어졌어요. 자기 순서가 몇 번인지는 알 수 없어요!\n' +
      '1번부터 순서대로 버튼을 눌러야 다음 단계로 진행돼요.\n' +
      '틀린 사람이 누르면 처음부터 다시 시작!\n' +
      '서로 눈치를 보며 소통해서 순서를 맞춰보세요.'
  },
  noticeGame: {
    id: 'noticeGame',
    name: '눈치게임',
    category: '대결',
    teamBased: true,
    minPlayers: 2,
    duration: 12,
    tutorialText:
      '1부터 "생존자 수"까지 중 숫자를 하나 골라주세요 (겹치면 안 돼요!).\n' +
      '같은 숫자를 고른 사람은 모두 탈락해요.\n' +
      '제한시간 안에 숫자를 안 고르면 자동 탈락!\n' +
      '마지막까지 살아남는 사람이 최종 승리자예요. 같은 팀 친구가 우승하면 팀 전원 보너스 점수!\n' +
      '여러 라운드에 걸쳐 진행됩니다.'
  },
  reactionDuel: {
    id: 'reactionDuel',
    name: '반응속도 1:1',
    category: '대결',
    teamBased: false,
    minPlayers: 2,
    duration: 10,
    tutorialText: null
  },
  bombNumber: {
    id: 'bombNumber',
    name: '폭탄 숫자 피하기',
    category: '벌칙',
    teamBased: false,
    minPlayers: 1,
    duration: 10,
    tutorialText:
      '1~5 중 하나를 고르세요.\n' +
      '그 중 하나는 미리 정해진 "폭탄 숫자"예요 (아무도 몰라요!).\n' +
      '폭탄 숫자를 고른 사람은 벌칙 대상이 됩니다.'
  },
  lieDetector: {
    id: 'lieDetector',
    name: '거짓말 탐지 투표',
    category: '벌칙',
    teamBased: false,
    minPlayers: 2,
    duration: 30,
    tutorialText: null
  }
};

const LIE_PROMPTS = [
  '어렸을 때 키운 반려동물 이야기',
  '제일 좋아하는 음식',
  '최근에 본 영화나 드라마',
  '가장 무서워하는 것',
  '어릴 적 꿈이었던 직업',
  '가장 기억에 남는 여행지',
  '제일 자신있는 요리',
  '최근에 산 물건 중 제일 마음에 드는 것'
];
const COLOR_POOL = ['🔴', '🟠', '🟡', '🟢', '🔵'];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createInitialState() {
  return {
    phase: 'setup', // setup | lobby | tutorial | playing | roundResult | result | awards
    maxPlayers: 4,
    players: [], // {id, nickname, gender, team, score, connected, claimed, socketId}
    currentGame: null,
    history: [], // {gameName, category, ts, summary}
    penaltyOverlay: null, // {text, ts}
    callRoom: null, // {roomName, startedAt}
    adminPin: null // 관리자 화면 접근용 PIN (설정 전엔 null = 보호 없음)
  };
}

let state = createInitialState();
let roundTimer = null;
let roundResultTimer = null;
let penaltyTimer = null;
let gameInstanceCounter = 0;

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
  s.adminPinSet = !!state.adminPin;
  delete s.adminPin;
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

function shuffleTeams() {
  const shuffled = [...state.players].sort(() => Math.random() - 0.5);
  shuffled.forEach((p, i) => {
    p.team = i % 2 === 0 ? 'A' : 'B';
  });
}

function nameOf(id) {
  const p = state.players.find((pl) => pl.id === id);
  return p ? p.nickname : '???';
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// ---------------------------------------------------------------------------
// 게임 시작 / 라운드 진행
// ---------------------------------------------------------------------------
function startGame(gameId, opts = {}) {
  const def = GAME_DEFS[gameId];
  if (!def) return;
  const connected = connectedPlayers();
  if (connected.length < (def.minPlayers || 1)) return;
  clearTimers();
  shuffleTeams();

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
  } else if (gameId === 'sumTarget') {
    data.min = 1;
    data.max = 10;
    const n = connected.length;
    data.target = randInt(n * 3, n * 7);
    tutorialText =
      `1~10 사이의 숫자를 하나씩 골라주세요.\n` +
      `모두가 고른 숫자를 다 더한 총합이 정확히 [${data.target}]이 되어야 성공이에요!\n` +
      `너무 크게도, 작게도 고르지 말고 서로 상의해서 맞춰보세요.`;
  } else if (gameId === 'colorCollect') {
    data.colors = {};
    connected.forEach((p) => {
      data.colors[p.id] = pick(COLOR_POOL);
    });
    tutorialText =
      '각자에게 색깔이 하나씩 배정됐어요! 내 색깔은 나만 화면에서 볼 수 있어요.\n' +
      '"색깔 바꾸기" 버튼을 누르면 내 색깔이 다음 색으로 바뀌어요.\n' +
      '친구들과 말로 소통해서 5가지 색이 겹치지 않게 맞춰보세요. 모두 다른 색이 되면 바로 성공!';
  } else if (gameId === 'orderRelay') {
    const ids = connected.map((p) => p.id).sort(() => Math.random() - 0.5);
    data.order = {};
    ids.forEach((id, i) => {
      data.order[id] = i + 1;
    });
    data.total = ids.length;
    data.currentStep = 1;
    data.mistakeCount = 0;
    data.lastResult = null;
    data.lastEventTs = 0;
  } else if (gameId === 'noticeGame') {
    data.aliveIds = connected.map((p) => p.id);
    data.initialIds = [...data.aliveIds];
    data.round = 1;
    data.max = Math.max(2, data.aliveIds.length);
    data.min = 1;
  } else if (gameId === 'reactionDuel') {
    const shuffled = [...connected].sort(() => Math.random() - 0.5);
    data.competitors = [shuffled[0].id, shuffled[1].id];
    data.signalAt = null;
    tutorialText =
      `⚡ 대결 상대: ${shuffled[0].nickname} VS ${shuffled[1].nickname}\n` +
      '신호가 뜨면(버튼이 초록색으로 바뀌면) 최대한 빨리 눌러보세요!\n' +
      '신호 뜨기 전에 누르면 실격이니 조심!\n' +
      '나머지 분들은 응원하며 지켜봐주세요.';
  } else if (gameId === 'bombNumber') {
    data.bomb = randInt(1, 5);
  } else if (gameId === 'lieDetector') {
    const actor = pick(connected);
    data.actorId = actor.id;
    data.truth = Math.random() < 0.5;
    data.prompt = pick(LIE_PROMPTS);
    tutorialText =
      `이제 ${actor.nickname} 님이 "${data.prompt}"에 대해 이야기할 거예요.\n` +
      '진실을 말할지 거짓말을 할지는 본인만 알아요!\n' +
      '잘 듣고 진짜인지 가짜인지 투표해서 맞춰보세요.';
  }

  gameInstanceCounter += 1;
  state.currentGame = {
    gameId,
    instanceId: gameInstanceCounter,
    wasRandom: !!opts.random,
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

  if (gameId === 'lieDetector') {
    const actorPlayer = state.players.find((p) => p.id === state.currentGame.data.actorId);
    if (actorPlayer && actorPlayer.socketId) {
      io.to(actorPlayer.socketId).emit('lieDetectorSecret', {
        prompt: state.currentGame.data.prompt,
        truth: state.currentGame.data.truth
      });
    }
  }
}

function resendLieDetectorSecretIfNeeded(playerId, socketId) {
  const cg = state.currentGame;
  if (cg && cg.gameId === 'lieDetector' && cg.data.actorId === playerId) {
    io.to(socketId).emit('lieDetectorSecret', { prompt: cg.data.prompt, truth: cg.data.truth });
  }
}

function beginRound() {
  if (!state.currentGame) return;
  clearTimers();
  const cg = state.currentGame;
  cg.phase = 'playing';
  cg.submissions = {};
  cg.roundEndsAt = Date.now() + cg.duration * 1000;
  if (cg.gameId === 'reactionDuel') {
    cg.data.signalAt = cg.roundEndsAt - cg.duration * 1000 + randInt(2500, 6000);
  }
  state.phase = 'playing';
  broadcast();
  roundTimer = setTimeout(resolveRound, cg.duration * 1000);
  if (cg.gameId === 'colorCollect') maybeResolveColorCollectSuccess();
}

// 색깔이 다 안 겹치는 순간 (초기 배정이든 색깔 바꾸기 이후든) 바로 성공 처리
function maybeResolveColorCollectSuccess() {
  const cg = state.currentGame;
  if (!cg || cg.gameId !== 'colorCollect' || cg.phase !== 'playing') return;
  const entries = Object.entries(cg.data.colors);
  const distinct = new Set(entries.map(([, c]) => c));
  if (distinct.size !== entries.length) return;
  clearTimers();
  entries.forEach(([id]) => addScore(id, 1));
  const reveal = entries.map(([id, c]) => `${nameOf(id)}:${c}`).join(', ');
  cg.finalSummary = {
    success: true,
    text: `🎉 색깔이 겹치지 않게 다 모았어요! 전원 +1점 — (${reveal})`
  };
  finishGame(cg);
}

function eligiblePlayerIds() {
  const cg = state.currentGame;
  if (!cg) return [];
  if (cg.gameId === 'noticeGame') return cg.data.aliveIds;
  if (cg.gameId === 'reactionDuel') return cg.data.competitors;
  if (cg.gameId === 'lieDetector') {
    return connectedPlayers()
      .map((p) => p.id)
      .filter((id) => id !== cg.data.actorId);
  }
  if (cg.gameId === 'colorCollect' || cg.gameId === 'orderRelay') return [];
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
  } else if (cg.gameId === 'sumTarget') {
    resolveSumTarget(cg);
  } else if (cg.gameId === 'colorCollect') {
    resolveColorCollect(cg);
  } else if (cg.gameId === 'orderRelay') {
    resolveOrderRelayTimeout(cg);
  } else if (cg.gameId === 'noticeGame') {
    resolveNoticeGame(cg);
    return; // 자체적으로 다음 라운드/종료 처리
  } else if (cg.gameId === 'reactionDuel') {
    resolveReactionDuel(cg);
  } else if (cg.gameId === 'bombNumber') {
    resolveBombNumber(cg);
  } else if (cg.gameId === 'lieDetector') {
    resolveLieDetector(cg);
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
  const entries = Object.entries(cg.submissions).map(([id, v]) => [id, Number(v)]);
  const vals = entries.map(([, v]) => v);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const success = Math.abs(avg - cg.data.target) <= cg.data.tolerance;
  if (success) {
    eligiblePlayerIds().forEach((id) => addScore(id, 1));
  }

  let closestText = '';
  if (entries.length) {
    const minDiff = Math.min(...entries.map(([, v]) => Math.abs(v - cg.data.target)));
    const closestIds = entries.filter(([, v]) => Math.abs(v - cg.data.target) === minDiff).map(([id]) => id);
    closestIds.forEach((id) => addScore(id, 1));
    closestText = ` 목표에 가장 가까웠던 사람: ${closestIds.map((id) => nameOf(id)).join(', ')} (+1점 보너스)`;
  }

  cg.finalSummary = {
    success,
    text: `평균 ${avg.toFixed(1)} (목표 ${cg.data.target}±${cg.data.tolerance}) → ${
      success ? '성공! 전원 +1점' : '실패!'
    }${closestText}`,
    choices: cg.submissions
  };
}

function resolveSumTarget(cg) {
  const vals = Object.values(cg.submissions).map(Number);
  const sum = vals.reduce((a, b) => a + b, 0);
  const success = sum === cg.data.target;
  if (success) {
    eligiblePlayerIds().forEach((id) => addScore(id, 1));
  }
  cg.finalSummary = {
    success,
    text: `총합 ${sum} (목표 ${cg.data.target}) → ${success ? '정확히 맞았어요! 전원 +1점' : '실패!'}`,
    choices: cg.submissions
  };
}

function resolveColorCollect(cg) {
  const entries = Object.entries(cg.data.colors);
  const values = entries.map(([, c]) => c);
  const distinct = new Set(values);
  const success = distinct.size === entries.length;
  if (success) {
    entries.forEach(([id]) => addScore(id, 1));
  }
  const reveal = entries.map(([id, c]) => `${nameOf(id)}:${c}`).join(', ');
  cg.finalSummary = {
    success,
    text: `${success ? '🎉 색깔이 겹치지 않고 다 나왔어요! 전원 +1점' : '😵 색깔이 겹쳤어요! 실패'} — (${reveal})`
  };
}

function resolveOrderRelayTimeout(cg) {
  const done = cg.data.currentStep - 1;
  cg.finalSummary = {
    success: false,
    text: `시간 종료! ${done} / ${cg.data.total}명까지 성공했어요 (틀린 횟수: ${cg.data.mistakeCount}). 실패!`
  };
}

function finishOrderRelaySuccess() {
  const cg = state.currentGame;
  if (!cg || cg.gameId !== 'orderRelay' || cg.phase !== 'playing') return;
  clearTimers();
  connectedPlayers().forEach((p) => addScore(p.id, 2));
  cg.finalSummary = {
    success: true,
    text: `🎉 모두 순서대로 성공했어요! (틀린 횟수: ${cg.data.mistakeCount}) 전원 +2점`
  };
  finishGame(cg);
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

function resolveReactionDuel(cg) {
  const [idA, idB] = cg.data.competitors;
  function evalOf(id) {
    const v = cg.submissions[id];
    if (v === undefined) return { id, status: 'dnf', elapsed: Infinity };
    const elapsed = v - cg.data.signalAt;
    if (elapsed < 0) return { id, status: 'early', elapsed: Infinity };
    return { id, status: 'ok', elapsed };
  }
  const a = evalOf(idA);
  const b = evalOf(idB);
  const describe = (r) =>
    r.status === 'ok' ? `${r.elapsed}ms` : r.status === 'early' ? '실격(너무 빨리 누름)' : '무반응';

  let winnerId = null;
  if (a.elapsed === Infinity && b.elapsed === Infinity) {
    winnerId = null;
  } else if (a.elapsed <= b.elapsed) {
    winnerId = idA;
  } else {
    winnerId = idB;
  }
  if (winnerId) addScore(winnerId, 3);

  cg.finalSummary = {
    success: !!winnerId,
    text: winnerId
      ? `🏆 승자: ${nameOf(winnerId)}! (+3점) — ${nameOf(idA)}: ${describe(a)} / ${nameOf(idB)}: ${describe(b)}`
      : `둘 다 무효 처리됐어요 — ${nameOf(idA)}: ${describe(a)} / ${nameOf(idB)}: ${describe(b)}`
  };
}

function resolveLieDetector(cg) {
  const votes = cg.submissions;
  let realCount = 0;
  let fakeCount = 0;
  Object.values(votes).forEach((v) => {
    if (v === 'real') realCount += 1;
    else if (v === 'fake') fakeCount += 1;
  });
  const actualAnswer = cg.data.truth ? 'real' : 'fake';
  const answerLabel = cg.data.truth ? '진짜(참)' : '가짜(거짓)';

  Object.entries(votes).forEach(([id, v]) => {
    if (v === actualAnswer) addScore(id, 1);
  });

  let majorityGuess = 'tie';
  if (realCount > fakeCount) majorityGuess = 'real';
  else if (fakeCount > realCount) majorityGuess = 'fake';

  let penaltyTargets = [];
  let outcomeText = '';
  if (majorityGuess === 'tie') {
    outcomeText = '투표가 반반으로 갈렸어요! 무승부, 벌칙 없음.';
  } else if (majorityGuess === actualAnswer) {
    // 다수결이 정답이면 벌칙 없음 (진실을 진실로, 거짓을 거짓으로 잘 알아챈 것뿐)
    outcomeText = '다수결로 정답을 맞췄어요! 벌칙 없음.';
  } else {
    penaltyTargets = Object.entries(votes)
      .filter(([, v]) => v !== actualAnswer)
      .map(([id]) => id);
    addScore(cg.data.actorId, 2);
    outcomeText = `다수결이 틀렸어요! ${nameOf(cg.data.actorId)} 님이 다들 헷갈리게 만들었어요 (+2점). 잘못 투표한 사람들이 벌칙 대상!`;
  }

  cg.finalSummary = {
    success: null,
    text: `정답은 [${answerLabel}] 이었습니다 (진짜 ${realCount}표 / 가짜 ${fakeCount}표). ${outcomeText}${
      penaltyTargets.length ? ' 벌칙: ' + penaltyTargets.map((id) => nameOf(id)).join(', ') : ''
    }`,
    penaltyTargets
  };
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
    const keepPin = state.adminPin;
    state = createInitialState();
    state.adminPin = keepPin;
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
    resendLieDetectorSecretIfNeeded(playerId, socket.id);
    broadcast();
  });

  socket.on('admin:startGame', ({ gameId }) => {
    if (state.phase !== 'lobby') return;
    const def = GAME_DEFS[gameId];
    if (!def) return;
    if (connectedPlayers().length < (def.minPlayers || 1)) {
      socket.emit('startGameFailed', { need: def.minPlayers, name: def.name });
      return;
    }
    startGame(gameId);
  });

  socket.on('admin:startRandomGame', () => {
    if (state.phase !== 'lobby') return;
    const n = connectedPlayers().length;
    const eligible = Object.values(GAME_DEFS).filter((d) => n >= (d.minPlayers || 1));
    if (eligible.length === 0) {
      socket.emit('startGameFailed', { need: 1, name: '아무 게임' });
      return;
    }
    const chosen = pick(eligible);
    startGame(chosen.id, { random: true });
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

  socket.on('player:relayPress', () => {
    const cg = state.currentGame;
    const pid = socket.data.playerId;
    if (!cg || cg.gameId !== 'orderRelay' || cg.phase !== 'playing' || !pid) return;
    const myOrder = cg.data.order[pid];
    if (myOrder === undefined) return;
    if (myOrder === cg.data.currentStep) {
      cg.data.currentStep += 1;
      cg.data.lastResult = 'correct';
      cg.data.lastEventTs = Date.now();
      if (cg.data.currentStep > cg.data.total) {
        finishOrderRelaySuccess();
        return;
      }
    } else {
      cg.data.currentStep = 1;
      cg.data.mistakeCount += 1;
      cg.data.lastResult = 'wrong';
      cg.data.lastEventTs = Date.now();
    }
    broadcast();
  });

  socket.on('player:changeColor', () => {
    const cg = state.currentGame;
    const pid = socket.data.playerId;
    if (!cg || cg.gameId !== 'colorCollect' || cg.phase !== 'playing' || !pid) return;
    if (!(pid in cg.data.colors)) return;
    const idx = COLOR_POOL.indexOf(cg.data.colors[pid]);
    cg.data.colors[pid] = COLOR_POOL[(idx + 1) % COLOR_POOL.length];
    broadcast();
    maybeResolveColorCollectSuccess();
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
    const keepPin = state.adminPin;
    state = createInitialState();
    state.adminPin = keepPin;
    broadcast();
  });

  socket.on('admin:verifyPin', ({ pin }, cb) => {
    const p = String(pin || '').trim();
    if (!state.adminPin) {
      // 아직 PIN이 없으면: 입력한 값이 있으면 그걸 새 PIN으로 설정, 비워뒀으면 보호 없이 통과
      if (p) state.adminPin = p;
      if (typeof cb === 'function') cb({ ok: true });
      return;
    }
    if (typeof cb === 'function') cb({ ok: p === state.adminPin });
  });

  socket.on('admin:clearPin', () => {
    state.adminPin = null;
    broadcast();
  });

  socket.on('admin:showAwards', () => {
    if (state.phase !== 'lobby') return;
    state.phase = 'awards';
    broadcast();
  });

  socket.on('admin:closeAwards', () => {
    if (state.phase !== 'awards') return;
    state.phase = 'lobby';
    broadcast();
  });

  socket.on('admin:kickPlayer', ({ playerId }) => {
    if (state.phase !== 'lobby') return;
    const p = state.players.find((pl) => pl.id === playerId);
    if (!p) return;
    const kickedSocketId = p.socketId;
    p.claimed = false;
    p.connected = false;
    p.nickname = null;
    p.gender = null;
    p.socketId = null;
    p.score = 0;
    if (kickedSocketId) {
      io.to(kickedSocketId).emit('kicked');
    }
    broadcast();
  });

  socket.on('admin:startCallRoom', () => {
    const roomName = 'poolvilla-' + Math.random().toString(36).slice(2, 8);
    state.callRoom = { roomName, startedAt: Date.now() };
    broadcast();
  });

  socket.on('admin:endCallRoom', () => {
    state.callRoom = null;
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
