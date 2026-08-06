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

前端当前提供 Word/Excel 交互 Mock，用于验证 P08/P09 布局、文本编辑、报价重算和保存状态；它不会
回写二进制 Office 文件。接入 OnlyOffice、Collabora 或自研编辑服务时，建议由业务后端签发短时会话：

`POST /api/v1/projects/{project_id}/deliverables/{deliverable_id}/versions/{version_id}/editor-sessions`

```json
{
  "mode": "edit",
  "expected_version_id": "v3.2"
}
```

```json
{
  "code": "OK",
  "message": "",
  "data": {
    "session_id": "opaque-editor-session",
    "provider": "onlyoffice",
    "document_type": "word",
    "editor_url": "https://editor.example/session/opaque-editor-session",
    "expires_at": "2026-08-06T15:30:00+08:00",
    "callback_token": "short-lived-signed-token"
  },
  "meta": { "request_id": "request-handle" }
}
```

约束：

- `deliverable_id` 仅允许 `business`、`technical`、`quote`。
- 后端必须校验 `project → deliverable → version` 的完整归属；前端不能直接获得对象存储密钥。
- 会话必须短时、单项目、单版本、按用户授权；编辑器回调必须验签、限流并防重放。
- 保存不得覆盖原版本。成功回调应生成新版本，并使用 `expected_version_id` 做乐观并发控制。
- 编辑器服务只能访问本次会话允许的成果文件；企业资料和当前项目材料通过业务 API 只读展示，不应
  作为编辑器可遍历的数据源。

推荐保存回调由编辑服务调用业务后端内部地址，浏览器只轮询公开状态：

- `GET /api/v1/editor-sessions/{session_id}`：读取 `opening | editing | saving | saved | failed | expired`。
- `POST /api/v1/editor-sessions/{session_id}/complete`：用户明确结束编辑；必须携带幂等键。
- 服务端内部 callback：接收供应商保存事件、校验签名/内容哈希后生成新成果版本。

## 5. 报价表计算边界

网页 Mock 仅在浏览器内重算“数量 × 用户报价”和总价，方便验证单元格交互。生产环境中金额必须使用
十进制定点字符串交给确定性 QuoteEngine；浏览器计算只能作为即时预览。正式保存时后端重新计算并返回
新报价版本、算法版本与输入快照引用，不接受浏览器直接提交的总价作为可信结果。

## 6. 不需要后端接口的 UI 修正

以下问题全部由网页端实现，不新增业务接口：工作台内容网格同宽、全局字号与行高、桌面/平板/窄屏断点、
浏览器缩放适配、表格自身滚动，以及截止日期时间控件的弹层定位、键盘操作和关闭行为。只有用户确认创建项目后，
规范化的 `deadline_at` 才通过 `POST /api/v1/projects` 提交。
