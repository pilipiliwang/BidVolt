# 网页端新增功能联调草案

> 状态：前端 Mock 已实现，后端接口待评审。以下接口进入 `openapi.yaml` 前不视为已上线契约。

## 1. 登录、会话与退出

- `/login` 是公开路由；未认证用户必须能直接访问真实登录页。
- `POST /api/v1/auth/login` 登录成功后返回 `session_id`、user、enterprise、permissions 和
  `expires_at`；推荐使用同源 HttpOnly 会话 Cookie。
- 应用启动、刷新或打开受保护深链时先调用 `GET /api/v1/auth/session`。在会话确认前不渲染企业数据。
- 工作台左下角用户信息打开账户菜单，“退出登录”调用 `POST /api/v1/auth/logout`。成功后清空全部会话及
  企业作用域缓存并跳转 `/login`。
- 除登录凭据错误外，任一受保护接口返回 401 时均停止业务请求和 SSE、清空当前企业缓存并跳转登录；并发
  401 只执行一次。只允许保存站内相对路径用于登录后回跳。

推荐错误码：登录凭据错误为 `401 INVALID_CREDENTIALS`；缺少、过期或已撤销会话分别使用
`401 SESSION_REQUIRED`、`401 SESSION_EXPIRED`。登出返回 `data.logged_out=true`；若登出接口返回
`SESSION_REQUIRED`，前端视为会话已经结束并完成本地清理。

## 2. 新建投标项目

`POST /api/v1/projects`

请求头必须包含 `Idempotency-Key`。企业身份由登录会话确定，前端不得传 `enterprise_id`。

`deadline_at` 必须是带时区的 ISO 8601 确定时刻。网页端把日期时间控件中的本地值按浏览器时区转换后提交，
不得发送无时区的本地字符串或仅日期；后端不得按服务器默认时区重新解释。

```json
{
  "code": "BV-2026-021",
  "title": "新能源升压站设备采购",
  "buyer": "示例招标单位",
  "deadline_at": "2026-09-30T17:00:00+08:00"
}
```

成功后返回项目公开句柄、初始状态和空项目材料域。网页端跳转至
`/projects/{project_id}/materials`。新项目的招标材料入口只调用该项目路径下的材料上传接口；如果用户切换到
“企业资料”页签上传，则仍调用企业域接口，不能借新建项目流程混写两个资料域。

截止时间错误统一返回 `400 VALIDATION_ERROR`，并在 `details.fields.deadline_at` 中使用 `REQUIRED`、
`INVALID_DATETIME` 或 `DEADLINE_NOT_IN_FUTURE`；企业内项目编号冲突返回
`409 PROJECT_CODE_CONFLICT`。创建成功后使项目列表/统计缓存失效，并以响应预填项目详情缓存。

## 3. 文件上传的双域边界

### 3.1 项目材料上传

`POST /api/v1/projects/{project_id}/materials/uploads`

- `multipart/form-data`，字段名 `files`，支持多文件。
- 写入路径中的项目事件链并形成 material revision，绝不自动进入企业资料库。
- 概览、材料、评审、报价和成果编辑页的“添加文件”共用此接口。
- 跨企业或跨项目句柄统一返回 `404 RESOURCE_NOT_FOUND`。

### 3.2 企业资料上传

企业资料库页面和项目工作台“企业资料”页签都使用：

`POST /api/v1/enterprise-assets/uploads`

- 两个入口读取和写入登录会话确定的同一企业域数据源；项目工作台不得改用项目材料上传接口。
- 工作台上传请求不携带 `project_id`、`material_id`、`document_role` 或“同时写入项目”参数。
- 上传结果只返回企业域 `asset_ids` 和企业 ingestion/task 句柄，绝不能创建项目 material revision、项目事件
  或项目快照。
- 上传成功、处理状态变化或分类修订后，前端同时使企业资料列表、facets、详情和活动 ingestion 缓存失效，
  企业资料库与所有项目工作台企业资料页签同步刷新。
- 企业资料上传不使 `GET /projects/{project_id}/materials` 失效；项目材料数据应保持不变。

## 4. Office 在线编辑会话

完整能力清单见 [`../product/ONLINE_EDITOR_CAPABILITIES.md`](../product/ONLINE_EDITOR_CAPABILITIES.md)。

### 4.1 当前网页 P0 与原生文档服务的边界

当前技术标、商务标和报价单编辑器是浏览器交互 Mock：支持本地草稿、保存状态、撤销/重做、查找替换、
常用格式、批注、缩放、表格行操作、筛选排序、建议价确认和即时重算。文档型编辑器还支持可编辑目录、标题与
目录同步、点击目录定位和页面预览。草稿按 `enterprise_id + user_id + project_id + deliverable_type + version_id` 隔离，用于验证页面操作
和刷新恢复。

当前“AI针对性修改”不生成建议。它只把 Word 当前选区，或报价表当前单元格/整行的纯文本上下文，填入页面底部
项目助手输入框并聚焦，供用户继续补充要求；该动作不自动提交、不发起网络请求，也不直接修改正文或表格。
项目助手接口未接入时发送按钮必须禁用。

当前网页能力不得被描述为“已完成原生 Word/Excel 编辑”。它不直接修改 `docx` / `xlsx` 二进制文件，不保证
分页、复杂样式、页眉页脚、公式、批注、修订或宏的格式保真，也不具备服务端协同编辑和正式版本历史。
下载源文件不会把网页草稿伪装为已更新的 Office 文件。

生产环境必须接入 OnlyOffice、Collabora 或等价的文档服务，并由业务后端负责短时会话、权限收敛、文档取回、
服务端自动保存、回调验签、不可覆盖的新版本、冲突处理和审计。浏览器本地草稿只能作为断线保护，不能代替
服务端保存成功状态。

### 4.2 创建编辑会话

`POST /api/v1/projects/{project_id}/deliverables/{deliverable_type}/versions/{version_id}/editor-sessions`

请求头必须包含 `Idempotency-Key`。请求的 `mode` 只能表达用户希望进入的工作模式，不能提升权限：

```json
{
  "mode": "edit",
  "expected_version_id": "technical-v6",
  "client_capabilities": {
    "autosave": true,
    "comments": true,
    "review": true
  }
}
```

公开响应只返回浏览器启动编辑器所需的信息：

```json
{
  "code": "OK",
  "message": "",
  "data": {
    "session_id": "opaque-editor-session",
    "provider": "onlyoffice",
    "document_type": "word",
    "mode": "edit",
    "permissions": {
      "edit": true,
      "comment": true,
      "review": false,
      "download": true
    },
    "editor_url": "https://editor.example/session/opaque-editor-session",
    "expires_at": "2026-08-06T15:30:00+08:00",
    "status": "opening",
    "autosave": {
      "enabled": true,
      "interval_seconds": 30
    }
  },
  "meta": { "request_id": "request-handle" }
}
```

安全约束：

- `deliverable_type` 仅允许 `business`、`technical`、`quote`。后端必须校验
  `project → deliverable → version` 的完整归属和当前成果状态。
- `mode` 仅允许 `edit`、`comment`、`review`。服务端以用户角色、成果状态和项目归属求交集后返回
  `permissions`；`comment` 不得修改正文，`review` 只能创建修订/接受或拒绝被授权的修订，前端隐藏按钮不能
  代替服务端鉴权。
- 会话必须短时、绑定单用户、单企业、单项目和单源版本。`expected_version_id` 必须与路径中的 `version_id`
  一致；不一致直接返回 `409 VERSION_CONFLICT`，不能静默改用最新版本。
- 浏览器不能获得对象存储密钥、服务端下载凭据、供应商保存回调凭据或 `callback_token`。即使供应商要求
  `callbackUrl` 或签名配置，也只能由业务后端在服务端生成并传给受信文档服务；不得作为前端 API 字段暴露。
- `editor_config` 若替代 `editor_url` 返回，必须是经过白名单过滤的浏览器配置，不能包含内部 URL、回调密钥、
  对象存储地址或可复用服务凭据。
- 文档服务只能读取本会话授权的单个成果版本；企业资料和当前项目材料不能成为可遍历数据源。

### 4.3 编辑、自动保存与会话状态

浏览器通过 `GET /api/v1/editor-sessions/{session_id}` 读取公开状态，不直接接收供应商回调。响应至少包含：

- `status`：`opening | editing | autosaving | saving | saved | conflict | failed | expired`；
- `mode`、`permissions`、`source_version_id`、`expected_version_id`、`expires_at`；
- `has_pending_changes`、`last_autosaved_at`、`last_saved_at`、可选 `checkpoint_revision_id`；
- 保存完成后的 `new_version_id`；失败时的 `error.code`、`error.message`、`error.retryable` 和可选
  `retry_after_seconds`。

自动保存的最低语义是“服务端已经持久化当前会话检查点”，不能仅因浏览器写入 localStorage 就显示“云端已保存”。
后台自动保存可以合并短时间内的多个供应商事件，避免每次按键都创建成果版本；检查点不得覆盖源文件。用户点击
“保存/完成编辑”后，必须将最终检查点固化为不可变的新成果版本并返回 `new_version_id`。如果产品选择让自动保存
版本对用户可见，则每个公开版本仍必须不可变、可审计，不得原地覆盖。

`POST /api/v1/editor-sessions/{session_id}/complete` 必须携带 `Idempotency-Key`，请求体为：

```json
{
  "expected_version_id": "technical-v6",
  "client_save_token": "optional-opaque-client-token"
}
```

响应可直接返回 `new_version_id`，或返回 `task_id` 并让前端继续查询会话状态。重复提交同一幂等键必须返回同一
完成结果，不能重复创建版本。

### 4.4 服务端回调、新版本与冲突

保存回调是“文档服务 → 业务后端”的内部调用，不是浏览器接口，也不进入前端 OpenAPI。业务后端必须：

1. 校验供应商签名、时间戳、随机数、会话绑定和来源地址，限流并以 `provider_event_id` 防重放；
2. 只从允许的供应商地址取回文件，校验 MIME、扩展名、大小、内容哈希并完成病毒/恶意宏扫描；
3. 将自动保存写入会话隔离的检查点，记录操作者、源版本、内容哈希、供应商事件和时间；
4. 固化版本前再次比较 `expected_version_id`。成功时生成新 `version_id` 和审计记录，永不覆盖原版本；
5. 并发版本已经变化时把会话标记为 `conflict`，保留可恢复检查点，不得自动覆盖或自动把基线切到最新版。

公开的 `409 VERSION_CONFLICT` 至少返回 `expected_version_id`、`current_version_id`、`session_id` 和
`recoverable=true`。前端应让用户选择打开最新版、保留为副本或导出当前检查点；409 不是可自动重放的错误。

### 4.5 失败重试

- 浏览器只对网络错误、429、502、503、504 或 `retryable=true` 的保存/状态请求做指数退避重试，使用抖动并遵守
  `Retry-After`；`complete` 重试必须复用原 `Idempotency-Key`。
- 400、401、403、404、409 和 `retryable=false` 不自动重试。401 按全局会话失效处理；409 进入冲突流程。
- 供应商回调重试必须复用 `provider_event_id`；业务后端以该 ID 和内容哈希去重。已经生成版本的回调再次到达时，
  返回原处理结果，不得创建第二个版本。
- `expired` 但存在服务端检查点时，前端可请求“恢复为副本”；不存在检查点时只能重新打开源版本，不能显示已保存。

### 4.6 生产 AI 修改建议

编辑器中的上下文填充动作不调用以下接口。只有用户补充要求并主动发起生产修改流程后，真正的 AI 修改才能严格
执行“生成建议 → 差异预览 → 用户确认应用”，不能由模型直接修改或保存正文：

1. `POST /api/v1/editor-sessions/{session_id}/suggestions` 只生成候选建议，绑定选区/结构锚点、
   `expected_version_id`、文档修订号和明确指令，返回 `suggestion_id`/`task_id`；
2. `GET /api/v1/editor-sessions/{session_id}/suggestions/{suggestion_id}` 返回结构化差异、变更项、依据引用、
   风险提示、模型/规则版本和生成状态，但不自动应用；
3. `POST /api/v1/editor-sessions/{session_id}/suggestions/{suggestion_id}/apply` 必须提交
   `confirmed=true`、选中的 `change_ids`、`expected_version_id` 和当前文档修订号；成功后返回新的文档修订号和
   `audit_log_id`，并保持可撤销；
4. 每次生成、查看、应用、部分应用、拒绝和撤销都记录操作者、时间、源版本、选区哈希、指令、变更项、
   模型/规则版本和结果。审计记录不得包含模型思维链或内部凭据。

权限为 `comment` 的会话只能把建议写入批注；`review` 会话只能形成可接受/拒绝的修订；只有 `edit=true` 且用户
明确确认后才能直接应用到工作副本。差异无法重新定位、版本冲突或依据失效时必须失败关闭并重新生成。

## 5. 报价表计算边界

网页 Mock 仅在浏览器内重算“数量 × 用户报价”和总价，方便验证单元格交互。生产接口中的数量、单价、税率、
金额和比例必须使用十进制定点字符串，并明确币种和精度；不得用 JavaScript 浮点数作为持久化或审计依据。

外部历史报价是单向只读数据源。网页端只允许查询服务端冻结的 `query_snapshot_id`/`sample_snapshot_id`，不能通过
报价单编辑器新增、修改或删除外部样本；文档服务也不能获得历史库写权限。历史价、算法建议价和用户报价必须是
不同字段，其中历史价和算法建议价始终只读；批量应用建议价只能在用户明确确认后写入用户报价字段并留下审计记录。

正式保存时，后端只接受允许编辑的行输入和 `expected_version_id`，由确定性 QuoteEngine 重新计算行金额、税额和
总价，并返回新报价版本、算法版本与输入快照引用。浏览器提交的公式结果、行金额、总价或原生工作簿缓存值只能
用于校验，不能作为可信结果；输入不足时返回 `insufficient_data`，不得由 AI 猜价。

## 6. 不需要后端接口的 UI 修正

以下问题全部由网页端实现，不新增业务接口：工作台内容网格同宽、全局字号与行高、桌面/平板/窄屏断点、
浏览器缩放适配、表格自身滚动，以及截止日期时间控件的弹层定位、键盘操作和关闭行为。只有用户确认创建项目后，
规范化的 `deadline_at` 才通过 `POST /api/v1/projects` 提交。

## 7. 在线编辑联调验收

- 同一用户以 `edit`、`comment`、`review` 三种授权进入时，只能看到并执行对应操作；篡改前端参数不能越权。
- Word 目录可编辑，正文标题变化后目录同步，点击目录可定位对应内容，页面预览切换不破坏编辑内容。
- 创建会话响应和浏览器网络记录中不存在 `callback_token`、对象存储密钥、内部回调地址或可复用服务凭据。
- 自动保存成功只在服务端检查点持久化后显示；断网、回调失败和会话过期不会误报“已保存”。
- 显式完成编辑后产生新的 `version_id`，旧版本仍可读取；重复完成请求和重复回调不会产生重复版本。
- 其他用户先生成新版本时，本会话完成返回 409/`conflict` 并保留检查点，不会覆盖最新版本。
- 可重试错误按退避策略恢复；不可重试错误停止重放并展示明确恢复动作。
- 点击“AI针对性修改”后，Word 选区或报价表当前单元格/整行的纯文本上下文出现在项目助手输入框且获得焦点；
  不自动发送、不发起网络请求、不修改正文/表格。项目助手接口未接入时发送按钮保持禁用。
- 生产 AI 建议必须先展示差异，只有用户确认的变更项被应用，并可查到审计记录。
- 报价金额全链路使用定点字符串，服务端复算结果为准；外部历史报价、历史价和算法建议价保持只读，接口和
  文档服务均无写入通道，确认应用建议价只更新用户报价字段。
