const DEMO_VOICES = [
  {
    id: "demo-3",
    name: "台湾腔",
    sample: "唉你知道吗，今天真的有够热欸，我一出门就觉得整个人快融化了啦。不过还好买到珍奶，心情就有比较好一点这样。",
  },
  {
    id: "demo-2",
    name: "深夜温柔晚安",
    sample: "夜深了，城市的灯一盏一盏慢慢安静下来，你也终于有了一点属于自己的时间。晚安，愿你在柔软的梦里，被温柔地接住。",
  },
];

const SAMPLE = DEMO_VOICES[0].sample;

const SETUP = `cd D:\\Apps\\MOSS-TTS-Nano
py -3.10 -m venv .venv
.venv\\Scripts\\python -m pip install -U pip
.venv\\Scripts\\python -m pip install -e .
.venv\\Scripts\\moss-tts-nano serve --backend onnx`;

const STORAGE_KEY = "audio-tools.moss-tts-endpoint";
const PLAY_KEY = "audio-tools.moss-tts-play-mode";
const DEMO_KEY = "audio-tools.moss-tts-demo";
const ACCEPT = "audio/*,.wav,.mp3,.flac,.m4a,.ogg,.opus,.aac,.webm";
const IDLE_PEAKS = new Array(48).fill(0.08);

function defaultEndpoint() {
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "/moss-tts";
  return "http://127.0.0.1:18083";
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function normalizeBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveBase(value) {
  const base = normalizeBase(value) || defaultEndpoint();
  const localPage = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (localPage && /^https?:\/\/(?:127\.0\.0\.1|localhost):18083$/i.test(base)) {
    return "/moss-tts";
  }
  return base;
}

function joinUrl(base, path) {
  const root = resolveBase(base);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${root}${suffix}`;
}

function resolveApiUrl(base, url) {
  if (!url) return joinUrl(base, "/");
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if ((parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") && parsed.port === "18083") {
        return joinUrl(base, `${parsed.pathname}${parsed.search}`);
      }
    } catch {
      return url;
    }
    return url;
  }
  return joinUrl(base, url);
}

function isAbortError(error) {
  return error?.name === "AbortError" || /aborted|abort/i.test(error?.message || "");
}

function mergeUint8Arrays(a, b) {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

const OFFLINE_MSG = "本机 18083 未启动。请先运行 moss-tts-nano serve --backend onnx";

function parseError(text, status) {
  const raw = String(text || "").trim();
  if (!raw) return status === 500 || status === 502 || status === 503 || status === 504 ? OFFLINE_MSG : `HTTP ${status}`;
  if (/Internal Server Error/i.test(raw) && !raw.startsWith("{")) {
    return "服务端合成失败。若刚改过配置，请等本地服务重启后再试。";
  }
  try {
    const data = JSON.parse(raw);
    return data.error || data.detail || data.message || raw;
  } catch {
    return raw.length > 180 ? `HTTP ${status}` : raw;
  }
}

function isOfflineError(error) {
  const message = error?.message || String(error || "");
  return /ECONNREFUSED|ENOTFOUND|ECONNRESET|Failed to fetch|NetworkError|未启动|^HTTP 50[0234]$/i.test(message);
}

function friendlyError(error) {
  return isOfflineError(error) ? OFFLINE_MSG : error?.message || String(error);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(parseError(text, response.status));
  }
  return text ? JSON.parse(text) : {};
}

function base64ToBlob(base64Value, mimeType) {
  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function encodeWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + frameCount * blockAlign);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + frameCount * blockAlign, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, frameCount * blockAlign, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function encodeWavFromPcmS16(pcmBytes, sampleRate, channels) {
  const bytesPerFrame = channels * 2;
  const frameCount = Math.floor(pcmBytes.byteLength / bytesPerFrame);
  const dataSize = frameCount * bytesPerFrame;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcmBytes.subarray(0, dataSize));
  return new Blob([buffer], { type: "audio/wav" });
}

function peaksFromPcmChunk(pcm, channels, sampleRate) {
  const bytesPerFrame = channels * 2;
  const frames = Math.floor(pcm.byteLength / bytesPerFrame);
  if (frames <= 0) return [];
  const view = new DataView(pcm.buffer, pcm.byteOffset, frames * bytesPerFrame);
  const bars = Math.max(2, Math.round((frames / sampleRate) * 28));
  const size = Math.ceil(frames / bars);
  const peaks = [];
  for (let i = 0; i < bars; i += 1) {
    let max = 0;
    const start = i * size;
    const end = Math.min(frames, start + size);
    for (let frame = start; frame < end; frame += 1) {
      const sample = Math.abs(view.getInt16(frame * bytesPerFrame, true) / 32768);
      if (sample > max) max = sample;
    }
    peaks.push(max);
  }
  return peaks;
}

async function blobToWavFile(blob, name) {
  const context = new AudioContext();
  try {
    const audioBuffer = await context.decodeAudioData(await blob.arrayBuffer());
    const wav = encodeWav(audioBuffer);
    return new File([wav], name.replace(/\.[^.]+$/, "") + ".wav", { type: "audio/wav" });
  } finally {
    await context.close();
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function drawWaveform(canvas, peaks, progress = 0) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;

  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(125, 205, 196, 0.06)";
  ctx.fillRect(0, 0, width, height);

  const mid = height / 2;
  const count = peaks.length;
  const gap = 1.4;
  const barWidth = Math.max(1.2, width / count - gap);

  for (let i = 0; i < count; i += 1) {
    const x = (i / count) * width;
    const amp = Math.max(2, peaks[i] * (height * 0.72));
    const played = i / count <= progress;
    ctx.fillStyle = played ? "#7dcdc4" : "rgba(125, 205, 196, 0.28)";
    ctx.fillRect(x, mid - amp / 2, barWidth, amp);
  }

  if (progress > 0 && progress < 1) {
    const x = progress * width;
    ctx.strokeStyle = "rgba(231, 241, 238, 0.55)";
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, height - 10);
    ctx.stroke();
  }
}

async function peaksFromWav(blob, bars = 120) {
  const context = new AudioContext();
  try {
    const audioBuffer = await context.decodeAudioData(await blob.arrayBuffer());
    const data = audioBuffer.getChannelData(0);
    const size = Math.ceil(data.length / bars);
    const peaks = [];
    for (let i = 0; i < bars; i += 1) {
      let max = 0;
      const start = i * size;
      const end = Math.min(data.length, start + size);
      for (let j = start; j < end; j += 1) {
        max = Math.max(max, Math.abs(data[j]));
      }
      peaks.push(max);
    }
    return peaks;
  } finally {
    await context.close();
  }
}

export function mountMossTtsNano(root) {
  const savedEndpoint = localStorage.getItem(STORAGE_KEY);
  const initialEndpoint = savedEndpoint || defaultEndpoint();

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">合成</div>
        <div class="hint">Ctrl + Enter 生成</div>
      </div>
      <details class="setup" id="setup-panel">
        <summary>本机尚未启动？展开部署步骤</summary>
        <div class="setup-body">
          <ol>
            <li>本机只有 Python 3.10，用它即可（官方要求 ≥ 3.10）。</li>
            <li>启动后保持终端开着，首次会下载模型。</li>
            <li>本页通过 Vite 代理访问 <code>127.0.0.1:18083</code>。</li>
          </ol>
          <pre>${SETUP}</pre>
        </div>
      </details>
      <div class="field-row">
        <span class="dot" id="conn-dot"></span>
        <span class="field-label">服务</span>
        <input
          id="endpoint"
          class="field-control"
          type="text"
          spellcheck="false"
          value="${escapeAttr(initialEndpoint)}"
          placeholder="/moss-tts"
        />
        <button type="button" class="btn" id="btn-ping">检测</button>
      </div>
      <div class="input-area">
        <textarea id="tts-text" spellcheck="false" placeholder="输入要合成的文本，支持中英混合">${SAMPLE}</textarea>
      </div>
      <div class="drop-wrap">
        <input id="prompt-file" type="file" accept="${ACCEPT}" hidden />
        <button type="button" class="drop-zone" id="drop-zone">
          <span class="drop-title" id="drop-title">参考音色（可选）</span>
          <span class="drop-sub">默认台湾腔；也可选深夜温柔晚安，或拖入 wav / mp3、点击录音。</span>
          <span class="drop-file" id="drop-file" hidden></span>
        </button>
      </div>
      <div class="ops">
        <div class="opts">
          <div class="opt">
            <span>音色</span>
            <div class="seg" id="voice-seg">
              <button type="button" data-voice="demo" class="active">内置示例</button>
              <button type="button" data-voice="file">本地参考</button>
            </div>
          </div>
          <div class="opt" id="demo-opt">
            <span>内置</span>
            <div class="seg" id="demo-seg">
              ${DEMO_VOICES.map(
                (voice) => `
                  <button type="button" data-demo="${voice.id}">${voice.name}</button>
                `,
              ).join("")}
            </div>
          </div>
          <div class="opt">
            <span>播放</span>
            <div class="seg" id="play-seg">
              <button type="button" data-play="stream">流式</button>
              <button type="button" data-play="full">整段</button>
            </div>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="btn-generate">生成</button>
          <button type="button" class="btn" id="btn-record">录音</button>
          <button type="button" class="btn btn-ghost" id="btn-sample">示例</button>
          <button type="button" class="btn btn-ghost" id="btn-clear">清空</button>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">结果</div>
        <div class="panel-actions">
          <button type="button" class="btn" id="btn-download" disabled>下载 wav</button>
        </div>
      </div>
      <div class="audio-stage">
        <div class="wave-wrap">
          <canvas id="wave"></canvas>
          <div class="wave-empty" id="wave-empty">生成的语音会显示在这里</div>
        </div>
        <div class="player">
          <audio id="player" controls></audio>
        </div>
      </div>
      <div class="status" id="tts-status">等待连接本地服务</div>
    </section>
  `;

  const textInput = root.querySelector("#tts-text");
  const endpointInput = root.querySelector("#endpoint");
  const connDot = root.querySelector("#conn-dot");
  const dropZone = root.querySelector("#drop-zone");
  const dropTitle = root.querySelector("#drop-title");
  const dropFile = root.querySelector("#drop-file");
  const fileInput = root.querySelector("#prompt-file");
  const voiceSeg = root.querySelector("#voice-seg");
  const demoOpt = root.querySelector("#demo-opt");
  const demoSeg = root.querySelector("#demo-seg");
  const playSeg = root.querySelector("#play-seg");
  const player = root.querySelector("#player");
  const canvas = root.querySelector("#wave");
  const waveEmpty = root.querySelector("#wave-empty");
  const status = root.querySelector("#tts-status");
  const generateBtn = root.querySelector("#btn-generate");
  const recordBtn = root.querySelector("#btn-record");
  const downloadBtn = root.querySelector("#btn-download");
  const setupPanel = root.querySelector("#setup-panel");

  let voiceMode = "demo";
  let demoId = localStorage.getItem(DEMO_KEY) || DEMO_VOICES[0].id;
  if (!DEMO_VOICES.some((voice) => voice.id === demoId)) demoId = DEMO_VOICES[0].id;
  let playMode = localStorage.getItem(PLAY_KEY) === "full" ? "full" : "stream";
  let promptFile = null;
  let objectUrl = "";
  let peaks = [];
  let recorder = null;
  let recordChunks = [];
  let pingTimer = 0;
  let running = false;
  let abortController = null;
  let streamId = "";
  let statusTimer = 0;
  let waveRaf = 0;
  let audioContext = null;
  let nextPlaybackTime = 0;
  let streamStartAt = null;
  let streamDuration = 0;

  function setStatus(type, text) {
    status.className = `status${type ? ` ${type}` : ""}`;
    status.textContent = text;
  }

  function setDot(type) {
    connDot.className = `dot${type ? ` ${type}` : ""}`;
  }

  function currentDemo() {
    return DEMO_VOICES.find((voice) => voice.id === demoId) ?? DEMO_VOICES[0];
  }

  function setDemoId(next) {
    const matched = DEMO_VOICES.find((voice) => voice.id === next) ?? DEMO_VOICES[0];
    demoId = matched.id;
    localStorage.setItem(DEMO_KEY, demoId);
    demoSeg.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.demo === demoId);
    });
    dropTitle.textContent = `内置音色：${matched.name}`;
  }

  function setVoiceMode(next) {
    voiceMode = next;
    voiceSeg.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.voice === next);
    });
    demoOpt.hidden = next !== "demo";
    if (next === "demo") {
      dropTitle.textContent = `内置音色：${currentDemo().name}`;
      if (!promptFile) {
        dropFile.hidden = true;
      }
    }
  }

  function setPlayMode(next) {
    playMode = next === "full" ? "full" : "stream";
    localStorage.setItem(PLAY_KEY, playMode);
    playSeg.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.play === playMode);
    });
  }

  function setPromptFile(file) {
    promptFile = file;
    if (!file) {
      dropFile.hidden = true;
      dropTitle.textContent = "参考音色（可选）";
      return;
    }
    setVoiceMode("file");
    dropFile.hidden = false;
    dropFile.textContent = `${file.name} · ${formatSize(file.size)}`;
    dropTitle.textContent = "已选择参考音，可再次拖入替换";
  }

  function setBusy(busy) {
    running = busy;
    generateBtn.textContent = busy ? "停止" : "生成";
    generateBtn.classList.toggle("btn-primary", !busy);
    recordBtn.disabled = busy;
  }

  function stopWaveLoop() {
    if (waveRaf) {
      cancelAnimationFrame(waveRaf);
      waveRaf = 0;
    }
  }

  function startWaveLoop() {
    if (waveRaf) return;
    const tick = () => {
      renderWave();
      waveRaf = requestAnimationFrame(tick);
    };
    waveRaf = requestAnimationFrame(tick);
  }

  function setWaveEmpty(text, live = false) {
    waveEmpty.hidden = false;
    waveEmpty.textContent = text;
    waveEmpty.classList.toggle("live", live);
  }

  function attachWav(blob, { autoplay = false } = {}) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    player.src = objectUrl;
    downloadBtn.disabled = false;
    if (autoplay) player.play().catch(() => {});
  }

  function clearAudio() {
    stopWaveLoop();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    peaks = [];
    streamStartAt = null;
    streamDuration = 0;
    player.removeAttribute("src");
    player.load();
    downloadBtn.disabled = true;
    setWaveEmpty("生成的语音会显示在这里");
    drawWaveform(canvas, IDLE_PEAKS, 0);
  }

  function streamProgress() {
    if (!audioContext || streamStartAt == null || streamDuration <= 0) return 0;
    return Math.min(1, Math.max(0, (audioContext.currentTime - streamStartAt) / streamDuration));
  }

  function renderWave() {
    if (!peaks.length) {
      drawWaveform(canvas, IDLE_PEAKS, 0);
      return;
    }
    waveEmpty.hidden = true;
    const progress = audioContext ? streamProgress() : player.duration ? player.currentTime / player.duration : 0;
    drawWaveform(canvas, peaks, progress);
  }

  async function ping() {
    const base = resolveBase(endpointInput.value);
    endpointInput.value = base;
    localStorage.setItem(STORAGE_KEY, base);
    setDot("busy");
    setStatus("", "正在检测本地服务…");
    try {
      const health = await fetchJson(joinUrl(base, "/health"));
      let extra = health.device ? ` · ${health.device}` : "";
      try {
        const warmup = await fetchJson(joinUrl(base, "/api/warmup-status"));
        extra += warmup.status_text ? ` · ${warmup.status_text}` : "";
      } catch {
        /* warmup 接口因版本可能不存在 */
      }
      setDot("ok");
      setStatus("ok", `已连接${extra}`);
      if (setupPanel) setupPanel.open = false;
      return true;
    } catch (error) {
      setDot("err");
      if (setupPanel) setupPanel.open = true;
      setStatus("err", friendlyError(error));
      return false;
    }
  }

  function buildFormData() {
    const formData = new FormData();
    formData.append("text", textInput.value.trim());
    if (voiceMode === "file" && promptFile) {
      formData.append("prompt_audio", promptFile, promptFile.name);
    } else {
      formData.append("demo_id", currentDemo().id);
    }
    formData.append("enable_text_normalization", "0");
    formData.append("enable_normalize_tts_text", "1");
    return formData;
  }

  function schedulePcmChunk(pcmChunk, sampleRate, channels) {
    if (!audioContext || pcmChunk.byteLength <= 0) return;
    const bytesPerFrame = channels * 2;
    const totalFrames = Math.floor(pcmChunk.byteLength / bytesPerFrame);
    if (totalFrames <= 0) return;

    const buffer = audioContext.createBuffer(channels, totalFrames, sampleRate);
    const view = new DataView(pcmChunk.buffer, pcmChunk.byteOffset, totalFrames * bytesPerFrame);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let frame = 0; frame < totalFrames; frame += 1) {
        data[frame] = view.getInt16((frame * channels + channel) * 2, true) / 32768;
      }
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    const now = audioContext.currentTime;
    const startAt = Math.max(nextPlaybackTime || now + 0.08, now + 0.02);
    source.start(startAt);
    nextPlaybackTime = startAt + buffer.duration;
    if (streamStartAt == null) streamStartAt = startAt;
    streamDuration = Math.max(streamDuration, nextPlaybackTime - streamStartAt);
  }

  async function closeStream(base) {
    if (statusTimer) {
      window.clearInterval(statusTimer);
      statusTimer = 0;
    }
    abortController?.abort();
    abortController = null;
    if (streamId) {
      const id = streamId;
      streamId = "";
      fetch(joinUrl(base, `/api/generate-stream/${encodeURIComponent(id)}/close`), {
        method: "POST",
      }).catch(() => {});
    }
    stopWaveLoop();
    if (audioContext) {
      try {
        await audioContext.close();
      } catch {
        /* already closed */
      }
      audioContext = null;
    }
    nextPlaybackTime = 0;
    streamStartAt = null;
    streamDuration = 0;
  }

  async function applyWav(blob, message, { autoplay = false } = {}) {
    attachWav(blob, { autoplay });
    try {
      peaks = await peaksFromWav(blob);
    } catch {
      /* keep streaming peaks */
    }
    renderWave();
    setDot("ok");
    setStatus("ok", message);
  }

  async function generateBuffered(base) {
    const data = await fetchJson(joinUrl(base, "/api/generate"), {
      method: "POST",
      body: buildFormData(),
      signal: abortController.signal,
    });
    if (!data.audio_base64) throw new Error("服务未返回音频");
    const blob = base64ToBlob(data.audio_base64, "audio/wav");
    const bits = [data.run_status || "合成完成"];
    if (data.sample_rate) bits.push(`${data.sample_rate} Hz`);
    await applyWav(blob, bits.join(" · "), { autoplay: true });
  }

  async function generateStream(base) {
    let startData;
    try {
      startData = await fetchJson(joinUrl(base, "/api/generate-stream/start"), {
        method: "POST",
        body: buildFormData(),
        signal: abortController.signal,
      });
    } catch (error) {
      if (isAbortError(error) || isOfflineError(error)) throw error;
      setStatus("", "流式接口不可用，改为整段合成…");
      await generateBuffered(base);
      return;
    }

    streamId = startData.stream_id || "";
    const channels = Number(startData.channels || 2);
    const sampleRate = Number(startData.sample_rate || 48000);
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error("当前浏览器不支持流式播放");

    try {
      audioContext = new AudioContextCtor({ sampleRate });
    } catch {
      audioContext = new AudioContextCtor();
    }
    await audioContext.resume();
    nextPlaybackTime = audioContext.currentTime + 0.08;
    setWaveEmpty("正在流出音频…", true);
    startWaveLoop();

    const pollStatus = async () => {
      if (!streamId) return;
      try {
        const snapshot = await fetchJson(resolveApiUrl(base, startData.status_url));
        if (snapshot.failed) throw new Error(snapshot.error || snapshot.status_text || "流式合成失败");
        const bits = [snapshot.status_text || snapshot.run_status || "流式合成中"];
        if (snapshot.first_audio_latency_seconds != null) {
          bits.push(`首包 ${Number(snapshot.first_audio_latency_seconds).toFixed(2)}s`);
        }
        if (snapshot.emitted_audio_seconds != null) {
          bits.push(`已出 ${Number(snapshot.emitted_audio_seconds).toFixed(1)}s`);
        }
        setStatus("", bits.join(" · "));
      } catch (error) {
        if (!isAbortError(error) && streamId) setStatus("err", error.message);
      }
    };
    statusTimer = window.setInterval(pollStatus, 400);
    await pollStatus();

    const response = await fetch(resolveApiUrl(base, startData.audio_url), {
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error(parseError(await response.text(), response.status));
    if (!response.body) throw new Error("浏览器无法读取音频流");

    const reader = response.body.getReader();
    const bytesPerFrame = channels * 2;
    let remainder = new Uint8Array(0);
    const pcmParts = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      const merged = mergeUint8Arrays(remainder, value);
      const alignedLength = Math.floor(merged.length / bytesPerFrame) * bytesPerFrame;
      if (alignedLength <= 0) {
        remainder = merged;
        continue;
      }
      const aligned = merged.subarray(0, alignedLength).slice();
      pcmParts.push(aligned);
      peaks.push(...peaksFromPcmChunk(aligned, channels, sampleRate));
      schedulePcmChunk(aligned, sampleRate, channels);
      remainder = merged.subarray(alignedLength).slice();
    }

    let result = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      result = await fetchJson(resolveApiUrl(base, startData.result_url), {
        signal: abortController.signal,
      });
      if (result.ready) break;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    let blob = null;
    if (result?.audio_base64) {
      blob = base64ToBlob(result.audio_base64, "audio/wav");
    } else if (pcmParts.length) {
      const total = pcmParts.reduce((sum, part) => sum + part.length, 0);
      const pcm = new Uint8Array(total);
      let offset = 0;
      for (const part of pcmParts) {
        pcm.set(part, offset);
        offset += part.length;
      }
      blob = encodeWavFromPcmS16(pcm, sampleRate, channels);
    }
    if (!blob) throw new Error(result?.error || "流式结束但没有音频");

    setStatus("", "正在播放流式音频…");
    while (audioContext && nextPlaybackTime - audioContext.currentTime > 0.05) {
      if (abortController?.signal.aborted) break;
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }

    const bits = [result?.run_status || result?.stream_metrics || "流式完成"];
    if (result?.sample_rate || sampleRate) bits.push(`${result?.sample_rate || sampleRate} Hz`);
    await applyWav(blob, bits.join(" · "));
  }

  async function generate() {
    if (running) {
      abortController?.abort();
      return;
    }

    const text = textInput.value.trim();
    if (!text) {
      setStatus("err", "请输入要合成的文本");
      return;
    }
    if (voiceMode === "file" && !promptFile) {
      setStatus("err", "请上传或录制一段参考音");
      return;
    }

    const base = resolveBase(endpointInput.value);
    abortController = new AbortController();
    setBusy(true);
    setDot("busy");
    clearAudio();
    setStatus("", playMode === "stream" ? "正在启动流式合成…" : "正在合成，首次推理可能较慢…");

    try {
      if (playMode === "stream") await generateStream(base);
      else await generateBuffered(base);
    } catch (error) {
      if (isAbortError(error)) {
        setDot("");
        setStatus("", "已停止");
      } else {
        setDot("err");
        setStatus("err", friendlyError(error));
      }
    } finally {
      await closeStream(base);
      setBusy(false);
    }
  }

  async function startRecord() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordChunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) recordChunks.push(event.data);
    });
    recorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      recordBtn.textContent = "录音";
      try {
        const blob = new Blob(recordChunks, { type: recorder.mimeType || "audio/webm" });
        const file = await blobToWavFile(blob, "prompt-record.wav");
        setPromptFile(file);
        setStatus("ok", `已录制参考音 · ${formatSize(file.size)}`);
      } catch (error) {
        setStatus("err", `录音转换失败：${error.message}`);
      } finally {
        recorder = null;
      }
    });
    recorder.start();
    recordBtn.textContent = "停止";
    setStatus("", "正在录音，再次点击停止");
  }

  function stopRecord() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  voiceSeg.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-voice]");
    if (!button) return;
    setVoiceMode(button.dataset.voice);
  });
  demoSeg.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-demo]");
    if (!button || running) return;
    setDemoId(button.dataset.demo);
  });
  playSeg.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-play]");
    if (!button || running) return;
    setPlayMode(button.dataset.play);
  });

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) setPromptFile(file);
    fileInput.value = "";
  });
  for (const eventName of ["dragover", "drop"]) {
    dropZone.addEventListener(eventName, (event) => event.preventDefault());
  }
  dropZone.addEventListener("dragover", () => dropZone.classList.add("over"));
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
  dropZone.addEventListener("drop", (event) => {
    dropZone.classList.remove("over");
    const file = event.dataTransfer?.files?.[0];
    if (file) setPromptFile(file);
  });

  root.querySelector("#btn-ping").addEventListener("click", ping);
  generateBtn.addEventListener("click", generate);
  recordBtn.addEventListener("click", async () => {
    if (recorder) {
      stopRecord();
      return;
    }
    try {
      await startRecord();
    } catch (error) {
      setStatus("err", `无法使用麦克风：${error.message}`);
    }
  });
  root.querySelector("#btn-sample").addEventListener("click", () => {
    textInput.value = currentDemo().sample;
    textInput.focus();
  });
  root.querySelector("#btn-clear").addEventListener("click", () => {
    if (running) abortController?.abort();
    textInput.value = "";
    setPromptFile(null);
    setVoiceMode("demo");
    clearAudio();
    setStatus("", "已清空");
    textInput.focus();
  });
  downloadBtn.addEventListener("click", () => {
    if (!objectUrl) return;
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "moss-tts-nano.wav";
    link.click();
  });
  player.addEventListener("timeupdate", renderWave);
  player.addEventListener("ended", renderWave);
  window.addEventListener("resize", renderWave);
  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      generate();
    }
  });
  endpointInput.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY, resolveBase(endpointInput.value));
  });

  setDemoId(demoId);
  setPlayMode(playMode);
  clearAudio();
  pingTimer = window.setTimeout(ping, 200);

  return () => {
    window.clearTimeout(pingTimer);
    window.removeEventListener("resize", renderWave);
    abortController?.abort();
    closeStream(resolveBase(endpointInput.value));
    stopRecord();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
}
