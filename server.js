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
  },
  wordChain: {
    id: 'wordChain',
    name: '끝말잇기 릴레이',
    category: '협동',
    teamBased: false,
    minPlayers: 2,
    duration: 60,
    tutorialText: null
  },
  commonWord: {
    id: 'commonWord',
    name: '공통점 찾기',
    category: '협동',
    teamBased: false,
    minPlayers: 2,
    duration: 20,
    tutorialText: null
  },
  consonantQuiz: {
    id: 'consonantQuiz',
    name: '자음 퀴즈',
    category: '협동',
    teamBased: false,
    minPlayers: 1,
    duration: 20,
    tutorialText: '초성 힌트를 보고 정답 단어를 가장 먼저 맞추는 사람이 승리해요! 여러 번 다시 시도할 수 있어요.'
  },
  priceGuess: {
    id: 'priceGuess',
    name: '가격 맞추기 경매',
    category: '협동',
    teamBased: false,
    minPlayers: 1,
    duration: 20,
    tutorialText: null
  },
  describeGuess: {
    id: 'describeGuess',
    name: '다 함께 그림 맞추기',
    category: '협동',
    teamBased: false,
    minPlayers: 3,
    duration: 40,
    tutorialText: null
  },
  memoryDuel: {
    id: 'memoryDuel',
    name: '기억력 카드 짝 맞추기',
    category: '대결',
    teamBased: false,
    minPlayers: 2,
    duration: 90,
    tutorialText: null
  },
  mathQuiz: {
    id: 'mathQuiz',
    name: '연산 스피드 퀴즈',
    category: '대결',
    teamBased: false,
    minPlayers: 1,
    duration: 20,
    tutorialText: '화면에 나온 식을 계산해서 가장 먼저 정답을 맞추는 사람이 승리해요! 여러 번 다시 시도할 수 있어요.'
  },
  flashReaction: {
    id: 'flashReaction',
    name: '깜빡이 반응 대결',
    category: '대결',
    teamBased: false,
    minPlayers: 2,
    duration: 15,
    tutorialText:
      '버튼이 초록색으로 바뀌는 순간 가장 빨리 누르는 사람이 승리해요!\n' +
      '색이 바뀌기 전에 누르면 실격이니 조심하세요.'
  },
  voteBattle: {
    id: 'voteBattle',
    name: '투표 배틀',
    category: '대결',
    teamBased: false,
    minPlayers: 2,
    duration: 15,
    tutorialText: null
  },
  votePenalty: {
    id: 'votePenalty',
    name: '투표로 벌칙자 지목',
    category: '벌칙',
    teamBased: false,
    minPlayers: 3,
    duration: 20,
    tutorialText: null
  },
  bombRelay: {
    id: 'bombRelay',
    name: '숫자 폭탄 릴레이',
    category: '벌칙',
    teamBased: false,
    minPlayers: 2,
    duration: 30,
    tutorialText:
      '숨겨진 "폭탄 숫자"가 있어요! 다 같이 돌아가면서 "다음 숫자!" 버튼을 눌러 숫자를 늘려가요.\n' +
      '폭탄 숫자에서 누른 사람이 벌칙 대상이 됩니다.'
  },
  spyVote: {
    id: 'spyVote',
    name: '가짜 투표 색출',
    category: '벌칙',
    teamBased: false,
    minPlayers: 3,
    duration: 20,
    tutorialText:
      '우리 중에 몰래 숨어있는 "스파이"가 한 명 있어요!\n' +
      '누가 스파이일지 눈치껏 투표해주세요. 다수결로 못 찾으면 잘못 투표한 사람들이 벌칙 대상이에요.'
  },
  oxQuiz: {
    id: 'oxQuiz',
    name: '참/거짓 O·X 퀴즈',
    category: '협동',
    teamBased: false,
    minPlayers: 1,
    duration: 15,
    tutorialText: null
  },
  flashMemoryQuiz: {
    id: 'flashMemoryQuiz',
    name: '순간 포착 퀴즈',
    category: '협동',
    teamBased: false,
    minPlayers: 1,
    duration: 15,
    tutorialText: null
  },
  balanceVote: {
    id: 'balanceVote',
    name: '밸런스 게임 투표',
    category: '협동',
    teamBased: false,
    minPlayers: 2,
    duration: 15,
    tutorialText: null
  },
  predictCount: {
    id: 'predictCount',
    name: '몇 명이 맞출까 예측',
    category: '협동',
    teamBased: false,
    minPlayers: 2,
    duration: 20,
    tutorialText: null
  }
};

const WORD_CHAIN_STARTERS = ['사과', '바나나', '고양이', '기차', '나무', '구름', '토끼', '우산', '초콜릿', '피아노'];

const COMMON_WORD_TOPICS = [
  '좋아하는 과일', '좋아하는 동물', '가고 싶은 나라', '좋아하는 색깔',
  '좋아하는 계절', '먹고 싶은 음식', '좋아하는 운동', '갖고 싶은 물건'
];

const CONSONANT_QUIZ_BANK = [
  '사과', '피아노', '자전거', '냉장고', '컴퓨터', '텔레비전', '코끼리',
  '호랑이', '무지개', '눈사람', '축구공', '아이스크림', '놀이터', '수영장', '풀빌라'
];

const MATH_OPS = [
  { sym: '+', fn: (a, b) => a + b },
  { sym: '-', fn: (a, b) => a - b },
  { sym: '×', fn: (a, b) => a * b }
];

const DESCRIBE_WORD_BANK = [
  '호랑이', '냉장고', '축구공', '눈사람', '피아노', '우산', '수영장',
  '자전거', '아이스크림', '로봇', '공주', '마법사', '비행기', '기차', '컴퓨터'
];

const PRICE_GUESS_BANK = [
  { name: '초코파이 한 상자', emoji: '🍫', price: 4000 },
  { name: '짜장면 한 그릇', emoji: '🍜', price: 7000 },
  { name: '유명 축구선수 유니폼', emoji: '👕', price: 120000 },
  { name: '최신 스마트폰', emoji: '📱', price: 1500000 },
  { name: '놀이공원 자유이용권', emoji: '🎢', price: 55000 },
  { name: '풀빌라 1박 숙박비', emoji: '🏖️', price: 400000 },
  { name: '떡볶이 1인분', emoji: '🍢', price: 4000 },
  { name: '농구공 하나', emoji: '🏀', price: 25000 }
];

const VOTE_PENALTY_PROMPTS = [
  '라면을 제일 잘 끓일 것 같은 사람은?',
  '아침에 제일 늦게 일어날 것 같은 사람은?',
  '오늘 제일 웃긴 사람은?',
  '숙제를 제일 미룰 것 같은 사람은?',
  '물놀이를 제일 잘할 것 같은 사람은?',
  '제일 잠꾸러기일 것 같은 사람은?',
  '몰래 간식을 제일 많이 먹을 것 같은 사람은?'
];

const BALANCE_PAIRS = [
  { a: '🍜 짜장면', b: '🍲 짬뽕' },
  { a: '🍕 피자', b: '🍔 햄버거' },
  { a: '🏖️ 바다', b: '⛰️ 산' },
  { a: '☀️ 여름', b: '❄️ 겨울' },
  { a: '🐱 고양이', b: '🐶 강아지' },
  { a: '🎮 게임', b: '📺 TV' },
  { a: '🍦 아이스크림', b: '🍰 케이크' },
  { a: '✈️ 비행기 여행', b: '🚗 자동차 여행' }
];

const OX_QUIZ_BANK = [
  { q: '개미는 곤충이다', a: true },
  { q: '거미는 다리가 8개다', a: true },
  { q: '고래는 물고기다', a: false },
  { q: '물은 100도에서 끓는다', a: true },
  { q: '펭귄은 날 수 있다', a: false },
  { q: '기린은 목이 길다', a: true },
  { q: '한국의 수도는 서울이다', a: true },
  { q: '태양은 지구 주위를 돈다', a: false },
  { q: '개구리는 양서류다', a: true },
  { q: '박쥐는 조류다', a: false },
  { q: '눈은 하늘에서 내리는 얼음 결정이다', a: true },
  { q: '문어는 다리가 6개다', a: false }
];

const FLASH_EMOJI_POOL = ['🍎', '🍌', '🍇', '🍉', '⚽', '🏀', '🎈', '🚗', '✈️', '🚀', '🐶', '🐱', '🐰', '🐻', '🌟', '🌈', '☀️', '🌙', '🎁', '🎨', '📚', '⏰', '🎵', '❤️'];
const MEMORY_EMOJI_POOL = ['🍎', '🍌', '🍇', '⚽', '🚗', '🐶', '🐱', '🌟', '🎈', '🎁'];

const CHOSUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function getChosung(str) {
  let result = '';
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) {
      result += CHOSUNG_LIST[Math.floor(code / 588)];
    } else {
      result += ch;
    }
  }
  return result;
}
function normalizeText(str) {
  return String(str || '').trim().replace(/\s+/g, '').toLowerCase();
}

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
let memoryFlipTimer = null;
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
  if (s.currentGame && s.currentGame.gameId === 'memoryDuel' && s.currentGame.data.board) {
    s.currentGame.data.board = s.currentGame.data.board.map((card) =>
      card.revealed || card.matched ? card : { revealed: false, matched: false }
    );
  }
  if (
    s.currentGame &&
    ['consonantQuiz', 'mathQuiz', 'oxQuiz', 'predictCount'].includes(s.currentGame.gameId)
  )
    delete s.currentGame.data.answer;
  if (s.currentGame && s.currentGame.gameId === 'bombRelay') delete s.currentGame.data.bombCount;
  if (s.currentGame && s.currentGame.gameId === 'describeGuess') delete s.currentGame.data.word;
  if (s.currentGame && s.currentGame.gameId === 'priceGuess' && s.currentGame.phase !== 'result')
    delete s.currentGame.data.price;
  return s;
}

function clearTimers() {
  if (roundTimer) clearTimeout(roundTimer);
  if (roundResultTimer) clearTimeout(roundResultTimer);
  if (memoryFlipTimer) clearTimeout(memoryFlipTimer);
  roundTimer = null;
  roundResultTimer = null;
  memoryFlipTimer = null;
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
  } else if (gameId === 'wordChain') {
    const starter = pick(WORD_CHAIN_STARTERS);
    data.chain = [starter];
    data.targetLength = Math.max(6, connected.length * 2);
    data.mistakeCount = 0;
    data.lastResult = null;
    data.lastBy = null;
    data.lastEventTs = 0;
    tutorialText =
      `첫 단어는 "${starter}"예요!\n` +
      '방금 나온 단어의 마지막 글자로 시작하는 단어를 아무나 먼저 입력하면 이어져요.\n' +
      `이미 나온 단어는 다시 쓸 수 없어요. 총 ${data.targetLength}개까지 이어가면 성공!`;
  } else if (gameId === 'commonWord') {
    data.topic = pick(COMMON_WORD_TOPICS);
    tutorialText = `주제는 "${data.topic}"이에요!\n` + '친구들과 똑같은 답이 겹치도록 눈치껏 적어보세요. 가장 많이 겹친 답을 고른 사람들이 +1점!';
  } else if (gameId === 'consonantQuiz') {
    data.answer = pick(CONSONANT_QUIZ_BANK);
    data.puzzle = getChosung(data.answer);
  } else if (gameId === 'priceGuess') {
    const item = pick(PRICE_GUESS_BANK);
    data.itemName = item.name;
    data.itemEmoji = item.emoji;
    data.price = item.price;
    tutorialText =
      `${item.emoji} "${item.name}"의 실제 가격은 얼마일까요?\n` +
      '가격을 원 단위 숫자로 입력해주세요. 가장 가까이 맞춘 사람이 보너스 점수!';
  } else if (gameId === 'describeGuess') {
    const actor = pick(connected);
    data.actorId = actor.id;
    data.word = pick(DESCRIBE_WORD_BANK);
    data.stage = 'describe';
    data.clue = null;
    tutorialText =
      `${actor.nickname} 님에게 비밀 단어가 전달됐어요.\n` +
      '단어를 직접 말하지 않고 설명하는 글을 적을 거예요. 나머지는 그 설명을 보고 정답을 맞춰보세요!';
  } else if (gameId === 'memoryDuel') {
    const shuffled = [...connected].sort(() => Math.random() - 0.5);
    data.competitors = [shuffled[0].id, shuffled[1].id];
    const pairCount = 6;
    const values = MEMORY_EMOJI_POOL.slice(0, pairCount);
    const deck = [...values, ...values].sort(() => Math.random() - 0.5);
    data.board = deck.map((value) => ({ value, revealed: false, matched: false }));
    data.flipped = [];
    data.turnPlayerId = shuffled[0].id;
    data.scores = { [shuffled[0].id]: 0, [shuffled[1].id]: 0 };
    tutorialText =
      `🎴 대결 상대: ${shuffled[0].nickname} VS ${shuffled[1].nickname}\n` +
      '카드를 2장씩 뒤집어서 같은 그림을 찾아보세요. 맞추면 한 번 더, 틀리면 상대 차례!\n' +
      '더 많은 짝을 맞춘 사람이 승리해요.';
  } else if (gameId === 'mathQuiz') {
    const op = pick(MATH_OPS);
    let a = randInt(2, 20);
    let b = randInt(2, 20);
    if (op.sym === '-' && b > a) [a, b] = [b, a];
    if (op.sym === '×') {
      a = randInt(2, 9);
      b = randInt(2, 9);
    }
    data.question = `${a} ${op.sym} ${b}`;
    data.answer = op.fn(a, b);
  } else if (gameId === 'flashReaction') {
    data.signalAt = null;
  } else if (gameId === 'voteBattle') {
    const pair = pick(BALANCE_PAIRS);
    data.optionA = pair.a;
    data.optionB = pair.b;
    tutorialText = `${pair.a} vs ${pair.b}\n` + '둘 중 하나를 골라주세요. 다수결로 이긴 쪽에 투표한 사람 전원 +1점!';
  } else if (gameId === 'votePenalty') {
    data.prompt = pick(VOTE_PENALTY_PROMPTS);
    tutorialText = `질문: "${data.prompt}"\n` + '가장 많은 표를 받은 사람이 벌칙 대상이 됩니다.';
  } else if (gameId === 'bombRelay') {
    data.bombCount = randInt(6, 14);
    data.count = 0;
    data.lastClickerId = null;
    data.lastEventTs = 0;
  } else if (gameId === 'spyVote') {
    const spy = pick(connected);
    data.spyId = spy.id;
    tutorialText = '우리 중 한 명이 몰래 "스파이"로 뽑혔어요 (본인도 몰라요!).\n' + '눈치껏 스파이일 것 같은 사람에게 투표해주세요.';
  } else if (gameId === 'oxQuiz') {
    const q = pick(OX_QUIZ_BANK);
    data.question = q.q;
    data.answer = q.a;
  } else if (gameId === 'flashMemoryQuiz') {
    const pool = [...FLASH_EMOJI_POOL].sort(() => Math.random() - 0.5);
    data.shown = pool.slice(0, 4);
    data.decoy = pool[4];
    data.options = [...data.shown, data.decoy].sort(() => Math.random() - 0.5);
    data.flashMs = 3000;
  } else if (gameId === 'balanceVote') {
    const pair = pick(BALANCE_PAIRS);
    data.optionA = pair.a;
    data.optionB = pair.b;
    tutorialText = `${pair.a} vs ${pair.b}\n` + '점수는 없어요! 그냥 재미로 골라보고 다 같이 결과를 확인해봐요.';
  } else if (gameId === 'predictCount') {
    const q = pick(OX_QUIZ_BANK);
    data.question = q.q;
    data.answer = q.a;
    data.maxPredict = connected.length;
    tutorialText =
      `문제: "${q.q}" (O 또는 X)\n` +
      `정답을 고르고, 전체 참가자 중 몇 명이 정답을 맞출지도 함께 예측해주세요 (0~${connected.length}명).\n` +
      '정답을 맞추면 +1점, 예측이 가장 가까우면 추가 보너스!';
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
  } else if (gameId === 'describeGuess') {
    const actorPlayer = state.players.find((p) => p.id === state.currentGame.data.actorId);
    if (actorPlayer && actorPlayer.socketId) {
      io.to(actorPlayer.socketId).emit('describeGuessSecret', { word: state.currentGame.data.word });
    }
  }
}

function resendLieDetectorSecretIfNeeded(playerId, socketId) {
  const cg = state.currentGame;
  if (cg && cg.gameId === 'lieDetector' && cg.data.actorId === playerId) {
    io.to(socketId).emit('lieDetectorSecret', { prompt: cg.data.prompt, truth: cg.data.truth });
  }
  if (cg && cg.gameId === 'describeGuess' && cg.data.actorId === playerId) {
    io.to(socketId).emit('describeGuessSecret', { word: cg.data.word });
  }
}

function beginRound() {
  if (!state.currentGame) return;
  clearTimers();
  const cg = state.currentGame;
  cg.phase = 'playing';
  cg.submissions = {};
  cg.roundEndsAt = Date.now() + cg.duration * 1000;
  if (cg.gameId === 'reactionDuel' || cg.gameId === 'flashReaction') {
    cg.data.signalAt = cg.roundEndsAt - cg.duration * 1000 + randInt(2500, 6000);
  }
  if (cg.gameId === 'flashMemoryQuiz') {
    cg.data.flashUntil = Date.now() + cg.data.flashMs;
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
  if (cg.gameId === 'describeGuess') {
    return connectedPlayers()
      .map((p) => p.id)
      .filter((id) => id !== cg.data.actorId);
  }
  if (
    cg.gameId === 'colorCollect' ||
    cg.gameId === 'orderRelay' ||
    cg.gameId === 'wordChain' ||
    cg.gameId === 'memoryDuel' ||
    cg.gameId === 'bombRelay'
  )
    return [];
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
  } else if (cg.gameId === 'wordChain') {
    resolveWordChainTimeout(cg);
  } else if (cg.gameId === 'commonWord') {
    resolveCommonWord(cg);
  } else if (cg.gameId === 'consonantQuiz') {
    resolveQuizTimeout(cg, cg.data.answer);
  } else if (cg.gameId === 'priceGuess') {
    resolvePriceGuess(cg);
  } else if (cg.gameId === 'describeGuess') {
    resolveDescribeGuessTimeout(cg);
  } else if (cg.gameId === 'memoryDuel') {
    resolveMemoryDuelTimeout(cg);
  } else if (cg.gameId === 'mathQuiz') {
    resolveQuizTimeout(cg, cg.data.answer);
  } else if (cg.gameId === 'flashReaction') {
    resolveFlashReaction(cg);
  } else if (cg.gameId === 'voteBattle') {
    resolveVoteBattle(cg);
  } else if (cg.gameId === 'votePenalty') {
    resolveVotePenalty(cg);
  } else if (cg.gameId === 'bombRelay') {
    resolveBombRelayTimeout(cg);
  } else if (cg.gameId === 'spyVote') {
    resolveSpyVote(cg);
  } else if (cg.gameId === 'oxQuiz') {
    resolveOxQuiz(cg);
  } else if (cg.gameId === 'flashMemoryQuiz') {
    resolveFlashMemoryQuiz(cg);
  } else if (cg.gameId === 'balanceVote') {
    resolveBalanceVote(cg);
  } else if (cg.gameId === 'predictCount') {
    resolvePredictCount(cg);
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

function resolveWordChainTimeout(cg) {
  cg.finalSummary = {
    success: false,
    text: `시간 종료! ${cg.data.chain.length} / ${cg.data.targetLength}개까지 이어갔어요 (체인: ${cg.data.chain.join(' → ')}). 실패!`
  };
}

function finishWordChainSuccess() {
  const cg = state.currentGame;
  if (!cg || cg.gameId !== 'wordChain' || cg.phase !== 'playing') return;
  clearTimers();
  connectedPlayers().forEach((p) => addScore(p.id, 2));
  cg.finalSummary = {
    success: true,
    text: `🎉 끝말잇기 ${cg.data.targetLength}개를 모두 이어갔어요! (체인: ${cg.data.chain.join(' → ')}) 전원 +2점`
  };
  finishGame(cg);
}

function resolveCommonWord(cg) {
  const counts = {};
  Object.entries(cg.submissions).forEach(([id, v]) => {
    const norm = normalizeText(v);
    if (!norm) return;
    counts[norm] = counts[norm] || [];
    counts[norm].push(id);
  });
  let bestIds = [];
  Object.values(counts).forEach((ids) => {
    if (ids.length > bestIds.length) bestIds = ids;
  });
  const success = bestIds.length >= 2;
  if (success) bestIds.forEach((id) => addScore(id, 1));
  cg.finalSummary = {
    success,
    text: success
      ? `${bestIds.length}명이 똑같이 [${cg.submissions[bestIds[0]]}]을(를) 적었어요! 전원 +1점 — ${bestIds
          .map((id) => nameOf(id))
          .join(', ')}`
      : '겹치는 답이 없었어요. 실패!',
    choices: cg.submissions
  };
}

function resolveQuizTimeout(cg, answer) {
  cg.finalSummary = {
    success: false,
    text: `시간 종료! 아무도 못 맞췄어요. 정답은 [${answer}] 이었습니다.`
  };
}

function resolvePriceGuess(cg) {
  const entries = Object.entries(cg.submissions).map(([id, v]) => [id, Number(v)]);
  const actual = cg.data.price;
  let closestText = '';
  if (entries.length) {
    const minDiff = Math.min(...entries.map(([, v]) => Math.abs(v - actual)));
    const closestIds = entries.filter(([, v]) => Math.abs(v - actual) === minDiff).map(([id]) => id);
    closestIds.forEach((id) => addScore(id, 2));
    closestText = ` 가장 근접한 사람: ${closestIds.map((id) => nameOf(id)).join(', ')} (+2점)`;
  }
  const withinTolerance = entries.filter(([, v]) => Math.abs(v - actual) <= actual * 0.15).map(([id]) => id);
  withinTolerance.forEach((id) => addScore(id, 1));
  cg.finalSummary = {
    success: withinTolerance.length > 0,
    text: `${cg.data.itemEmoji} "${cg.data.itemName}"의 실제 가격은 [${actual.toLocaleString()}원] 이었어요!${
      withinTolerance.length ? ` 15% 이내로 맞춘 사람: ${withinTolerance.map((id) => nameOf(id)).join(', ')} (+1점)` : ''
    }${closestText}`,
    choices: cg.submissions
  };
}

function resolveDescribeGuessTimeout(cg) {
  cg.finalSummary = {
    success: false,
    text: `시간 종료! 아무도 못 맞췄어요. 정답은 [${cg.data.word}] 이었습니다. (힌트: ${cg.data.clue || '설명 없음'})`
  };
}

function resolveMemoryDuelTimeout(cg) {
  const [idA, idB] = cg.data.competitors;
  const scoreA = cg.data.scores[idA] || 0;
  const scoreB = cg.data.scores[idB] || 0;
  let winnerId = null;
  if (scoreA > scoreB) winnerId = idA;
  else if (scoreB > scoreA) winnerId = idB;
  if (winnerId) addScore(winnerId, 3);
  cg.finalSummary = {
    success: !!winnerId,
    text: winnerId
      ? `🏆 시간 종료! ${nameOf(idA)} ${scoreA}쌍 : ${nameOf(idB)} ${scoreB}쌍 — 승자: ${nameOf(winnerId)}! (+3점)`
      : `⏱️ 시간 종료! ${nameOf(idA)} ${scoreA}쌍 : ${nameOf(idB)} ${scoreB}쌍 — 무승부!`
  };
}

function finishMemoryDuelComplete() {
  const cg = state.currentGame;
  if (!cg || cg.gameId !== 'memoryDuel' || cg.phase !== 'playing') return;
  clearTimers();
  const [idA, idB] = cg.data.competitors;
  const scoreA = cg.data.scores[idA] || 0;
  const scoreB = cg.data.scores[idB] || 0;
  let winnerId = null;
  if (scoreA > scoreB) winnerId = idA;
  else if (scoreB > scoreA) winnerId = idB;
  if (winnerId) addScore(winnerId, 3);
  cg.finalSummary = {
    success: !!winnerId,
    text: winnerId
      ? `🎉 모든 카드를 다 찾았어요! ${nameOf(idA)} ${scoreA}쌍 : ${nameOf(idB)} ${scoreB}쌍 — 승자: ${nameOf(winnerId)}! (+3점)`
      : `🎉 모든 카드를 다 찾았어요! ${nameOf(idA)} ${scoreA}쌍 : ${nameOf(idB)} ${scoreB}쌍 — 무승부!`
  };
  finishGame(cg);
}

function resolveFlashReaction(cg) {
  const results = connectedPlayers().map((p) => {
    const v = cg.submissions[p.id];
    if (v === undefined) return { id: p.id, status: 'dnf', elapsed: Infinity };
    const elapsed = v - cg.data.signalAt;
    if (elapsed < 0) return { id: p.id, status: 'early', elapsed: Infinity };
    return { id: p.id, status: 'ok', elapsed };
  });
  const ok = results.filter((r) => r.status === 'ok').sort((a, b) => a.elapsed - b.elapsed);
  const winner = ok[0] || null;
  if (winner) addScore(winner.id, 3);
  cg.finalSummary = {
    success: !!winner,
    text: winner ? `🏆 승자: ${nameOf(winner.id)}! (${winner.elapsed}ms, +3점)` : '아무도 신호 이후에 제대로 누르지 못했어요. 실패!'
  };
}

function resolveVoteBattle(cg) {
  let aCount = 0;
  let bCount = 0;
  Object.values(cg.submissions).forEach((v) => {
    if (v === 'A') aCount += 1;
    else if (v === 'B') bCount += 1;
  });
  let winners = [];
  if (aCount > bCount) winners = Object.entries(cg.submissions).filter(([, v]) => v === 'A').map(([id]) => id);
  else if (bCount > aCount) winners = Object.entries(cg.submissions).filter(([, v]) => v === 'B').map(([id]) => id);
  winners.forEach((id) => addScore(id, 1));
  cg.finalSummary = {
    success: winners.length > 0,
    text: `${cg.data.optionA}: ${aCount}표 / ${cg.data.optionB}: ${bCount}표 — ${
      winners.length ? `승리한 쪽에 투표한 사람 전원 +1점! (${winners.map((id) => nameOf(id)).join(', ')})` : '동점! 무승부.'
    }`,
    choices: cg.submissions
  };
}

function resolveVotePenalty(cg) {
  const counts = {};
  Object.values(cg.submissions).forEach((id) => {
    counts[id] = (counts[id] || 0) + 1;
  });
  let bestCount = 0;
  let targets = [];
  Object.entries(counts).forEach(([id, cnt]) => {
    if (cnt > bestCount) {
      bestCount = cnt;
      targets = [id];
    } else if (cnt === bestCount && bestCount > 0) {
      targets.push(id);
    }
  });
  cg.finalSummary = {
    success: null,
    text: targets.length
      ? `"${cg.data.prompt}" 최다 득표: ${targets.map((id) => nameOf(id)).join(', ')} (${bestCount}표) — 벌칙 대상!`
      : '아무도 투표하지 않았어요. 벌칙 없음.',
    penaltyTargets: targets
  };
}

function resolveBombRelayTimeout(cg) {
  cg.finalSummary = {
    success: null,
    text: `시간 종료! 아무도 폭탄을 밟지 않았어요. 벌칙 없음. (마지막 숫자: ${cg.data.count})`
  };
}

function resolveSpyVote(cg) {
  const votes = cg.submissions;
  const counts = {};
  Object.values(votes).forEach((id) => {
    counts[id] = (counts[id] || 0) + 1;
  });
  let bestCount = 0;
  let topVoted = [];
  Object.entries(counts).forEach(([id, cnt]) => {
    if (cnt > bestCount) {
      bestCount = cnt;
      topVoted = [id];
    } else if (cnt === bestCount && bestCount > 0) {
      topVoted.push(id);
    }
  });
  const caught = topVoted.length === 1 && topVoted[0] === cg.data.spyId;
  let penaltyTargets = [];
  let outcomeText = '';
  if (caught) {
    penaltyTargets = [cg.data.spyId];
    Object.entries(votes)
      .filter(([, v]) => v === cg.data.spyId)
      .forEach(([id]) => addScore(id, 1));
    outcomeText = '스파이를 찾아냈어요! 스파이가 벌칙 대상.';
  } else {
    penaltyTargets = Object.entries(votes)
      .filter(([, v]) => v !== cg.data.spyId)
      .map(([id]) => id);
    outcomeText = '스파이를 못 찾았어요! 잘못 투표한 사람들이 벌칙 대상.';
  }
  cg.finalSummary = {
    success: null,
    text: `스파이는 [${nameOf(cg.data.spyId)}] 였습니다! ${outcomeText}${
      penaltyTargets.length ? ' 벌칙: ' + penaltyTargets.map((id) => nameOf(id)).join(', ') : ''
    }`,
    penaltyTargets
  };
}

function resolveOxQuiz(cg) {
  const actual = cg.data.answer ? 'O' : 'X';
  const correctIds = Object.entries(cg.submissions)
    .filter(([, v]) => v === actual)
    .map(([id]) => id);
  correctIds.forEach((id) => addScore(id, 1));
  cg.finalSummary = {
    success: correctIds.length > 0,
    text: `"${cg.data.question}" → 정답은 [${actual}] 이었어요! ${
      correctIds.length ? `맞춘 사람: ${correctIds.map((id) => nameOf(id)).join(', ')} (+1점)` : '아무도 못 맞췄어요.'
    }`,
    choices: cg.submissions
  };
}

function resolveFlashMemoryQuiz(cg) {
  const correctIds = Object.entries(cg.submissions)
    .filter(([, v]) => v === cg.data.decoy)
    .map(([id]) => id);
  correctIds.forEach((id) => addScore(id, 1));
  cg.finalSummary = {
    success: correctIds.length > 0,
    text: `안 나왔던 카드는 [${cg.data.decoy}] 이었어요! ${
      correctIds.length ? `맞춘 사람: ${correctIds.map((id) => nameOf(id)).join(', ')} (+1점)` : '아무도 못 맞췄어요.'
    }`,
    choices: cg.submissions
  };
}

function resolveBalanceVote(cg) {
  let aCount = 0;
  let bCount = 0;
  Object.values(cg.submissions).forEach((v) => {
    if (v === 'A') aCount += 1;
    else if (v === 'B') bCount += 1;
  });
  cg.finalSummary = {
    success: null,
    text: `${cg.data.optionA}: ${aCount}표 / ${cg.data.optionB}: ${bCount}표! (점수 없는 재미용 투표예요)`,
    choices: cg.submissions
  };
}

function resolvePredictCount(cg) {
  const actual = cg.data.answer ? 'O' : 'X';
  const entries = Object.entries(cg.submissions);
  const correctIds = entries.filter(([, v]) => v && v.ans === actual).map(([id]) => id);
  correctIds.forEach((id) => addScore(id, 1));
  const actualCorrectCount = correctIds.length;

  let closestText = '';
  const predEntries = entries
    .filter(([, v]) => v && Number.isFinite(Number(v.predict)))
    .map(([id, v]) => [id, Number(v.predict)]);
  if (predEntries.length) {
    const minDiff = Math.min(...predEntries.map(([, p]) => Math.abs(p - actualCorrectCount)));
    const closestIds = predEntries.filter(([, p]) => Math.abs(p - actualCorrectCount) === minDiff).map(([id]) => id);
    closestIds.forEach((id) => addScore(id, 1));
    closestText = ` 예측이 가장 가까웠던 사람: ${closestIds.map((id) => nameOf(id)).join(', ')} (+1점 보너스)`;
  }

  cg.finalSummary = {
    success: actualCorrectCount > 0,
    text: `"${cg.data.question}" → 정답은 [${actual}], 실제로 ${actualCorrectCount}명이 맞췄어요!${closestText}`,
    choices: cg.submissions
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

    // 설명 퀴즈: 배우가 설명 글을 딱 한 번 제출 → 공개되고 나서 나머지가 정답을 추측
    if (cg.gameId === 'describeGuess' && cg.data.stage === 'describe') {
      if (pid !== cg.data.actorId) return;
      cg.data.clue = String(value || '').trim().slice(0, 200);
      cg.data.stage = 'guess';
      broadcast();
      return;
    }

    // 먼저 맞추면 즉시 끝나는 퀴즈류: 여러 번 다시 시도할 수 있게 제출을 막지 않는다
    if (cg.gameId === 'consonantQuiz' || cg.gameId === 'mathQuiz') {
      if (!connectedPlayers().some((p) => p.id === pid)) return;
      cg.submissions[pid] = value;
      const correct =
        cg.gameId === 'consonantQuiz'
          ? normalizeText(value) === normalizeText(cg.data.answer)
          : Number(value) === cg.data.answer;
      broadcast();
      if (correct) {
        clearTimers();
        addScore(pid, 2);
        cg.finalSummary = {
          success: true,
          text: `🎉 ${nameOf(pid)} 님이 가장 먼저 정답 [${cg.data.answer}]을(를) 맞췄어요! (+2점)`
        };
        finishGame(cg);
      }
      return;
    }
    if (cg.gameId === 'describeGuess' && cg.data.stage === 'guess') {
      if (pid === cg.data.actorId || !eligiblePlayerIds().includes(pid)) return;
      cg.submissions[pid] = value;
      broadcast();
      if (normalizeText(value) === normalizeText(cg.data.word)) {
        clearTimers();
        addScore(pid, 2);
        addScore(cg.data.actorId, 1);
        cg.finalSummary = {
          success: true,
          text: `🎉 ${nameOf(pid)} 님이 정답 [${cg.data.word}]을(를) 맞췄어요! (+2점, 설명한 ${nameOf(
            cg.data.actorId
          )} 님도 +1점)`
        };
        finishGame(cg);
      }
      return;
    }

    if (!eligiblePlayerIds().includes(pid)) return;
    cg.submissions[pid] = value;
    broadcast();
    maybeAutoResolve();
  });

  socket.on('player:submitWord', ({ word }) => {
    const cg = state.currentGame;
    const pid = socket.data.playerId;
    if (!cg || cg.gameId !== 'wordChain' || cg.phase !== 'playing' || !pid) return;
    if (!connectedPlayers().some((p) => p.id === pid)) return;
    const w = String(word || '').trim();
    if (w.length < 2) return;
    const lastWord = cg.data.chain[cg.data.chain.length - 1];
    const lastChar = lastWord[lastWord.length - 1];
    const firstChar = w[0];
    const alreadyUsed = cg.data.chain.some((existing) => normalizeText(existing) === normalizeText(w));
    if (firstChar !== lastChar || alreadyUsed) {
      cg.data.mistakeCount += 1;
      cg.data.lastResult = 'wrong';
      cg.data.lastBy = pid;
      cg.data.lastEventTs = Date.now();
      broadcast();
      return;
    }
    cg.data.chain.push(w);
    cg.data.lastResult = 'correct';
    cg.data.lastBy = pid;
    cg.data.lastEventTs = Date.now();
    addScore(pid, 1);
    if (cg.data.chain.length >= cg.data.targetLength) {
      finishWordChainSuccess();
      return;
    }
    broadcast();
  });

  socket.on('player:bombClick', () => {
    const cg = state.currentGame;
    const pid = socket.data.playerId;
    if (!cg || cg.gameId !== 'bombRelay' || cg.phase !== 'playing' || !pid) return;
    if (!connectedPlayers().some((p) => p.id === pid)) return;
    cg.data.count += 1;
    cg.data.lastClickerId = pid;
    cg.data.lastEventTs = Date.now();
    if (cg.data.count === cg.data.bombCount) {
      clearTimers();
      cg.finalSummary = {
        success: null,
        text: `💣 펑! [${cg.data.count}]번째에서 ${nameOf(pid)} 님이 폭탄을 밟았어요! 벌칙 대상!`,
        penaltyTargets: [pid]
      };
      finishGame(cg);
      return;
    }
    broadcast();
  });

  socket.on('player:flipCard', ({ index }) => {
    const cg = state.currentGame;
    const pid = socket.data.playerId;
    if (!cg || cg.gameId !== 'memoryDuel' || cg.phase !== 'playing' || !pid) return;
    if (cg.data.turnPlayerId !== pid) return;
    if (cg.data.flipped.length >= 2) return;
    const card = cg.data.board[index];
    if (!card || card.matched || card.revealed) return;
    card.revealed = true;
    cg.data.flipped.push(index);
    broadcast();

    if (cg.data.flipped.length === 2) {
      const [i1, i2] = cg.data.flipped;
      const c1 = cg.data.board[i1];
      const c2 = cg.data.board[i2];
      if (c1.value === c2.value) {
        c1.matched = true;
        c2.matched = true;
        cg.data.flipped = [];
        cg.data.scores[pid] = (cg.data.scores[pid] || 0) + 1;
        broadcast();
        if (cg.data.board.every((c) => c.matched)) {
          finishMemoryDuelComplete();
        }
      } else {
        memoryFlipTimer = setTimeout(() => {
          if (!state.currentGame || state.currentGame.instanceId !== cg.instanceId) return;
          c1.revealed = false;
          c2.revealed = false;
          cg.data.flipped = [];
          const [idA, idB] = cg.data.competitors;
          cg.data.turnPlayerId = pid === idA ? idB : idA;
          broadcast();
        }, 1200);
      }
    }
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
