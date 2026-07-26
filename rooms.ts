import crypto from "node:crypto";
import { PROMPTS } from "./prompts.js";
import type { Booklet, BookletPage, GameSettings, Player, PublicRoom, Room, Stroke, Submission } from "./types.js";

const rooms = new Map<string, Room>();
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;

const defaultSettings: GameSettings = {
  timerEnabled: true,
  timerSeconds: 90,
  multicolor: true,
  promptMode: "random",
  hostPlaying: false,
  randomPassing: false
};

function createCode(): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = "";
    for (let i = 0; i < 5; i += 1) code += ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Could not generate a unique room code.");
}

function createPlayer(socketId: string, name: string, isHost: boolean, isCoHost: boolean): Player {
  return { id: socketId, name, connected: true, isHost, isCoHost, joinedAt: Date.now() };
}

function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 24) || "Player";
}

function makeUniqueName(room: Room, requested: string): string {
  const clean = cleanName(requested);
  const names = new Set(room.players.map((p) => p.name.toLowerCase()));
  if (!names.has(clean.toLowerCase())) return clean;
  let suffix = 2;
  while (names.has(`${clean} ${suffix}`.toLowerCase())) suffix += 1;
  return `${clean} ${suffix}`;
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function participants(room: Room): Player[] {
  return room.players.filter((p) => p.connected && (room.settings.hostPlaying || !p.isHost));
}

function randomPrompt(room: Room): string {
  let available = PROMPTS.filter((prompt) => !room.usedPrompts.includes(prompt));
  if (available.length === 0) {
    room.usedPrompts = [];
    available = [...PROMPTS];
  }
  const prompt = available[crypto.randomInt(available.length)];
  room.usedPrompts.push(prompt);
  return prompt;
}

function initializeRound(room: Room): void {
  const active = participants(room);
  if (active.length < 4) throw new Error("At least four participating players are required.");
  const names = active.map((p) => p.name);
  const oddPlayerCount = names.length % 2 === 1;
  const passOffsets = Array.from({ length: names.length - 1 }, (_, i) => i + 1);
  const routeOffsets = oddPlayerCount
    ? (room.settings.randomPassing ? shuffled(passOffsets) : passOffsets)
    : [0, ...(room.settings.randomPassing ? shuffled(passOffsets) : passOffsets)];
  const booklets: Booklet[] = names.map((ownerName) => ({ id: crypto.randomUUID(), ownerName, pages: [] }));

  room.roundNumber += 1;
  room.round = {
    number: room.roundNumber,
    participantNames: names,
    booklets,
    routeOffsets,
    turnIndex: 0,
    turnType: "drawing",
    submissions: {},
    drafts: {},
    wordRevealAcks: {},
    reviewedBookletIds: [],
    reviewPageIndex: 0
  };

  if (room.settings.promptMode === "random") {
    for (const booklet of booklets) {
      booklet.pages.push({ index: 0, type: "prompt", authorName: booklet.ownerName, text: randomPrompt(room) });
    }
  }
}

export function createRoom(socketId: string, requestedName: string): Room {
  const code = createCode();
  const room: Room = {
    code,
    players: [createPlayer(socketId, cleanName(requestedName), true, false)],
    settings: { ...defaultSettings },
    phase: "lobby",
    roundNumber: 0,
    usedPrompts: []
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined { return rooms.get(code.toUpperCase()); }

export function joinRoom(code: string, socketId: string, requestedName: string): { room: Room; player: Player; replacedSocketId?: string } {
  const room = getRoom(code);
  if (!room) throw new Error("Room not found.");
  const normalized = cleanName(requestedName);
  const reconnecting = room.players.find((p) => p.name.toLowerCase() === normalized.toLowerCase() && !p.connected);
  if (reconnecting) {
    const replacedSocketId = reconnecting.id;
    reconnecting.id = socketId;
    reconnecting.connected = true;
    room.emptySince = undefined;
    return { room, player: reconnecting, replacedSocketId };
  }

  if (room.phase !== "lobby") throw new Error("A round is active. Only disconnected players may rejoin.");
  if (room.players.filter((p) => p.connected).length >= 16) throw new Error("This room is full.");

  const player = createPlayer(socketId, makeUniqueName(room, normalized), false, room.players.length === 1);
  room.players.push(player);
  room.emptySince = undefined;
  return { room, player };
}

export function disconnectPlayer(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.id === socketId);
    if (!player) continue;
    player.connected = false;
    if (room.players.every((p) => !p.connected)) room.emptySince = Date.now();
    return room;
  }
}

export function reorderPlayers(room: Room, orderedNames: string[]): void {
  if (room.phase !== "lobby") throw new Error("Players can only be reordered in the lobby.");
  const currentNames = room.players.map((p) => p.name);
  if (orderedNames.length !== currentNames.length || new Set(orderedNames).size !== currentNames.length || orderedNames.some((name) => !currentNames.includes(name))) {
    throw new Error("Invalid player order.");
  }
  room.players = orderedNames.map((name) => room.players.find((p) => p.name === name)!);
}

export function updateSettings(code: string, settings: Partial<GameSettings>): Room {
  const room = getRoom(code);
  if (!room) throw new Error("Room not found.");
  if (room.phase !== "lobby") throw new Error("Settings cannot change during a round.");
  room.settings = { ...room.settings, ...settings, timerSeconds: Math.min(180, Math.max(30, settings.timerSeconds ?? room.settings.timerSeconds)) };
  return room;
}

export function beginGame(code: string): Room {
  const room = getRoom(code);
  if (!room) throw new Error("Room not found.");
  if (room.phase !== "lobby") throw new Error("The game has already started.");
  initializeRound(room);
  const needsWordReveal = room.settings.promptMode === "random";
  room.phase = room.settings.promptMode === "custom" ? "prompt-entry" : needsWordReveal ? "word-reveal" : "countdown";
  if (room.phase === "countdown") room.countdownEndsAt = Date.now() + 4000;
  return room;
}

export function submitCustomPrompt(room: Room, playerName: string, text: string): void {
  if (room.phase !== "prompt-entry" || !room.round) throw new Error("Prompt entry is not active.");
  const booklet = room.round.booklets.find((b) => b.ownerName === playerName);
  if (!booklet) throw new Error("You are not participating in this round.");
  if (booklet.pages.length) throw new Error("Prompt already submitted.");
  booklet.pages.push({ index: 0, type: "prompt", authorName: playerName, text: text.trim().slice(0, 100), blank: !text.trim() });
}

export function customPromptsComplete(room: Room): boolean {
  return Boolean(room.round && room.round.booklets.every((b) => b.pages.length === 1));
}

export function submitWordReveal(room: Room, playerName: string): void {
  if (room.phase !== "word-reveal" || !room.round) throw new Error("Word reveal is not active.");
  if (!room.round.participantNames.includes(playerName)) throw new Error("You are not participating in this round.");
  room.round.wordRevealAcks[playerName] = true;
}

export function wordRevealComplete(room: Room): boolean {
  return Boolean(room.round && room.round.participantNames.every((name) => room.round!.wordRevealAcks[name]));
}

export function startCountdown(room: Room): void {
  room.phase = "countdown";
  room.countdownEndsAt = Date.now() + 4000;
}

export function startTurn(room: Room): void {
  if (!room.round) throw new Error("Round missing.");
  room.phase = "playing";
  room.round.submissions = {};
  room.round.drafts = {};
  room.round.turnType = room.round.turnIndex % 2 === 0 ? "drawing" : "guess";
  room.round.turnEndsAt = room.settings.timerEnabled ? Date.now() + room.settings.timerSeconds * 1000 : undefined;
}

function assignedBooklet(room: Room, playerName: string): Booklet | undefined {
  const round = room.round;
  if (!round) return undefined;
  const playerIndex = round.participantNames.indexOf(playerName);
  if (playerIndex < 0) return undefined;
  const offset = round.routeOffsets[round.turnIndex];
  const ownerIndex = (playerIndex - offset + round.participantNames.length) % round.participantNames.length;
  return round.booklets.find((b) => b.ownerName === round.participantNames[ownerIndex]);
}

export function submitTurn(room: Room, playerName: string, payload: { text?: string; strokes?: Stroke[]; blank?: boolean }): void {
  if (room.phase !== "playing" || !room.round) throw new Error("No active turn.");
  if (room.round.submissions[playerName]) throw new Error("Already submitted.");
  const booklet = assignedBooklet(room, playerName);
  if (!booklet) throw new Error("No card assigned.");
  const type = room.round.turnType;
  const page: BookletPage = {
    index: booklet.pages.length,
    type,
    authorName: playerName,
    blank: Boolean(payload.blank)
  };
  if (type === "guess") page.text = (payload.text ?? "").slice(0, 200);
  else page.strokes = payload.strokes ?? [];
  room.round.submissions[playerName] = { playerName, bookletId: booklet.id, page };
}

export function saveTurnDraft(room: Room, playerName: string, payload: { text?: string; strokes?: Stroke[] }): void {
  if (room.phase !== "playing" || !room.round) return;
  if (room.round.submissions[playerName]) return;
  if (!room.round.participantNames.includes(playerName)) return;
  room.round.drafts[playerName] = {
    text: typeof payload.text === "string" ? payload.text.slice(0, 200) : undefined,
    strokes: Array.isArray(payload.strokes) ? payload.strokes : undefined
  };
}

export function submitDraftOrBlank(room: Room, playerName: string): void {
  if (!room.round || room.round.submissions[playerName]) return;
  const draft = room.round.drafts[playerName];
  if (draft) {
    submitTurn(room, playerName, room.round.turnType === "guess" ? { text: draft.text ?? "" } : { strokes: draft.strokes ?? [] });
  } else {
    submitTurn(room, playerName, { blank: true });
  }
}

export function fillDisconnectedSubmissions(room: Room): void {
  if (room.phase !== "playing" || !room.round) return;
  for (const name of room.round.participantNames) {
    if (room.round.submissions[name]) continue;
    const player = room.players.find((p) => p.name === name);
    if (player?.connected) continue;
    submitDraftOrBlank(room, name);
  }
}

export function allTurnSubmissionsComplete(room: Room): boolean {
  return Boolean(room.round && room.round.participantNames.every((name) => room.round!.submissions[name]));
}

export function finishTurn(room: Room): "next" | "review" {
  const round = room.round;
  if (!round) throw new Error("Round missing.");
  for (const submission of Object.values(round.submissions)) {
    const booklet = round.booklets.find((b) => b.id === submission.bookletId);
    if (booklet) booklet.pages.push(submission.page);
  }
  if (round.turnIndex >= round.routeOffsets.length - 1) {
    room.phase = "review";
    round.reviewBookletId = undefined;
    round.reviewPageIndex = 0;
    for (const p of room.players) {
      if (!p.connected && !p.isHost) p.name = `${p.name}`;
    }
    return "review";
  }
  round.turnIndex += 1;
  startTurn(room);
  return "next";
}

export function selectReviewBooklet(room: Room, bookletId: string): void {
  if (room.phase !== "review" || !room.round) throw new Error("Review is not active.");
  if (!room.round.booklets.some((b) => b.id === bookletId)) throw new Error("Booklet not found.");
  room.round.reviewBookletId = bookletId;
  room.round.reviewPageIndex = 0;
}

export function advanceReview(room: Room): void {
  if (room.phase !== "review" || !room.round?.reviewBookletId) throw new Error("Select a booklet first.");
  const booklet = room.round.booklets.find((b) => b.id === room.round!.reviewBookletId)!;
  if (room.round.reviewPageIndex < booklet.pages.length - 1) {
    room.round.reviewPageIndex += 1;
  } else {
    if (!room.round.reviewedBookletIds.includes(booklet.id)) room.round.reviewedBookletIds.push(booklet.id);
    room.round.reviewBookletId = undefined;
    room.round.reviewPageIndex = 0;
  }
}

export function resetToLobby(room: Room): void {
  room.phase = "lobby";
  room.round = undefined;
  room.countdownEndsAt = undefined;
  room.players = room.players.filter((p) => p.connected || p.isHost);
}

export function toPublicRoom(room: Room, playerName: string): PublicRoom {
  const round = room.round;
  let task: PublicRoom["task"] = { kind: "spectating" };
  if (room.phase === "prompt-entry") {
    const booklet = round?.booklets.find((b) => b.ownerName === playerName);
    task = booklet ? { kind: booklet.pages.length ? "waiting" : "prompt-entry", submitted: booklet.pages.length > 0 } : { kind: "spectating" };
  } else if (room.phase === "word-reveal") {
    const booklet = round?.booklets.find((b) => b.ownerName === playerName);
    task = booklet
      ? { kind: round?.wordRevealAcks[playerName] ? "waiting" : "word-reveal", hiddenWord: booklet.pages[0]?.text ?? "", submitted: Boolean(round?.wordRevealAcks[playerName]) }
      : { kind: "spectating" };
  } else if (room.phase === "playing" && round) {
    const booklet = assignedBooklet(room, playerName);
    const submitted = Boolean(round.submissions[playerName]);
    if (!booklet) task = { kind: "spectating" };
    else if (submitted) task = { kind: "waiting", submitted: true };
    else {
      const previous = booklet.pages.at(-1);
      task = round.turnType === "drawing"
        ? { kind: "drawing", bookletId: booklet.id, instructionText: previous?.text ?? "", instructionAuthorName: previous?.authorName, submitted: false }
        : { kind: "guess", bookletId: booklet.id, previousDrawing: previous?.strokes ?? [], previousAuthorName: previous?.authorName, submitted: false };
    }
  }

  return {
    code: room.code,
    players: room.players,
    settings: room.settings,
    phase: room.phase,
    countdownEndsAt: room.countdownEndsAt,
    roundNumber: room.roundNumber,
    round: round ? {
      participantNames: round.participantNames,
      turnIndex: round.turnIndex,
      totalTurns: round.routeOffsets.length,
      turnType: round.turnType,
      turnEndsAt: round.turnEndsAt,
      submittedNames: Object.keys(round.submissions),
      reviewedBookletIds: round.reviewedBookletIds,
      reviewBookletId: round.reviewBookletId,
      reviewPageIndex: round.reviewPageIndex,
      booklets: room.phase === "review" ? round.booklets : undefined
    } : undefined,
    task
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) if (room.emptySince && now - room.emptySince >= EMPTY_ROOM_TTL_MS) rooms.delete(code);
}, 60_000).unref();
