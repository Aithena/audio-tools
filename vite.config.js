import { defineConfig } from "vite";

const mossProxy = {
  "/moss-tts": {
    target: "http://127.0.0.1:18083",
    changeOrigin: true,
    timeout: 600000,
    proxyTimeout: 600000,
    rewrite: (path) => path.replace(/^\/moss-tts/, ""),
    configure(proxy) {
      proxy.on("error", (error, _req, res) => {
        if (!res || typeof res.writeHead !== "function" || res.headersSent) return;
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error: "本机 18083 未启动。请先运行 moss-tts-nano serve --backend onnx",
            detail: error.code || error.message,
          }),
        );
      });
    },
  },
};

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/audio-tools/" : "/",
  server: {
    port: 18808,
    strictPort: true,
    proxy: mossProxy,
  },
  preview: {
    port: 18808,
    strictPort: true,
    proxy: mossProxy,
  },
});
