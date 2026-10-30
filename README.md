# CU Viewer

面向 CU 开发者、技术实施和测试人员的只读本地结果查看器，将原始 PDF/图片与保存的 Azure Content Understanding（CU）Analyze JSON 并排展示，提供 Studio 式结果查阅和来源定位。以独立 Python wheel 交付，cu-cli 是其中一个入口；同一 React/TypeScript 组件也可嵌入其他宿主。

组件只负责渲染：不调用 Analyze、不认证、不上传、不管理 analyzer 或轮询 LRO，也不依赖 CU SDK。宿主负责取得源文件和分析结果。

## 文档入口

- **本文**：启动、使用、资源交付、当前限制和验证命令。
- [需求](docs/requirements.md)：当前 cu-cli Viewer 的交付范围和已确认行为。
- [开发计划（English）](docs/dev-plan.md#ui-redesign-react-migration)：原型对齐的 React UI 迁移阶段、依赖、验收矩阵与交付门禁；同一文档保留完整架构及既有交付记录。
- [UI 改造需求与独立原型](docs/ui-redesign/requirements.md)：已确认的视觉、交互和真实源文件边界；React 已按原型迁移，当前功能／单测／视觉验证及历史消费端验收范围见开发计划，尚未正式发布本轮安装包。

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

### 查阅、来源与偏好

- 默认双列，可切换三列；置信度阈值为 `0.70`，三个高亮开关默认启用，缺失字段默认可见。统计以叶字段／数组单元格为口径，未知置信度与有效的 `0` 区分。
- 首次打开时优先展开首个非空数组，再按显示顺序适度展开首层对象，以 40 个可见行作为自动展开预算；数组表头与业务行计入预算，不递归展开大对象。该预算不限制手动或来源选择后的展开，也不会在改阈值、排序或切换标签时重新覆盖用户状态。
- 低置信度仅表示优先查阅；右侧只强调低置信度值，不染整行。原始 PDF／图片文字不重画；来源采用完整色强的 multiply 混合高亮及独立的固定／临时预览轮廓，不额外以 75% 透明度冲淡色板，也不以实色遮盖原文。不再常驻黄色 OCR 底层，原始 OCR 数据仍保留在 Result。
- 来源高亮有独立的 1 CSS px 同色圆角外沿，仅改善视觉留白；装饰层不参与交互，不扩大真实来源坐标、点击命中或浮层锚点。关闭对应源区高亮时，外沿也一并隐藏。
- Show field highlights／Show table highlights 只控制源区填充；右侧字段及内嵌数组的低置信度提示仅由 Show low confidence highlight 控制。齿轮设置保留 `0–1` 数字阈值、`0.01` 步进及三个开关，保留输入的实际阈值精度。
- Legend 独立放在顶部文件信息与设置之间：Source 面板实际宽度达到 1040px 时，横向显示 Field／Table／Low field／Low table／N/A 五项小色块；较窄时只显示 Legend 按钮。宽版和完整图例中的色块／文字均为同一套分类开关，点击、Enter 或 Space 可隐藏／恢复对应 Source 填色及同色装饰外沿；关闭时显示空心斜线色块与弱化文字。只影响左侧绘制，不过滤 Fields、不改计数、阈值、原始 Canvas、来源命中或选中／预览轮廓。
- 文档操作按已确认的 Studio 参考布局放在来源视口下方的 44px 控制栏：左侧为必要状态／来源导航，页码居中，缩放／适应／旋转靠右；顶部仍为 57px。原 34px 提示行及常驻手势说明已移除，不留空行；状态变化不增减行高，fit 按实际可用空间重算，不改变源数据或来源坐标。窄版采用紧凑计数，完整名称和来源说明保留于提示／无障碍描述。按后续明确确认移除底部 X，不新增替代按钮；清除沿用已有 Esc／原文空白处点击，保持原操作逻辑。
- PDF／图片在常规缩放期间保留当前页原文预览，新光栅离屏完成后替换，不用整块 Loading 占位覆盖。首次加载、换页／换文档及真实失败仍按实际状态提示，不显示不匹配的旧画面。
- 固定百分比缩放后，页面四边都保留在实际可滚动范围内，滚动／拖动后仍可访问完整原文；不会为消除裁切而自动切回 Fit page 或改变所选比例、页码及关联字段范围。手势锚点、来源坐标和浮层定位与实际页面位置保持一致。
- 所有支持的 Source 宽度均直接显示底部旋转按钮，不再通过 More 回退；顶部 More 和独立的 Reset layout widths 菜单入口已移除。分栏仍可拖动，双击来源／结果分隔条或字段列分隔条可分别恢复默认宽度；右侧字段及值操作菜单不受影响。
- 总开关优先：Show field highlights／Show table highlights 关闭时，对应分类禁用并说明原因，分类自身选择仍保留。Show low confidence highlight 关闭时，两项 Low 禁用；源区按原规则使用正常配色，并归入 Field／Table 的显示控制。N/A 保留用于无置信度来源，不等于真实分数 `0` 或值未返回；至少一个字段／表格总开关启用时可单独控制它。
- 完整图例采用按钮下方的有界浮层，不增加工具栏行数或改变原有 57px 高度。Legend／设置互斥；Esc 或关闭按钮返回对应入口焦点，外部点击或键盘移出不抢焦点。仅打开说明不写偏好；分类点击会按现有分析器／结构隔离规则保存五项显示偏好，旧记录未包含分类状态时默认全开，畸形记录明确提示且不静默覆盖。
- 实际鼠标移动或明确键盘聚焦才预览，预览不翻页、不滚动。点击、Enter 或定位菜单才选择并按需跳页；分组定位包含全部真实后代来源，不以第一个子字段代替整组。
- 普通字段、嵌套值和数组单元格选中后，左侧保留该字段在当前页的全部真实来源。相邻、同列的多行值可用一个无填充、无额外留白的显示外框表达；若跨栏、分散或外框会圈入其他字段，则保留多个原轮廓。检查包含已隐藏的缺失字段，不按字段名做特例，也不把不同字段或整组选中强行合框。
- 合框只改变选中装饰层；原始来源多边形、逐片段置信度底色、点击命中及定位仍独立保留，新增空白不成为可点击来源。底部的来源数量不是显示框数，`Location n of total` 继续逐真实片段定位；切换定位不会缩小选中范围，跨页仍需显式操作。
- 普通字段／数组值的鼠标与明确键盘焦点预览也使用同样的完整、1.8px 中性实线外框及安全合框规则，不再只虚线框住当前一行。预览与固定状态仍独立：悬停不替换固定项、不改定位序号、不翻页、不滚动或增加留白；离开后只清除临时框。段落、分组和其他详情预览保持既有样式。
- 浮层在当前定位点所属的连续来源块下方左对齐，默认间距 12px，短值卡片约 55px 高，多行地址不会再被自身浮层遮住。分散位置分别定位，不为显示所有选中来源而跨位置拉动视口；悬停空间不足时只描边，显式选择才最小滚动显示完整卡片。当前定位片段不在本页或来源页不可用时，不借另一片段伪造浮层或成功定位。
- 字段／数组值浮层的正文统一使用 `#1E3A2A` 深色，不再随置信度变红、变蓝或变灰；正文颜色不代表置信度。Confidence 标签、分数及 Gauge 仍按原有低／正常／未知色板显示，阈值与高亮开关照常生效；原文高亮、Fields 低置信度标签及段落 Content 样式不变。
- Ctrl／Command + 滚轮及触控板 pinch 在指针处缩放；普通滚轮保留滚动。手动缩放以 25%–300% 为常规范围，同时保留原本超出该范围的 Fit page 能力，不替代源格式与渲染容量限制。
- Fields 支持搜索、低置信度过滤、上下键浏览、Enter 定位、F2 完整值及 Shift+F10 值操作；Alt+Up/Down 或拖动仅调整同级展示顺序。两种宽度分隔条可拖动、用左右键调整或双击恢复默认。
- Fields 导航工具区只保留匹配计数和上一／下一字段，不再提供“查看当前选中值”信息图标快捷入口。完整值仍可从字段主入口／数组单元格上的 F2、值菜单或折叠摘要查看。分组的定位按钮在悬停／聚焦时出现，选中背景及全部后代来源保留，但名称旁不再显示 `n selected`；源区页脚仍保留真实字段／来源数量。组级 Confidence 留空，不伪造汇总分数。
- 折叠对象的 Value 按原有子值顺序显示真实提取值摘要，例如 AmountDue 的 `610 USD`，不硬编码业务名称、不生成 `N properties`。所有数组（含嵌套数组）只在 Value 列保留真实 `N items`，展开／折叠时都不再在名称旁重复显示 `[数量]`；完整数组入口、F2、实际业务行号及数据不变。`0`、`false`、空字符串、`null`、空对象与未返回不混淆，展开后仍展示原有完整结构。
- 长 Value 和折叠摘要按实际列宽单行省略，不撑高行、不挤压 Confidence／定位按钮，也不在数据层截字符串。点击折叠摘要或在字段上按 F2 可打开现有完整值详情；详情及复制使用完整原值（对象／数组为原值 JSON），不复制摘要或省略号。查看详情不展开分组、不重新定位 Source，关闭后返回对应字段焦点。
- 真实摘要沿用父级命中后的后代搜索／计数规则；低置信度仍按叶字段自身分数过滤。在仅看表格相关字段时，必要父级的摘要与摘要搜索只包含范围内值，不带出无关子字段；显式查看完整值仍保留原始对象。内嵌表格继续按内容紧凑分配列宽，保留横向滚动及真实嵌套金额列。
- 内嵌数组与 Fields 内容左缘对齐，不再额外缩进。横向滚动时，`#` 与序号列固定在真实裁剪边界，保持不透明背景，不会露出滚走的文字；业务行顺序、值操作和来源定位不变。
- 内嵌数组使用单层 1 CSS px 细网格：行分隔 `#E7EBF0`、更淡的列分隔 `#EEF1F5`，外沿／表头底线／固定序号右边界 `#DCE3EB`。保留原边框占位，仅单侧绘制可见内网格，避免相邻两格叠成 2px；固定序号去掉额外分隔阴影。列宽、原有行高、紫色交互底色、低置信度标签及独立键盘焦点不变，不修改 PDF 本身的表格线或浮层位置。
- Hover 与固定选中使用同一靛紫系区分层级：源区临时框 `#8C70C2`、固定框 `#5B21B6`；Fields 普通行、折叠父级及数组单元格 hover 为 `#EEE7FF`，实际选中／整组选中为 `#E5DAFF`，表格关联范围为更淡的 `#F8F5FF`。hover 采用更柔和的中紫轮廓与稍明显的浅紫底色，使左右视觉强度更接近，但不把细框和大面积底色强行设成同一色值。左右 hover 联动，不自动展开或滚动；选中优先，已选项再次被指向时不会变浅。
- 整组选中时，标题、子字段及内嵌数组正文／固定序号使用连续选中底色；切换到单值后撤掉普通整组底色，不染无关行列。源区固定层最后绘制，预览已选字段或其选中后代时复用固定框、不重复叠描，浮层／定位状态仍独立。交互轮廓使用 `geometricPrecision` 抗锯齿，保留原线宽／坐标与框距，避免小数像素硬对齐导致四边粗细不一；只作用于显示框，不改变语义填充、真实命中或原文。交互底色上的中性次要文字为 `#526276`，正文、低置信度标签及键盘焦点样式不变。
- 数组当前单元格对应的行号／列标题用更淡的 `#F8F5FF` 背景提示，不染无关行列、不叠加粗框或加粗底线；键盘导航仅显示单层细焦点线。左侧来源点击对所有 Fields 目标统一采用约 1 秒的 `#D8C6F2` 到静态背景渐淡，不闪描边；减少动态效果时仅保留静态背景，右侧选择、悬停及标签恢复不重放强调。
- 点击源表格后，Fields 临时进入 `Related fields only`，集中展示已有的关联对象／数组及其完整子结构，不新建 Document Tables 分组、不重排原始字段。关联字段块用连续浅紫底，当前具体值用稍深底色；粉色低置信度标签不变。
- 在相关字段里选值、看详情或复制时仍保留范围；搜索／筛选继续生效。`Show all` 恢复进入范围前的展开、纵向和数组横向位置，不撤销你在范围内明确修改的搜索／筛选，也不改写已保存排序。范围内暂时禁用拖拽、Alt 排序和 Reset order。
- 悬停范围外的源值不会退出范围；明确选择范围外的源字段会退出并定位该字段，清除选择或换文档也会退出。无可靠表格关联时只提示，不进入空的限定范围。`Show all` 只关闭限定范围，保留当前选择及关联提示；关闭详情时可安全回到恢复后的折叠父级。
- 非受控顺序、阈值、高亮及布局偏好按分析器、API 版本和真实字段结构隔离，保存在当前浏览器；不存提取值，不同步账号。读取损坏、不兼容或写入失败会明确提示，不静默覆盖，损坏记录需显式重置。受控排序的保存职责仍属于宿主。
- Fields、Markdown、Paragraphs、Figures、Signatures、Metadata、Result 按实际返回数据启用。独立 Tables 标签已移除；源表格直接定位现有 Fields，不增加 Document Tables 分组或原生表格副本。原始表格内容、跨度、缺口及解析问题仍保留在 Result。源视图不因切换标签而重建，字段展开、筛选与各视图滚动位置保留。

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
| Fields | 双／三列表格展示真实层级及数组投影，按前述 40 行预算初始化展开；置信度使用值自身的分数，不继承父级。缺失过滤不隐藏 `0`、`false`、空字符串或 `null`，折叠不丢失单项或整组选择。只有原生表格而无提取字段时仍提供 Fields，并解释无对应字段，不补造数据。 |
| Markdown | 渲染原始 Markdown、GFM 和经清理的 CU HTML 表格；脚本、危险 URL 等不能执行。 |
| Paragraphs | 保留返回顺序、role/页码，选择定位真实来源。 |
| Figures／Signatures | 使用已加载 source 的真实区域裁剪及返回 metadata；不补造图片或签名状态。 |
| Metadata | 保留字符串键值顺序，支持单值复制；与 Signatures 一样使用当前 Preview 映射。 |
| Result | 完整原始输入/envelope，根展开、嵌套折叠，包括原有 usage，不显示内部标准化模型。 |

切换标签不重挂 Source，不重置页码、缩放、旋转、平移或固定项/区域索引；切换 content 是另一操作，会重算适用视图。

原文叠加层分开绘制：

- `pages[].words[]` 保留解析及原始 Result 数据，但不在默认界面绘制常驻黄色 OCR 层，也不重画原文文字。
- Tab 层按字段／单元格自身的置信度显示语义填充；容器级真实来源仅作中性回退，不把父级分数借给子值。Markdown/Metadata/Result 不保留其他 Tab 的来源框。
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
