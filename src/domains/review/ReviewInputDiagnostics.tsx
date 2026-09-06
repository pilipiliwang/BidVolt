import type { Requirement, ScoreSummary } from '../../shared/backend-api';
import './review-input-diagnostics.css';

type Props = {
  projectId: string;
  requirements?: Requirement[];
  score?: ScoreSummary;
  loading: boolean;
  requirementsFailed: boolean;
  scoreFailed: boolean;
  artifactCount?: number;
  deliverableCount?: number;
  onRefresh: () => void;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

export function ReviewInputDiagnostics({
  projectId, requirements, score, loading, requirementsFailed, scoreFailed,
  artifactCount, deliverableCount, onRefresh,
}: Props) {
  const requirementsReady = !loading && !requirementsFailed && requirements !== undefined;
  const scoreReady = !loading && !scoreFailed;
  const rules = requirementsReady ? requirements.filter((item) => item.req_type === 'score_rule') : [];
  const detail = record(score?.detail);
  const scale = score?.scale ?? detail.scale;
  const rawUsedCount = numeric(record(detail.score_rules).count);
  const usedCount = rawUsedCount !== undefined && Number.isInteger(rawUsedCount) && rawUsedCount >= 0
    ? rawUsedCount : undefined;
  const invalidWeightCount = rules.filter((item) => {
    const weight = numeric(record(record(item.structured).score_rule).weight);
    return weight === undefined || weight <= 0;
  }).length;
  let conclusion = '正在读取输入与评分，请稍候。';
  if (!loading) {
    if (!requirementsReady || scoreFailed) conclusion = '输入或评分读取失败/尚未就绪，不能按 0 条判断；请重新读取。';
    else if (!score) conclusion = '当前没有最新评分；这里只核对现有输入，不会自动发起评审。';
    else if (rules.length === 0 && scale === 'builtin') {
      conclusion = '当前要求接口没有返回 score_rule，本次评分使用内置完整性口径。需核对材料解析结果；这不代表原招标文件没有评分细则。';
    } else if (rules.length > 0 && (scale === 'builtin' || usedCount === 0)) {
      conclusion = '当前已有评分细则，但本次评分未体现使用。需核对细则产生时间、评审记录与输入版本，不能直接认定当前细则已用于本次评分。';
    } else if (scale === 'score_rules' && usedCount !== undefined && usedCount > 0) {
      conclusion = '本次评分记录包含评分细则；仍需核对标准、权重及实际成果版本，不能把接口成功等同业务评分准确。';
    } else conclusion = '评分口径或细则计数未完整返回，暂不能判断本次是否使用了招标评分细则。';
  }
  const scaleLabel = !scoreReady ? '待读取'
    : !score ? '暂无评分'
      : scale === 'builtin' ? '内置完整性（不是招标评标得分）'
        : scale === 'score_rules' ? '招标评分细则' : '未提供可识别口径';

  return (
    <section className="review-input-diagnostics" aria-label="评审输入核对">
      <header>
        <div><h3>评审输入核对 · 项目 #{projectId}</h3><p>只读联调信息；重新读取不会发起评审、确认建议或修改成果。</p></div>
        <button type="button" disabled={loading} onClick={onRefresh}>{loading ? '读取中…' : '重新读取评审输入'}</button>
      </header>
      <dl>
        <div><dt>当前有效要求 / 评分细则</dt><dd>{requirementsReady ? `${requirements.length} / ${rules.length} 条` : '待读取'}</dd></div>
        <div><dt>本次评审记录的细则数量</dt><dd>{scoreReady && score && usedCount !== undefined ? `${usedCount} 条` : '未取得计数'}</dd></div>
        <div><dt>最新评分口径</dt><dd>{scaleLabel}</dd></div>
        <div><dt>评审 / 评分 / 快照编号</dt><dd>{scoreReady && score ? `${score.review_run_id ?? '—'} / ${score.score_id} / ${score.snapshot_id ?? '—'}` : '—'}</dd></div>
        <div><dt>正式文件 / 结构化成果数量</dt><dd>{artifactCount ?? '—'} / {deliverableCount ?? '—'}</dd></div>
        <div><dt>细则缺少有效正数分值</dt><dd>{requirementsReady ? `${invalidWeightCount} 条` : '待读取'}</dd></div>
      </dl>
      <p role="status">{conclusion}</p>
      {scoreReady && score ? <p>评分绑定的结构化成果版本：{Object.entries(score.deliverable_versions ?? {}).map(([id, version]) => `#${id} · V${version}`).join('；') || '未提供'}。文件数量不能证明正式文件已进入评审。</p> : null}
      {requirementsReady && rules.length > 0 ? (
        <details><summary>查看评分细则字段核对（{rules.length} 条）</summary>
          <div className="review-input-diagnostics__table"><table>
            <thead><tr><th>要求编号</th><th>版本</th><th>分值</th><th>评分标准字段</th><th>来源文件</th></tr></thead>
            <tbody>{rules.map((item) => {
              const rule = record(record(item.structured).score_rule);
              const weight = numeric(rule.weight);
              return <tr key={item.req_id}><td>#{item.req_id}</td><td>{item.revision}</td>
                <td>{weight === undefined || weight <= 0 ? '未提供有效正数' : weight}</td>
                <td>{typeof rule.criterion === 'string' && rule.criterion.trim() ? '已提供' : '未提供（后端可能回退要求正文）'}</td>
                <td>{item.source_file_id == null ? '未关联文件' : `#${item.source_file_id}`}</td></tr>;
            })}</tbody>
          </table></div>
        </details>
      ) : null}
      <small>当前要求来自 GET /requirements?project_id={projectId}；评审口径和已用细则数量来自 GET /projects/{projectId}/scores。前者是当前数据，后者是评审时记录，不能仅按数量推断版本一致。</small>
    </section>
  );
}
