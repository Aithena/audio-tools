# 声音工具箱

本地声音工具集合。页面结构对齐 [str-tools](https://github.com/Aithena/str-tools)：顶栏切换工具，中间双栏工作区。

当前工具：

- **云端 TTS**：默认 **Edge 免费**（微软在线朗读，无需 Key）。也可填阿里云百炼 / 硅基流动，音质更好。
- **MOSS-TTS-Nano**：本机 ONNX 合成，可离线，但音质一般。

## 启动网页

```bash
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:18808](http://127.0.0.1:18808)。开发服务器会代理：

- `/moss-tts` → 本机 `18083`
- `/dashscope`、`/siliconflow` → 云端 TTS，避免浏览器跨域

## 启动 MOSS-TTS-Nano

推荐 ONNX CPU 版，不需要 GPU。本机用 Python 3.10 即可：

```powershell
cd D:\Apps\MOSS-TTS-Nano
py -3.10 -m venv .venv
.venv\Scripts\python -m pip install -U pip
.venv\Scripts\python -m pip install -e .
.venv\Scripts\moss-tts-nano serve --backend onnx --execution-provider cuda
```

默认地址是 `http://127.0.0.1:18083`。首次启动会下载模型，请保持终端开着。

## 使用

1. 在工具页点「检测」，确认本机服务已连接。
2. 输入文本；可选上传或录制一段参考音做音色克隆。
3. 默认「流式」边生成边播放；也可切到「整段」等全部完成再播。

官方仓库：[OpenMOSS/MOSS-TTS-Nano](https://github.com/OpenMOSS/MOSS-TTS-Nano)
