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
```

开发默认使用 `VITE_API_MODE=mock`。真实接口根地址通过 `VITE_API_BASE_URL` 配置。
