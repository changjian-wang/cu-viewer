# 需求

本文只记录“做什么”，不承担进度、实现教程或逐批测试日志。原始依据是用户提供的 **Reusable React Component for Content Understanding Field Extraction Result Viewer**；后续确认单列，不以计划或代码反推原始要求。

## 需求来源

| 类别 | 解释 |
| --- | --- |
| 原始需求 | 组件目标、仅渲染边界、P0/P1/P2，以及原文的示例性描述。 |
| 后续明确确认 | Viewer优先/CLI最后、当前桌面交付、动态Studio标签、截图交互及OCR文字层。 |
| 实现/支持策略 | 所用库、React/浏览器/Vite支持范围、容量/URL/CSP/图片处理等，见[使用说明](../README.md#implementation-limits)。 |
| 工程验证 | 几何容差、轮数、截图阈值和性能预算。它们不是原始数值要求或新增产品SLA。 |

原文明确不要求像素级复刻Studio；后续批准的项目原型回归另行维护。无障碍/键盘是需求，但原文没有指定Narrator；真实读屏未做的事实不因自动化而改变，也不作为其他开发任务的额外前置。

## 目标与组件边界

提供可复用React/TypeScript组件，展示原始PDF/图片及CU字段提取结果，用户能在结果与来源区域间关联查阅。复用场景包括cu-cli、普通React应用、CU示例/工具，P1聊天与MCP Apps/MCP UI，P2 Document Intelligence。

输入概念为 `source: File | Blob | ArrayBuffer | string` 与 `result: unknown`。接收原始序列化CU JSON对应的JavaScript对象，兼容宿主取得或保存的结果，不要求调用方预处理成Viewer专用schema或CU SDK对象。内部可推导记录，但不把内部模型当公开集成契约。

组件不调用CU服务、不依赖CU SDK/服务客户端、不需要Azure凭据，不认证、不上传、不管理analyzer、不轮询LRO。Analyze及源文件/JSON交付由宿主负责。

## P0：核心 Viewer

- 支持 `.pdf`、`.jpg`、`.jpeg`、`.jpe`、`.png`、`.bmp`、`.heif`、`.heic`；图片使用公共抽象，不能把HEIF/HEIC默默延后到P2。
- 左侧源文件、右侧通用字段展示；至少包括名称、原值、可用置信度和有用的页码/来源，不硬编码analyzer schema。
- Hover/选择字段时关联真实来源；跨页时导航到来源页/位置。缩放、平移、旋转、尺寸/页码变化后仍对齐，缺失定位不能补造。
- 提供缩放、平移、Fit page/width、旋转、上一页/下一页、跳页及当前/总页数；支持多页PDF。
- 保持源渲染、CU解析、字段展示、几何、视图变换、页导航和交互状态职责分离，不公开不必要PDF.js类型。
- 提供演示和自动化测试，质量足以嵌入cu-cli与其他React应用。

cu-cli目标流程示例为 `cu analyze sample.pdf --view`：CLI分析后将原文件及JSON交给本地浏览器Viewer；保存结果查看不产生新的CU调用。浏览器启动、源文件服务器和CLI集成代码不属于组件，本仓库目前未实现该CLI命令。

## P1：丰富结果、交互与复用

- 结构化/嵌套字段、数组/表格、多来源区域。
- 安全客户端Markdown：标题、列表、表格、代码和常规格式，无CU服务依赖。
- 成熟OSS交互JSON树：对象、数组、嵌套、展开/折叠，以及合理的大结果。
- 无障碍、键盘、触摸、响应式、自动滚动/居中。
- 合理宿主定制/可扩展性。
- MCP Apps/MCP UI及聊天宿主的集成设计/文档，不由此添加核心MCP Server/runtime。

原文扩展点使用 **“such as”** 举例，不是强制七API清单：

1. 字段选择回调。
2. 自定义字段渲染。
3. Viewer事件。
4. 工具栏定制。
5. 布局定制。
6. 初始页码。
7. 初始缩放/Fit。

这些名称用于后续范围设计；实施前确认必要宿主API，省略时保持默认行为且内部类型不外泄。原文最后的 `Result-pane` 条目截断，缺失内容保持延期，不推断renderer、registry或slot。

## 后续已确认的范围和行为

### 排期与桌面交付

- 先完成独立Viewer，再做外部cu-cli契约/实现；不让CLI阻塞直接运行。
- 当前仅桌面Chrome/Edge，Source/Result保持双栏、窄容器最小宽度与滚动，不做移动应用、捏合、上下堆叠；触摸保留为原始P1但当前延期。
- 显式定位保留zoom/rotation，仅在目标不可见时调整平移；原文已可见时不移动。
- 当前React 18/19和Vite 8是后续支持范围决定，不是原文指定工具。

### 动态 Studio 结果视图

根据原始JSON版本及选中content的适用非空值，按以下顺序生成标签，无值隐藏，未知属性仍在完整Result，不发明新Tab：

`Fields → Markdown → Paragraphs → Tables → Figures → Signatures → Metadata → Result → Code`

| 视图 | 确认的语义 |
| --- | --- |
| Paragraphs | 按CU顺序显示内容、role及页信息，可关联全部真实来源。 |
| Tables | 原生网格/表头/行列跨度、单元格来源联动；Current table切换，一次显示一张表。 |
| Figures/Signatures | 从已加载真实source区域裁剪，显示已有metadata并定位，不推断签名状态或虚构图片。 |
| Metadata | 只读字符串键值、保持顺序，支持复制单值。 |
| Result | 完整原始输入/envelope，包括usage，根展开/嵌套折叠。 |
| Code | Python/C#/JavaScript只读SDK样例及复制；版本/analyzer来自结果，endpoint/key/file为占位符，绝不执行。 |

已确认GA `2025-11-01` 与Preview `2026-06-01-preview`的守卫展示映射；不是API版本选择器，也不宣称穷举全部Preview真实服务输出。

### 来源框、浮层与黄色基础层

- 当前Tab决定当前页对应来源框：Fields继承字段颜色，Paragraphs蓝色段落框，Tables蓝色真实整表框；不同Tab的框不混画。
- 右侧字段hover显示原文附近的名称/Value/已有Confidence；段落hover只显示Content。其他来源框保留，预览不替换固定选择。
- 左表格小图标hover显示Rows/Columns并强调来源；click打开只读Table模态，X/Esc关闭并恢复焦点，不切右Tab、不改pin/源视图。
- `pages[].words[].source`独立绘制 `#FAFF7F40` 填充与1px同色描边的常驻OCR基础层，所有Tab保留，在结果/交互框下面。它与fields/置信度无关，不改变原始源像素或JSON，不新增Word Tab/API开关。
- 浮层有键盘等价信息、Esc关闭、有界位置和长值滚动；图标/模态及输入替换遵守当前焦点和资源生命周期。

### 可接受的验证依据

真实PDF/PNG配对、等像素派生JPEG/BMP和许可HEIF样本可作为代表性证据；不要求逐编码Analyze、穷举codec、agent登录Studio或硬源文件时间/峰值内存预算。负责人截图、公开代码/schema、保存JSON和实现评审可用于Studio对照，合成案例必须明确标注。

## P2：独立后续

TIFF、多页TIFF及页导航，DI JSON/字段/几何兼容均属P2，单独调研和批准，不阻塞P0/P1或最终CLI阶段。

## 参考而非应用基座

- [Content Understanding Studio](https://contentunderstanding.ai.azure.com/)是主要UX/行为参照，不复制整个应用或服务配置。
- [OCR-Form-Tools](https://github.com/microsoft/OCR-Form-Tools)用于源渲染/叠加层/导航/坐标实现参考，不继承其旧应用、服务或DI架构。
- 评估[react-pdf-highlighter](https://github.com/agentcooper/react-pdf-highlighter)、[extended](https://github.com/DanielArnould/react-pdf-highlighter-extended)及[PDF.js](https://github.com/mozilla/pdf.js)，无充分理由不自制PDF渲染器。
- [CU样例](https://github.com/Azure-Samples/azure-ai-content-understanding-python)、[文档元素/schema](https://learn.microsoft.com/azure/ai-services/content-understanding/document/elements)及[服务限制](https://aka.ms/cu-doc/limits)为数据/格式依据。

当前实现和限制只在[README](../README.md)维护，剩余工作只在[开发计划](dev-plan.md)维护；历史过程交给Git，不新增归档文档。
