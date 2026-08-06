# AI电网投标助手前端接口需求

> 文档状态：前端需求基线，待接口评审
> 适用范围：当前网页端页面与已经展示的用户操作
> API 前缀：/api/v1
> 说明：本文只描述前端需要调用的接口和数据，不规定后端内部技术实现。

## 1. 文档目标

本文根据当前网页端路由、页面内容和用户操作，梳理前端联调所需接口，用于确认：

1. 每个页面首次进入和刷新时需要读取什么数据。
2. 每个可操作按钮需要调用什么接口。
3. 请求与响应至少需要包含哪些字段。
4. 哪些接口已经存在于 openapi.yaml，哪些需要新增或扩展。
5. 哪些交互仅发生在浏览器或在线编辑器内部，不需要业务接口。

本文不讨论数据库、微服务拆分、算法内部实现、任务调度方式或第三方编辑器部署方式。

## 2. 状态与优先级

### 2.1 接口状态

| 状态 | 含义 |
|---|---|
| 已存在 | 已在 docs/api/openapi.yaml 中定义，可直接进入联调 |
| 待扩展 | 路径已存在，但查询参数或响应字段不足以支持当前页面 |
| 待新增 | 当前 OpenAPI 中没有该接口 |
| 无需接口 | 当前交互可由浏览器或 Office 编辑器完成 |
| 暂不接入 | 页面控件当前禁用或仅作演示，不纳入本轮接口范围 |

### 2.2 优先级

| 优先级 | 含义 |
|---|---|
| P0 | 缺少后页面无法加载、刷新恢复或完成主要操作 |
| P1 | 主流程可运行，但页面信息或次要操作不完整 |
| P2 | 当前禁用、演示或后续规划功能 |

## 3. 前端通用接口要求

### 3.1 成功响应

所有 JSON 接口统一返回以下字段：

| 字段 | 类型 | 必需 | 用途 |
|---|---|---:|---|
| code | string | 是 | 成功固定为 OK |
| message | string | 是 | 用户可理解的简短提示；成功时允许为空 |
| data | object / array | 是 | 业务数据 |
| meta.request_id | string | 是 | 前端报错反馈和日志定位 |

### 3.2 错误响应

| 字段 | 类型 | 必需 | 用途 |
|---|---|---:|---|
| code | string | 是 | 稳定错误码 |
| message | string | 是 | 可向用户展示的错误信息 |
| details | object | 否 | 字段校验信息或冲突说明 |
| request_id | string | 是 | 问题定位 |
| retryable | boolean | 是 | 前端是否展示“重试”操作 |

前端至少需要区分：未登录、无权限或资源不可见、参数错误、版本冲突、文件不支持、文件过大、请求过于频繁、任务失败和系统错误。

### 3.3 分页响应

列表接口统一提供：items、total、page、size。页面发起搜索、筛选或翻页后，后端返回对应页和真实总数。

### 3.4 标识、时间和数值

- project_id、task_id、asset_id、material_id、version_id 等均按字符串处理。
- 项目编号 code 只用于展示和搜索，不能代替 project_id。
- 时间字段使用带时区的 ISO 8601 字符串。`deadline_at` 必须表示一个确定时刻，例如
  `2026-09-30T17:00:00+08:00` 或等价的 `2026-09-30T09:00:00Z`；不得提交不带偏移量的
  `2026-09-30T17:00` 或仅日期 `2026-09-30`。
- 新建项目时，网页端将用户在本地日期时间控件中选择的值按浏览器当前时区转换为带偏移量的 ISO 8601；
  后端按时间点解析、统一存储并在响应中返回带时区值，不能把日期时间按服务器默认时区二次解释。
- 金额、单价、百分比和比率使用十进制字符串，前端只负责展示和即时预览。
- 前端不提交 enterprise_id；当前企业由登录会话确定。

### 3.5 写操作

业务写操作需要支持 Idempotency-Key。修改已有 revision 或 version 时，前端会提交 expected_revision_id 或 expected_version_id，并处理 409 版本冲突。

### 3.6 异步任务

上传解析、成果生成、校核、评审、导出等异步操作必须返回 task_id。前端通过任务详情和 SSE 进度流恢复状态。

任务事件至少包含：event_id、sequence、task_id、project_id 或明确的 enterprise scope、phase、status、percent、public_message、error_code、occurred_at 和可公开的 result_refs。

## 4. 页面与接口总表

| 页面/区域 | 前端功能 | 接口 | 状态 | 优先级 |
|---|---|---|---|---|
| 登录页 | 未认证时可直接访问 `/login`，邮箱密码登录 | POST /auth/login | 待新增 | P0 |
| 全局应用 | 刷新后恢复用户、企业和权限 | GET /auth/session | 待新增 | P0 |
| 工作台账户区 | 左下角用户菜单退出登录 | POST /auth/logout | 待新增 | P0 |
| 全局应用 | 受保护接口返回 401 后清理会话并跳转登录 | 统一 401 处理 | 待新增 | P0 |
| 投标工作台 | 项目列表、搜索、分页、概况统计 | GET /projects | 待新增 | P0 |
| 投标工作台 | 新增项目 | POST /projects | 待新增，已有草案 | P0 |
| 投标工作台 | 从项目列表删除/移出项目 | DELETE /projects/{project_id} | 待新增 | P1 |
| 项目公共页头 | 读取项目名称、编号、截止时间 | GET /projects/{project_id} | 待新增 | P0 |
| 项目概览 | 综合评分、成果卡片和版本摘要 | GET /projects/{project_id}/overview | 待新增 | P0 |
| 项目左侧资料栏 | 读取企业资料摘要 | GET /enterprise-assets | 已存在，待扩展关键词搜索 | P0 |
| 项目左侧资料栏 | 上传企业资料并与企业资料库同步 | POST /enterprise-assets/uploads | 已存在 | P0 |
| 项目左侧资料栏 | 读取当前项目材料摘要 | GET /projects/{project_id}/materials | 已存在，待扩展字段 | P0 |
| 项目各页面 | 添加或补充当前项目文件 | POST /projects/{project_id}/materials/uploads | 已存在，待扩展文件用途 | P0 |
| 当前招标材料 | 材料列表与解析状态 | GET /projects/{project_id}/materials | 已存在，待扩展字段 | P0 |
| 当前招标材料 | 材料识别与企业资料匹配概况 | GET /projects/{project_id}/materials 的 analysis_summary | 待扩展 | P1 |
| 当前招标材料 | Requirement 列表 | GET /projects/{project_id}/requirements | 已存在 | P0 |
| 当前招标材料 | 确认或修改 Requirement | PATCH /projects/{project_id}/requirements/{requirement_id} | 已存在 | P0 |
| 当前招标材料 | 项目快照列表 | GET /projects/{project_id}/snapshots | 已存在 | P1 |
| 当前招标材料 | 项目快照详情 | GET /projects/{project_id}/snapshots/{snapshot_id} | 已存在 | P1 |
| 当前招标材料 | 开始生成或开始校核 | POST /projects/{project_id}/deliverable-runs | 待新增 | P0 |
| 全局任务抽屉 | 刷新后找到项目活动任务 | GET /projects/{project_id}/tasks?active=true | 待新增 | P0 |
| 全局任务抽屉 | 读取任务最终状态 | GET /tasks/{task_id} | 已存在 | P0 |
| 全局任务抽屉 | 实时接收公开进度 | GET /tasks/{task_id}/stream | 已存在 | P0 |
| 企业资料库 | 列表、分类、状态、搜索、分页 | GET /enterprise-assets | 已存在，待扩展关键词搜索 | P0 |
| 企业资料库 | 上传企业资料并自动归类 | POST /enterprise-assets/uploads | 已存在 | P0 |
| 企业资料库 | 恢复上传处理队列 | GET /enterprise-assets/ingestions?active=true | 待新增 | P1 |
| 企业资料库 | 查看资料和结构化字段 | GET /enterprise-assets/{asset_id} | 已存在 | P0 |
| 企业资料库 | 查看 revision 列表 | GET /enterprise-assets/{asset_id}/revisions | 已存在 | P1 |
| 企业资料库 | 纠正结构化字段 | PATCH /enterprise-assets/{asset_id}/facts/{fact_id} | 已存在 | P0 |
| 评审中心 | 获取可用评审机制 | GET /review-providers | 已存在 | P0 |
| 评审中心 | 恢复当前项目最近评审 | GET /projects/{project_id}/review-runs?latest=true | 待新增 | P0 |
| 评审中心 | 发起评审 | POST /projects/{project_id}/review-runs | 已存在 | P0 |
| 评审中心 | 读取评审状态和结论 | GET /review-runs/{review_run_id} | 已存在 | P0 |
| 评审中心 | 保存用户编辑后的建议 | PUT /review-runs/{review_run_id}/findings/{finding_id}/suggestion-override | 待新增 | P0 |
| 评审中心 | 上传补充资料 | POST /projects/{project_id}/materials/uploads | 已存在 | P0 |
| 报价分析 | 恢复项目最近一次报价测算 | GET /projects/{project_id}/quote-calculations?latest=true | 待新增 | P0 |
| 报价分析 | 查询外部历史报价样本 | GET /quotes/history | 已存在，待扩展字段 | P0 |
| 报价分析 | 执行确定性报价测算 | POST /quotes/calculations | 已存在 | P0 |
| 报价分析 | 读取报价测算 | GET /quotes/calculations/{calculation_id} | 已存在，待扩展依据明细 | P0 |
| 报价分析 | 确认应用策略并生成报价新版本 | POST /quotes/calculations/{calculation_id}/apply | 已存在 | P0 |
| 历史报价 | 条件查询、统计和分页 | GET /quotes/history | 已存在，待扩展筛选和展示字段 | P0 |
| 历史报价 | 查看单条样本详情 | GET /quotes/history/{sample_id} | 已存在，待扩展详情字段 | P1 |
| 历史报价 | 查看物料趋势和可比样本 | GET /quotes/materials/{material_code}/history-summary | 待新增 | P1 |
| 成果页 | 读取商务标、技术标、报价单 | GET /projects/{project_id}/deliverables | 待新增 | P0 |
| 成果页/编辑器 | 读取成果版本列表 | GET /projects/{project_id}/deliverables/{deliverable_type}/versions | 待新增 | P0 |
| 成果编辑器 | 读取指定成果版本 | GET /projects/{project_id}/deliverables/{deliverable_type}/versions/{version_id} | 待新增 | P0 |
| 成果页/编辑器 | 下载成果版本 | GET /projects/{project_id}/deliverables/{deliverable_type}/versions/{version_id}/download | 待新增 | P0 |
| 成果编辑器 | 创建在线编辑会话 | POST /projects/{project_id}/deliverables/{deliverable_type}/versions/{version_id}/editor-sessions | 待新增，已有草案 | P0 |
| 成果编辑器 | 查询编辑会话状态 | GET /editor-sessions/{session_id} | 待新增，已有草案 | P0 |
| 成果编辑器 | 结束编辑并等待新版本 | POST /editor-sessions/{session_id}/complete | 待新增，已有草案 | P0 |
| 成果编辑器 | 生成 AI 修改建议 | POST /editor-sessions/{session_id}/suggestions | 待新增；生产能力 | P1 |
| 成果编辑器 | 查询建议与差异 | GET /editor-sessions/{session_id}/suggestions/{suggestion_id} | 待新增；生产能力 | P1 |
| 成果编辑器 | 用户确认应用建议 | POST /editor-sessions/{session_id}/suggestions/{suggestion_id}/apply | 待新增；生产能力 | P1 |
| 成果编辑器 | 把选区/单元格上下文填入项目助手 | 无需接口 | 浏览器内交互 | - |
| 项目助手 | 发送问题 | POST /projects/{project_id}/assistant/messages | 待新增；未接入时发送禁用 | P0 |
| 项目助手 | 流式接收回答 | GET /assistant/messages/{message_id}/stream | 待新增；未接入时发送禁用 | P0 |
| 项目助手 | 刷新后恢复会话记录 | GET /projects/{project_id}/assistant/messages | 待新增 | P1 |
| 全局页面 | 字号、网格宽度、断点布局和日期控件适配 | 无需接口 | 无需接口 | - |

## 5. 登录与全局会话

### FE-AUTH-000 登录路由与鉴权守卫

- `/login` 是无需会话即可访问的公开路由，首次打开、刷新和退出后都必须显示真实登录页，不能被默认 Mock
  会话直接跳过。
- 除 `/login` 外的业务路由均为受保护路由。应用初始化时先进入会话待确认状态并调用
  `GET /auth/session`；确认成功后再渲染工作台，不能短暂显示其他企业的数据。
- 未认证访问受保护路由时跳转 `/login`，并只保存站内相对路径作为 `return_to`。登录成功后返回该路径；
  外部 URL、协议相对 URL 和其他域名不得作为回跳目标。
- 登录页自身的表单显示、密码显隐、焦点和校验提示属于前端行为，不需要额外接口。

### FE-AUTH-001 登录

- 方法与路径：POST /auth/login
- 状态：待新增
- 页面动作：登录页点击“登录”

请求字段：

| 字段 | 类型 | 必需 | 说明 |
|---|---|---:|---|
| email | string | 是 | 登录邮箱 |
| password | string | 是 | 登录密码 |
| remember | boolean | 是 | 是否保持较长登录状态 |

响应 data 至少包含：session_id、user、enterprise、permissions、expires_at。user 包含 user_id、display_name、role；enterprise 包含 enterprise_id、name。

登录成功后，前端写入或刷新唯一的 session 查询缓存，并开始加载当前企业数据。若凭据错误，接口返回
`401 INVALID_CREDENTIALS`，登录页保留当前输入的邮箱并展示错误，不执行二次跳转。

### FE-AUTH-002 恢复会话

- 方法与路径：GET /auth/session
- 状态：待新增
- 页面动作：应用初始化、浏览器刷新、直接打开深层项目链接
- 响应：与登录成功后的 session 数据一致。

未登录、会话过期或会话已被服务端撤销时返回 `401 SESSION_REQUIRED` 或
`401 SESSION_EXPIRED`。前端必须清空当前用户、权限、企业资料、项目和任务缓存，随后跳转登录页；不能继续使用
上一次会话的缓存数据。

### FE-AUTH-003 退出登录

- 方法与路径：POST /auth/logout
- 状态：待新增
- 页面动作：点击工作台左下角用户信息打开账户菜单，再点击“退出登录”
- 请求：使用当前同源 HttpOnly 会话 Cookie；不需要请求体，需携带 `Idempotency-Key`。
- 响应：`data.logged_out=true`。服务端必须撤销当前会话并清除会话 Cookie。

退出成功后，前端清除全部会话及企业作用域缓存并跳转 `/login`。如果请求因网络问题失败，前端不得假装服务端
会话已撤销，应在账户菜单中提示重试；如果返回 `401 SESSION_REQUIRED`，视为已经退出并执行本地清理。

### FE-AUTH-004 统一 401 处理

- 除 `POST /auth/login` 的 `INVALID_CREDENTIALS` 外，任一受保护业务接口返回 401 时均执行一次全局失效流程：
  停止后续业务请求、断开 SSE、清空所有当前企业缓存并跳转 `/login`。
- 多个并发请求同时返回 401 时只能触发一次跳转和一次提示，避免重定向循环。
- 登录成功后使 session 缓存生效；退出或 401 后使 session、projects、enterprise-assets、tasks、review-runs、
  quote-calculations 和 deliverables 等所有企业作用域缓存失效。

鉴权联调验收：未登录可以看到登录页；刷新受保护深链会先恢复会话；左下角用户信息能打开退出入口；退出后浏览器
后退不能重新看到受保护数据；会话过期后任一受保护请求都会回到登录页并保留安全的站内目标地址。

注册和忘记密码目前没有完整页面流程，本轮不要求接口；在接口接入前，相应按钮应继续禁用或明确标注未开放。

## 6. 投标项目

### FE-PROJECT-001 项目列表

- 方法与路径：GET /projects
- 状态：待新增
- 页面动作：进入投标工作台、搜索、筛选、分页。

查询参数：

| 参数 | 类型 | 必需 | 说明 |
|---|---|---:|---|
| q | string | 否 | 匹配项目名称、项目编号和招标人 |
| stage | string | 否 | 项目阶段 |
| deadline_status | string | 否 | all、near、expired |
| sort | string | 否 | 默认按 updated_at 倒序 |
| page | integer | 否 | 默认 1 |
| size | integer | 否 | 每页数量 |

响应 data 至少包含：

- items：项目摘要数组。
- total、page、size。
- summary：all_count、near_deadline_count、expired_count。

项目摘要字段：project_id、code、title、buyer、stage、progress、deadline_at、material_count、risk_count、latest_score、updated_at。

### FE-PROJECT-002 新增项目

- 方法与路径：POST /projects
- 状态：待新增；docs/api/FRONTEND_INTEGRATION.md 已有草案
- 页面动作：“新增项目”弹窗中点击“创建并进入材料页”

请求字段：

| 字段 | 类型 | 必需 | 说明 |
|---|---|---:|---|
| code | string | 是 | 企业内唯一项目编号，去除首尾空白后提交 |
| title | string | 是 | 项目名称 |
| buyer | string | 是 | 招标人 |
| deadline_at | string(date-time) | 是 | 未来的确定时刻，必须为带 `Z` 或 UTC offset 的 ISO 8601 |

请求示例：

```json
{
  "code": "BV-2026-021",
  "title": "新能源升压站设备采购",
  "buyer": "示例招标单位",
  "deadline_at": "2026-09-30T17:00:00+08:00"
}
```

截止时间校验必须使用请求值表示的绝对时刻：

- 缺失或空值：`400 VALIDATION_ERROR`，`details.fields.deadline_at=REQUIRED`。
- 非 ISO 8601、缺少时区偏移或日期本身无效：`400 VALIDATION_ERROR`，
  `details.fields.deadline_at=INVALID_DATETIME`。
- 截止时刻不晚于服务端当前时刻：`400 VALIDATION_ERROR`，
  `details.fields.deadline_at=DEADLINE_NOT_IN_FUTURE`。
- 项目编号在当前企业已存在：`409 PROJECT_CODE_CONFLICT`。

网页端可在提交前执行相同校验，但以后端结果为准。点击日期时间控件、打开日历、选择日期和时间、关闭弹层及将
本地值转换为 ISO 8601 都是前端行为，不需要新增接口。

响应 data 返回完整项目摘要。前端使用返回的 project_id 跳转至 /projects/{project_id}/materials，不使用 code 拼接资源 ID。
响应中的 `deadline_at` 必须与请求表示同一时刻，允许规范化为 UTC。创建成功后使项目列表和项目统计缓存失效，
并用响应数据预填新项目详情缓存。

### FE-PROJECT-003 项目详情

- 方法与路径：GET /projects/{project_id}
- 状态：待新增
- 页面动作：项目页头、页面刷新、深链访问。

响应字段：项目摘要字段，以及 current_revision_id、created_at。不存在或当前用户不可访问时，前端显示“项目不存在或无权访问”。

### FE-PROJECT-004 从列表移出项目

- 方法与路径：DELETE /projects/{project_id}
- 状态：待新增
- 页面动作：项目列表点击“删除”
- 前端语义：成功后从当前列表移除；后端内部采用删除、归档或回收站不属于本接口需求范围。

## 7. 项目概览与成果摘要

### FE-OVERVIEW-001 项目概览

- 方法与路径：GET /projects/{project_id}/overview
- 状态：待新增
- 页面动作：进入“标书成果总览”页。

响应 data：

| 字段 | 类型 | 必需 | 页面用途 |
|---|---|---:|---|
| project | object | 是 | 页头项目信息 |
| score | object / null | 是 | 综合、商务、技术、报价得分与风险数量 |
| deliverables | array | 是 | 三张成果卡片 |
| latest_task | object / null | 是 | 活动任务提示 |

score 至少包含 total、business、technical、pricing、rejection_risks、missing_materials、estimated_lift。

每个 deliverable 至少包含 deliverable_type、title、status、current_version_id、pages、words、score、estimated_lift、missing_material_count、updated_at。

### FE-DELIVERABLE-001 成果列表

- 方法与路径：GET /projects/{project_id}/deliverables
- 状态：待新增
- 页面动作：成果页、编辑器标签页初始化。
- 响应：与概览中的 deliverables 字段保持相同含义，可附带更多版本信息。

### FE-DELIVERABLE-002 成果版本列表

- 方法与路径：GET /projects/{project_id}/deliverables/{deliverable_type}/versions
- 状态：待新增
- 页面动作：选择成果版本、在商务标/技术标/报价单标签之间切换。

每个版本至少包含 version_id、version_label、status、mime_type、size_bytes、source_snapshot_id、created_by、created_at、is_current、editable。

### FE-DELIVERABLE-003 成果版本详情

- 方法与路径：GET /projects/{project_id}/deliverables/{deliverable_type}/versions/{version_id}
- 状态：待新增
- 页面动作：打开在线预览编辑页面。

响应至少包含：project_id、deliverable_type、version_id、title、document_type、mime_type、size_bytes、sha256、source_snapshot_id、created_at、editable、download_available，以及页面右侧评分摘要 review_summary。

### FE-DELIVERABLE-004 下载成果

- 方法与路径：GET /projects/{project_id}/deliverables/{deliverable_type}/versions/{version_id}/download
- 状态：待新增
- 页面动作：成果卡片下载、编辑器导出 Word/Excel。

响应可以是文件流、重定向或短时下载地址，但前端需要获得正确文件名、MIME 类型和过期时间。

## 8. 当前项目材料、Requirement 与快照

### FE-MATERIAL-001 项目材料列表

- 方法与路径：GET /projects/{project_id}/materials
- 状态：已存在，需扩展响应字段
- 页面动作：当前招标材料页、所有项目页左侧“当前招标材料”页签。

现有字段之外，前端需要：

| 字段 | 用途 |
|---|---|
| kind | 招标公告、技术规范书、报价模板等分类展示 |
| document_role | 区分招标材料、已完成标书、评审补充资料 |
| parse_progress | 解析进度条 |
| blocks_count | 文本块数量 |
| supersedes_revision_id | 展示替换关系 |

列表响应还需要 analysis_summary 和 missing_materials_summary，用于材料页右侧“模拟评标”和项目左侧“缺失材料”区域：

- analysis_summary：recognized_score_rule_count、rejection_clause_count、required_material_count、matched_enterprise_asset_count、missing_material_count、match_rate。
- missing_materials_summary：按缺失资料类别返回 label 和 count。

### FE-MATERIAL-002 上传项目文件

- 方法与路径：POST /projects/{project_id}/materials/uploads
- 状态：已存在，需扩展文件用途字段并统一文档字段名
- 页面动作：材料页两个上传区、左侧“当前招标材料”页签上传、聊天栏添加项目文件、评审页补充资料、报价页补充资料、成果编辑页补充资料。左侧“企业资料”页签上传不调用本接口，改用 `POST /enterprise-assets/uploads`。

multipart 字段：

| 字段 | 类型 | 必需 | 说明 |
|---|---|---:|---|
| files[] | file[] | 是 | 一个或多个文件 |
| event_type | string | 是 | initial、supplement、clarification、replacement |
| document_role | string | 是 | tender_material、completed_bid、review_supplement |
| supersedes_revision_id | string | 否 | replacement 时使用 |

响应返回 task_id、project_id、material_ids、status。前端立即显示排队状态，并通过任务流更新解析进度。

注意：FRONTEND_INTEGRATION.md 当前写为 files，而 openapi.yaml 使用 files[] 且要求 event_type，两份文档需要统一。

### FE-REQUIREMENT-001 Requirement 列表

- 方法与路径：GET /projects/{project_id}/requirements
- 状态：已存在
- 页面动作：打开 Requirement 标签。
- 前端需要字段：requirement_id、revision_id、type、title 或 structured.title、content、structured、confidence、status、evidence_refs。

### FE-REQUIREMENT-002 确认或更新 Requirement

- 方法与路径：PATCH /projects/{project_id}/requirements/{requirement_id}
- 状态：已存在
- 页面动作：点击“确认原文”，以及后续编辑 Requirement。
- 确认请求：action=confirm、expected_revision_id。
- 更新请求：action=update、expected_revision_id、content、structured。
- 响应：新 Requirement revision。

### FE-SNAPSHOT-001 快照列表

- 方法与路径：GET /projects/{project_id}/snapshots
- 状态：已存在
- 页面动作：打开项目快照标签。
- 页面需要：snapshot_id、reason、created_at、manifest、材料 revision 数、Requirement revision 数、成果版本引用和是否为当前最近快照。

### FE-SNAPSHOT-002 快照详情

- 方法与路径：GET /projects/{project_id}/snapshots/{snapshot_id}
- 状态：已存在
- 页面动作：后续启用“打开快照”时读取不可变 manifest。

### FE-RUN-001 开始生成或校核

- 方法与路径：POST /projects/{project_id}/deliverable-runs
- 状态：待新增
- 页面动作：“开始生成”或上传已制作标书后的“开始校核”。

请求字段：

| 字段 | 类型 | 必需 | 说明 |
|---|---|---:|---|
| mode | string | 是 | generate 或 validate |
| output_types | string[] | 否 | business、technical、quote；省略表示全部 |
| completed_bid_material_ids | string[] | validate 时 | 本次校核使用的已完成标书材料 |

响应字段：run_id、task_id、project_snapshot_id、status。前端不提交或拼装快照 manifest，只接收接口返回的冻结快照 ID。

## 9. 任务进度

### FE-TASK-001 项目活动任务列表

- 方法与路径：GET /projects/{project_id}/tasks?active=true
- 状态：待新增
- 页面动作：页面刷新后恢复“任务进度”数量和抽屉。
- 响应：活动任务摘要数组，至少包含 task_id、phase、status、percent、public_message、project_snapshot_id、updated_at。

### FE-TASK-002 任务详情

- 方法与路径：GET /tasks/{task_id}
- 状态：已存在
- 页面动作：SSE 中断后获取最终状态，或重新打开任务抽屉。

### FE-TASK-003 任务事件流

- 方法与路径：GET /tasks/{task_id}/stream
- 状态：已存在
- 页面动作：实时刷新任务抽屉。
- 前端会保存 event_id 和 sequence，重连时发送 Last-Event-ID，并对重复事件去重。

企业资料上传同样需要可恢复的处理进度。目前 Task 和 PublicTaskEvent 强制要求 project_id，但企业上传没有项目作用域。接口需要提供企业 ingestion 查询，或允许任务明确表达 enterprise scope，前端不接受伪造 project_id。

## 10. 企业资料库

### FE-ENTERPRISE-001 企业资料列表

- 方法与路径：GET /enterprise-assets
- 状态：已存在，需增加 q 查询参数
- 页面动作：企业资料库首屏、分类筛选、关键词搜索、分页，以及项目工作台企业资料页签。

查询参数：q、category、status、page、size。

响应项目至少包含 asset_id、name、category、status、current_revision_id、classification_confidence、expires_at、created_at、updated_at。列表响应还需要 facets.category_counts 和 facets.status_counts，保证后端分页时左侧分类数量仍然准确。

企业资料库和项目工作台企业资料页签必须读取登录会话所确定的**同一企业域数据源**。项目上下文只影响页面展示，
不得改变企业资料查询的 scope，也不需要“复制到项目”接口。前端建议两处复用相同的
`enterprise-assets` 查询键；任一处上传或纠正资料后，两处缓存同时失效并重新读取。

### FE-ENTERPRISE-002 上传企业资料

- 方法与路径：POST /enterprise-assets/uploads
- 状态：已存在
- 页面动作：企业资料库点击“上传资料”，或项目工作台切换到“企业资料”后点击上传/添加文件。
- multipart 字段：files[]、可选 category_hint。
- 响应：task_id、asset_ids、status。

工作台调用此接口时仍然只使用当前登录会话确定 enterprise scope：请求路径不得包含 `project_id`，请求体不得提交
`project_id`、`material_id`、`document_role` 或“同时写入项目”标志，响应也不得返回项目 material ID。后端把文件写入
企业资料库的归类/修订链，**绝不能写入当前项目材料、项目事件链或项目快照**。

上传成功后的缓存失效与同步刷新：

1. 立即把上传项以排队状态加入当前企业上传队列，并使 `GET /enterprise-assets/ingestions?active=true` 失效。
2. 使企业资料列表、分类/状态 facets 和当前 asset 详情缓存失效；重新读取 `GET /enterprise-assets`。
3. 企业资料库与任意项目工作台中的企业资料页签同步观察到新资料及解析状态；不刷新
   `GET /projects/{project_id}/materials`，因为项目材料没有变化。
4. 任务完成、失败或分类修订时再次使企业资料列表和 facets 失效，保证两处最终一致。

### FE-ENTERPRISE-003 恢复企业资料处理队列

- 方法与路径：GET /enterprise-assets/ingestions?active=true
- 状态：待新增
- 页面动作：上传窗口刷新后继续展示文件名、处理状态和进度。

每条数据至少包含 ingestion_id、task_id、asset_id、name、status、progress、error_code、created_at、updated_at。

### FE-ENTERPRISE-004 企业资料详情

- 方法与路径：GET /enterprise-assets/{asset_id}
- 状态：已存在
- 页面动作：点击文件名查看结构化字段。
- 前端必须能保留每个字段的 fact_id、key、label、value、confidence、status 和 evidence_refs，后续纠正接口使用 fact_id。

### FE-ENTERPRISE-005 revision 列表

- 方法与路径：GET /enterprise-assets/{asset_id}/revisions
- 状态：已存在
- 页面动作：资料详情中展示版本记录。

### FE-ENTERPRISE-006 纠正结构化字段

- 方法与路径：PATCH /enterprise-assets/{asset_id}/facts/{fact_id}
- 状态：已存在
- 页面动作：点击“纠正字段”并保存。
- 请求：value、expected_revision_id。
- 响应：asset_id、new_revision_id、更新后的 fact。

分类纠正接口已经存在，但当前页面没有分类编辑控件，本轮前端不会调用。

## 11. 外部评审中心

### FE-REVIEW-001 评审机制列表

- 方法与路径：GET /review-providers
- 状态：已存在
- 页面动作：评审中心选择评审机制。
- 前端需要：provider_id、name、type、version、status、capabilities、allowed_data_scope、can_execute。

### FE-REVIEW-002 项目评审记录

- 方法与路径：GET /projects/{project_id}/review-runs
- 状态：待新增 GET 操作
- 页面动作：刷新后恢复最近评审结果，也用于后续查看历史评审。
- 查询参数：latest、status、page、size。
- 列表项至少包含 review_run_id、project_snapshot_id、provider_id、provider_version、status、deliverable_version_ids、created_at、finished_at。

### FE-REVIEW-003 发起评审

- 方法与路径：POST /projects/{project_id}/review-runs
- 状态：已存在
- 页面动作：点击“基于冻结快照运行评审”。
- 请求：provider_id、provider_version、project_snapshot_id、deliverable_version_ids。
- 响应：review_run_id、task_id、project_snapshot_id、status。

### FE-REVIEW-004 评审详情

- 方法与路径：GET /review-runs/{review_run_id}
- 状态：已存在
- 页面动作：展示提升建议、评分摘要、证据和执行状态。
- 响应继续使用 ReviewRun、ReviewFinding、ReviewSummary 和 evidence_refs 结构。

### FE-REVIEW-005 保存编辑建议

- 方法与路径：PUT /review-runs/{review_run_id}/findings/{finding_id}/suggestion-override
- 状态：待新增
- 页面动作：点击“编辑建议”，修改后点击“保存”。

请求字段：suggestion、expected_override_revision_id。首次保存时 expected_override_revision_id 为 null；后续编辑使用评审详情返回的当前 override revision。响应至少包含 override_id、revision_id、effective_suggestion、updated_by、updated_at。

刷新后读取评审详情时，前端需要同时获得 original_suggestion、effective_suggestion，以及可为空的 suggestion_override 对象。原始 Provider suggestion 与用户 override 必须是两个不同字段，避免前端无法区分原始结论和人工修改。

建议筛选、编辑弹窗开关、输入校验和取消编辑均为前端行为，不需要接口。

## 12. 报价分析与历史报价

### FE-QUOTE-001 恢复项目报价测算

- 方法与路径：GET /projects/{project_id}/quote-calculations
- 状态：待新增
- 页面动作：进入报价分析页或刷新后恢复最近测算。
- 查询参数：latest、status、page、size。
- 返回 calculation_id、project_snapshot_id、status、algorithm_version、created_at；latest=true 时可直接返回完整 QuoteCalculation。

### FE-QUOTE-002 历史报价查询

- 方法与路径：GET /quotes/history
- 状态：已存在，需扩展
- 页面动作：历史报价查询页、报价分析页可比样本表。

查询参数至少包括：material_name、material_code、spec、tenderer、region、year_from、year_to、page、size。

样本除现有字段外，页面还需要：project_name、package_name、quantity、tax_rate、source_label、parameter_difference、similarity、usable、excluded_reason。

响应继续返回 read_only=true、provider_id、provider_version、query_snapshot_id、source_updated_at、samples、total、page、size、normalization_warnings，并增加统计摘要 statistics。

`read_only=true` 是强制数据边界，不只是 UI 提示。前端、业务后端和文档编辑服务都不得获得外部历史库的
POST/PUT/PATCH/DELETE 通道；样本修订只能在外部数据源自身完成，下一次查询以新的不可变快照反映结果。

statistics 至少包含 count、min_price、max_price、median_price、average_price、latest_price、recent_change_rate。

### FE-QUOTE-003 历史样本详情

- 方法与路径：GET /quotes/history/{sample_id}
- 状态：已存在，需扩展详情字段
- 页面动作：点击历史报价项目名称进入详情。

### FE-QUOTE-004 物料历史趋势摘要

- 方法与路径：GET /quotes/materials/{material_code}/history-summary
- 状态：待新增
- 页面动作：历史报价详情中的折线图、统计卡片和可比样本表。

查询参数可携带 query_snapshot_id、spec、region、year_from、year_to。响应至少包含 material、statistics、trend_points、comparable_samples。

### FE-QUOTE-005 执行报价测算

- 方法与路径：POST /quotes/calculations
- 状态：已存在
- 页面动作：取得项目输入后执行报价测算。
- 请求继续使用 project_snapshot_id、material_ref、cost、min_profit_rate、currency、tax_included、unit。

### FE-QUOTE-006 报价测算详情

- 方法与路径：GET /quotes/calculations/{calculation_id}
- 状态：已存在，需扩展测算依据
- 页面动作：报价分析页展示推荐策略、价格范围、依据明细和趋势。

CalculatedQuote 建议增加前端展示字段：basis_metrics、trend_points、comparable_sample_ids。basis_metrics 至少覆盖历史中位数、近半年均价、地区均价、同规格均价、时间调整、地区调整、规格调整、成本、最低毛利、投标上限和公式说明。

### FE-QUOTE-007 应用报价策略

- 方法与路径：POST /quotes/calculations/{calculation_id}/apply
- 状态：已存在
- 页面动作：确认“应用到报价单并生成新版本”。
- 请求：strategy_id、expected_version_id、confirmed=true。
- 响应：deliverable_id、new_version_id、audit_log_id。成功后前端跳转或刷新新的报价单版本。

表格中“数量 × 用户报价”和当前总价可在浏览器即时预览，不需要每次输入都调用接口。保存后的正式金额以新报价版本接口返回值为准。

数量、单价、税率、金额和比例在接口中均使用十进制定点字符串，并明确币种/精度。浏览器不得把 IEEE 754
浮点结果作为正式请求的权威总价；服务端忽略或仅校验客户端行金额与总价，由 QuoteEngine 基于允许编辑的输入、
冻结历史样本和算法版本重新计算。

## 13. Word/Excel 在线预览编辑

完整的 P0/P1 能力分层见
[`docs/product/ONLINE_EDITOR_CAPABILITIES.md`](../product/ONLINE_EDITOR_CAPABILITIES.md)，生产联调流程见
[`FRONTEND_INTEGRATION.md`](./FRONTEND_INTEGRATION.md)。

### FE-EDITOR-000 当前网页 P0 工具

当前技术标/商务标支持本地草稿、常用文字和段落格式、撤销/重做、查找替换、批注、缩放和保存状态；还支持
可编辑目录、标题与目录同步、点击目录定位和页面预览。报价单支持单元格定位、用户报价校验、行增删复制、排序
筛选、冻结表头、工作表切换、建议价确认与即时合计。这些操作在浏览器内完成，不需要业务接口，草稿按
`enterprise_id + user_id + project_id + deliverable_type + version_id` 隔离。报价历史价和算法建议价只读，只有明确允许的用户报价字段可编辑。

“AI针对性修改”按钮也是浏览器内交互：Word 使用当前选区，报价表使用当前单元格或整行，将其转为纯文本上下文
写入页面底部项目助手输入框并聚焦，供用户补充要求。该动作不自动提交、不发起网络请求、不直接修改正文或表格，
也不调用 FE-EDITOR-004～006；项目助手接口未接入时发送按钮必须禁用。

当前实现不直接修改 `docx`/`xlsx` 二进制文件，不保证复杂格式、公式、分页、批注和修订的原生保真，也不提供
服务端共同编辑或正式版本历史。只有接入文档服务并完成以下会话、回调与新版本闭环后，页面才能宣称支持原生
Office 在线编辑。浏览器 localStorage 保存成功不得显示为“云端已保存”。

### FE-EDITOR-001 创建编辑会话

- 方法与路径：POST /projects/{project_id}/deliverables/{deliverable_type}/versions/{version_id}/editor-sessions
- 状态：待新增；FRONTEND_INTEGRATION.md 已有草案
- 页面动作：点击“预览文件”后打开可编辑的 Word/Excel 页面。

请求字段：

| 字段 | 类型 | 必需 | 说明 |
|---|---|---:|---|
| mode | edit / comment / review | 是 | 期望模式；服务端按用户真实权限收敛，不能据此提权 |
| expected_version_id | string | 是 | 必须与路径 `version_id` 一致，作为乐观并发基线 |
| client_capabilities | object | 否 | 浏览器声明 autosave/comments/review 等能力，只用于协商 |

响应 data：session_id、provider、document_type、mode、permissions、editor_url 或 editor_config、expires_at、
status、autosave。`permissions` 至少明确 `edit`、`comment`、`review`、`download`；`autosave` 至少明确
`enabled` 和 `interval_seconds`。

权限语义：`edit` 可修改工作副本；`comment` 只能新增/回复/解决批注；`review` 只能创建修订以及执行被授权的
接受/拒绝操作。服务端必须逐请求校验，隐藏工具栏不能作为权限控制。

前端不需要供应商保存回调凭据。公开响应和浏览器可见的 `editor_config` 不得返回 `callback_token`、对象存储
密钥、内部回调地址或可复用服务凭据；编辑器的服务端回调不属于网页接口。

### FE-EDITOR-002 查询编辑状态

- 方法与路径：GET /editor-sessions/{session_id}
- 状态：待新增
- 页面动作：显示 `opening | editing | autosaving | saving | saved | conflict | failed | expired` 状态。

响应还需包含 source_version_id、expected_version_id、has_pending_changes、last_autosaved_at、last_saved_at、
可选 checkpoint_revision_id。saved 时必须包含 new_version_id，前端据此刷新地址或跳转到新版本。失败时返回
error.code、error.message、error.retryable 和可选 retry_after_seconds。

“自动保存成功”表示服务端已持久化会话检查点，不能只表示浏览器本地存储成功。检查点不得覆盖源成果版本；
保存固化后必须生成不可变的新版本。

### FE-EDITOR-003 完成编辑

- 方法与路径：POST /editor-sessions/{session_id}/complete
- 状态：待新增
- 页面动作：点击保存/完成编辑。
- 请求：expected_version_id，可选 client_save_token。
- 响应：session_id、status、task_id 或 new_version_id。

请求头必须携带 `Idempotency-Key`；网络重试复用原幂等键。服务端保存前再次校验 expected_version_id，成功后
生成新成果版本和审计记录，旧版本继续可读。若基线已变化，返回 `409 VERSION_CONFLICT`，details 至少包含
expected_version_id、current_version_id、session_id、recoverable=true；保留检查点并让用户选择打开最新版、保存
为副本或导出，不得自动覆盖。

编辑器内部的文字输入、单元格输入、撤销、重做、字体、字号、加粗、斜体、下划线、查找替换、缩放和工作表
切换不需要业务接口。

文档服务保存回调只能调用业务后端内部地址。后端校验供应商签名、时间戳、随机数、会话归属、内容哈希、文件
类型/大小并防重放，以 provider_event_id 幂等处理；浏览器只查询公开会话状态。重复回调不得重复生成版本。

浏览器仅对网络错误、429、502、503、504 或 `retryable=true` 做带抖动的指数退避，并遵守 Retry-After；400、
401、403、404、409 和 retryable=false 不自动重试。409 必须进入显式冲突处理。

### FE-EDITOR-004 生成 AI 修改建议

- 方法与路径：POST /editor-sessions/{session_id}/suggestions
- 状态：待新增；只用于用户主动发起的生产 AI 修改，上下文填充动作不调用
- 页面动作：用户选择范围、输入明确指令后点击“生成建议”。
- 请求：selection_ref 或结构锚点、instruction、expected_version_id、expected_document_revision_id。
- 响应：suggestion_id、status、task_id、created_at；不得直接修改文档。

### FE-EDITOR-005 查询建议与差异

- 方法与路径：GET /editor-sessions/{session_id}/suggestions/{suggestion_id}
- 状态：待新增
- 页面动作：在差异预览中逐条查看建议。
- 响应：status、changes、before/after 摘要、evidence_refs、warnings、model_or_rule_version。

差异必须可定位到当前文档修订；锚点失效、依据不属于冻结快照或版本已经变化时失败关闭，要求重新生成。

### FE-EDITOR-006 确认应用 AI 建议

- 方法与路径：POST /editor-sessions/{session_id}/suggestions/{suggestion_id}/apply
- 状态：待新增
- 页面动作：用户勾选变更项并确认应用。
- 请求：confirmed=true、change_ids、expected_version_id、expected_document_revision_id。
- 响应：new_document_revision_id、applied_change_ids、audit_log_id。

生产 AI 流程必须是“生成建议 → 差异预览 → 用户确认应用”。生成、查看、应用、部分应用、拒绝和撤销都要记录
操作者、时间、源版本、选区哈希、指令、变更项、模型/规则版本和结果；不得记录模型思维链或内部凭据。comment
权限只能写入批注，review 权限只能形成待接受/拒绝的修订，只有 edit=true 且用户确认后才能直接应用到工作副本。

当前网页只完成编辑器选区/单元格到项目助手输入框的上下文交接，不代表生产 AI 已接入。真正执行修改时仍必须
使用上述建议接口闭环。

## 14. 项目助手

项目概览、材料、评审、报价和成果编辑页面底部都显示项目助手输入框。接口未接入前发送按钮必须禁用，输入框仍可
接收用户输入，以及成果编辑器“AI针对性修改”传入的纯文本上下文。

点击“AI针对性修改”只填入并聚焦输入框，不能自动调用以下接口。用户可以继续补充、删改上下文；接口接入后也
只有用户主动点击发送才允许发起请求。

### FE-ASSISTANT-001 发送消息

- 方法与路径：POST /projects/{project_id}/assistant/messages
- 状态：待新增；接入前发送按钮禁用
- 页面动作：输入问题后点击“发送”。

请求字段：content、可选 conversation_id、current_route、project_snapshot_id、deliverable_version_id、uploaded_material_ids。

编辑器带入的选区/单元格/整行上下文只是 `content` 中可由用户继续编辑的纯文本；填入时不创建消息，只有用户主动
发送后才随 content 上传。前端不得在后台另行上传选区。

响应字段：conversation_id、user_message_id、assistant_message_id、status、stream_url。

### FE-ASSISTANT-002 回答流

- 方法与路径：GET /assistant/messages/{message_id}/stream
- 状态：待新增；发送接口未接入时不建连
- 页面动作：逐步显示回答和引用。

公开事件类型至少包含 message.delta、message.citation、message.completed、message.failed。citation 使用可校验的 evidence_ref。流中不允许返回内部推理、工具参数、凭据或原始模型响应。

### FE-ASSISTANT-003 会话历史

- 方法与路径：GET /projects/{project_id}/assistant/messages
- 状态：待新增
- 页面动作：刷新后恢复项目会话。
- 查询参数：conversation_id、before、size。

附件文件仍先通过项目材料上传接口写入当前项目，再在消息中引用 material_id；项目助手接口不接受第二套文件上传入口。

## 15. 无需业务接口的前端交互

以下操作不需要新增业务接口：

- 企业资料/当前招标材料页签切换。
- Requirement、项目快照和材料页签切换。
- 弹窗打开、关闭、取消及焦点管理。
- 密码显示与隐藏。
- 已加载数据范围内的临时筛选和排序。
- 评审建议输入框的本地编辑、空值校验和取消。
- 报价单单元格即时计算与总价预览。
- 在线编辑器内部的排版、撤销、重做、查找替换、可编辑目录、标题同步、目录定位、页面预览和工作表切换。
- 把 Word 当前选区或报价表当前单元格/整行的纯文本上下文写入项目助手输入框并聚焦；该动作不自动发送。
- 版本标签、风险标签、评分环和静态图表渲染。
- 工作台“新建资料”区、三张仪表盘卡片和下方表格的同宽网格布局。
- 根字号、行高、控件最小尺寸、断点换行和浏览器缩放下的响应式适配。
- 新建项目截止时间控件的日历弹层定位、日期/时间选择、键盘操作和关闭行为；只有提交后的
  `deadline_at` 才进入 `POST /projects`。

通知、注册和忘记密码目前未形成完整可用流程，标记为暂不接入，不应为静态或禁用控件提前定义接口。当前
“AI针对性修改”只完成编辑器上下文到项目助手输入框的交接，不调用 FE-EDITOR-004～006；接入生产 AI 后必须
使用该接口组并执行差异预览、用户确认和审计。账户菜单本身由前端实现，但其中的“退出登录”必须调用
`POST /auth/logout`，不属于暂不接入项。

## 16. 前端联调验收清单

### 16.1 页面加载与刷新

- 未登录直接打开 `/login` 能看到登录表单，不会被默认 Mock 会话跳过。
- 左下角用户信息能够打开账户菜单；退出后清空当前企业缓存并回到登录页。
- 登录后刷新任意路由能够恢复 session。
- 直接打开项目材料、评审、报价或成果版本 URL 能重新取得项目上下文。
- 新建项目后刷新仍能在列表中看到项目。
- 上传文件、确认 Requirement、编辑评审建议、应用报价策略后刷新状态不丢失。
- 正在执行的任务刷新后仍能在任务抽屉中找到并继续接收事件。

### 16.2 数据范围

- 工作台企业资料页签读取和上传都只调用企业资料接口；企业资料库与工作台复用同一企业域数据源。
- 工作台企业资料页签和企业资料库任一处上传成功后，两处列表及统计同步刷新。
- 企业资料上传绝不增加项目材料数量，也不写入项目材料 revision、事件链或快照。
- 项目“当前招标材料”页签及项目补充材料入口只调用项目材料上传接口。
- 企业资料库上传按钮和工作台企业资料上传按钮都只调用企业资料上传接口。
- 一个项目的材料、快照、任务、评审、报价和成果不能出现在另一个项目页面。

### 16.3 成果与编辑

- 只有项目拥有的真实 version_id 才能打开编辑页。
- 当前浏览器 Mock 的编辑、撤销/重做、查找替换、缩放、批注、表格行操作和报价重算均可真实操作；刷新只恢复
  当前 `enterprise_id + user_id + project_id + deliverable_type + version_id` 的本地草稿，不串用其他账号、企业或成果。
- Word 目录可编辑；正文标题变化后目录同步，点击目录能定位对应内容，页面预览可切换且不破坏编辑内容。
- 网页 Mock 不修改 docx/xlsx 二进制；下载源文件时不会把本地草稿错误标记为已更新的 Office 文件。
- 原生文档服务分别以 edit、comment、review 权限创建会话时，服务端和工具栏操作都符合权限范围；篡改 mode、
  editor_config 或请求体不能越权。
- 创建会话的响应与浏览器网络记录中不存在 callback_token、对象存储密钥、内部回调地址或可复用服务凭据。
- 自动保存只在服务端检查点持久化后显示成功；本地缓存、断网或回调失败不会误报为云端已保存。
- 保存 Word/Excel 后返回新 version_id，旧版本仍能查询；重复 complete 请求和重复供应商回调不会生成重复版本。
- expected_version_id 已过期时返回 409 并保留可恢复检查点，不覆盖新版本，也不自动把基线切换到最新版。
- 下载文件名、类型和版本与页面选中的成果一致。
- 点击“AI针对性修改”后，Word 当前选区或报价表当前单元格/整行的纯文本上下文写入页面底部项目助手输入框并
  聚焦；不自动发送、不产生网络请求、不直接修改正文/表格。项目助手接口未接入时发送按钮禁用。
- 生产 AI 建议先生成候选差异，用户可选择变更项；未经确认不修改文档，应用后能取得 audit_log_id，并能审计
  生成、查看、应用/拒绝/撤销全过程。
- 报价单保存后以接口返回金额为准，浏览器预览值不作为最终结果；金额字段以定点字符串传输，服务端确定性复算。
- 历史报价、报价历史价和算法建议价在报价分析、报价单工作表和文档服务中始终只读，不存在新增、修改或删除
  外部样本/只读字段的请求；确认应用建议价只写入用户报价字段。

### 16.4 错误与重试

- 401 跳转登录并保留原目标地址。
- 多个并发 401 只触发一次缓存清理与跳转；登录失败的 `INVALID_CREDENTIALS` 留在登录页。
- 404 显示项目或成果不可访问，不加载默认 Demo 内容。
- 409 提示数据已更新，允许刷新到最新 revision/version。
- 编辑会话的 409 不自动重试；页面提供打开最新版、保留副本或导出检查点等明确恢复动作。
- 保存/状态查询仅对网络错误、429、502、503、504 或 retryable=true 退避重试，并遵守 Retry-After；complete
  重试复用同一 Idempotency-Key。
- 会话 failed/expired 时区分是否存在服务端检查点；没有检查点时不得展示“已保存”或虚构可恢复版本。
- 新建项目的 `deadline_at` 缺失、格式/时区错误或非未来时间均能映射到截止时间字段提示；日期时间控件
  打开、选择、键盘操作及关闭不触发无关接口。
- 可重试任务错误展示重试入口；不可重试错误展示明确原因。
- SSE 断线可以凭 Last-Event-ID 续传，重复事件不会重复显示。

### 16.5 响应式与页面适配

- 工作台“新建资料”区、三张仪表盘卡片和下方表格在同一内容网格内对齐，桌面宽度一致。
- 在常见桌面、平板和窄屏宽度下，正文与控件字号可读，布局无横向遮挡，表格在必要时提供自身滚动。
- 浏览器缩放到 125% 和 150% 时，导航、弹窗、日期控件、卡片和表格仍可操作，主要按钮不被裁切。
- 上述布局、字号和断点验收不新增后端接口，也不改变接口响应字段。

## 17. 文档维护要求

本文件是前端需求清单，不代表接口已经上线。接口确认后需要同步：

1. docs/api/openapi.yaml。
2. src/shared/api 下的运行时 Schema 和请求封装。
3. src/mocks 下的 fixtures 与 handlers。
4. Contract 测试和页面集成测试。

页面新增、删除或改变用户动作时，应先更新本文件中的“页面与接口总表”，再调整正式 OpenAPI 契约。
