# Paper Twin · 文献双屏译读

一个可以双击启动的 Windows 文献翻译程序。奶油色卡通界面，支持 PDF 原页与译文双栏对照，也可以把译文窗口拖到第二块屏幕。

## 下载与运行

在本仓库的 **Releases** 中下载 `PaperTwin-Windows-x64.zip`，解压后运行 `PaperTwin.exe`。

- Windows 10 / 11，64 位。
- 需要安装 Microsoft Edge 或 Google Chrome 140 及以上版本。
- 不需要安装插件、Python、Node.js 或 Bun。
- 使用 Edge/Chrome 的独立应用窗口显示界面，本机服务只监听 `127.0.0.1:17643`。
- 更新时先关闭所有旧版窗口，等待约两分钟，再解压运行新版，以便旧服务退出。

## 翻译设置

程序预填智谱标准接口与官方标注免费的 `glm-4-flash-250414`。在「设置」中填入自己创建的 **模型标准 API Key**，保存后测试连接。Key 不包含在源码或发行包中。

| 设置项 | 默认值 |
| --- | --- |
| 完整接口地址 | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| 模型 | `glm-4-flash-250414` |
| 译文语言 | 简体中文 |

[智谱 API Key 管理](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) · [免费模型官方文档](https://docs.bigmodel.cn/cn/guide/models/free/glm-4-flash-250414)

免费范围、账户开通条件和速率限制以服务商当前控制台为准。接口也可以换成兼容 Chat Completions 的其他服务或本地模型。

## 功能

- PDF 原页、TXT/Markdown 和粘贴文本导入。
- 原文、译文双栏对照与独立译文窗口。
- 同步翻页、按页面相对进度同步滚动。
- 逐页/全文翻译、暂停续译、术语表与本地缓存。
- 导出 Markdown 双语对照文档。
- 英文、俄文原文选择，现代波斯语译文从右往左显示。
- 帕拉维语（中古波斯语）的**试验性辅助释读**配置，与现代波斯语分开。

## 帕拉维语与 PDF 边界

帕拉维语模式会要求模型保留转写、缺文符号和存疑处；**没有验证智谱免费模型对帕拉维语的实际准确率**，不能把模型输出直接当作权威译文或校勘本。优先使用经校勘的拉丁转写／转录文本，并人工核对。

程序没有专用帕拉维 OCR 或原字形生成；目标语言若选帕拉维语，会要求输出谨慎的拉丁转写／转录。扫描件需要先 OCR；复杂双栏、历史字体或特殊编码可能影响 PDF 文本提取。图片、结构式及表格保留在原 PDF，译文不重绘图表。

## 本机数据

数据默认保存在 `%LOCALAPPDATA%\PaperTwin\BrowserData` 的专用配置中。文献、译文和 Key 不做跨设备同步，Key 未加密。翻译时，相应文字、领域和术语表会发送到用户配置的接口。

## 从源码运行

安装 [Bun](https://bun.sh/) 1.4.4 或以上版本；测试需要 Node.js 20 及以上。

```bash
bun install --frozen-lockfile --ignore-scripts
bun run start
```

开发或构建时，准备脚本会从锁定版本的 `pdfjs-dist` 复制 PDF.js、worker、字体及 WASM，并生成 `assets.ts`。这些内容会嵌入 EXE，使用者运行程序时不需要下载依赖。

```bash
bun run test
bun run build:windows
```

输出为 `dist/PaperTwin.exe`。Windows 构建工作流会生成 EXE 和 ZIP；推送 `v*` 标签或手动运行工作流时，上传到 Releases。

## 验证情况

单元测试覆盖分块、接口地址、兼容 API 请求、截断/限流，以及俄文、现代波斯语和帕拉维语模式的文本与配置传递。原开发环境已检查 PDF 显示、配置保存、双窗口同步、导出和小窗口界面；使用的是模拟翻译返回。Windows EXE 的实际运行和真实接口质量仍需在对应设备与账户中验证。

项目代码使用 MIT 许可；PDF.js、字体及 Bun 保留各自许可证，见 `LICENSE`、`BUN-LICENSE.md` 与构建后的 `ui/vendor/`。


选段快速翻译：在原文或译文中用鼠标左键拖选文字，点击浮动的「翻译选中文字」。仅所选文本会发给当前接口，结果单独展示，可以复制；关闭窗口会取消请求。最多 6000 字符。带文字层的 PDF 支持原页选词，扫描件仍需先 OCR。选段缓存独立保存，不覆盖整页译文。
