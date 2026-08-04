# BidVolt Web 前端开发计划

## 目标与边界

本仓库只交付浏览器端 Web 前端。MVP 覆盖项目工作台、企业资料、当前项目材料、外部评审和报价测算；不引入 Electron、桌面壳、原生客户端或后端执行代码。

四条产品边界作为发布门禁：

1. 企业资料仅通过企业专属入口上传，由 Agent 自动分类、抽取并保留人工纠正 revision。
2. 当前招标材料只写入对应 `projectId` 的事件与快照，不提供转存企业库的动作。
3. 外部评审统一建模为 `ReviewProvider`，浏览器不持有 Provider 凭据，也不直接执行外部代码。
4. 历史报价源只读；报价由带版本号的确定性 QuoteEngine 计算，数据不足时不输出价格。

## 并行分支

| 分支 | 工作内容 | 质量门禁 |
| --- | --- | --- |
| `codex/web-shell` | 响应式 AppShell、轻量 URL 路由、项目列表/概览、公开任务进度 | lint、RTL、build |
| `codex/data-contracts` | Zod/API client、MSW、OpenAPI、公开事件白名单 | contract test、OpenAPI 解析 |
| `codex/domain-pages` | 企业资料与项目材料两套独立页面及交互 | 隔离测试、RTL、build |
| `codex/review-pricing` | ReviewProvider 与只读历史报价/确定性策略 UI | 安全边界测试、RTL、build |
| `codex/web-mvp` | 汇总路由、项目级状态隔离、演示数据、CI 与全量验收 | 全量门禁 |

## 当前里程碑

- [x] 建立 React + TypeScript + Vite Web 工程基线。
- [x] 完成五类页面和可直接访问的浏览器路由。
- [x] 完成企业/项目上传入口的模型级和交互级隔离。
- [x] 完成 OpenAPI、Zod、MSW 和生成类型的一致性流程。
- [x] 完成基础 CI：lint、Contract、Vitest、生产构建。
- [x] 完成桌面浏览器视觉与关键交互验收。
- [ ] 接入真实鉴权、项目、上传、SSE、ReviewProvider 和 QuoteEngine 后端。
- [ ] 增加端到端测试环境、错误监控和正式部署流水线。

## 接口协作流程

任何接口变更必须同时更新：

1. `docs/api/openapi.yaml`
2. `src/shared/api` 的 Zod Schema 与调用方法
3. `src/mocks` 的 fixture/handler
4. Contract 与领域隔离测试

提交前运行：

```bash
npm run lint
npm run api:check
npm run test
npm run build
npm audit --audit-level=high
```
