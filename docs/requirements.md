# 需求

本文定义当前 cu-cli Viewer 的交付范围，以用户最新明确确认的需求为准。使用说明见 [README](../README.md)，进度见[开发计划](dev-plan.md)。

## 目标与职责

提供 React/TypeScript 组件，让 cu-cli 在浏览器中并排展示原始 PDF/图片和 CU 分析结果，并在结果与真实来源间关联定位。

- 已确认下一版优先服务 CU 开发者、技术实施及技术测试人员，保持只读，不加入字段纠错、人工审核状态或修改保存。
- 先完成保持行为和公开接口兼容的结构重构，再推进正式交付和效率功能；本轮不迁入 toolkit、不发布版本，也不新增批量浏览、搜索或对比。
- Viewer 只负责渲染，不调用 Analyze、不依赖 CU SDK，不认证、不上传、不管理 analyzer、不轮询 LRO。
- CLI 负责取得源文件和原始结果，并调用独立 Viewer 包；Viewer 项目提供预构建页面、只读本地服务、浏览器启动及生命周期，不反向依赖 cu-cli。
- 原始需求已约定 `cu analyze sample.pdf --view`：分析完成后将源文件及原始结果交给浏览器 Viewer。不带 `--view` 时不自动打开 Viewer。
- 后续已确认 `cu analyze sample.pdf --view --result sample.result.json`：只读取已有源文件和 JSON，跳过分析、登录和服务调用。无效或缺失的结果必须报错，不得回退到重新分析。
- 已确认首版每次查看一份本地 PDF/图片；现有批量和 URL 分析保持原样，不新增这些输入与 `--view` 的组合。
- 保持组件与 CLI 职责分离，Viewer 可以独立开发、运行演示和测试。
- Viewer 独立发行和更新，cu-cli 通过兼容依赖自动安装它，不内嵌资源副本。普通用户不需要开发环境；缺失/损坏安装通过原安装渠道修复，不在 `--view` 时自动下载。

## 组件输入

| 输入 | 要求 |
| --- | --- |
| `source` | `File \| Blob \| ArrayBuffer \| string`，提供原始源文件或浏览器可访问的 URL。 |
| `result` | `unknown`，传入已解析的原始 CU JSON 对象；支持 Succeeded envelope 或 inner result，不要求调用方标准化或构造 SDK 模型。 |

不修改调用方输入，不把内部 CU/PDF.js 类型作为集成契约。只有 CLI 实际接入确认存在缺口时才补必要接口，不预先开发通用定制 API。

## 源文件与导航

- 支持 `.pdf`、`.jpg`、`.jpeg`、`.jpe`、`.png`、`.bmp`、`.heif`、`.heic`，图片使用公共适配层。
- 提供缩放、平移、Fit page/width、旋转、上一页/下一页、跳页及当前/总页数；支持多页 PDF。
- Hover/选择结果关联真实来源；跨页时导航到来源页。缩放、旋转、平移及视口变化后仍对齐，无来源时不补造区域。
- 显式定位保持 zoom/rotation，仅在目标位于可见视口外时调整平移，已可见目标不移动。
- Source/Result 保持双栏、最小宽度及独立滚动，支持 Chrome/Edge 中的键盘、可见焦点和 ARIA 信息。
- 无效文件、JSON、页码和来源明确提示；源文件失败不隐藏有效结果，替换/取消/卸载释放自有资源。

## 结果视图

从原始 JSON 识别 GA `2025-11-01` 与 Preview `2026-06-01-preview` 的适用非空数据，按以下顺序生成标签，无值隐藏，未知属性保留在完整 Result：

`Fields → Markdown → Paragraphs → Tables → Figures → Signatures → Metadata → Result`

Tab 栏按可用宽度自动收纳，超出部分通过右侧 `...` 下拉菜单选择，不使用横向滚动。选中的视图标签始终可见，保留方向键及 Home/End 切换；菜单支持上下键、Home/End、Enter/Space 和 Esc。移除 Code 标签。

| 视图 | 要求 |
| --- | --- |
| Fields | 显示名称、原值、已有置信度及来源；支持嵌套对象/数组、多来源区域、折叠和固定选择，区分缺失与 `0`、`false`、空字符串、`null`。 |
| Markdown | 安全展示标题、列表、表格、代码等常规格式；危险 HTML/URL 不能执行。 |
| Paragraphs | 保留 CU 顺序、role/页信息，关联全部真实来源。 |
| Tables | 原生网格保留表头/行列跨度及单元格来源；Current table 一次显示一张表。 |
| Figures/Signatures | 从已加载 source 的真实区域裁剪，显示已有 metadata 并定位，不推断签名状态或虚构图片。 |
| Metadata | 只读字符串键值、保留顺序，支持单值复制。 |
| Result | 成熟交互 JSON 树支持合理规模的大结果，展示完整原始输入/envelope，包括 usage；根展开、嵌套折叠。 |

切换标签不重挂 Source，不重置页码、缩放、旋转、平移或固定项/区域索引；切换 content 时重算适用视图。

## 已确认的来源交互

- 当前 Tab 决定来源框：Fields 继承根字段颜色，Paragraphs 为蓝色段落框，Tables 为蓝色真实整表框；不同 Tab 的框不混画。
- 右侧字段 hover 显示原文附近的名称/Value/已有 Confidence，段落只显示 Content。其他来源框保留，预览不替换固定选择。
- 左表格图标 hover 显示 Rows/Columns 并强调来源；click 打开只读 Table 模态，X/Esc 关闭并恢复焦点，不切右侧 Tab、不改固定选择或源视图。
- `pages[].words[].source` 绘制 `#FAFF7F40` 填充与 1px 同色描边的常驻 OCR 基础层，所有 Tab 保留，在来源框之下，与 fields/置信度无关，不改变原图或 JSON。
- 浮层提供键盘等价信息、Esc 关闭、有界位置和长值滚动。

交互以已确认的 Studio 截图和行为为参照，不要求整站像素级复刻。

## 交付与验证

- 提供演示、可安装的组件产物及使用说明，验证实际安装后的类型、样式、Worker、解码资源和 CSP。
- 使用真实配对样本、等像素派生编码和许可样本；合成数据明确标注，不当作真实服务输出。
- 沿用现有自动化回归，不把工程测试数值另设为产品需求。

实际容量、URL/CSP 策略和支持版本见 [README](../README.md#implementation-limits)，不在本文件重复维护。
