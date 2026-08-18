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

const cloudProxy = {
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
    proxy: cloudProxy,
  },
  preview: {
    port: 18808,
    strictPort: true,
    proxy: cloudProxy,
  },
});
