const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

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
const PHASE1_DURATION = 5000;
const PHASE2_ITEM_DURATION = 2000;
const PHASE2_BUFFER = 2000;

const state = {
  phase: 'lobby',
  players: {},
  hostId: null,
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
    hostId: state.hostId,
  });
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

  state.phase = 'phase1';
  io.emit('phase1_start', {
    items: state.refItems,
    duration: PHASE1_DURATION,
    round: state.round,
  });

  setTimeout(() => {
    io.emit('phase1_hide');
    setTimeout(startPhase2, 1500);
  }, PHASE1_DURATION);
}

function startPhase2() {
  state.phase = 'phase2';
  state.phase2StartTime = Date.now();
  const totalDuration = state.carouselItems.length * PHASE2_ITEM_DURATION + PHASE2_BUFFER;

  io.emit('phase2_start', {
    items: state.carouselItems,
    itemDuration: PHASE2_ITEM_DURATION,
    totalDuration,
  });

  state.phase2Timer = setTimeout(endRound, totalDuration);
}

function endRound() {
  if (state.phase !== 'phase2') return;
  state.phase = 'results';

  const refSet = new Set(state.refItems);
  const total = state.carouselItems.length;
  const duration = total * PHASE2_ITEM_DURATION + PHASE2_BUFFER;

  const scores = activePlayers().map(p => {
    const ans = state.answers[p.id] || { selected: [], time: null };
    const sel = new Set(ans.selected);

    const correct = state.carouselItems.filter(item => refSet.has(item) === sel.has(item)).length;
    const accuracy = correct / total;
    const elapsed = ans.time ? ans.time - state.phase2StartTime : duration;
    const speedBonus = Math.max(0, 1 - elapsed / duration);
    const score = Math.round(accuracy * 100 + speedBonus * 50);

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

  socket.on('join', ({ name }) => {
    if (state.phase !== 'lobby') {
      socket.emit('join_error', 'Game already in progress');
      return;
    }
    const trimmed = String(name || '').trim().slice(0, 20);
    if (!trimmed) return;

    state.players[socket.id] = { id: socket.id, name: trimmed, eliminated: false, totalScore: 0 };
    if (!state.hostId) state.hostId = socket.id;

    socket.emit('joined', { id: socket.id });
    broadcastLobby();
  });

  socket.on('start_game', () => {
    if (socket.id !== state.hostId || state.phase !== 'lobby') return;
    if (activePlayers().length < 2) {
      socket.emit('join_error', 'Need at least 2 players to start');
      return;
    }
    startRound();
  });

  socket.on('submit_selection', ({ selected }) => {
    if (state.phase !== 'phase2') return;
    const p = state.players[socket.id];
    if (!p || p.eliminated || !state.answers[socket.id] || state.answers[socket.id].time) return;
    state.answers[socket.id] = {
      selected: Array.isArray(selected) ? selected : [],
      time: Date.now(),
    };
  });

  socket.on('next_round', () => {
    if (socket.id !== state.hostId || state.phase !== 'results') return;
    startRound();
  });

  socket.on('play_again', () => {
    if (socket.id !== state.hostId) return;
    resetGame();
    io.emit('game_reset');
  });

  socket.on('disconnect', () => {
    console.log('- disconnected:', socket.id);
    if (!state.players[socket.id]) return;
    delete state.players[socket.id];

    if (state.hostId === socket.id) {
      const remaining = Object.keys(state.players);
      state.hostId = remaining.length > 0 ? remaining[0] : null;
    }

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
  console.log(`   Local:   http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   Network: http://${net.address}:${PORT}  ← share this with players`);
      }
    }
  }
  console.log('');
});
