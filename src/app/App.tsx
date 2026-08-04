import { ArrowRight, Building2, FileStack, ShieldCheck } from 'lucide-react';

const principles = [
  {
    icon: Building2,
    title: '企业资料独立归档',
    detail: '企业证照、资质与业绩跨项目复用，自动分类并保留来源与版本。',
  },
  {
    icon: FileStack,
    title: '项目材料严格隔离',
    detail: '当前招标材料只属于本次项目和冻结快照，不进入企业资料库。',
  },
  {
    icon: ShieldCheck,
    title: '结果可追溯、可复算',
    detail: '外部评审、报价算法与成果版本都绑定证据、快照和明确版本。',
  },
];

export function App() {
  return (
    <main className="starter-shell">
      <section className="starter-hero" aria-labelledby="starter-title">
        <div className="starter-badge">BidVolt · Web Frontend</div>
        <h1 id="starter-title">投标工作，从材料到交付都清楚可控</h1>
        <p>
          独立的浏览器端投标工作台正在搭建。首个版本覆盖企业资料、项目材料、评审与报价核心闭环。
        </p>
        <button className="starter-action" type="button">
          进入开发工作台
          <ArrowRight aria-hidden="true" size={18} />
        </button>
      </section>

      <section className="starter-grid" aria-label="产品边界">
        {principles.map(({ icon: Icon, title, detail }) => (
          <article className="starter-card" key={title}>
            <span className="starter-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <h2>{title}</h2>
            <p>{detail}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
