import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Use the same hostname as the frontend during LAN testing. Set VITE_SERVER_URL on hosting.
const SERVER = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;
const categories = [
  'Everyday Objects', 'Bollywood Movies', 'Marathi Movies', 'Bollywood Songs', 'Marathi Songs',
  'Indian States & Culture', 'Indian States & Cities', 'Indian Festivals', 'Indian Cricket'
];
const copy: Record<string, Record<string, string>> = {
  English: { play: 'Play public game', create: 'Create private room', join: 'Join room', name: 'Your nickname', code: 'Room code', category: 'Categories', players: 'Players', start: 'Start game', waiting: 'Waiting for players…', guess: 'Type your guess…', send: 'Send', round: 'Round', time: 'Time', leave: 'Leave room', public: 'Public matchmaking', private: 'Private room', connected: 'Connected', disconnected: 'Reconnecting…', hint: 'Hint', winner: 'Game over', again: 'Play again', share: 'Share room', copy: 'Copy code', copied: 'Room code copied', backNotice: 'Your game is still active. Use Leave room to exit.' },
  Hindi: { play: 'पब्लिक गेम खेलें', create: 'प्राइवेट रूम बनाएँ', join: 'रूम में जुड़ें', name: 'आपका नाम', code: 'रूम कोड', category: 'श्रेणियाँ', players: 'खिलाड़ी', start: 'गेम शुरू करें', waiting: 'खिलाड़ियों का इंतज़ार…', guess: 'अपना जवाब लिखें…', send: 'भेजें', round: 'राउंड', time: 'समय', leave: 'रूम छोड़ें', public: 'पब्लिक मैच', private: 'प्राइवेट रूम', connected: 'कनेक्टेड', disconnected: 'फिर से कनेक्ट हो रहा है…', hint: 'संकेत', winner: 'गेम समाप्त', again: 'फिर खेलें', share: 'रूम शेयर करें', copy: 'कोड कॉपी', copied: 'रूम कोड कॉपी हुआ', backNotice: 'आपका गेम चालू है। बाहर निकलने के लिए रूम छोड़ें दबाएँ।' },
  Marathi: { play: 'पब्लिक गेम खेळा', create: 'खासगी रूम तयार करा', join: 'रूममध्ये सामील व्हा', name: 'तुमचे नाव', code: 'रूम कोड', category: 'प्रकार', players: 'खेळाडू', start: 'गेम सुरू करा', waiting: 'खेळाडूंची वाट पाहत आहे…', guess: 'तुमचा अंदाज लिहा…', send: 'पाठवा', round: 'फेरी', time: 'वेळ', leave: 'रूम सोडा', public: 'पब्लिक गेम', private: 'खासगी रूम', connected: 'जोडले गेले', disconnected: 'पुन्हा जोडत आहे…', hint: 'इशारा', winner: 'गेम संपला', again: 'पुन्हा खेळा', share: 'रूम शेअर करा', copy: 'कोड कॉपी', copied: 'रूम कोड कॉपी झाला', backNotice: 'तुमचा गेम सुरू आहे. बाहेर पडण्यासाठी रूम सोडा दाबा.' }
};

type Player = { id: string; name: string; score: number; isDrawer?: boolean; guessed?: boolean };
type RoomState = { code: string; players: Player[]; phase: string; round: number; maxRounds: number; drawerId: string | null; maskedWord: string; category: string; secondsLeft: number; hint?: string; public: boolean };
type Stroke = { x0: number; y0: number; x1: number; y1: number; color: string; size: number };

export default function App() {
  const [lang, setLang] = useState('English');
  const t = copy[lang];
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room') || '');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [socketId, setSocketId] = useState('');
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<{ text: string; kind?: string }[]>([]);
  const [guess, setGuess] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>(['Everyday Objects']);
  const [maxRounds, setMaxRounds] = useState(4);
  const [chosenWord, setChosenWord] = useState('');
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [brush, setBrush] = useState('#201a36');
  const [size, setSize] = useState(5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const localVoiceStream = useRef<MediaStream | null>(null);
  const voicePeers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [showMicPermissionDialog, setShowMicPermissionDialog] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(true);
  const [forceMuted, setForceMuted] = useState(false);
  const [voiceHostId, setVoiceHostId] = useState('');
  const [voicePeerNames, setVoicePeerNames] = useState<Record<string, string>>({});
  const isVoiceHost = !!room && room.players[0]?.id === socketId;

  const closeVoicePeer = (id: string) => { const pc = voicePeers.current.get(id); if (pc) pc.close(); voicePeers.current.delete(id); };
  const closeVoice = () => {
    voicePeers.current.forEach((pc) => pc.close()); voicePeers.current.clear();
    localVoiceStream.current?.getTracks().forEach((track) => track.stop()); localVoiceStream.current = null;
    setVoiceJoined(false); setVoiceMuted(true); setForceMuted(false); setVoicePeerNames({});
    socketRef.current?.emit('voice:leave');
  };
  const createVoicePeer = (peerId: string) => {
    if (!localVoiceStream.current || voicePeers.current.has(peerId)) return voicePeers.current.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    localVoiceStream.current.getTracks().forEach((track) => pc.addTrack(track, localVoiceStream.current!));
    pc.onicecandidate = (event) => { if (event.candidate) socketRef.current?.emit('voice:signal', { to: peerId, signal: { candidate: event.candidate } }); };
    pc.ontrack = (event) => { let audio = document.getElementById(`voice-${peerId}`) as HTMLAudioElement | null; if (!audio) { audio = document.createElement('audio'); audio.id = `voice-${peerId}`; audio.autoplay = true; audio.setAttribute('playsinline', 'true'); document.body.appendChild(audio); } audio.srcObject = event.streams[0]; void audio.play().catch(() => {}); };
    pc.onconnectionstatechange = () => { if (['failed','closed','disconnected'].includes(pc.connectionState)) { const audio = document.getElementById(`voice-${peerId}`); audio?.remove(); } };
    voicePeers.current.set(peerId, pc); return pc;
  };
  const joinVoice = async () => {
    setVoiceError('');
    if (!room || !connected) { showToast('Connect to the game server first.'); return; }
    if (!window.isSecureContext) {
      setVoiceError('Microphone access requires a secure website. Open ChitraGuess using its HTTPS Render URL (not an HTTP address or local IP).');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('This browser does not provide microphone access. Update your browser and check that you are using the HTTPS website.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      stream.getAudioTracks().forEach((track) => { track.enabled = false; });
      localVoiceStream.current = stream; setVoiceJoined(true); setVoiceMuted(true); setForceMuted(false); setVoiceError('');
      socketRef.current?.emit('voice:join');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        setVoiceError('Browser microphone permission is blocked. Use the site controls beside the address bar (or browser Settings → Site settings → Microphone), set this site to Allow, then return and try again.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setVoiceError('No microphone was found. Connect or enable a microphone, then try again.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setVoiceError('Your microphone is busy or unavailable. Close other apps using it (such as Teams, Zoom or Meet), then try again.');
      } else if (name === 'OverconstrainedError') {
        setVoiceError('The selected microphone does not support the requested audio settings. Check your microphone and try again.');
      } else {
        setVoiceError(`Could not access the microphone${name ? ` (${name})` : ''}. Check browser permissions and microphone settings, then try again.`);
      }
    }
  };
  const setMyVoiceMuted = (muted: boolean) => {
    if (forceMuted && !muted) return;
    localVoiceStream.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    setVoiceMuted(muted);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };
  const paintStroke = (stroke: Stroke, broadcast: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.x0 * canvas.width, stroke.y0 * canvas.height);
    ctx.lineTo(stroke.x1 * canvas.width, stroke.y1 * canvas.height);
    ctx.stroke();
    if (broadcast) socketRef.current?.emit('draw:stroke', stroke);
  };

  useEffect(() => {
    const s = io(SERVER, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
      timeout: 15000
    });
    socketRef.current = s;
    s.on('connect', () => { setConnected(true); setSocketId(s.id || ''); });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));
    s.on('room:update', (next: RoomState) => {
      setRoom((previous) => {
        if (previous && previous.round !== next.round) clearCanvas();
        return next;
      });
    });
    s.on('chat:message', (message: { text: string; kind?: string }) => {
      setMessages((old) => [...old, message].slice(-100));
      if (message.kind === 'correct') {
        // Short celebratory chime; browsers permit playback after the player's first interaction.
        try {
          const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextCtor) {
            const audio = new AudioContextCtor();
            [660, 880, 1100].forEach((frequency, index) => {
              const oscillator = audio.createOscillator();
              const gain = audio.createGain();
              oscillator.type = 'sine'; oscillator.frequency.value = frequency;
              gain.gain.setValueAtTime(0.0001, audio.currentTime + index * 0.11);
              gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + index * 0.11 + 0.025);
              gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + index * 0.11 + 0.20);
              oscillator.connect(gain); gain.connect(audio.destination);
              oscillator.start(audio.currentTime + index * 0.11);
              oscillator.stop(audio.currentTime + index * 0.11 + 0.22);
            });
            window.setTimeout(() => { void audio.close(); }, 900);
          }
        } catch { /* Audio is optional; correct-guess feedback remains visible. */ }
        showToast('🎉 Correct guess! Great job!');
      }
    });
    s.on('round:words', (choices: string[]) => { setWords(choices); setChosenWord(''); });
    s.on('round:chosen', (word: string) => setChosenWord(word));
    s.on('draw:state', (history: Stroke[]) => { setStrokes(history); clearCanvas(); history.forEach((stroke) => paintStroke(stroke, false)); });
    s.on('game:reset-chat', () => { setMessages([]); setGuess(''); setChosenWord(''); setWords([]); setStrokes([]); setUndoStack([]); setRedoStack([]); clearCanvas(); });
    s.on('round:clear', () => { clearCanvas(); setStrokes([]); setUndoStack([]); setRedoStack([]); });
    s.on('round:history', (history: Stroke[]) => { setStrokes(history); clearCanvas(); history.forEach((stroke) => paintStroke(stroke, false)); });
    s.on('draw:stroke', (stroke: Stroke) => paintStroke(stroke, false));
    s.on('game:toast', showToast);
    s.on('voice:peers', async ({ peers, hostId }: { peers: { id: string; name: string }[]; hostId: string }) => {
      setVoiceHostId(hostId || ''); setVoicePeerNames(Object.fromEntries(peers.map((p) => [p.id, p.name])));
      for (const peer of peers) {
        // One deterministic offerer per pair avoids simultaneous-offer glare.
        if ((s.id || '') < peer.id) {
          const pc = createVoicePeer(peer.id); if (!pc) continue;
          const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
          s.emit('voice:signal', { to: peer.id, signal: { description: pc.localDescription } });
        }
      }
    });
    s.on('voice:peer-joined', ({ id, name }: { id: string; name: string }) => {
      setVoicePeerNames((old) => ({ ...old, [id]: name }));
      if ((s.id || '') < id && localVoiceStream.current) {
        void (async () => { const pc = createVoicePeer(id); if (!pc) return; const offer = await pc.createOffer(); await pc.setLocalDescription(offer); s.emit('voice:signal', { to: id, signal: { description: pc.localDescription } }); })();
      }
    });
    s.on('voice:signal', ({ from, signal }: { from: string; signal: any }) => {
      void (async () => {
        const pc = createVoicePeer(from); if (!pc) return;
        if (signal.description) { await pc.setRemoteDescription(signal.description); if (signal.description.type === 'offer') { const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); s.emit('voice:signal', { to: from, signal: { description: pc.localDescription } }); } }
        if (signal.candidate) { try { await pc.addIceCandidate(signal.candidate); } catch { /* stale ICE candidate */ } }
      })().catch(() => {});
    });
    s.on('voice:peer-left', ({ id }: { id: string }) => { closeVoicePeer(id); document.getElementById(`voice-${id}`)?.remove(); setVoicePeerNames((old) => { const next = { ...old }; delete next[id]; return next; }); });
    s.on('voice:forced-mute', ({ muted }: { muted: boolean }) => { setForceMuted(muted); if (muted) setMyVoiceMuted(true); });
    s.on('room:error', setError);
    s.on('round:started', () => setMessages([]));
    return () => { voicePeers.current.forEach((pc) => pc.close()); localVoiceStream.current?.getTracks().forEach((track) => track.stop()); s.disconnect(); socketRef.current = null; };
  }, []);

  // Newest messages are rendered first, so keep the top of the chat in view.
  useEffect(() => {
    const panel = messagesRef.current;
    if (panel) panel.scrollTop = 0;
  }, [messages]);

  // Keep the active room on screen if the mobile browser's Back button is pressed accidentally.
  useEffect(() => {
    if (!room) return;
    const keepGameOpen = () => {
      window.history.pushState({ chitraGame: room.code }, '', window.location.href);
      showToast(t.backNotice);
    };
    const confirmExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.history.pushState({ chitraGame: room.code }, '', window.location.href);
    window.addEventListener('popstate', keepGameOpen);
    window.addEventListener('beforeunload', confirmExit);
    return () => {
      window.removeEventListener('popstate', keepGameOpen);
      window.removeEventListener('beforeunload', confirmExit);
    };
  }, [room?.code, t.backNotice]);

  const emit = (event: string, payload?: unknown) => { if (!connected) { showToast('Server is connecting. Please wait 10–15 seconds and try again.'); return; } socketRef.current?.emit(event, payload); };
  const enter = (mode: 'public' | 'private' | 'join') => {
    setError(''); setMessages([]);
    const nick = name.trim() || 'Player';
    if (mode === 'public') emit('match:public', { name: nick, language: lang, categories: selectedCats });
    if (mode === 'private') emit('room:create', { name: nick, language: lang, categories: selectedCats, public: false });
    if (mode === 'join') emit('room:join', { name: nick, code: roomCode.trim().toUpperCase(), language: lang });
  };
  const isDrawer = !!room && room.drawerId === socketId && room.phase === 'drawing';
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    drawing.current = true;
    const p = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    (event.currentTarget as HTMLCanvasElement & { lastPoint?: typeof p }).lastPoint = p;
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !isDrawer) return;
    const canvas = event.currentTarget as HTMLCanvasElement & { lastPoint?: { x: number; y: number } };
    const current = point(event);
    const previous = canvas.lastPoint || current;
    const stroke = { x0: previous.x, y0: previous.y, x1: current.x, y1: current.y, color: brush, size };
    setStrokes((old) => [...old, stroke]);
    paintStroke(stroke, true);
    canvas.lastPoint = current;
  };
  const up = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    delete (event.currentTarget as HTMLCanvasElement & { lastPoint?: unknown }).lastPoint;
  };
  const sendGuess = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (guess.trim()) { emit('chat:guess', { text: guess.trim() }); setGuess(''); }
  };
  const choose = (word: string) => { emit('round:choose', { word }); setChosenWord(word); setWords([]); };
  const undo = () => { if (!isDrawer || !strokes.length) return; emit('draw:undo'); };
  const redo = () => { if (!isDrawer) return; emit('draw:redo'); };
  const clearDrawing = () => { if (!isDrawer) return; emit('draw:clear'); };
  const leave = () => {
    emit('room:leave');
    setRoom(null); setMessages([]); setWords([]); clearCanvas();
    const url = new URL(window.location.href); url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  };
  const copyText = async (value: string) => {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; }
    const textarea = document.createElement('textarea');
    textarea.value = value; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
    document.body.appendChild(textarea); textarea.select();
    const copied = document.execCommand('copy'); textarea.remove();
    if (!copied) throw new Error('Clipboard unavailable');
  };
  const shareRoom = async () => {
    if (!room) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.code);
    const shareData = { title: 'Join my ChitraGuess India room', text: `Join my ChitraGuess India game. Room code: ${room.code}`, url: url.toString() };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await copyText(`${shareData.text}\n${shareData.url}`); showToast(t.copied); }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') showToast(`Room code: ${room.code}`);
    }
  };
  const copyCode = async () => {
    if (!room) return;
    try { await copyText(room.code); showToast(t.copied); }
    catch { showToast(`Room code: ${room.code}`); }
  };

  return <main className="app">
    <header className="topbar">
      <div className="brand"><span className="brandmark">चित्र</span><span>ChitraGuess <b>India</b></span></div>
      <div className="topright"><span className={connected ? 'online' : 'offline'}>● {connected ? t.connected : t.disconnected}</span><select value={lang} onChange={(event) => setLang(event.target.value)} aria-label="Language"><option>English</option><option>Hindi</option><option>Marathi</option></select></div>
    </header>
    {!room ? <section className="landing">
      <div className="hero"><div className="eyebrow">🇮🇳 THE INDIAN DRAW & GUESS PARTY</div><h1>Draw it. <em>Guess it.</em><br />India knows it!</h1><p>Bollywood, Marathi cinema, Indian cities, cricket, festivals and more. Bring your friends and let the doodle battles begin.</p><div className="hero-tags"><span>🎬 Bollywood</span><span>🎵 Marathi hits</span><span>🏙️ Indian cities</span><span>🪔 Festivals</span></div></div>
      <div className="join-card">
        <label>{t.name}</label><input value={name} maxLength={18} onChange={(event) => setName(event.target.value)} placeholder="e.g. MumbaiMaverick" />
        <label>{t.category}</label><div className="category-grid">{categories.map((category) => <button key={category} className={selectedCats.includes(category) ? 'cat active' : 'cat'} onClick={() => setSelectedCats((old) => old.includes(category) ? (old.length > 1 ? old.filter((item) => item !== category) : old) : [...old, category])}>{category}</button>)}</div>
        <div className="actions"><button className="primary" onClick={() => enter('public')}>⚡ {t.play}</button><button className="secondary" onClick={() => enter('private')}>＋ {t.create}</button></div>
        <div className="join-row"><input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={7} placeholder={t.code} /><button className="secondary" onClick={() => enter('join')}>{t.join}</button></div>
        <p className="fineprint">No account needed · 2–8 players · Free to play</p>{error && <p className="error">{error}</p>}
      </div>
    </section> : <section className="game">
      <div className="game-head">
        <div className="room-actions"><span className="pill">{room.public ? t.public : t.private}</span><strong>Room {room.code}</strong><button className="copy" onClick={copyCode}>{t.copy}</button><button className="copy share" onClick={shareRoom}>↗ {t.share}</button></div>
        <div className="round-meta">{t.round} {room.round}/{room.maxRounds} · {t.time} <b>{room.secondsLeft}s</b></div>
        <button className="leave" onClick={leave}>{t.leave}</button>
      </div>
      {room.phase === 'waiting' && room.players[0]?.id === socketId && <div className="mobile-start-bar"><label>Rounds <select value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}</select></label><button className="primary" disabled={room.players.length < 2} onClick={() => emit('game:start', { maxRounds })}>{t.start}</button></div>}
      <section className="voice-panel" aria-label="Voice chat">
        <strong>🎙️ Room voice chat</strong>
        {!voiceJoined ? <button className="secondary" onClick={() => { setVoiceError(''); setShowMicPermissionDialog(true); }}>Join voice (muted)</button> : <>
          <button className="secondary" onClick={() => setMyVoiceMuted(!voiceMuted)} disabled={forceMuted}>{voiceMuted ? '🔇 Unmute microphone' : '🎙️ Mute microphone'}</button>
          <button className="copy" onClick={closeVoice}>Leave voice</button>
          <span className="muted">{forceMuted ? 'Host has muted your microphone' : voiceMuted ? 'You are muted by default' : 'Your microphone is on'}</span>
        </>}
        {voiceError && <p className="error voice-error" role="alert">{voiceError}</p>}
        {showMicPermissionDialog && !voiceJoined && <div className="mic-permission-backdrop" role="dialog" aria-modal="true" aria-labelledby="mic-permission-title"><div className="mic-permission-modal"><div className="mic-permission-icon">🎙️</div><h3 id="mic-permission-title">Allow microphone for voice chat</h3><p>ChitraGuess needs microphone access so you can talk with players. Your microphone will stay muted when you join.</p><ol><li>Tap <b>Continue</b> below.</li><li>When your browser asks, choose <b>Allow</b>.</li><li>If no browser prompt appears, open the site controls beside the address bar and change Microphone to <b>Allow</b>.</li></ol><div className="mic-permission-actions"><button className="copy" onClick={() => setShowMicPermissionDialog(false)}>Cancel</button><button className="primary" onClick={() => { setShowMicPermissionDialog(false); void joinVoice(); }}>Continue</button></div></div></div>}
        {isVoiceHost && Object.entries(voicePeerNames).map(([id, peerName]) => <button key={id} className="copy" onClick={() => emit('voice:host-mute', { target: id, muted: true })}>Mute {peerName}</button>)}
      </section>
      <div className="game-layout">
        <aside className="players panel"><h3>{t.players} <span>{room.players.length}/8</span></h3>{room.players.map((player, index) => <div className="player" key={player.id}><div className="avatar">{['🦁', '🐯', '🦚', '🐘', '🐼', '🦊', '🐸', '🐵'][index % 8]}</div><div className="player-name">{player.name}{player.id === socketId ? ' (you)' : ''}{player.isDrawer ? ' ✏️' : ''}{player.guessed ? ' ✓' : ''}</div><b>{player.score}</b></div>)}
          {room.phase === 'waiting' && room.players[0]?.id === socketId && <div className="desktop-start-controls"><label className="round-select-label">Number of rounds <select value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}</select></label><button className="primary full" disabled={room.players.length < 2} onClick={() => emit('game:start', { maxRounds })}>{t.start}</button></div>}{room.phase === 'waiting' && <p className="muted">{t.waiting}</p>}
        </aside>
        <div className="board-column">
          <div className="wordbar"><span>{room.category || 'India Mix'}</span><strong>{isDrawer ? `Your word: ${chosenWord || words[0] || 'Choose a word'}` : room.maskedWord}</strong>{room.hint && !isDrawer && <small>{t.hint}: {room.hint}</small>}</div>
          {words.length > 0 && room.phase === 'choosing' && room.drawerId === socketId && <div className="word-choices">{words.map((word) => <button onClick={() => choose(word)} key={word}>{word}</button>)}</div>}
          <canvas ref={canvasRef} width={1000} height={600} className="canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          <div className="tools"><button onClick={undo} disabled={!isDrawer || !strokes.length}>↶ Undo</button><button onClick={redo} disabled={!isDrawer}>↷ Redo</button><button onClick={clearDrawing} disabled={!isDrawer}>Clear</button><button aria-label="Dark brush" onClick={() => setBrush('#201a36')} className="swatch dark" /><button aria-label="Red brush" onClick={() => setBrush('#e64d4d')} className="swatch red" /><button aria-label="Blue brush" onClick={() => setBrush('#2376d2')} className="swatch blue" /><button aria-label="Green brush" onClick={() => setBrush('#1c9b65')} className="swatch green" /><input aria-label="Brush size" type="range" min="2" max="18" value={size} onChange={(event) => setSize(Number(event.target.value))} /><button onClick={clearDrawing} disabled={!isDrawer}>Erase all</button></div>
        </div>
        <aside className="chat panel"><h3>💬 Live chat</h3><div className="messages" ref={messagesRef} aria-live="polite" aria-relevant="additions">{messages.slice().reverse().map((message, index) => <div key={`${messages.length}-${index}`} className={message.kind === 'correct' ? 'msg correct' : message.kind === 'system' ? 'msg system' : 'msg'}>{message.text}</div>)}</div><form onSubmit={sendGuess} className="chat-form desktop-guess-form"><input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={t.guess} disabled={isDrawer || room.phase !== 'drawing'} /><button className="primary" disabled={isDrawer || room.phase !== 'drawing'}>{t.send}</button></form></aside>
      </div>
      <form onSubmit={sendGuess} className="mobile-guess-dock"><input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={isDrawer ? 'You are drawing…' : t.guess} disabled={isDrawer || room.phase !== 'drawing'} /><button className="primary" disabled={isDrawer || room.phase !== 'drawing'}>{t.send}</button></form>
      {room.phase === 'finished' && <div className="result-backdrop" role="dialog" aria-modal="true" aria-label="Game results"><div className="result-modal"><div className="result-trophy">🏆</div><h2>{t.winner}</h2><p className="result-subtitle">{room.players.length ? `🏅 ${room.players.slice().sort((a, b) => b.score - a.score)[0].name} is the winner · Final leaderboard` : 'Final leaderboard'}</p><ol className="result-list">{room.players.slice().sort((a, b) => b.score - a.score).map((player) => <li key={player.id}><span>{player.name}{player.id === socketId ? ' (you)' : ''}</span><strong>{player.score} pts</strong></li>)}</ol><div className="result-actions">{room.players[0]?.id === socketId && <button className="primary" onClick={() => { setMessages([]); setGuess(''); clearCanvas(); emit('game:start', { maxRounds }); }}>{t.again}</button>}<button className="secondary" onClick={leave}>{t.leave === 'Leave room' ? 'Exit' : lang === 'Hindi' ? 'बाहर जाएँ' : lang === 'Marathi' ? 'बाहेर पडा' : 'Exit'}</button></div>{room.players[0]?.id !== socketId && <p className="result-wait">Waiting for the host to start another game.</p>}</div></div>}
      {toast && <div className="toast">{toast}</div>}{error && <div className="toast error-toast">{error}</div>}
    </section>}
    <footer>Made for India 🇮🇳 <span>ChitraGuess India · Community MVP</span></footer>
  </main>;
}
