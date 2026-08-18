const SAMPLE =
  "夜深了，城市的灯一盏一盏慢慢安静下来，你也终于有了一点属于自己的时间。晚安，愿你在柔软的梦里，被温柔地接住。";

const PROVIDERS = {
  edge: {
    id: "edge",
    name: "Edge 免费",
    keyHint: "",
    voices: [
      { id: "zh-TW-HsiaoChenNeural", name: "曉臻 · 台湾女" },
      { id: "zh-TW-HsiaoYuNeural", name: "曉雨 · 台湾女" },
      { id: "zh-TW-YunJheNeural", name: "雲哲 · 台湾男" },
      { id: "zh-CN-XiaoxiaoNeural", name: "晓晓 · 普通话女" },
      { id: "zh-CN-XiaoyiNeural", name: "晓伊 · 普通话女" },
      { id: "zh-CN-YunxiNeural", name: "云希 · 普通话男" },
      { id: "zh-CN-YunyangNeural", name: "云扬 · 新闻男" },
      { id: "zh-HK-HiuMaanNeural", name: "曉曼 · 粤语女" },
      { id: "zh-CN-liaoning-XiaobeiNeural", name: "晓北 · 东北女" },
    ],
  },
  dashscope: {
    id: "dashscope",
    name: "阿里云百炼",
    model: "cosyvoice-v3-flash",
    keyHint: "sk-...",
    docs: "https://bailian.console.aliyun.com/",
    voices: [
      { id: "longantai_v3", name: "龙安台 · 台湾女" },
      { id: "longanrou_v3", name: "龙安柔 · 温柔女" },
      { id: "longanhuan_v3", name: "龙安欢 · 元气女" },
      { id: "longanyang", name: "龙安洋 · 阳光男" },
      { id: "longanyun_v3", name: "龙安昀 · 居家男" },
      { id: "longxiaochun_v3", name: "龙小淳 · 知性女" },
      { id: "longxiaoxia_v3", name: "龙小夏 · 沉稳女" },
      { id: "longwan_v3", name: "龙婉 · 细腻女" },
      { id: "longjiaxin_v3", name: "龙嘉欣 · 粤语女" },
      { id: "longlaotie_v3", name: "龙老铁 · 东北男" },
      { id: "longanmin_v3", name: "龙安闽 · 闽南女" },
    ],
  },
  siliconflow: {
    id: "siliconflow",
    name: "硅基流动",
    model: "FunAudioLLM/CosyVoice2-0.5B",
    keyHint: "sk-...",
    docs: "https://cloud.siliconflow.cn/account/ak",
    voices: [
      { id: "claire", name: "Claire · 温柔女" },
      { id: "anna", name: "Anna · 沉稳女" },
      { id: "bella", name: "Bella · 激情女" },
      { id: "diana", name: "Diana · 欢快女" },
      { id: "alex", name: "Alex · 沉稳男" },
      { id: "benjamin", name: "Benjamin · 低沉男" },
      { id: "charles", name: "Charles · 磁性男" },
      { id: "david", name: "David · 欢快男" },
    ],
  },
};

const KEYS = {
  provider: "audio-tools.cloud-tts.provider",
  dashscopeKey: "audio-tools.cloud-tts.dashscope-key",
  siliconflowKey: "audio-tools.cloud-tts.siliconflow-key",
  dashscopeVoice: "audio-tools.cloud-tts.dashscope-voice",
  siliconflowVoice: "audio-tools.cloud-tts.siliconflow-voice",
  edgeVoice: "audio-tools.cloud-tts.edge-voice",
  speed: "audio-tools.cloud-tts.speed",
};

const IDLE_PEAKS = new Array(48).fill(0.08);

function isLocalPage() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function providerRoot(providerId) {
  if (providerId === "dashscope") {
    return isLocalPage() ? "/dashscope" : "https://dashscope.aliyuncs.com";
  }
  return isLocalPage() ? "/siliconflow" : "https://api.siliconflow.cn";
}

function audioProxyUrl(url) {
  if (!isLocalPage()) return url;
  return `/cloud-audio?url=${encodeURIComponent(url)}`;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function parseError(text, status) {
  const raw = String(text || "").trim();
  if (!raw) return status === 401 ? "API Key 无效" : `HTTP ${status}`;
  try {
    const data = JSON.parse(raw);
    const message = data.message || data.error || data.msg || data.code;
    if (data.code === "InvalidApiKey" || status === 401) return "API Key 无效，请到控制台重新复制";
    if (/Arrearage|quota|余额|欠费/i.test(String(message || ""))) return "账号余额不足或已欠费";
    return String(message || raw);
  } catch {
    return raw.length > 180 ? `HTTP ${status}` : raw;
  }
}

function isAbortError(error) {
  return error?.name === "AbortError" || /aborted|abort/i.test(error?.message || "");
}

async function readError(response) {
  const text = await response.text();
  throw new Error(parseError(text, response.status));
}

function extensionForType(type) {
  if (/wav/i.test(type)) return "wav";
  if (/mpeg|mp3/i.test(type)) return "mp3";
  if (/ogg/i.test(type)) return "ogg";
  if (/opus/i.test(type)) return "opus";
  return "audio";
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

async function peaksFromAudio(blob, bars = 120) {
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
      for (let j = start; j < end; j += 1) max = Math.max(max, Math.abs(data[j]));
      peaks.push(max);
    }
    return peaks;
  } finally {
    await context.close();
  }
}

function voiceStorageKey(providerId) {
  if (providerId === "siliconflow") return KEYS.siliconflowVoice;
  if (providerId === "edge") return KEYS.edgeVoice;
  return KEYS.dashscopeVoice;
}

function currentVoices(providerId) {
  return PROVIDERS[providerId]?.voices ?? PROVIDERS.edge.voices;
}

function savedVoice(providerId) {
  const saved = localStorage.getItem(voiceStorageKey(providerId));
  const voices = currentVoices(providerId);
  return voices.some((voice) => voice.id === saved) ? saved : voices[0].id;
}

function savedKey(providerId) {
  const key = providerId === "siliconflow" ? KEYS.siliconflowKey : KEYS.dashscopeKey;
  return localStorage.getItem(key) || "";
}

async function synthesizeDashscope({ key, text, voice, rate, instruction, signal }) {
  const response = await fetch(`${providerRoot("dashscope")}/api/v1/services/audio/tts/SpeechSynthesizer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PROVIDERS.dashscope.model,
      input: {
        text,
        voice,
        format: "wav",
        sample_rate: 24000,
        rate,
        ...(instruction ? { instruction } : {}),
      },
    }),
    signal,
  });
  const payload = await response.text();
  if (!response.ok) throw new Error(parseError(payload, response.status));
  const data = payload ? JSON.parse(payload) : {};
  if (data.code) throw new Error(parseError(payload, response.status));
  const audio = data.output?.audio || {};
  if (audio.data) {
    const binary = atob(audio.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: "audio/wav" });
  }
  if (!audio.url) throw new Error("百炼未返回音频地址");
  const audioResponse = await fetch(audioProxyUrl(audio.url), { signal });
  if (!audioResponse.ok) throw new Error("音频下载失败，请重试");
  return audioResponse.blob();
}

async function synthesizeSiliconflow({ key, text, voice, rate, signal }) {
  const response = await fetch(`${providerRoot("siliconflow")}/v1/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PROVIDERS.siliconflow.model,
      input: text,
      voice: `${PROVIDERS.siliconflow.model}:${voice}`,
      response_format: "wav",
      sample_rate: 44100,
      speed: rate,
    }),
    signal,
  });
  const type = response.headers.get("content-type") || "";
  if (!response.ok) await readError(response);
  if (/json/i.test(type)) await readError(response);
  return response.blob();
}

async function synthesizeEdge({ text, voice, rate, signal }) {
  const response = await fetch("/edge-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, rate }),
    signal,
  });
  const type = response.headers.get("content-type") || "";
  if (!response.ok) await readError(response);
  if (/json/i.test(type)) await readError(response);
  return response.blob();
}

export function mountCloudTts(root) {
  let providerId = PROVIDERS[localStorage.getItem(KEYS.provider)] ? localStorage.getItem(KEYS.provider) : "edge";
  let voiceId = savedVoice(providerId);
  let speed = Number(localStorage.getItem(KEYS.speed) || "1");
  if (![0.8, 1, 1.2].includes(speed)) speed = 1;

  let objectUrl = "";
  let peaks = [];
  let running = false;
  let abortController = null;
  let downloadName = "cloud-tts.wav";

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">云端合成</div>
        <div class="hint">Ctrl + Enter 生成</div>
      </div>
      <details class="setup" id="setup-panel">
        <summary>Edge 免费无需注册；百炼 / 硅基流动需要 API Key</summary>
        <div class="setup-body">
          <ol>
            <li><strong>Edge 免费</strong>：微软在线朗读，不用 Key，中文可用。官方可能限流。</li>
            <li>要更好听，可用 <a href="https://bailian.console.aliyun.com/" target="_blank" rel="noreferrer">阿里云百炼</a> CosyVoice，新用户通常有免费额度。</li>
            <li><a href="https://cloud.siliconflow.cn/account/ak" target="_blank" rel="noreferrer">硅基流动</a> 注册也会送一点额度，CosyVoice2 较便宜。</li>
          </ol>
        </div>
      </details>
      <div class="field-row">
        <span class="field-label">服务</span>
        <div class="seg" id="provider-seg">
          <button type="button" data-provider="edge">Edge 免费</button>
          <button type="button" data-provider="dashscope">阿里云百炼</button>
          <button type="button" data-provider="siliconflow">硅基流动</button>
        </div>
      </div>
      <div class="field-row" id="key-row">
        <span class="dot" id="conn-dot"></span>
        <span class="field-label">Key</span>
        <input
          id="api-key"
          class="field-control"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="${escapeAttr(PROVIDERS[providerId].keyHint)}"
        />
        <button type="button" class="btn" id="btn-save-key">保存</button>
      </div>
      <div class="input-area">
        <textarea id="tts-text" spellcheck="false" placeholder="输入要合成的文本">${SAMPLE}</textarea>
      </div>
      <div class="field-row" id="instruction-row">
        <span class="field-label">指令</span>
        <input
          id="instruction"
          class="field-control"
          type="text"
          spellcheck="false"
          placeholder="可选，例如：请用广东话表达。 / 你说话的情感是happy。"
        />
      </div>
      <div class="ops">
        <div class="opts">
          <div class="opt">
            <span>音色</span>
            <select id="voice-select" class="field-control"></select>
          </div>
          <div class="opt">
            <span>语速</span>
            <div class="seg" id="speed-seg">
              <button type="button" data-speed="0.8">慢</button>
              <button type="button" data-speed="1">中</button>
              <button type="button" data-speed="1.2">快</button>
            </div>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="btn-generate">生成</button>
          <button type="button" class="btn btn-ghost" id="btn-sample">示例</button>
          <button type="button" class="btn btn-ghost" id="btn-clear">清空</button>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">结果</div>
        <div class="panel-actions">
          <button type="button" class="btn" id="btn-download" disabled>下载</button>
        </div>
      </div>
      <div class="audio-stage">
        <div class="wave-wrap">
          <canvas id="wave"></canvas>
          <div class="wave-empty" id="wave-empty">云端合成的语音会显示在这里</div>
        </div>
        <div class="player">
          <audio id="player" controls></audio>
        </div>
      </div>
      <div class="status" id="tts-status">Edge 免费音色，无需 API Key</div>
    </section>
  `;

  const setupPanel = root.querySelector("#setup-panel");
  const keyRow = root.querySelector("#key-row");
  const providerSeg = root.querySelector("#provider-seg");
  const keyInput = root.querySelector("#api-key");
  const connDot = root.querySelector("#conn-dot");
  const textInput = root.querySelector("#tts-text");
  const instructionRow = root.querySelector("#instruction-row");
  const instructionInput = root.querySelector("#instruction");
  const voiceSelect = root.querySelector("#voice-select");
  const speedSeg = root.querySelector("#speed-seg");
  const player = root.querySelector("#player");
  const canvas = root.querySelector("#wave");
  const waveEmpty = root.querySelector("#wave-empty");
  const status = root.querySelector("#tts-status");
  const generateBtn = root.querySelector("#btn-generate");
  const downloadBtn = root.querySelector("#btn-download");

  function setStatus(type, text) {
    status.className = `status${type ? ` ${type}` : ""}`;
    status.textContent = text;
  }

  function setDot(type) {
    connDot.className = `dot${type ? ` ${type}` : ""}`;
  }

  function setBusy(busy) {
    running = busy;
    generateBtn.textContent = busy ? "停止" : "生成";
    generateBtn.classList.toggle("btn-primary", !busy);
  }

  function fillVoices() {
    const voices = currentVoices(providerId);
    if (!voices.some((voice) => voice.id === voiceId)) voiceId = voices[0].id;
    voiceSelect.innerHTML = voices
      .map(
        (voice) =>
          `<option value="${escapeAttr(voice.id)}"${voice.id === voiceId ? " selected" : ""}>${escapeAttr(voice.name)}</option>`,
      )
      .join("");
  }

  function applyProvider() {
    localStorage.setItem(KEYS.provider, providerId);
    providerSeg.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.provider === providerId);
    });
    instructionRow.hidden = providerId !== "dashscope";
    keyRow.hidden = providerId === "edge";
    voiceId = savedVoice(providerId);
    fillVoices();
    if (providerId === "edge") {
      setDot("ok");
      setupPanel.open = false;
      setStatus("ok", isLocalPage() ? "Edge 免费音色，无需 API Key" : "Edge 免费仅限本地；部署站点请用百炼/硅基流动");
      return;
    }
    keyInput.placeholder = PROVIDERS[providerId].keyHint;
    keyInput.value = savedKey(providerId);
    const hasKey = Boolean(keyInput.value.trim());
    setDot(hasKey ? "ok" : "");
    setupPanel.open = !hasKey;
    setStatus(hasKey ? "ok" : "", hasKey ? `已保存 ${PROVIDERS[providerId].name} 密钥` : "粘贴 API Key 后即可生成");
  }

  function applySpeed() {
    localStorage.setItem(KEYS.speed, String(speed));
    speedSeg.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.speed) === speed);
    });
  }

  function renderWave() {
    if (!peaks.length) {
      drawWaveform(canvas, IDLE_PEAKS, 0);
      return;
    }
    waveEmpty.hidden = true;
    const progress = player.duration ? player.currentTime / player.duration : 0;
    drawWaveform(canvas, peaks, progress);
  }

  function clearAudio() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    peaks = [];
    player.removeAttribute("src");
    player.load();
    downloadBtn.disabled = true;
    waveEmpty.hidden = false;
    waveEmpty.textContent = "云端合成的语音会显示在这里";
    drawWaveform(canvas, IDLE_PEAKS, 0);
  }

  async function attachAudio(blob) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    downloadName = `cloud-tts.${extensionForType(blob.type)}`;
    player.src = objectUrl;
    downloadBtn.disabled = false;
    try {
      peaks = await peaksFromAudio(blob);
    } catch {
      peaks = [];
    }
    renderWave();
    player.play().catch(() => {});
  }

  function persistKey() {
    if (providerId === "edge") return;
    const value = keyInput.value.trim();
    const storageKey = providerId === "siliconflow" ? KEYS.siliconflowKey : KEYS.dashscopeKey;
    if (value) localStorage.setItem(storageKey, value);
    else localStorage.removeItem(storageKey);
    const hasKey = Boolean(value);
    setDot(hasKey ? "ok" : "");
    setupPanel.open = !hasKey;
    setStatus(hasKey ? "ok" : "", hasKey ? `已保存 ${PROVIDERS[providerId].name} 密钥` : "已清除密钥");
  }

  async function generate() {
    if (running) {
      abortController?.abort();
      return;
    }

    const text = textInput.value.trim();
    const key = keyInput.value.trim();
    if (!text) {
      setStatus("err", "请输入要合成的文本");
      return;
    }
    if (providerId !== "edge" && !key) {
      setupPanel.open = true;
      setStatus("err", `请先填写 ${PROVIDERS[providerId].name} 的 API Key`);
      return;
    }
    if (providerId === "edge" && !isLocalPage()) {
      setStatus("err", "Edge 免费需要本地代理（npm run dev）；部署站点请改用百炼或硅基流动");
      return;
    }

    if (providerId !== "edge") persistKey();
    abortController = new AbortController();
    setBusy(true);
    setDot("busy");
    clearAudio();
    waveEmpty.hidden = false;
    waveEmpty.textContent = "正在请求云端合成…";
    waveEmpty.classList.add("live");
    setStatus("", `正在调用 ${PROVIDERS[providerId].name}…`);

    try {
      const blob =
        providerId === "edge"
          ? await synthesizeEdge({
              text,
              voice: voiceId,
              rate: speed,
              signal: abortController.signal,
            })
          : providerId === "siliconflow"
            ? await synthesizeSiliconflow({
                key,
                text,
                voice: voiceId,
                rate: speed,
                signal: abortController.signal,
              })
            : await synthesizeDashscope({
                key,
                text,
                voice: voiceId,
                rate: speed,
                instruction: instructionInput.value.trim(),
                signal: abortController.signal,
              });
      waveEmpty.classList.remove("live");
      await attachAudio(blob);
      setDot("ok");
      setStatus("ok", `${PROVIDERS[providerId].name} · ${currentVoices(providerId).find((item) => item.id === voiceId)?.name || voiceId}`);
    } catch (error) {
      waveEmpty.classList.remove("live");
      if (isAbortError(error)) {
        setDot("");
        setStatus("", "已停止");
      } else {
        setDot("err");
        setStatus("err", error.message || String(error));
      }
    } finally {
      setBusy(false);
    }
  }

  providerSeg.addEventListener("click", (event) => {
    const button = event.target.closest("[data-provider]");
    if (!button || button.dataset.provider === providerId) return;
    providerId = button.dataset.provider;
    applyProvider();
  });
  speedSeg.addEventListener("click", (event) => {
    const button = event.target.closest("[data-speed]");
    if (!button) return;
    speed = Number(button.dataset.speed);
    applySpeed();
  });
  voiceSelect.addEventListener("change", () => {
    voiceId = voiceSelect.value;
    localStorage.setItem(voiceStorageKey(providerId), voiceId);
  });
  root.querySelector("#btn-save-key").addEventListener("click", persistKey);
  keyInput.addEventListener("change", persistKey);
  generateBtn.addEventListener("click", generate);
  root.querySelector("#btn-sample").addEventListener("click", () => {
    textInput.value = SAMPLE;
    textInput.focus();
  });
  root.querySelector("#btn-clear").addEventListener("click", () => {
    if (running) abortController?.abort();
    textInput.value = "";
    instructionInput.value = "";
    clearAudio();
    setStatus("", "已清空");
    textInput.focus();
  });
  downloadBtn.addEventListener("click", () => {
    if (!objectUrl) return;
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = downloadName;
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

  applyProvider();
  applySpeed();
  clearAudio();

  return () => {
    window.removeEventListener("resize", renderWave);
    abortController?.abort();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
}
