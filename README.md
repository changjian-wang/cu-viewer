# CU Viewer

面向 CU 开发者、技术实施和测试人员的只读本地结果查看器，将原始 PDF/图片与保存的 Azure Content Understanding（CU）Analyze JSON 并排展示，提供 Studio 式结果查阅和来源定位。以独立 Python wheel 交付，cu-cli 是其中一个入口；同一 React/TypeScript 组件也可嵌入其他宿主。

组件只负责渲染：不调用 Analyze、不认证、不上传、不管理 analyzer 或轮询 LRO，也不依赖 CU SDK。宿主负责取得源文件和分析结果。

## 文档入口

- **本文**：启动、使用、资源交付、当前限制和验证命令。
- [需求](docs/requirements.md)：当前 cu-cli Viewer 的交付范围和已确认行为。
- [开发计划（English）](docs/dev-plan.md#ui-redesign-react-migration)：原型对齐的 React UI 迁移阶段、依赖、验收矩阵与交付门禁；同一文档保留完整架构及既有交付记录。
- [UI 改造需求与独立原型](docs/ui-redesign/requirements.md)：已确认的视觉、交互和真实源文件边界；React 落地当前处于计划阶段，尚未修改正式实现。

## 代码结构

| 位置 | 职责 |
| --- | --- |
| [frontend/src](frontend/src) | 共用查看组件；model 负责解析，source 负责文档渲染与几何，interaction 负责选择与导航，components 负责界面。单元测试与模块相邻。 |
| [frontend/app](frontend/app) | 打入 wheel 的正式浏览器入口，不含演示样本。 |
| [frontend/demo](frontend/demo) | 本地开发、演示和浏览器测试宿主，不进入 wheel。 |
| [frontend/tooling](frontend/tooling) | 前端构建时的 PDF/HEIF 资源插件。 |
| [python](python) | 独立包、公开 Python API、输入校验、资源校验、本地 HTTP 服务和启动/退出生命周期。 |
| [scripts](scripts) | 跨语言打包导出、资源生成与交付验证。 |
| [tests](tests) | 共享样本、端到端/安装包测试与导出器回归。 |

保留一个 npm 项目，以下命令仍从仓库根目录执行。构建产物、依赖和缓存不属于源码或需提交的发行资源；资源及许可证保留规则见[开发计划](docs/dev-plan.md#repository-responsibilities)。

<a id="run-the-prototype"></a>
## 本地运行

需要 Node.js `^22.13.0 || ^24.0.0 || >=26.0.0`，在仓库根目录执行：

```powershell name="启动演示"
npm ci --ignore-scripts
npm run dev
```

打开 <http://127.0.0.1:5173/>。选择 PDF／Receipt PNG 使用真实配对样本，或分别选择本地源文件和保存的 JSON；不产生新的 CU 调用。文件选择属于演示宿主，不是组件公开 API。

该页面由[演示宿主](frontend/demo)启动，直接使用[组件源码](frontend/src)。它用于开发和调试，实际 CLI 接入见[开发计划](docs/dev-plan.md)。

## cu-cli 入口

工作区内的 CLI 接入分支 `feat/cu-result-viewer` 已实现以下用法；该分支仍使用更名前的 Viewer 包名和模块名，本次未修改相邻 toolkit，接入 `cu-viewer` 前需同步更新其依赖和导入。不代表已发布的 CLI 版本具有这些选项：

```powershell name="cu-cli 查看结果"
cu analyze sample.pdf --view
cu analyze sample.pdf --view --result sample.result.json
```

第一种按原有流程分析，完成后打开 Viewer；第二种只读取已有源文件和 JSON，跳过分析、登录和服务调用。不带 `--view` 时保持现有 CLI 行为，不自动打开。首版每次查看一份本地 PDF/图片，服务前台运行至 Ctrl+C；关闭标签页不会结束服务。资源分发和限制见 [CLI 交接契约](docs/dev-plan.md#cli-handoff)。

### 独立安装与更新

Viewer 独立发行 Python 包 `cu-viewer`，包含预构建页面和标准库启动器，不依赖 cu-cli、CU SDK 或 Node。cu-cli 接入时应只声明兼容依赖并调用启动接口，不保存 Viewer 资源副本。正式发布并完成 CLI 接入后，安装新版 cu-cli 会自动安装兼容 Viewer；也可在同一安装环境中单独升级 Viewer，而不重新发布 CLI。

当前候选版本为 `0.1.0b1`，尚未上传包索引，不能把公开旧版 CLI 当成已具备该依赖。普通用户使用正式 wheel，不需要构建环境；若包缺失/损坏，用原安装渠道修复独立 Viewer 包，不要求用户构建资源，也不自动下载安装。

项目包名和命令统一为 `cu-viewer`，Python 模块为 `cu_viewer`。旧包名、模块名和命令不提供兼容别名，已有宿主需同步更新引用；React 组件名称和公开接口保持不变。

正式发布后，pip 用户可在 cu-cli 所在的同一 Python 环境中独立升级兼容版本：

```powershell name="正式发布后的Viewer独立更新（目前尚未发布）"
python -m pip install --upgrade "cu-viewer>=0.1.0b1,<0.2.0"
```

不要在无关 Python 环境中运行更新；pipx 等隔离安装使用对应应用环境的包管理方式。

独立 Viewer 安装后也可以直接运行，不需要 cu-cli：

```powershell name="独立查看已有结果"
python -m cu_viewer sample.pdf --result sample.result.json
```

<a id="embedding"></a>
## 嵌入 React

包目前为私有候选，未发布到 npm。先构建并生成本地 tgz，再由宿主安装该产物及其自己的 React/React DOM：

```powershell name="生成私有安装包"
npm run build
npm pack --ignore-scripts
```

已验证 React 18/19 的独立安装包宿主；具体版本和范围见[开发计划](docs/dev-plan.md#verification)。

```tsx name="宿主中的 Viewer"
import { ContentUnderstandingResultViewer } from "cu-viewer";
import type { ContentUnderstandingResultViewerProps } from "cu-viewer";
import "cu-viewer/styles.css";

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
import { viewerAssets } from "cu-viewer/vite";

export default defineConfig({
    plugins: [viewerAssets()],
});
```

`viewerAssets()` 是仅在 Node 构建端导入的可选入口。它在开发时提供允许列表中的 PDF Worker、字体、CMap、WASM、ICC 及 HEIF 资源，构建时复制到输出目录；不提供任意文件读取或源文件服务器。

默认目录为 `build.assetsDir/pdfjs` 和同级 `heif`。可使用 `viewerAssets("assets/pdfjs")` 指定布局，但目录必须位于构建输出内，并与打包后 Viewer 入口解析的相对资源路径匹配。不要从源文件的跨域 origin 加载 Viewer 的 Worker/字体。

<a id="result-views"></a>
## 当前结果交互

从原始 JSON 识别 `2025-11-01`／`2026-06-01-preview`。标签按下列顺序根据选中 content 的适用非空数据出现，无值隐藏，不显示 disabled 占位；未知属性保留在 Result。

Tab 栏按可用宽度展示，放不下的标签收进右侧 `...` 下拉菜单，不再横向滚动。选择菜单项后切换视图，并让当前标签保持可见；支持方向键、Home/End 和菜单 Esc 关闭。不再提供 Code 标签。

| 视图 | 行为 |
| --- | --- |
| Fields | 字段名称、值、已有置信度及来源；嵌套对象/数组默认折叠，缺失过滤不隐藏 `0`、`false`、空字符串或 `null`。后代继承根字段颜色，折叠不丢失固定选择。 |
| Markdown | 渲染原始 Markdown、GFM 和经清理的 CU HTML 表格；脚本、危险 URL 等不能执行。 |
| Paragraphs | 保留返回顺序、role/页码，选择定位真实来源。 |
| Tables | Current table 一次展示一张原生网格，保留表头和合并跨度；单元格可独立定位，非法网格明确报错。 |
| Figures／Signatures | 使用已加载 source 的真实区域裁剪及返回 metadata；不补造图片或签名状态。 |
| Metadata | 保留字符串键值顺序，支持单值复制；与 Signatures 一样使用当前 Preview 映射。 |
| Result | 完整原始输入/envelope，根展开、嵌套折叠，包括原有 usage，不显示内部标准化模型。 |

切换标签不重挂 Source，不重置页码、缩放、旋转、平移或固定项/区域索引；切换 content 是另一操作，会重算适用视图。

原文叠加层分开绘制：

- 当前页 `pages[].words[].source` 绘制常驻浅黄色 OCR 基础层：`#FAFF7F40` 填充、1px 同色描边，所有 Tab 保留，与 fields/置信度无关。独立透明 Canvas 2D 按真实 CSS 尺寸/DPR 绘制，原图像素不动；相同区域只绘制一次，替换/卸载清空自身存储。
- Tab 层显示 Fields 彩框或 Paragraphs/Tables 等各自的真实区域；Markdown/Metadata/Result 不保留其他 Tab 的框，黄色 Word 层仍在。
- 右侧字段 hover/focus 显示原文锚定的名称/Value/已有 Confidence，段落只显示 Content；临时预览不替换固定选择。Esc 可关闭，长值在有界浮层内滚动。
- 左侧表格图标 hover/focus 显示 Rows/Columns 和虚线来源框；click/Enter/Space 打开只读 Table 模态。X/Esc 关闭、焦点回图标，不切右侧 Tab、不改 pin/页码/缩放。

显式选择先导航可用来源页，只在目标位于可见视口外时调整平移，保留缩放/旋转；已可见目标不移动。键盘可操作字段、折叠、标签和控件，Source viewport 用方向键平移。无效页码/文件/JSON/来源会明确提示，源文件失败不隐藏有效结果。无来源时不画虚构区域。

<a id="implementation-limits"></a>
## 实现限制与安全策略

以下是当前实现边界，不是产品 SLA：

- Markdown 同步渲染上限 50,000 字符；JSON 为 500,000 序列化字符／20,000 值，Tables 网格为 20,000 位置。超限明确提示，不截断或修改调用方数据。
- 当前 Markdown 远程图片被替换为省略说明，不发起请求。
- 剪贴板使用宿主 Clipboard API，权限不足或不可用明确报错，不伪装复制成功。
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

### 构建独立 Viewer 发行包（维护者）

维护者需要 Node.js、Python 3.10+ 和 Python `build` 工具，在仓库根目录执行：

```powershell name="构建独立Viewer的wheel和源码包"
npm run build:python
```

生产入口是 [frontend/app](frontend/app)，不带演示样本。[导出器](scripts/export_cli_viewer.py)默认只为[独立 Python 包](python)生成资源，以固定顺序、时间戳和权限生成 ZIP/清单；它们是已忽略的构建输入，不提交到 toolkit。`npm run build:python` 生成 wheel 和源码包，并从源码包重建 wheel；缺少/损坏资源时构建明确失败。

Viewer 自己负责归档校验、只读本地服务、浏览器打开及 Ctrl+C 清理，不解压到用户目录。CLI 在分析前调用 `prepare_viewer(source)`，完成后调用返回对象的 `show(result)`，不接触 ZIP 或资源字典。运行时无需 Node/Vite。

导出回归为 `python -m pytest tests\test_export_cli_viewer.py`，独立启动器测试为 `python -m pytest -c python\pyproject.toml python\tests`，使用已有 pytest 环境。

`npm run test:cli` 是独立的 Chrome/Edge 安装包检查，不纳入默认演示 E2E。设置 `CU_CLI_PYTHON` / `CU_CLI_PACKAGE_ROOT` 为安装了三个本地 wheel 的测试环境；`CU_VIEWER_PYTHON` / `CU_VIEWER_PACKAGE_ROOT` 指向只装 Viewer 的隔离环境。测试不使用源码别名，并从 Python 子进程 PATH 排除 Node。

仅验证独立 Viewer wheel 时，只需设置后一组环境变量，再运行：

```powershell name="独立Viewer安装包浏览器验证"
node .\node_modules\@playwright\test\cli.js test --config playwright.cli.config.ts --grep "independent Viewer wheel"
```

[视觉参考](tests/e2e/visual.spec.ts-snapshots)用于保持已批准的项目外观，不是逐像素复制 Studio。普通运行不自动更新参考；外观意图变化先评审。样本来源、许可、哈希和预期值见[样本清单](tests/fixtures/manifest.json)，计划及验证摘要见[英文开发计划](docs/dev-plan.md#verification)。

源码库不保留构建目录、测试输出、缓存或历史静态原型。测试基线、原始样本和带许可的 HEIF 预构建资源是开发/运行输入，需要保留；普通构建无需 Rust。`node_modules` 仅是已忽略的本地依赖目录，不进入分发。

<a id="supplementary-validation"></a>
### 验证边界

现有自动化覆盖键盘、焦点和 ARIA 行为；实际读屏未经验证，不宣称已通过。

## 许可证与分发

主项目为 [MIT](LICENSE)。PDF.js 和其他前端依赖的通知见 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)；当前 HEIF 为 MIT OR Apache-2.0 的 `heic-rs` WASM。[codec 构建说明](codecs/heic-rs-wasm/README.md)、[包内许可/SBOM](assets/heif)及[样本原许可](tests/fixtures/LICENSE.txt)保留在各自目录。

正常 npm 构建不需要 Rust；重建 codec 使用 `npm run verify:heif-codec`。分发时保留第三方许可和通知；包当前为私有候选，不自动公开发布。
