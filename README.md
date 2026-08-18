# 声音工具箱

本地声音工具集合。页面结构对齐 [str-tools](https://github.com/Aithena/str-tools)：顶栏切换工具，中间双栏工作区。

当前工具是 **云端 TTS**：默认用微软 Edge 在线朗读（免费、无需 Key）。也可以改用阿里云百炼 CosyVoice 或硅基流动 CosyVoice2，音质更好。

## 启动网页

```bash
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:18808](http://127.0.0.1:18808)。开发服务器会把 `/dashscope`、`/siliconflow` 代理到云端，避免浏览器跨域。

## 使用

1. 默认服务选「Edge 免费」，输入文本后点生成。
2. 若要用百炼或硅基流动，在页面粘贴 API Key（只保存在本机浏览器）。
