import cors from "cors";
import express from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { z } from "zod";
import {
  advanceReview,
  allTurnSubmissionsComplete,
  beginGame,
  customPromptsComplete,
  disconnectPlayer,
  fillDisconnectedSubmissions,
  finishTurn,
  getRoom,
  joinRoom,
  createRoom,
  reorderPlayers,
  resetToLobby,
  saveTurnDraft,
  selectReviewBooklet,
  startCountdown,
  startTurn,
  submitDraftOrBlank,
  submitCustomPrompt,
  submitWordReveal,
  submitTurn,
  toPublicRoom,
  updateSettings,
  wordRevealComplete
} from "./rooms.js";
import type { Room, Stroke } from "./types.js";

const PORT = Number(process.env.PORT ?? 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, "../../client/dist");
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
const corsOrigin = allowedOrigins?.length ? allowedOrigins : true;
const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "2mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin },
  maxHttpBufferSize: 2e6
});

const identityBySocket = new Map<string, { roomCode: string; playerName: string }>();
const nameSchema = z.string().trim().min(1).max(24);
const codeSchema = z.string().trim().length(5);

function broadcastRoom(room: Room): void {
  for (const player of room.players) {
    if (!player.connected) continue;
    io.to(player.id).emit("room:updated", toPublicRoom(room, player.name));
  }
}

function scheduleCountdown(room: Room): void {
  if (room.timerHandle) clearTimeout(room.timerHandle);
  room.timerHandle = setTimeout(() => {
    if (room.phase !== "countdown") return;
    startTurn(room);
    scheduleTurnTimer(room);
    broadcastRoom(room);
  }, Math.max(0, (room.countdownEndsAt ?? Date.now()) - Date.now()));
}

function scheduleTurnTimer(room: Room): void {
  if (room.timerHandle) clearTimeout(room.timerHandle);
  if (!room.settings.timerEnabled || !room.round?.turnEndsAt) return;
  room.timerHandle = setTimeout(() => {
    if (room.phase !== "playing" || !room.round) return;
    for (const name of room.round.participantNames) {
      submitDraftOrBlank(room, name);
    }
    finishTurn(room);
    if (room.phase === "playing") scheduleTurnTimer(room);
    broadcastRoom(room);
  }, Math.max(0, room.round.turnEndsAt - Date.now()));
}

function advanceIfReady(room: Room): void {
  fillDisconnectedSubmissions(room);
  if (!allTurnSubmissionsComplete(room)) return;
  finishTurn(room);
  if (room.phase === "playing") scheduleTurnTimer(room);
}

function effectiveController(room: Room, socketId: string): boolean {
  const actor = room.players.find((p) => p.id === socketId);
  if (!actor) return false;
  const hostConnected = room.players.some((p) => p.isHost && p.connected);
  return actor.isHost || (!hostConnected && actor.isCoHost);
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload, ack) => {
    try {
      const room = createRoom(socket.id, nameSchema.parse(payload?.name));
      socket.join(room.code);
      identityBySocket.set(socket.id, { roomCode: room.code, playerName: room.players[0].name });
      ack({ ok: true, room: toPublicRoom(room, room.players[0].name), playerName: room.players[0].name });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to create room." }); }
  });

  socket.on("room:join", (payload, ack) => {
    try {
      const code = codeSchema.parse(payload?.code).toUpperCase();
      const result = joinRoom(code, socket.id, nameSchema.parse(payload?.name));
      if (result.replacedSocketId) io.sockets.sockets.get(result.replacedSocketId)?.disconnect(true);
      socket.join(code);
      identityBySocket.set(socket.id, { roomCode: code, playerName: result.player.name });
      ack({ ok: true, room: toPublicRoom(result.room, result.player.name), playerName: result.player.name });
      broadcastRoom(result.room);
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to join room." }); }
  });

  socket.on("room:reorder", (payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !effectiveController(room, socket.id)) throw new Error("Only the host can reorder players.");
      reorderPlayers(room, Array.isArray(payload?.orderedNames) ? payload.orderedNames.map(String) : []);
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to reorder players." }); }
  });

  socket.on("room:update-settings", (payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !effectiveController(room, socket.id)) throw new Error("Only the host can change settings.");
      updateSettings(room.code, payload?.settings ?? {});
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to update settings." }); }
  });

  socket.on("game:start", (_payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !effectiveController(room, socket.id)) throw new Error("Only the host can start the game.");
      beginGame(room.code);
      if (room.phase === "countdown") scheduleCountdown(room);
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to start game." }); }
  });

  socket.on("prompt:submit", (payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !identity) throw new Error("Room not found.");
      submitCustomPrompt(room, identity.playerName, String(payload?.text ?? ""));
      if (customPromptsComplete(room)) {
        startCountdown(room);
        scheduleCountdown(room);
      }
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to submit prompt." }); }
  });

  socket.on("word:revealed", (_payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !identity) throw new Error("Room not found.");
      submitWordReveal(room, identity.playerName);
      if (wordRevealComplete(room)) {
        startCountdown(room);
        scheduleCountdown(room);
      }
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to continue." }); }
  });

  socket.on("turn:submit", (payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !identity) throw new Error("Room not found.");
      submitTurn(room, identity.playerName, {
        text: typeof payload?.text === "string" ? payload.text : undefined,
        strokes: Array.isArray(payload?.strokes) ? payload.strokes as Stroke[] : undefined
      });
      advanceIfReady(room);
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to submit turn." }); }
  });

  socket.on("turn:draft", (payload) => {
    const identity = identityBySocket.get(socket.id);
    const room = identity ? getRoom(identity.roomCode) : undefined;
    if (!room || !identity) return;
    saveTurnDraft(room, identity.playerName, {
      text: typeof payload?.text === "string" ? payload.text : undefined,
      strokes: Array.isArray(payload?.strokes) ? payload.strokes as Stroke[] : undefined
    });
  });

  socket.on("turn:force-advance", (_payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !effectiveController(room, socket.id) || !room.round) throw new Error("Only the host can advance the turn.");
      for (const name of room.round.participantNames) {
        submitDraftOrBlank(room, name);
      }
      finishTurn(room);
      if (room.phase === "playing") scheduleTurnTimer(room);
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to advance turn." }); }
  });

  socket.on("review:select", (payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !effectiveController(room, socket.id)) throw new Error("Only the host controls review.");
      selectReviewBooklet(room, String(payload?.bookletId ?? ""));
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to select booklet." }); }
  });

  socket.on("review:next", (_payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !effectiveController(room, socket.id)) throw new Error("Only the host controls review.");
      advanceReview(room);
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to advance review." }); }
  });

  socket.on("round:new", (_payload, ack) => {
    try {
      const identity = identityBySocket.get(socket.id);
      const room = identity ? getRoom(identity.roomCode) : undefined;
      if (!room || !effectiveController(room, socket.id)) throw new Error("Only the host can start a new round.");
      resetToLobby(room);
      broadcastRoom(room);
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : "Unable to create new round." }); }
  });

  socket.on("disconnect", () => {
    const identity = identityBySocket.get(socket.id);
    identityBySocket.delete(socket.id);
    const room = disconnectPlayer(socket.id);
    if (!room || !identity) return;
    if (room.phase === "playing") advanceIfReady(room);
    if (room.phase === "prompt-entry" && room.round) {
      const booklet = room.round.booklets.find((b) => b.ownerName === identity.playerName);
      if (booklet && booklet.pages.length === 0) submitCustomPrompt(room, identity.playerName, "");
      if (customPromptsComplete(room)) { startCountdown(room); scheduleCountdown(room); }
    }
    if (room.phase === "word-reveal" && room.round) {
      submitWordReveal(room, identity.playerName);
      if (wordRevealComplete(room)) { startCountdown(room); scheduleCountdown(room); }
    }
    broadcastRoom(room);
  });
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

server.listen(PORT, () => console.log(`InkChain server running on http://localhost:${PORT}`));
