# Agent Note: HTML 预览打印

Status: implemented

[English](2026-09-18-html-preview-print.md) | 中文

## 问题

HTML 文档预览位于不透明的 sandbox iframe 中。浏览器级打印命令会指向整个 Harness 外壳，而在普通 frame 内调用 `print()` 需要 `allow-modals`。永久授予该 token 会让每份预览脚本都能在用户未请求打印时打开 JavaScript 对话框。

## 决定

普通 HTML iframe 继续严格使用 `sandbox="allow-scripts"`。它的固定 bootstrap 在显示文档运行前捕获浏览器确认由用户输入的 Command-P 和 Control-P 事件，并向拥有它的 `HtmlFrame` 发送由能力 token 认证的请求。合成键盘事件以及来自其他窗口、frame 或 token 的请求不会开始打印。

owner 从相同的已打包 HTML 和资产准备第二份 Blob 文档。它只在收到已认证的快捷键请求后挂载该文档，并使用 `sandbox="allow-scripts allow-modals"`。打印 bootstrap 在不受信任文档运行前捕获原生 `window.print` 函数，加载后调用该函数，只报告浏览器确认的 `afterprint`，随后 owner 卸载打印 frame。替换或卸载预览会撤销两个 Blob URL。

此机制只在焦点位于 HTML 预览内时生效。Markdown 使用自己的[同文档打印副本](2026-09-18-markdown-preview-print.zh.md)；其余预览渲染器不会打印外围 Harness 应用，在它们能够提供仅含文档的表示之前仍不支持打印。

## 考虑过的替代方案

**打印 Electron 窗口。** 这会把项目边栏、会话、控件和预览视口一起打印，而不是打印文档。

**给普通预览增加 `allow-modals`。** 代码量更小，但只为偶发的用户操作而扩大了每份启用脚本的 HTML 预览的常驻权限。

**先生成 PDF。** PDF 导出需要文件归属、保存/打开体验、清理，并且需要用户再操作一次才能进入系统打印对话框，无法满足直接快捷键。

## 结果

系统打印预览只接收完整 HTML 文档及其打包的直接资产。打印请求会短暂运行文档副本，因此其中的脚本可能再次执行。打印专用 iframe 只在已认证请求到 `afterprint` 期间持有 modal 权限；普通预览的 sandbox 保持不变。单元覆盖固定快捷键捕获、token 与来源检查、临时 sandbox 标志、原生打印函数捕获、完成清理和 Blob URL 撤销。
