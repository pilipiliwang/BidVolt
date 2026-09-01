# 最新后端重新对接结果与剩余缺口（待审核）

> 用途：供前端负责人/产品负责人审核。本文件不是 GitHub Issue，本次也不会自动向后端提交 Issue。

## 1. 核对基线

- 核对时间：2026-09-01（Asia/Shanghai）
- 前端仓库：`C:\Users\67303\Documents\AI电网投标助手`
- 前端分支：`codex/backend-main-reintegration`
- 后端仓库：`zhangsheng377/BidVolt`
- 后端 `main` 最新提交：[`d3ee77248e42fb4061912be1e744aa62c14c0806`](https://github.com/zhangsheng377/BidVolt/commit/d3ee77248e42fb4061912be1e744aa62c14c0806)
- 在线 OpenAPI：`http://47.100.182.3:28123/openapi.json`
- 后端前端对接说明：`docs/前端对接接口文档.md`

`b0eab472...d3ee772` 共 9 个提交，只修改了 `app/services/agent_pipeline.py`、`app/services/assembly_service.py`、`app/db.py`，用于 Agent 写作、打包门禁和数据库稳定性；没有变更公开 API 路径或前端 DTO。因此本轮前端按 `d3ee772` 作为最新基线，接口契约仍与此前已核对的公开文档兼容。

在线 OpenAPI 目前只暴露服务版本 `0.1.0`，没有 build SHA/commit SHA。可以证明所需路径在线存在，但不能仅凭 OpenAPI 严格证明线上部署进程已运行 `d3ee772`。

## 2. 已完成的前端重新对接

### 2.1 Agent 成果生成主流程

- 主入口已由旧 `POST /projects/{id}/tasks` 切换为 `POST /projects/{id}/agent-run`。
- 已接状态：`GET /projects/{id}/agent-run/{taskId}`，按后端数字状态和 `result.outcome` 区分完成、未闭环、可重试失败、取消。
- 已接实时会话：`GET .../stream?since=N`，使用独立 `message/end` SSE 解析器，支持 `seq` 续传、断流失败记录和 8 秒状态轮询兜底。
- 已接客户问卡：questions、answer、倒计时、超时后补答、行动清单。
- 已接运行中/终态对话：chat 的 `queue/steer` 和任务前 `pre-chat`。
- 已接未闭环续跑：提交 `resume_from_task_id`，并保留会话上下文。
- 已接最终成果包：任务允许下载时调用 `GET /projects/{id}/response-package`。
- SSE 或轮询进入终态后会清理任务快照缓存并刷新成果、评分、评审和任务数据，不要求用户手工刷新。

旧 task 列表仍只用于兼容恢复历史任务；新成果生成不再创建 `bid_generate/bid_review` 任务。

### 2.2 项目材料、企业资料和压缩包

- 三类上传均传真实 `document_role`：当前招标材料、补充资料、已完成标书。
- 新上传 ZIP 直接使用 `/files/upload` 的自动展开结果，不再二次调用 `/files/archive`。
- 企业资料上传使用后端自动创建 asset/自动 ingest，不再重复调用 `/enterprise/ingest`。
- 已适配上传回执中的 imported、duplicates、failed 和 ZIP 部分失败提示。
- 文件大小统一到后端上限 500 MB；RAR/7z 按后端能力明确提示暂不支持。
- 项目材料同时读取 `/files` 与 `/files/projects/{id}/materials`，展示真实解析状态、文本块和压缩包来源。
- `/files` 已按 `total/page/size` 自动完整分页，不再只读前 100 份文件。
- ZIP 子文件缺少持久化角色时，前端会沿 `source_archive_id` 链继承根压缩包角色；这是兼容补偿，不会按文件名猜分类。
- 后台图片识别进度每 30 秒读取 `/files/image-describe-progress`；运行中和全部完成都使用后端真实计数。

### 2.3 招标公告网址导入

- POST 继续使用 `/projects/{id}/tender-notices/import-url`。
- 返回值改为最新字段：`tender_notice_id`、整数状态 `1/2/3`、`file_id`、`error_code/error_message`。
- 轮询已改为列表 `/tender-notices` 和详情 `/tender-notices/{noticeId}`，不再请求已删除的 `/imports/*` 路径。
- 刷新项目页后会从后端导入记录恢复尚未完成的公告任务。

### 2.4 Requirement、评审和报价

- Requirement 确认已使用 `PUT .../confirm`，并提交 `expected_revision`。
- Requirement 纠正已使用 `PUT .../correct`，保存人工修订内容并提交 `expected_revision`。
- 确认/纠正均有 pending、防重复、CAS 冲突错误提示和可重试状态。
- Requirement DTO 已接 `supersedes/confirm_status/confirmed_at`。
- 评审执行会提交后端返回的数字 `provider_id`。
- 评分 DTO 已接 `snapshot_id/scale/full_marks/got_marks`；没有评标时，后端约定的 `404 {detail:"尚未评标"}` 被识别为“正常空态”，其他 404/5xx 仍是失败。
- 报价历史已适配最新的 `package_name/publish_date/source/price_mode/limit_price/win_price` 等字段，不使用 Mock 回退。
- 后端 `apply` 目前固定应用 `win`，前端只允许安全的中标优先策略写入；平衡型/利润型不会被伪装成已应用。

### 2.5 成果、导出与编辑安全

- Agent 主流程以 `response-package` 作为正式交付边界。
- 已补齐终检、旧导出任务、交付包、单项 Agent artifact、行情导入/详情/趋势/AI 建议等最新客户端契约及测试目录。
- 复杂成果模型包含表格、未知节点或额外元数据时，当前编辑器切换为只读并允许下载原文件，避免保存时重建简化模型造成数据损坏。

### 2.6 API 联调测试框

- 项目页会列出当前页面涉及的新 Agent、材料、Requirement、评审、报价、终检和导出接口。
- 运行时真实捕获方法、路径、次数、时间、耗时和结果；分页请求和兼容任务列表都能归入已知接口，不再显示为“清单外请求”。
- “尚未评标”404 显示为正常空态，不再把空项目误报成接口故障。
- Agent SSE 的状态覆盖到流消费结束；收到 200 headers 后若协议错误或提前断流，调试框仍会记录失败。
- 测试框只在开发/显式开启时显示，正式构建可整体隐藏。

## 3. 真实后端页面验证

使用真实登录会话（企业 `#53`）通过本地后端模式页面完成读取链路验证，并创建隔离测试项目：

- 项目 ID：`203`
- 项目名称：`前端最新接口联调-20260901`
- 项目页：`http://127.0.0.1:4173/projects/203/materials`

已实际验证的读取链路包括：项目详情、完整项目文件列表、项目材料解析详情、Requirement、快照、招标公告导入记录、兼容任务列表、成果列表、评审记录、评分正常空态、报价列表和后台图片识别进度。页面没有回落到本地预览数据，控制台没有业务运行错误。

测试项目没有上传业务文件，因此没有主动启动 Agent 生成任务；本轮不把“OpenAPI 存在”写成“Worker 已成功生成成果”。项目 203 是联调数据，未在未授权情况下删除或归档。

## 4. 后端仍缺少或契约仍不足

以下项目不能由前端猜测或 Mock 补齐：

| 缺口 | 当前影响 | 前端当前处理 |
|---|---|---|
| RAR/7z 解包 | 后端明确只支持 ZIP 自动展开 | 选择器和文案只承诺 ZIP，RAR/7z 给出真实不支持提示 |
| 找回密码接口 | 没有 `POST /auth/forgot-password` | 不伪造发送成功 |
| 项目终检 latest/list | 只有 POST check 和按 checkId GET | 当前会话可查；刷新丢失 checkId 后无法恢复最近终检 |
| 企业资料历史修订内容 | 有 revisions 列表但没有稳定的历史内容读取接口 | 可展示版本记录，不能还原任意历史正文 |
| 线上运行 commit SHA | health/OpenAPI 不返回部署 SHA | 调试框能证明真实接口成功，不能证明部署 commit 与 GitHub main 完全一致 |
| ZIP 子文件角色持久化 | 递归展开没有把根文件 `document_role` 写到每个子文件 | 前端通过 archive ancestry 补偿；其他 API 消费者仍可能拿到空角色 |
| 评分分项稳定字段 | 未稳定提供商务分、技术分、报价分、否决项数量 | 页面不推算、不 Mock，仅显示后端明确返回的指标 |
| 报价 apply 策略参数 | apply 固定读取 `strategy_results.win` | 只开放 win；balance/profit 禁止误写 |
| 编辑租约恢复/接管 | session list/get 不返回可恢复 lease token | 刷新或并行标签下保持安全只读 |
| 病毒扫描器健康状态 | health 未暴露 scanner 可用性/降级状态 | 上传错误如实显示，但页面无法提前显示扫描服务状态 |

另有两个契约质量问题：Agent SSE 的 OpenAPI 媒体类型仍不是准确的 `text/event-stream`；`response-package` 的 OpenAPI 响应也未准确声明 ZIP。前端已按真实运行响应处理，但自动代码生成仍无法依赖这两处 schema。

## 5. 有意不直连的后端内部接口

`/assembly/*`、Agent 创建 ask 的内部 POST 等属于 Agent/MCP 成文工具链，不是普通用户页面边界。前端以 `agent-run`、SSE、questions/answer/chat 和 `response-package` 作为产品接口，不把内部装配步骤逐个暴露给用户。

同理，`/files/{fileId}/image-descriptions` 和单项 artifact 下载客户端已准备，但只有在页面存在对应材料/产物 ID 和用户入口时才触发；不会为了让测试面板变绿而制造无业务意义的请求。

## 6. 验证清单

- 全量 Vitest：51 个测试文件、380 项测试全部通过
- ESLint：通过
- `build:backend`：通过（仅保留 Vite 主包约 600 kB 的体积提醒）
- 在线 OpenAPI：前端列入本次基线的 82 个必需 operation 已全部存在
- `git diff --check`：通过

## 7. 审核结论

前端主流程已按最新后端 Agent 逻辑重新对接，后端模式不会自动回退 Mock。本地只读预览仍是单独的 `local-preview` 开发模式，必须显式启动且所有写操作被阻止；`dev:backend/build:backend` 不会启用该数据。

本文件列出的剩余项先交由你审核；本次没有向后端提交任何 Issue。
