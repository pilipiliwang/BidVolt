# 网页端新增功能联调草案

> 状态：前端 Mock 已实现，后端接口待评审。以下接口进入 `openapi.yaml` 前不视为已上线契约。

## 1. 新建投标项目

`POST /api/v1/projects`

请求头必须包含 `Idempotency-Key`。企业身份由登录会话确定，前端不得传 `enterprise_id`。

```json
{
  "code": "BV-2026-021",
  "title": "新能源升压站设备采购",
  "buyer": "示例招标单位",
  "deadline_at": "2026-09-30T17:00:00+08:00"
}
```

成功后返回项目公开句柄、初始状态和空项目材料域。网页端跳转至
`/projects/{project_id}/materials`，随后只允许调用该项目路径下的材料上传接口。

## 2. 项目文件上传

`POST /api/v1/projects/{project_id}/materials/uploads`

- `multipart/form-data`，字段名 `files`，支持多文件。
- 写入路径中的项目事件链并形成 material revision，绝不自动进入企业资料库。
- 概览、材料、评审、报价和成果编辑页的“添加文件”共用此接口。
- 跨企业或跨项目句柄统一返回 `404 RESOURCE_NOT_FOUND`。

企业资料上传仍只使用 `POST /api/v1/enterprise-assets/uploads`；工作台内的“企业资料”页签只读，
仅拉取企业资料库结果，不提供写入或转存操作。

## 3. Office 在线编辑会话

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

## 4. 报价表计算边界

网页 Mock 仅在浏览器内重算“数量 × 用户报价”和总价，方便验证单元格交互。生产环境中金额必须使用
十进制定点字符串交给确定性 QuoteEngine；浏览器计算只能作为即时预览。正式保存时后端重新计算并返回
新报价版本、算法版本与输入快照引用，不接受浏览器直接提交的总价作为可信结果。
