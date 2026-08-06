const socket = io();
const app = document.getElementById('app');
const penaltyOverlayEl = document.getElementById('penaltyOverlay');

const GAME_CATALOG = [
  { id: 'numberMatch', name: '숫자 맞추기 대전', category: '협동' },
  { id: 'averageGuess', name: '평균 맞추기', category: '협동' },
  { id: 'sumTarget', name: '총합 맞추기', category: '협동' },
  { id: 'colorCollect', name: '색깔 다 모으기', category: '협동' },
  { id: 'orderRelay', name: '순서 릴레이', category: '협동' },
  { id: 'noticeGame', name: '눈치게임', category: '대결' },
  { id: 'reactionDuel', name: '반응속도 1:1', category: '대결' },
  { id: 'bombNumber', name: '폭탄 숫자 피하기', category: '벌칙' },
  { id: 'lieDetector', name: '거짓말 탐지 투표', category: '벌칙' }
];

let role = sessionStorage.getItem('role') || null; // 'admin' | 'player'
let myPlayerId = localStorage.getItem('playerId') || null;
let latestState = null;
let prevPhase = null;
let countdownTimer = null;
let lastTickShown = null;
let setupCount = Number(localStorage.getItem('lastCount')) || 4;
let mySecret = null; // 거짓말 탐지 게임: 배우에게만 오는 비밀 지침
let lastRelayEventTs = 0;
let showAdminPinPrompt = false;
let pinError = null;
const roulette = { instanceId: null, animating: false };
let rouletteIntervalId = null;

function unlockAudioOnce() {
  SFX.unlock();
  document.removeEventListener('click', unlockAudioOnce);
}
document.addEventListener('click', unlockAudioOnce);

// 새로고침이나 와이파이 순단으로 소켓이 재연결돼도 내 자리를 자동으로 되찾는다.
socket.on('connect', () => {
  if (myPlayerId) socket.emit('player:join', { playerId: myPlayerId });
});

let registerError = null;
socket.on('registered', ({ playerId }) => {
  myPlayerId = playerId;
  localStorage.setItem('playerId', playerId);
  registerError = null;
  render();
});
socket.on('registerFailed', ({ reason }) => {
  registerError = reason === 'full' ? '정원이 다 찼어요. 관리자에게 문의하세요.' : '닉네임을 입력해주세요.';
  render();
});

socket.on('startGameFailed', ({ name, need }) => {
  alert(`${name} 게임은 최소 ${need}명이 연결되어 있어야 시작할 수 있어요.`);
});

socket.on('lieDetectorSecret', (secret) => {
  mySecret = secret;
});

socket.on('kicked', () => {
  localStorage.removeItem('playerId');
  myPlayerId = null;
  alert('관리자에 의해 자리가 초기화됐어요. 다시 입장해주세요.');
  render();
});

socket.on('state', (s) => {
  latestState = s;
  handleSoundCues(s);
  maybeStartRoulette(s.currentGame);
  render();
});

function maybeStartRoulette(cg) {
  if (cg && cg.wasRandom && cg.phase === 'tutorial' && cg.instanceId !== roulette.instanceId) {
    roulette.instanceId = cg.instanceId;
    roulette.animating = true;
    setTimeout(() => {
      roulette.animating = false;
      if (rouletteIntervalId) clearInterval(rouletteIntervalId);
      render();
    }, 2200);
  }
}

function handleSoundCues(s) {
  const cg = s.currentGame;
  const newPhase = cg ? cg.phase : s.phase;
  if (newPhase !== prevPhase) {
    if (cg && cg.phase === 'result' && cg.finalSummary) {
      if (cg.finalSummary.success === true) {
        SFX.success();
        Confetti.launch();
      } else if (cg.finalSummary.success === false) {
        SFX.fail();
      }
    } else if (!cg && newPhase === 'awards') {
      SFX.success();
      Confetti.launch();
    }
    prevPhase = newPhase;
  }
  if (cg && cg.gameId === 'orderRelay' && cg.data.lastEventTs && cg.data.lastEventTs !== lastRelayEventTs) {
    lastRelayEventTs = cg.data.lastEventTs;
    if (cg.data.lastResult === 'correct') SFX.tick();
    else if (cg.data.lastResult === 'wrong') SFX.fail();
  }
  if (s.penaltyOverlay && (!latestState._lastPenaltyTs || latestState._lastPenaltyTs !== s.penaltyOverlay.ts)) {
    SFX.penalty();
  }
  latestState._lastPenaltyTs = s.penaltyOverlay ? s.penaltyOverlay.ts : null;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}

function nameOf(id) {
  const p = latestState.players.find((pl) => pl.id === id);
  return p ? p.nickname : '???';
}

function genderIcon(g) {
  return g === 'm' ? '👦' : g === 'f' ? '👧' : '🙂';
}

// ---------------------------------------------------------------------------
// 최상위 렌더
// ---------------------------------------------------------------------------
function render() {
  renderPenaltyOverlay();

  if (!role) {
    app.innerHTML = '';
    app.appendChild(showAdminPinPrompt ? renderAdminPinPrompt() : renderRoleSelect());
    return;
  }
  if (!latestState) {
    app.innerHTML = '<div class="card center">연결 중...</div>';
    return;
  }

  app.innerHTML = '';
  app.appendChild(renderTopBar());

  if (role === 'admin') {
    app.appendChild(renderAdmin());
  } else {
    app.appendChild(renderPlayer());
  }

  startCountdownLoopIfNeeded();
}

function renderTopBar() {
  const bgmLabel = SFX.isBgmOn() ? '🔊 배경음악 끄기' : '🔈 배경음악 켜기';
  const callRoom = latestState && latestState.callRoom;
  const frag = el(`
    <div class="top-bar">
      ${callRoom ? '<button class="icon-btn call-btn" id="joinCall">📞 통화방 참여</button>' : ''}
      ${
        role === 'admin'
          ? `<button class="icon-btn" id="toggleCall">${callRoom ? '📴 통화방 닫기' : '📞 통화방 열기'}</button>`
          : ''
      }
      <button class="icon-btn" id="bgmToggle">${bgmLabel}</button>
      &nbsp;
      <button class="icon-btn" id="roleReset">🔁 역할 다시 선택</button>
    </div>
  `);
  if (callRoom) {
    frag.getElementById('joinCall').onclick = () => {
      window.open('https://meet.jit.si/' + callRoom.roomName, '_blank');
    };
  }
  if (role === 'admin') {
    frag.getElementById('toggleCall').onclick = () => {
      socket.emit(callRoom ? 'admin:endCallRoom' : 'admin:startCallRoom');
    };
  }
  frag.getElementById('bgmToggle').onclick = () => {
    if (SFX.isBgmOn()) SFX.stopBgm();
    else SFX.startBgm();
    render();
  };
  frag.getElementById('roleReset').onclick = () => {
    sessionStorage.removeItem('role');
    role = null;
    render();
  };
  return frag;
}

function renderPenaltyOverlay() {
  if (latestState && latestState.penaltyOverlay) {
    penaltyOverlayEl.classList.remove('hidden');
    penaltyOverlayEl.innerHTML = `
      <div>🚨 즉석 벌칙 발생! 🚨</div>
      <div style="margin-top:14px; font-size:1.3rem;">${escapeHtml(latestState.penaltyOverlay.text)}</div>
    `;
  } else {
    penaltyOverlayEl.classList.add('hidden');
    penaltyOverlayEl.innerHTML = '';
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.innerText = str;
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// 역할 선택
// ---------------------------------------------------------------------------
function renderRoleSelect() {
  const frag = el(`
    <div style="width:100%; max-width:480px; margin-top:12vh;">
      <h1>🏖️ 풀빌라 파티 게임</h1>
      <div class="card center">
        <button class="big-btn" id="pickAdmin">🎛️ 관리자로 입장</button>
        <button class="big-btn orange" id="pickPlayer">🙋 플레이어로 입장</button>
      </div>
    </div>
  `);
  frag.getElementById('pickAdmin').onclick = () => {
    pinError = null;
    showAdminPinPrompt = true;
    render();
  };
  frag.getElementById('pickPlayer').onclick = () => {
    role = 'player';
    sessionStorage.setItem('role', 'player');
    render();
  };
  return frag;
}

function renderAdminPinPrompt() {
  const pinSet = latestState && latestState.adminPinSet;
  const frag = el(`
    <div style="width:100%; max-width:480px; margin-top:12vh;">
      <h1>🔒 관리자 입장</h1>
      <div class="card">
        <p class="muted">${
          pinSet
            ? 'PIN을 입력해주세요.'
            : '처음 입장이에요. 앞으로 쓸 PIN을 정해주세요 (비워두면 보호 없이 진행돼요).'
        }</p>
        <input type="text" id="pinInput" inputmode="numeric" maxlength="6" placeholder="PIN (숫자 4~6자리 권장)" />
        ${pinError ? `<p style="color:#e2574a; font-weight:700;">${escapeHtml(pinError)}</p>` : ''}
        <button class="big-btn green" id="pinSubmit">🚪 입장하기</button>
        <button class="big-btn gray small" id="pinCancel">← 뒤로</button>
      </div>
    </div>
  `);
  const pinInputEl = frag.getElementById('pinInput');
  const submit = () => {
    const pin = pinInputEl.value.trim();
    socket.emit('admin:verifyPin', { pin }, (res) => {
      if (res && res.ok) {
        role = 'admin';
        sessionStorage.setItem('role', 'admin');
        showAdminPinPrompt = false;
        pinError = null;
      } else {
        pinError = 'PIN이 틀렸어요. 다시 시도해주세요.';
      }
      render();
    });
  };
  frag.getElementById('pinSubmit').onclick = submit;
  pinInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  frag.getElementById('pinCancel').onclick = () => {
    showAdminPinPrompt = false;
    pinError = null;
    render();
  };
  return frag;
}

// ---------------------------------------------------------------------------
// 관리자 화면
// ---------------------------------------------------------------------------
function renderAdmin() {
  const wrap = document.createElement('div');
  wrap.style.width = '100%';
  wrap.style.maxWidth = '560px';

  if (latestState.phase === 'setup') {
    wrap.appendChild(renderAdminSetup());
    return wrap;
  }

  if (latestState.phase === 'awards') {
    wrap.appendChild(renderAwardsScreen(true));
    return wrap;
  }

  if (latestState.currentGame && latestState.phase !== 'lobby') {
    wrap.appendChild(renderAdminGameControl());
    wrap.appendChild(renderAdminPenaltyBox());
    return wrap;
  }

  wrap.appendChild(renderAdminLobby());
  return wrap;
}

function renderAdminSetup() {
  const frag = el(`
    <div class="card">
      <h2>👥 참가 인원 설정</h2>
      <div class="row">
        <label>인원 수</label>
        <input type="number" id="countInput" min="2" max="12" value="${setupCount}" />
      </div>
      <button class="big-btn green" id="submitSetup">✅ 설정 완료 &amp; 대기실 만들기</button>
      <p class="muted">인원수만 정하면 대기실이 만들어져요. 각자 자기 폰에서 "플레이어로 입장" &rarr; 직접 닉네임을 입력해서 참가합니다.</p>
    </div>
  `);

  const countInputEl = frag.getElementById('countInput');

  frag.getElementById('submitSetup').onclick = () => {
    setupCount = Math.max(2, Math.min(12, Number(countInputEl.value) || 4));
    localStorage.setItem('lastCount', String(setupCount));
    socket.emit('admin:setup', { maxPlayers: setupCount });
  };

  return frag;
}

function renderAdminLobby() {
  const frag = el(`
    <div>
      <div class="card">
        <h2>🧑‍🤝‍🧑 참가자 현황</h2>
        <p class="muted">${latestState.players.filter((p) => p.connected).length} / ${latestState.maxPlayers}명 입장함</p>
        <div class="player-list" id="playerList"></div>
        <hr />
        <p class="muted">팀은 게임을 시작할 때마다 자동으로 랜덤 재배정돼요. 대결형 게임(예: 눈치게임)에서만 팀 점수가 쓰이고, 협동/벌칙형 게임은 팀과 상관없이 진행돼요.</p>
      </div>

      <div class="card">
        <h2>🏆 실시간 리더보드</h2>
        <div id="leaderboard"></div>
        <button class="big-btn pink" id="showAwards">🏆 시상식 열기</button>
        <button class="big-btn gray small" id="resetHistory">🗑️ 게임 기록 / 점수 초기화</button>
      </div>

      <div class="card">
        <h2>🎮 게임 선택</h2>
        <button class="big-btn pink" id="randomGame">🎰 랜덤 룰렛으로 뽑기</button>
        <div id="gameButtons"></div>
      </div>

      <div class="card">
        <h2>📜 최근 게임 기록</h2>
        <div id="historyList"></div>
      </div>

      <div class="card">
        <h3>⚠️ 위험 구역</h3>
        <button class="big-btn gray small" id="fullReset">🔄 전체 초기화 (인원부터 다시 설정)</button>
        <button class="big-btn gray small" id="clearPin">🔓 관리자 PIN 초기화</button>
      </div>
    </div>
  `);

  const playerListEl = frag.getElementById('playerList');
  latestState.players.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'player-chip' + (p.connected ? ' connected' : '');
    if (!p.claimed) {
      row.innerHTML = `<span><span class="status-dot"></span>⏳ 대기 중 (아직 입장 전)</span>`;
      playerListEl.appendChild(row);
      return;
    }
    row.innerHTML = `
      <span><span class="status-dot"></span>${genderIcon(p.gender)} ${escapeHtml(p.nickname)}</span>
      <span class="row-actions">
        <span class="team-badge ${p.team}">${p.team === 'A' ? '🔵A팀' : '🔴B팀'}</span>
        <button class="kick-btn" data-id="${p.id}" title="추방">❌</button>
      </span>
    `;
    row.querySelector('.kick-btn').onclick = () => {
      if (confirm(`${p.nickname} 님을 추방할까요? 자리가 다시 비워져요.`)) {
        socket.emit('admin:kickPlayer', { playerId: p.id });
      }
    };
    playerListEl.appendChild(row);
  });

  frag.getElementById('leaderboard').appendChild(renderLeaderboard(false));

  frag.getElementById('resetHistory').onclick = () => {
    if (confirm('점수와 게임 기록을 모두 초기화할까요?')) socket.emit('admin:resetHistory');
  };
  frag.getElementById('fullReset').onclick = () => {
    if (confirm('정말 처음부터 다시 시작할까요? 참가자 명단과 점수가 모두 사라져요!')) {
      socket.emit('admin:fullReset');
    }
  };
  frag.getElementById('clearPin').onclick = () => {
    if (confirm('관리자 PIN을 초기화할까요? 다음 입장부터는 PIN 없이 들어올 수 있어요.')) {
      socket.emit('admin:clearPin');
    }
  };
  frag.getElementById('randomGame').onclick = () => socket.emit('admin:startRandomGame');
  frag.getElementById('showAwards').onclick = () => socket.emit('admin:showAwards');

  const gameButtonsEl = frag.getElementById('gameButtons');
  ['협동', '대결', '벌칙'].forEach((cat) => {
    const tag = document.createElement('div');
    tag.className = `category-tag ${cat}`;
    tag.innerText = cat + '형';
    gameButtonsEl.appendChild(tag);
    GAME_CATALOG.filter((g) => g.category === cat).forEach((g) => {
      const btn = document.createElement('button');
      btn.className = 'big-btn small';
      btn.innerText = '▶ ' + g.name;
      btn.onclick = () => socket.emit('admin:startGame', { gameId: g.id });
      gameButtonsEl.appendChild(btn);
    });
  });

  const historyEl = frag.getElementById('historyList');
  if (latestState.history.length === 0) {
    historyEl.innerHTML = '<p class="muted">아직 진행한 게임이 없어요.</p>';
  } else {
    [...latestState.history].reverse().slice(0, 10).forEach((h) => {
      const d = document.createElement('div');
      d.className = 'history-item';
      d.innerText = `[${h.category}] ${h.gameName} — ${h.summary}`;
      historyEl.appendChild(d);
    });
  }

  return frag;
}

function renderLeaderboard(showTeamTotal) {
  const wrap = document.createElement('div');
  const claimed = latestState.players.filter((p) => p.claimed);
  const sorted = [...claimed].sort((a, b) => b.score - a.score);
  sorted.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span>${i + 1}. ${genderIcon(p.gender)} ${escapeHtml(p.nickname)} <small>(${
      p.team === 'A' ? '🔵' : '🔴'
    })</small></span><span>${p.score}점</span>`;
    wrap.appendChild(row);
  });
  if (showTeamTotal) {
    const teamA = claimed.filter((p) => p.team === 'A').reduce((s, p) => s + p.score, 0);
    const teamB = claimed.filter((p) => p.team === 'B').reduce((s, p) => s + p.score, 0);
    const teamRow = document.createElement('div');
    teamRow.style.marginTop = '8px';
    teamRow.style.fontWeight = '700';
    teamRow.innerHTML = `🔵 A팀 합계: ${teamA}점 &nbsp;|&nbsp; 🔴 B팀 합계: ${teamB}점`;
    wrap.appendChild(teamRow);
  }
  return wrap;
}

function renderAwardsScreen(isAdmin) {
  const claimed = latestState.players.filter((p) => p.claimed);
  const sorted = [...claimed].sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉'];
  const frag = el(`
    <div class="card center awards-card">
      <h1 class="awards-title">🏆 시상식 🏆</h1>
      <div id="awardsList"></div>
      ${
        isAdmin
          ? '<button class="big-btn green" id="closeAwards">🏠 대기실로 돌아가기</button>'
          : '<p class="muted">관리자가 대기실로 돌아갈 때까지 기다려주세요.</p>'
      }
    </div>
  `);
  const listEl = frag.getElementById('awardsList');
  if (sorted.length === 0) {
    listEl.innerHTML = '<p class="muted">아직 점수가 없어요.</p>';
  } else {
    sorted.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'award-row' + (i < 3 ? ' top' + (i + 1) : '');
      row.innerHTML = `
        <span class="award-rank">${medals[i] || i + 1 + '위'}</span>
        <span class="award-name">${genderIcon(p.gender)} ${escapeHtml(p.nickname)}</span>
        <span class="award-score">${p.score}점</span>
      `;
      listEl.appendChild(row);
    });
  }
  if (isAdmin) {
    frag.getElementById('closeAwards').onclick = () => socket.emit('admin:closeAwards');
  }
  return frag;
}

function adminEligibleIds(cg) {
  if (cg.gameId === 'noticeGame') return cg.data.aliveIds;
  if (cg.gameId === 'reactionDuel') return cg.data.competitors;
  if (cg.gameId === 'lieDetector') {
    return latestState.players.filter((p) => p.connected && p.id !== cg.data.actorId).map((p) => p.id);
  }
  return latestState.players.filter((p) => p.connected).map((p) => p.id);
}

function renderAdminGameControl() {
  const cg = latestState.currentGame;
  const frag = el(`
    <div class="card">
      <div class="category-tag ${cg.category}">${cg.category}형</div>
      <h2>${escapeHtml(cg.name)}</h2>
      <div id="phaseBody"></div>
    </div>
  `);
  const body = frag.getElementById('phaseBody');

  if (cg.phase === 'tutorial') {
    const connected = latestState.players.filter((p) => p.connected);
    body.innerHTML = `
      <p>플레이어 화면에 게임 설명이 표시되고 있어요.</p>
      <p><b>${cg.readyIds.length} / ${connected.length}</b>명 준비 완료</p>
      <button class="big-btn orange" id="forceStart">⏩ 강제로 바로 시작</button>
    `;
    body.querySelector('#forceStart').onclick = () => socket.emit('admin:forceStart');
  } else if (cg.phase === 'playing') {
    let statusHtml;
    if (cg.gameId === 'colorCollect') {
      statusHtml = `<p>친구들과 대화하며 색깔을 알아내는 중... 시간이 끝나면 자동 공개돼요.</p>`;
    } else if (cg.gameId === 'orderRelay') {
      statusHtml = `<p>현재 진행: <b>${cg.data.currentStep - 1} / ${cg.data.total}</b>명 성공 (틀린 횟수: ${cg.data.mistakeCount})</p>`;
    } else {
      const need = adminEligibleIds(cg);
      const got = cg.submittedIds ? cg.submittedIds.length : 0;
      statusHtml = `<p>${cg.gameId === 'noticeGame' ? `라운드 ${cg.data.round} ` : ''}제출 현황: <b>${got} / ${need.length}</b></p>`;
    }
    body.innerHTML = `
      ${statusHtml}
      <div class="timer-bar-outer"><div class="timer-bar-inner" id="adminTimerBar" style="width:100%"></div></div>
      <button class="big-btn gray" id="endNow">⏹️ 지금 바로 마감</button>
    `;
    body.querySelector('#endNow').onclick = () => socket.emit('admin:endRoundNow');
  } else if (cg.phase === 'roundResult') {
    const rr = cg.lastRoundSummary;
    body.innerHTML = `
      <p>라운드 ${rr.round} 결과</p>
      <p>❌ 탈락: ${rr.eliminated.length ? rr.eliminated.map(nameOf).join(', ') : '없음'}</p>
      <p>✅ 생존: ${rr.survivors.length ? rr.survivors.map(nameOf).join(', ') : '없음'}</p>
      <p class="muted">잠시 후 다음 라운드가 자동으로 시작됩니다...</p>
    `;
  } else if (cg.phase === 'result') {
    body.innerHTML = `
      <p style="font-size:1.15rem; font-weight:700;">${escapeHtml(cg.finalSummary ? cg.finalSummary.text : '')}</p>
      <button class="big-btn green" id="backToLobby">🏠 대기실로 돌아가기</button>
    `;
    body.querySelector('#backToLobby').onclick = () => socket.emit('admin:backToLobby');
  }

  return frag;
}

function renderAdminPenaltyBox() {
  const frag = el(`
    <div class="card">
      <h3>😈 즉석 벌칙 보내기</h3>
      <p class="muted">언제든지 원하는 벌칙 문구를 입력해서 모든 플레이어 화면에 바로 띄울 수 있어요.</p>
      <div class="penalty-form">
        <input type="text" id="penaltyText" placeholder="예: OOO 엎드려뻗쳐 10초!" maxlength="80" />
        <button class="big-btn pink small" id="sendPenalty">보내기</button>
      </div>
      ${latestState.penaltyOverlay ? '<button class="big-btn gray small" id="clearPenalty">벌칙 화면 지우기</button>' : ''}
    </div>
  `);
  const penaltyInputEl = frag.getElementById('penaltyText');
  frag.getElementById('sendPenalty').onclick = () => {
    const v = penaltyInputEl.value.trim();
    if (v) {
      socket.emit('admin:sendPenalty', { text: v });
      penaltyInputEl.value = '';
    }
  };
  const clearBtn = frag.getElementById('clearPenalty');
  if (clearBtn) clearBtn.onclick = () => socket.emit('admin:clearPenalty');
  return frag;
}

// ---------------------------------------------------------------------------
// 플레이어 화면
// ---------------------------------------------------------------------------
function renderPlayer() {
  const wrap = document.createElement('div');
  wrap.style.width = '100%';
  wrap.style.maxWidth = '480px';

  const me = myPlayerId ? latestState.players.find((p) => p.id === myPlayerId && p.connected) : null;

  if (!me) {
    wrap.appendChild(renderPlayerJoin());
    return wrap;
  }

  if (!latestState.currentGame || latestState.phase === 'lobby') {
    wrap.appendChild(renderPlayerLobby(me));
    return wrap;
  }

  if (latestState.phase === 'awards') {
    wrap.appendChild(renderAwardsScreen(false));
    return wrap;
  }

  const cg = latestState.currentGame;
  if (cg.phase === 'tutorial' && cg.wasRandom && roulette.animating && roulette.instanceId === cg.instanceId) {
    wrap.appendChild(renderRouletteSpin(cg));
    return wrap;
  }

  wrap.appendChild(renderPlayerGame(me));
  return wrap;
}

function renderRouletteSpin(cg) {
  const frag = el(`
    <div class="card">
      <h2 class="center">🎰 오늘의 게임은...?</h2>
      <div class="roulette-box">
        <div class="spin-name" id="spinName">???</div>
      </div>
      <p class="muted center">두구두구두구...</p>
    </div>
  `);
  const nameEl = frag.getElementById('spinName');
  if (rouletteIntervalId) clearInterval(rouletteIntervalId);
  rouletteIntervalId = setInterval(() => {
    const g = GAME_CATALOG[Math.floor(Math.random() * GAME_CATALOG.length)];
    if (nameEl) nameEl.innerText = g.name;
  }, 90);
  return frag;
}

function renderPlayerJoin() {
  if (latestState.phase === 'setup' || latestState.players.length === 0) {
    return el(`<div class="card center"><h2>⏳ 대기 중</h2><p>관리자가 참가 인원을 설정하고 있어요...</p></div>`);
  }
  const openSlots = latestState.players.filter((p) => !p.claimed).length;
  if (openSlots === 0) {
    return el(`<div class="card center"><h2>🚫 정원이 다 찼어요</h2><p>관리자에게 문의해주세요.</p></div>`);
  }
  const frag = el(`
    <div class="card">
      <h2>👋 닉네임을 입력하고 입장하세요</h2>
      <p class="muted">${openSlots}자리 남음</p>
      <input type="text" id="nickInput" placeholder="내 별명 (최대 12자)" maxlength="12" />
      <div class="row" style="margin: 10px 0;">
        <button class="big-btn small" id="genderM">👦 남</button>
        <button class="big-btn small" id="genderF">👧 여</button>
        <button class="big-btn small gray" id="genderNa">🙂 비공개</button>
      </div>
      ${registerError ? `<p style="color:#e2574a; font-weight:700;">${escapeHtml(registerError)}</p>` : ''}
      <button class="big-btn green" id="joinBtn">🚪 입장하기</button>
    </div>
  `);

  let selectedGender = 'na';
  const genderBtns = {
    m: frag.getElementById('genderM'),
    f: frag.getElementById('genderF'),
    na: frag.getElementById('genderNa')
  };
  function highlightGender() {
    Object.entries(genderBtns).forEach(([key, btn]) => {
      btn.style.outline = key === selectedGender ? '3px solid #333' : 'none';
    });
  }
  highlightGender();
  genderBtns.m.onclick = () => { selectedGender = 'm'; highlightGender(); };
  genderBtns.f.onclick = () => { selectedGender = 'f'; highlightGender(); };
  genderBtns.na.onclick = () => { selectedGender = 'na'; highlightGender(); };

  const nickInputEl = frag.getElementById('nickInput');
  const submit = () => {
    const nick = nickInputEl.value.trim();
    if (!nick) {
      registerError = '닉네임을 입력해주세요.';
      render();
      return;
    }
    socket.emit('player:register', { nickname: nick, gender: selectedGender });
  };
  frag.getElementById('joinBtn').onclick = submit;
  nickInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  return frag;
}

function renderPlayerLobby(me) {
  const frag = el(`
    <div class="card center">
      <h2>🙋 ${escapeHtml(me.nickname)}님, 환영해요!</h2>
      <p class="muted">${me.team === 'A' ? '🔵 A팀' : '🔴 B팀'} · 대결형 게임에서만 팀 점수가 적용돼요</p>
      <p>관리자가 다음 게임을 준비하고 있어요...</p>
      <div id="lb"></div>
    </div>
  `);
  frag.getElementById('lb').appendChild(renderLeaderboard(false));
  return frag;
}

function renderPlayerGame(me) {
  const cg = latestState.currentGame;
  const frag = el(`
    <div class="card">
      <div class="category-tag ${cg.category}">${cg.category}형</div>
      <h2>${escapeHtml(cg.name)}</h2>
      <div id="pBody"></div>
    </div>
  `);
  const body = frag.getElementById('pBody');

  if (cg.phase === 'tutorial') {
    const isReady = cg.readyIds.includes(me.id);
    body.innerHTML = `
      <div class="tutorial-box">${escapeHtml(cg.tutorialText || '')}</div>
      <button class="big-btn green" id="readyBtn" ${isReady ? 'disabled' : ''}>
        ${isReady ? '✅ 준비 완료! 다른 친구들 기다리는 중...' : '🙋 시작 준비 완료!'}
      </button>
    `;
    const btn = body.querySelector('#readyBtn');
    if (!isReady) btn.onclick = () => socket.emit('player:ready');
  } else if (cg.phase === 'playing') {
    renderPlayerPlaying(body, cg, me);
  } else if (cg.phase === 'roundResult') {
    const rr = cg.lastRoundSummary;
    const alive = cg.data.aliveIds.includes(me.id);
    body.innerHTML = `
      <p class="center" style="font-size:1.3rem;">${alive ? '🎉 생존했어요!' : '💀 탈락했어요...'}</p>
      <p class="muted center">❌ 탈락: ${rr.eliminated.length ? rr.eliminated.map(nameOf).join(', ') : '없음'}</p>
      <p class="muted center">잠시 후 다음 라운드가 시작돼요...</p>
    `;
  } else if (cg.phase === 'result') {
    const fs = cg.finalSummary;
    body.innerHTML = `
      <p class="center" style="font-size:1.2rem; font-weight:700;">${escapeHtml(fs ? fs.text : '')}</p>
      <div id="lb2"></div>
      <p class="muted center">관리자가 다음 게임을 준비할 때까지 기다려주세요.</p>
    `;
    body.querySelector('#lb2').appendChild(renderLeaderboard(cg.teamBased));
  }

  return frag;
}

function renderPlayerPlaying(body, cg, me) {
  if (cg.gameId === 'noticeGame') {
    if (!cg.data.aliveIds.includes(me.id)) {
      const neverIn = cg.data.initialIds && !cg.data.initialIds.includes(me.id);
      body.innerHTML = neverIn
        ? `<p class="center" style="font-size:1.3rem;">⏳ 이번 게임에는 참여하지 못했어요.<br/>다음 게임을 기다려주세요!</p>`
        : `<p class="center" style="font-size:1.3rem;">💀 이번 게임에서는 탈락했어요.<br/>결과를 지켜봐 주세요!</p>`;
      return;
    }
    renderNumberGrid(body, cg, me);
  } else if (cg.gameId === 'reactionDuel') {
    if (!cg.data.competitors.includes(me.id)) {
      body.innerHTML = `<p class="center" style="font-size:1.2rem;">⚡ ${escapeHtml(nameOf(cg.data.competitors[0]))} VS ${escapeHtml(
        nameOf(cg.data.competitors[1])
      )}<br/>대결 중입니다! 결과를 지켜봐주세요.</p>`;
      return;
    }
    const submitted = cg.submittedIds && cg.submittedIds.includes(me.id);
    body.innerHTML = `
      <div class="timer-bar-outer"><div class="timer-bar-inner" id="playerTimerBar" style="width:100%"></div></div>
      <button class="reaction-btn" id="reactionBtn" ${submitted ? 'disabled' : ''}>${
      submitted ? '제출 완료!' : '기다리세요...'
    }</button>
      <p class="center muted">신호가 오면(버튼이 초록색) 최대한 빨리 누르세요! 너무 빨리 누르면 실격이에요.</p>
    `;
    if (!submitted) {
      body.querySelector('#reactionBtn').onclick = () => {
        SFX.click();
        socket.emit('player:submit', { value: Date.now() });
      };
    }
  } else if (cg.gameId === 'colorCollect') {
    const myColor = cg.data.colors ? cg.data.colors[me.id] : '❓';
    body.innerHTML = `
      <div class="timer-bar-outer"><div class="timer-bar-inner" id="playerTimerBar" style="width:100%"></div></div>
      <p class="center muted">나만 보이는 색깔이에요. 친구들과 말해보며 색깔을 맞춰보세요!</p>
      <div class="color-display">${myColor}</div>
      <button class="big-btn orange" id="changeColorBtn">🔄 색깔 바꾸기</button>
      <p class="center muted">모두 다른 색이 되면 자동으로 성공 처리돼요.</p>
    `;
    body.querySelector('#changeColorBtn').onclick = () => {
      SFX.click();
      socket.emit('player:changeColor');
    };
  } else if (cg.gameId === 'orderRelay') {
    const step = cg.data.currentStep;
    const total = cg.data.total;
    const flash =
      cg.data.lastResult === 'correct'
        ? '<p class="relay-flash correct">✅ 방금 정답! 다음 순서로 넘어갔어요</p>'
        : cg.data.lastResult === 'wrong'
        ? '<p class="relay-flash wrong">❌ 틀렸어요! 처음부터 다시!</p>'
        : '';
    body.innerHTML = `
      <div class="timer-bar-outer"><div class="timer-bar-inner" id="playerTimerBar" style="width:100%"></div></div>
      <p class="center">현재까지 <b>${step - 1} / ${total}</b>명 성공 (틀린 횟수: ${cg.data.mistakeCount})</p>
      ${flash}
      <button class="relay-btn" id="relayBtn">지금인 것 같으면 누르기!</button>
      <p class="center muted">순서를 맞춰서 눌러야 다음 단계로 넘어가요.</p>
    `;
    body.querySelector('#relayBtn').onclick = () => {
      SFX.click();
      socket.emit('player:relayPress');
    };
  } else if (cg.gameId === 'lieDetector') {
    const isActor = cg.data.actorId === me.id;
    if (isActor) {
      body.innerHTML = `
        <div class="timer-bar-outer"><div class="timer-bar-inner" id="playerTimerBar" style="width:100%"></div></div>
        <div class="secret-box">${
          mySecret
            ? (mySecret.truth ? '✅ 진실을 말하세요!' : '🎭 그럴듯하게 거짓말을 하세요!') + '\n주제: ' + escapeHtml(mySecret.prompt)
            : '비밀 지침을 불러오는 중...'
        }</div>
        <p class="center muted">지금 친구들에게 이야기해주세요! 투표 결과를 기다려주세요.</p>
      `;
    } else {
      const submitted = cg.submittedIds && cg.submittedIds.includes(me.id);
      body.innerHTML = `
        <div class="timer-bar-outer"><div class="timer-bar-inner" id="playerTimerBar" style="width:100%"></div></div>
        <p class="center">${escapeHtml(nameOf(cg.data.actorId))} 님의 이야기, 진짜일까요 가짜일까요?</p>
        <div class="row">
          <button class="big-btn green" id="voteReal" ${submitted ? 'disabled' : ''}>😇 진짜예요</button>
          <button class="big-btn pink" id="voteFake" ${submitted ? 'disabled' : ''}>😈 가짜예요</button>
        </div>
        <p class="center muted">${submitted ? '투표 완료! 결과를 기다려주세요' : ''}</p>
      `;
      if (!submitted) {
        body.querySelector('#voteReal').onclick = () => {
          SFX.click();
          socket.emit('player:submit', { value: 'real' });
        };
        body.querySelector('#voteFake').onclick = () => {
          SFX.click();
          socket.emit('player:submit', { value: 'fake' });
        };
      }
    }
  } else {
    renderNumberGrid(body, cg, me);
  }
}

function renderNumberGrid(body, cg, me) {
  const submitted = cg.submittedIds && cg.submittedIds.includes(me.id);
  const max = cg.data.max;
  const min = cg.data.min || 1;
  let gridHtml = '<div class="number-grid" id="grid">';
  for (let n = min; n <= max; n++) {
    gridHtml += `<button data-n="${n}" ${submitted ? 'disabled' : ''}>${n}</button>`;
  }
  gridHtml += '</div>';
  body.innerHTML = `
    <div class="timer-bar-outer"><div class="timer-bar-inner" id="playerTimerBar" style="width:100%"></div></div>
    ${gridHtml}
    <p class="center muted" id="submitStatus">${submitted ? '제출 완료! 다른 친구들을 기다리는 중...' : '숫자를 골라주세요'}</p>
  `;
  if (!submitted) {
    body.querySelectorAll('#grid button').forEach((btn) => {
      btn.onclick = () => {
        SFX.click();
        socket.emit('player:submit', { value: Number(btn.dataset.n) });
      };
    });
  }
}

// ---------------------------------------------------------------------------
// 타이머 바 애니메이션 (roundEndsAt 기준 로컬 카운트다운)
// ---------------------------------------------------------------------------
function startCountdownLoopIfNeeded() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  const cg = latestState && latestState.currentGame;
  if (!cg || cg.phase !== 'playing' || !cg.roundEndsAt) return;

  lastTickShown = null;
  countdownTimer = setInterval(() => {
    const remainMs = cg.roundEndsAt - Date.now();
    const pct = Math.max(0, Math.min(100, (remainMs / (cg.duration * 1000)) * 100));
    const bars = [document.getElementById('adminTimerBar'), document.getElementById('playerTimerBar')];
    bars.forEach((b) => {
      if (b) b.style.width = pct + '%';
    });
    const secLeft = Math.ceil(remainMs / 1000);
    if (secLeft <= 3 && secLeft >= 1 && secLeft !== lastTickShown) {
      SFX.tick();
      lastTickShown = secLeft;
    }
    if (cg.gameId === 'reactionDuel' && cg.data.signalAt) {
      const btn = document.getElementById('reactionBtn');
      if (btn && !btn.disabled) {
        if (Date.now() >= cg.data.signalAt) {
          btn.classList.add('go');
          btn.innerText = '지금 눌러!';
        }
      }
    }
    if (remainMs <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 150);
}

render();
