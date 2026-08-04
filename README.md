# BidVolt Web

BidVolt 的独立 Web 前端仓库。这里只维护浏览器端页面、前端领域模型、Mock 服务、接口契约和测试；不包含 Electron、桌面客户端、原生移动端或后端实现。

## 产品边界

- 企业资料库仅保存企业长期、跨项目复用的资料，由 Agent 自动分类并允许用户纠正。
- 当前招标材料只属于对应项目和工作台快照，不能进入企业资料库。
- 外部评审通过后端 `ReviewProvider` 交互，浏览器不直接保存凭据或执行第三方代码。
- 历史报价源只读，报价数字由确定性算法计算；数据不足时不使用 AI 猜价。

## 本地开发

```bash
npm install
npm run dev
```

常用检查：

```bash
npm run lint
npm run test
npm run build
npm run api:check
```

开发默认使用 `VITE_API_MODE=mock`。真实接口根地址通过 `VITE_API_BASE_URL` 配置。

当前页面数据使用显式的演示 Session，并按 `enterpriseId + projectId` 分区保存；全局页面不会隐式继承“上一次项目”。真实后端接入时，认证与租户/项目资源归属校验仍必须由服务端完成。

## 当前 Web MVP

- `/projects`：项目列表、搜索与阶段筛选。
- `/projects/:projectId/overview`：项目工作台、项目快照边界与公开任务进度。
- `/projects/:projectId/materials`：当前招标材料、解析状态、Requirement 确认与冻结快照。
- `/enterprise-assets`：企业专属上传、Agent 自动分类、字段纠正与版本记录。
- `/projects/:projectId/review`：API、沙箱代码、规则引擎和文档规则四类 ReviewProvider。
- `/projects/:projectId/pricing`：外部历史价格只读查询与确定性 QuoteEngine 策略确认。

应用是纯浏览器端 React/Vite 项目，使用 History API 的轻量路由，不包含 Electron、桌面壳或原生客户端代码。

## 接口契约

- OpenAPI：[`docs/api/openapi.yaml`](docs/api/openapi.yaml)
- 协作约定与安全边界：[`docs/api/README.md`](docs/api/README.md)
- 运行时 Zod Schema/API client：[`src/shared/api`](src/shared/api)
- API 到页面模型的穷尽适配层：[`src/shared/view-model-adapters`](src/shared/view-model-adapters)
- 本地 Mock：[`src/mocks`](src/mocks)

修改接口时必须同步更新 OpenAPI、Zod Schema、MSW handler 和 Contract 测试，再运行：

```bash
npm run api:generate
npm run api:check
npm run test
```

## 部署约束

当前轻量路由使用浏览器 History API，默认部署在站点根路径。生产 Web 服务器必须把 `/projects/**`、`/enterprise-assets` 等前端路由回退到 `/index.html`，同时保留 `/api/**` 给后端或网关处理。若需要部署到子目录，应先为路由补充与 Vite `base` 一致的前缀处理。
