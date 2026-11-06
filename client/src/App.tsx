import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SERVER = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;

const categories = [
  'Everyday Objects',
  'Bollywood Movies',
  'Marathi Movies',
  'Bollywood Songs',
  'Marathi Songs',
  'Indian States & Culture',
  'Indian States & Cities',
  'Indian Festivals',
  'Indian Cricket'
];

const copy: Record<string, Record<string, string>> = {
  English: { play: 'Play public game', create: 'Create private room', join: 'Join room', name: 'Your nickname', code: 'Room code', category: 'Categories', players: 'Players', start: 'Start game', waiting: 'Waiting for players…', guess: 'Type your guess…', send: 'Send', round: 'Round', time: 'Time', leave: 'Leave room', public: 'Public matchmaking', private: 'Private room', connected: 'Connected', disconnected: 'Reconnecting…', hint: 'Hint', winner: 'Game over', again: 'Play again', share: 'Share room', copy: 'Copy code', copied: 'Room code copied', backNotice: 'Your game is still active. Use Leave room to exit.' },
  Hindi: { play: 'पब्लिक गेम खेलें', create: 'प्राइवेट रूम बनाएँ', join: 'रूम में जुड़ें', name: 'आपका नाम', code: 'रूम कोड', category: 'श्रेणियाँ', players: 'खिलाड़ी', start: 'गेम शुरू करें', waiting: 'खिलाड़ियों का इंतज़ार…', guess: 'अपना जवाब लिखें…', send: 'भेजें', round: 'राउंड', time: 'समय', leave: 'रूम छोड़ें', public: 'पब्लिक मैच', private: 'प्राइवेट रूम', connected: 'कनेक्टेड', disconnected: 'फिर से कनेक्ट हो रहा है…', hint: 'संकेत', winner: 'गेम समाप्त', again: 'फिर खेलें', share: 'रूम शेयर करें', copy: 'कोड कॉपी', copied: 'रूम कोड कॉपी हुआ', backNotice: 'आपका गेम चालू है। बाहर निकलने के लिए रूम छोड़ें दबाएँ।' },
  Marathi: { play: 'पब्लिक गेम खेळा', create: 'खासगी रूम तयार करा', join: 'रूममध्ये सामील व्हा', name: 'तुमचे नाव', code: 'रूम कोड', category: 'प्रकार', players: 'खेळाडू', start: 'गेम सुरू करा', waiting: 'खेळाडूंची वाट पाहत आहे…', guess: 'तुमचा अंदाज लिहा…', send: 'पाठवा', round: 'फेरी', time: 'वेळ', leave: 'रूम सोडा', public: 'पब्लिक गेम', private: 'खासगी रूम', connected: 'जोडले गेले', disconnected: 'पुन्हा जोडत आहे…', hint: 'इशारा', winner: 'गेम संपला', again: 'पुन्हा खेळा', share: 'रूम शेअर करा', copy: 'कोड कॉपी', copied: 'रूम कोड कॉपी झाला', backNotice: 'तुमचा गेम सुरू आहे. बाहेर पडण्यासाठी रूम सोडा दाबा.' }
};

type Player = { id: string; name: string; score: number; isDrawer?: boolean; guessed?: boolean };
type RoomState = { code: string; players: Player[]; phase: string; round: number; maxRounds: number; drawerId: string | null; maskedWord: string; word?: string; category: string; secondsLeft: number; hint?: string; public: boolean };
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
  const [maxRounds, setMaxRounds] = useState<number>(4);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [brush, setBrush] = useState('#201a36');
  const [size, setSize] = useState(5);

  // WebRTC Audio Call States
  const [micEnabled, setMicEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const remoteAudioContainerRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  const showConnectionAlert = () => {
    if (!connected) {
      alert('Connecting to server... Please wait 10 to 15 seconds to connect to server.');
      return true;
    }
    return false;
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const redrawAll = (strokes: Stroke[]) => {
    clearCanvas();
    strokes.forEach((stroke) => paintStroke(stroke, false));
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
    if (broadcast) {
      socketRef.current?.emit('draw:stroke', stroke);
    }
  };

  // --- WEBRTC GROUP VOICE CHAT IMPLEMENTATION ---
  const initLocalAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      localStreamRef.current = stream;
      setMicEnabled(true);
      setIsMuted(false);
      showToast('Microphone activated! Group voice chat enabled.');

      // If already in a room with players, initiate connections to all current players
      if (room) {
        room.players.forEach((p) => {
          if (p.id !== socketRef.current?.id) {
            createPeerConnection(p.id, true);
          }
        });
      }
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      alert('Could not access microphone for Voice Chat. Please allow microphone permissions in browser.');
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const createPeerConnection = (targetSocketId: string, isInitiator: boolean) => {
    if (peerConnectionsRef.current[targetSocketId]) return peerConnectionsRef.current[targetSocketId];

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current[targetSocketId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('voice:candidate', { targetId: targetSocketId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      let audioEl = document.getElementById(`audio-${targetSocketId}`) as HTMLAudioElement;
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-${targetSocketId}`;
        audioEl.autoplay = true;
        audioEl.style.display = 'none';
        remoteAudioContainerRef.current?.appendChild(audioEl);
      }
      audioEl.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeerConnection(targetSocketId);
      }
    };

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socketRef.current?.emit('voice:offer', { targetId: targetSocketId, offer: pc.localDescription });
        })
        .catch((err) => console.error('Error creating offer:', err));
    }

    return pc;
  };

  const removePeerConnection = (targetSocketId: string) => {
    if (peerConnectionsRef.current[targetSocketId]) {
      peerConnectionsRef.current[targetSocketId].close();
      delete peerConnectionsRef.current[targetSocketId];
    }
    const audioEl = document.getElementById(`audio-${targetSocketId}`);
    if (audioEl) audioEl.remove();
  };

  const closeAllVoiceConnections = () => {
    Object.keys(peerConnectionsRef.current).forEach((id) => removePeerConnection(id));
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setMicEnabled(false);
  };
  // ----------------------------------------------

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
        if (previous && previous.round !== next.round) {
          clearCanvas();
          setHistory([]);
          setRedoStack([]);
        }
        return next;
      });
    });

    s.on('game:reset', () => {
      setMessages([]);
      clearCanvas();
      setHistory([]);
      setRedoStack([]);
    });

    s.on('chat:message', (message: { text: string; kind?: string }) => setMessages((old) => [...old, message].slice(-100)));
    s.on('round:words', (choices: string[]) => setWords(choices));
    s.on('round:clear', () => { clearCanvas(); setHistory([]); setRedoStack([]); });
    s.on('round:history', (hist: Stroke[]) => { setHistory(hist); redrawAll(hist); });
    s.on('draw:stroke', (stroke: Stroke) => { setHistory((prev) => [...prev, stroke]); paintStroke(stroke, false); });
    
    s.on('draw:undo', () => {
      setHistory((prev) => {
        const next = prev.slice(0, -1);
        redrawAll(next);
        return next;
      });
    });

    s.on('draw:redo', (stroke: Stroke) => {
      setHistory((prev) => {
        const next = [...prev, stroke];
        redrawAll(next);
        return next;
      });
    });

    // WebRTC Signaling Event Handlers
    s.on('voice:user-joined', ({ socketId: newUserId }) => {
      if (localStreamRef.current) {
        createPeerConnection(newUserId, true);
      }
    });

    s.on('voice:offer', async ({ senderId, offer }) => {
      const pc = createPeerConnection(senderId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit('voice:answer', { targetId: senderId, answer });
    });

    s.on('voice:answer', async ({ senderId, answer }) => {
      const pc = peerConnectionsRef.current[senderId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    s.on('voice:candidate', async ({ senderId, candidate }) => {
      const pc = peerConnectionsRef.current[senderId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding ice candidate:', e);
        }
      }
    });

    s.on('voice:user-left', ({ socketId: leftUserId }) => {
      removePeerConnection(leftUserId);
    });

    s.on('game:toast', showToast);
    s.on('room:error', setError);
    s.on('round:started', () => setMessages([]));

    return () => {
      closeAllVoiceConnections();
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const panel = messagesRef.current;
    if (panel) panel.scrollTop = 0;
  }, [messages]);

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

  const emit = (event: string, payload?: unknown) => {
    if (showConnectionAlert()) return;
    socketRef.current?.emit(event, payload);
  };

  const enter = (mode: 'public' | 'private' | 'join') => {
    if (showConnectionAlert()) return;
    setError(''); setMessages([]);
    const nick = name.trim();
    if (mode === 'public') emit('match:public', { name: nick, language: lang, categories: selectedCats, maxRounds });
    if (mode === 'private') emit('room:create', { name: nick, language: lang, categories: selectedCats, maxRounds, public: false });
    if (mode === 'join') emit('room:join', { name: nick, code: roomCode.trim().toUpperCase(), language: lang });
  };

  const handleUndo = () => {
    if (showConnectionAlert()) return;
    if (history.length === 0) return;
    const last = history[history.length - 1];
    const newHist = history.slice(0, -1);
    setHistory(newHist);
    setRedoStack((prev) => [...prev, last]);
    redrawAll(newHist);
    socketRef.current?.emit('draw:undo');
  };

  const handleRedo = () => {
    if (showConnectionAlert()) return;
    if (redoStack.length === 0) return;
    const nextStroke = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setHistory((prev) => [...prev, nextStroke]);
    paintStroke(nextStroke, false);
    socketRef.current?.emit('draw:redo', nextStroke);
  };

  const isDrawer = !!room && room.drawerId === socketId && room.phase === 'drawing';

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };

  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    if (showConnectionAlert()) return;
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
    const stroke: Stroke = { x0: previous.x, y0: previous.y, x1: current.x, y1: current.y, color: brush, size };
    setHistory((prev) => [...prev, stroke]);
    setRedoStack([]);
    paintStroke(stroke, true);
    canvas.lastPoint = current;
  };

  const up = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    delete (event.currentTarget as HTMLCanvasElement & { lastPoint?: unknown }).lastPoint;
  };

  const sendGuess = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (showConnectionAlert()) return;
    if (guess.trim()) { emit('chat:guess', { text: guess.trim() }); setGuess(''); }
  };

  const choose = (word: string) => {
    if (showConnectionAlert()) return;
    emit('round:choose', { word }); setWords([]);
  };

  const leave = () => {
    closeAllVoiceConnections();
    emit('room:leave');
    setRoom(null); setMessages([]); setWords([]); setHistory([]); setRedoStack([]); clearCanvas();
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
    {/* Hidden element container for remote peer voice audio elements */}
    <div ref={remoteAudioContainerRef} id="remote-audio-container" style={{ display: 'none' }} />

    <header className="topbar">
      <div className="brand"><span className="brandmark">चित्र</span><span>ChitraGuess <b>India</b></span></div>
      <div className="topright">
        <span className={connected ? 'online' : 'offline'}>● {connected ? t.connected : t.disconnected}</span>
        <select value={lang} onChange={(event) => setLang(event.target.value)} aria-label="Language">
          <option>English</option><option>Hindi</option><option>Marathi</option>
        </select>
      </div>
    </header>
    {!room ? <section className="landing">
      <div className="hero"><div className="eyebrow">🇮🇳 THE INDIAN DRAW & GUESS PARTY</div><h1>Draw it. <em>Guess it.</em><br />India knows it!</h1><p>Bollywood, Marathi cinema, Indian cities, cricket, festivals and more. Bring your friends and let the doodle battles begin.</p><div className="hero-tags"><span>🎬 Bollywood</span><span>🎵 Marathi hits</span><span>🏙️ Indian cities</span><span>🪔 Festivals</span></div></div>
      <div className="join-card">
        <label>{t.name}</label><input value={name} maxLength={18} onChange={(event) => setName(event.target.value)} placeholder="e.g. MumbaiMaverick (Leave blank for fun Guest name)" />
        
        <label>Number of Rounds (Default: 4)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
          <input 
            type="number" 
            min={1} 
            max={10} 
            value={maxRounds} 
            onChange={(e) => setMaxRounds(Math.max(1, Math.min(10, Number(e.target.value) || 4)))} 
            style={{ width: '90px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e1ed' }}
          />
          <span style={{ fontSize: '12px', color: '#777' }}>rounds per game</span>
        </div>

        <label>{t.category}</label>
        <div className="category-grid">{categories.map((category) => <button key={category} className={selectedCats.includes(category) ? 'cat active' : 'cat'} onClick={() => setSelectedCats((old) => old.includes(category) ? (old.length > 1 ? old.filter((item) => item !== category) : old) : [...old, category])}>{category}</button>)}</div>
        <div className="actions"><button className="primary" onClick={() => enter('public')}>⚡ {t.play}</button><button className="secondary" onClick={() => enter('private')}>＋ {t.create}</button></div>
        <div className="join-row"><input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={7} placeholder={t.code} /><button className="secondary" onClick={() => enter('join')}>{t.join}</button></div>
        <p className="fineprint">No account needed · 2–8 players · Free to play</p>{error && <p className="error">{error}</p>}
      </div>
    </section> : <section className="game">
      <div className="game-head">
        <div className="room-actions"><span className="pill">{room.public ? t.public : t.private}</span><strong>Room {room.code}</strong><button className="copy" onClick={copyCode}>{t.copy}</button><button className="copy share" onClick={shareRoom}>↗ {t.share}</button></div>
        
        {/* Voice Call Controls Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!micEnabled ? (
            <button className="primary" onClick={initLocalAudio} style={{ padding: '6px 12px', fontSize: '12px', background: '#2e7d32' }}>
              🎙️ Join Voice Chat
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={toggleMute} style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '8px', border: 'none', background: isMuted ? '#d32f2f' : '#388e3c', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                {isMuted ? '🔇 Muted' : '🎙️ Mic On'}
              </button>
            </div>
          )}
        </div>

        <div className="round-meta">{t.round} {room.round}/{room.maxRounds} · {t.time} <b>{room.secondsLeft}s</b></div>
        <button className="leave" onClick={leave}>{t.leave}</button>
      </div>

      {/* Mobile Priority Start Button */}
      {room.phase === 'waiting' && (
        <div className="mobile-start-priority-bar" style={{ background: '#f0ebff', border: '1px solid #7655d7', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong style={{ color: '#5234a5', fontSize: '14px' }}>Game Ready to Start</strong>
            <div style={{ fontSize: '12px', color: '#666' }}>{room.players.length} player(s) in room. Total Rounds: {room.maxRounds}</div>
          </div>
          {room.players[0]?.id === socketId ? (
            <button className="primary" style={{ minWidth: '140px', fontSize: '14px' }} onClick={() => emit('game:start')}>{t.start}</button>
          ) : (
            <span style={{ fontSize: '12px', color: '#777', fontWeight: 600 }}>Waiting for host to start...</span>
          )}
        </div>
      )}

      <div className="game-layout">
        <aside className="players panel">
          <h3>{t.players} <span>{room.players.length}/8</span></h3>
          {room.players.map((player, index) => <div className="player" key={player.id}><div className="avatar">{['🦁', '🐯', '🦚', '🐘', '🐼', '🦊', '🐸', '🐵'][index % 8]}</div><div className="player-name">{player.name}{player.id === socketId ? ' (you)' : ''}{player.isDrawer ? ' ✏️' : ''}{player.guessed ? ' ✓' : ''}</div><b>{player.score}</b></div>)}
          {room.phase === 'waiting' && room.players[0]?.id === socketId && <button className="primary full" disabled={room.players.length < 2} onClick={() => emit('game:start')}>{t.start}</button>}
          {room.phase === 'waiting' && <p className="muted">{t.waiting}</p>}
        </aside>
        
        <div className="board-column">
          <div className="wordbar">
            <span>{room.category || 'Everyday Objects'}</span>
            <strong>{room.drawerId === socketId ? `Your word: ${room.word || words[0] || '...'}` : room.maskedWord}</strong>
            {room.hint && room.drawerId !== socketId && <small>{t.hint}: {room.hint}</small>}
          </div>
          {words.length > 0 && room.phase === 'choosing' && room.drawerId === socketId && <div className="word-choices">{words.map((word) => <button onClick={() => choose(word)} key={word}>{word}</button>)}</div>}
          <canvas ref={canvasRef} width={1000} height={600} className="canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          
          <div className="tools">
            <button onClick={handleUndo} disabled={!isDrawer || history.length === 0} title="Undo stroke">↩ Undo</button>
            <button onClick={handleRedo} disabled={!isDrawer || redoStack.length === 0} title="Redo stroke">↪ Redo</button>
            <button aria-label="Dark brush" onClick={() => setBrush('#201a36')} className="swatch dark" />
            <button aria-label="Red brush" onClick={() => setBrush('#e64d4d')} className="swatch red" />
            <button aria-label="Blue brush" onClick={() => setBrush('#2376d2')} className="swatch blue" />
            <button aria-label="Green brush" onClick={() => setBrush('#1c9b65')} className="swatch green" />
            <input aria-label="Brush size" type="range" min="2" max="18" value={size} onChange={(event) => setSize(Number(event.target.value))} />
            <button onClick={() => { if (showConnectionAlert()) return; emit('draw:clear'); setHistory([]); setRedoStack([]); }} disabled={!isDrawer}>Erase all</button>
          </div>
        </div>

        <aside className="chat panel">
          <h3>💬 Live chat</h3>
          <div className="messages" ref={messagesRef} aria-live="polite" aria-relevant="additions">
            {messages.slice().reverse().map((message, index) => <div key={`${messages.length}-${index}`} className={message.kind === 'correct' ? 'msg correct' : message.kind === 'system' ? 'msg system' : 'msg'}>{message.text}</div>)}
          </div>
          <form onSubmit={sendGuess} className="chat-form desktop-guess-form">
            <input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={t.guess} disabled={isDrawer || room.phase !== 'drawing'} />
            <button className="primary" disabled={isDrawer || room.phase !== 'drawing'}>{t.send}</button>
          </form>
        </aside>
      </div>

      <form onSubmit={sendGuess} className="mobile-guess-dock">
        <input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={isDrawer ? 'You are drawing…' : t.guess} disabled={isDrawer || room.phase !== 'drawing'} />
        <button className="primary" disabled={isDrawer || room.phase !== 'drawing'}>{t.send}</button>
      </form>

      {room.phase === 'finished' && <div className="result-backdrop" role="dialog" aria-modal="true" aria-label="Game results"><div className="result-modal"><div className="result-trophy">🏆</div><h2>{t.winner}</h2><p className="result-subtitle">{room.players.length ? `🏅 ${room.players.slice().sort((a, b) => b.score - a.score)[0].name} is the winner · Final leaderboard` : 'Final leaderboard'}</p><ol className="result-list">{room.players.slice().sort((a, b) => b.score - a.score).map((player) => <li key={player.id}><span>{player.name}{player.id === socketId ? ' (you)' : ''}</span><strong>{player.score} pts</strong></li>)}</ol><div className="result-actions">{room.players[0]?.id === socketId && <button className="primary" onClick={() => { setMessages([]); setGuess(''); clearCanvas(); emit('game:start'); }}>{t.again}</button>}<button className="secondary" onClick={leave}>{t.leave === 'Leave room' ? 'Exit' : lang === 'Hindi' ? 'बाहर जाएँ' : lang === 'Marathi' ? 'बाहेर पडा' : 'Exit'}</button></div>{room.players[0]?.id !== socketId && <p className="result-wait">Waiting for the host to start another game.</p>}</div></div>}
      {toast && <div className="toast">{toast}</div>}
      {error && <div className="toast error-toast">{error}</div>}
    </section>}
    <footer>Made for India 🇮🇳 <span>ChitraGuess India · Community MVP</span></footer>
  </main>;
}
