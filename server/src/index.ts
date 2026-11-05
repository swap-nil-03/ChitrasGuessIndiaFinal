import express from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import http from 'node:http';
import { Server, Socket } from 'socket.io';
import { randomInt } from 'node:crypto';
import { db, saveRoom, savePlayer, saveRound, saveGuess, updateRoundAnswer, scorePlayer, deletePlayer, deleteRoom } from './db.js';
import { WORDS, maskWord, isCorrectAnswer } from './words.js';

const app = express();
app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',').map((v) => v.trim()).filter(Boolean);
function isAllowedOrigin(origin?: string) {
  if (!origin) return true; // native clients and same-origin health checks
  if (configuredOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    return ['localhost', '127.0.0.1'].includes(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
  } catch { return false; }
}
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(isAllowedOrigin(origin) ? null : new Error('Origin not allowed'), isAllowedOrigin(origin));
  },
  methods: ['GET', 'POST'],
};
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '16kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', app: 'ChitraGuess India' }));
app.get('/api/health', (_req, res) => res.status(200).json({ ok: true, service: 'ChitraGuess India', time: new Date().toISOString() }));
app.get('/api/categories', (_req, res) => res.json(Object.keys(WORDS)));
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: 'Invalid request.' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 16 * 1024,
  connectionStateRecovery: { maxDisconnectionDuration: 120_000, skipMiddlewares: true },
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

type Player = { id: string; name: string; score: number; isDrawer?: boolean; guessed?: boolean; language: string };
type Room = {
  code: string; public: boolean; players: Player[];
  phase: 'waiting' | 'choosing' | 'drawing' | 'finished';
  round: number; maxRounds: number; drawerId: string | null; answer: string;
  category: string; secondsLeft: number; timer?: NodeJS.Timeout; hint?: string;
  roundId: number; categories: string[]; guessed: Set<string>; hintIndexes: number[]; strokes: Record<string, unknown>[]; redoStrokes: Record<string, unknown>[]; choices: string[]; recentAnswers: string[];
};
const rooms = new Map<string, Room>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const RECONNECT_GRACE_MS = 90_000;
const MAX_PLAYERS = 8;
const MAX_ROOMS = 500;
const ROUND_SECONDS = 120;
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRoomCode() {
  let value = '';
  do {
    value = Array.from({ length: 7 }, () => ROOM_CHARS[randomInt(ROOM_CHARS.length)]).join('');
  } while (rooms.has(value));
  return value;
}
function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
function safeName(value: unknown) {
  return String(value ?? 'Player').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 18) || 'Player';
}
function safeLanguage(value: unknown) {
  return ['English', 'Hindi', 'Marathi'].includes(String(value)) ? String(value) : 'English';
}
function safeCategories(value: unknown) {
  if (!Array.isArray(value)) return Object.keys(WORDS);
  const selected = value.filter((v): v is string => typeof v === 'string' && Object.prototype.hasOwnProperty.call(WORDS, v)).slice(0, Object.keys(WORDS).length);
  return selected.length ? [...new Set(selected)] : Object.keys(WORDS);
}
function roomFor(socket: Socket) {
  const code = (socket.data.roomCode || '') as string;
  return rooms.get(code);
}
function publicState(r: Room) {
  return {
    code: r.code, public: r.public,
    players: r.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isDrawer: p.id === r.drawerId, guessed: r.guessed.has(p.id) })),
    phase: r.phase, round: r.round, maxRounds: r.maxRounds, drawerId: r.drawerId,
    maskedWord: r.phase === 'drawing' ? maskWord(r.answer) : '', category: r.category,
    secondsLeft: r.secondsLeft, hint: r.hint,
  };
}
function update(r: Room) { io.to(r.code).emit('room:update', publicState(r)); }
function chat(r: Room, text: string, kind = '') { io.to(r.code).emit('chat:message', { text, kind }); }
function stopTimer(r: Room) { if (r.timer) clearInterval(r.timer); r.timer = undefined; }
function cleanRoom(r: Room) { stopTimer(r); rooms.delete(r.code); deleteRoom(r.code); }
function startRound(r: Room) {
  stopTimer(r);
  if (r.round >= r.maxRounds) { r.phase = 'finished'; r.drawerId = null; update(r); return; }
  r.round++; r.guessed.clear(); r.hint = undefined; r.hintIndexes = []; r.strokes = []; r.redoStrokes = []; r.choices = [];
  for (const p of r.players) p.guessed = false;
  const drawer = r.players[(r.round - 1) % r.players.length];
  if (!drawer) { r.phase = 'finished'; update(r); return; }
  r.drawerId = drawer.id;
  const cat = r.categories[randomInt(r.categories.length)] || Object.keys(WORDS)[0];
  const list = WORDS[cat];
  const fresh = list.filter((word) => !(r.recentAnswers || []).includes(`${cat}::${word}`));
  const answerPool = fresh.length ? fresh : list;
  r.answer = answerPool[randomInt(answerPool.length)];
  r.recentAnswers = [...(r.recentAnswers || []), `${cat}::${r.answer}`].slice(-Math.min(30, list.length - 1)); r.category = cat; r.phase = 'choosing'; r.secondsLeft = ROUND_SECONDS;
  saveRound(r.code, r.round, cat, r.answer, drawer.id);
  const info = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
  r.roundId = info.id;
  const alternatives = list.filter((w) => w !== r.answer);
  for (let i = alternatives.length - 1; i > 0; i--) { const j = randomInt(i + 1); [alternatives[i], alternatives[j]] = [alternatives[j], alternatives[i]]; }
  r.choices = [r.answer, ...alternatives.slice(0, 2)];
  io.to(drawer.id).emit('round:words', r.choices);
  chat(r, `Round ${r.round}: ${drawer.name} is choosing a word.`, 'system'); update(r);
  setTimeout(() => { if (r.phase === 'choosing' && r.drawerId === drawer.id) beginDrawing(r); }, 12_000);
}
function beginDrawing(r: Room) {
  if (r.phase !== 'choosing') return;
  r.phase = 'drawing'; r.secondsLeft = ROUND_SECONDS; update(r);
  chat(r, `${r.players.find((p) => p.id === r.drawerId)?.name} is drawing!`, 'system');
  r.timer = setInterval(() => {
    r.secondsLeft--;
    // Give players time to observe the drawing before revealing limited clues.
    if (r.secondsLeft === 65 || r.secondsLeft === 35) {
      const candidates = [...r.answer].map((char, index) => ({ char, index }))
        .filter(({ char, index }) => /[\p{L}\p{N}]/u.test(char) && !r.hintIndexes.includes(index));
      const maxReveal = Math.max(0, [...r.answer].filter((c) => /[\p{L}\p{N}]/u.test(c)).length - 1);
      if (candidates.length && r.hintIndexes.length < maxReveal) {
        const chosen = candidates[randomInt(candidates.length)];
        r.hintIndexes.push(chosen.index);
        r.hint = [...r.answer].map((char, index) => /[\p{L}\p{N}]/u.test(char)
          ? (r.hintIndexes.includes(index) ? char : '_') : char).join('');
        update(r);
      }
    }
    if (r.secondsLeft <= 0) {
      stopTimer(r); chat(r, `Time is up! The word was: ${r.answer}`, 'system');
      setTimeout(() => { if (rooms.has(r.code)) startRound(r); }, 1800);
    } else update(r);
  }, 1000);
}
function addPlayer(r: Room, s: Socket, name: string, language = 'English') {
  if (s.data.roomCode) throw new Error('You are already in a room. Leave it before joining another.');
  if (r.phase !== 'waiting') throw new Error('This game has already started. Join another room.');
  if (r.players.length >= MAX_PLAYERS) throw new Error('Room is full (maximum 8 players).');
  const p: Player = { id: s.id, name: safeName(name), score: 0, language: safeLanguage(language) };
  r.players.push(p); s.data.roomCode = r.code; s.join(r.code); savePlayer(s.id, r.code, p.name); update(r);
}

// Per-socket event throttling. Drawing allows a higher rate than chat or room actions.
io.use((socket, next) => {
  if (!isAllowedOrigin(socket.handshake.headers.origin)) return next(new Error('Origin not allowed'));
  socket.data.eventWindows = new Map<string, { start: number; count: number }>();
  next();
});
io.on('connection', (s) => {
  if (s.recovered) {
    const pending = disconnectTimers.get(s.id);
    if (pending) clearTimeout(pending);
    disconnectTimers.delete(s.id);
  }
  s.use(([event, payload], next) => {
    const limits: Record<string, { count: number; ms: number; bytes: number }> = {
      'draw:stroke': { count: 90, ms: 1000, bytes: 2048 },
      'chat:guess': { count: 6, ms: 5000, bytes: 512 },
      'match:public': { count: 4, ms: 10_000, bytes: 4096 },
      'room:create': { count: 4, ms: 10_000, bytes: 4096 },
      'room:join': { count: 8, ms: 10_000, bytes: 1024 },
      'game:start': { count: 4, ms: 10_000, bytes: 128 },
      'round:choose': { count: 5, ms: 10_000, bytes: 512 },
      'draw:clear': { count: 10, ms: 10_000, bytes: 128 },
      'draw:undo': { count: 40, ms: 10_000, bytes: 128 },
      'draw:redo': { count: 40, ms: 10_000, bytes: 128 },
      'room:leave': { count: 10, ms: 10_000, bytes: 128 },
    };
    const rule = limits[String(event)];
    if (!rule) return next(new Error('Unsupported event'));
    let bytes = 0;
    try { bytes = Buffer.byteLength(JSON.stringify(payload ?? null)); } catch { return next(new Error('Invalid payload')); }
    if (bytes > rule.bytes) return next(new Error('Payload too large'));
    const windows = s.data.eventWindows as Map<string, { start: number; count: number }>;
    const now = Date.now(); const current = windows.get(String(event));
    if (!current || now - current.start >= rule.ms) windows.set(String(event), { start: now, count: 1 });
    else {
      current.count++;
      if (current.count > rule.count) return next(new Error('Too many requests. Please slow down.'));
    }
    next();
  });

  if (s.recovered) {
    const recoveredRoom = roomFor(s);
    if (recoveredRoom) {
      s.emit('room:update', publicState(recoveredRoom));
      setTimeout(() => {
        if (!s.connected) return;
        s.emit('round:history', recoveredRoom.strokes);
        if (recoveredRoom.drawerId === s.id && recoveredRoom.phase === 'choosing') s.emit('round:words', recoveredRoom.choices);
      }, 100);
    }
  }

  s.on('match:public', (raw) => {
    try {
      if (s.data.roomCode) throw new Error('You are already in a room. Leave it before joining another.');
      const data = asObject(raw); const categories = safeCategories(data.categories);
      let r = [...rooms.values()].find((x) => x.public && x.phase === 'waiting' && x.players.length < MAX_PLAYERS && x.categories.some((c) => categories.includes(c)));
      if (!r) {
        if (rooms.size >= MAX_ROOMS) throw new Error('Game is busy. Please try again shortly.');
        r = { code: makeRoomCode(), public: true, players: [], phase: 'waiting', round: 0, maxRounds: 4, drawerId: null, answer: '', category: '', secondsLeft: 0, roundId: 0, categories, guessed: new Set(), hintIndexes: [], strokes: [], redoStrokes: [], choices: [], recentAnswers: [] };
        rooms.set(r.code, r); saveRoom(r.code, true);
      }
      addPlayer(r, s, safeName(data.name), safeLanguage(data.language)); chat(r, `${safeName(data.name)} joined the room.`, 'system');
    } catch (e) { s.emit('room:error', (e as Error).message); }
  });
  s.on('room:create', (raw) => {
    try {
      if (s.data.roomCode) throw new Error('You are already in a room. Leave it before joining another.');
      if (rooms.size >= MAX_ROOMS) throw new Error('Game is busy. Please try again shortly.');
      const data = asObject(raw); const r: Room = { code: makeRoomCode(), public: false, players: [], phase: 'waiting', round: 0, maxRounds: 4, drawerId: null, answer: '', category: '', secondsLeft: 0, roundId: 0, categories: safeCategories(data.categories), guessed: new Set(), hintIndexes: [], strokes: [], redoStrokes: [], choices: [], recentAnswers: [] };
      rooms.set(r.code, r); saveRoom(r.code, false); addPlayer(r, s, safeName(data.name), safeLanguage(data.language)); chat(r, `Private room created. Share code ${r.code}.`, 'system');
    } catch (e) { s.emit('room:error', (e as Error).message); }
  });
  s.on('room:join', (raw) => {
    const data = asObject(raw); const roomCode = String(data.code || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 7);
    const r = rooms.get(roomCode);
    if (!r) { s.emit('room:error', 'Room not found. Check the code.'); return; }
    try { addPlayer(r, s, safeName(data.name), safeLanguage(data.language)); chat(r, `${safeName(data.name)} joined.`, 'system'); }
    catch (e) { s.emit('room:error', (e as Error).message); }
  });
  s.on('game:start', (raw) => {
    const r = roomFor(s);
    if (!r || r.players[0]?.id !== s.id || r.players.length < 2 || !['waiting', 'finished'].includes(r.phase)) return;
    const data = asObject(raw);
    const requestedRounds = Number(data.maxRounds);
    r.maxRounds = Number.isInteger(requestedRounds) && requestedRounds >= 1 && requestedRounds <= 10 ? requestedRounds : 4;
    r.players.forEach((p) => { p.score = 0; scoreReset(p.id); }); r.round = 0; r.phase = 'waiting'; r.recentAnswers = [];
    io.to(r.code).emit('game:reset-chat'); startRound(r);
  });
  s.on('round:choose', (raw) => {
    const data = asObject(raw); const r = roomFor(s);
    if (!r || r.drawerId !== s.id || r.phase !== 'choosing' || typeof data.word !== 'string' || !WORDS[r.category].includes(data.word)) return;
    r.answer = data.word; r.choices = []; updateRoundAnswer(r.roundId, r.answer); s.emit('round:chosen', r.answer); beginDrawing(r);
  });
  s.on('draw:stroke', (raw) => {
    const st = asObject(raw); const r = roomFor(s);
    if (!r || r.drawerId !== s.id || r.phase !== 'drawing') return;
    const numeric = ['x0', 'y0', 'x1', 'y1', 'size'].every((k) => typeof st[k] === 'number' && Number.isFinite(st[k]));
    if (!numeric) return;
    const valid = {
      x0: clamp(st.x0), y0: clamp(st.y0), x1: clamp(st.x1), y1: clamp(st.y1),
      color: typeof st.color === 'string' && /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : '#201a36',
      size: Math.max(1, Math.min(24, st.size)),
    };
    r.strokes.push(valid); r.redoStrokes = [];
    // Keep a larger bounded drawing history so undo/redo can traverse many more actions.
    if (r.strokes.length > 15000) r.strokes.splice(0, r.strokes.length - 15000);
    s.to(r.code).emit('draw:stroke', valid);
  });
  s.on('draw:clear', () => { const r = roomFor(s); if (r && r.drawerId === s.id && r.phase === 'drawing') { r.strokes = []; r.redoStrokes = []; io.to(r.code).emit('round:clear'); } });
  s.on('draw:undo', () => { const r = roomFor(s); if (!r || r.drawerId !== s.id || r.phase !== 'drawing' || !r.strokes.length) return; const item = r.strokes.pop()!; r.redoStrokes.push(item); io.to(r.code).emit('draw:state', r.strokes); });
  s.on('draw:redo', () => { const r = roomFor(s); if (!r || r.drawerId !== s.id || r.phase !== 'drawing' || !r.redoStrokes.length) return; r.strokes.push(r.redoStrokes.pop()!); io.to(r.code).emit('draw:state', r.strokes); });
  s.on('chat:guess', (raw) => {
    const data = asObject(raw); const r = roomFor(s);
    if (!r || r.phase !== 'drawing' || s.id === r.drawerId || r.guessed.has(s.id) || typeof data.text !== 'string') return;
    const text = data.text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80).trim();
    if (!text) return;
    const correct = isCorrectAnswer(text, r.answer);
    if (correct) {
      r.guessed.add(s.id); const p = r.players.find((x) => x.id === s.id); if (!p) return;
      // Every player who submits an accepted English/Hindi/Marathi answer scores once.
      const points = 100 + Math.max(0, Math.floor(r.secondsLeft / 2)); p.score += points; scorePlayer(p.id, points);
      // The drawer also earns a small teamwork bonus for each correct guess.
      const drawer = r.players.find((x) => x.id === r.drawerId); if (drawer) { drawer.score += 25; scorePlayer(drawer.id, 25); }
      chat(r, `${p.name} guessed correctly! +${points} points`, 'correct'); update(r);
      if (r.guessed.size >= r.players.length - 1) { stopTimer(r); chat(r, `Everyone guessed it! The word was ${r.answer}.`, 'system'); setTimeout(() => { if (rooms.has(r.code)) startRound(r); }, 1800); }
    } else chat(r, `${r.players.find((p) => p.id === s.id)?.name || 'Player'}: ${text}`);
    saveGuess(r.roundId, s.id, text, correct);
  });
  s.on('room:leave', () => {
    const pending = disconnectTimers.get(s.id); if (pending) clearTimeout(pending); disconnectTimers.delete(s.id);
    const r = roomFor(s); if (!r) return;
    r.players = r.players.filter((p) => p.id !== s.id); deletePlayer(s.id); s.leave(r.code); s.data.roomCode = undefined;
    if (!r.players.length) cleanRoom(r);
    else { if (r.drawerId === s.id) { stopTimer(r); chat(r, 'Drawer left. Moving to next round.', 'system'); startRound(r); } update(r); }
  });
  // WebRTC mesh voice signalling. Media stays peer-to-peer; this server only relays SDP/ICE.
  s.on('voice:join', () => {
    const r = roomFor(s); if (!r) return;
    const peers = r.players.filter((p) => p.id !== s.id).map((p) => ({ id: p.id, name: p.name }));
    s.emit('voice:peers', { peers, hostId: r.players[0]?.id || null });
    s.to(r.code).emit('voice:peer-joined', { id: s.id, name: r.players.find((p) => p.id === s.id)?.name || 'Player' });
  });
  s.on('voice:signal', (raw) => {
    const r = roomFor(s); const data = asObject(raw);
    if (!r || typeof data.to !== 'string' || !r.players.some((p) => p.id === data.to) || !data.signal) return;
    io.to(data.to).emit('voice:signal', { from: s.id, signal: data.signal });
  });
  s.on('voice:leave', () => {
    const r = roomFor(s); if (r) s.to(r.code).emit('voice:peer-left', { id: s.id });
  });
  s.on('voice:host-mute', (raw) => {
    const r = roomFor(s); const data = asObject(raw);
    if (!r || r.players[0]?.id !== s.id || typeof data.target !== 'string' || !r.players.some((p) => p.id === data.target)) return;
    io.to(data.target).emit('voice:forced-mute', { muted: Boolean(data.muted), by: s.id });
  });
  s.on('disconnect', () => {
    const r = roomFor(s); if (!r) return;
    s.to(r.code).emit('voice:peer-left', { id: s.id });
    // Keep the player/room alive briefly so mobile browser back, network changes,
    // and short Wi-Fi drops do not destroy the host's game immediately.
    const old = disconnectTimers.get(s.id);
    if (old) clearTimeout(old);
    const roomCode = r.code;
    const timer = setTimeout(() => {
      disconnectTimers.delete(s.id);
      const current = rooms.get(roomCode);
      if (!current) return;
      current.players = current.players.filter((p) => p.id !== s.id);
      deletePlayer(s.id);
      if (!current.players.length) cleanRoom(current);
      else {
        if (current.drawerId === s.id) {
          stopTimer(current);
          chat(current, 'The drawer disconnected. Moving to the next round.', 'system');
          startRound(current);
        }
        update(current);
      }
    }, RECONNECT_GRACE_MS);
    disconnectTimers.set(s.id, timer);
  });
});
function clamp(n: number) { return Math.max(0, Math.min(1, n)); }
function scoreReset(id: string) { db.prepare('UPDATE players SET score=0 WHERE id=?').run(id); }
const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, '0.0.0.0', () => console.log(`ChitraGuess API/socket listening on ${PORT}`));
