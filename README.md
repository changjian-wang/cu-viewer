# CU Result Viewer

供 cu-cli 使用的 React/TypeScript 结果查看组件，将原始 PDF/图片与保存的 Azure Content Understanding（CU）Analyze JSON 并排展示，提供 Studio 式结果查阅和来源定位。

组件只负责渲染：不调用 Analyze、不认证、不上传、不管理 analyzer 或轮询 LRO，也不依赖 CU SDK。宿主负责取得源文件和分析结果。

## 文档入口

- **本文**：启动、使用、资源交付、当前限制和验证命令。
- [需求](docs/requirements.md)：当前 cu-cli Viewer 的交付范围和已确认行为。
- [开发计划（English）](docs/dev-plan.md)：完整架构、阶段任务、验收、依赖、测试映射和 CLI 交付状态。

<a id="run-the-prototype"></a>
## 本地运行

需要 Node.js `^22.13.0 || ^24.0.0 || >=26.0.0`，在仓库根目录执行：

```powershell name="启动演示"
npm ci --ignore-scripts
npm run dev
```

打开 <http://127.0.0.1:5173/>。选择 PDF／Receipt PNG 使用真实配对样本，或分别选择本地源文件和保存的 JSON；不产生新的 CU 调用。文件选择属于演示宿主，不是组件公开 API。

该页面由[演示宿主](demo)启动，直接使用[组件源码](src)。它用于开发和调试，实际 CLI 接入见[开发计划](docs/dev-plan.md)。

## cu-cli 入口

工作区内的 CLI 接入分支 `feat/cu-result-viewer` 已实现以下用法；需要安装该分支构建的 Python 包，不代表已发布的 CLI 版本具有这些选项：

```powershell name="cu-cli 查看结果"
cu analyze sample.pdf --view
cu analyze sample.pdf --view --result sample.result.json
```

第一种按原有流程分析，完成后打开 Viewer；第二种只读取已有源文件和 JSON，跳过分析、登录和服务调用。不带 `--view` 时保持现有 CLI 行为，不自动打开。首版每次查看一份本地 PDF/图片，服务前台运行至 Ctrl+C；关闭标签页不会结束服务。资源分发和限制见 [CLI 交接契约](docs/dev-plan.md#cli-handoff)。

<a id="embedding"></a>
## 嵌入 React

包目前为私有候选，未发布到 npm。先构建并生成本地 tgz，再由宿主安装该产物及其自己的 React/React DOM：

```powershell name="生成私有安装包"
npm run build
npm pack --ignore-scripts
```

已验证 React 18/19 的独立安装包宿主；具体版本和范围见[开发计划](docs/dev-plan.md#verification)。

```tsx name="宿主中的 Viewer"
import { ContentUnderstandingResultViewer } from "cu-result-viewer";
import type { ContentUnderstandingResultViewerProps } from "cu-result-viewer";
import "cu-result-viewer/styles.css";

export function AnalyzeResultView(props: ContentUnderstandingResultViewerProps) {
    return <div style={{ height: 720 }}>
        <ContentUnderstandingResultViewer source={props.source} result={props.result} />
    </div>;
}
```

公开输入仍只有：

| 输入 | 当前行为 |
| --- | --- |
| `source` | `File \| Blob \| ArrayBuffer \| string`；从内容识别 PDF/JPEG/PNG/BMP/HEIF/HEIC，不只相信扩展名或 MIME。 |
| `result` | `unknown`，传入已解析的原始 CU JSON 对象；接受 Succeeded envelope 或 inner result，不要求宿主标准化或构造 SDK 模型。 |

提供有界宿主高度并加载包内 CSS。窄容器保持桌面双栏和内部水平滚动，不自动上下堆叠。

字符串源仅接受 HTTP、HTTPS 和宿主拥有的 blob URL，不是文件系统路径或 data URL。请求使用 `credentials: "same-origin"`，跨源需要匿名 CORS，不额外附加凭据或 Authorization。宿主拥有的 blob URL 仍由宿主释放；调用方 buffer 和原始 JSON 不被修改。

### Vite 资源交付

已验证的构建宿主为 Vite 8，其他构建链未验证。宿主配置：

```ts name="宿主 vite.config.ts"
import { defineConfig } from "vite";
import { viewerAssets } from "cu-result-viewer/vite";

export default defineConfig({
    plugins: [viewerAssets()],
});
```

`viewerAssets()` 是仅在 Node 构建端导入的可选入口。它在开发时提供允许列表中的 PDF Worker、字体、CMap、WASM、ICC 及 HEIF 资源，构建时复制到输出目录；不提供任意文件读取或源文件服务器。

默认目录为 `build.assetsDir/pdfjs` 和同级 `heif`。可使用 `viewerAssets("assets/pdfjs")` 指定布局，但目录必须位于构建输出内，并与打包后 Viewer 入口解析的相对资源路径匹配。不要从源文件的跨域 origin 加载 Viewer 的 Worker/字体。

<a id="result-views"></a>
## 当前结果交互

从原始 JSON 识别 `2025-11-01`／`2026-06-01-preview`。标签按下列顺序根据选中 content 的适用非空数据出现，无值隐藏，不显示 disabled 占位；未知属性保留在 Result。

| 视图 | 行为 |
| --- | --- |
| Fields | 字段名称、值、已有置信度及来源；嵌套对象/数组默认折叠，缺失过滤不隐藏 `0`、`false`、空字符串或 `null`。后代继承根字段颜色，折叠不丢失固定选择。 |
| Markdown | 渲染原始 Markdown、GFM 和经清理的 CU HTML 表格；脚本、危险 URL 等不能执行。 |
| Paragraphs | 保留返回顺序、role/页码，选择定位真实来源。 |
| Tables | Current table 一次展示一张原生网格，保留表头和合并跨度；单元格可独立定位，非法网格明确报错。 |
| Figures／Signatures | 使用已加载 source 的真实区域裁剪及返回 metadata；不补造图片或签名状态。 |
| Metadata | 保留字符串键值顺序，支持单值复制；与 Signatures 一样使用当前 Preview 映射。 |
| Result | 完整原始输入/envelope，根展开、嵌套折叠，包括原有 usage，不显示内部标准化模型。 |
| Code | 有版本与 analyzer ID 时提供 Python/C#/JavaScript 示例、高亮和复制；endpoint/key/file URL 为占位符，不安装或执行 SDK。 |

切换标签不重挂 Source，不重置页码、缩放、旋转、平移或固定项/区域索引；切换 content 是另一操作，会重算适用视图。

原文叠加层分开绘制：

- 当前页 `pages[].words[].source` 绘制常驻浅黄色 OCR 基础层：`#FAFF7F40` 填充、1px 同色描边，所有 Tab 保留，与 fields/置信度无关。独立透明 Canvas 2D 按真实 CSS 尺寸/DPR 绘制，原图像素不动；相同区域只绘制一次，替换/卸载清空自身存储。
- Tab 层显示 Fields 彩框或 Paragraphs/Tables 等各自的真实区域；Markdown/Metadata/Result/Code 不保留其他 Tab 的框，黄色 Word 层仍在。
- 右侧字段 hover/focus 显示原文锚定的名称/Value/已有 Confidence，段落只显示 Content；临时预览不替换固定选择。Esc 可关闭，长值在有界浮层内滚动。
- 左侧表格图标 hover/focus 显示 Rows/Columns 和虚线来源框；click/Enter/Space 打开只读 Table 模态。X/Esc 关闭、焦点回图标，不切右侧 Tab、不改 pin/页码/缩放。

显式选择先导航可用来源页，只在目标位于可见视口外时调整平移，保留缩放/旋转；已可见目标不移动。键盘可操作字段、折叠、标签和控件，Source viewport 用方向键平移。无效页码/文件/JSON/来源会明确提示，源文件失败不隐藏有效结果。无来源时不画虚构区域。

<a id="implementation-limits"></a>
## 实现限制与安全策略

以下是当前实现边界，不是产品 SLA：

- Markdown 同步渲染上限 50,000 字符；JSON 为 500,000 序列化字符／20,000 值，Tables 网格为 20,000 位置。超限明确提示，不截断或修改调用方数据。
- 当前 Markdown 远程图片被替换为省略说明，不发起请求。
- 剪贴板使用宿主 Clipboard API，权限不足或不可用明确报错，不伪装复制成功；高亮通过安全 text/span 渲染，无 HTML 注入或 JavaScript eval。
- Worker、bitmap、URL 和画布按归属取消/清理；HEIF 解码有 30 秒截止保护，不代表解码延迟 SLA。HEIF 图像序列、AVIF 当前不支持。

### 宿主 CSP

独立使用方测试验证过如下页面/Worker 策略，不是所有宿主的通用保证：

```text name="已验证的生产宿主 CSP"
default-src 'self';
script-src 'self';
worker-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self';
object-src 'none'
```

几何/布局使用内联样式；PDF 不要求脚本 eval 或 Blob Worker。HEIF Worker 编译 WebAssembly，其 `script-src` 需增加 `'wasm-unsafe-eval'`，不是通用 JavaScript `'unsafe-eval'`。Vite 开发宿主另需自己的 loopback HMR WebSocket origin。

<a id="validation"></a>
## 开发验证

按变更范围选择现有命令，不为文档修改重跑全部浏览器矩阵：

```powershell name="类型、lint 和单元检查"
npm run typecheck
npm run lint
npm run test:unit
```

```powershell name="浏览器与独立安装包检查"
npm run test:e2e
npm run verify:performance
npm run verify:consumer
```

独立验证器构建 tgz，在仓库外安装 React 18/19 各自依赖并检查开发/生产、类型、资源和 CSP，不使用源码别名或共享 node_modules。默认 E2E 不包含该独立矩阵。几何、性能和压力测试沿用现有工程阈值，不将其扩展为产品 SLA。

### 更新 CLI 随包页面

在本仓库根目录执行，导出路径指向工作区中的 CLI：

```powershell name="构建并导出CLI静态资源"
npm run export:cli -- C:\github\content-understanding-toolkit\cu-cli\packages\standalone\src\cu_cli\resources\viewer
```

生产入口是 [cli](cli)，不带演示样本。构建/导出需要 Node.js 和 Python 3.10+；[导出器](tools/export_cli_viewer.py)使用 Python 标准库，以固定顺序、时间戳和权限生成 `viewer.zip` 与 `manifest.json`。清单包含归档及逐项资源哈希；旧版散装资源只在清单和哈希全部匹配后清理，人工修改或未知文件会阻止更新。

CLI 通过标准库在内存中校验并读取归档，不解压到用户目录。Python 包只携带这两个资源文件，PDF Worker 的内部 `build` 路径不会再被 Git 忽略规则漏掉。运行时无需 Node/Vite。导出回归可在已有 pytest 的 CLI 开发环境运行：`python -m pytest tools\test_export_cli_viewer.py`。

`npm run test:cli` 是独立的 Chrome/Edge 安装包检查，不纳入默认演示 E2E。运行前设置 `CU_CLI_PYTHON` 为测试 Python 路径、`CU_CLI_PACKAGE_ROOT` 为安装了本地 `cu-cli` 与 `cu-cli-core` wheel 的独立目录；测试要求真实安装包，不使用源码别名，并从 Python 子进程 PATH 排除 Node。

[视觉参考](tests/e2e/visual.spec.ts-snapshots)用于保持已批准的项目外观，不是逐像素复制 Studio。普通运行不自动更新参考；外观意图变化先评审。样本来源、许可、哈希和预期值见[样本清单](tests/fixtures/manifest.json)，计划及验证摘要见[英文开发计划](docs/dev-plan.md#verification)。

源码库不保留构建目录、测试输出、缓存或历史静态原型。测试基线、原始样本和带许可的 HEIF 预构建资源是开发/运行输入，需要保留；普通构建无需 Rust。`node_modules` 仅是已忽略的本地依赖目录，不进入分发。

<a id="supplementary-validation"></a>
### 验证边界

现有自动化覆盖键盘、焦点和 ARIA 行为；实际读屏未经验证，不宣称已通过。

## 许可证与分发

主项目为 [MIT](LICENSE)。PDF.js 和其他前端依赖的通知见 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)；当前 HEIF 为 MIT OR Apache-2.0 的 `heic-rs` WASM。[codec 构建说明](codecs/heic-rs-wasm/README.md)、[包内许可/SBOM](assets/heif)及[样本原许可](tests/fixtures/LICENSE.txt)保留在各自目录。

正常 npm 构建不需要 Rust；重建 codec 使用 `npm run verify:heif-codec`。分发时保留第三方许可和通知；包当前为私有候选，不自动公开发布。
