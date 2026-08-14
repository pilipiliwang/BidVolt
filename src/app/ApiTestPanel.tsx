import { ChevronDown, FlaskConical } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import './ApiTestPanel.css';

export type ApiTestPanelProps = {
  children: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
};

export function ApiTestPanel({
  children,
  className,
  defaultExpanded = true,
}: ApiTestPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const titleId = useId();
  const contentId = useId();
  const rootClassName = ['api-test-panel', className].filter(Boolean).join(' ');

  return (
    <section
      aria-labelledby={titleId}
      className={rootClassName}
      data-expanded={expanded}
    >
      <header className="api-test-panel__header">
        <div className="api-test-panel__heading">
          <span className="api-test-panel__icon" aria-hidden="true">
            <FlaskConical size={17} />
          </span>
          <span className="api-test-panel__title-group">
            <strong id={titleId}>API 联调测试框</strong>
            <small>接口目录、调用结果与请求耗时，仅用于前后端联调</small>
          </span>
          <span className="api-test-panel__environment-badge">仅测试环境</span>
        </div>

        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={`${expanded ? '收起' : '展开'} API 联调测试框`}
          className="api-test-panel__toggle"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <span>{expanded ? '收起' : '展开'}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      </header>

      <div className="api-test-panel__body" hidden={!expanded} id={contentId}>
        {children}
      </div>
    </section>
  );
}
