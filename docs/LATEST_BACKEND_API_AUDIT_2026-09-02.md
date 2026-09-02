# 最新后端接口复核与前端对接记录（2026-09-02）

## 结论

本轮以后端仓库 `zhangsheng377/BidVolt` 的 `main` 源码为第一依据，锁定提交为
`439fcfc727593297813b2891e8f6e6b2fc60cd08`。接口文档用于补充业务说明；当文档、OpenAPI
和代码不一致时，前端按 `app/api/**`、`app/services/**`、`app/models/**` 的实际代码处理。

最新源码生成的 OpenAPI 与联调环境 `http://47.100.182.3:28123/openapi.json` 均包含 145 个
HTTP 操作，两份规范化 JSON 完全一致，SHA-256 均为
`ad2a6da3ab5c68b0e6f9aea5a35dc4ad3b341d18ab925430d52abd50fe10954e`。
OpenAPI 只证明公开 HTTP 契约一致；其版本仍为 `0.1.0` 且没有部署 commit SHA，不能据此断言
线上内部 Agent 实现与某个 Git commit 完全相同。

前端 `dev:backend` 模式只通过 `/api/v1` 同源代理读取真实接口，不启用 Mock 回退。
本地预览数据仅在开发环境显式使用 `local-preview` 模式时可用，且写操作会被阻止。

## 本轮已完成的真实接入

### 项目与材料

- `ProjectCreate/ProjectResponse` 改用后端独立 `buyer` 字段，不再把招标人拼进 `note`。
- 消费后端项目 `summary`；项目列表使用服务端 `q` 搜索并完整分页，不再只读前 100 项。
- 项目文件继续使用 `document_role` 恢复“当前招标材料 / 补充材料 / 已完成标书”分类。
- ZIP 由 `POST /files/upload` 自动展开，不再重复调用 `/files/archive`。
- 企业资料上传使用后端自动 ingest 结果，不再重复提交 `/enterprise/ingest`。
- 项目材料可按需调用 `GET /files/{file_id}/image-descriptions` 查看结构化识图结果。

### 图片编号二次识别

最新后端动态响应在以下位置增加可选字段：

- `GET /files/{file_id}/image-descriptions` 的 `items[].description`
- `GET /enterprise/assets/{asset_id}` 的 `image_description`

前端现已消费 `numbers_pass1`、`numbers_verified`、`numbers_conflict`、`verify_mode`。这些字段是
机器二次识别，不等同于人工确认；两轮编号冲突时页面同时展示候选值并提示核对原件，不静默选值。

### Requirement 与评审闭环

- Requirement 使用源码规定的 `PUT .../confirm`、`PUT .../correct` 和 `expected_revision`。
- 评审详情在存在 `score_id` 时读取 `GET .../scores/{score_id}/items`，不只使用可能过期的 run 副本。
- 页面支持单条确认/不采纳、批量确认和重新评审：
  - `PUT .../items/{item_id}/confirm`
  - `POST .../items/confirm`
  - `POST /projects/{project_id}/re-evaluate`
- 确认使用后端 `snapshot_id` 作为 `expected_version`，操作后重新读取真实评分与评审项。

### 历史行情与报价

- 历史行情列表展示后端真实 `publisher`、`category`、`package_name`、`price_mode`、`limit_price`、
  `win_ratio` 和证据 URL，不再把已有字段固定显示为 `—`。
- 接入来源元数据、物料样本、趋势和 XLSX 公共库/企业私有库导入：
  - `GET /quotes/history/source-metadata`
  - `GET /quotes/history/{material_ref}/samples`
  - `GET /quotes/history/{material_ref}/trend`
  - `POST /quotes/history/import`
- 报价中心可真实触发确定性测算、冻结样本复算、策略生成和有依据的 AI 参考区间：
  - `POST /quotes/calculate`
  - `POST /quotes/recalc`
  - `POST /quotes/strategies`
  - `POST /quotes/ai-suggest`
  - `POST /quotes/apply`
- AI 接口只展示后端返回的参考区间和低置信提示，正式报价仍走确定性计算与应用链路。

### 任务与调试面板

- `GET /tasks/{task_id}` 与 `GET /tasks/{task_id}/stream` 已加入页面接口目录；SSE 监控直到流消费完成
  才结束，提前断流记为失败并保留轮询降级。
- Agent 主流程继续使用 `agent-run` 状态、SSE、questions、answer、chat、pre-chat 与
  `response-package`，不回退到 legacy `POST /projects/{id}/tasks`。
- 调试面板把接口区分为：调用成功、调用失败、调用中、未触发、前端未接入、后端未提供。
  只存在待接项时会显示“真实 API 已连接，仍有待接项”，不再误报为后端调用失败。
- OpenAPI checker 只把页面可真实触发的接口列为“前端必需”，不再用仅有 client 方法、没有页面入口的
  调用制造假阳性。

## 明确阻断与未接入边界

### 后端响应字段阻断

`GET /quotes/history/samples/{sample_id}` 路由存在，但当前
`GET /quotes/history` 与 `GET /quotes/history/{material_ref}/samples` 不返回可访问的 `sample_id`；
详情端点还限定 `enterprise_id == 当前企业`，公共样本即使取得 ID 也可能返回 404。因此页面保留条件
处理能力，但按钮明确显示“ID 未提供”，调试面板标为响应字段阻断，OpenAPI checker 不把它算作已接通。
前端不会用 `notice_id` 或数组序号冒充样本主键。

### 后端已提供但当前产品没有入口

以下接口在源码中存在，但页面缺少明确产品动作或安全的上游 ID 来源，调试面板诚实显示“前端未接入”：

- Agent 单项成果下载：公开任务响应没有可列举的 `artifact_id` 清单；当前使用最终响应文件包。
- 项目终检、项目导出、传统 `delivery-package`：当前产品使用 Agent 响应包与单项成果下载。
- 存量 ZIP 手动补解包、企业资料手动重归类：新上传流程已经由后端自动处理。
- Requirement 单条详情与 upsert：列表响应已满足展示；人工操作使用 confirm/correct，识别写入由后端任务完成。

这些接口没有为“测试变绿”而在页面加载时无副作用地伪调用。

### 后端仍未提供

- `POST /auth/forgot-password`
- `GET /enterprise/assets/{asset_id}/revisions/{revision_id}`

前者使“忘记密码”无法完成；后者使企业资料历史版本只能展示摘要，不能读取某版完整内容。

### Agent 内部能力

`/assembly/*`、Agent 内部 `POST .../asks`、knowledge/search 等接口由 Agent/MCP 工具链调用，
不属于浏览器普通用户操作，未加入页面必需接口。浏览器只消费公开任务状态、会话、问卡和成果包。

## 状态语义纠正

后端 `EnterpriseIngestionTask.status` 的源码语义为：`1=分类中`、`2=待确认`、`3=完成`。
前端已据此把状态 2 显示为“待用户核对”，不再错误显示“正在抽取字段”或无限处理中。

## 文档与源码差异

- `response-package` 公共下载接口在尚未打包时返回通用 409；详细质量门禁发生在 Agent 内部
  `/assembly/package`，前端不硬编码文档中的内部失败描述。
- 上传文档未完整描述 `document_role` 和 `expanded.failed` 的真实结构，前端按源码响应解析。
- 历史行情文档中的示例形状与源码 `{sample_count, samples, stats, readonly}` 不完全一致，前端按源码。
- 历史行情导入实际为 201，且必须提交 `target=public|private`。

## 验证结果

- 最新线上 OpenAPI：前端可真实触发的必需接口 `71/71` 存在。
- 已知后端未提供能力：`2/2` 仍未提供，未误标为成功。
- 单元/组件测试：`52` 个测试文件、`395/395` 项通过。
- ESLint：通过。
- TypeScript + 后端模式生产构建：通过。
- 浏览器真实会话验证：项目概览、历史行情、报价中心、评审中心和企业资料页均无“运行时捕获：清单外接口”；
  项目自动请求为真实 API，失败计数为 0。
