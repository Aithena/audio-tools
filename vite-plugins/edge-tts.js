import { createHash, randomUUID, randomBytes } from "node:crypto";
import WebSocket from "ws";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600;
const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

let clockSkewSeconds = 0;

function generateSecMsGec() {
  let ticks = Date.now() / 1000 + clockSkewSeconds + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks = Math.floor(ticks * 1e7);
  return createHash("sha256")
    .update(`${ticks}${TRUSTED_CLIENT_TOKEN}`, "ascii")
    .digest("hex")
    .toUpperCase();
}

function connectId() {
  return randomUUID().replaceAll("-", "");
}

function dateToString() {
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

function ratePercent(speed) {
  const delta = Math.round((Number(speed) - 1) * 100);
  if (!Number.isFinite(delta)) return "+0%";
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

function cleanText(text) {
  return String(text || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function splitText(text, maxBytes = 4096) {
  const encoder = new TextEncoder();
  const chunks = [];
  let remaining = String(text || "").trim();
  while (encoder.encode(remaining).length > maxBytes) {
    let cut = remaining.lastIndexOf("\n", 1800);
    if (cut < 200) cut = remaining.lastIndexOf("。", 1800);
    if (cut < 200) cut = remaining.lastIndexOf(" ", 1800);
    if (cut < 200) cut = 1800;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function parseHeaders(raw) {
  const headers = {};
  for (const line of String(raw).split("\r\n")) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    headers[line.slice(0, index)] = line.slice(index + 1);
  }
  return headers;
}

function mkssml(voice, text, rate) {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${cleanText(text)}</prosody>` +
    `</voice></speak>`
  );
}

function applyClockSkew(dateHeader) {
  const serverDate = Date.parse(dateHeader);
  if (!Number.isFinite(serverDate)) return;
  clockSkewSeconds += serverDate / 1000 - Date.now() / 1000;
}

function synthesizeChunk(text, voice, rate) {
  return new Promise((resolve, reject) => {
    const url =
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&ConnectionId=${connectId()}` +
      `&Sec-MS-GEC=${generateSecMsGec()}` +
      `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const chunks = [];
    let settled = false;
    const finish = (error, audio) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      if (error) reject(error);
      else resolve(audio);
    };

    const ws = new WebSocket(url, {
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": USER_AGENT,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Cookie: `muid=${randomBytes(16).toString("hex").toUpperCase()};`,
      },
    });

    const timer = setTimeout(() => finish(new Error("Edge TTS 超时")), 45000);

    ws.on("unexpected-response", (_req, res) => {
      const dateHeader = res.headers.date;
      if (res.statusCode === 403 && dateHeader) applyClockSkew(dateHeader);
      finish(new Error(`Edge TTS 握手失败 HTTP ${res.statusCode}`));
    });

    ws.on("error", (error) => finish(error));

    ws.on("open", () => {
      ws.send(
        `X-Timestamp:${dateToString()}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},` +
          `"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`,
      );
      ws.send(
        `X-RequestId:${connectId()}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${dateToString()}Z\r\n` +
          `Path:ssml\r\n\r\n` +
          mkssml(voice, text, rate),
      );
    });

    ws.on("message", (raw, isBinary) => {
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (isBinary || buffer.includes(0)) {
        if (buffer.length < 2) return;
        const headerLength = buffer.readUInt16BE(0);
        if (headerLength + 2 > buffer.length) return;
        const headerText = buffer.subarray(2, 2 + headerLength).toString("utf8");
        const body = buffer.subarray(2 + headerLength);
        const headers = parseHeaders(headerText);
        if ((headers.Path || headers.path) !== "audio") return;
        if (body.length) chunks.push(body);
        return;
      }

      const textMessage = buffer.toString("utf8");
      const headerEnd = textMessage.indexOf("\r\n\r\n");
      const headers = parseHeaders(headerEnd >= 0 ? textMessage.slice(0, headerEnd) : textMessage);
      const path = headers.Path || headers.path;
      if (path === "turn.end") {
        if (!chunks.length) finish(new Error("Edge TTS 未返回音频"));
        else finish(null, Buffer.concat(chunks));
      }
    });

    ws.on("close", () => {
      if (!settled && chunks.length) finish(null, Buffer.concat(chunks));
      else if (!settled) finish(new Error("Edge TTS 连接已关闭"));
    });
  });
}

export async function synthesizeEdgeTts({ text, voice, rate }) {
  const parts = splitText(text);
  if (!parts.length) throw new Error("文本为空");
  const audio = [];
  let lastError;
  for (const part of parts) {
    try {
      audio.push(await synthesizeChunk(part, voice, ratePercent(rate)));
    } catch (error) {
      lastError = error;
      audio.push(await synthesizeChunk(part, voice, ratePercent(rate)));
    }
  }
  if (!audio.length) throw lastError || new Error("Edge TTS 合成失败");
  return Buffer.concat(audio);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function edgeTtsPlugin() {
  async function handle(req, res) {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const text = String(body.text || "").trim();
      const voice = String(body.voice || "zh-TW-HsiaoChenNeural").trim();
      if (!text) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "text is required" }));
        return;
      }
      const audio = await synthesizeEdgeTts({ text, voice, rate: body.rate });
      res.statusCode = 200;
      res.setHeader("Content-Type", "audio/mpeg");
      res.end(audio);
    } catch (error) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: error.message || "Edge TTS 失败" }));
    }
  }

  return {
    name: "edge-tts",
    configureServer(server) {
      server.middlewares.use("/edge-tts", (req, res, next) => {
        handle(req, res).catch(next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/edge-tts", (req, res, next) => {
        handle(req, res).catch(next);
      });
    },
  };
}
