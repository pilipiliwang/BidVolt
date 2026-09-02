import { AlertTriangle, ScanText } from 'lucide-react';

import type { ImageDescriptionPayload } from '../backend-api/types';
import './ImageDescriptionSummary.css';

const readableValues = (values?: string[]) => values?.filter((value) => value.trim()).join('、') || '';

export function ImageDescriptionSummary({
  description,
  title,
}: {
  description: ImageDescriptionPayload;
  title?: string;
}) {
  const firstPass = readableValues(description.numbers_pass1 ?? description.numbers);
  const verified = readableValues(description.numbers_verified);
  const conflicts = readableValues(description.numbers_conflict);
  const hasDetails = Boolean(
    description.text_summary
      || description.subject
      || firstPass
      || verified
      || description.dates?.length
      || description.amounts?.length,
  );

  return (
    <article className="image-description-summary">
      <header>
        <ScanText aria-hidden="true" size={16} />
        <strong>{title ?? description.doc_type ?? '图片识别结果'}</strong>
        {description.verify_mode ? (
          <span>{description.verify_mode === 'vl_high_res' ? '高分辨率复核' : '切块复核'}</span>
        ) : null}
      </header>
      {description.text_summary ? <p>{description.text_summary}</p> : null}
      {hasDetails ? (
        <dl>
          {description.subject ? <><dt>主体</dt><dd>{description.subject}</dd></> : null}
          {verified ? <><dt>二次读数</dt><dd>{verified}</dd></> : null}
          {firstPass ? <><dt>首次读数</dt><dd>{firstPass}</dd></> : null}
          {description.dates?.length ? <><dt>日期</dt><dd>{readableValues(description.dates)}</dd></> : null}
          {description.amounts?.length ? <><dt>金额</dt><dd>{readableValues(description.amounts)}</dd></> : null}
        </dl>
      ) : <p>后端尚未返回可展示的结构化内容。</p>}
      {conflicts ? (
        <div className="image-description-summary__conflict" role="alert">
          <AlertTriangle aria-hidden="true" size={15} />
          <span>
            两次编号识别不一致：{conflicts}。请同时对照首次读数、二次读数和原件，系统不会自动替您选值。
          </span>
        </div>
      ) : null}
    </article>
  );
}
