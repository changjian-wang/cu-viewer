# 开发计划

更新：2026-10-15。本项目只交付供 cu-cli 使用的 Viewer；当前范围见[需求](requirements.md)，运行/嵌入说明见 [README](../README.md)。

## 当前状态

Viewer 主体及 5.1/5.2 CLI 接入已在工作区实现并完成下列本地验证，尚未提交、推送或发布。CLI 修改位于 `feat/cu-result-viewer`，不在原工作分支上。

已实现：

- 原始 CU JSON 解析、字段/多来源区域及明确错误提示。
- PDF/所需图片格式、页导航、缩放/旋转/平移及资源取消/释放。
- 条件动态结果视图、只读表格/裁剪/复制和安全 Markdown/JSON/Code。
- 来源框、字段/段落浮层、表格图标与模态、常驻黄色 OCR 层，以及键盘/焦点/按需定位。
- 独立开发演示、私有组件打包、本地资源交付和独立安装包验证。

## CLI 接入状态

沿用 CLI 任务编号：

| 任务 | 状态 | 交付与验收 | 前置 |
| --- | --- | --- | --- |
| `5.1`：确认 CLI 交接 | 完成 | 已核对实际代码，确认下述命令、数据、资源、服务生命周期与修改边界。 | 复用已实现的 Viewer。 |
| `5.2`：实施 CLI 接入 | 本地实现/安装包验证完成 | 两个入口、只读服务、静态分发和 Chrome/Edge 检查已通过；分析调用使用离线替身，没有新增真实 CU 调用。 | 5.1。 |

现有 `source` / `result` 输入可满足交接，不需要先增加组件公开 API。实现发现具体缺口时再补最小必要能力。

<a id="cli-handoff"></a>
## 5.1 CLI 交接契约

### 仓库与修改边界

- 目标为 `C:\github\content-understanding-toolkit\cu-cli`，对应 [Azure/content-understanding-toolkit](https://github.com/Azure/content-understanding-toolkit)。
- 已从核实过的 `origin/main`（`b3ff066960d6b517b6f1b4ee12201376369279a3`）创建并切到 `feat/cu-result-viewer`，仅在该新分支实施 CLI 改动，不改原工作分支或主分支。
- 已核对独立 `cu` / `cu-cli` 的[注册入口](https://github.com/Azure/content-understanding-toolkit/blob/b3ff066960d6b517b6f1b4ee12201376369279a3/cu-cli/packages/standalone/src/cu_cli/cli.py)、[分析适配器](https://github.com/Azure/content-understanding-toolkit/blob/b3ff066960d6b517b6f1b4ee12201376369279a3/cu-cli/packages/standalone/src/cu_cli/commands/analyze.py)及[输出序列化](https://github.com/Azure/content-understanding-toolkit/blob/b3ff066960d6b517b6f1b4ee12201376369279a3/cu-cli/packages/standalone/src/cu_cli/output.py)；新查看参数只在独立前端实现，成功结果在终端格式化前即可交付。
- Viewer 仓库增加薄浏览器宿主及静态构建；CLI 的独立前端负责参数、本地服务、包资源及相应测试/说明。不改共享分析引擎或其他命令前端，不把浏览器服务放进组件。

### 命令语义

| 用法 | 行为 |
| --- | --- |
| `cu analyze sample.pdf --view` | 按现有流程分析，成功后将源文件和完整结果交给 Viewer，不为查看再分析一次。 |
| `cu analyze sample.pdf --view --result sample.result.json` | 只查看已有源文件和 JSON，在加载 profile、认证或创建服务客户端之前走本地路径，零 CU 调用。 |
| 不带 `--view` | 不启动浏览器或本地服务，保持现有分析、批处理、URL、输出和退出行为。 |

首版每次查看一份本地 PDF/图片，不接受目录、批量、远程 URL 或 `--dry-run` 组合，并在分析前报错。`--result` 必须与 `--view` 同用，不能再附带分析/输出选项。文件不可读或 JSON 无效时明确报错，绝不回退到分析或覆盖输入。分析后查看保留现有 `--json`、Markdown、输出文件和报告；状态和打开 URL 写 stderr，不污染 stdout。

### 数据与资源交付

- CLI 只向会话交付选定源文件和对应完整 JSON；页面将同源 source URL 和解析后的原始对象传给现有组件。保留 inner result/envelope、未知属性、置信度和来源，不扁平化、不编造版本或服务结果。
- 分析后查看复用刚完成的结果，保存结果查看直接读取文件；两者均不要求宿主生成 Viewer 专用 schema。源文件/保存 JSON 由用户配对，不能宣称自动证明二者匹配。
- Viewer 构建产物包含页面、JS/CSS、异步 chunk、PDF Worker/字体/CMap/ICC/WASM、HEIF Worker/解码器和许可通知。CLI 将完整产物作为 Python 包资源分发，运行时不执行 npm、Node 或 Vite。
- 使用当前资源插件及相对资产布局构建，资源与数据同源，保持已验证的 MIME/CSP 要求；不把带测试样本的演示应用作为 CLI 交付物。

### 本地服务生命周期

- Python 服务只绑定 `127.0.0.1` 的动态空闲端口，静态资源和数据使用不可猜测的会话 URL；不占用演示端口，不开放任意文件路径或目录列表。
- 仅暴露选定源文件、结果和随包资源；校验 Host/Origin，不开放跨源读取，数据响应禁缓存。密钥、令牌、profile 和服务连接信息不交给浏览器。
- 监听就绪后再打开浏览器并输出可复制 URL；浏览器无法自动打开时明确提示，服务继续供手动访问。绑定/资源/文件失败明确报错，不伪装启动成功，不重新分析。
- 前台保持服务，Ctrl+C 关闭监听、句柄和临时资源；原始输入及已写分析结果保留。关闭浏览器标签页不自动退出服务。

### 5.2 验收

- 不带 `--view` 的现有测试不回归，stdout/文件/报告不变。
- 用离线替身验证分析后打开只执行原本的一次分析；已有结果路径不加载 profile、不创建 CU 客户端、不调用服务，非法组合/文件/JSON 不会触发付费调用。
- 从实际 Python 安装包打开页面，验证本地源文件和原始 JSON、懒加载 chunk、PDF/HEIF 资源及 CSP，无运行时 Node 或仓库路径依赖。
- 验证会话/路径/跨源边界、就绪后打开、打开失败的明确提示，以及 Ctrl+C 后端口和资源释放。

<a id="rendering-and-evidence"></a>
## 实现与验证依据

PDF 使用 PDF.js 私有适配器，按 CU 页尺寸与真实渲染帧共享投影；HEIF 使用 `heic-rs 0.1.4` WASM Worker。文字基础层、Tab 来源框和交互强调分层。资源/CSP/限制及第三方通知见 [README](../README.md)，样本来源、许可、哈希及历史测量见[样本清单](../tests/fixtures/manifest.json)。

<a id="verification"></a>
## 已记录的验证

下面的 Viewer 历史验证对应 `8eb04a6`，记录日期 2026-10-15；不是本次 CLI 检查重新运行的结果。

| 检查 | 已记录结果 |
| --- | --- |
| 类型检查、lint、单元 | 通过；511 个单元场景。 |
| 普通仓库浏览器 | Chrome/Edge 共 178 场景通过，含 600 轮 PDF/PNG 压力。 |
| 生产性能 | 隔离运行 4 场景通过现有阈值。 |
| 独立安装包 | React 18.3.1/19.3.0、开发/生产、Chrome/Edge、严格 CSP，共 32 场景通过。 |
| 视觉 | 60 张获批图，普通零差异回归后哈希不变。 |
| 环境 | Windows；Chrome 155.0.8059.40、Edge 155.0.4283.45、Vite 8.3.2、TypeScript 6.0.3。 |

本次 CLI 接入另验证了：

- 已构建并安装真实 `cu-cli` / `cu-cli-core` wheel；230 个页面/资源清单项与 SHA-256 完全匹配，不包含样本或 source map。
- Chrome/Edge 共 12 场景：PDF、PNG、JPEG、BMP、HEIF、按需 chunk/Worker/CSP、来源定位及端口释放。Python 服务子进程没有 Node 可执行文件。
- 已有结果路径禁止加载 profile 或创建服务客户端；分析后打开用离线替身验证只调用一次分析，终端/文件 JSON 与 Markdown 保持原行为。
- 240 个相关 Python pytest、ruff/mypy、前端类型/lint 和共享 SDK 边界检查通过；Viewer 的 511 个单元测试本轮也通过。没有真实服务或计费调用，未冒称全量云端集成测试通过。

后续按实际改动选择[验证命令](../README.md#validation)，不新增无关门槛。
