import { defineConfig } from "vite";
import { edgeTtsPlugin } from "./vite-plugins/edge-tts.js";

function isAllowedAudioHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "dashscope.aliyuncs.com" || host.endsWith(".aliyuncs.com");
}

function cloudAudioProxy() {
  async function handle(req, res) {
    const target = new URL(req.url, "http://127.0.0.1").searchParams.get("url");
    let parsed;
    try {
      parsed = new URL(target || "");
    } catch {
      parsed = null;
    }
    if (!parsed || !isAllowedAudioHost(parsed.hostname)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "不允许的音频地址" }));
      return;
    }

    try {
      const upstream = await fetch(parsed.toString());
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/wav");
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "音频下载失败", detail: error.message }));
    }
  }

  return {
    name: "cloud-audio-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = String(req.url || "").split("?")[0];
        if (path !== "/cloud-audio") return next();
        handle(req, res).catch(next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = String(req.url || "").split("?")[0];
        if (path !== "/cloud-audio") return next();
        handle(req, res).catch(next);
      });
    },
  };
}

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
            error: "本机 18083 未启动。请先运行 moss-tts-nano serve --backend onnx --execution-provider cuda",
            detail: error.code || error.message,
          }),
        );
      });
    },
  },
  "/dashscope": {
    target: "https://dashscope.aliyuncs.com",
    changeOrigin: true,
    timeout: 120000,
    proxyTimeout: 120000,
    rewrite: (path) => path.replace(/^\/dashscope/, ""),
  },
  "/siliconflow": {
    target: "https://api.siliconflow.cn",
    changeOrigin: true,
    timeout: 120000,
    proxyTimeout: 120000,
    rewrite: (path) => path.replace(/^\/siliconflow/, ""),
  },
};

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/audio-tools/" : "/",
  plugins: [cloudAudioProxy(), edgeTtsPlugin()],
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
