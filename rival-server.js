// RIVAL (웹 FPS) 전용 서버 로직: 닉네임 등록 + 리더보드
// 데이터는 data/rival.json 에 저장. Render 무료 플랜은 재배포/재시작 때 이 파일이 지워질 수 있음.
const fs = require('fs');
const path = require('path');
const express = require('express');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rival.json');

let players = {}; // id -> { nick, wins, losses, kills, deaths, updatedAt }

try {
  players = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  players = {};
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(players));
    } catch (e) {
      console.error('RIVAL 저장 실패:', e.message);
    }
  }, 2000);
}

function cleanNick(raw) {
  return String(raw || '').replace(/[^\p{L}\p{N}_ ]/gu, '').trim().slice(0, 12);
}

function nickTaken(nick, exceptId) {
  const low = nick.toLowerCase();
  return Object.entries(players).some(([id, p]) => id !== exceptId && p.nick.toLowerCase() === low);
}

const clampInt = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

const router = express.Router();
router.use(express.json({ limit: '2kb' }));

// 닉네임 등록/확인. 같은 id면 닉네임 변경도 가능.
router.post('/join', (req, res) => {
  const id = String(req.body.id || '').slice(0, 40);
  const nick = cleanNick(req.body.nick);
  if (id.length < 8) return res.status(400).json({ error: '잘못된 접속입니다.' });
  if (nick.length < 2) return res.status(400).json({ error: '닉네임은 2글자 이상이에요.' });
  if (nickTaken(nick, id)) return res.status(409).json({ error: '이미 쓰고 있는 닉네임이에요.' });
  const p = players[id] || { wins: 0, losses: 0, kills: 0, deaths: 0 };
  p.nick = nick;
  p.updatedAt = Date.now();
  players[id] = p;
  save();
  res.json({ ok: true, nick, stats: p });
});

// 경기 결과 보고 (한 경기에서 늘어난 값만 보냄). 클라이언트 값을 믿는 구조라 부정행위 방지는 약함 → 상한만 둠.
router.post('/report', (req, res) => {
  const p = players[String(req.body.id || '')];
  if (!p) return res.status(404).json({ error: '먼저 닉네임을 등록하세요.' });
  // 한 매치는 최소 몇십 초는 걸리므로, 15초 안의 연속 보고는 막음 (리더보드 조작 완화)
  if (p.lastReport && Date.now() - p.lastReport < 15000) return res.status(429).json({ error: '기록 저장이 너무 빨라요.' });
  p.lastReport = Date.now();
  p.kills += clampInt(req.body.kills, 50);
  p.deaths += clampInt(req.body.deaths, 50);
  if (req.body.won === true) p.wins += 1;
  else if (req.body.won === false) p.losses += 1;
  p.updatedAt = Date.now();
  save();
  res.json({ ok: true, stats: p });
});

router.get('/leaderboard', (req, res) => {
  const rows = Object.values(players)
    .map((p) => ({ nick: p.nick, wins: p.wins, losses: p.losses, kills: p.kills, deaths: p.deaths }))
    .sort((a, b) => b.wins - a.wins || b.kills - a.kills || a.deaths - b.deaths)
    .slice(0, 20);
  res.json(rows);
});

module.exports = router;
