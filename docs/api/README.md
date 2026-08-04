# BidVolt Web API Contract v0.2

本目录是网页端与后端协作的契约基线。`openapi.yaml` 描述 HTTP 接口，运行时 Zod Schema 位于
`src/shared/api`，MSW 实现位于 `src/mocks`。三者必须同步演进。

## 不可突破的边界

1. **不存在通用 `target` 上传。** 企业资料只能通过
   `POST /api/v1/enterprise-assets/uploads` 上传；当前招标材料只能通过
   `POST /api/v1/projects/{project_id}/materials/uploads` 上传。任一接口收到 `target`、另一个域的
   ID 或“同时存入企业库”参数都必须拒绝。
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

## 通用约定

- API 前缀：`/api/v1`
- 成功响应：`{ "code": "OK", "message": "", "data": ..., "meta": { "request_id": "..." } }`
- 业务 ID 使用字符串，避免数据库 `BIGINT` 在 JavaScript 中丢失精度。
- 金额、单价、比例使用十进制定点字符串，不使用 JavaScript 浮点数传输。
- 时间使用带时区的 ISO 8601 字符串。
- 前端不传 `enterprise_id`；租户只能由后端认证上下文确定。
- POST/PUT/PATCH 等可重试写请求使用 `Idempotency-Key`。
- 每个 OpenAPI 操作使用稳定且唯一的 `operationId`；生成 SDK、Mock 和查询键时不得另造名称。
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

## Mock 模式

在 `.env.local` 中设置：

```bash
VITE_API_MODE=mock
```

应用启动时会动态加载 `src/mocks/browser.ts`。Node/Vitest 可使用
`src/mocks/server.ts`。Mock 数据先经过与生产响应相同的 Zod Schema 校验。

## SSE

任务流地址为 `GET /api/v1/tasks/{task_id}/stream`，事件 `data` 必须通过
`publicTaskEventSchema`。客户端应记录 `event_id/sequence`，重连时发送 `Last-Event-ID`，重复序号需去重；
断流后以 `GET /tasks/{task_id}` 获取最终状态。

浏览器不得通过 URL 查询参数传递访问令牌。推荐同源 HttpOnly 会话 Cookie；若使用 Bearer Token，
应采用支持请求头的 fetch-stream 客户端。

## 变更流程

接口变更至少同时更新：

1. `docs/api/openapi.yaml`
2. `src/shared/api` 对应 Zod Schema/API
3. `src/mocks/fixtures.ts` 和 `src/mocks/handlers.ts`
4. Contract 测试

破坏性变更需升级公开事件 `schema_version` 或 API 版本，不允许静默改变字段语义。
