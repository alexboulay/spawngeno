const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));

const ITEMS = [
  'alien-svgrepo-com-2.svg',
  'alien-svgrepo-com-3.svg',
  'alien-svgrepo-com-4.svg',
  'alien-svgrepo-com-5.svg',
  'alien-svgrepo-com.svg',
  'alien-ufo-svgrepo-com.svg',
  'astrology-horoscope-svgrepo-com.svg',
  'astronaut-svgrepo-com.svg',
  'black-hole-svgrepo-com.svg',
  'comet-asteroid-svgrepo-com.svg',
  'comet-svgrepo-com.svg',
  'constellation-svgrepo-com-2.svg',
  'constellation-svgrepo-com.svg',
  'moon-rover-svgrepo-com.svg',
  'moon-svgrepo-com.svg',
  'observation-eye-svgrepo-com.svg',
  'orbit-svgrepo-com-2.svg',
  'orbit-svgrepo-com.svg',
  'planet-earth-geography-svgrepo-com.svg',
  'planet-svgrepo-com-2.svg',
];
const REF_COUNT = 6;
const DISTRACTOR_COUNT = 6;
const PHASE1_ITEM_DURATION = 2000;
const PHASE2_DURATION = 15000;
const POINTS_CORRECT = 10;
const POINTS_PENALTY = 8;
const POINTS_SPEED   = 30;

const state = {
  phase: 'lobby',
  players: {},
  hostSocketId: null,
  round: 0,
  refItems: [],
  carouselItems: [],
  answers: {},
  phase2StartTime: 0,
  phase2Timer: null,
};

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const activePlayers = () => Object.values(state.players).filter(p => !p.eliminated);

function broadcastLobby() {
  io.emit('lobby_update', {
    players: Object.values(state.players).map(p => ({ id: p.id, name: p.name })),
  });
}

function emitToHost(event, data) {
  if (state.hostSocketId) io.to(state.hostSocketId).emit(event, data);
}

function broadcastSubmissions() {
  const submitted = Object.values(state.answers).filter(a => a.time !== null).length;
  const total = activePlayers().length;
  emitToHost('submissions_update', { submitted, total });
}

function startRound() {
  state.round++;
  state.answers = {};

  const pool = shuffle(ITEMS);
  state.refItems = pool.slice(0, REF_COUNT);
  state.carouselItems = shuffle([
    ...state.refItems,
    ...pool.slice(REF_COUNT, REF_COUNT + DISTRACTOR_COUNT),
  ]);

  activePlayers().forEach(p => {
    state.answers[p.id] = { selected: [], time: null };
  });

  const phase1Duration = state.refItems.length * PHASE1_ITEM_DURATION;

  state.phase = 'phase1';
  io.emit('phase1_start', {
    items: state.refItems,
    itemDuration: PHASE1_ITEM_DURATION,
    round: state.round,
  });

  setTimeout(() => {
    io.emit('phase1_hide');
    setTimeout(startPhase2, 1500);
  }, phase1Duration);
}

function startPhase2() {
  state.phase = 'phase2';
  state.phase2StartTime = Date.now();

  io.emit('phase2_start', {
    items: state.carouselItems,
    totalDuration: PHASE2_DURATION,
  });

  state.phase2Timer = setTimeout(endRound, PHASE2_DURATION);
}

function endRound() {
  if (state.phase !== 'phase2') return;
  state.phase = 'results';

  const refSet = new Set(state.refItems);
  const duration = PHASE2_DURATION;

  const scores = activePlayers().map(p => {
    const ans = state.answers[p.id] || { selected: [], time: null };
    const sel = new Set(ans.selected);

    const truePositives  = state.refItems.filter(item => sel.has(item)).length;
    const falsePositives = [...sel].filter(item => !refSet.has(item)).length;
    const accuracy       = truePositives / state.refItems.length;
    const elapsed        = ans.time ? ans.time - state.phase2StartTime : duration;
    const speedBonus     = Math.max(0, 1 - elapsed / duration) * POINTS_SPEED;
    const score          = Math.max(0, Math.round(
      truePositives * POINTS_CORRECT - falsePositives * POINTS_PENALTY + speedBonus
    ));

    return { player: p, accuracy, score, elapsed };
  });

  scores.sort((a, b) => a.score - b.score || b.elapsed - a.elapsed);
  scores.forEach(s => { state.players[s.player.id].totalScore += s.score; });

  let eliminated = null;
  if (scores.length > 1) {
    const loser = scores[0].player;
    state.players[loser.id].eliminated = true;
    eliminated = loser.name;
  }

  const remaining = activePlayers();
  const winner = remaining.length === 1 ? remaining[0].name : null;
  if (winner) state.phase = 'gameover';

  io.emit('round_results', {
    round: state.round,
    refItems: state.refItems,
    scores: scores.map(s => ({
      name: s.player.name,
      accuracy: Math.round(s.accuracy * 100),
      roundScore: s.score,
      totalScore: state.players[s.player.id].totalScore,
      eliminated: state.players[s.player.id].eliminated,
    })),
    eliminated,
    winner,
  });
}

function resetGame() {
  if (state.phase2Timer) { clearTimeout(state.phase2Timer); state.phase2Timer = null; }
  Object.values(state.players).forEach(p => { p.eliminated = false; p.totalScore = 0; });
  state.phase = 'lobby';
  state.round = 0;
  state.answers = {};
  broadcastLobby();
}

function handleDisconnectDuringGame() {
  const active = activePlayers();
  if (active.length === 1 && state.phase !== 'gameover' && state.phase !== 'lobby') {
    if (state.phase2Timer) { clearTimeout(state.phase2Timer); state.phase2Timer = null; }
    state.phase = 'gameover';
    io.emit('round_results', {
      round: state.round,
      refItems: state.refItems || [],
      scores: active.map(p => ({
        name: p.name,
        accuracy: 100,
        roundScore: 0,
        totalScore: p.totalScore,
        eliminated: false,
      })),
      eliminated: null,
      winner: active[0].name,
    });
  } else if (active.length === 0) {
    resetGame();
    io.emit('game_reset');
  }
}

io.on('connection', socket => {
  console.log('+ connected:', socket.id);

  // ── host ──────────────────────────────────────────────────────────────────

  socket.on('join_host', () => {
    state.hostSocketId = socket.id;
    console.log('  host connected:', socket.id);
    // send current state snapshot so host syncs on reconnect
    socket.emit('host_state', {
      phase: state.phase,
      round: state.round,
      players: Object.values(state.players).map(p => ({ id: p.id, name: p.name, eliminated: p.eliminated })),
    });
  });

  socket.on('start_game', () => {
    if (socket.id !== state.hostSocketId || state.phase !== 'lobby') return;
    if (activePlayers().length < 2) {
      socket.emit('host_error', 'Need at least 2 players to start');
      return;
    }
    startRound();
  });

  socket.on('next_round', () => {
    if (socket.id !== state.hostSocketId || state.phase !== 'results') return;
    startRound();
  });

  socket.on('play_again', () => {
    if (socket.id !== state.hostSocketId) return;
    resetGame();
    io.emit('game_reset');
  });

  // ── players ───────────────────────────────────────────────────────────────

  socket.on('join', ({ name }) => {
    if (state.phase !== 'lobby') {
      socket.emit('join_error', 'Game already in progress');
      return;
    }
    const trimmed = String(name || '').trim().slice(0, 20);
    if (!trimmed) return;

    state.players[socket.id] = { id: socket.id, name: trimmed, eliminated: false, totalScore: 0 };
    socket.emit('joined', { id: socket.id });
    broadcastLobby();
  });

  socket.on('submit_selection', ({ selected }) => {
    if (state.phase !== 'phase2') return;
    const p = state.players[socket.id];
    if (!p || p.eliminated || !state.answers[socket.id] || state.answers[socket.id].time) return;
    state.answers[socket.id] = {
      selected: Array.isArray(selected) ? selected : [],
      time: Date.now(),
    };
    broadcastSubmissions();
  });

  // ── disconnect ────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log('- disconnected:', socket.id);

    if (socket.id === state.hostSocketId) {
      state.hostSocketId = null;
      console.log('  host disconnected');
      return;
    }

    if (!state.players[socket.id]) return;
    delete state.players[socket.id];

    if (state.phase === 'lobby') {
      broadcastLobby();
    } else {
      handleDisconnectDuringGame();
    }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯 SpotIt! server running`);
  console.log(`   Host panel: http://localhost:${PORT}/host`);
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   Players:    http://${net.address}:${PORT}  ← share with players`);
      }
    }
  }
  console.log('');
});
