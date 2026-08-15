# AI电网投标助手 Web API Contract v0.2

本目录保留前端需求基线与历史契约评审稿。生产联调以后端运行时 `/openapi.json` 与
`src/shared/backend-api` 的真实 client/DTO 适配为准；历史 `openapi.yaml` 不再启动运行时 Mock。

现有网页页面、用户动作、接口状态和最小字段需求见
[`FRONTEND_API_REQUIREMENTS.md`](./FRONTEND_API_REQUIREMENTS.md)。该文档是前端需求清单，
用于接口评审，不代表其中标记为“待新增”或“待扩展”的接口已经上线。

登录会话、Office 在线编辑、新建项目和双域文件入口的联调边界见
[`FRONTEND_INTEGRATION.md`](./FRONTEND_INTEGRATION.md)。该文档中的待实现接口在进入
`openapi.yaml` 前仅作为前后端评审草案。

网页编辑器本轮 P0 工具、生产级原生 Office 能力和后续 P1 范围见
[`ONLINE_EDITOR_CAPABILITIES.md`](../product/ONLINE_EDITOR_CAPABILITIES.md)。

## 不可突破的边界

1. **不存在通用 `target` 上传。** 企业资料只能通过
   `POST /api/v1/enterprise-assets/uploads` 上传；当前招标材料只能通过
   `POST /api/v1/projects/{project_id}/materials/uploads` 上传。任一接口收到 `target`、另一个域的
   ID 或“同时存入企业库”参数都必须拒绝。企业资料库页面和项目工作台“企业资料”页签可以调用同一个
   企业资料上传接口；入口位置不会改变资料所属域。
2. **不存在 AI 报价接口。** 不提供 `/quotes/ai-suggest`。报价数字仅来自后端确定性
   QuoteEngine；`insufficient_data` 响应不得包含建议价、价格区间或推荐价。
3. **历史报价只读。** 前端只允许 `GET /quotes/history` 和
   `GET /quotes/history/{sample_id}`，不提供历史报价 POST/PUT/PATCH/DELETE。
4. **评审是 Provider。** 前端通过 `ReviewProvider` 和 `ReviewRun` 与 API、沙箱代码、规则引擎或
   文档规则交互，不直接执行第三方代码，也不把 Provider 结果直接写入成果。
5. **浏览器只能接收公开任务事件。** SSE 必须通过 `PublicTaskEvent` 白名单校验，不得包含思维链、
   工具参数、内部凭据、错误栈、企业资料原文或模型原始响应。
6. **异步任务读取冻结快照。** 生成、评审、终检和导出都必须记录
   `project_snapshot_id`；成果写入必须携带 `expected_version_id` 和幂等键。
7. **编辑回调凭据永不进入浏览器。** 浏览器只能取得短时 `editor_url` 或白名单化的
   `editor_config`；`callback_token`、对象存储密钥、内部回调地址和可复用服务凭据不得出现在公开响应、URL、
   前端日志或埋点中。保存回调只允许文档服务调用业务后端内部地址。
8. **AI 不能直接改写成果。** 当前“AI针对性修改”只把上下文填入页面底部项目助手输入框：Word 已有选区时
   直接填入；无选区时进入预览选取模式，用户拖选并松开后填入，`Esc` 可取消；报价表使用当前单元格/整行。
   该动作不自动提交、不联网、不直接修改成果。项目助手接口未接入时发送按钮必须禁用。生产 AI 必须经过
   “生成建议、差异预览、用户确认应用”，并审计生成、应用、拒绝和撤销；未经确认不得修改工作副本或生成版本。

## 通用约定

- API 前缀：`/api/v1`
- 成功响应：`{ "code": "OK", "message": "", "data": ..., "meta": { "request_id": "..." } }`
- 业务 ID 使用字符串，避免数据库 `BIGINT` 在 JavaScript 中丢失精度。
- 金额、单价、比例使用十进制定点字符串，不使用 JavaScript 浮点数传输。
- 时间使用带时区的 ISO 8601 字符串。`deadline_at` 必须带 `Z` 或显式 UTC offset；无时区本地时间和仅日期
  均为无效请求。
- 前端不传 `enterprise_id`；租户只能由后端认证上下文确定。
- POST/PUT/PATCH 等可重试写请求使用 `Idempotency-Key`。
- 每个 OpenAPI 操作使用稳定且唯一的 `operationId`；请求封装、Contract 测试和查询键不得另造名称。
- 跨租户对象统一返回 404，避免泄露对象是否存在。

写接口并发约束：

| 操作 | 幂等键 | 并发/快照约束 |
|---|---|---|
| 企业资料上传 | 必须 | 上传入口固定为企业域 |
| 企业资料分类纠正 | 必须 | `expected_revision_id` |
| 项目材料上传 | 必须 | 路径固定 `project_id`，形成项目事件与新 revision |
| 发起外部评审 | 必须 | `project_snapshot_id` + 固定成果版本 |
| 报价测算 | 必须 | `project_snapshot_id` + 历史查询快照 |
| 应用报价策略 | 必须 | `expected_version_id` + `confirmed=true` |
| 创建/完成编辑会话 | 必须 | `expected_version_id`；完成后生成不可变新版本 |
| 应用 AI 修改建议 | 必须 | `expected_version_id` + 文档修订号 + `confirmed=true` |

企业资料事实纠正与 Requirement 确认/更新都是服务端写操作，必须形成新 revision；前端不得只在本地覆盖
Agent 抽取结果。项目快照通过 `/projects/{project_id}/snapshots` 查询，快照 ID 必须与路径中的项目完全匹配。

## 鉴权、企业域缓存与 UI 边界

- `/login` 是公开路由；受保护路由初始化时通过 `GET /auth/session` 恢复会话。工作台左下角账户菜单通过
  `POST /auth/logout` 退出。
- 除 `POST /auth/login` 的凭据错误外，受保护接口的 401 会使当前会话和全部企业作用域缓存失效、断开 SSE，
  并跳转登录页。只允许保留站内相对路径作为登录后回跳地址。
- 企业资料库和项目工作台企业资料页签共享同一企业域查询。任一入口上传后同时刷新企业资料列表、facets、详情
  和 ingestion 队列，不刷新项目材料查询，也不能生成项目 material ID。
- 工作台网格同宽、全局字号、响应式断点、浏览器缩放适配及日期控件弹层均为前端行为，不新增后端接口。

所有对象详情接口都要验证完整所属关系。未知 ID、其他企业的 ID、其他项目的 material/revision/snapshot，
以及不属于当前上下文的 review run 或 quote calculation 一律返回 `404 RESOURCE_NOT_FOUND`，不得返回默认对象、
空壳对象或泄露资源是否存在。

## 公开句柄与服务端安全边界

- `task_id`、`project_id` 以及 `PublicTaskEvent.result_refs` 中的各类 ID 都是面向网页端的**不透明公开句柄**，
  不是内部数据库主键、表名编码、租户编码或可推导的序列号。前端只能原样保存和回传，不得解析、递增、拼接、
  猜测或据此推断企业、项目及内部服务拓扑。
- `result_refs` 只能包含公开事件 Schema 白名单中声明的资源句柄，例如成果、Requirement revision、评审运行、
  报价测算、终检或导出任务句柄；不得放入数据库 ID、对象存储 key、Agent Profile/Session、工具调用 ID、凭据或
  模型内部标识。
- 句柄不构成授权。服务端必须对每次 REST/SSE 请求重新执行身份认证、权限检查、企业归属、项目归属和完整资源关系
  校验，包括 `project → material → revision`、`project → snapshot`、`project → task/review run` 以及报价测算归属。
  不得依赖前端隐藏按钮、路由守卫、Mock 数据或句柄不可猜测性作为安全边界。
- 外部 ReviewProvider 返回的每条 `evidence_ref` 必须在服务端与本次冻结快照白名单逐项匹配
  `source_type + source_revision_id + content_hash`。未匹配的引用、原文摘录与定位信息必须丢弃或标记为未验证，
  不能直接透传给普通用户；网页端会再次执行同样的失败关闭校验。
- 未知句柄、跨企业句柄、跨项目引用或资源关系不匹配统一返回 `404 RESOURCE_NOT_FOUND`；服务端不得返回默认对象、
  空壳对象，也不得通过差异化错误泄露资源是否存在。SSE 建连和断线重连同样必须鉴权并校验 `task_id` 所属关系。

## 可修改事实、冻结快照与报价边界

- 企业资料事实纠正必须调用服务端 fact correction 接口，携带 `Idempotency-Key` 和 `expected_revision_id`，成功后形成
  新的企业资料 revision 并保留原值、纠正值及证据。前端不得只修改本地状态，也不得改变资料所属域。
- Requirement 的确认与更新必须绑定路径中的 `project_id`，携带 `Idempotency-Key` 和 `expected_revision_id`，由服务端
  创建新的 Requirement revision。确认表示认可当前抽取结果；更新表示提交经用户修订的完整内容和结构化字段，二者都
  不得覆盖历史 revision。
- 项目快照是服务端冻结的不可变输入清单。前端只通过项目作用域下的 list/detail 接口读取，不能创建、修改或拼装快照。
  生成、评审、终检、导出和报价测算必须绑定同一个经归属校验的 `project_snapshot_id`，快照中的材料、Requirement、
  企业资料、成果版本和报价样本引用均不可在任务执行中漂移。
- 外部历史报价库严格只读，网页端仅查询不可变查询快照，不提供历史报价新增、修改或删除能力。报价数字只能由受控的
  确定性 QuoteEngine 基于冻结样本和显式输入计算；`insufficient_data` 不得返回建议价或价格区间，也不得回退到 LLM
  猜价。计算结果必须分别保留外部查询的 `query_snapshot_id` 与算法冻结样本的 `sample_snapshot_id`，不得复制或混用
  两类血缘标识。应用策略必须由用户明确确认，并携带 `expected_version_id` 形成报价单新版本和审计记录。

## 在线编辑会话边界

- 当前网页编辑器是交互 Mock：本地草稿、编辑工具、批注、表格操作和即时合计用于验证 Web 体验，不直接改写
  `docx`/`xlsx`，也不保证原生格式保真。只有接入文档服务、服务端保存回调和不可覆盖版本闭环后，才能标记为
  原生 Office 在线编辑。
- 文档型 P0 支持可编辑目录、正文标题与目录同步、点击目录定位和页面预览。这些仍是网页交互能力，不等同于
  原生 Word 的分页、目录域或样式保真。
- “AI针对性修改”按钮只执行编辑器到项目助手的上下文交接。Word 已有非空选区时直接填入；没有选区时进入
  预览选取模式，用户拖选文字并松开后自动提取纯文本、退出模式、填入并聚焦输入框，按 `Esc` 可在选取过程中
  取消且不填入内容。报价单使用当前单元格或整行。该动作不调用项目助手或建议接口；用户补充要求后仍需主动
  发送，未接入项目助手接口时发送按钮保持禁用。
- 创建会话请求的 `mode=edit|comment|review` 只是期望模式。后端按用户、项目、成果状态和版本权限求交集，明确返回
  edit/comment/review 权限；任一后续请求仍需服务端鉴权，不能依赖前端隐藏工具栏。
- 自动保存成功表示服务端检查点已经持久化。浏览器 localStorage 只能作为断线保护，不能作为云端保存依据。
  显式完成编辑必须携带幂等键和 `expected_version_id`，生成新版本并保留旧版本。
- 并发基线变化返回 `409 VERSION_CONFLICT` 并保留可恢复检查点，不自动覆盖或静默切换到最新版。可重试网络/服务
  错误按退避策略处理；409 和鉴权、校验错误不自动重放。
- 文档服务回调必须验签、限流、防重放并校验文件类型、大小和内容哈希，以供应商事件 ID 幂等处理。重复回调只返回
  原处理结果，不能重复生成版本。
- 生产 AI 建议必须绑定会话、选区/结构锚点、源版本和文档修订号。页面先展示结构化差异，只有用户确认的变更项
  才能应用，并返回审计记录；锚点或依据失效时失败关闭。
- 报价单的数量、单价、税率、金额和比例使用十进制定点字符串。浏览器和原生工作簿中的总价都不是可信结果，
  正式保存由 QuoteEngine 复算。外部历史报价、历史价和算法建议价只读，网页和文档服务均无写入权限；用户只能
  修改明确允许的报价输入字段。

## 运行时数据源

默认与 `backend` 模式只使用 `src/shared/backend-api` 请求真实后端，不注册 MSW/Service Worker，
也不在请求失败时回退业务演示数据。`npm run dev:local-preview` 是另行的 localhost 开发态只读
界面快照；它不替换 API client，写操作全部失败关闭，且快照数据不进入 `backend` 生产构建。

## SSE

任务流地址为 `GET /api/v1/tasks/{task_id}/stream`，事件 `data` 必须通过
`publicTaskEventSchema`。客户端应记录 `event_id/sequence`，重连时发送 `Last-Event-ID`，重复序号需去重；
断流后以 `GET /tasks/{task_id}` 获取最终状态。

浏览器不得通过 URL 查询参数传递访问令牌。推荐同源 HttpOnly 会话 Cookie；若使用 Bearer Token，
应采用支持请求头的 fetch-stream 客户端。

## 变更流程

接口变更至少同时更新：

1. `docs/api/openapi.yaml`
2. `src/shared/backend-api` 对应请求封装、DTO 与适配器
3. Contract 测试和必要的页面集成测试

破坏性变更需升级公开事件 `schema_version` 或 API 版本，不允许静默改变字段语义。
