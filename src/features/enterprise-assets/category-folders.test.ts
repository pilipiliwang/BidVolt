import { describe, expect, it } from 'vitest';

import {
  ALL_ENTERPRISE_ASSETS_FOLDER_ID,
  SOURCE_ENTERPRISE_ASSETS_FOLDER_ID,
  buildEnterpriseAssetFolders,
  isEnterpriseSourceArchive,
} from './category-folders';

const categories = [
  { id: 'license', label: '证照', parentId: null },
  { id: 'other', label: '其他', parentId: null },
];

describe('enterprise asset folders', () => {
  it.each(['资料.ZIP', '资料.rar', '资料.7z'])(
    'recognizes %s as an archive source file',
    (name) => expect(isEnterpriseSourceArchive({ name })).toBe(true),
  );

  it('shows every item in all assets while keeping archives out of backend business folders', () => {
    const folders = buildEnterpriseAssetFolders(
      categories,
      [
        { id: 'document', name: '营业执照.pdf', categoryId: 'license' },
        { id: 'archive', name: '原始资料.zip', categoryId: 'other' },
        { id: 'unknown', name: '补充说明.docx', categoryId: null },
      ],
      { allLabel: '全部资料', separateSourceArchives: true },
    );

    expect(folders.find((folder) => folder.id === ALL_ENTERPRISE_ASSETS_FOLDER_ID)).toMatchObject({
      label: '全部资料',
      items: [
        expect.objectContaining({ id: 'document' }),
        expect.objectContaining({ id: 'archive' }),
        expect.objectContaining({ id: 'unknown' }),
      ],
    });
    expect(folders.find((folder) => folder.id === 'enterprise-category:other')?.items).toEqual([]);
    expect(folders.find((folder) => folder.id === SOURCE_ENTERPRISE_ASSETS_FOLDER_ID)).toMatchObject({
      kind: 'source',
      label: '源文件',
      items: [expect.objectContaining({ id: 'archive' })],
    });
    expect(folders.slice(0, 2).map((folder) => folder.kind)).toEqual(['all', 'source']);
    expect(folders.find((folder) => folder.kind === 'uncategorized')?.items)
      .toEqual([expect.objectContaining({ id: 'unknown' })]);
  });

  it('preserves the shared all-assets behavior unless source separation is requested', () => {
    const folders = buildEnterpriseAssetFolders(categories, [
      { id: 'archive', name: '原始资料.zip', categoryId: 'other' },
    ]);

    expect(folders.find((folder) => folder.id === ALL_ENTERPRISE_ASSETS_FOLDER_ID)).toMatchObject({
      label: '全部资料',
      items: [expect.objectContaining({ id: 'archive' })],
    });
    expect(folders.some((folder) => folder.id === SOURCE_ENTERPRISE_ASSETS_FOLDER_ID)).toBe(false);
  });

  it('merges a backend source category into the single source view', () => {
    const folders = buildEnterpriseAssetFolders(
      [...categories, { id: 'source', label: '源文件', parentId: null }],
      [
        { id: 'backend-source', name: '原始资料包', categoryId: 'source' },
        { id: 'document', name: '营业执照.pdf', categoryId: 'license' },
      ],
      { separateSourceArchives: true },
    );

    expect(folders.filter((folder) => folder.label === '源文件')).toHaveLength(1);
    expect(folders.find((folder) => folder.id === SOURCE_ENTERPRISE_ASSETS_FOLDER_ID)?.items)
      .toEqual([expect.objectContaining({ id: 'backend-source' })]);
    expect(folders.find((folder) => folder.id === ALL_ENTERPRISE_ASSETS_FOLDER_ID)?.items)
      .toEqual([
        expect.objectContaining({ id: 'backend-source' }),
        expect.objectContaining({ id: 'document' }),
      ]);
  });
});
