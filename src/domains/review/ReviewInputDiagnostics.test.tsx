import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Requirement, ScoreSummary } from '../../shared/backend-api';
import { ReviewInputDiagnostics } from './ReviewInputDiagnostics';

const score: ScoreSummary = {
  score_id: 101, review_run_id: 12, snapshot_id: 247, total_score: 100,
  missing_count: 0, improvable: 0, detail: { score_rules: { count: 0 } },
  scale: 'builtin', full_marks: 30, got_marks: 30, deliverable_versions: { '25': 1 },
};
const rule: Requirement = {
  req_id: 8, req_type: 'score_rule', req_key: null, content: 'fixture',
  structured: { score_rule: { weight: 20, criterion: 'fixture criterion' } },
  coordinates: null, confidence: null, revision: 2, source_file_id: 3,
};
const defaults = {
  projectId: '207', requirements: [] as Requirement[], score,
  loading: false, requirementsFailed: false, scoreFailed: false, onRefresh: vi.fn(),
};
function metric(label: string) {
  return within(screen.getByText(label).parentElement!).getByRole('definition');
}

describe('ReviewInputDiagnostics', () => {
  it('distinguishes integrity scoring and zero current rules from tender quality', () => {
    render(<ReviewInputDiagnostics {...defaults} />);
    expect(metric('当前有效要求 / 评分细则')).toHaveTextContent('0 / 0 条');
    expect(metric('本次评审记录的细则数量')).toHaveTextContent('0 条');
    expect(metric('最新评分口径')).toHaveTextContent('不是招标评标得分');
    expect(metric('评审 / 评分 / 快照编号')).toHaveTextContent('12 / 101 / 247');
    expect(screen.getByRole('status')).toHaveTextContent('这不代表原招标文件没有评分细则');
  });
  it('flags current rules versus an earlier integrity score without assuming they share a version', () => {
    render(<ReviewInputDiagnostics {...defaults} requirements={[rule]} />);
    expect(screen.getByRole('status')).toHaveTextContent('需核对细则产生时间');
    expect(metric('当前有效要求 / 评分细则')).toHaveTextContent('1 / 1 条');
    expect(screen.getByText('#8')).toBeInTheDocument();
    expect(screen.queryByText('fixture criterion')).not.toBeInTheDocument();
  });
  it('shows actual rule metadata and missing positive weights without inventing a default', () => {
    render(<ReviewInputDiagnostics {...defaults} requirements={[rule, { ...rule, req_id: 9, structured: null }]}
      score={{ ...score, scale: 'score_rules', detail: { score_rules: { count: 2 } } }} />);
    expect(metric('细则缺少有效正数分值')).toHaveTextContent('1 条');
    expect(screen.getByRole('status')).toHaveTextContent('不能把接口成功等同业务评分准确');
    expect(screen.getByText('未提供有效正数')).toBeInTheDocument();
  });
  it.each([{ requirementsFailed: true }, { loading: true }])('does not report stale requirements as current: %j', (state) => {
    render(<ReviewInputDiagnostics {...defaults} requirements={[rule]} {...state} />);
    expect(metric('当前有效要求 / 评分细则')).toHaveTextContent('待读取');
    expect(screen.getByRole('status')).not.toHaveTextContent('当前已有评分细则');
    expect(screen.queryByText('#8')).not.toBeInTheDocument();
  });
  it('does not report stale score data after a failed read', () => {
    render(<ReviewInputDiagnostics {...defaults} scoreFailed />);
    expect(metric('最新评分口径')).toHaveTextContent('待读取');
    expect(metric('评审 / 评分 / 快照编号')).toHaveTextContent('—');
    expect(screen.getByRole('status')).toHaveTextContent('不能按 0 条判断');
  });
  it.each([undefined, -1, 1.5, ''])('does not replace missing or invalid count %s with zero', (count) => {
    render(<ReviewInputDiagnostics {...defaults} score={{ ...score, detail: count === undefined ? {} : { score_rules: { count } } }} />);
    expect(metric('本次评审记录的细则数量')).toHaveTextContent('未取得计数');
  });
  it('can refresh existing data and disables refresh while loading', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<ReviewInputDiagnostics {...defaults} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: '重新读取评审输入' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    rerender(<ReviewInputDiagnostics {...defaults} onRefresh={onRefresh} loading />);
    expect(screen.getByRole('button', { name: '读取中…' })).toBeDisabled();
  });
});
