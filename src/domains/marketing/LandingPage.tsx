import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Gauge,
  History,
  Network,
  PencilLine,
  PhoneCall,
  QrCode,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

import { AppLink } from '../../app/router';
import { BrandLogo } from '../../shared/ui/BrandLogo';
import './landing-page.css';

const capabilities = [
  {
    icon: Building2,
    title: '企业资料自动归类',
    description:
      '营业执照、资质、人员、业绩和产品资料统一沉淀，Agent 自动分类与抽取，人工纠正形成新修订。',
    meta: '长期资产 · 跨项目复用',
  },
  {
    icon: FolderKanban,
    title: '本次材料严格隔离',
    description:
      '招标文件、澄清补遗和报价模板只进入当前项目事件与冻结快照，不自动写入企业资料库。',
    meta: '项目作用域 · 不串库',
  },
  {
    icon: FileCheck2,
    title: '三类成果在线编制',
    description:
      '商务标、技术标和报价单绑定当前项目与版本，从材料解析、生成、编辑到交付保持上下文一致。',
    meta: 'Word / Excel · 版本隔离',
  },
  {
    icon: Sparkles,
    title: 'AI 针对性修改',
    description:
      '框选 Word 内容或选中 Excel 单元格，将上下文带入项目助手；由用户补充要求并确认，不自动改写成果。',
    meta: '选区带入 · 用户确认',
  },
  {
    icon: Network,
    title: '评审机制灵活接入',
    description:
      '通过统一 ReviewProvider 接入应用接口、受限规则代码、规则引擎或文档规则，并校验结构化结果。',
    meta: 'API / 代码 / 规则文档',
  },
  {
    icon: BarChart3,
    title: '历史报价单向取值',
    description:
      '外部历史数据库保持只读，由带版本号的确定性 QuoteEngine 基于冻结样本计算可解释的报价策略。',
    meta: '只读数据源 · 确定性算法',
  },
] as const;

const workflowSteps = [
  {
    number: '01',
    icon: UploadCloud,
    title: '资料准备',
    description: '复用企业资料，上传本次招标文件与补充材料。',
  },
  {
    number: '02',
    icon: BookOpenCheck,
    title: '要求提取',
    description: '识别资格、否决、技术和报价要求，并保留来源位置。',
  },
  {
    number: '03',
    icon: FileCheck2,
    title: '成果编制',
    description: '生成并在线编辑商务标、技术标和报价单。',
  },
  {
    number: '04',
    icon: ClipboardCheck,
    title: '评审校核',
    description: '模拟评标，或调用企业已有的外部评审机制。',
  },
  {
    number: '05',
    icon: History,
    title: '版本交付',
    description: '确认建议、生成新版本，让每次修改都能追溯。',
  },
] as const;

const boundaryCards = [
  {
    icon: Building2,
    eyebrow: '企业域',
    title: '企业资料库',
    description: '同一企业域统一读取与上传，可跨项目复用；字段纠正保留原值、证据和修订记录。',
    badge: '长期沉淀',
  },
  {
    icon: FolderKanban,
    eyebrow: '项目域',
    title: '当前招标材料',
    description: '仅写入当前 projectId 的材料、事件和快照，不提供转存企业库或跨项目读取动作。',
    badge: '任务内保存',
  },
  {
    icon: Network,
    eyebrow: '受控交互',
    title: '外部评审机制',
    description: '只处理固定项目快照和成果版本；浏览器不持有凭据，也不直接执行外部代码。',
    badge: '统一 Provider',
  },
  {
    icon: Database,
    eyebrow: '只读数据源',
    title: '历史报价数据库',
    description: '仅查询不可变快照，不提供新增、修改或删除通道；算法在受控服务中完成。',
    badge: '单向取值',
  },
] as const;

export function LandingPage() {
  return (
    <div className="marketing-page">
      <a className="marketing-skip-link" href="#main-content">
        跳到主要内容
      </a>

      <header className="marketing-header">
        <div className="marketing-header__inner">
          <AppLink className="marketing-brand" to="/" aria-label="AI电网投标助手产品首页">
            <BrandLogo title="AI电网投标助手" />
            <span>
              <strong>AI电网投标助手</strong>
              <small>电力行业投标智能工作台</small>
            </span>
          </AppLink>

          <nav className="marketing-nav" aria-label="产品导航">
            <a href="#capabilities">产品能力</a>
            <a href="#workflow">工作流程</a>
            <a href="#editor">在线编辑</a>
            <a href="#boundaries">数据边界</a>
            <a href="#contact">联系我们</a>
          </nav>

          <div className="marketing-header__actions">
            <AppLink className="marketing-login-link" to="/login">
              登录
            </AppLink>
            <AppLink className="marketing-button marketing-button--small" to="/login">
              立即试用
              <ArrowRight aria-hidden="true" size={17} />
            </AppLink>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="marketing-hero" aria-labelledby="marketing-hero-title">
          <div className="marketing-hero__glow" aria-hidden="true" />
          <div className="marketing-container marketing-hero__inner">
            <div className="marketing-hero__copy">
              <span className="marketing-eyebrow">
                <span aria-hidden="true" />
                面向电力行业的投标智能工作台
              </span>
              <h1 id="marketing-hero-title">
                从招标材料到标书成果，
                <em>让每一步都有依据</em>
              </h1>
              <p>
                将企业资料、本次招标材料、Word/Excel 标书成果、评审机制与历史报价连接成一条受控工作流。
                资料不串库、建议可确认、结果可追溯。
              </p>
              <div className="marketing-hero__actions">
                <AppLink className="marketing-button" to="/login">
                  立即试用
                  <ArrowRight aria-hidden="true" size={19} />
                </AppLink>
                <a className="marketing-button marketing-button--secondary" href="#capabilities">
                  查看产品能力
                </a>
              </div>
              <div className="marketing-hero__assurance" aria-label="产品形态">
                <span><CheckCircle2 aria-hidden="true" size={17} />纯网页端</span>
                <span><CheckCircle2 aria-hidden="true" size={17} />无需安装客户端</span>
                <span><CheckCircle2 aria-hidden="true" size={17} />项目版本可追溯</span>
              </div>
            </div>

            <ProductPreview />
          </div>

          <div className="marketing-container marketing-proof" aria-label="产品核心边界">
            <div>
              <strong>双资料域</strong>
              <span>企业资产与项目任务清晰隔离</span>
            </div>
            <div>
              <strong>三类成果</strong>
              <span>商务标、技术标、报价单统一管理</span>
            </div>
            <div>
              <strong>可插拔评审</strong>
              <span>文档、API 与受限代码统一接入</span>
            </div>
            <div>
              <strong>只读历史价</strong>
              <span>确定性算法生成可解释策略</span>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="capabilities" aria-labelledby="capabilities-title">
          <div className="marketing-container">
            <SectionHeading
              eyebrow="产品能力"
              title="不是单点生成工具，而是一套受控的投标工作流"
              description="把资料、要求、成果、评审意见与报价依据放进同一个项目上下文，同时保留清晰的数据边界。"
              id="capabilities-title"
            />
            <div className="marketing-capability-grid">
              {capabilities.map(({ icon: Icon, title, description, meta }) => (
                <article className="marketing-capability-card" key={title}>
                  <span className="marketing-capability-card__icon" aria-hidden="true">
                    <Icon size={25} strokeWidth={1.9} />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <span className="marketing-capability-card__meta">{meta}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-section--soft" id="workflow" aria-labelledby="workflow-title">
          <div className="marketing-container">
            <SectionHeading
              eyebrow="工作流程"
              title="一条工作流，串起投标全周期"
              description="从资料准备到成果交付，每个阶段都绑定当前项目、明确版本，并保留可定位的依据。"
              id="workflow-title"
              align="left"
            />
            <ol className="marketing-workflow">
              {workflowSteps.map(({ number, icon: Icon, title, description }) => (
                <li key={number}>
                  <span className="marketing-workflow__number">{number}</span>
                  <span className="marketing-workflow__icon" aria-hidden="true">
                    <Icon size={23} strokeWidth={1.9} />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="marketing-section" id="editor" aria-labelledby="editor-title">
          <div className="marketing-container marketing-editor-showcase">
            <div className="marketing-editor-copy">
              <span className="marketing-eyebrow">成果在线编辑</span>
              <h2 id="editor-title">标书成果不止能预览，还能持续编辑</h2>
              <p>
                商务标、技术标和报价单均绑定当前项目与成果版本。Word 支持目录定位与常用排版，Excel
                支持行操作、筛选、冻结表头和金额实时预览。
              </p>
              <ul>
                <li><CheckCircle2 aria-hidden="true" size={19} />可编辑分层目录，标题变化后同步目录</li>
                <li><CheckCircle2 aria-hidden="true" size={19} />撤销、重做、查找替换、批注和页面预览</li>
                <li><CheckCircle2 aria-hidden="true" size={19} />报价历史价与算法建议价始终只读</li>
                <li><CheckCircle2 aria-hidden="true" size={19} />选区带入项目助手，用户确认后再修改</li>
              </ul>
              <AppLink className="marketing-text-link" to="/login">
                进入在线编辑体验 <ArrowRight aria-hidden="true" size={18} />
              </AppLink>
            </div>
            <EditorPreview />
          </div>
        </section>

        <section className="marketing-section marketing-boundaries" id="boundaries" aria-labelledby="boundaries-title">
          <div className="marketing-container">
            <SectionHeading
              eyebrow="数据边界"
              title="把关键边界做成系统规则"
              description="数据属于哪里、哪些系统可以读取、哪些动作必须确认，都由明确的作用域和版本约束控制。"
              id="boundaries-title"
            />
            <div className="marketing-boundary-grid">
              {boundaryCards.map(({ icon: Icon, eyebrow, title, description, badge }) => (
                <article key={title}>
                  <div className="marketing-boundary-card__topline">
                    <span className="marketing-boundary-card__icon" aria-hidden="true"><Icon size={23} /></span>
                    <span className="marketing-boundary-card__badge">{badge}</span>
                  </div>
                  <span className="marketing-boundary-card__eyebrow">{eyebrow}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
            <div className="marketing-boundary-note" role="note">
              <ShieldCheck aria-hidden="true" size={22} />
              <span>
                <strong>AI 不直接覆盖成果。</strong>
                建议先进入输入框，由用户补充要求、确认应用；保存后生成新版本，旧版本仍可追溯。
              </span>
            </div>
          </div>
        </section>

        <section className="marketing-section" aria-labelledby="integration-title">
          <div className="marketing-container">
            <SectionHeading
              eyebrow="评审与报价"
              title="外部能力可以接入，关键决策仍然受控"
              description="评审机制与历史报价来源可以来自企业现有系统，项目快照、算法版本和用户确认共同保证结果可解释。"
              id="integration-title"
            />
            <div className="marketing-integration-grid">
              <article className="marketing-integration-card marketing-integration-card--review">
                <span className="marketing-integration-card__icon" aria-hidden="true"><Network size={27} /></span>
                <span className="marketing-eyebrow">ReviewProvider</span>
                <h3>评审机制不一定是文档</h3>
                <p>应用接口、受限规则代码、企业规则引擎和业主评分办法都可以通过统一 Provider 接入。</p>
                <div className="marketing-chip-row" aria-label="支持的评审机制">
                  <span>合规评审 API</span><span>受限规则代码</span><span>集团规则引擎</span><span>文档规则</span>
                </div>
              </article>
              <article className="marketing-integration-card marketing-integration-card--quote">
                <span className="marketing-integration-card__icon" aria-hidden="true"><Gauge size={27} /></span>
                <span className="marketing-eyebrow">QuoteEngine</span>
                <h3>历史报价只读，算法结果有依据</h3>
                <p>冻结外部查询快照，结合规格、地区、时间、成本与毛利要求计算；数据不足时明确停止，不使用 AI 猜价。</p>
                <div className="marketing-quote-line">
                  <span><Database aria-hidden="true" size={18} />外部历史库</span>
                  <ArrowRight aria-hidden="true" size={18} />
                  <span><BarChart3 aria-hidden="true" size={18} />确定性算法</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-contact" id="contact" aria-labelledby="contact-title">
          <div className="marketing-container marketing-contact__inner">
            <div className="marketing-contact__copy">
              <span className="marketing-eyebrow">联系我们</span>
              <h2 id="contact-title">想进一步了解产品或安排试用？</h2>
              <p>
                扫描右侧二维码保存联系人，或直接拨打电话沟通产品试用、业务场景与合作需求。
              </p>
              <a
                className="marketing-contact__phone"
                href="tel:15312065105"
                aria-label="拨打联系人电话 15312065105"
              >
                <span className="marketing-contact__phone-icon" aria-hidden="true">
                  <PhoneCall size={24} />
                </span>
                <span>
                  <small>联系人电话</small>
                  <strong>153 1206 5105</strong>
                </span>
              </a>
              <span className="marketing-contact__hint">产品咨询 · 试用沟通 · 合作对接</span>
            </div>

            <figure className="marketing-contact__qr-card">
              <div className="marketing-contact__qr-frame">
                <img
                  src="/contact-qr.png"
                  alt="AI电网投标助手联系人二维码，包含电话15312065105"
                  width="410"
                  height="410"
                  loading="lazy"
                />
              </div>
              <figcaption>
                <span aria-hidden="true"><QrCode size={24} /></span>
                <span>
                  <strong>扫码保存联系人</strong>
                  <small>二维码包含联系人名称和电话号码</small>
                </span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="marketing-cta" aria-labelledby="marketing-cta-title">
          <div className="marketing-container marketing-cta__inner">
            <div>
              <span className="marketing-eyebrow">开始使用</span>
              <h2 id="marketing-cta-title">把下一次电网投标，放进一条可追踪的工作流</h2>
              <p>从资料归档、任务解析、标书编辑到评审和报价，用同一套网页工作台完成。</p>
            </div>
            <AppLink className="marketing-button marketing-button--light" to="/login">
              立即试用
              <ArrowRight aria-hidden="true" size={20} />
            </AppLink>
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="marketing-container marketing-footer__inner">
          <div className="marketing-footer__brand">
            <BrandLogo />
            <span><strong>AI电网投标助手</strong><small>专为电力行业投标打造的智能助手</small></span>
          </div>
          <nav aria-label="页脚导航">
            <a href="#capabilities">产品能力</a>
            <a href="#workflow">工作流程</a>
            <a href="#boundaries">数据边界</a>
            <a href="#contact">联系我们</a>
            <AppLink to="/login">登录</AppLink>
          </nav>
          <span className="marketing-footer__note">网页端使用 · 无需安装客户端</span>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({
  align = 'center',
  description,
  eyebrow,
  id,
  title,
}: {
  align?: 'center' | 'left';
  description: string;
  eyebrow: string;
  id: string;
  title: string;
}) {
  return (
    <header className={`marketing-section-heading marketing-section-heading--${align}`}>
      <span className="marketing-eyebrow">{eyebrow}</span>
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function ProductPreview() {
  const sourceItems = ['招标文件', '技术规范书', '报价模板', '澄清补遗'];
  const deliverables = [
    { title: '商务标', score: '28.6 / 30', icon: FileText },
    { title: '技术标', score: '45.3 / 50', icon: FileCheck2 },
    { title: '报价单', score: '17.5 / 20', icon: FileSpreadsheet },
  ];

  return (
    <div className="marketing-product-preview" aria-label="AI电网投标助手成果工作台演示">
      <div className="marketing-product-preview__bar">
        <span><i /><i /><i /></span>
        <strong>海上平台电气设备采购项目</strong>
        <em>演示项目</em>
      </div>
      <div className="marketing-product-preview__body">
        <aside className="marketing-product-preview__sources">
          <span>当前招标材料</span>
          <strong>12 项已识别</strong>
          <ul>
            {sourceItems.map((item) => (
              <li key={item}>
                <FileText aria-hidden="true" size={14} />
                <span>{item}</span>
                <CheckCircle2 aria-hidden="true" size={13} />
              </li>
            ))}
          </ul>
          <div><ShieldCheck aria-hidden="true" size={15} />项目材料已隔离</div>
        </aside>
        <section className="marketing-product-preview__results">
          <header><span>标书成果预览</span><em>V3.2</em></header>
          <div>
            {deliverables.map(({ title, score, icon: Icon }) => (
              <article key={title}>
                <small>已生成</small>
                <span className="marketing-product-preview__file"><Icon aria-hidden="true" size={24} /></span>
                <strong>{title}</strong>
                <span>{score}</span>
              </article>
            ))}
          </div>
        </section>
        <aside className="marketing-product-preview__score">
          <span>模拟评标</span>
          <div className="marketing-product-preview__ring"><strong>91.4</strong><small>/100</small></div>
          <dl>
            <div><dt>否决风险</dt><dd>0 项</dd></div>
            <div><dt>缺失材料</dt><dd>3 项</dd></div>
            <div><dt>预计提升</dt><dd>6.2 分</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function EditorPreview() {
  return (
    <div className="marketing-editor-preview" aria-hidden="true">
      <div className="marketing-editor-preview__bar">
        <span><PencilLine aria-hidden="true" size={17} />技术标文件 · V6</span>
        <em>已保存</em>
      </div>
      <div className="marketing-editor-preview__toolbar">
        <span>正文</span><strong>B</strong><i>I</i><span>目录</span><span>批注</span>
        <span className="marketing-editor-preview__ai"><Sparkles aria-hidden="true" size={15} />AI 针对性修改</span>
      </div>
      <div className="marketing-editor-preview__body">
        <aside>
          <strong>文档目录</strong>
          <span className="is-active">1. 项目理解</span>
          <span>2. 技术方案</span>
          <span>3. 质量保证</span>
          <span>4. 实施计划</span>
        </aside>
        <div className="marketing-editor-preview__page">
          <small>技术标文件</small>
          <h3>2. 技术方案</h3>
          <p>本方案依据招标文件、技术规范书与澄清补遗编制，所有引用均保留来源位置。</p>
          <div className="marketing-editor-preview__lines"><i /><i /><i /><i /></div>
          <blockquote>已选择本段内容，可带入项目助手继续补充修改要求。</blockquote>
        </div>
      </div>
      <div className="marketing-editor-preview__assistant">
        <Sparkles aria-hidden="true" size={17} />
        <span>请针对以下选中内容进行修改：技术方案……</span>
        <span className="marketing-editor-preview__send">发送</span>
      </div>
    </div>
  );
}
