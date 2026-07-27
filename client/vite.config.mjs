import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["@vitejs/plugin-react", "react", "react/jsx-dev-runtime", "react-dom/client", "qrcode.react", "socket.io-client"]
  }
});
