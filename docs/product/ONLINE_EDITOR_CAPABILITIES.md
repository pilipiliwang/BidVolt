# 标书在线编辑能力定义

更新日期：2026-08-06

## 1. 产品边界

本轮交付的是技术标、商务标和报价单的网页在线编辑体验，用于验证编辑动作、保存状态、项目与版本隔离、
刷新恢复和键盘操作。它不直接改写 `docx` / `xlsx` 二进制文件，也不冒充原生 Office 格式保真。

生产环境如需保留分页、复杂样式、公式、批注、修订和多人协作，必须接入 OnlyOffice、Collabora 或等价的
文档编辑服务，并由业务后端完成短时会话、保存回调、权限校验、版本生成和冲突处理。

## 2. 本轮 P0 工具集

### 2.1 通用工具

| 能力 | 用户操作 | 可验证结果 |
| --- | --- | --- |
| 保存状态 | 修改内容、点击保存或按 `Ctrl/Cmd + S` | 显示未保存、保存中、已保存或失败；保存后刷新可恢复当前项目、成果、版本的草稿 |
| 撤销 / 重做 | 点击工具栏或按 `Ctrl/Cmd + Z`、`Ctrl/Cmd + Y` | 只影响当前编辑器，按钮禁用状态与历史栈一致 |
| 查找 / 替换 | 打开查找替换，输入关键词并执行 | 展示匹配数；替换当前或全部后可继续撤销 |
| 缩放 | 选择缩放比例 | 只改变编辑画布，不改变站点导航与数据 |
| 下载源文件 | 点击下载 | 下载当前 Mock Word / Excel 文件；不把网页草稿伪装成新 Office 文件 |
| 版本隔离 | 切换账号、企业、项目、成果或版本 | 草稿键包含 `enterprise_id + user_id + project_id + deliverable_type + version_id`，内容和撤销栈不会串用 |
| AI 针对性修改 | Word 已有选区时点击直接填入；无选区时点击进入预览选取模式，拖选并松开后填入；报价单使用当前单元格 / 整行 | 纯文本上下文填入页面底部项目助手输入框并聚焦；Word 选取模式可按 `Esc` 取消；不自动提交、不联网、不直接修改成果 |

### 2.2 技术标 / 商务标（文档型）

| 工具组 | P0 功能 |
| --- | --- |
| 文字格式 | 段落样式、字体、字号、加粗、斜体、下划线 |
| 段落排版 | 对齐、有序列表、无序列表 |
| 内容工具 | 查找替换、字数统计；已有选区时把选区填入项目助手输入框，无选区时进入预览选取模式，拖选松开后自动填入，`Esc` 取消 |
| 目录与页面 | 根据标题实时生成分层目录；目录标题可编辑并同步正文；点击目录定位章节；提供页面预览入口 |
| 审阅 | 新增、查看、解决/重开和删除锚定批注；评审入口可跳转，不保留失效按钮 |
| 编辑安全 | 格式命令作用于用户选区；失去焦点后仍能恢复最近选区；所有写操作进入撤销历史 |

Word 的“AI针对性修改”选取流程必须满足：

1. 文档已有非空选区时，点击工具直接把该选区的纯文本写入项目助手输入框并聚焦；
2. 文档没有选区时，点击工具只进入预览选取模式，不立即填入或发送任何内容；
3. 用户在预览中拖选文字，松开指针后自动提取纯文本、退出选取模式并填入项目助手输入框；
4. 选取过程中按 `Esc` 立即取消并退出模式，不填入上下文、不改变正文；
5. 两条路径都不自动发送、不发起网络请求、不修改正文，项目助手接口未接入时发送按钮保持禁用。

### 2.3 报价单（表格型）

| 工具组 | P0 功能 |
| --- | --- |
| 单元格定位 | 当前选区、名称框、公式栏、行列高亮 |
| 报价编辑 | 用户报价可编辑，非负数字校验；行金额和总价即时重算 |
| 行操作 | 新增、复制、删除报价行，且可撤销 / 重做 |
| 数据工具 | 按关键列排序、筛选、自动求和、冻结表头、缩放 |
| 工作表 | 报价明细、汇总、费用汇总、单价分析均可切换并展示对应实时数据视图 |
| 批量应用 | 将算法建议价应用到用户报价前必须确认；应用后总价重算且可撤销 |
| 数据边界 | 外部历史报价和算法建议价始终只读；保存载荷不提交这两列；浏览器总价只是预览，正式价格仍由服务端算法复算 |

## 3. 后续 P1：原生云文档能力

以下能力不能仅靠当前网页 Mock 安全实现，应在文档服务接入后交付：

- 原生 `docx` / `xlsx` 高保真读写、分页、图片、页眉页脚、复杂表格、单元格格式和公式；
- 服务端自动保存、断线恢复、多人光标、共同编辑和在线成员；
- 完整修订模式、逐条接受 / 拒绝、批注线程、@成员和权限分级；
- 版本历史、命名版本、对比、恢复和不可覆盖的成果新版本；
- 服务端导出 Word / Excel / PDF，以及病毒扫描、内容哈希和审计记录；
- AI 建议的证据引用、差异预览、逐条确认、可撤回和模型/规则版本记录。

## 4. 生产接口最小闭环

1. 页面先读取成果版本详情，确认当前用户具有 `edit`、`comment` 或 `review` 权限。
2. 后端创建短时编辑会话，只返回浏览器需要的 `editor_url` 或安全的 `editor_config`。
3. 文档服务从受控地址读取单个成果版本；浏览器不获得对象存储密钥和保存回调凭据。
4. 文档服务把保存事件回调到业务后端；后端验签、限流、防重放并校验内容哈希。
5. 保存永不覆盖旧版本。后端基于 `expected_version_id` 生成新版本，冲突时返回 `409`。
6. 浏览器查询会话状态，取得 `new_version_id` 后跳转到新版本并刷新成果摘要。

报价单的数量、单价、金额在生产接口中使用十进制定点字符串。正式保存时由 QuoteEngine 重新计算，
浏览器提交的总价不作为可信结果。

## 5. 参考的云文档交互定义

- [Microsoft Word 修订模式](https://support.microsoft.com/en-us/word/training/track-changes-in-word)：修订开关、标记视图、上一处 / 下一处和接受 / 拒绝。
- [Microsoft Word 网页版协作](https://support.microsoft.com/en-us/word/training/collaborate-online-in-word-for-the-web)：批注、@提及和协作审阅。
- [Microsoft Word 查找](https://support.microsoft.com/en-US/Word/find-text-in-a-document)：导航式查找及大小写、整词等选项。
- [Google 文档版本历史](https://support.google.com/docs/answer/190843?hl=zh-Hans)：查看、命名、复制和恢复历史版本。
- [Google 文档批注](https://support.google.com/docs/answer/65129?hl=zh-Hans)：新增、回复、筛选、解决和删除批注。
- [Google 文档大纲](https://support.google.com/docs/answer/6367684?hl=zh-Hans)：从标题生成文档大纲并定位章节。
- [ONLYOFFICE 自动目录](https://helpcenter.onlyoffice.com/docs/userguides/document_editor/CreateTableOfContents.aspx)：基于标题层级创建和刷新目录。
- [Google 表格公式](https://support.google.com/docs/answer/46977?hl=zh-Hans)：名称框 / 公式栏式的公式输入和范围引用。
- [Google 表格排序和筛选](https://support.google.com/docs/answer/3540681?hl=zh-Hans)：区域排序、筛选与筛选视图。
- [Google 表格冻结行列](https://support.google.com/docs/answer/9060449?hl=zh-Hans)：冻结表头或关键列。
- [ONLYOFFICE Spreadsheet 界面](https://helpcenter.onlyoffice.com/docs/userguides/spreadsheet_editor/ProgramInterface.aspx)：公式栏、状态栏、工作表标签、保存连接状态和评论 / 搜索面板。
- [ONLYOFFICE 编辑权限](https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/permissions/)：编辑、评论、审阅等权限应分别配置。
- [ONLYOFFICE 编辑器配置](https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/)：编辑会话、回调地址、自动保存 / 共同编辑和用户身份配置。
