# audio-tools 项目文档

> 由 Codex 阅读源码后整理的独立文档（2026-08-19）。

## 1. 项目概览

**audio-tools** 是一个本地「声音工具箱」前端项目：单页应用，顶栏切换工具，中间双栏工作区。当前只内置一个工具——**云端 TTS**（文本转语音）。

- 技术栈：Vite 7 + 原生 JavaScript（ESM，无框架），`ws`（Node 端 Edge TTS 用），无 CSS 框架。
- 页面结构对齐 [str-tools](https://github.com/Aithena/str-tools)。
- 默认免费方案：微软 Edge 在线朗读（无需 API Key）；可选阿里云百炼 CosyVoice 或硅基流动 CosyVoice2（音质更好，需 Key）。
- 支持部署到 GitHub Pages（但云端合成功能只在本地 `npm run dev` 下可用，见 §9）。

## 2. 目录结构

```
audio-tools/
├── index.html                 # 入口 HTML（挂载 #app，加载 /src/main.js）
├── package.json               # Vite 7 + ws；scripts: dev / build / preview
├── vite.config.js             # 端口 18808、云端代理、/cloud-audio、注册插件
├── vite-plugins/
│   └── edge-tts.js            # Vite 插件：/edge-tts 端点（Node 端 Edge TTS 实现）
├── src/
│   ├── main.js                # 应用外壳：顶栏菜单 + 工具注册表 + 挂载/卸载
│   ├── style.css              # 全部样式（CSS 变量 + 布局 + 组件）
│   └── tools/
│       └── cloud-tts.js       # 云端 TTS 工具（唯一内置工具，约 637 行）
├── .github/workflows/deploy.yml  # GitHub Pages 自动部署
├── dist/                      # 构建产物（git 忽略）
└── node_modules/              # 依赖（git 忽略）
```

## 3. 架构与数据流

### 3.1 应用外壳（src/main.js）

- 工具注册表：`tools = [{ id, name, mount }]`，当前只有 `cloud-tts`。
- `render(activeId)`：渲染顶栏菜单 + 工作区；切工具时先调用上一个工具的 `unmount()` 再挂载新工具。
- 菜单点击委托在 `.menu` 容器上（`event.target.closest('[data-tool]')`）。

### 3.2 工具生命周期（src/tools/cloud-tts.js）

`mountCloudTts(root)` 返回卸载函数：

- 挂载：向 `root` 注入 DOM，绑定事件，恢复本地偏好（服务商/音色/语速/Key）。
- 卸载：移除 resize 监听、`abortController?.abort()`、`URL.revokeObjectURL()`。

### 3.3 合成数据流

```
用户输入文本 ──> mountCloudTts.generate()
  ├─ edge        ──> POST /edge-tts（本地）──> edge-tts.js WebSocket 直连微软 Edge TTS 服务
  ├─ dashscope   ──> POST /dashscope/api/v1/.../SpeechSynthesizer ──> base64 或音频 URL
  │                 （音频 URL 在本地经 /cloud-audio?url=... 白名单代理下载）
  └─ siliconflow ──> POST /siliconflow/v1/audio/speech
                       └─> 三者最终都得到 audio Blob ──> 播放 + 下载 + 波形图
```

- 浏览器只在 `localhost` / `127.0.0.1` 下允许合成（`isLocalPage()`）；云端请求走 Vite 代理避免跨域。
- 结果以 Blob 播放；`peaksFromAudio()` 用 `AudioContext.decodeAudioData` 抽 120 个峰值画波形；空闲态画 48 根占位柱（`IDLE_PEAKS`）。

## 4. 三个 TTS 服务商

| 维度 | Edge 免费 | 阿里云百炼（dashscope） | 硅基流动（siliconflow） |
| --- | --- | --- | --- |
| 页面名称 | Edge 免费 | 阿里云百炼 | 硅基流动 |
| 模型 | 微软在线朗读 | `cosyvoice-v3-flash` | `FunAudioLLM/CosyVoice2-0.5B` |
| 是否需 Key | 否 | 是（`sk-...`） | 是（`sk-...`） |
| 音色数 | 9（含台湾/香港/东北/粤语） | 11（龙安系列等） | 8（Claire/Anna 等） |
| 请求端点 | 本地 `/edge-tts` | `/api/v1/services/audio/tts/SpeechSynthesizer` | `/v1/audio/speech` |
| 输出格式 | MP3（24kHz/48kbps mono） | WAV（24000 Hz，可带 instruction 指令） | WAV（44100 Hz，`voice=模型:音色`） |
| 额外能力 | 无 | `instruction` 字段（如粤语/情感） | 无 |

### 4.1 dashscope 请求细节

```json
POST {providerRoot}/api/v1/services/audio/tts/SpeechSynthesizer
Authorization: Bearer <key>
{
  "model": "cosyvoice-v3-flash",
  "input": { "text": "...", "voice": "longanrou_v3", "format": "wav",
             "sample_rate": 24000, "rate": 1, "instruction": "可选" }
}
```

- 响应支持两种形态：`output.audio.data`（base64，`atob` 解码为 Blob）或 `output.audio.url`（音频直链）。
- 音频直链在本地开发时经 `/cloud-audio?url=...` 代理下载（只允许 `.aliyuncs.com` 域名）。

### 4.2 siliconflow 请求细节

```json
POST {providerRoot}/v1/audio/speech
Authorization: Bearer <key>
{ "model": "FunAudioLLM/CosyVoice2-0.5B", "input": "<文本>",
  "voice": "FunAudioLLM/CosyVoice2-0.5B:claire",
  "response_format": "wav", "sample_rate": 44100, "speed": 1 }
```

### 4.3 语速映射

UI 三档（0.8 / 1 / 1.2）：

- Edge：`ratePercent` 转成 SSML `rate`，`+0%` / `+20%` / `-20%`（即 0.8→-20%、1→+0%、1.2→+20%）。
- dashscope / siliconflow：直接把数值传给 `rate` / `speed` 字段。

## 5. Edge TTS 插件（vite-plugins/edge-tts.js）

浏览器把文本 POST 到本地 `/edge-tts`（dev 与 preview 都注册），Node 端用 `ws` 直连微软 Edge 朗读 WebSocket 服务。

### 5.1 连接与鉴权

- 地址：`wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`。
- 参数：`TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`、随机 `ConnectionId`、`Sec-MS-GEC`、`Sec-MS-GEC-Version`。
- `Sec-MS-GEC`：取「Unix 秒 + Windows 纪元偏移(11644473600)」按 300 秒窗口取整，拼上 Token 后 SHA-256，转大写十六进制。
- 请求头伪装浏览器：`User-Agent` 用 Chrome/143 + Edg/143，`Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold`，随机 `muid` Cookie。
- 时钟偏移：握手返回 403 且带 `Date` 头时，累计校正 `clockSkewSeconds` 并重试。

### 5.2 协议交互

1. 发送 `Path:speech.config`：声明输出格式 `audio-24khz-48kbitrate-mono-mp3`。
2. 发送 `Path:ssml`：`<speak><voice name='...'><prosody pitch='+0Hz' rate='...' volume='+0%'>文本</prosody></voice></speak>`。
3. 收音频帧：二进制消息，前 2 字节大端序 = 头长度，头内 `Path: audio` 的 body 为 MP3 分片，累积拼接。
4. 文本消息头 `Path: turn.end` 表示一帧结束。
5. 45 秒超时；连接关闭但已有音频时按成功处理。

### 5.3 文本切分与重试

- 按 UTF-8 字节 >4096 切块：优先在 1800 字符附近的换行 → 句号 → 空格截断。
- 每块失败后自动重试一次（整体失败才报错）。

## 6. Vite 配置与代理（vite.config.js）

- 端口 `18808`，`strictPort: true`（dev/preview 一致）。
- `base`：设置环境变量 `GITHUB_PAGES` 时用 `/audio-tools/`，否则 `/`。
- `/dashscope` → `https://dashscope.aliyuncs.com`；`/siliconflow` → `https://api.siliconflow.cn`；均 `changeOrigin`，超时 120s，剥掉前缀。
- `/cloud-audio` 中间件：`?url=` 参数只能指向 `dashscope.aliyuncs.com` 或 `*.aliyuncs.com`，否则 400；抓取失败 502。
- 注册 `edgeTtsPlugin()`。

## 7. 本地持久化（localStorage）

键名均为 `audio-tools.cloud-tts.*`：

| 键 | 含义 |
| --- | --- |
| `provider` | 当前服务商（edge / dashscope / siliconflow） |
| `dashscope-key` / `siliconflow-key` | API Key（Edge 不存） |
| `dashscope-voice` / `siliconflow-voice` / `edge-voice` | 各服务商音色 |
| `speed` | 语速，仅接受 0.8 / 1 / 1.2，非法值回退 1 |

Key 只保存在本机浏览器；「保存」按钮/输入框 change 触发 `persistKey()`（空值即删除）。

## 8. 构建与部署

```bash
npm install
npm run dev        # http://127.0.0.1:18808
npm run build      # 输出 dist/
npm run preview    # 预览产物，同端口
```

`.github/workflows/deploy.yml`：push 到 `main`（或手动触发）→ Node 22 `npm ci` → `GITHUB_PAGES=true npm run build` → 上传 `dist/` → deploy-pages。发布后站点位于 `https://<user>.github.io/audio-tools/`。

> 注意：GitHub Pages 上 `isLocalPage()` 为 false，`generate()` 会直接提示「云端合成请用本地 npm run dev 打开」，因此线上是静态展示，合成请本地跑。

## 9. 已知限制与注意事项

- Edge 免费服务为逆向接口：依赖固定 Token/版本号，微软可能限流或变更协议，`CHROMIUM_FULL_VERSION`、Token 需要时可更新。
- 云端合成（含 Edge）全部要求本地页面；本地开发代理是功能的前提。
- `/cloud-audio` 代理白名单只放行阿里云域名，其它厂商音频直链会失败。
- 错误信息做了本地化：401 / `InvalidApiKey` → 「API Key 无效」；命中 `Arrearage|quota|余额|欠费` → 「账号余额不足或已欠费」；超长原文回退为 `HTTP <状态码>`。
- UI 快捷键：`Ctrl/Cmd + Enter` 生成；生成中再点按钮 = 停止（AbortController）。

## 10. 开发约定（读码总结）

- 无框架、无构建期 TS；DOM 用模板字符串注入，属性一律走 `escapeAttr()` 防注入。
- 每个工具模块导出 `mount(root) => unmount`，由 `main.js` 统一管理生命周期。
- 所有与外部服务相关的常量（URL、模型、音色、Key 前缀）集中在 `cloud-tts.js` 顶部与 `edge-tts.js` 顶部。
- 中文字符串直接写在源码里（UTF-8），无 i18n 层。