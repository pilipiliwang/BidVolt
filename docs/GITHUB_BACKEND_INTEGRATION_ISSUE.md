# [前后端联调总单] 补齐生产 API 契约、真实数据源与招标公告 URL 导入

## 背景与基线

前端已按 BidVolt 后端 `main@b70bd78` 的真实 `/api/v1` 路径、参数、裸 JSON 响应及 FastAPI `detail` 错误完成适配；后端已有能力由前端 client/adapter 消化，不要求为了前端再套统一 envelope。本文只列无法由浏览器可靠补齐、且会影响既有页面功能或生产真实性的后端事项。

- 前端仓库：`pilipiliwang/BidVolt`
- 前端分支：`codex/tender-notice-url-import`
- 后端仓库：`zhangsheng377/BidVolt`
- 后端审计基线：`b70bd78de1dc20fb34e347731f5f26f61abbc997`
- 联调日期：2026-08-14
- 完整逐项说明与验收标准：前端仓库 `docs/BACKEND_INTEGRATION_GAPS.md`

## P0：阻断联调或违反已确认产品边界

- [ ] **恢复联调 API 服务**：`http://47.100.182.3:28123/healthz` 当前 TCP 可连接但返回 `Empty reply from server`；经 Vite 代理登录得到 502。请给出可用 Base URL，并确保 health、OpenAPI、auth、multipart 上传返回有效 HTTP 响应。
- [ ] **招标公告 URL 安全导入**：实现项目范围的 `POST /projects/{project_id}/tender-notices/import-url`、导入列表和详情。正文及附件仅进入本次项目材料，绝不写企业资料库；逐跳防 SSRF/DNS rebinding，限制重定向、下载、附件和归档资源，保留来源与审计。
- [ ] **生产访问方案**：配置同源 `/api/v1` 反向代理或严格 Origin CORS 白名单，覆盖 Bearer、multipart、下载与预检。
- [ ] **企业身份**：`GET /auth/me.enterprise_name` 返回注册时落库的真实企业名称，而不是固定空字符串。
- [ ] **企业上传关联**：企业文件上传每个成功项返回 `file_id + asset_id`，并明确上传是否自动 ingest；不能要求前端通过并发不安全的列表差集猜测。
- [ ] **Requirement 用户确认/修正**：提供 confirm/correct 接口、expected revision、409 冲突和审计；不能让前端用 Agent 的 upsert 冒充用户确认。
- [ ] **报价数值契约**：金额/费率使用 Decimal 对应的字符串或明确最小货币单位，BIGINT ID 以字符串输出，统一舍入、币种、含税口径和算法版本。
- [ ] **禁止 AI 猜报价**：停用 `/quotes/ai-suggest` 的价格区间和 recommended 数字。正式报价只走确定性 calculate/recalc/strategies/apply；数据不足不得回退合成样本或 LLM。
- [ ] **冻结评审证据**：EvidenceRef 必须绑定并验证项目快照、成果/Requirement revision、content hash 和定位；校验失败的证据不能计入可解释得分。
- [ ] **评审 Provider 选择生效**：当前 `POST /projects/{id}/evaluate` 无 body，前端发送 `provider_id` 会被忽略。请使用明确 schema 接收并冻结 provider、版本、配置 hash、snapshot 与成果版本，非法/禁用/跨租户失败关闭。

## P1：完整页面功能、可靠性与真实数据

- [ ] 项目列表/详情补齐 `buyer`、服务端 `q` 搜索、准确分页及材料数/风险/评分/阶段等可解释摘要。
- [ ] Task SSE 提供浏览器可用鉴权、单调 event ID、心跳、`Last-Event-ID` 续传和 token 刷新后的单次重连。
- [ ] 为项目创建、上传批次、企业 ingest、成果保存、评审确认等写接口统一幂等键与 expected revision/version。
- [ ] 历史中标查询支持页面所需字段、服务端过滤/分页、币种/单位/含税可比性及只读来源快照。
- [ ] **用真实外部只读 Provider 替换 `MockHistoryPriceProvider`**：当前固定 8 条合成华东电缆样本不能进入生产页面；Mock 仅测试环境显式启用。
- [ ] 为项目文件保存 `document_role`（招标公告、招标文件、已完成标书、补充材料等），任务显式接收 mode 与输入材料 ID；刷新后不丢角色。
- [ ] ReviewRun/score 返回服务端计算的 `is_stale`、基准 snapshot/version 和过期原因，不能依赖单浏览器临时状态。
- [ ] 编辑器明确历史版本策略：历史版只读，或 create session 接收 `base_version_no` 并 CAS；下载按路由 version；提供安全的会话恢复/取消契约。
- [ ] 核心 API 用明确 Pydantic 模型替换自由 `dict`；在 CI 导出 OpenAPI 并做契约 diff。
- [ ] 企业资料列表增加分页、关键词、分类/状态过滤与稳定排序，避免全量列表加 N+1 详情。

## P2：一致性与安全回归

- [ ] 对 file、asset/fact、project/material/snapshot/task、deliverable/version/session、review、quote、export、conversation 全路径建立跨租户/跨项目 IDOR 自动化测试。
- [ ] FastAPI 错误保留可读 message，并增加稳定 `code`、`request_id`、可选 field errors；明确 401/403/404/409/413/422/429 场景。

## 真实 RAR 验收样本

已由产品方提供真实招标公告压缩包，前端只读核验通过：

- 文件：`【招标公告文件】虚拟电厂数据融合系统_完整采购文件_95307793016393648.rar`
- 大小：2,384,692 bytes
- SHA-256：`4D503EC0A8C070B938CBFB24E3185C455DEE2D6660F225944A8E60C77E1D7A82`
- 内容：采购公告、采购文件、技术规范、供应商须知、项目文件、合同条款等 9 个文件（含 DOC/DOCX/PPTX/SIGN）

联调服务恢复后请用该样本验收：上传 → 原包入库 → 安全解包 → 材料解析 → 项目列表/详情刷新恢复。逐文件失败必须返回具体错误；失败不得显示成功或留下不可审计的半成品。样本文件本身不上传到 GitHub Issue。

## 完成定义

1. 以上 P0 全部通过自动化与浏览器 E2E；P1 有明确里程碑和稳定 OpenAPI。
2. 企业资料与本次项目材料严格分域；所有跨租户/项目访问失败关闭。
3. 页面刷新/深链后使用服务端真实状态恢复，不依赖前端 Mock 或临时内存冒充持久化。
4. 后端返回 `insufficient_data` 时，前端不显示建议价、区间或推荐价。
5. 提供可访问联调地址后，前端使用真实账号和上述 RAR 完成端到端复测。
