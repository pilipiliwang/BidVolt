import { useState, type FormEvent } from 'react';
import {
  BarChart3,
  ClipboardCheck,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Rocket,
  ShieldCheck,
} from 'lucide-react';

import { BrandLogo } from '../../shared/ui/BrandLogo';
import '../../styles/ui0802-shell.css';

export type LoginCredentials = {
  email: string;
  password: string;
  remember: boolean;
};

export type RegisterCredentials = {
  email: string;
  enterpriseName: string;
  password: string;
};

type LoginPageProps = {
  error?: string;
  isSubmitting?: boolean;
  localPreviewAvailable?: boolean;
  onLogin?: (credentials: LoginCredentials) => void | Promise<void>;
  onOpenLocalPreview?: () => void;
  onRegister?: (credentials: RegisterCredentials) => void | Promise<void>;
};

const featureItems = [
  {
    title: '高效生成',
    description: 'AI智能生成各类投标文件，\n大幅提升编制效率。',
    icon: Rocket,
  },
  {
    title: '专业规范',
    description: '内置行业标准与模板，\n确保文件专业合规。',
    icon: ShieldCheck,
  },
  {
    title: '模拟评标',
    description: '模拟评标流程与规则，\n精准优化投标策略。',
    icon: ClipboardCheck,
  },
  {
    title: '智能报价',
    description: '基于历史中标数据库，\n提供报价依据。',
    icon: BarChart3,
  },
] as const;

function LoginPowerScenery() {
  return (
    <svg className="login0802__power-scenery" viewBox="0 0 980 780" aria-hidden="true">
      <g className="login0802__tower login0802__tower--large">
        <path d="M580 54 485 598M580 54l103 544M512 440h140M526 350h112M542 256h80M557 164h48M580 54v544M492 595h186M520 438l128 156M647 438 493 594M528 349l120 89M638 349 520 438M542 255l96 94M622 255l-94 94M557 163l65 92M605 163l-63 92M548 132h68M536 176h92" />
        <path d="M580 56 544 132h73L580 56ZM542 255h80l-40-92-40 92ZM527 349h112l-57-94-55 94ZM511 439h141l-70-90-71 90Z" />
      </g>
      <g className="login0802__tower login0802__tower--small">
        <path d="M332 268 275 610M332 268l61 342M288 510h90M297 447h71M307 383h50M317 322h30M332 268v342M279 608h110M288 508l98 100M375 508l-96 100M297 446l78 62M368 446l-80 62M307 382l61 64M357 382l-60 64M317 322l40 60M347 322l-40 60M311 337h45" />
      </g>
      <g className="login0802__tower login0802__tower--mini">
        <path d="M760 286 719 616M760 286l46 330M727 520h70M733 459h55M740 398h40M747 340h28M760 286v330M721 615h83M727 520l76 95M796 520l-75 95M733 459l63 61M788 459l-61 61M740 398l48 61M780 398l-47 61" />
      </g>
      <path className="login0802__wire" d="M0 318c175-43 284-39 473-12 178 26 276 15 507-58" />
      <path className="login0802__wire" d="M0 344c175-43 284-39 473-12 178 26 276 15 507-58" />
    </svg>
  );
}

function LoginWaveScenery() {
  return (
    <svg className="login0802__wave-scenery" viewBox="0 0 1672 420" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="login-wave-fill" x1="0" y1="0" x2="1" y2=".7">
          <stop offset="0" stopColor="#00a878" stopOpacity=".68" />
          <stop offset=".55" stopColor="#00a878" stopOpacity=".24" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 198c244-143 437-73 661-34 261 45 449-92 681-127 138-21 237-5 330 16v367H0V198Z" fill="url(#login-wave-fill)" />
      <g fill="none" stroke="#b6f0db" strokeWidth="1.2" opacity=".72">
        <path d="M0 237c232-130 420-68 649-25 265 50 462-76 691-112 145-23 245-10 332 7" />
        <path d="M0 268c232-124 416-57 649-16 268 47 460-71 690-105 145-21 246-7 333 11" />
        <path d="M0 298c234-112 419-48 653-9 267 44 458-63 686-97 147-22 247-4 333 16" />
        <path d="M0 330c235-104 421-44 655-3 263 46 455-58 683-91 147-21 248-1 334 20" />
      </g>
      <g fill="#ecfff8" opacity=".92">
        {Array.from({ length: 23 }, (_, index) => (
          <circle key={index} cx={34 + index * 42} cy={318 - ((index * 19) % 76)} r={index % 4 === 0 ? 3.2 : 2} />
        ))}
      </g>
    </svg>
  );
}

export function LoginPage({
  error,
  isSubmitting = false,
  localPreviewAvailable = false,
  onLogin,
  onOpenLocalPreview,
  onRegister,
}: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enterpriseName, setEnterpriseName] = useState('');
  const [remember, setRemember] = useState(true);
  const [forgotNotice, setForgotNotice] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === 'login') {
      void onLogin?.({ email, password, remember });
      return;
    }
    void onRegister?.({ email, enterpriseName, password });
  };

  return (
    <main className="login0802">
      <LoginPowerScenery />
      <LoginWaveScenery />
      <section className="login0802__story" aria-label="产品能力介绍">
        <div className="login0802__brand">
          <BrandLogo />
          <strong>AI电网投标助手</strong>
        </div>
        <div className="login0802__brand-rule" aria-hidden="true" />
        <p className="login0802__lead">
          专为电力行业投标打造的智能助手，融合AI技术与行业知识，<br />
          提升投标效率与中标竞争力，助力企业赢得更多项目。
        </p>

        <div className="login0802__features">
          {featureItems.map(({ title, description, icon: Icon }) => (
            <article key={title} className="login0802__feature">
              <span className="login0802__feature-icon" aria-hidden="true">
                <Icon size={41} strokeWidth={2.4} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="login0802__card" aria-labelledby="login-panel-title">
        <div className="login0802__tabs" role="tablist" aria-label="账户操作">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => setMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => setMode('register')}
          >
            注册
          </button>
        </div>

        <form className="login0802__form" onSubmit={handleSubmit}>
          <h1 id="login-panel-title" className="sr-only">
            {mode === 'login' ? '登录AI电网投标助手' : '注册AI电网投标助手'}
          </h1>
          {mode === 'register' && onRegister ? (
            <label>
              <span>企业名称</span>
              <span className="login0802__input">
                <Building2 size={22} aria-hidden="true" />
                <input
                  type="text"
                  autoComplete="organization"
                  value={enterpriseName}
                  required
                  maxLength={200}
                  placeholder="请输入企业名称"
                  onChange={(event) => setEnterpriseName(event.target.value)}
                />
              </span>
            </label>
          ) : null}
          <label>
            <span>邮箱</span>
            <span className="login0802__input">
              <Mail size={22} aria-hidden="true" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                required
                placeholder="请输入邮箱地址"
                onChange={(event) => setEmail(event.target.value)}
              />
            </span>
          </label>
          <label>
            <span>密码</span>
            <span className="login0802__input">
              <LockKeyhole size={22} aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                required
                minLength={mode === 'register' ? 8 : 1}
                placeholder="请输入密码"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <Eye size={21} /> : <EyeOff size={21} />}
              </button>
            </span>
          </label>

          {mode === 'login' ? (
            <div className="login0802__form-options">
              <label className="login0802__remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>记住登录状态</span>
              </label>
              <button
                className="login0802__forgot"
                type="button"
                onClick={() => setForgotNotice('当前后端尚未提供找回密码接口，请联系企业管理员重置密码。')}
              >
                忘记密码？
              </button>
            </div>
          ) : !onRegister ? (
            <p className="login0802__register-note">注册入口将在企业管理员审核后开放。</p>
          ) : null}

          {error ? <p className="login0802__register-note" role="alert">{error}</p> : null}
          {forgotNotice && mode === 'login' ? <p className="login0802__register-note" role="status">{forgotNotice}</p> : null}

          <button
            className="login0802__submit"
            type="submit"
            disabled={isSubmitting || (mode === 'register' && !onRegister)}
          >
            {isSubmitting
              ? '请稍候…'
              : mode === 'login'
                ? '登录'
                : onRegister
                  ? '注册并进入'
                  : '提交注册申请'}
          </button>

          {mode === 'login' && localPreviewAvailable && onOpenLocalPreview ? (
            <section className="login0802__local-preview" aria-label="本地只读预览入口">
              <p><strong>后端不可用？</strong>可以进入本地只读界面预览。</p>
              <button type="button" onClick={onOpenLocalPreview}>进入本地只读预览</button>
              <small>仅 localhost 开发模式可见；不连接真实后端，不会提交任何数据。</small>
            </section>
          ) : null}
        </form>
      </section>
    </main>
  );
}
