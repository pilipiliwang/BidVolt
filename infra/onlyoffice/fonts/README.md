# ONLYOFFICE 中文字体补齐

这里安装的是有明确开源许可的替代字体，**不是微软宋体、黑体、仿宋或楷体原版，也不保证与它们逐像素一致或分页一致**。不从 Windows 字体目录复制到 Linux，不修改字体二进制内部名称。字体文件保留上游原始字节，源 DOCX 不在本目录脚本的操作范围内。

## 实测缺失项

2026-09-05 检查项目 207 的 `7e9fd94dec72/file-1.docx` 到 `file-9.docx`：9 份文件的正文/样式/编号/页眉页脚字体声明均包含宋体与黑体，`file-4.docx` 还声明仿宋_GB2312；部分包含 Calibri、Calibri Light、Tahoma。字体声明不代表每一种都在当前页使用。检查时 DocumentServer 9.4.0-129 的 `fc-list` 只有 Arial、Times New Roman、Liberation、DejaVu 等西文字体，无中文字体。

## 字体、来源及替代关系

| 缺失字体 | 实际安装/采用的字体 family | 固定版本 | 说明 |
| --- | --- | --- | --- |
| 宋体、SimSun、新宋体、NSimSun | Source Han Serif CN | 2.003R | 思源宋体，Regular + Bold |
| 黑体、SimHei、微软雅黑、Microsoft YaHei | Source Han Sans CN | 2.005R | 思源黑体，Regular + Bold；不等同微软字形 |
| 仿宋、FangSong、仿宋_GB2312、FangSong_GB2312 | Zhuque Fangsong (technical preview) | v0.212 | 朱雀仿宋，Regular，**上游预发行/测试版** |
| 楷体、KaiTi、楷体_GB2312、KaiTi_GB2312 | LXGW WenKai | v1.522 | 霞鹜文楷，Regular；不是原版楷体 |
| Calibri、Calibri Light、Tahoma | Liberation Sans | 镜像现有版本 | 明确近似替代；不是 Calibri/Tahoma 度量兼容字库 |

六个下载字体均为静态 OTF/TTF。详细官方下载地址、SHA-256、对应许可文件见 [manifest.json](manifest.json)。大字体二进制和原始 ZIP 已被 `.gitignore` 排除；四份未改写的版权及 OFL 许可文本保留在 `licenses/`，随分发一并提供。

官方下载来源：[Adobe 思源宋体](https://github.com/adobe-fonts/source-han-serif)、[Adobe 思源黑体](https://github.com/adobe-fonts/source-han-sans)、[TrionesType 朱雀仿宋](https://github.com/TrionesType/zhuque)、[LXGW 霞鹜文楷](https://github.com/lxgw/LxgwWenKai)。各仓库随固定版本提供的 SIL OFL 1.1 允许使用、嵌入及随软件再分发，需保留版权/许可，不能单独出售字体。正常使用这些字体产生的文档不要求以 OFL 发布。商业部署还应遵守所用 ONLYOFFICE 版本自身的许可，字体许可不覆盖编辑器软件许可。

[微软官方字体 FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq) 说明 Windows 附带字体不能直接复制到其他电脑/服务器再分发；需要原版字形时，应向字体权利人取得覆盖 Linux 服务器、网页文档编辑/嵌入等具体用途的授权，不能把拥有 Windows 系统视为已有此授权。

## 下载与校验（不操作 Docker）

在仓库根目录使用 PowerShell：

```powershell
./infra/onlyoffice/fonts/prepare-fonts.ps1
./infra/onlyoffice/fonts/prepare-fonts.ps1 -VerifyOnly
node --test infra/onlyoffice/fonts/fonts.test.mjs
```

脚本只从固定官方 HTTPS URL 下载，逐一校验 SHA-256；已存在文件若内容不符就停止，不会静默覆盖。ZIP 只提取清单指定的一个字体条目。中断留下的 `.part` 文件需要先人工检查，再移到临时目录后重试。不要关闭 hash 校验。许可证文本由 `.gitattributes` 保持原字节，避免换行转换导致校验失效。

CI 默认对未下载的字体资产验证项标记 skip，其余清单/许可/配置测试仍运行。设置 `BIDVOLT_REQUIRE_FONT_BINARIES=1` 后缺少字体也会使测试失败。

## DocumentServer 应用（需要操作者明确执行）

DocumentServer 的持久化挂载应为：

```yaml
volumes:
  - ./fonts:/usr/share/fonts/truetype/bidvolt:ro
  - ./fonts/64-bidvolt-cjk.conf:/etc/fonts/conf.d/64-bidvolt-cjk.conf:ro
```

挂载配置需重新创建容器后生效，应先保存并退出当前编辑会话。此目录的脚本不会修改 compose，也不会自行重建/重启容器。

如需先在当前容器准备字体，且上述目标路径**尚不存在**，可由操作者执行：

```powershell
docker cp infra/onlyoffice/fonts bidvolt-onlyoffice:/usr/share/fonts/truetype/bidvolt
docker cp infra/onlyoffice/fonts/64-bidvolt-cjk.conf bidvolt-onlyoffice:/etc/fonts/conf.d/64-bidvolt-cjk.conf
docker exec bidvolt-onlyoffice bash /usr/share/fonts/truetype/bidvolt/refresh-fonts.sh
docker exec bidvolt-onlyoffice bash /usr/share/fonts/truetype/bidvolt/refresh-fonts.sh --verify-only
```

若目标目录已存在，不要原样重跑目录复制以免多嵌套一层，先检查目录结构。`docker cp` 是当前容器内副本，不代替持久化挂载。

刷新按 [ONLYOFFICE 官方安装字体文档](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-fonts-linux.aspx) 使用 `documentserver-generate-allfonts.sh`。本脚本传 `true`，避免上游脚本默认重启 docservice/converter；执行前后校验字体 hash、Fontconfig family 和 ONLYOFFICE `AllFonts.js` 字体索引。刷新仍会更新全局生成字体资产，不能承诺旧编辑会话缓存即时变化。操作者需新开编辑会话验证；如仍有缓存问题，应保存后统一安排重启，不能直接中断未保存会话。容器重建后需要再次运行刷新/校验。

## Fontconfig 与编辑工作副本的区别

`64-bidvolt-cjk.conf` 使用 Fontconfig `accept` fallback；根据 [Fontconfig 官方配置说明](https://fontconfig.pages.freedesktop.org/fontconfig/fontconfig-user.html)，它保留原请求在前，若以后合法安装原字体，不会由 `prefer` 强制抢先替代。四类 `fc-match` 已在隔离容器校验。

**Fontconfig 匹配正确不等于 ONLYOFFICE 一定使用同样的替代策略**。ONLYOFFICE 有自身字体选择/渲染链路，必须看真实编辑器与导出结果，不能只报 `fc-match` 成功。

为使缺失字体可预期地替代，桥接层可在**编辑工作副本**中明确替换字体引用：`BIDVOLT_OFFICE_FONT_SUBSTITUTIONS_JSON` 默认应为 `{}`；仅在字体安装校验完成后，将 [substitutions.json](substitutions.json) 作为明确配置启用。`bridge/font-substitutions.mjs` 只替换正确 XML 命名空间下的 `w:rFonts` 字体属性、字体表 `w:font` 的名称和 DrawingML 主题 `typeface`，不替正文、图片、批注文本，也不修改原始下载文件。会话/界面必须披露实际替代字体。源字体随后获得合法安装授权时，应从映射中删除对应项再创建新工作副本。

替代字体可能造成行宽、换行、页数变化；朱雀/文楷这里只带 Regular，粗体等效果可能由编辑器合成。投标提交前需以最终导出件检查分页、表格及签章位置。图像缺失不是安装字体即可修复的问题。

## 验收与回退

- 检查 `fc-match SimSun`、`SimHei`、`FangSong_GB2312`、`KaiTi` 返回表内真实 family，且 ONLYOFFICE 字体选择列表能查到它们。
- 新建只用于验收的工作副本，检查中文、英文、加粗、表格、分页与图片，再导出核对；不要覆盖项目源材料做测试。
- 回退先关闭/保存编辑会话，再禁用显式映射和两条挂载、按部署流程重建并刷新字体索引；保留字体资产以便恢复。不在脚本中删除未知字体或修改源 DOCX。
