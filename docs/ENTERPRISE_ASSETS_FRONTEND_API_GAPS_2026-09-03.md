# 企业资料库前端缺失接口清单

API 前缀：`/api/v1`

## P0

### 1. 企业资料重命名

- 建议接口：`PATCH /enterprise/assets/{asset_id}`
- 请求：`name`
- 响应：保存后的 `asset_id`、`name`、`updated_at`
- 前端用途：双击资料名称后保存，并同步刷新列表和详情。

### 2. 企业资料列表服务端分页

- 扩展接口：`GET /enterprise/assets`
- 查询参数：`page`、`size`、`q`、`category_id`、`source_kind`、`sort`
- 响应：`items`、`total`、`page`、`size`
- 列表项补充：`created_at`、`updated_at`、`source_kind`、`source_archive_id`、`archive_path`
- 前端用途：真实分页、搜索、分类筛选、更新时间展示，以及区分源压缩包和解包文件。

### 3. 自动归类结果与确认

- 扩展现有接口：`POST /enterprise/assets/{asset_id}/classify`
- 响应补充：`category_id`、`category_label`、`confidence`、`status`
- 新增确认能力：可新增确认接口，或扩展现有分类修改接口以同时保存分类和确认状态。
- 前端用途：展示真实归类结果，允许用户确认或纠正；归类需要支持正文、OCR 和压缩包路径，不能只按文件名判断。

## P1

### 4. 资料关键信息状态统一

- 涉及接口：企业资料详情、资料关键信息列表及纠正接口。
- 后端需要统一 `status` 枚举，至少明确：`待确认`、`已确认`、`已纠正`。
- 前端用途：正确展示资料关键信息状态，避免把低置信度数据显示成已确认或已纠正。

## 暂不需要新增

- 原件预览：已有文件下载和解析块接口。
- 原文件版本列表：已有 `GET /enterprise/assets/{asset_id}/revisions`。
- 通知中心：当前前端已移除通知入口。
