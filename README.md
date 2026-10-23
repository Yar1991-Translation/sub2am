# SRT / LRC → Alight Motion XML

把 `.srt` 字幕或 `.lrc` 歌词转成 Alight Motion 能导入的 `.xml`。每条字幕一个文本层，按原时间排列。

## 使用

首次：

```bash
npm install
npm run build
```

打开 `dist/index.html`。Chrome、Edge、Firefox 都行，离线运行。

改了源码，重新 `npm run build`。

开发：

```bash
npm run dev
npm run preview
```

## GitHub Pages

推到 `main` 后会自动构建并部署 `dist/`：

https://yar1991-translation.github.io/sub2am/

首次需要在 Settings → Pages → Source 选 GitHub Actions（工作流会尝试自动开启）。

## 功能

- 拖入或选择 `.srt` / `.lrc`，内置示例
- 编码自动识别：UTF-8、GBK / GB18030、Big5、Shift_JIS；乱码可手动切
- 横屏 1920×1080、竖屏 1080×1920、自定义画布
- 字体、字号、缩放、文字颜色、不透明度、对齐、换行宽度、阴影
- 位置、边距、尾部留白、固定时长、末句时长
- 透明背景
- 预览、字幕列表、逐句跳转、解析提示
- 生成前检查 XML

## LRC 逐字

支持 `[00:01.00]私[00:01.50]の[00:02.00]居…` 这种格式。界面里三选一：

- 单字（默认）：每个字一层，从该字时间显示到整行结束。按字号估算横向位置，太长会整体缩小。字距用「字距」调。
- 累积：逐层加前缀，`私` → `私の` → `私の居`。
- 整行：忽略字级时间，每行整句显示。

字数多时图层会很多，AM 会卡。只要整行字幕就选「整行」。

自动排列是估算。导入后字距不对，调「字距」再生成。

## 输入

SRT：多行、缺序号、逗号或点号毫秒、缺小时、缺空行、重叠、HTML / ASS 标签都能处理。

LRC：一行多个时间戳、`ti/ar/al/by`、`offset`、增强词级时间戳。同一时间的中英双语行会合成一条。

## 生成的 XML

- 每个 cue 一个 `<text>`，`startTime` / `endTime` 为毫秒
- 单字模式：每个字一层，结束时间对齐整行；x 按估算字宽排，超宽自动缩
- 其他模式：文本块中心定位，默认 `(960, 918)`
- 多行用真实换行；颜色 `#AARRGGBB`
- 透明背景写 `bgcolor="#00000000"`
- 不带音频、媒体、关键帧、特效

## 导入 AM

1. XML 传到手机
2. 文件管理器打开，选 Alight Motion；或 AM 菜单 → Import Project
3. 音频、视频在 AM 里加

工程头用的是 AM 5.0.273。其他版本打开会自动升级。

## 结构

```text
index.html                  页面模板
src/main.js                 m3e 注册 + 启动
src/styles.css              布局样式
src/core/                   解析、布局、XML 生成
src/ui/                     界面逻辑
vendor/material-theme/css/  浅色/深色色板
tests/                      测试与 XML 样例
dist/index.html             构建产物（npm run build 生成，不提交）
```

技术：`@m3e/web` 2.10.2 + Lit + Vite。构建成单文件，离线可用。

配色来自 `vendor/material-theme/css/{light,dark}.css`（Material Theme Builder 导出）。浅色 primary `#555992`，深色 `#bec2ff`。右上角太阳/月亮切换，选择存 localStorage。

## 测试

```bash
npm run test       # 核心逻辑
npm run test:xml   # 生成 XML 并校验结构
npm run test:ui    # 构建后跑无头浏览器交互
npm run test:all   # 全部
```

## 注意

- AM 的 `size` 和像素换算不确定。默认 28，导入后按实际效果调字号/缩放。预览按 ×3 估算。
- 默认字体 Roboto 900。中日文一般由 Android 回退；也可以填 AM 已导入的字体。
- 工程不含音频。长度用「固定时长」或「尾部留白」控制。
- 透明背景导出是否保留 alpha，取决于 AM 的导出设置。
