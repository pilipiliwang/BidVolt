# BidVolt · 电网投标助手 Web

面向电网投标业务的浏览器端工作台：管理企业资料、导入招标材料、跟进 Agent 编制过程、查看和编辑成果，并进入评审与报价流程。

本仓库维护 **Web 前端、接口适配、自动化测试及可选的本地 Office 联调工具**，不包含正式业务后端，也不是桌面客户端。

- 前端仓库：[pilipiliwang/BidVolt](https://github.com/pilipiliwang/BidVolt)
- 后端仓库：[aotocode2026/BidVolt](https://github.com/aotocode2026/BidVolt)
- 全项目接口清单：[后端 Discussion #1](https://github.com/aotocode2026/BidVolt/discussions/1)（2026-09-05；含已接、未接、缺失能力与接口对照，供后端审阅后拆分 Issue）
- 最新业务与实施对照：[2026-09-06 全项目文档](docs/前后端业务需求与实施对照_2026-09-06.md)；新增产品确认见 [Discussion #13](https://github.com/aotocode2026/BidVolt/discussions/13)。

## 业务流程与当前能力

典型流程：登录 → 创建/进入项目 → 选择投标任务类型 → 准备企业资料与项目材料 → 解析完成后点击开始 → Agent 编制/审核 → 查看成果、补充要求、评审与报价。正常要求不逐条人工审核，Agent实际提出的问题在Log中回答。

| 模块 | 当前前端能力 | 对接边界 |
| --- | --- | --- |
| 账号与项目 | 登录、注册、会话刷新；项目搜索、新增、归档和阶段入口；名称/包号/截止时间编辑 | 新建仅填名称与负责人；负责人/包号暂存服务端note扩展区，自动提取及原生字段待后端补齐；任务类型仍未跨设备同步 |
| 企业资料库 | 分类树、上传/预览、字段纠正及版本记录；各阶段统一资料展示 | 企业长期资料与当前项目招标材料分开管理 |
| 上传材料 | 招标/补充材料上传、公告链接导入、解析状态、只读招标要求与快照 | 已有真实接口；完整公告附件下载与ZIP子文件恢复仍待补齐；不回退为演示数据 |
| 编制工作台 | Agent 启动、状态、问答、追加消息、调整方向、历史与实时事件 | 消息排队有前端状态管理；可靠的逐条回执、去重与队列取消仍需后端补齐 |
| 过程记录 | 公开运行记录、阶段信息、工具活动与最终回复 | 保留可查看的业务日志；隐藏内部推理及实现名称，不将内部过程混入最终回复 |
| 标书成果 | 正式artifact分页目录、按真实ID预览/单文件下载、整包下载反馈；未知分组显示待分类 | 不用本机同名样例代替正式文件；真实Word图片/字体/页码及保存后整包同步仍待验收 |
| Office 编辑 | 本地原文件编辑、选区引用、另存为新版本/覆盖当前版本 | 依赖可选本地 Office 服务；保存到本地卷，不是正式后端 |
| 评审与报价 | Agent状态在左、F103评分在右；五张横排评分卡，无数据以“—”占位，窄屏上下显示；底部说明文件入口；版本变化刷新、旧分数提示；历史价格与报价 | 生成成果不会自动发起模拟评标；刷新不等于重评；评分未关联正式artifact版本时仅供参考 |
| 投标行情库 | 参考资料库页面与预览交互 | 真实接口尚缺，不能视为已上线功能 |

最近改动包括统一资料树和数量显示、简化上传列表、居中预览与可折叠上传区域、字号/分辨率适配、成果版本与空态、输入框和下载反馈、消息时间线及公开日志展示。

编制/成果工作台的左侧资料栏始终可收起/展开；打开文件预览后，右侧任务区域也可收起。关闭预览时右侧自动展开、隐藏右侧收起按钮，回到资料栏＋任务区域布局；左侧保留用户的折叠选择，任务动态与未发送草稿不会因此清空。

2026-09-06补充：页头名称、包号、截止时间改为单击原位编辑；已结束任务超过200条的历史按游标连续读取，继续对话期间也刷新问题；消息区分“等待回复”“已送达”“处理结束但无有效回复”。正式成果预览区区分原文件读取与Office加载失败，提供重试及适用时原件下载，下载按钮带等待反馈。上述前端处理不代表服务器端对话执行或Office服务问题已经消除。

### 投标行情库的用途

它不仅是给用户浏览的文章/文档列表，更是 **Agent 编制标书前的参考资料来源**。业务要求：每次生成标书前，Agent 先读取、理解与当前项目相关的行情库内容，再作为参考参与编写；用户不需要每次复制材料或重复提醒。

它与报价模块的历史价格查询不是同一个功能。目前真实资料管理接口及“生成前读取并使用参考资料”的联动仍待接通、验收，不能把已有页面当作上述能力已完成。

## 快速启动

建议 Node.js 22.12+（或满足依赖要求的较新 LTS）、npm 和 Git。普通前端开发不需要 Docker；可选 Office 联调需要 Docker Desktop。

```bash
git clone https://github.com/pilipiliwang/BidVolt.git
cd BidVolt
npm ci
npm run dev
```

访问 `http://127.0.0.1:4173`，端口被占用时以终端输出为准。开发默认使用真实后端模式，登录需要后端提供的有效账号与可用服务。

### 环境配置

`npm run dev` 使用 `backend` 模式。`.env.backend` 为现有联调默认值；其他环境在根目录创建 **不提交 Git 的 `.env.backend.local`** 覆盖：

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
# 可选：接口联调面板，开发默认显示、生产默认隐藏
# VITE_SHOW_API_TEST_PANEL=true
# 可选：本地 Office bridge
# VITE_ONLYOFFICE_BRIDGE_URL=http://127.0.0.1:8081
```

示例代理地址需换成自己的后端地址。开发时 `/api` 经 Vite 同源代理转发，避免浏览器直接跨域。修改后重启服务。

`VITE_` 变量会进入浏览器，**不能放 token、密码、存储密钥或 Office JWT 密钥**。认证、租户/项目归属和文件权限由后端校验；生产前端配置在构建时确定。

### 后端不可用时的只读预览

```bash
npm run dev:local-preview
```

访问 `/login`，选择“进入本地只读预览”。入口仅在开发态、`local-preview` 模式且回环域名下可用。快照不代表真实业务结果；上传、保存、执行任务等写操作不会提供假成功。生产构建不启用此入口。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` / `npm run dev:backend` | 真实后端联调开发服务 |
| `npm run dev:local-preview` | 本机只读页面预览 |
| `npm run lint` | ESLint 检查 |
| `npm test` | 前端自动化测试 |
| `npm run api:check` | API client、契约与适配层测试 |
| `npm run api:check:live` | 检查实际后端 OpenAPI，需要网络与正确环境配置 |
| `npm run build:backend` | 类型检查及 backend 模式构建，输出 `dist/` |
| `npm run build` | 类型检查及默认 production 模式构建 |
| `npm run preview` | 本地预览已有构建，不是生产服务器 |

Office bridge 和下载代理另有独立测试：

```bash
node --test infra/onlyoffice/bridge/*.test.mjs infra/onlyoffice/fonts/fonts.test.mjs
npx vitest run --config scripts/office-download-vitest.config.ts --configLoader runner
```

## 本地 Office 原文件编辑（可选）

完整启动、字体授权、选区通信及保存说明见 [infra/onlyoffice/README.md](infra/onlyoffice/README.md)。默认端口 8080（文档服务）、8081（bridge）；网页 Office 入口限制在回环域名。

- 编辑使用工作副本；Word 批注保护处理发生在副本中，保留原始上传文件。
- 选区可“引用到对话框”，用户补充要求后再发送，不会仅凭选区自动改写文件。
- 保存选择“另存为新版本”或“覆盖当前版本”；新版本保留旧版本，覆盖前保存恢复副本。
- 自动回调暂存与正式保存决策分开；版本保存在 Docker 数据卷，不要将删除卷当作普通停止操作。
- 字体使用有授权的开源替代字体，不发布微软字体；不保证替代字体与原字体完全同版。
- `.local-artifacts/` 不提交、不打包进 `dist/`。固定样例与 `__local-package` 路由仅为开发辅助，不是通用后端成果接口。

**此服务仅供本地联调，不能直接暴露公网。** 本地 Office 保存成功不等于正式后端文件更新；远端既有 `editor-sessions` 保存结构化模型，也不能等同于 Office 二进制回写。成果图片、页码、排版需拿到后端实际文件后逐项验收。

## 目录与路由

```text
src/app/                        路由、会话、项目资源状态、联调目录
src/domains/projects/           项目流程、编制/成果工作台、Office、侧栏
src/features/enterprise-assets/ 企业资料库
src/features/project-materials/ 招标材料上传与预览
src/features/bid-market-library/ 投标行情库页面
src/shared/backend-api/         真实 client、类型、DTO 适配、契约测试
src/shared/ui/                  输入框、运行时间线、下载等共用组件
src/styles/                     全局样式与适配
scripts/                        联调辅助与接口检查
infra/onlyoffice/               可选 Office 服务、字体清单、独立测试
docs/                           产品、接口需求与改动记录
```

主要路由：`/projects`、`/enterprise-assets`、`/bid-market`；项目内为 `/projects/:projectId/materials`、`overview`、`review`、`pricing`、`deliverables/:deliverableType/versions/:versionId`。已选择生成任务类型时，项目入口进入 `materials?workflow=generate`。

技术栈：React 19、TypeScript、Vite、Vitest / Testing Library、ESLint；使用 History API 路由。精确安装版本以 `package-lock.json` 为准。

## 接口协作与待验收项

以 [全项目接口对接清单](https://github.com/aotocode2026/BidVolt/discussions/1) 为最新审阅入口；覆盖整个项目的现状、未使用接口及所缺业务能力。旧文档仅作背景，不替代运行时 OpenAPI 与实际 client。

- [前端接口需求](docs/api/FRONTEND_API_REQUIREMENTS.md)
- [接口协作说明](docs/api/README.md)
- [真实 client 与适配层](src/shared/backend-api)
- [Office 编辑/保存/渲染边界](docs/OFFICE_EDIT_SAVE_RENDER_2026-09-05.md)
- [选区引用](docs/OFFICE_SELECTION_QUOTE_2026-09-05.md)
- [消息队列](docs/AGENT_MESSAGE_QUEUE_2026-09-05.md)
- [运行日志展示](docs/AGENT_LOG_PRESENTATION_2026-09-05.md)

重点待接/验收：真实文件产物列表与下载、原文件云端编辑保存和版本回写、逐条消息回执与稳定关联、行情库及生成前参考资料使用、实际成果图片/页码/排版。存在按钮或 SDK 方法不代表整条业务链已闭环。

## 部署与仓库约定

1. 执行 `npm ci`、`npm run lint`、`npm test`、`npm run build:backend`，部署 `dist/`。
2. 前端页面路由回退到 `/index.html`，`/api/**` 交给后端/网关；Vite 开发代理不随静态文件部署。
3. SSE 代理需支持长连接，避免缓冲造成消息延迟。生产使用 HTTPS，不公开本地 Office bridge 与调试面板。
4. 默认部署到站点根路径；子目录部署需同时处理路由前缀与 Vite `base`。
5. 不提交本地环境配置、账号凭据、客户原文件、`.local-artifacts/`、`outputs/`、下载字体、缓存或构建产物。示例密钥仅用于隔离的本地测试。

修改接口时同步检查 client、DTO 适配、页面状态与测试；不要只改类型声明，也不要在接口失败时伪造成功。
