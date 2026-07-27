import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DrawingCanvas } from "./DrawingCanvas";
import { ReplayDrawing } from "./ReplayDrawing";
import { socket } from "./socket";
import type { GameSettings, Room, Stroke } from "./types";

type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const [name, setName] = useState(localStorage.getItem("inkchain:name") ?? "");
  const [code, setCode] = useState(params.get("room")?.toUpperCase() ?? localStorage.getItem("inkchain:room-code") ?? "");
  const [room, setRoom] = useState<Room | null>(null);
  const [playerName, setPlayerName] = useState(localStorage.getItem("inkchain:active-name") ?? "");
  const [theme, setTheme] = useState(localStorage.getItem("inkchain:theme") ?? "light");
  const [error, setError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const roomRef = useRef<Room | null>(null);
  const droppedConnection = useRef(false);

  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("inkchain:theme", theme);
  }, [theme]);

  useEffect(() => {
    const onUpdate = (updated: Room) => setRoom(updated);
    const onDisconnect = () => { droppedConnection.current = true; setReconnecting(true); };
    const onConnect = () => {
      setReconnecting(false);
      if (!droppedConnection.current) return;
      droppedConnection.current = false;
      const savedRoomCode = params.get("room")?.toUpperCase() ?? localStorage.getItem("inkchain:room-code") ?? "";
      const savedName = localStorage.getItem("inkchain:active-name") ?? localStorage.getItem("inkchain:name") ?? "";
      if (!savedRoomCode || !savedName) return;
      socket.emit("room:join", { code: savedRoomCode, name: savedName }, (response: Ack<{ room: Room; playerName: string }>) => {
        if (!response.ok) return;
        saveIdentity(response.playerName, response.room.code);
        setCode(response.room.code);
        setRoom(response.room);
      });
    };
    socket.on("room:updated", onUpdate);
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => { socket.off("room:updated", onUpdate); socket.off("disconnect", onDisconnect); socket.off("connect", onConnect); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const savedRoomCode = params.get("room")?.toUpperCase() ?? localStorage.getItem("inkchain:room-code") ?? "";
    const savedName = localStorage.getItem("inkchain:active-name") ?? localStorage.getItem("inkchain:name") ?? "";
    if (!savedRoomCode || !savedName || roomRef.current) return;
    socket.emit("room:join", { code: savedRoomCode, name: savedName }, (response: Ack<{ room: Room; playerName: string }>) => {
      if (!response.ok) return;
      saveIdentity(response.playerName, response.room.code);
      setCode(response.room.code);
      setRoom(response.room);
    });
  }, []);

  const currentPlayer = room?.players.find((p) => p.name === playerName);
  const hostConnected = room?.players.some((p) => p.isHost && p.connected);
  const hasControl = Boolean(currentPlayer?.isHost || (!hostConnected && currentPlayer?.isCoHost));
  const activeCount = room ? room.players.filter((p) => p.connected && (room.settings.hostPlaying || !p.isHost)).length : 0;

  const saveIdentity = (returnedName: string, roomCode?: string) => {
    localStorage.setItem("inkchain:name", returnedName);
    localStorage.setItem("inkchain:active-name", returnedName);
    if (roomCode) localStorage.setItem("inkchain:room-code", roomCode);
    setPlayerName(returnedName);
  };

  const emit = <T extends object = object>(event: string, payload: object, onSuccess?: (response: Ack<T>) => void) => {
    setError("");
    socket.emit(event, payload, (response: Ack<T>) => {
      if (!response.ok) setError(response.error);
      else onSuccess?.(response);
    });
  };

  let screen;

  if (!room) screen = <Landing name={name} setName={setName} code={code} setCode={setCode} error={error}
    create={() => emit<{ room: Room; playerName: string }>("room:create", { name }, (r) => { if (r.ok) { saveIdentity(r.playerName, r.room.code); setCode(r.room.code); setRoom(r.room); } })}
    join={() => emit<{ room: Room; playerName: string }>("room:join", { code, name }, (r) => { if (r.ok) { saveIdentity(r.playerName, r.room.code); setCode(r.room.code); setRoom(r.room); } })} />;

  else if (room.phase === "lobby") screen = <Lobby room={room} hasControl={hasControl} activeCount={activeCount} playerName={playerName} error={error}
    update={(patch) => emit("room:update-settings", { settings: patch })}
    reorder={(orderedNames) => emit("room:reorder", { orderedNames })}
    start={() => emit("game:start", {})} />;

  else if (room.phase === "prompt-entry") screen = <PromptEntry room={room} submit={(text) => emit("prompt:submit", { text })} />;

  else if (room.phase === "word-reveal") screen = <WordReveal room={room} submit={() => emit("word:revealed", {})} />;

  else if (room.phase === "countdown") {
    const remaining = Math.max(0, Math.ceil(((room.countdownEndsAt ?? now) - now) / 1000));
    screen = <main className="shell center dark-stage"><div className="room-pill countdown-room">ROOM {room.code}</div><div className="countdown" key={remaining}>{remaining > 0 ? remaining : "GO!"}</div></main>;
  }

  else if (room.phase === "playing") screen = <Play room={room} playerName={playerName} now={now} hasControl={hasControl} submit={(payload) => emit("turn:submit", payload)} draft={(payload) => socket.emit("turn:draft", payload)} nudgeTimer={() => emit("timer:nudge", {})} forceAdvance={() => emit("turn:force-advance", {})} />;

  else screen = <Review room={room} hasControl={hasControl}
    select={(bookletId) => emit("review:select", { bookletId })}
    next={() => emit("review:next", {})}
    newRound={() => emit("round:new", {})} />;

  return <>
    <button className="theme-toggle" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
    {reconnecting && <div className="connection-banner">Reconnecting...</div>}
    {screen}
  </>;
}

function Landing({ name, setName, code, setCode, create, join, error }: any) {
  return <main className="shell center"><section className="card hero">
    <div className="logo">IC</div><p className="eyebrow">DRAW - GUESS - REPEAT</p><h1>InkChain</h1><p className="subtle">A private party game for 4-16 players.</p>
    <label>Display name<input value={name} maxLength={24} placeholder="Your name" onChange={(e) => setName(e.target.value)} /></label>
    <button className="primary full" disabled={!name.trim()} onClick={create}>Create room</button>
    <div className="divider"><span>or join</span></div>
    <label>Room code<input className="room-input" value={code} maxLength={5} placeholder="ABCDE" onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
    <button className="full" disabled={!name.trim() || code.length !== 5} onClick={join}>Join room</button>{error && <p className="error">{error}</p>}
  </section></main>;
}

function Lobby({ room, hasControl, activeCount, playerName, update, reorder, start, error }: { room: Room; hasControl: boolean; activeCount: number; playerName: string; update: (p: Partial<GameSettings>) => void; reorder: (names: string[]) => void; start: () => void; error: string }) {
  const joinUrl = `${window.location.origin}?room=${room.code}`;
  const [dragging, setDragging] = useState<string | null>(null);
  const dropBefore = (targetName: string) => {
    if (!dragging || dragging === targetName) return;
    const names = room.players.map((p) => p.name).filter((name) => name !== dragging);
    names.splice(names.indexOf(targetName), 0, dragging);
    reorder(names);
    setDragging(null);
  };
  return <main className="shell lobby">
    <section className="card room-card"><p className="eyebrow">ROOM CODE</p><h1 className="room-code">{room.code}</h1><div className="qr-wrap"><QRCodeSVG value={joinUrl} size={180} marginSize={2} /></div><p className="subtle">Scan to join</p></section>
    <section className="card"><div className="section-title"><div><p className="eyebrow">CARD FLOW</p><h2>{activeCount} players</h2></div><span className="status-dot">Live</span></div><div className="flow-list">{room.players.map((p, i) => <div className={`player ${p.connected ? "" : "offline"} ${dragging === p.name ? "dragging" : ""}`} key={p.name} draggable={hasControl} onDragStart={() => setDragging(p.name)} onDragOver={(e) => { if (hasControl) e.preventDefault(); }} onDrop={() => dropBefore(p.name)} onDragEnd={() => setDragging(null)}><span className="drag-handle">{hasControl ? "::" : ""}</span><span className="flow-number">{i + 1}</span><span className="avatar">{p.name[0]}</span><div><strong>{p.name}{p.name === playerName ? " (you)" : ""}</strong><small>{p.isHost ? "Host" : p.isCoHost ? "Backup host" : "Player"}</small></div><span>{p.connected ? "on" : "off"}</span></div>)}</div></section>
    {hasControl ? <section className="card settings"><p className="eyebrow">GAME SETUP</p>
      <Toggle label="Host is playing" checked={room.settings.hostPlaying} onChange={(v) => update({ hostPlaying: v })}/>
      <Toggle label="Use timer" checked={room.settings.timerEnabled} onChange={(v) => update({ timerEnabled: v })}/>
      {room.settings.timerEnabled && <>
        <label>Drawing time: {room.settings.drawTimerSeconds ?? room.settings.timerSeconds}s<input type="range" min="30" max="180" step="15" value={room.settings.drawTimerSeconds ?? room.settings.timerSeconds} onChange={(e) => update({ drawTimerSeconds: Number(e.target.value), timerSeconds: Number(e.target.value) })}/></label>
        <label>Guessing time: {room.settings.guessTimerSeconds ?? room.settings.timerSeconds}s<input type="range" min="30" max="180" step="15" value={room.settings.guessTimerSeconds ?? room.settings.timerSeconds} onChange={(e) => update({ guessTimerSeconds: Number(e.target.value) })}/></label>
      </>}
      <Toggle label="Multicolor drawing" checked={room.settings.multicolor} onChange={(v) => update({ multicolor: v })}/>
      <Toggle label="Random passing each turn" checked={room.settings.randomPassing} onChange={(v) => update({ randomPassing: v })}/>
      <label>Prompt source<select value={room.settings.promptMode} onChange={(e) => update({ promptMode: e.target.value as GameSettings["promptMode"] })}><option value="random">Random nouns</option><option value="custom">Players write their own</option></select></label>
      <button className="primary full" disabled={activeCount < 4} onClick={start}>Start game</button>{activeCount < 4 && <p className="subtle">At least four participating players are required.</p>}{error && <p className="error">{error}</p>}
    </section> : <section className="card waiting"><div className="pulse"/><h2>Waiting for the host</h2><p className="subtle">The game starts automatically.</p></section>}
  </main>;
}

function PromptEntry({ room, submit }: { room: Room; submit: (text: string) => void }) {
  const [text, setText] = useState("");
  if (room.task.kind === "spectating") return <StatusCard title="Players are writing prompts" detail="You are hosting this round without playing." room={room}/>;
  if (room.task.kind === "waiting") return <StatusCard title="Prompt submitted" detail="Waiting for everyone else..." room={room}/>;
  return <main className="shell center"><section className="card task-card"><p className="eyebrow">PRIVATE PROMPT</p><h1>Write a noun</h1><p className="subtle">This begins your booklet. Keep it secret.</p><input autoFocus value={text} maxLength={100} placeholder="Example: lighthouse" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) submit(text); }}/><button className="primary full" disabled={!text.trim()} onClick={() => submit(text)}>Send prompt</button></section></main>;
}

function WordReveal({ room, submit }: { room: Room; submit: () => void }) {
  const [revealed, setRevealed] = useState(false);
  if (room.task.kind === "spectating") return <StatusCard title="Players are reading their words" detail="The round starts once everyone is ready." room={room}/>;
  if (room.task.kind === "waiting") return <StatusCard title="Word locked in" detail="Waiting for everyone else..." room={room}/>;
  return <main className="shell center"><section className="card task-card word-card"><p className="eyebrow">SECRET WORD</p><h1>Learn your word</h1><button className={`hold-reveal tap-reveal ${revealed ? "revealed" : ""}`} onClick={() => setRevealed(true)}>{room.task.hiddenWord || "Blank prompt"}</button><p className="subtle">{revealed ? "Keep it secret. Your next screen will show what to draw." : "Tap the card to reveal it."}</p><button className="primary full" disabled={!revealed} onClick={submit}>Continue</button></section></main>;
}

function Play({ room, playerName, now, hasControl, submit, draft, nudgeTimer, forceAdvance }: { room: Room; playerName: string; now: number; hasControl: boolean; submit: (payload: object) => void; draft: (payload: object) => void; nudgeTimer: () => void; forceAdvance: () => void }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [guess, setGuess] = useState("");
  const [nudgeEffect, setNudgeEffect] = useState("");
  const [nudgeCooling, setNudgeCooling] = useState(false);
  const autoSubmitted = useRef<string | null>(null);
  const taskKey = `${room.round?.turnIndex}-${room.task.bookletId}`;
  const draftKey = `inkchain:draft:${room.code}:${playerName}:${taskKey}`;
  useEffect(() => {
    autoSubmitted.current = null;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "{}") as { strokes?: Stroke[]; text?: string };
      setStrokes(room.task.kind === "drawing" ? (room.task.draftStrokes ?? saved.strokes ?? []) : []);
      setGuess(room.task.kind === "guess" ? (room.task.draftText ?? saved.text ?? "") : "");
    } catch {
      setStrokes(room.task.kind === "drawing" ? (room.task.draftStrokes ?? []) : []);
      setGuess(room.task.kind === "guess" ? (room.task.draftText ?? "") : "");
    }
  }, [draftKey, room.task.kind, room.task.draftText, room.task.draftStrokes]);
  const seconds = room.round?.turnEndsAt ? Math.max(0, Math.ceil((room.round.turnEndsAt - now) / 1000)) : null;
  const turnLimit = room.round?.turnType === "guess"
    ? (room.settings.guessTimerSeconds ?? room.settings.timerSeconds)
    : (room.settings.drawTimerSeconds ?? room.settings.timerSeconds);
  const pendingNames = room.round?.participantNames.filter((name) => !(room.round?.submittedNames ?? []).includes(name)) ?? [];
  const submittedCount = room.round?.submittedNames.length ?? 0;
  const canNudgeTimer = Boolean(room.settings.timerEnabled && room.round?.turnType === "drawing" && seconds !== null && submittedCount >= Math.ceil((room.round?.participantNames.length ?? 0) / 2));
  const pressNudge = () => {
    if (!canNudgeTimer || nudgeCooling) return;
    setNudgeCooling(true);
    nudgeTimer();
    window.setTimeout(() => setNudgeCooling(false), 2000);
  };
  useEffect(() => {
    const onNudged = (payload: { amount?: number; from?: string; turnIndex?: number }) => {
      if (payload.turnIndex !== room.round?.turnIndex || room.task.kind !== "drawing") return;
      setNudgeEffect(`-${payload.amount ?? 1}s`);
      window.setTimeout(() => setNudgeEffect(""), 850);
    };
    socket.on("timer:nudged", onNudged);
    return () => { socket.off("timer:nudged", onNudged); };
  }, [room.round?.turnIndex, room.task.kind]);
  useEffect(() => {
    if (room.task.kind === "drawing") {
      localStorage.setItem(draftKey, JSON.stringify({ strokes }));
      draft({ strokes });
    }
  }, [room.task.kind, strokes, draftKey]);
  useEffect(() => {
    if (room.task.kind === "guess") {
      localStorage.setItem(draftKey, JSON.stringify({ text: guess }));
      draft({ text: guess });
    }
  }, [room.task.kind, guess, draftKey]);
  useEffect(() => {
    if (!room.round?.turnEndsAt || now < room.round.turnEndsAt || autoSubmitted.current === taskKey) return;
    if (room.task.kind === "drawing") { autoSubmitted.current = taskKey; localStorage.removeItem(draftKey); submit({ strokes }); }
    if (room.task.kind === "guess") { autoSubmitted.current = taskKey; localStorage.removeItem(draftKey); submit({ text: guess }); }
  }, [now, room.round?.turnEndsAt, room.task.kind, taskKey, strokes, guess, submit]);
  const progress = `${(room.round?.turnIndex ?? 0) + 1} / ${room.round?.totalTurns ?? 0}`;

  if (room.task.kind === "spectating") return <StatusCard title="Round in progress" detail="You are hosting without playing. Stop mirroring until review." room={room} timer={seconds} hasControl={hasControl} forceAdvance={forceAdvance}/>;
  if (room.task.kind === "waiting") return <main className="shell center"><section className="card waiting task-card"><div className="paper-flight">-&gt;</div><p className="eyebrow">ROOM {room.code} - TURN {progress}</p><h1>Card passed</h1><p className="subtle">{pendingNames.length ? `Waiting on ${formatNames(pendingNames)}.` : "Everyone is ready."}</p>{seconds !== null && <Timer seconds={seconds} total={turnLimit}/>} {room.round?.turnType === "drawing" && seconds !== null && <button className="full nudge-button" disabled={!canNudgeTimer || nudgeCooling || !pendingNames.length} onClick={pressNudge}>{nudgeCooling ? "Cooling down" : canNudgeTimer ? "Take 1 second off" : "Available at 50% waiting"}</button>} {hasControl && <button className="full" onClick={forceAdvance}>Advance turn</button>}</section></main>;

  if (room.task.kind === "drawing") return <main className="shell play-shell"><header className="play-header"><div><span className="room-pill">ROOM {room.code}</span><strong>Draw - {progress}</strong></div>{seconds !== null && <Timer seconds={seconds} total={turnLimit}/>}</header><section className="instruction-card"><p>{room.task.instructionAuthorName ? `Previous by ${room.task.instructionAuthorName}` : "Draw this"}</p><div className="plain-prompt">{room.task.instructionText || "Blank prompt"}</div></section><div className="canvas-stage">{nudgeEffect && <div className="nudge-effect">{nudgeEffect}</div>}<DrawingCanvas strokes={strokes} onChange={setStrokes} multicolor={room.settings.multicolor}/></div><button className="primary submit-bar" onClick={() => { localStorage.removeItem(draftKey); submit({ strokes }); }}>Pass card</button></main>;

  return <main className="shell play-shell"><header className="play-header"><div><span className="room-pill">ROOM {room.code}</span><strong>Guess - {progress}</strong></div>{seconds !== null && <Timer seconds={seconds} total={turnLimit}/>}</header><section className="card guess-card"><p className="eyebrow">{room.task.previousAuthorName ? `DRAWN BY ${room.task.previousAuthorName.toUpperCase()}` : "WHAT IS THIS?"}</p><DrawingCanvas strokes={room.task.previousDrawing ?? []} readOnly/><textarea value={guess} maxLength={200} placeholder="Type your guess..." onChange={(e) => setGuess(e.target.value)}/><button className="primary full" onClick={() => { localStorage.removeItem(draftKey); submit({ text: guess }); }}>Pass card</button></section></main>;
}

function Review({ room, hasControl, select, next, newRound }: { room: Room; hasControl: boolean; select: (id: string) => void; next: () => void; newRound: () => void }) {
  const round = room.round!;
  const booklets = round.booklets ?? [];
  const selected = booklets.find((b) => b.id === round.reviewBookletId);
  const page = selected?.pages[round.reviewPageIndex];
  const beginNewRound = () => {
    const incomplete = round.reviewedBookletIds.length < booklets.length;
    if (!incomplete || window.confirm("Some booklets have not been reviewed. Start a new round anyway?")) newRound();
  };

  if (!selected) return <main className="shell review-grid"><section className="review-heading"><p className="eyebrow">ROUND {room.roundNumber} COMPLETE</p><h1>Choose a booklet</h1><p>Everyone's screen follows the host.</p></section><section className="booklet-grid">{booklets.map((b) => <button key={b.id} className={`booklet-button ${round.reviewedBookletIds.includes(b.id) ? "reviewed" : ""}`} disabled={!hasControl} onClick={() => select(b.id)}><span className="avatar">{b.ownerName[0]}</span><strong>{b.ownerName}</strong><small>{round.reviewedBookletIds.includes(b.id) ? "Reviewed" : "Open journey"}</small></button>)}</section>{hasControl && <button className="new-round" onClick={beginNewRound}>New round</button>}</main>;

  return <main className="shell center review-stage"><section className="card reveal-card" key={`${selected.id}-${round.reviewPageIndex}`}><p className="eyebrow">{selected.ownerName.toUpperCase()}'S BOOKLET - {round.reviewPageIndex + 1}/{selected.pages.length}</p><h2>{page?.type === "prompt" ? "Original prompt" : page?.type === "drawing" ? `Drawn by ${page.authorName}` : `Guessed by ${page?.authorName}`}</h2>{page?.blank ? <div className="blank-page">No response</div> : page?.type === "drawing" ? <ReplayDrawing strokes={page.strokes ?? []}/> : <div className="reveal-text">{page?.text || "No response"}</div>}{hasControl && <button className="primary full" onClick={next}>{round.reviewPageIndex === selected.pages.length - 1 ? "Finish booklet" : "Next"}</button>}</section></main>;
}

function StatusCard({ title, detail, room, timer, hasControl = false, forceAdvance }: { title: string; detail: string; room: Room; timer?: number | null; hasControl?: boolean; forceAdvance?: () => void }) { return <main className="shell center"><section className="card waiting task-card"><div className="pulse"/><p className="eyebrow">ROOM {room.code}</p><h1>{title}</h1><p className="subtle">{detail}</p>{timer !== undefined && timer !== null && <Timer seconds={timer}/>} {hasControl && forceAdvance && <button className="full" onClick={forceAdvance}>Advance turn</button>}</section></main>; }
function Timer({ seconds, total = 90 }: { seconds: number; total?: number }) {
  const pct = Math.max(0, Math.min(100, (seconds / total) * 100));
  return <div className={`timer ${seconds <= 10 ? "urgent" : seconds <= 30 ? "warning" : ""}`}><span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span><i style={{ width: `${pct}%` }}/></div>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}/></label>; }
function formatNames(names: string[]) { return names.length <= 1 ? (names[0] ?? "no one") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`; }
