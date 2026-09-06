import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  collectWholePackageVersions,
  PROJECT_RESULT_CATEGORIES,
  ProjectResourceRail,
  projectResultFileKey,
  upsertProjectResultFiles,
  type ProjectResultFile,
} from './ProjectResourceRail';

const businessFile: ProjectResultFile = {
  category: 'business',
  id: 'shared-id',
  name: '商务偏差表.docx',
  sizeLabel: '24.6 KB',
  versionLabel: 'v1',
};

const technicalFile: ProjectResultFile = {
  category: 'technical',
  id: 'shared-id',
  name: '专项响应文件.docx',
};

describe('ProjectResourceRail', () => {
  it('keeps the all-results download busy until the returned request finishes', async () => {
    let resolve!: () => void;
    const onDownload = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<ProjectResourceRail resultGeneration={{ overall: 'completed' }} resultFiles={[businessFile]} onDownloadAllResults={onDownload} />);
    const button = screen.getByRole('button', { name: '下载全部标书成果' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onDownload).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('正在打包下载…');
    await act(async () => resolve());
    expect(button).toBeEnabled();
  });
  it('keeps original and saved Office revisions under their existing folder', async () => {
    const user = userEvent.setup();
    const onSelectTenderMaterial = vi.fn();
    render(<ProjectResourceRail resultGeneration={{ overall: 'completed' }} tenderMaterials={[{
      id: 'contract', name: '合同.docx', officeVersions: [
        { version: 1, isCurrent: true }, { version: 0 },
      ],
    }]} onSelectTenderMaterial={onSelectTenderMaterial} />);
    await user.click(screen.getByRole('button', { name: '招标材料 1项' }));
    await user.click(screen.getByText('历史版本 · 2'));
    await user.click(screen.getByRole('button', { name: '打开 合同.docx 原始版本' }));
    expect(onSelectTenderMaterial).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'contract', officeVersion: 0 }));
    await user.click(screen.getByRole('button', { name: '打开 合同.docx 修订 V1' }));
    expect(onSelectTenderMaterial).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'contract', officeVersion: 1 }));
    expect(screen.getByRole('button', { name: '打开 合同.docx 原始版本' })).toBeInTheDocument();
  });
  it.each(['pending', 'generating', 'completed', 'failed'] as const)(
    'shows only material counts beside top-level labels even when results are %s',
    (overall) => {
      render(
        <ProjectResourceRail
          enterpriseFiles={[{ id: 'enterprise-1', name: '营业执照.pdf' }]}
          tenderMaterials={[
            { id: 'tender-1', name: '招标文件.pdf' },
            { id: 'tender-2', name: '补充材料.docx' },
            { id: 'tender-3', name: '公告.html' },
          ]}
          resultFiles={[businessFile, technicalFile, { ...businessFile }]}
          resultGeneration={{ overall }}
        />,
      );

      const groups = [
        screen.getByRole('button', { name: '企业资料 1项' }),
        screen.getByRole('button', { name: '招标材料 3项' }),
        screen.getByRole('button', { name: /^标书成果.*2项$/ }),
      ];
      groups.forEach((group) => {
        expect(group.querySelector('small')).toHaveClass('bv-resource-rail__group-count');
        expect(within(group).queryByRole('img')).not.toBeInTheDocument();
        expect(within(group).queryByRole('checkbox')).not.toBeInTheDocument();
        expect(group).not.toHaveAttribute('aria-checked');
        expect(group.querySelector('.bv-resource-generation-icon')).toBeNull();
        expect(group.querySelector('.bv-resource-rail__group-chevron')).toBeInTheDocument();
      });
      expect(groups.map((group) => group.querySelector('small')?.textContent)).toEqual(['1项', '3项', '2项']);
    },
  );

  it('shows zero for empty groups and updates counts when materials arrive', () => {
    const { rerender } = render(<ProjectResourceRail resultGeneration={{ overall: 'pending' }} />);
    for (const label of ['企业资料', '招标材料', '标书成果']) {
      expect(screen.getByRole('button', { name: `${label} 0项` })).toBeInTheDocument();
    }
    rerender(
      <ProjectResourceRail
        enterpriseFiles={[{ id: 'enterprise-1', name: '营业执照.pdf' }]}
        tenderMaterials={[{ id: 'tender-1', name: '招标文件.pdf' }]}
        resultFiles={[businessFile]}
        resultGeneration={{ overall: 'completed' }}
      />,
    );
    for (const label of ['企业资料', '招标材料', '标书成果']) {
      expect(screen.getByRole('button', { name: `${label} 1项` })).toBeInTheDocument();
    }
  });

  it('keeps zero counts visible while generation is running, without top-level status or checkbox icons', () => {
    render(<ProjectResourceRail resultGeneration={{ overall: 'generating' }} />);

    for (const name of ['企业资料 0项', '招标材料 0项', '标书成果（生成中） 0项']) {
      const group = screen.getByRole('button', { name });
      expect(group.querySelector('small')).toHaveClass('bv-resource-rail__group-count');
      expect(group.querySelector('small')).toHaveTextContent('0项');
      expect(group.querySelector('.bv-resource-generation-icon')).toBeNull();
      expect(within(group).queryByRole('checkbox')).not.toBeInTheDocument();
      expect(within(group).queryByRole('img')).not.toBeInTheDocument();
    }
  });

  it('preserves all three material counts through repeated collapse and expansion', async () => {
    const user = userEvent.setup();
    render(<ProjectResourceRail
      enterpriseFiles={[{ id: 'enterprise-1', name: '营业执照.pdf' }]}
      tenderMaterials={[{ id: 'tender-1', name: '招标.docx' }, { id: 'tender-2', name: '补充.pdf' }]}
      resultFiles={[businessFile, technicalFile, { ...businessFile }]}
      resultGeneration={{ overall: 'generating' }}
    />);

    const names = ['企业资料 1项', '招标材料 2项', '标书成果（生成中） 2项'];
    for (const name of names) {
      const group = screen.getByRole('button', { name });
      const initialExpanded = group.getAttribute('aria-expanded');
      const initialCount = group.querySelector('small')?.textContent;
      await user.click(group);
      expect(group).toHaveAttribute('aria-expanded', initialExpanded === 'true' ? 'false' : 'true');
      expect(group.querySelector('small')?.textContent).toBe(initialCount);
      await user.click(group);
      expect(group).toHaveAttribute('aria-expanded', initialExpanded);
      expect(group.querySelector('small')?.textContent).toBe(initialCount);
    }
    names.forEach((name) => expect(screen.getByRole('button', { name })).toBeInTheDocument());
  });

  it('keeps enterprise and tender groups collapsed while results are expanded by default', () => {
    render(
      <ProjectResourceRail
        enterpriseCategories={[{ id: 'license', label: '证照' }]}
        enterpriseFiles={[{ categoryId: 'license', id: 'enterprise-1', name: '营业执照.pdf' }]}
        enterpriseUploadControl={<button type="button">上传企业资料</button>}
        resultGeneration={{ overall: 'generating' }}
        tenderMaterials={[{ id: 'tender-1', kind: 'tender', name: '招标文件.pdf' }]}
      />,
    );

    expect(screen.getByRole('button', { name: /^企业资料 \d+项$/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /招标材料/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /标书成果（生成中）/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.queryByText('营业执照.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('招标文件.pdf')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上传企业资料' })).not.toBeInTheDocument();
    PROJECT_RESULT_CATEGORIES.forEach((category) => {
      if (category === 'unclassified') {
        expect(screen.queryByRole('button', { name: /待分类成果/ })).not.toBeInTheDocument();
        return;
      }
      const label = {
        business: '商务文件',
        technical: '技术文件',
        price: '价格文件',
        internal: '内部管理文件',
      }[category];
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    });
  });

  it('shows enterprise categories and the upload slot only inside the expanded group', async () => {
    const user = userEvent.setup();
    render(
      <ProjectResourceRail
        enterpriseCategories={[{ id: 'license', label: '证照' }]}
        enterpriseFiles={[{ categoryId: 'license', id: 'enterprise-1', name: '营业执照.pdf' }]}
        enterpriseUploadControl={<button type="button">上传企业资料</button>}
        resultGeneration={{ overall: 'pending' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^企业资料 \d+项$/ }));
    expect(screen.getByRole('region', { name: '企业资料内容' })).toHaveClass('bv-resource-rail__group-content--enterprise');
    expect(screen.getByRole('region', { name: '标书成果文件夹' })).toHaveClass('bv-resource-rail__group-content--results');
    expect(screen.getByRole('button', { name: /证照/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '上传企业资料' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /证照/ }));
    expect(screen.getByText('营业执照.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^企业资料 \d+项$/ }));
    expect(screen.queryByRole('button', { name: '上传企业资料' })).not.toBeInTheDocument();
  });

  it('expands tender materials and forwards navigation without mutating them', async () => {
    const user = userEvent.setup();
    const material = { id: 'notice-1', kind: 'notice' as const, name: '项目招标公告.html' };
    const onSelectTenderMaterial = vi.fn();
    render(
      <ProjectResourceRail
        onSelectTenderMaterial={onSelectTenderMaterial}
        resultGeneration={{ overall: 'generating' }}
        tenderMaterials={[material]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /招标材料/ }));
    await user.click(screen.getByRole('button', { name: /项目招标公告\.html/ }));
    expect(onSelectTenderMaterial).toHaveBeenCalledWith(material);
    expect(screen.getByText('招标公告')).toBeInTheDocument();
  });

  it('renders backend files only in their explicit folder and marks the controlled selection', async () => {
    const user = userEvent.setup();
    const onSelectResultFile = vi.fn();
    render(
      <ProjectResourceRail
        onSelectResultFile={onSelectResultFile}
        resultFiles={[businessFile, technicalFile]}
        resultGeneration={{
          folders: { business: 'completed', technical: 'generating' },
          overall: 'generating',
        }}
        selectedResultFile={{ category: 'business', id: 'shared-id' }}
      />,
    );

    const businessFolder = screen.getByRole('button', { name: /商务文件.*已生成/ });
    const technicalFolder = screen.getByRole('button', { name: /技术文件.*生成中/ });
    expect(businessFolder).toHaveAttribute('aria-expanded', 'true');
    const businessList = screen.getByRole('list', { name: '标书成果文件' });
    const selectedButton = within(businessList).getByRole('button', { name: /商务偏差表\.docx/ });
    expect(selectedButton).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('专项响应文件.docx')).not.toBeInTheDocument();

    await user.click(selectedButton);
    expect(onSelectResultFile).toHaveBeenCalledWith(businessFile);

    await user.click(technicalFolder);
    expect(screen.getByText('专项响应文件.docx')).toBeInTheDocument();
  });

  it('keeps completion state inside result folders, not beside the top-level count', () => {
    render(
      <ProjectResourceRail
        resultGeneration={{ overall: 'completed' }}
      />,
    );

    expect(screen.getByRole('button', { name: /标书成果.*0项/ })).toBeInTheDocument();
    expect(screen.queryByText('标书成果（已生成）')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('已生成')).toHaveLength(4);
    expect(screen.queryByText('已生成')).not.toBeInTheDocument();
  });

  it('reveals a controlled file selected from another part of the workspace', () => {
    render(
      <ProjectResourceRail
        resultFiles={[technicalFile]}
        resultGeneration={{ overall: 'completed' }}
        selectedResultFile={{ category: 'technical', id: 'shared-id' }}
      />,
    );

    expect(screen.getByRole('button', { name: /技术文件.*已生成/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('专项响应文件.docx')).toBeInTheDocument();
  });

  it('shows only backend-supplied whole-package versions and forwards the selected version', async () => {
    const user = userEvent.setup();
    const onSelectResultVersion = vi.fn();
    const onSelectResultFile = vi.fn();
    const versionedFile: ProjectResultFile = {
      ...businessFile,
      selectedVersionId: '3',
      versionLabel: 'V3',
      versions: [
        { id: '3', isCurrent: true, label: 'V3' },
        { id: '2', label: 'V2' },
      ],
      officeVersions: [{ version: 1, isCurrent: true }, { version: 0 }],
    };
    const { rerender } = render(
      <ProjectResourceRail
        onSelectResultFile={onSelectResultFile}
        onSelectResultVersion={onSelectResultVersion}
        resultFiles={[versionedFile]}
        resultGeneration={{ overall: 'completed' }}
        selectedResultFile={{ category: 'business', id: 'shared-id', versionId: '3' }}
      />,
    );

    const versionSelect = screen.getByRole('combobox', { name: '标书成果整包版本' });
    expect(versionSelect.closest('label')?.querySelector('small')).toBeNull();
    expect(screen.queryByText(/已生成.*个整包版本/)).not.toBeInTheDocument();
    expect(screen.queryByText(/文件旁 Vn 表示单文件修订/)).not.toBeInTheDocument();
    expect(screen.getByText('V3 · 24.6 KB')).toBeInTheDocument();
    expect(within(versionSelect).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['V3 · 最新', 'V2']);
    await user.selectOptions(versionSelect, '2');
    expect(onSelectResultVersion).toHaveBeenCalledWith('2');

    rerender(<ProjectResourceRail
      onSelectResultFile={onSelectResultFile}
      onSelectResultVersion={onSelectResultVersion}
      resultFiles={[versionedFile]}
      resultGeneration={{ overall: 'completed' }}
      selectedResultVersionId="2"
      selectedResultFile={{ category: 'business', id: 'shared-id', versionId: '2' }}
    />);
    expect(screen.getByRole('combobox', { name: '标书成果整包版本' })).toHaveValue('2');
    await user.click(screen.getByText('历史版本 · 2'));
    await user.click(screen.getByRole('button', { name: '打开 商务偏差表.docx 原始版本' }));
    expect(onSelectResultFile).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'business', id: 'shared-id', officeVersion: 0 }));
    await user.click(screen.getByRole('button', { name: '打开 商务偏差表.docx 修订 V1' }));
    expect(onSelectResultFile).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'business', id: 'shared-id', officeVersion: 1 }));
  });

  it('does not advertise a partial file version as a whole-package version', () => {
    const versions = collectWholePackageVersions([
      {
        ...businessFile,
        versions: [
          { id: '3', isCurrent: true, label: 'V3' },
          { id: '2', label: 'V2' },
        ],
      },
      {
        ...technicalFile,
        versions: [{ id: '2', isCurrent: true, label: 'V2' }],
      },
    ]);

    expect(versions).toEqual([{ id: '2', isCurrent: false, label: 'V2' }]);
  });
});

describe('upsertProjectResultFiles', () => {
  it('uses category plus stable id as the identity and keeps backend arrival order', () => {
    const merged = upsertProjectResultFiles(
      [businessFile, technicalFile],
      [
        { ...businessFile, name: '商务偏差表-v2.docx', versionLabel: 'v2' },
        { category: 'price', id: 'price-1', name: '报价明细.xlsx' },
      ],
    );

    expect(merged).toHaveLength(3);
    expect(merged.map(projectResultFileKey)).toEqual([
      'business:shared-id',
      'technical:shared-id',
      'price:price-1',
    ]);
    expect(merged[0]).toMatchObject({ name: '商务偏差表-v2.docx', versionLabel: 'v2' });
  });

  it('drops an unknown backend category instead of guessing from a filename', () => {
    const invalid = {
      category: 'unknown',
      id: 'unknown-1',
      name: '商务文件.docx',
    } as unknown as ProjectResultFile;

    expect(upsertProjectResultFiles([], [invalid])).toEqual([]);
  });
});
