# 声音工具箱

本地声音工具集合。页面结构对齐 [str-tools](https://github.com/Aithena/str-tools)：顶栏切换工具，中间双栏工作区。

当前第一个工具是 **MOSS-TTS-Nano** 本地部署与合成。

## 启动网页

```bash
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:18808](http://127.0.0.1:18808)。开发服务器会把 `/moss-tts` 代理到本机 `18083`。

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
