# 招标公告网址导入接口需求

状态：前端 UI、client 与契约测试已在 `codex/tender-notice-url-import` 完成；后端接口尚未进入正式后端仓库，本文件作为后端实现需求与验收契约。

## 目标

用户可在“当前招标材料”中粘贴公开招标公告网址，由服务端安全抓取公告正文与可下载附件，解析后以项目材料写入当前 `project_id`。该流程不得写入企业资料库，也不得由浏览器直接跨域下载。

## 1. 创建网址导入任务

`POST /api/v1/projects/{project_id}/tender-notices/import-url`

请求头：

- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

请求体：

```json
{
  "url": "https://example.gov.cn/bidding/notice/123"
}
```

成功响应：`202 Accepted`。建议直接进入后台任务并返回 `queued`；若后端首版在请求内完成抓取，也必须保持相同返回模型并返回 `succeeded` 或 `failed`，便于后续无破坏迁移到队列。

```json
{
  "import_id": 901,
  "project_id": 18,
  "source_url": "https://example.gov.cn/bidding/notice/123",
  "status": "queued",
  "task_id": 1302,
  "file_ids": [],
  "error": null,
  "created_at": "2026-08-14T01:30:00+08:00",
  "updated_at": "2026-08-14T01:30:00+08:00"
}
```

## 2. 查询导入任务

- `GET /api/v1/projects/{project_id}/tender-notices/imports`
- `GET /api/v1/projects/{project_id}/tender-notices/imports/{import_id}`

列表响应为 `{ "items": TenderNoticeImportJob[] }`；详情响应为单个 `TenderNoticeImportJob`。

状态枚举：`queued | fetching | parsing | succeeded | failed`。

成功时 `file_ids` 返回已归入该项目的 `file_object.id`。这些文件必须同时出现在：

`GET /api/v1/files?target=project&project_id={project_id}`

## 服务端安全与行为要求

1. 只允许 `http`、`https`，拒绝 URL 用户信息、非标准危险端口、localhost、环回、链路本地、私网、保留地址和云元数据地址。
2. 每一次 DNS 解析及每一次重定向都重新执行 SSRF 校验；限制重定向次数，防止 DNS rebinding。
3. 设置连接/读取超时、最大响应体、最大附件数量与单附件大小；只接受白名单 MIME/扩展名。
4. 下载内容经过现有病毒扫描、文件类型校验和配额检查，失败关闭；不得把响应头文件名直接当存储路径。
5. 公告网页正文应保存为可解析的项目材料；同页附件分别落为项目文件，保留 `source_url`、最终 URL、抓取时间、内容哈希和来源标题。
6. 任务及文件严格校验 `enterprise_id -> project_id` 归属；跨租户/跨项目统一返回 404。
7. 建议接受幂等键或按 `project_id + normalized_url + content_hash` 去重；重复提交不得生成无限副本。
8. 抓取器使用受控 User-Agent，遵循产品允许的数据来源策略，并保留审计记录。
9. 错误使用可展示的稳定错误码，例如 `URL_BLOCKED`、`FETCH_TIMEOUT`、`UNSUPPORTED_CONTENT`、`ATTACHMENT_TOO_LARGE`，不要向前端泄露内网地址、堆栈或抓取凭据。

## 与既有接口的关系

- 手动上传继续使用 `POST /api/v1/files/upload`，multipart 参数为 `target=project`、`project_id`、`files`。
- `/search-sources` 目前只保存网址元数据，不下载正文或附件，不能替代本接口。
- `/files/archive` 已支持已上传的 ZIP/RAR/7Z，但只负责压缩包展开，不能替代网页抓取。

## 后端验收清单

- [ ] 新增导入任务持久化模型与列表/详情审计入口。
- [ ] 文件来源元数据保存来源网址、最终网址、标题、抓取时间和内容哈希。
- [ ] HTML 正文保存为当前项目可解析文本，同源公开附件分别进入项目文件处理链。
- [ ] 对每次 DNS 解析及重定向做 SSRF 校验，并固定连接到校验后的 IP，防止 DNS rebinding。
- [ ] ZIP/RAR/7Z 在写出内容前校验路径、链接、条目数量、总体大小、压缩比及目录深度；解压过程本身受磁盘、内存、CPU 和时间配额限制。
- [ ] 缺少系统解包工具或触发资源上限时返回稳定错误码，不留下半成品项目材料。
- [ ] 使用提供的真实 RAR 招标公告样本完成“导入 → 解包 → 材料列表可见 → 解析状态可恢复”的验收。
