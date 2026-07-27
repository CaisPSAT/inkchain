import net from "node:net";
import tls from "node:tls";
import type { Room } from "./types.js";

const ROOM_KEY_PREFIX = "inkchain:room:";
const ROOM_TTL_SECONDS = 24 * 60 * 60;

type PendingCommand = {
  resolve: (value: RedisValue) => void;
  reject: (error: Error) => void;
};

type RedisValue = string | number | null | RedisValue[];

let client: SimpleRedisClient | undefined;
let enabled = false;

class SimpleRedisClient {
  private socket: net.Socket | tls.TLSSocket | undefined;
  private buffer = "";
  private queue: PendingCommand[] = [];

  constructor(private readonly url: URL) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = Number(this.url.port || 6379);
      const options = { host: this.url.hostname, port };
      const socket = this.url.protocol === "rediss:" ? tls.connect(options) : net.connect(options);
      this.socket = socket;
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => this.handleData(chunk));
      socket.on("error", (error) => this.failPending(error));
      socket.once("error", reject);
      socket.once("connect", async () => {
        try {
          if (this.url.password) await this.command("AUTH", decodeURIComponent(this.url.password));
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  command(...parts: string[]): Promise<RedisValue> {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error("Redis socket is not connected."));
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.socket!.write(encodeCommand(parts));
    });
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    while (this.queue.length) {
      const parsed = parseRedisValue(this.buffer);
      if (!parsed) return;
      this.buffer = this.buffer.slice(parsed.offset);
      const pending = this.queue.shift()!;
      if (parsed.error) pending.reject(parsed.error);
      else pending.resolve(parsed.value);
    }
  }

  private failPending(error: Error): void {
    while (this.queue.length) this.queue.shift()!.reject(error);
  }
}

function encodeCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}

function parseRedisValue(input: string, start = 0): { value: RedisValue; offset: number; error?: Error } | null {
  if (start >= input.length) return null;
  const type = input[start];
  const lineEnd = input.indexOf("\r\n", start);
  if (lineEnd === -1) return null;
  const line = input.slice(start + 1, lineEnd);
  const next = lineEnd + 2;

  if (type === "+") return { value: line, offset: next };
  if (type === "-") return { value: null, offset: next, error: new Error(line) };
  if (type === ":") return { value: Number(line), offset: next };
  if (type === "$") {
    const length = Number(line);
    if (length === -1) return { value: null, offset: next };
    const end = next + length;
    if (input.length < end + 2) return null;
    return { value: input.slice(next, end), offset: end + 2 };
  }
  if (type === "*") {
    const count = Number(line);
    if (count === -1) return { value: null, offset: next };
    const values: RedisValue[] = [];
    let offset = next;
    for (let i = 0; i < count; i += 1) {
      const parsed = parseRedisValue(input, offset);
      if (!parsed) return null;
      if (parsed.error) return parsed;
      values.push(parsed.value);
      offset = parsed.offset;
    }
    return { value: values, offset };
  }
  return { value: null, offset: next, error: new Error(`Unsupported Redis reply type ${type}`) };
}

function roomKey(code: string): string {
  return `${ROOM_KEY_PREFIX}${code}`;
}

function serializeRoom(room: Room): string {
  return JSON.stringify(room, (key, value) => key === "timerHandle" ? undefined : value);
}

export async function initPersistence(onRoom: (room: Room) => void): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  try {
    client = new SimpleRedisClient(new URL(redisUrl));
    await client.connect();
    enabled = true;
    const keys = await client.command("KEYS", `${ROOM_KEY_PREFIX}*`);
    const roomKeys = Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : [];
    for (const key of roomKeys) {
      const raw = await client.command("GET", key);
      if (typeof raw !== "string") continue;
      try {
        onRoom(JSON.parse(raw) as Room);
      } catch (error) {
        console.warn(`Skipped corrupt room snapshot ${key}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    console.log(`Redis persistence enabled. Restored ${roomKeys.length} room snapshot(s).`);
  } catch (error) {
    enabled = false;
    console.warn(`Redis persistence disabled: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export function persistRoom(room: Room): void {
  if (!enabled || !client) return;
  client.command("SET", roomKey(room.code), serializeRoom(room), "EX", String(ROOM_TTL_SECONDS)).catch((error) => {
    console.warn(`Unable to persist room ${room.code}: ${error instanceof Error ? error.message : "unknown error"}`);
  });
}
