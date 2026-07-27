import { io } from "socket.io-client";

const localDevServer = `${window.location.protocol}//${window.location.hostname}:3001`;
const sameOriginServer = window.location.origin;
const serverUrl = import.meta.env.VITE_SERVER_URL ?? (window.location.port === "5173" ? localDevServer : sameOriginServer);

export const socket = io(serverUrl, {
  autoConnect: true,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 20000
});
