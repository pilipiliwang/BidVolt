# BidVolt 前后端联调差异与后端补齐清单

> 用途：以前端当前页面功能和 BidVolt 后端现有实现为基线，区分“前端可适配”和“必须由后端补齐/确认”的事项。本文可直接拆分为 GitHub Issue。
>
> 审计基线：BidVolt 后端 `main` 分支（审计时提交 `b70bd78`）及其在线 OpenAPI；统一前缀为 `/api/v1`。

## 1. 联调原则

1. 以后端现有请求参数、原始 JSON 响应和 FastAPI `{"detail": ...}` 错误格式为准，前端通过 adapter 转换成页面 ViewModel，不要求后端套一层统一响应 envelope。
2. 后端返回的整数 ID 在前端统一转为字符串保存和传递，避免 JavaScript 对超出安全整数范围的 `BIGINT` 丢失精度；长期方案见 P0-5。
3. 后端模式下清理运行时 Mock：不启动 MSW，不加载 demo 列表，不在真实请求失败时回退到演示数据。
4. 前端缺少 client 但后端已经存在的接口，由前端补齐 client 和 adapter；后端不存在的持久化能力，前端不得用内存状态伪装成“保存成功”。相关功能入口可以保留，但必须显示“后端暂未提供持久化接口”，且不得弹成功提示。
5. 本地开发通过 Vite `/api/v1` 代理规避跨域；该代理只解决本地联调，不代表生产部署已经解决 CORS，详见 P0-1。

## 2. 已可由前端适配的接口

下表中的能力已经存在，前端可以按后端参数完成接入。表中“注意”不代表接口必须重做；若关联到后文差异项，则以对应优先级处理。

| 业务域 | 后端路径与参数 | 前端适配方式 / 注意 |
|---|---|---|
| 登录 | `POST /auth/login`，body：`email`、`password` | 保存原始 `access_token`、`refresh_token`；`remember` 仅是前端存储策略，不传给后端。 |
| 刷新与退出 | `POST /auth/refresh`、`POST /auth/logout`，body 均含 `refresh_token`；退出还需 Bearer Token | 前端实现单次刷新与请求重放；退出成功或 refresh 已失效时均清理本地凭据。 |
| 当前用户 | `GET /auth/me` | `user_id`、`enterprise_id` 转字符串；企业名称暂不能可靠展示，见 P0-2。 |
| 项目列表 | `GET /projects?page=&size=&status_filter=` | 直接适配分页、状态筛选；前端不发送当前后端不支持的 `q`。搜索及统计差异见 P1-1。 |
| 项目增删改查 | `POST /projects`：`name`、`tender_no?`、`deadline?`、`note?`；`GET/PATCH /projects/{project_id}`；`POST /projects/{project_id}/archive`；`PUT /projects/{project_id}/status` | 页面“删除”映射为归档；状态值由前端枚举映射。`buyer` 不应塞入 `note` 冒充结构化字段，见 P1-1。 |
| 文件上传 | `POST /files/upload`，multipart：`target=enterprise|project`、`project_id?`、重复字段 `files` | 工作台材料使用 `target=project + project_id`；企业资料使用 `target=enterprise` 且不传 `project_id`，保证两个数据域不混写。 |
| 文件查询与预览基础 | `GET /files?target=&project_id=&page=&size=`；`GET /files/{id}/info`、`/parse-status`、`/blocks`、`/download` | 项目材料列表优先使用 `/files`，因为 `/files/projects/{project_id}/materials` 目前只有关联 ID 和状态，没有文件名。Office 原生协同编辑仍按成果编辑接口处理。 |
| 企业资料读取 | `GET /enterprise/categories`、`GET /enterprise/assets`、`GET /enterprise/assets/{asset_id}`、`GET .../revisions`、`GET .../facts` | 工作台“企业资料”页签读取同一企业域数据，不跳转、不复制进项目材料。列表无分页，当前可接入，小规模以外见 P1-6。 |
| 企业事实修订 | `PUT /enterprise/facts/{fact_id}`，body：`confirmed=true` 或 `fact_value`、`note?` | 前端必须保存 `fact_id`，不能用 `fact_key` 代替；成功后重新读取详情和修订记录。 |
| 企业分类修正 | `PATCH /enterprise/assets/{asset_id}/category`，body：`category_id` | 页面分类选择转换为后端整数 ID。 |
| 招标要求读取 | `GET /requirements?project_id=`、`GET /requirements/{req_id}` | 坐标、置信度和 revision 可转换后展示；用户确认/修正不能用 `upsert` 代替，见 P0-4。 |
| 项目快照 | `GET /projects/{project_id}/snapshots`、`GET /projects/{project_id}/snapshots/{snapshot_id}` | 可展示快照类型、创建时间、输入引用和规则版本。 |
| 异步任务 | `POST /projects/{project_id}/tasks`，body：`task_type`、`idempotency_key`、`payload`；`GET /projects/{id}/tasks`、`GET /tasks/{task_id}`、`POST .../interrupt` | 前端生成稳定幂等键；任务类型使用后端枚举，例如生成=`bid_generate`、评审=`bid_review`。SSE 重连与鉴权见 P1-2。 |
| 成果与版本 | `POST/GET /deliverables`；`GET /deliverables/{id}`；`GET/POST .../versions`；`GET .../versions/{version_no}`；`PUT .../content`；`POST .../restore/{version_no}` | 后端用 `deliverable_id + version_no`，前端现有 `technical-v6` 等显示 ID 需要 adapter，不直接作为后端版本参数。 |
| 在线编辑会话 | `POST/GET /deliverables/{deliverable_id}/editor-sessions`，以及 checkpoint、complete、cancel | 前端按 `deliverable_id` 创建会话；保存采用后端 `expected_version_no` 与 `idempotency_key`。 |
| 评审 | `POST /projects/{id}/evaluate`；`GET .../scores`、`.../reviews`、`.../reviews/{run_id}`、`.../scores/{score_id}/items`；建议编辑和确认接口已存在 | “编辑建议”映射到 `PUT .../items/{item_id}/suggestion`；确认/驳回映射到 confirm 接口。当前 evaluate 不接收页面选择的 Provider，见 P0-8；证据可靠性见 P0-7。 |
| 外部评审 Provider | `GET /review-providers`、`PUT /review-providers/{provider_id}/config` | 已能表达 `document`、`code`、`api` Provider；前端可显示类型、版本、启用状态。 |
| 报价测算 | `POST /quotes/calculate`、`/recalc`、`/strategies`、`/apply`；`GET /quotes`、`GET /quotes/{calc_id}` | 确定性算法链路可以接入；应用报价必须携带成果 ID、期望版本号和幂等键。金额精度见 P0-5。 |
| 报价历史 | `GET /quotes/history?material_ref=`、`GET /quotes/history/{material_ref}/samples`、`GET /quotes/history/source-metadata`、`GET .../trend` | 当前可以做物料级样本与趋势展示，不能完整支撑现有多条件历史中标表，见 P1-4。 |
| 对话、导出、检索 | 项目 conversation/messages、`POST /projects/{id}/export`、search/source/citation 等接口已存在 | 可以补前端 client；由于 OpenAPI 多处使用自由 `dict`，在契约补齐前需做防御性解析，见 P1-5。 |

## 3. 后端必须补齐或确认

### P0：修复当前联调环境 API 对外服务

**建议 Issue 标题**：`[P0][部署] 修复 28123 API 映射，恢复前端联调与健康检查`

**2026-08-14 实测**

- 前端本地代理目标按后端文档配置为 `http://47.100.182.3:28123`。
- `GET http://47.100.182.3:28123/healthz` 可以建立 TCP 连接，但服务端未返回任何 HTTP 响应（curl `Empty reply from server`）。
- 浏览器经本地 `/api/v1` 代理提交登录后得到 `502`，页面已正确停留在登录页并显示“后端请求失败”。

**建议验收标准**

- 公网或联调网络中的 `/healthz` 稳定返回 HTTP 200 与 `{ "status": "ok" }`；`/api/v1/openapi.json`、登录和受保护接口返回有效 HTTP 响应。
- 明确联调 Base URL、协议（HTTP/HTTPS）、端口映射和访问控制；同步更新前端环境配置与部署文档。
- 从浏览器完成注册/登录、token 刷新、项目列表和 multipart 上传的冒烟测试。
- 修复后使用本 Issue 附带的真实 RAR 样本继续执行上传、解包、解析验收。

### P0-0：提供招标公告网址导入与安全下载接口

**建议 Issue 标题**：`[P0][Tender Notice] 支持从公开招标公告 URL 安全导入正文与附件`

**现状**

- 前端已在“当前招标材料”保留手动上传，并增加 URL 粘贴、状态提示和轮询 client。
- 前端调用 `POST /projects/{project_id}/tender-notices/import-url`，并需要项目范围内的导入记录列表与详情；后端正式分支当前没有这组接口。
- 浏览器不能直接抓取第三方招标网站，否则会遇到 CORS、凭据泄露、无法统一审计及 SSRF/内容安全边界不一致等问题。

**建议验收标准**

- 实现 `POST /projects/{project_id}/tender-notices/import-url`、`GET .../imports`、`GET .../imports/{import_id}`；返回模型与 `docs/api/tender-notice-url-import.md` 一致。
- 只写入当前 `enterprise_id + project_id` 的项目材料，严禁写入企业资料库；列表与详情具备跨租户、跨项目 IDOR 测试。
- 每跳重定向都重新做 URL、DNS 与公网 IP 校验，连接固定到已校验 IP，拒绝本机、私网、链路本地、保留地址、云元数据地址、用户信息和非标准端口。
- 抓取、附件和归档处理具有响应大小、附件数、文件数、总解压量、压缩比、目录深度、磁盘、内存、CPU 与时间限制；校验必须在资源耗尽前生效。
- 保存来源 URL、最终 URL、标题、抓取时间、内容哈希及审计记录；稳定返回 `URL_BLOCKED`、`FETCH_TIMEOUT`、`UNSUPPORTED_CONTENT`、`ARCHIVE_LIMIT_EXCEEDED` 等可展示错误码。
- 使用真实 RAR 招标公告样本验证正文和附件均成为项目材料，刷新后仍可查询状态；失败不留下可见的半成品材料。

### P0-1：明确生产跨域或同源代理方案

**建议 Issue 标题**：`[P0][部署] 配置生产前端访问 API 的同源反向代理或 CORS 白名单`

**现状**

- FastAPI 入口没有配置 `CORSMiddleware`。
- 本地开发已通过 Vite proxy 将 `/api/v1` 转发到后端，因此本地联调不会被浏览器 CORS 拦截。
- Vite proxy 不会自动存在于生产静态部署中。

**前端影响**

如果生产页面和 API 不同源，浏览器会在预检阶段阻断登录、上传、Bearer Token 请求和部分下载操作；这不是前端 adapter 可以解决的问题。

**建议验收标准**

- 二选一并写入部署文档：
  - Web 服务器将同源 `/api/v1` 反向代理到 BidVolt；或
  - 后端配置明确的前端 Origin 白名单、允许的方法和请求头（至少 `Authorization`、`Content-Type`、上传所需头）。
- 在生产域名执行登录、刷新、multipart 上传和受保护 GET 的浏览器 E2E，均无 CORS 错误。
- 不以 `*` 代替生产 Origin 白名单；测试环境和生产环境的允许域名可独立配置。

### P0-2：`/auth/me` 返回真实企业名称

**建议 Issue 标题**：`[P0][Auth] /auth/me 返回 enterprise_name 或提供企业基本信息接口`

**现状**

`GET /auth/me` 的响应模型包含 `enterprise_name`，但实现固定返回空字符串；注册时企业名称实际已经落库。

**前端影响**

登录后页头、企业资料库和工作台只能显示“企业 #ID”之类的占位符。前端无法从 token 或其他现有公开接口可靠补齐名称。

**建议验收标准**

- `/auth/me.enterprise_name` 返回当前 `enterprise_id` 对应的真实名称，且非空。
- 跨租户测试证明只能读取当前登录企业。
- 注册后立即调用 `/auth/me`，名称与注册请求一致；后续若允许改名，刷新页面后返回新名称。

### P0-3：企业上传响应必须能关联 `asset_id`，并明确 ingest 时机

**建议 Issue 标题**：`[P0][Enterprise] 企业文件上传返回 file_id 与 asset_id 的一一映射`

**现状**

- `POST /files/upload` 使用 `target=enterprise` 时会创建企业资料，但响应每个文件只返回 `file_id`。
- `POST /enterprise/ingest` 需要 `asset_ids`。
- 前端若通过“上传前后重新拉列表并做差集”猜测新资产，在多人并发上传或同名文件场景下会误关联。

**前端影响**

上传可以完成，但前端无法可靠地只对本次上传资料发起分类/事实抽取，可能漏处理或处理其他用户刚上传的资料。

**建议验收标准**

- 每个成功文件返回至少 `{file_id, asset_id, name, status}`；失败项保留逐文件 error。
- 明确二选一：上传接口自动触发 ingest 并返回 `ingest_id/task_id`，或由前端使用返回的 `asset_ids` 调用 `/enterprise/ingest`。
- 多用户同时上传同名文件的集成测试中，每个响应只关联本请求创建的资产。
- 重复请求的幂等策略明确，不重复创建资料或抽取任务。

### P0-4：提供招标要求的用户确认和修正接口

**建议 Issue 标题**：`[P0][Requirements] 增加 Requirement 用户确认/修正与 revision CAS 接口`

**现状**

当前公开接口只有 Requirement 读取和 `/projects/{project_id}/requirements/upsert`。后者是 Agent/解析能力的写入口，没有表达“用户确认”“用户纠正”“驳回”，也没有面向页面的期望 revision 冲突检查。

**前端影响**

页面可以展示抽取结果，但确认或修改后无法可靠持久化。前端在后端模式下只能保留入口并提示“后端暂未提供持久化接口”，不能假装保存成功。

**建议验收标准**

- 提供类似 `PUT /requirements/{req_id}` 或独立 confirm/correct 路径，至少支持 `action`、修正后的结构化内容/文本、`expected_revision`、`note?`。
- 用户修正生成新 revision，保留原值、来源文件和坐标；确认状态可查询。
- revision 冲突返回 409，不静默覆盖另一用户或 Agent 的更新。
- 刷新页面后确认/修正结果仍存在，并有审计记录。

### P0-5：金额、费率和 BIGINT 的公开 JSON 表达需避免精度损失

**建议 Issue 标题**：`[P0][Quote] 金额/费率改用定点十进制字符串，并规范 BIGINT ID 输出`

**现状**

- 数据库金额列使用 `Numeric`，但 API 多处 `float(...)` 后输出 JSON number，报价引擎输入和运算也使用 Python float。
- JavaScript number 不能精确表达所有十进制金额，也不能安全表达大于 `2^53-1` 的数据库 BIGINT。

**前端影响**

金额、税率、利润率在多次计算、保存和复算之间可能出现小数误差；BIGINT 增长后可能被前端静默改值并请求到错误资源。

**建议验收标准**

- 金额和费率的 OpenAPI schema 定义为十进制字符串（例如 `"118.00"`、`"0.050000"`），或采用明确的最小货币单位整数；算法内部使用 Decimal/等价定点实现。
- 所有 BIGINT 公开 ID 统一输出字符串；请求参数接受并校验十进制字符串。
- 增加边界用例：0.1+0.2、超大金额、多税率、多次 recalc 结果可重复且与原始结果一致。
- 明确舍入模式、币种、含税口径和小数位，并在响应中返回算法版本。

### P0-6：确认报价产品规则，处理 `/quotes/ai-suggest` 冲突

**建议 Issue 标题**：`[P0][Product Decision] 报价只使用确定性算法，停用 AI 数字建议接口`

**现状**

已确认的产品要求是：报价历史数据库外部只读，报价算法由系统实现；不允许 AI 猜测报价。后端同时提供 `/quotes/ai-suggest`，在传入 `basis` 时会返回价格区间和 `recommended` 数字。

**前端影响**

如果直接接入，该入口会形成“算法测算价”和“AI 推荐价”两个产品口径，用户可能误把 AI 文案包装的数值当成可审计报价。前端当前应只接确定性 calculate/recalc/strategies/apply 链路。

**建议验收标准**

- 产品负责人确认以下方案，推荐 A：
  - A：废弃/关闭 `/quotes/ai-suggest` 的数字输出，仅保留确定性算法；AI 最多解释已有算法结果，不产生区间或推荐价。
  - B：若确需保留，必须单独审批并明确它不是正式报价，且不得默认写入/应用；所有数值必须能关联冻结样本、算法结果和证据。
- 正式报价写入仍只能经过 `/quotes/apply`，带用户确认、幂等键和 expected version。
- E2E 验证页面不会把未确认的 AI 数字写入报价成果。

### P0-7：评审 evidence 必须基于冻结快照做服务端完整校验

**建议 Issue 标题**：`[P0][Review] 校验评审 EvidenceRef 与冻结成果版本/内容哈希一致`

**现状**

- 评审运行会创建 snapshot 和 `provider_raw_hash`，方向正确。
- 当前内置评审生成的 evidence 中 `content_hash`、`source_range`、`exact_quote` 可以为 `null`；实现没有证明 evidence 引用的版本和内容已按 snapshot 做完整服务端校验。
- evaluate 接口由服务端自动取当前成果；外部 Document/Code/API Provider 的输入版本和返回证据契约在公开 OpenAPI 中也不够明确。

**前端影响**

前端虽然能展示“证据”字段，但无法保证点击定位的是本次评审实际使用的版本，也无法验证评分是否来自同一冻结输入。这会削弱投标评审的可解释性和审计价值。

**建议验收标准**

- 每次 review run 固定记录成果 version、requirement revision、规则/Provider 版本和内容 hash。
- 每个计入可解释得分的 item 都有服务端验证通过的 EvidenceRef；至少包含可解析的 source version、content hash 和定位范围/节点。无证据或 hash 不一致的项不计入可解释总分，并返回明确状态。
- 篡改 source version、hash、范围或跨项目引用时服务端拒绝写入。
- 通过 run detail 能恢复 provider、snapshot、score、items 和证据；同一输入可复核 `provider_raw_hash`。

### P0-8：评审启动接口必须消费用户选择的外部 Provider

**建议 Issue 标题**：`[P0][Review] evaluate 接收 provider_id 并冻结 Provider 配置与输入快照`

**现状**

- 页面会列出 Document、Code、API 等评审 Provider，并允许用户选择后运行。
- 当前 `POST /projects/{project_id}/evaluate` 没有 request body，前端即使发送 `provider_id` 也会被 FastAPI 忽略；服务端实际自行选择 Provider。
- ReviewRun 详情虽可返回 Provider，但这只能说明实际结果，不能保证它与用户点击的选项一致。

**前端影响**

用户选择 A Provider 后可能实际运行 B Provider，属于关键业务操作语义不一致。前端无法通过参数适配修复，也不能把按钮选择当作已生效。

**建议验收标准**

- evaluate 使用明确 request schema，至少接收 `provider_id`、`project_snapshot_id`、成果版本集合和请求幂等键；全部做企业/项目归属校验。
- Provider 必须处于 enabled/可执行状态；API/Code Provider 所需配置和凭据仅由服务端解析，不回传浏览器。
- ReviewRun 冻结并返回实际使用的 Provider ID、版本、配置 hash、项目快照和成果版本；页面刷新后可复核。
- 集成测试证明选择不同 Provider 会调用对应实现，非法、跨租户或已禁用 Provider 失败关闭，不静默回退。

## 4. P1：影响完整体验、可靠性或长期维护

### P1-1：项目列表缺少页面所需字段、搜索和统计

**建议 Issue 标题**：`[P1][Projects] 补齐 buyer、列表搜索及项目统计摘要`

**现状**

项目响应只有 `name`、`tender_no`、`deadline`、`status`、`note`、`updated_at`。列表仅支持 `page`、`size`、`status_filter`，没有 `q`；也没有前端列表需要的 `buyer`、材料数、风险数、评分、进度/阶段统计和顶部汇总。

**前端影响**

前端可以显示项目基本信息，但只能隐藏或显示“暂无数据”的统计字段。只在当前一页做客户端搜索会造成跨页漏结果，因此不能作为正式搜索。

**建议验收标准**

- 项目模型或关联结构提供可查询的 `buyer`，新建/修改/详情均返回；不要要求前端把它编码进 `note`。
- `GET /projects` 支持 `q`（至少项目名、招标编号、招标人）和稳定排序。
- 明确提供列表项 summary 或独立 summary 接口，返回材料数、未解决风险数、当前评分、进度所依据的可解释状态。
- 分页搜索返回准确 `total`，空值语义在 OpenAPI 中明确。

### P1-2：SSE 鉴权与断线续传契约不完整

**建议 Issue 标题**：`[P1][Tasks] 完善 SSE 浏览器鉴权、事件 ID、心跳和 Last-Event-ID 续传`

**现状**

- `/tasks/{task_id}/stream` 需要 Bearer Token；浏览器原生 `EventSource` 不能自定义 `Authorization` 请求头。
- 服务器会在连接时先发 snapshot，这可以恢复当前状态；但事件没有 `id:`，服务端不处理 `Last-Event-ID`，因此不能证明中间事件不丢失。

**前端影响**

前端只能使用 fetch 流式解析或轮询，无法直接获得 EventSource 的自动重连能力；弱网重连时可以得到最终状态，但可能丢失中间进度/提示事件。

**建议验收标准**

- 明确一种浏览器可用鉴权方式：推荐短期、单任务、只读 stream token 或同源 HttpOnly 会话；若坚持 fetch stream，给出官方客户端示例和 token 刷新策略。
- 每个事件包含单调递增 `id`，服务端接受 `Last-Event-ID` 并从可保留的事件点续传；无法续传时明确返回 snapshot/reset 事件。
- 增加心跳、终态关闭、代理禁止缓冲配置和断线重连测试。
- 401 时前端能终止流、只执行一次刷新/重连，不产生多个并发流。

### P1-3：写接口的幂等与并发控制需要统一

**建议 Issue 标题**：`[P1][Concurrency] 为关键写操作统一 Idempotency-Key 与 expected revision/version`

**现状**

任务提交已有 `idempotency_key` 唯一约束，成果写入部分路径已有 `expected_version_no`；但项目创建、文件上传、企业 ingest/fact 修订、评审建议覆盖等关键写入口没有统一的请求幂等和 CAS 契约。批量评审确认的设计描述包含 idempotency，但当前实现没有消费该字段。

**前端影响**

移动网络重试、双击或多标签并发可能造成重复项目/文件/任务，或用户和 Agent 的修改相互覆盖。前端按钮防抖只能降低概率，不能替代服务端约束。

**建议验收标准**

- 列出所有有副作用接口并标注：幂等、CAS、天然幂等或明确不支持重试。
- 项目创建、上传批次、ingest、成果保存/应用、评审确认至少支持请求级幂等键；重复请求返回原资源和当前状态。
- 用户可编辑资源携带 `expected_revision/version`，冲突统一返回 409 和当前版本信息。
- 增加并发、超时重试、重复提交测试；无重复副作用、无静默覆盖。

### P1-4：报价历史字段和查询能力不足以支撑现有页面

**建议 Issue 标题**：`[P1][Quote History] 扩展只读历史中标查询字段、过滤和分页`

**现状**

当前样本主要包含 `material_ref/name`、`spec`、`region`、`win_price/date`、`unit`、`currency`、`tax_included`；查询只接受 `material_ref`，返回没有分页。现有页面还需要项目名、招标人、标包、数量、中标供应商、税率、数据来源、参数差异和相似度，并支持招标人、地区、年份等筛选。

**前端影响**

前端只能做简化的物料样本页，无法按当前 UI 完整呈现和筛选历史中标记录。用空字符串伪造字段会误导报价分析。

**建议验收标准**

- 与真实外部只读 Provider 确认可提供字段，无法提供的字段明确为 nullable，并由产品确认页面降级方案。
- 查询至少支持 material name/code/spec、tenderer、region、year、page、size 和稳定排序，返回 `items/total/page/size`。
- 每条样本包含 source/provider 标识、抓取时间和不可变 source hash；单向读取，不向外部数据库回写。
- 趋势/统计明确币种、单位、含税口径；不可比较样本应排除并返回排除原因。

### P1-5：OpenAPI 中自由 `dict` 过多，无法生成稳定前端类型

**建议 Issue 标题**：`[P1][OpenAPI] 用明确 Pydantic Schema 替换核心接口的 dict 请求/响应`

**现状**

审计时在线 OpenAPI 共约 110 个操作，其中 33 个 JSON request body 是无字段约束的 object，78 个 JSON response 是无字段约束的 object，另有 12 个数组响应的 item 无字段 schema。涉及任务、成果、编辑会话、报价、评审、导出、检索等核心链路。

**前端影响**

前端无法从 OpenAPI 生成可信类型，只能复制后端实现细节并做运行时猜测；后端字段改动不会在编译或契约测试阶段暴露，容易在生产页面中变成空白或运行时错误。

**建议验收标准**

- 核心接口的请求、成功响应和错误详情均使用命名 Pydantic 模型；分页采用带具体 item 类型的泛型/专用模型。
- 字段的必填/可空、枚举、格式、范围和示例在 OpenAPI 中可见。
- CI 导出 OpenAPI，并由前端执行类型生成/契约 diff；破坏性变更必须失败或显式升级版本。
- 第一批至少覆盖 auth、projects、files/upload、enterprise、tasks/SSE payload、requirements、deliverables/editor、review、quotes。

### P1-6：企业资料列表需要服务端分页、筛选和确定排序

**建议 Issue 标题**：`[P1][Enterprise] 企业资料列表增加分页、分类筛选、状态筛选与排序`

**现状**

`GET /enterprise/assets` 返回当前企业全部资产数组，不支持 page/size、分类、状态、关键词或排序。

**前端影响**

初期少量资料可以接入；资料积累后，首次进入工作台会下载并渲染全部资产，详情补取还会产生 N+1 请求。

**建议验收标准**

- 支持 `page`、`size`、`q`、`category_id`、`status`、稳定排序并返回 `total`。
- 列表 item 返回页面首屏必需摘要；事实和 revisions 保持按需详情读取。
- 1 万条企业资料基准下，列表请求和数据库查询有明确性能指标及索引验证。

### P1-7：项目材料需要持久化的文档角色，区分招标材料与已完成标书

**建议 Issue 标题**：`[P1][Files] 为项目材料增加 document_role 与任务输入选择契约`

**现状**

同一 `/files/upload?target=project` 同时承载“本次招标公告/招标文件”和“已完成标书”两种业务输入，但上传请求和文件响应均没有 `document_role`。前端若只根据本次选择或文件名判断，刷新后会丢失角色，也无法可靠决定启动“生成”还是“校核”。

**建议验收标准**

- 上传或项目材料关联提供枚举字段，例如 `tender_notice`、`tender_document`、`completed_bid`、`supporting_material`；服务端保存并在列表/详情返回。
- 任务创建显式接收并校验输入文件/材料 ID 与 mode，不能依赖浏览器内存或文件名推断。
- 刷新、跨设备和多人协作后角色保持一致；角色修订有审计与并发控制。
- 前端在接口补齐前保留两种上传入口，并要求用户明确选择操作模式，但不宣称该角色已被后端永久保存。

### P1-8：评审结果和项目快照返回服务端可复核的 stale/current 状态

**建议 Issue 标题**：`[P1][Review] 返回 ReviewRun 相对当前项目输入的 is_stale 与变更原因`

**现状**

补充项目材料、修订 Requirement、企业资料或成果版本后，旧评审结果可能失效。当前 stale 提示只能由单个浏览器在本地操作后临时标记；刷新或其他用户修改后无法恢复。

**建议验收标准**

- ReviewRun/score 返回 `is_stale`、基准 snapshot/version 和导致过期的资源类型/新版本引用。
- stale 由服务端根据冻结输入与当前有效输入计算；前端不得自行猜测。
- stale 结果仍可只读审计，但不能默认作为当前有效评分；重新评审产生新的 run，不覆盖历史。

### P1-9：在线编辑会话支持指定基线版本或明确只读历史版本

**建议 Issue 标题**：`[P1][Editor] 明确历史版本编辑、会话恢复与版本化下载契约`

**现状**

- 创建 editor session 永远绑定成果 `current_version_no`，没有 `base_version_no` 入参。
- 页面 URL 可以深链到历史版本；若为历史版本创建会话，会出现“页面展示旧版、保存基于最新版”的错位风险。
- 会话列表/详情不返回 lease token，因此浏览器刷新后无法安全恢复写会话；下载也必须显式使用路由中的 version，而不是 current version。

**建议验收标准**

- 明确产品策略：历史版本只读，或创建会话时要求 `base_version_no` 并以 CAS 拒绝过期基线；不得静默切换到 current。
- 下载接口始终按请求的 version 返回，并在响应头给出成果/版本信息。
- 若支持刷新恢复编辑，提供一次性安全恢复/续租机制；否则明确取消旧会话与重新开始流程。
- complete/checkpoint/cancel 使用严格 schema、幂等键和 expected version；complete 成功后即使随后刷新失败，也能凭返回的 version 查询结果。

### P1-10：历史报价必须接入真实外部只读 Provider，移除生产合成样本

**建议 Issue 标题**：`[P1][Quote History] 用真实外部只读数据源替换 MockHistoryPriceProvider`

**现状**

当前后端在生产 API 路径直接实例化 `MockHistoryPriceProvider`，固定生成 8 条华东电缆样本，并以 `mock_history` 写入本地快照。页面若直接展示会把合成数据误认为真实历史中标数据。

**建议验收标准**

- 生产配置接入已确认的外部只读数据库/服务，禁止对外部库执行写操作；Mock 仅在测试环境显式启用。
- 每次查询返回真实 Provider ID、只读声明、数据覆盖范围、更新时间、source hash 和查询快照 ID。
- 数据不足返回可判定的 `insufficient_data`，不回退合成样本或 LLM 猜价。
- 增加环境隔离测试：生产启动检测到 Mock Provider 时失败关闭或明确禁用报价功能。

### P1-11：项目文件需持久化上传用途，支持补充资料分组

**建议 Issue 标题**：`[P1][Files] 持久化项目文件 upload purpose 并在材料列表返回`

**现状**

页面底部项目助手的“添加文件”属于本项目补充资料，但现有项目上传和文件列表均没有可持久化的用途字段。前端目前只能在当前登录会话中记录成功上传返回的真实 `file_id`；刷新、换设备或多人协作后无法恢复分组，页面不会假装该分类已经写入后端。

**建议验收标准**

- 项目文件上传或关联接口接受明确枚举字段，例如 `tender_material`、`completed_bid`、`assistant_supplement`；服务端持久化，不根据文件名猜测。
- `GET /files?target=project&project_id={project_id}` 的每个文件返回相同用途字段；压缩包解出的子文件继承父文件用途。
- 用途字段受企业与项目权限约束，并给既有数据定义可空或迁移默认策略；刷新、跨设备和多人协作后分组一致。
- 后端字段可用后，前端删除当前会话内的 `file_id` 临时分组状态，完全以列表返回值展示。

### P1-12：材料看板缺少已上传标书与待校核内容的只读汇总

**建议 Issue 标题**：`[P1][Materials] 提供已上传标书数量与最新校核待办的只读汇总接口`

**现状**

- `/files/upload` 和 `GET /files` 没有持久化 `document_role/purpose`，无法在刷新后区分招标材料、补充材料与“已制作完成的标书”；因此前端不能可靠统计已上传标书数量。此问题与 P1-7 的文档角色契约直接相关。
- 校核能力只有 `POST /projects/{project_id}/check` 和 `GET /projects/{project_id}/check/{check_id}`。没有项目范围的 list/latest/summary 读取接口，页面既不知道 `check_id`，也不能为了展示一个数量而调用会创建校核的 POST。
- 前端材料页在接口补齐前对这两项固定显示“— / 接口待提供”，不根据文件名、当前浏览器上传内存、任务文案或成果数量猜测。

**建议验收标准**

- 文件上传、列表和详情返回持久化的文档角色，并支持按 `project_id + document_role=completed_bid` 查询或返回可信 `completed_bid_count`；跨设备、刷新和多人协作后的计数一致。
- 提供无副作用的项目校核读取能力，例如 `GET /projects/{project_id}/check/latest` 或 list/summary，返回最近校核 ID、输入快照/成果版本、状态以及语义明确的 `pending_item_count`。
- 明确定义“待校核内容”的计数口径、终态、过期规则和与冻结输入的关系；旧校核结果不得被当作当前项目的有效待办。
- 两个读取能力均做企业和项目归属校验并写入 OpenAPI；空数据返回明确的 0/none 语义，不能要求前端通过调用写接口生成读模型。
- 集成测试覆盖：无标书为 0、不同文档角色不混计、已有/无校核结果、校核结果过期、跨租户拒绝，以及读取请求没有创建任务或校核记录的副作用。

## 5. P2：安全加固与契约一致性

### P2-1：递增整数 ID 的可枚举性需要持续做 IDOR 防护

**建议 Issue 标题**：`[P2][Security] 建立所有对象路径的跨租户 IDOR 回归测试并评估公开 ID`

**现状**

多数资源使用递增 BIGINT ID。递增 ID 本身不等于漏洞，当前多处查询也已经带 `enterprise_id/project_id` 条件；风险在于任一新接口漏掉租户/项目约束时，ID 很容易被枚举验证。

**前端影响**

前端不能把“ID 难猜”当授权机制，也不能自行验证资源归属。所有权限判断必须由后端执行。

**建议验收标准**

- 对 file、asset/fact、project/material/snapshot、task、deliverable/version/session、review、quote、export、conversation 等所有 ID 路径做跨租户自动化测试。
- 访问其他租户资源统一返回不泄露存在性的 404（或已确认的统一策略），列表和下载同样覆盖。
- 评估对外链接、日志和 URL 是否改用 UUID/opaque public ID；即使改用 opaque ID，也继续保留服务端归属校验。

### P2-2：统一错误码和可展示错误详情

**建议 Issue 标题**：`[P2][API] 在 FastAPI detail 基础上增加稳定 machine-readable error code`

**现状**

当前错误主要是 `{"detail": "中文文本"}`，前端可以显示，但无法稳定区分 token 失效、版本冲突、配额、文件类型、业务状态等场景。

**前端影响**

前端只能依赖 HTTP status 和文本，难以实现精确的自动刷新、冲突恢复和表单字段提示。

**建议验收标准**

- 保留可读 `detail/message`，并增加稳定 `code`、可选 `field_errors`、`request_id`。
- 401、403、404、409、413/422、429 的主要业务场景有明确 code 列表和 OpenAPI 示例。
- 前端不需要解析中文错误文本来决定业务分支。

## 6. 建议提 Issue 的顺序

1. P0-1 生产代理/CORS、P0-2 企业名称：先打通登录后的基本运行环境。
2. P0-3 上传到资产关联、P0-4 Requirement 修订：保证企业资料和本次项目材料两条数据链路不混写且能持久化。
3. P0-5 金额/ID 精度、P0-6 报价产品规则：在报价页面正式接入前冻结契约。
4. P0-7 evidence 与 P0-8 Provider 选择：在外部 Document/Code/API Provider 联调前完成。
5. P1 项目摘要、SSE、幂等、真实历史报价、文档角色、材料看板只读汇总、stale 状态、编辑版本、OpenAPI Schema、企业分页按页面联调节奏补齐。
6. P2 作为安全与平台一致性专项，但 IDOR 回归应尽早进入 CI。

## 7. 前端临时行为（后端补齐前）

- 可以真实接入：登录/刷新/退出、项目基本 CRUD、双域上传、文件查询、企业资料读取、事实修订、要求读取、快照、任务、成果、编辑会话、评审基本操作、确定性报价。
- 明确降级：企业名称显示企业 ID 占位；项目 buyer/统计显示“暂无后端数据”；生产页面不把 `mock_history` 合成样本当作真实历史中标数据。
- 材料页“已上传标书数量”和“待校核内容数量”显示“— / 接口待提供”；不按文件名猜用途，也不为读取看板调用 `POST /check`。
- 明确禁用持久化假象：Requirement 用户确认/修正保留入口但提示缺接口；企业上传若拿不到 `asset_id`，只刷新资产列表，不用差集猜测后自动 ingest；AI 数字报价入口不接入。
- 真实接口失败时显示错误和重试，不回退 Mock，不把页面内存修改标记为后端保存成功。
