import { describe, expect, it } from 'vitest';

import {
  adaptOutcomeWorkspaceFile,
  adaptProjectEnterpriseCategories,
  adaptProjectEnterpriseFiles,
  adaptProjectResultFiles,
  adaptProjectTenderMaterials,
  extractOutcomeWorkbook,
  extractOutcomeWordDocument,
} from './project-result-adapters';

describe('project result resource adapters', () => {
  it('converts enterprise category folders and workspace materials for the rail', () => {
    expect(adaptProjectEnterpriseCategories([
      { id: 'license', label: ' 证照 ', parentId: null },
      { id: '', label: '无效分类' },
    ])).toEqual([{ id: 'license', label: '证照', parentId: null }]);

    expect(adaptProjectEnterpriseFiles([
      {
        categoryId: 'license',
        id: 'enterprise:12',
        name: ' 营业执照.pdf ',
        status: '已归档',
      },
    ])).toEqual([{
      categoryId: 'license',
      id: 'enterprise:12',
      name: '营业执照.pdf',
      statusLabel: '已归档',
    }]);
  });

  it('uses persisted tender metadata and never guesses a role from the filename', () => {
    expect(adaptProjectTenderMaterials([
      { id: 'notice', kind: 'tender_notice', name: '公开招标.html', status: '已识别' },
      { id: 'supplement', name: '澄清文件.docx', purpose: 'supplemental' },
      { id: 'unknown', name: '项目招标公告.docx' },
    ])).toEqual([
      { id: 'notice', kind: 'notice', name: '公开招标.html', statusLabel: '已识别' },
      { id: 'supplement', kind: 'supplement', name: '澄清文件.docx' },
      { id: 'unknown', name: '项目招标公告.docx' },
    ]);
  });

  it('maps aggregate deliverables into all four supported result folders', () => {
    const files = adaptProjectResultFiles([
      { id: 'business', title: '商务标文件', versionId: '8' },
      { fileId: 42, id: 'technical', title: '技术标文件', versionId: 'v6' },
      { id: 'quote', name: '报价明细.xlsx', title: '报价单', versionId: 4 },
      { id: 'internal', title: '编制逻辑与评分响应记录.docx', versionId: 5 },
      { id: 'future-type', title: '未知成果' },
    ]);

    expect(files.map((file) => ({
      category: file.category,
      id: file.id,
      name: file.name,
      versionLabel: file.versionLabel,
    }))).toEqual([
      { category: 'business', id: 'business', name: '商务标文件', versionLabel: 'v8' },
      { category: 'technical', id: '42', name: '技术标文件', versionLabel: 'v6' },
      { category: 'price', id: 'quote', name: '报价明细.xlsx', versionLabel: 'v4' },
      { category: 'internal', id: 'internal', name: '编制逻辑与评分响应记录.docx', versionLabel: 'v5' },
    ]);
  });
});

describe('OutcomeWorkspaceFile adapters', () => {
  it('preserves image nodes without text and keeps unavailable images as visible placeholders', () => {
    const result = extractOutcomeWordDocument({ nodes: [
      { id: 'i1', page_no: 2, type: 'image', image_url: 'https://example.test/license.png', alt: '营业执照', width: 600, height: 800 },
      { id: 'i2', page_no: 2, type: 'image', src: 'word/media/image2.png', alt: '未解析资源' },
      { id: 'i3', page_no: 3, image: { src: 'data:image/png;base64,aGVsbG8=', alt: '证照' }, text: '图注' },
    ] });
    expect(result.pages[0]?.blocks[0]).toMatchObject({ type: 'image', text: '', image: { src: 'https://example.test/license.png', alt: '营业执照' } });
    expect(result.pages[0]?.blocks[1]).toMatchObject({ type: 'image', image: { alt: '未解析资源' } });
    expect(result.pages[0]?.blocks[1]?.image?.src).toBeUndefined();
    expect(result.pages[1]?.blocks[0]).toMatchObject({ type: 'image', text: '图注' });
  });

  it('keeps HTML images in reading order, including image-only paragraphs, without copying executable markup', () => {
    const result = extractOutcomeWordDocument({ html: '<h1>附件</h1><p>前文<img src="https://example.test/1.png" alt="证照" onerror="alert(1)">后文</p><p><img src="data:image/png;base64,aGVsbG8="></p><script>bad()</script><svg><text>bad svg</text></svg>' });
    expect(result.pages[0]?.blocks.map((block) => [block.type, block.text])).toEqual([
      ['heading', '附件'], ['paragraph', '前文'], ['image', ''], ['paragraph', '后文'], ['image', ''],
    ]);
    expect(result.pages[0]?.blocks[2]?.image).toMatchObject({ src: 'https://example.test/1.png', alt: '证照' });
    expect(JSON.stringify(result)).not.toContain('onerror');
    expect(JSON.stringify(result)).not.toContain('bad');
  });

  it('extracts backend Word pages and validates the supplied outline', () => {
    const document = extractOutcomeWordDocument({
      pages: [
        {
          blocks: [
            { block_id: 11, block_type: 'heading', heading_level: 1, text: '技术方案' },
            { block_id: 12, block_type: 'paragraph', text: '采用分阶段实施。' },
          ],
          page_id: 'page-a',
          title: '第一页',
        },
        {
          blocks: [{ id: 'heading-b', level: 5, text: '进度安排', type: 'heading' }],
          id: 'page-b',
        },
      ],
      outline: [
        { block_id: 11, id: 'outline-a', label: '技术方案', level: 1, page_id: 'page-a' },
        { id: 'broken', label: '无效锚点', page_id: 'missing-page' },
      ],
    });

    expect(document.pages).toHaveLength(2);
    expect(document.pages[0]).toMatchObject({
      id: 'page-a',
      label: '第一页',
      blocks: [
        { id: '11', level: 1, text: '技术方案', type: 'heading' },
        { id: '12', text: '采用分阶段实施。', type: 'paragraph' },
      ],
    });
    expect(document.pages[1]?.blocks[0]?.level).toBe(3);
    expect(document.outline).toEqual([{
      blockId: '11',
      id: 'outline-a',
      label: '技术方案',
      level: 1,
      pageId: 'page-a',
    }]);
  });

  it('extracts legacy nodes and HTML without executing markup', () => {
    const fromNodes = extractOutcomeWordDocument({
      nodes: [
        { id: 'h', page_no: 2, text: '商务响应', type: 'heading' },
        { id: 'p', page_no: 2, text: '响应正文', type: 'paragraph' },
      ],
    });
    expect(fromNodes.pages).toHaveLength(1);
    expect(fromNodes.pages[0]?.id).toBe('page-2');
    expect(fromNodes.outline?.[0]).toMatchObject({ blockId: 'h', label: '商务响应' });

    const fromHtml = extractOutcomeWordDocument({
      html: '<h1>商务文件</h1><script>window.bad = true</script><p>响应内容</p>',
    });
    expect(fromHtml.pages[0]?.blocks.map((block) => block.text)).toEqual(['商务文件', '响应内容']);
  });

  it('extracts every backend sheet and keeps formulas and formatted values', () => {
    const workbook = extractOutcomeWorkbook({
      workbook: {
        sheets: [
          {
            id: 'summary',
            name: '报价汇总',
            rows: [
              ['项目', '金额'],
              ['总计', { display_value: '¥1,200.00', formula: '=SUM(B3:B9)', value: 1200 }],
            ],
          },
          { data: [['设备', 2]], sheet_id: 9, sheet_name: '设备明细' },
          { id: 'invalid-without-name', rows: [['不应伪造 Sheet 名']] },
        ],
      },
    });

    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['报价汇总', '设备明细']);
    expect(workbook.sheets[0]?.rows[1]?.[1]).toEqual({
      displayValue: '¥1,200.00',
      formula: '=SUM(B3:B9)',
      value: 1200,
    });
    expect(workbook.sheets[1]).toMatchObject({ id: '9', rows: [['设备', 2]] });
  });

  it('creates honest empty models when backend content is absent or unknown', () => {
    const wordFile = adaptOutcomeWorkspaceFile(
      { fileId: 'business-main', id: 'business', title: '商务标文件', versionId: 3 },
      { model: { unsupported_payload: true }, version_no: 3 },
    );
    const priceFile = adaptOutcomeWorkspaceFile(
      { id: 'quote', title: '价格文件' },
      { model: { rows: [{ name: '不是动态 Sheet' }] } },
      { readOnly: false },
    );

    expect(wordFile).toMatchObject({
      categoryId: 'business',
      id: 'business-main',
      kind: 'word',
      readOnly: true,
      version: 'v3',
      wordDocument: { pages: [] },
    });
    expect(priceFile).toMatchObject({
      categoryId: 'price',
      kind: 'spreadsheet',
      readOnly: false,
      workbook: { sheets: [] },
    });
    expect(adaptOutcomeWorkspaceFile({ id: 'unknown', title: '未知' })).toBeUndefined();
  });

  it('builds a base Word file from canonical content and preserves explicit preview options', () => {
    const file = adaptOutcomeWorkspaceFile(
      { id: 'technical', title: '技术文件', versionId: 'v5' },
      {
        model: {
          wordDocument: {
            pages: [{ blocks: [{ id: 'h1', text: '实施方案', type: 'heading' }], id: 'p1' }],
          },
        },
      },
      { downloadUrl: '/download/technical', previewUrl: '/preview/technical', readOnly: false },
    );

    expect(file).toMatchObject({
      categoryId: 'technical',
      categoryLabel: '技术文件',
      downloadUrl: '/download/technical',
      previewUrl: '/preview/technical',
      readOnly: false,
      version: 'v5',
    });
    expect(file?.wordDocument?.outline?.[0]).toMatchObject({ label: '实施方案' });
  });
});
