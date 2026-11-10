# CU Viewer

面向 CU 开发者、技术实施和测试人员的只读本地结果查看器，将原始 PDF/图片与保存的 Azure Content Understanding（CU）Analyze JSON 并排展示，提供 Studio 式结果查阅和来源定位。Go、Python 及后续 C# 等宿主统一从 CU Viewer Release 获取兼容静态资源并本地托管，不再各自内嵌前端副本；TypeScript 宿主也可通过 npm package 集成同一 React 组件。

本仓库只维护前端组件、演示和 Release/npm 交付，不再发行 Python 宿主、命令或 API。组件只负责渲染：不调用 Analyze、不认证、不上传、不管理 analyzer 或轮询 LRO，也不依赖 CU SDK。各语言 CLI 自己负责取得源文件和结果、下载缓存、只读本地服务、浏览器启动和退出生命周期。

## 文档入口

- **本文**：启动、使用、资源交付、当前限制和验证命令。
- [需求](docs/requirements.md)：当前 cu-cli Viewer 的交付范围和已确认行为。
- [开发计划（English）](docs/dev-plan.md#ui-redesign-react-migration)：原型对齐的 React UI 迁移阶段、依赖、验收矩阵与交付门禁；同一文档保留完整架构及既有交付记录。
- [UI 改造需求与独立原型](docs/ui-redesign/requirements.md)：已确认的视觉、交互和真实源文件边界；React 已按原型迁移，当前功能／单测／视觉验证及历史消费端验收范围见开发计划，尚未正式发布本轮安装包。

## 代码结构

| 位置 | 职责 |
| --- | --- |
| [frontend/src](frontend/src) | 共用查看组件；model 负责解析，source 负责文档渲染与几何，interaction 负责选择与导航，components 负责界面。单元测试与模块相邻。 |
| [frontend/app](frontend/app) | 多语言宿主共用的 Release 浏览器入口，不含演示样本。 |
| [frontend/demo](frontend/demo) | 本地开发、演示和浏览器测试宿主，不进入 Release 静态资源。 |
| [frontend/tooling](frontend/tooling) | 前端构建时的 PDF/HEIF 资源插件。 |
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

以下是 Python cu-cli 已确认的命令契约；工作区历史接入分支 `feat/cu-result-viewer` 仍依赖已退出本仓库的 Python 宿主。本次没有修改相邻 toolkit，也没有替它完成原生下载/缓存/托管迁移，不能将旧接入或公开 CLI 视为已兼容新的 Release 交付：

```powershell name="cu-cli 查看结果"
cu analyze sample.pdf --view
cu analyze sample.pdf --view --result sample.result.json
```

第一种按原有流程分析，完成后打开 Viewer；第二种只读取已有源文件和 JSON，跳过分析、登录和服务调用。不带 `--view` 时保持现有 CLI 行为，不自动打开。首版每次查看一份本地 PDF/图片，服务前台运行至 Ctrl+C；关闭标签页不会结束服务。资源分发和限制见 [CLI 交接契约](docs/dev-plan.md#cli-handoff)。

### 原生宿主与资源更新

Go、Python、C# 等 CLI 使用各自语言实现同一 Release/会话契约，不依赖本仓库的 Python 包，也不保存前端资源副本。Go azd 扩展已完成真实公网资源下载、缓存、一次 Azure 分析及本地浏览器查看验证；Python/C# 等宿主须在各自 CLI 仓库实现或迁移，本轮不宣称它们已经接入。

首次查看时，宿主先下载并验证兼容 Release，再开始任何分析。已有有效缓存仍可离线使用，不自动升级。Go 的 `--view` 最多每 24 小时检查一次 Release 元数据，使用 3 秒超时；发现兼容新版本时提示当前版本、新版本及手动更新命令，已知提示会在后续启动中继续显示，直到更新或刷新检查信息。检查不下载新版归档、不切换活动缓存；检查失败明确警告并继续使用有效缓存。缓存缺失或损坏时明确报告准备过程；资源下载失败、没有兼容 Release 或资源缓存无法安全写入时，非零退出，不打开空白页、不开始分析。状态写入 stderr，不污染原始结果输出。文档、结果和 Azure 凭据不会发给资源下载地址。

资源更新不要求重新安装宿主；新版本提示不会触发自动升级。已实现的 Go 显式入口是：

```powershell name="显式更新兼容Viewer资源"
azd ai cu viewer update
```

各宿主使用私有的系统用户缓存，只保存校验后的静态资源及活动版本记录，不保存文档和分析结果。失败更新不替换已有有效版本。旧的 `python -m cu_viewer`、独立 `cu-viewer` 命令和 Python API 已移除；已有 Python CLI 不能只修改包名继续调用它们。

首个资源预览 [v0.1.0-preview.1](https://github.com/changjian-wang/cu-viewer/releases/tag/v0.1.0-preview.1) 已公开发布，基于源码提交 `9b1667703502ff6dd3035c644a7b4377fb6ac054`，包含 225 项资源、schema 2 和 protocol 1；不含仍隔离的单工具栏预览。Go 宿主需要运行时资源下载版本，旧的内嵌资源扩展不会使用该 Release。首次准备需要访问 GitHub；匿名 API 限流等下载错误会在分析前明确退出，不应通过重新分析或未经校验的缓存绕过。

<a id="embedding"></a>
## 嵌入 React

包目前为私有候选，未发布到 npm。先构建并生成本地 tgz，再由宿主安装该产物及其自己的 React/React DOM：

这是 TypeScript 版 cu-cli 等组件宿主的保留交付方式，不要求其他语言通过 npm 或 Python wheel 获取前端资源。

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

以下两个必需输入保持兼容：

| 输入 | 当前行为 |
| --- | --- |
| `source` | `File \| Blob \| ArrayBuffer \| string`；从内容识别 PDF/JPEG/PNG/BMP/HEIF/HEIC，不只相信扩展名或 MIME。 |
| `result` | `unknown`，传入已解析的原始 CU JSON 对象；接受 Succeeded envelope 或 inner result，不要求宿主标准化或构造 SDK 模型。 |

可选字段顺序配置：

| 输入 | 行为 |
| --- | --- |
| `defaultFieldOrder?: ViewerFieldOrder` | 非受控初始顺序；同结构的合法浏览器偏好优先，否则采用此值，再采用原始输入顺序。 |
| `fieldOrder?: ViewerFieldOrder` | 宿主控制顺序；组件只呈现该值，不把宿主顺序另存为浏览器顺序。没有变更回调时只读。 |
| `onFieldOrderChange?: (order: ViewerFieldOrder) => void` | 提交新的不可变顺序映射；受控模式由宿主更新 prop 并负责持久化。 |

`ViewerFieldOrder` 为 `Readonly<Record<string, readonly string[]>>`：以内容相对的、正确转义的 JSON Pointer 表示字段路径，根层使用 `$root`。例如 `{ $root: ["/InvoiceId", "/Customer"], "/Customer": ["/Customer/Name"] }`，不含 envelope、content 序号或 `valueObject` 容器路径。未列出的同级字段仍按输入顺序追加；数组业务行与单元格不可重排。排序、搜索及表格投影均不改写原始 JSON。

```tsx name="受控字段顺序"
import { useState } from "react";
import { ContentUnderstandingResultViewer } from "cu-viewer";
import type { ContentUnderstandingResultViewerProps, ViewerFieldOrder } from "cu-viewer";

export function OrderedResultView({ source, result }: ContentUnderstandingResultViewerProps) {
    const [order, setOrder] = useState<ViewerFieldOrder>({ $root: ["/InvoiceId", "/Customer"] });
    return <div style={{ height: 720 }}>
        <ContentUnderstandingResultViewer source={source} result={result}
            fieldOrder={order} onFieldOrderChange={setOrder} />
    </div>;
}
```

提供有界宿主高度并加载包内 CSS。桌面双栏保留源区 570px、结果区 440px 与 8px 分隔条的最小宽度；更窄的嵌入容器在组件内水平滚动，不自动上下堆叠。字段与内嵌数组表格各自滚动，不把表格横向溢出传到结果外层。

<a id="azd-viewer-preferences"></a>
### azd Viewer 字段顺序

生产入口通过 `session.json` 中可选的 `fieldOrderUrl` 读取宿主偏好，并复用受控 `fieldOrder`／`onFieldOrderChange`，不把宿主顺序另存到浏览器。没有该能力的旧宿主及普通 React 嵌入仍保留既有浏览器偏好。

Go CU 宿主把用户实际自定义的顺序保存到 `azd config` 使用的用户 JSON，层级为 `extension → installed → ["azure.ai.content-understanding"] → Viewer → fieldOrderByAnalyzer`。键仅使用完整 analyzerId，例如 `prebuilt-invoice`；排序配置不保存 endpoint、文件名、路径或 API 版本。同 analyzerId 跨资源、换文件或重启后复用，不同 analyzerId 互不影响。值沿用 `ViewerFieldOrder` 的内容相对 JSON Pointer 映射，而不是只保存顶层名称数组。

旧 `endpoint#analyzerId` 键在首次读取或保存偏好时迁移为纯 analyzerId，保留已有顺序、其他设置和安装元数据；相同顺序可合并，同名 analyzer 的不同旧顺序会明确报错、不覆盖任何一份，需先选择保留的顺序。迁移只处理已有自定义，不创建默认排序。连接服务所需的既有 CU endpoint 设置不受影响。

只打开文件、展开对象或修改置信度显示不会创建排序覆盖；Reset Field Order 只移除当前 analyzer 的覆盖，保留其他 analyzer、扩展安装元数据、`Viewer` 中其他设置及既有 CU 默认值。失效字段／父级路径只在展示时忽略，新字段按原顺序追加，不因 schema 兼容处理改写顺序。读取失败时仍可查看源文件和结果，但排序禁用并明确提示；写入按顺序提交，失败明确提示并回到最后确认的顺序。

该桥接要求配套的 Viewer 和 CU 宿主；扩展重装／更新时保留 `Viewer` 还要求包含安装记录保留修补的 azd 核心。旧 azd 可能在修改安装记录时丢弃该字段，本轮没有替换系统 azd 或已安装的私有扩展。

### 查阅、来源与偏好

- Fields 默认显示 Field／Value 两列；右侧 Settings 中的 `Show Confidence` 使用左侧标签、右侧紧凑滑动开关，复用 Legend 的轨道和焦点样式，保留 35×28px 点击区域。文字、同一 label 行内空白和开关均可原生切换第三列，点击时不关闭面板，键盘 Space、外部点击及 Escape 行为保留。沿用原有 `columns` 浏览器偏好，已保存的三列设置继续有效。置信度阈值为 `0.70`，三个高亮开关默认启用；未知置信度与有效的 `0` 区分，组级 Confidence 仍留空。
- 右侧 Fields 移除顶部统计／搜索／筛选区域，只保留结果标签和表格。44px 底栏与 Source 对称：左侧为搜索，placeholder `Search field names or values...` 明确字段名／值搜索范围，悬停保留完整提示；中间为“上一字段 — 当前序号／总数 — 下一字段”（例如 `1 / 77 fields`），数字只读，右侧只保留 Settings 齿轮。最窄支持宽度为 440px，各项不重叠。Settings 内为 `Show Confidence` 和其下的 Reset Field Order，不再显示 Low confidence 筛选及阈值／浏览器偏好说明。
- Settings 的 Reset Field Order、Collapse all object fields、Expand all object values 均使用全宽左对齐操作行，启用时悬停／键盘焦点使用与值菜单一致的浅蓝高亮；禁用操作不显示可点击高亮，原禁用原因及回调保持。
- 当前序号按可导航叶字段的实际显示顺序从 1 连续编号；未选中、选中分组或选中字段不在当前范围时显示 `— / 总数 fields`。搜索／关联表格范围内按匹配字段重新编号，分母为该范围的叶字段数，无匹配时为 `— / 0 fields` 并禁用前后按钮。拖拽、键盘重排、受控宿主顺序更新及 Reset Field Order 保持选中字段身份并实时重算序号，不保存独立游标、不改原始 JSON；鼠标预览与折叠分组不改变序号。数组按原业务行、统一显示列从左到右导航，首尾继续循环；未选中时 Next 从首字段、Previous 从末字段开始。
- 来源的多页文档箭头与字段导航一样首尾循环：第 1 页的 Previous 跳到末页，末页的 Next 回到第 1 页，边界 tooltip 分别为 `Previous page (last page)`／`Next page (first page)`；其他页为 `Previous page`／`Next page`。单页 PDF 的箭头仍禁用并提示 `Single-page document`，来源未就绪时提示 `Source not ready`；图片仍显示单页说明。页码输入继续严格校验 `1–总页数`，不把 `0` 或越界输入自动循环，也不改变既有定位、缩放及其他快捷键行为。右侧保持 `Previous field`／`Next field` 与字段循环，无匹配时禁用并提示 `No matching fields`。悬停不导航，工具栏尺寸及原有无障碍名称不变。
- `Hide missing`、`2 columns`／`3 columns` 和低置信度筛选按钮移除，对应隐藏／分数筛选状态不再保留；缺失字段仍参与搜索／导航。移除 `not returned` 统计不删除缺失值或原始 Result；没有返回置信度的值仍按实际情况显示 N/A，不当成分数 0。搜索及关联表格范围仍可暂时过滤行，清除搜索／退出范围会恢复全部字段；左侧 Legend 的低置信度高亮开关和真实阈值语义不变。
- 表格关联范围保留 Show all、范围说明和被搜索隐藏字段的提示；实际错误／重排提示不被删除。Reset Field Order 只恢复字段顺序，不重置 Confidence 显示、阈值或其他设置。字段完整值详情和复制反馈放在内容区、底栏上方，不把右侧底栏顶离左侧。右侧设置向上展开，Esc／关闭返回齿轮，外部输入不抢焦点。其他结果标签不提供 Fields 专属控制。
- 演示页面最底部的 Local source／HEIF/HEIC 说明条移除，不保留空白占位；左右工具栏位于页面底部，源文档和结果使用原说明条释放的 26px 空间。演示样本、本地文件选择、只读行为、资源格式支持及安全策略不变。
- 首次打开时对象默认折叠，非空数组表格默认展开，包含折叠对象内暂时隐藏的表格；打开父对象后表格仍保持展开。Fields Settings 增加带叠层方框减号／加号图标的 `Collapse all object fields`／`Expand all object values`，覆盖嵌套对象但不改变表格的手动状态、字段顺序或保存排序。搜索期间沿用自动展开匹配路径，批量对象操作禁用并提示先清除搜索；阈值、排序或标签切换不重新覆盖用户展开状态。
- 低置信度仅表示优先查阅；右侧只强调低置信度值，不染整行。原始 PDF／图片文字不重画；来源采用完整色强的 multiply 混合高亮及独立的固定／临时预览轮廓，不额外以 75% 透明度冲淡色板，也不以实色遮盖原文。不再常驻黄色 OCR 底层，原始 OCR 数据仍保留在 Result。
- 来源高亮有独立的 1 CSS px 同色圆角外沿，仅改善视觉留白；装饰层不参与交互，不扩大真实来源坐标、点击命中或浮层锚点。关闭对应源区高亮时，外沿也一并隐藏。
- Show field highlights／Show table highlights 只控制源区填充；右侧字段及内嵌数组的低置信度提示仅由 Show low confidence highlight 控制。三个开关与颜色说明合为同一 Legend 列表，不再保留独立 Options 区域；齿轮设置只保留 `0–1` 数字阈值与 `0.01` 步进，保留输入的实际阈值精度及三个开关的原有含义。
- Source 仅保留来源视口下方的一条 44px 工具栏：左侧只显示文件图标和文件名，不再显示字段名、状态提示、计数、多来源前后切换或分组来源页选择器；页码相对整个 Source 居中，缩放／适应／旋转及 Legend／设置靠右。原 57px 顶部栏移除，文档阅读高度增加 57px。长文件名仍单行尾部省略，完整名称及 PDF 页数／图片尺寸保留于悬停／无障碍描述。最窄支持宽度为 570px；900px 及以下使用紧凑控件，选择变化不增减行高，fit 按真实可用空间重算。右侧字段定位、居中页码导航和原文来源点击保留，真实来源错误仍独立明确提示。
- 左右设置弹层的可见标题统一为 `Settings`；齿轮悬停提示和弹层无障碍名称分别为 `Source settings`／`Fields settings`，关闭按钮也按所在面板区分。左侧保留 `Confidence threshold`，右侧保留 `Show Confidence` 和 Reset Field Order，不改变阈值、高亮、排序或偏好行为。
- Legend 在所有宽度下保留文字按钮，不再常驻简版色块。浮层保留字段／表格的正常和低置信度四种只读色板，分别对应原有三个开关。低置信度字段／表格归入带分隔线的 `Low confidence` 分组，副标题 `Fields & tables` 明确第三个开关同时作用两类值。三个开关位于同一右侧列：前两个对齐正常色块，第三个对齐共同的分组标题，两种低置信度色块位于其下且不增加独立开关。`Confidence unavailable` 图例说明已移除，但灰色无分数来源的渲染语义不变。色块和文字都不可点击或聚焦。
- Legend 三个开关的视觉尺寸缩小 20%：轨道为 28×16.8px、滑块为 12px，居中保留原有 35×28px 点击区域。轨道外的热区仍可切换，Tab／Space 和清晰的焦点提示保留；颜色、状态含义及高亮／偏好逻辑不变。
- 原 34px 提示行及常驻手势说明已移除，不留空行。按后续明确确认移除底部 X，不新增替代按钮；清除沿用已有 Esc／原文空白处点击，保持原操作逻辑。演示宿主的 Source／Result 文件选择区及右侧结果工具栏不属于此次 Source 工具栏合并范围。
- PDF／图片在常规缩放期间保留当前页原文预览，新光栅离屏完成后替换，不用整块 Loading 占位覆盖。首次加载、换页／换文档及真实失败仍按实际状态提示，不显示不匹配的旧画面。
- 固定百分比缩放后，页面四边都保留在实际可滚动范围内，滚动／拖动后仍可访问完整原文；不会为消除裁切而自动切回 Fit page 或改变所选比例、页码及关联字段范围。手势锚点、来源坐标和浮层定位与实际页面位置保持一致。
- 所有支持的 Source 宽度均直接显示底部旋转按钮，不再通过 More 回退；顶部 More 和独立的 Reset layout widths 菜单入口已移除。分栏仍可拖动，双击来源／结果分隔条或字段列分隔条可分别恢复默认宽度；右侧字段及值操作菜单不受影响。
- 字段／表格开关控制各自的全部来源填色，包括低置信度和无置信度来源，不删除来源命中或选择轮廓。低置信度开关关闭时，低分值按正常字段／表格色显示，右侧低置信度强调关闭；N/A 仍表示未返回分数，不等于真实 `0` 或值未返回。三个开关始终可操作，全部关闭后也能恢复。
- 完整图例和设置均向上展开，按真实来源视口高度限高并内部滚动，不遮住底栏控件。Legend 名义宽度为 310px、最大高度为 520px；Tab 只访问关闭按钮和三个开关，颜色说明不进入 Tab 顺序。页码校验错误显示在底栏上方，不撑高单行工具栏；阈值错误仍在设置面板内明确提示。Legend／设置互斥；Esc 或关闭按钮返回对应入口焦点，外部点击或图例键盘移出不抢焦点。仅打开或点击只读色块不保存偏好。
- 偏好键和外层 v1 格式不变，阈值、三个开关、布局和字段顺序继续保存。旧记录中的合法 `sourceCategories` 五类隐藏状态只做兼容校验，不再影响渲染，也不在读取时重写存储；下次用户修改设置后不再写入该废弃字段。畸形旧记录仍明确报错并等待显式重置，不自动覆盖。
- 实际鼠标移动或明确键盘聚焦才预览，预览不翻页、不滚动。点击、Enter 或定位菜单才选择并按需跳页；分组定位包含全部真实后代来源，不以第一个子字段代替整组。
- 普通字段、嵌套值、数组单元格及 Paragraphs 段落选中后，左侧保留该目标在当前页的全部真实来源。相邻、同列的多行值可用一个无填充、无额外留白的显示外框表达；若跨栏、分散或外框会圈入当前视图中的其他目标，则保留多个原轮廓。Fields 检查包含已隐藏的缺失字段，不按名称做特例，也不把不同目标或整组选中强行合框。
- 合框只改变选中装饰层；原始来源多边形、逐片段置信度底色、点击命中及定位仍独立保留，新增空白不成为可点击来源。真实片段索引不是显示框索引，选择原文中的另一片段不会缩小选中范围；跨页仍需显式操作，不再在底部展示来源数量或 `Location n of total`。
- 普通字段／数组值及 Paragraphs 段落的鼠标与明确键盘焦点预览使用同样的完整、1.8px 中性实线外框及安全合框规则，不再只虚线框住当前一行。预览与固定状态仍独立：悬停不替换固定项、不改定位序号、不翻页、不滚动或增加留白；离开后只清除临时框。数组分组、Figures、Signatures 等其他详情预览保持既有样式。
- Fields 中的对象字段也支持悬停／焦点浮层，包括折叠及嵌套对象。正文复用右侧对象摘要，例如 AmountDue 的 `610 USD`，表格关联范围内只摘要范围内值，不生成组级 Confidence。对象预览取当前页全部实际后代来源的包围盒并集，使用无填充、无留白的 1.8px 显示框；真实来源及点击命中不扩大。没有当前页来源时不造框、不翻页，空间不足时沿用只显示轮廓的规则；悬停不展开对象、不改变固定选择、字段顺序或文档视口。
- 点击 PDF 中的段落后，右侧选中对应的真实段落，必要时只在段落列表内将其安全显示并使用与 Fields 一致的来源定位强调，不抢走 PDF 焦点。重复点击可重新定位；仅悬停、右侧选择和标签恢复不重放或覆盖手动滚动。Esc／原文空白处点击沿用 Fields 的清除规则，不修改原 PDF、原始段落内容或 JSON。
- 生产页面删除独立的 54px 应用标题栏，保留结果标签和底部文件名／翻页／缩放工具栏。浮层仍位于当前连续来源块下方左对齐、间距 12px，不改变真实来源坐标。鼠标离开实际命中区立即关闭，不保留 150ms 延迟；浮层鼠标穿透，不能阻挡背后的其他字段。点击只固定选择，离开后不回退显示已选字段的浮层；键盘焦点预览及 Escape 保留，显式定位仍只按需显示真实来源。
- 浮层名称和正文与正常结果值共用 12.5px 字号；名称使用常规字重 400，不与值争抢阅读重点，正文保留半粗 600，置信度徽标仍为 11px。名称区及向上尖角共用选中行 `#E5DAFF`，名称为 `#4C1D95`；正文白底、`#243447`，不随置信度变色。长名称换行，紧凑正文可裁剪但完整值仍在结果／详情中滚动和复制；该持久入口是不可悬停浮层的等效阅读方式。段落仍只显示真实 Content，不添加虚构字段名或 Confidence。
- 键盘在字段上按 Enter／Space 后，焦点仍在该字段时可继续预览，并完成原有显式来源定位；焦点移出后只关闭预览，保留固定选择。鼠标选择不保留这种焦点预览。
- 低置信度表格填充由 `#FFE8EC` 改为 `#F6C5CC`，来源高亮、表格值标签、徽标与图例共用；标量低置信度 `#FCE8E6`、低分文字 `#9B1C1C`、分数和阈值判定不变。
- Ctrl／Command + 滚轮及触控板 pinch 在指针处缩放；普通滚轮保留滚动。手动缩放以 25%–300% 为常规范围，同时保留原本超出该范围的 Fit page 能力，不替代源格式与渲染容量限制。
- Fields 支持搜索、低置信度过滤、上下键浏览、Enter 定位、F2 完整值及 Shift+F10 值操作；Alt+Up/Down 或拖动仅调整同级展示顺序。两种宽度分隔条可拖动、用左右键调整或双击恢复默认。
- Fields 导航工具区只保留匹配计数和上一／下一字段，不再提供“查看当前选中值”信息图标快捷入口。完整值仍可从字段主入口／数组单元格上的 F2、值菜单或折叠摘要查看。分组的定位按钮在悬停／聚焦时出现，选中背景及全部后代来源保留，但名称旁不再显示 `n selected`；源区页脚仍保留真实字段／来源数量。组级 Confidence 留空，不伪造汇总分数。
- 折叠对象的 Value 按原有子值顺序显示真实提取值摘要，例如 AmountDue 的 `610 USD`，不硬编码业务名称、不生成 `N properties`。所有数组（含嵌套数组）只在 Value 列保留真实 `N items`，展开／折叠时都不再在名称旁重复显示 `[数量]`；完整数组入口、F2、实际业务行号及数据不变。`0`、`false`、空字符串、`null`、空对象与未返回不混淆，展开后仍展示原有完整结构。
- 长 Value 和折叠摘要按实际列宽单行省略，不撑高行、不挤压 Confidence／定位按钮，也不在数据层截字符串。点击折叠摘要或在字段上按 F2 可打开现有完整值详情；详情及复制使用完整原值（对象／数组为原值 JSON），不复制摘要或省略号。查看详情不展开分组、不重新定位 Source，关闭后返回对应字段焦点。
- 真实摘要沿用父级命中后的后代搜索／计数规则；低置信度仍按叶字段自身分数过滤。在仅看表格相关字段时，必要父级的摘要与摘要搜索只包含范围内值，不带出无关子字段；显式查看完整值仍保留原始对象。内嵌表格继续按内容紧凑分配列宽，保留横向滚动及真实嵌套金额列。
- 内嵌数组与 Fields 内容左缘对齐，不再额外缩进。横向滚动时，`#` 与序号列固定在真实裁剪边界，保持不透明背景，不会露出滚走的文字；业务行顺序、值操作和来源定位不变。
- 内嵌数组使用单层 1 CSS px 细网格：行分隔 `#E7EBF0`、更淡的列分隔 `#EEF1F5`，外沿／表头底线／固定序号右边界 `#DCE3EB`。保留原边框占位，仅单侧绘制可见内网格，避免相邻两格叠成 2px；固定序号去掉额外分隔阴影。列宽、原有行高、紫色交互底色、低置信度标签及独立键盘焦点不变，不修改 PDF 本身的表格线或浮层位置。
- Hover 与固定选中使用同一靛紫系区分层级：源区临时框 `#8063B5`、固定框 `#5B21B6`；Fields 普通行、折叠父级及数组单元格 hover 为 `#EEE7FF`，实际选中／整组选中为 `#E5DAFF`，表格关联范围为更淡的 `#F8F5FF`。hover 采用更柔和的中紫轮廓与稍明显的浅紫底色，使左右视觉强度更接近，但不把细框和大面积底色强行设成同一色值。左右 hover 联动，不自动展开或滚动；选中优先，已选项再次被指向时不会变浅。
- 整组选中时，标题、子字段及内嵌数组正文／固定序号使用连续选中底色；切换到单值后撤掉普通整组底色，不染无关行列。源区固定层最后绘制，预览已选字段或其选中后代时复用固定框、不重复叠描，浮层／定位状态仍独立。交互轮廓使用 `geometricPrecision` 抗锯齿，保留原线宽／坐标与框距，避免小数像素硬对齐导致四边粗细不一；只作用于显示框，不改变语义填充、真实命中或原文。交互底色上的中性次要文字为 `#526276`，正文、低置信度标签及键盘焦点样式不变。
- 数组当前单元格对应的行号／列标题用更淡的 `#F8F5FF` 背景提示，不染无关行列、不叠加粗框或加粗底线；键盘导航仅显示单层细焦点线。左侧来源点击对所有 Fields 目标统一采用约 1 秒的 `#D8C6F2` 到静态背景渐淡，不闪描边；减少动态效果时仅保留静态背景，右侧选择、悬停及标签恢复不重放强调。
- 点击源表格后，Fields 临时进入 `Related fields only`，集中展示已有的关联对象／数组及其完整子结构，不新建 Document Tables 分组、不重排原始字段。关联字段块用连续浅紫底，当前具体值用稍深底色；粉色低置信度标签不变。
- 在相关字段里选值、看详情或复制时仍保留范围；搜索／筛选继续生效。`Show all` 恢复进入范围前的展开、纵向和数组横向位置，不撤销你在范围内明确修改的搜索／筛选，也不改写已保存排序。范围内暂时禁用拖拽、Alt 排序和 Reset Field Order。
- 悬停范围外的源值不会退出范围；明确选择范围外的源字段会退出并定位该字段，清除选择或换文档也会退出。无可靠表格关联时只提示，不进入空的限定范围。`Show all` 只关闭限定范围，保留当前选择及关联提示；关闭详情时可安全回到恢复后的折叠父级。
- 非受控顺序、阈值、高亮及布局偏好按分析器、API 版本和真实字段结构隔离，保存在当前浏览器；不存提取值，不同步账号。读取损坏、不兼容或写入失败会明确提示，不静默覆盖，损坏记录需显式重置。受控排序的保存职责仍属于宿主。
- Fields、Markdown、Paragraphs、Figures、Signatures、Info、Result 按实际返回数据启用。Fields 只在当前 content 有结构化 fields 时显示；没有 fields（例如 prebuilt-layout）时，即使有原生 tables 也隐藏 Fields，默认显示非空 Markdown；没有 Markdown 时回退到其他适用视图。独立 Tables 标签已移除；源表格直接定位现有 Fields，不增加 Document Tables 分组或原生表格副本。无 fields 时点击源表格保留当前视图并明确提示无对应字段，不切回隐藏的 Fields。原始表格内容、跨度、缺口及解析问题仍保留在 Result。源视图不因切换标签而重建，字段展开、筛选与各视图滚动位置保留。
- Paragraphs 使用按连续来源页集合分组的紧凑列表，不重排或合并服务返回的段落；跨页组显示全部页码，无来源组明确标注。页标题使用整行浅灰蓝底、12.5px／600 深色字和细底线，单行高度约 33px，不使用选中态紫色或卡片外框。移除每段卡片外框和重复标题／页码行，保留全局序号、role 及多区域计数，完整来源说明仍可通过提示和无障碍描述查看。正文为 12.5px／20px 行高，单行项约 33px；长正文和连续长字符完整换行，不默认截断、折叠或添加内部滚动。整行选择、悬停、键盘和原文定位行为不变；专属样式不影响 Figures／Signatures 卡片。
- Paragraphs 页标题使用与 Fields 一致的展开／收起箭头，整条标题可点击，也支持 Enter／Space；默认全部展开，换结果后恢复展开。每个连续页组独立折叠，只隐藏右侧段落，不重排编号、不清除左侧固定选择或改变原文视口。新的明确原文定位请求会自动打开目标所在组并定位一次，不转移键盘焦点；悬停或旧选中状态不会撤销手动收起。正文不单独折叠，不持久化搜索或折叠偏好。
- Paragraphs 底部说明改为 Fields 同款 44px 工具栏：左侧按名称／路径／正文搜索，中间上一段／下一段按匹配顺序循环并显示当前位置，右侧 Settings 提供 `Collapse all pages`／`Expand all pages`。段落导航会选中并聚焦目标、打开所在页组并定位原文；没有选中匹配项时，Next 从首项开始、Previous 从末项开始。搜索临时展开匹配页组，页级及批量折叠暂时禁用，清空后恢复手动折叠状态；无匹配时明确提示并禁用导航。原文选中项若被搜索隐藏则明确提示，不清空搜索、不撤销手动折叠。设置与 Info 共用弹层，保持操作后的弹层、Esc／外部关闭及焦点行为一致。
- Info 替代 Metadata 标签，按所有 `result.contents[*].metadata`（依 content 顺序分组）、顶层 `usage`、`result.infos`、`result.warnings` 的固定顺序展示。使用类似 Fields 的只读名称／值树形表格，所有层级默认展开，可手动折叠；不提供 Copy 控件、字段来源、Confidence 或排序。保留返回的空对象／数组、`null`、`0`、`false` 和空字符串；不存在的分组不补造，四类属性全部缺失时隐藏 Info。支持完整操作响应及 inner result，不绑定 Preview；不修改原始 Result 或任何配置。
- Info 底部不显示说明文字，改用与 Fields 相同的 44px 底栏、右侧 Settings 齿轮和设置弹层；只提供 `Collapse all groups`／`Expand all groups`，作用于所有非空对象和数组分组，包括当前隐藏的后代。操作后弹层保持打开，无可展开分组时禁用两项；Esc／关闭按钮恢复齿轮焦点，点击或聚焦外部关闭但不抢回焦点。换结果关闭设置并恢复默认全部展开，不改变 Fields 或任何配置。
- metadata 统一使用 `metadata → contents[0] / contents[1] → 各自属性` 的树结构，单 content 也保留 `contents[0]`；只显示实际返回 metadata 的 content，并保留原始零基序号和 JSON Pointer 路径。metadata 总组和各 content 可独立折叠。Info 正文沿用 Fields 的 12.5px 常规字重和 20px 行高，顶层标题 600、嵌套组 500，项目数为 11px 次要文字；infos、warnings 及其他嵌套数组的自动标签统一小写 `item 1`，不改变原字段名或值的大小写，计数区分 `1 item`／`2 items`。空分组保留同层标题底色且没有无效展开按钮。长名称单行省略并保留完整悬停／无障碍文本，长值完整换行显示，不截断原值。

- Info 中数值映射型 `usage.tokens` 折叠时，在右侧值列显示模型名及计数；只有同模型名精确匹配的 `-input`／`-output` 成对计数合并为 `模型 (in 数值 / out 数值)`，模型组按首次出现顺序排列并以分号分隔。不同模型不混合，未知或未配对的键（包括其他计数类型）保留原名及数值。摘要固定单行、与普通行同高，超出省略；优先省略模型名以保留完整计数，计数本身仍放不下时也明确省略，不撑宽或增高。悬停或键盘聚焦摘要可查看完整内容，Esc 关闭提示，点击或 Enter／Space 展开后返回原始子行并恢复左侧展开按钮焦点。只截断摘要，不改变原值、默认展开状态或其他分组；空值及非计数结构仍按原树显示。

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

从原始 JSON 识别 `2025-11-01`／`2026-06-01-preview`。标签按下列顺序根据选中 content 的适用非空数据出现，Info 例外：它汇总完整响应，保留明确返回的空值；不显示 disabled 占位，未知属性保留在 Result。

Tab 栏按可用宽度展示，放不下的标签收进右侧 `...` 下拉菜单，不再横向滚动。选择菜单项后切换视图，并让当前标签保持可见；支持方向键、Home/End 和菜单 Esc 关闭。不再提供 Code 标签。

| 视图 | 行为 |
| --- | --- |
| Fields | 双／三列表格展示真实层级及数组投影，对象默认折叠、非空数组默认展开；置信度使用值自身的分数，不继承父级。缺失过滤不隐藏 `0`、`false`、空字符串或 `null`，折叠不丢失单项或整组选择。只有原生表格而无提取字段时隐藏 Fields，不补造数据。 |
| Markdown | 渲染原始 Markdown、GFM 和经清理的 CU HTML 表格；脚本、危险 URL 等不能执行。 |
| Paragraphs | 保留返回顺序、role/页码，选择定位真实来源。 |
| Figures／Signatures | 使用已加载 source 的真实区域裁剪及返回 metadata；不补造图片或签名状态。 |
| Info | 所有 content 的 metadata、usage、infos、warnings 按固定顺序展示；只读名称／值层次表默认全部展开，可折叠，无 Copy 控件，不改变原值。 |
| Result | 完整原始输入/envelope，根展开、嵌套折叠，包括原有 usage，不显示内部标准化模型。 |

切换标签不重挂 Source，不重置页码、缩放、旋转、平移或固定项/区域索引；切换 content 是另一操作，会重算适用视图。

原文叠加层分开绘制：

- `pages[].words[]` 保留解析及原始 Result 数据，但不在默认界面绘制常驻黄色 OCR 层，也不重画原文文字。
- Tab 层按字段／单元格自身的置信度显示语义填充；容器级真实来源仅作中性回退，不把父级分数借给子值。Markdown/Info/Result 不保留其他 Tab 的来源框。
- 固定与临时预览状态独立；普通字段／单元格的预览框与固定框统一为完整实线，但不因此变成固定选择，段落等其他视图保留原预览样式。紧凑下方浮层显示值与已有 Confidence／N/A，段落只显示 Content。实际移动或明确聚焦才预览，临时预览不翻页或滚动；长值在有界内容区滚动。
- 左侧不显示表格小图标、Rows/Columns 悬停预览或独立弹窗。点击真实表格空白／边框会切到 Fields，展开并强调有可靠来源关联的现有对象、数组或字段范围；多个相关字段同时标记，不默认选第一个值。已有提取字段／单元格值的点击优先保留原定位语义。
- 关联仅依赖同页真实多边形的完整包含关系，不按表号、名称或文本猜测；来源同时落入多个重叠版面表格时不自动选择。无对应或关联不明确时显示提示，原始表格可在 Result 查看；不清除搜索／筛选，被隐藏的对应字段有数量说明。
- 真实表格区域支持 Enter／Space 定位及上下键浏览，保持源页、缩放、旋转、平移和源区焦点；拖动仍只平移。表格跨页来源导航保持缩放。普通标签往返不重放定位，仍保留 Fields 纵向及内嵌数组横向位置。

显式选择优先使用当前页上的真实来源，否则导航到可用来源页，保留缩放／旋转；仅在目标或其完整下方浮层不可见时最小调整视口。两者已完整可见时不移动，悬停空间不足只保留轮廓。键盘可操作字段、折叠、标签和控件，Source viewport 用方向键平移。Esc 按菜单／设置／详情／选择分层处理，不清除另一个嵌入实例。无效页码／文件／JSON／来源会明确提示，源文件失败不隐藏有效结果，无来源不画虚构区域。

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

消费者验证使用 npm `11.21.1`（CI 已固定）。本机 npm `10.9.9` 在 Vite 可选 peer 依赖图上触发 `edgesOut` 内部错误；不是通过忽略 peer 依赖绕过。无需修改项目依赖或全局 npm，可选用：

```powershell name="使用兼容npm验证组件消费者"
npm exec --yes --package=npm@11.21.1 -- npm run verify:consumer
```

### 构建统一 Release 资源（维护者）

需要 Node.js、Bash 4+、Info-ZIP `zip`/`unzip`、`jq`，以及 GNU coreutils/findutils（含 `sha256sum`、`sort -z`、`realpath`、`cp --parents`）。推荐 Linux CI；Windows 在已补齐这些工具的 Git Bash 中运行。不需要 Python、PowerShell 或 .NET：

```bash name="生成本地Viewer发布候选"
npm run package:release -- --viewer-version 0.1.0-preview.1
```

产物直接位于已忽略的 `dist-viewer`，只有 `viewer.zip` 和 `manifest.json`，不输出到任何语言包的资源目录。[Bash 打包脚本](scripts/package-release.sh)保留固定顺序／时间戳／文件权限、许可证、资源大小和完整性检查，并在写入前拒绝缺失 Worker、字体、解码器或懒加载面板的不完整构建。已有产物被修改或目录中存在未知文件时拒绝覆盖；缺失工具明确失败，不自动安装或回退到 Python/PowerShell。

ZIP 压缩实现切换到 Info-ZIP，容器字节/SHA-256 可能变化，但解码后的资源和 schema 2/protocol 1 契约不变。固定工具链下重复导出保持确定性，不受源文件时间、权限或时区影响；以新清单记录的摘要为准，不沿用旧 ZIP 摘要或替换已经发布的同版本资源。

schema 2 清单包含 `viewerVersion`、`protocolVersion: 1`、归档及逐文件大小/SHA-256。默认版本来自 [package.json](package.json)，也可通过上述参数指定合法 SemVer，且必须与 GitHub Release 的 `v<版本>` 标签对应。维护者审核后在同一 Release 中发布这两个文件；本命令只生成本地候选，不提交、上传或发布。

各原生宿主应按 SemVer 查找协议兼容、同时包含两份资源的非草稿 Release，验证后以原子活动记录启用缓存；损坏缓存明确报告并重新获取，失败更新保留旧活动版本。宿主运行不依赖 Node/npm/gh；Go 不依赖 Python。此处定义多语言契约，不代表本仓库实现了新的语言宿主。

宿主提供页面同目录下的 `session.json`（`source`、`name`、`result`）和指定源文件；`source` 必须属于同源、同会话路径，`result` 是同一次分析的完整 JSON。仅监听 loopback，校验 Host/Origin，按 CSP 提供已校验资源，不开放文件目录。分析后查看失败保留输出，不重新分析。`azd ai cu analyze <本地文件> --view` 首版只接受单一本地文件，不扩展批量、目录、URL 或 Python 的离线 `--result` 入口。

### 脚本与验证边界

`build:viewer` 是通用页面构建，`package:release` 是唯一 Release 打包入口；它只生成本地候选，不创建或上传 GitHub Release。原 `export:viewer` 已更名，不保留重复入口。不再构建 Python wheel/sdist，不在本仓库维护各语言 CLI 的本地服务实现和安装包测试。

| 脚本 | 保留原因 |
| --- | --- |
| [package-release.sh](scripts/package-release.sh) | `npm run package:release`：使用 Bash、Info-ZIP、jq 和 SHA-256 工具生成跨语言共用的 Release ZIP/清单，不上传发布。 |
| [verify-packed-consumers.mjs](scripts/verify-packed-consumers.mjs) | `npm run verify:consumer`：构建实际 npm tgz，在隔离的 React 18/19 宿主中安装、类型检查、构建，并验证开发/生产的 Chrome/Edge；保留 TypeScript/npm 集成门禁。 |
| [verify-rich-result-build.mjs](scripts/verify-rich-result-build.mjs) | `npm run verify:bundle` 调用：检查 npm/演示入口不超过 500,000 字节、详情懒加载分包和 HEIF 解码器摘要；性能验证也复用它。 |

图片测试样本已经固定并纳入仓库，开发期生成器已删除；回归直接读取现有样本。保留所有图片、许可、来源说明和哈希，不在构建/测试时重新生成。

HEIC 重建脚本及其 npm/定时 CI 入口已删除，不再自动重编译或复现解码器。运行与打包直接使用已审核的预编译资源；保留源码/锁文件、许可证/SBOM，以及构建哈希检查和浏览器解码回归。

打包回归为 `npm run test:release`，使用 Node.js 内置测试运行器直接验证 Bash 脚本，从打包子进程 PATH 排除 Python/PowerShell，并独立解码 ZIP 核对清单、内容、排序、时间和权限。可设置 `CU_VIEWER_TEST_EXPORT` 为真实 Release 资源目录，额外验证完整归档及清单。CI 的独立 Ubuntu Release 作业构建资源、执行回归并上传候选，不自动创建 GitHub Release。

前端行为继续由组件单测、演示 E2E 和实际 npm 消费者矩阵覆盖。Go/Python/C# 的下载、缓存、服务和安装生命周期测试归各自 CLI 仓库；已删除的独立 Python 宿主测试不再列为当前验收入口。

[视觉参考](tests/e2e/visual.spec.ts-snapshots)用于保持已批准的项目外观，不是逐像素复制 Studio。普通运行不自动更新参考；外观意图变化先评审。样本来源、许可、哈希和预期值见[样本清单](tests/fixtures/manifest.json)，计划及验证摘要见[英文开发计划](docs/dev-plan.md#verification)。

源码库不保留构建目录、测试输出、缓存或历史静态原型。测试基线、原始样本和带许可的 HEIF 预构建资源是开发/运行输入，需要保留；普通构建无需 Rust。`node_modules` 仅是已忽略的本地依赖目录，不进入分发。

<a id="supplementary-validation"></a>
### 验证边界

现有自动化覆盖键盘、焦点和 ARIA 行为；实际读屏未经验证，不宣称已通过。

## 许可证与分发

主项目为 [MIT](LICENSE)。PDF.js 和其他前端依赖的通知见 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)；当前 HEIF 为 MIT OR Apache-2.0 的 `heic-rs` WASM。[codec 来源说明](codecs/heic-rs-wasm/README.md)、[包内许可/SBOM](assets/heif)及[样本原许可](tests/fixtures/LICENSE.txt)保留在各自目录。

正常 npm 构建不需要 Rust 或 PowerShell。未来解码器更新需要单独审核源码、生成资源、许可/SBOM 和浏览器回归，不能只替换二进制或放宽预期摘要。分发时保留第三方许可和通知；包当前为私有候选，不自动公开发布。
