import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectFlowTrack, type ProjectFlowTrackProps } from './ProjectFlowTrack';

const stages: ProjectFlowTrackProps['stages'] = {
  'enterprise-assets': { status: 'completed', description: '资料已入库' },
  'project-materials': { status: 'current', statusLabel: '解析中', description: '正在解析招标文件' },
  'bid-preparation': { status: 'pending' },
  deliverables: { status: 'error', description: '生成任务执行失败' },
};

describe('ProjectFlowTrack', () => {
  it('renders the four project stages with caller-supplied statuses and descriptions', () => {
    render(<ProjectFlowTrack stages={stages} />);

    const flow = screen.getByRole('navigation', { name: '项目流程' });
    const items = within(flow).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('已完成');
    expect(items[0]).toHaveTextContent('上传企业资料');
    expect(items[0]).toHaveTextContent('资料已入库');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1].querySelector('.project-flow-track__marker')).toHaveTextContent('2');
    expect(items[1]).toHaveTextContent('上传材料');
    expect(items[1]).toHaveTextContent('解析中');
    expect(items[2].querySelector('.project-flow-track__marker')).toHaveTextContent('3');
    expect(items[2]).toHaveTextContent('标书制作/审核');
    expect(items[2]).toHaveTextContent('未开始');
    expect(items[3]).toHaveTextContent('成果生成');
    expect(items[3]).toHaveTextContent('生成任务执行失败');
    expect(items[0].querySelector('.project-flow-track__connector')).toHaveClass(
      'project-flow-track__connector--completed',
    );
    expect(items[1].querySelector('.project-flow-track__connector')).not.toHaveClass(
      'project-flow-track__connector--completed',
    );
  });

  it('does not invent descriptions when the caller does not provide them', () => {
    render(
      <ProjectFlowTrack
        stages={{
          'enterprise-assets': { status: 'pending' },
          'project-materials': { status: 'pending' },
          'bid-preparation': { status: 'pending' },
          deliverables: { status: 'pending' },
        }}
      />,
    );

    expect(screen.getAllByText(/未开始/)).toHaveLength(4);
    expect(screen.queryByText('资料已入库')).not.toBeInTheDocument();
  });

  it('omits all visible remarks in compact mode but preserves accessible stage state', () => {
    render(<ProjectFlowTrack showDetails={false} stages={stages} />);

    const flow = screen.getByRole('navigation', { name: '项目流程' });
    const items = within(flow).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(flow.querySelector('.project-flow-track__meta')).not.toBeInTheDocument();
    expect([...flow.querySelectorAll('.project-flow-track__content')].map((item) => item.textContent)).toEqual([
      '上传企业资料', '上传材料', '标书制作/审核', '成果生成',
    ]);
    expect(items[0]).toHaveAccessibleName('上传企业资料：已完成');
    expect(items[0]).toHaveClass('project-flow-track__stage--completed');
    expect(items[1]).toHaveAccessibleName('上传材料：解析中');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).toHaveAccessibleName('标书制作/审核：未开始');
    expect(items[3]).toHaveAccessibleName('成果生成：存在异常');
    expect(items[3]).toHaveClass('project-flow-track__stage--error');
    expect(flow).not.toHaveTextContent('已完成');
    expect(flow).not.toHaveTextContent('解析中');
    expect(flow).not.toHaveTextContent('资料已入库');
    expect(flow).not.toHaveTextContent('生成任务执行失败');
    expect(items[0].querySelector('.project-flow-track__connector')).toHaveClass(
      'project-flow-track__connector--completed',
    );
  });
});
