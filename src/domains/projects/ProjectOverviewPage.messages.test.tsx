import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

import type { ProjectGenerationWorkspace } from './ProjectGenerationWorkspace';
import { ProjectOverviewPage } from './ProjectOverviewPage';

const { captureWorkspace } = vi.hoisted(() => ({ captureWorkspace: vi.fn() }));

vi.mock('./ProjectGenerationWorkspace', () => ({
  ProjectGenerationWorkspace: (props: ComponentProps<typeof ProjectGenerationWorkspace>) => {
    captureWorkspace(props);
    return null;
  },
}));

describe('ProjectOverviewPage message contract', () => {
  it.each(['queue', 'steer'] as const)('preserves %s mode and the main-session response', async (mode) => {
    const response = { reply: '已按当前项目上下文处理。', queued: false };
    const onAssistantSend = vi.fn().mockResolvedValue(response);
    render(
      <ProjectOverviewPage
        agentRun={{
          actionList: [], completion: 'complete', conversation: [], errorMessage: null,
          message: '成果已完成', outcome: null, percent: 100, phase: '成果生成',
          projectId: '207', questions: [], reason: null, sessionId: 'existing-session',
          status: 'succeeded', streamState: 'ended', taskId: '3499',
        }}
        enterpriseMaterials={[]}
        materials={[]}
        onAssistantSend={onAssistantSend}
        onOpenTasks={vi.fn()}
        project={{
          id: '207', code: '207', title: '测试项目', buyer: '测试招标人',
          stage: '材料解析', progress: 100, deadline: '', materialCount: 0,
          riskCount: 0, updatedAt: '',
        }}
        projectId="207"
      />,
    );

    const props = captureWorkspace.mock.calls.at(-1)?.[0] as ComponentProps<typeof ProjectOverviewPage>;
    expect(props.onAssistantSend).toBe(onAssistantSend);
    expect(await props.onAssistantSend?.('调整当前文件', mode)).toBe(response);
    expect(onAssistantSend).toHaveBeenCalledWith('调整当前文件', mode);
  });
});
