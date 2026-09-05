import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnlyOfficeEditorWorkspace } from './OnlyOfficeEditorWorkspace';

function mockCommunitySelection(selectedText: string) {
  let channel = '';
  const plugin = { postMessage: vi.fn((request: { requestId: string }) => {
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'http://localhost:8081', source: plugin as unknown as Window,
      data: { type: 'bidvolt-office-selection-result', channel, requestId: request.requestId, text: selectedText },
    })));
  }) };
  const docEditor = vi.fn(function MockCommunityEditor(
    this: { destroyEditor?: () => void }, _id: string, config: Record<string, unknown>,
  ) {
    this.destroyEditor = vi.fn();
    queueMicrotask(() => {
      (config.events as { onDocumentReady: () => void }).onDocumentReady();
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://localhost:8081', source: plugin as unknown as Window,
        data: { type: 'bidvolt-office-selection-ready', channel },
      }));
    });
  });
  window.DocsAPI = { DocEditor: docEditor as unknown as NonNullable<typeof window.DocsAPI>['DocEditor'] };
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: { body: string }) => {
    channel = JSON.parse(options.body).selectionBridge.channel;
    return { ok: true, json: async () => ({
      documentServerUrl: 'http://localhost:8080', editorConfig: { documentType: 'word' },
      sessionId: 'community-session', selectionBridge: { channel, origin: 'http://localhost:8081' },
    }) };
  }));
  return { docEditor, plugin };
}

describe('OnlyOfficeEditorWorkspace', () => {
  it('downloads the selected revision, reports failures and blocks stale downloads while dirty', async () => {
    const user = userEvent.setup();
    let dirty!: (event: { data: boolean }) => void;
    window.DocsAPI = { DocEditor: class {
      constructor(_id: string, config: Record<string, unknown>) {
        const events = config.events as { onDocumentReady: () => void; onDocumentStateChange: typeof dirty };
        dirty = events.onDocumentStateChange;
        queueMicrotask(events.onDocumentReady);
      }
    } };
    const fetchMock = vi.fn(async (url: string) => url.includes('/api/editor-sessions')
      ? { ok: true, json: async () => ({ documentServerUrl: 'http://localhost:8080', editorConfig: {}, sessionId: 'version-test' }) }
      : { ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    render(<OnlyOfficeEditorWorkspace
      bridgeFile={{ id: '1234567890abcdef', name: '成果.docx', relative: '成果.docx', size: 1000, latestVersion: 5 }}
      selectedVersion={2} displayName="成果.docx" onClose={vi.fn()} />);
    await screen.findByText('已连接');
    const button = screen.getByRole('button', { name: '下载文件' });
    await user.click(button);
    expect(fetchMock).toHaveBeenLastCalledWith('/__office-download/1234567890abcdef/versions/2', { cache: 'no-store' });
    expect(await screen.findByRole('alert')).toHaveTextContent('503');
    expect(button).toBeEnabled();
    act(() => dirty({ data: true }));
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', '请先保存修改，再下载所选版本');
  });
  afterEach(() => {
    delete window.DocsAPI;
    vi.unstubAllGlobals();
  });

  it('gives the native editor the complete remaining canvas and supports view sessions', async () => {
    const destroyEditor = vi.fn();
    const docEditor = vi.fn(function MockDocsEditor(this: { destroyEditor?: () => void }) {
      this.destroyEditor = destroyEditor;
    });
    window.DocsAPI = {
      DocEditor: docEditor as unknown as NonNullable<typeof window.DocsAPI>['DocEditor'],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        documentServerUrl: 'http://localhost:8080',
        editorConfig: { documentType: 'word' },
        sessionId: 'resource-session',
      }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, unmount } = render(
      <OnlyOfficeEditorWorkspace
        bridgeFile={{
          id: 'resource-file',
          name: '合同条款.doc',
          relative: 'imported/resource/合同条款.doc',
          size: 1024,
        }}
        displayName="合同条款.doc"
        mode="view"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(docEditor).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe('http://127.0.0.1:8081/api/editor-sessions');
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({ fileId: 'resource-file', mode: 'view' });
    const editorCalls = docEditor.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
    expect(editorCalls[0]?.[1]).toMatchObject({ height: '100%', width: '100%' });
    expect(screen.getByText(/真实 Office 预览/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭文件预览' })).toBeInTheDocument();
    expect(container.querySelector('.onlyoffice-workspace__editor')).toBeInTheDocument();

    unmount();
    expect(destroyEditor).toHaveBeenCalledOnce();
  });

  it('quotes the native Office selection through Automation API when the server exposes it', async () => {
    const user = userEvent.setup();
    const disconnect = vi.fn();
    const executeMethod = vi.fn((
      _method: string,
      _params: unknown[] | null,
      callback: (result?: unknown) => void,
    ) => callback('第一行\r\n第二行'));
    const createConnector = vi.fn(() => ({ disconnect, executeMethod }));
    const docEditor = vi.fn(function MockDocsEditor(
      this: { createConnector?: typeof createConnector; destroyEditor?: () => void },
      _elementId: string,
      config: Record<string, unknown>,
    ) {
      this.createConnector = createConnector;
      this.destroyEditor = vi.fn();
      queueMicrotask(() => {
        const events = config.events as { onDocumentReady?: () => void } | undefined;
        events?.onDocumentReady?.();
      });
    });
    window.DocsAPI = {
      DocEditor: docEditor as unknown as NonNullable<typeof window.DocsAPI>['DocEditor'],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        documentServerUrl: 'http://localhost:8080',
        editorConfig: { documentType: 'word' },
        sessionId: 'selection-session',
      }),
      ok: true,
    }));
    const onContextChange = vi.fn();
    const onSendContextToAgent = vi.fn();

    const { unmount } = render(
      <OnlyOfficeEditorWorkspace
        bridgeFile={{ id: 'office-file', name: '成果.docx', relative: '成果.docx', size: 1024 }}
        contextBase={{
          categoryId: 'business',
          categoryLabel: '商务文件',
          fileId: 'office-file',
          fileKind: 'word',
          fileName: '成果.docx',
          label: '成果.docx',
          version: 'V1',
        }}
        displayName="成果.docx"
        onClose={vi.fn()}
        onContextChange={onContextChange}
        onSendContextToAgent={onSendContextToAgent}
      />,
    );

    await screen.findByText('已连接');
    await user.click(screen.getByRole('button', { name: '引用到对话框' }));

    expect(createConnector).toHaveBeenCalledOnce();
    expect(executeMethod).toHaveBeenCalledWith(
      'GetSelectedText',
      [expect.objectContaining({ Numbering: true, ParaSeparator: '\n' })],
      expect.any(Function),
    );
    expect(onContextChange).toHaveBeenCalledWith(expect.objectContaining({
      fileId: 'office-file',
      location: 'Office 当前选区',
      selectedText: '第一行\n第二行',
    }));
    expect(onSendContextToAgent).toHaveBeenCalledWith(expect.objectContaining({
      selectedText: '第一行\n第二行',
    }));
    expect(screen.queryByText(/已引用当前/)).not.toBeInTheDocument();

    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('quotes actual selected text through the Community Edition plugin without a floating success notice', async () => {
    const user = userEvent.setup();
    const { plugin } = mockCommunitySelection('授权代表全权处理所有响应。');
    const onSendContextToAgent = vi.fn();

    render(
      <OnlyOfficeEditorWorkspace
        bridgeFile={{ id: 'office-file', name: '成果.docx', relative: '成果.docx', size: 1024 }}
        contextBase={{
          categoryId: 'business',
          categoryLabel: '商务文件',
          fileId: 'office-file',
          fileKind: 'word',
          fileName: '成果.docx',
          label: '成果.docx',
        }}
        displayName="成果.docx"
        onClose={vi.fn()}
        onSendContextToAgent={onSendContextToAgent}
      />,
    );

    await screen.findByText('已连接');
    const quoteButton = screen.getByRole('button', { name: '引用到对话框' });
    expect(quoteButton).toHaveAttribute('title', '读取 Office 当前选区并引用到对话框');
    await user.click(quoteButton);

    expect(onSendContextToAgent).toHaveBeenCalledWith(expect.objectContaining({
      fileId: 'office-file',
      fileName: '成果.docx',
      selectedText: '授权代表全权处理所有响应。',
    }));
    expect(plugin.postMessage).toHaveBeenCalledOnce();
    expect(screen.queryByText(/已引用当前/)).not.toBeInTheDocument();
  });

  it('moves status and icon-only quoting into the tab toolbar without duplicating the file header', async () => {
    const user = userEvent.setup();
    const { docEditor } = mockCommunitySelection('当前选区');
    const onSendContextToAgent = vi.fn();
    const props = {
      bridgeFile: { id: 'office-file', name: '成果.docx', relative: '成果.docx', size: 1024 },
      contextBase: {
        categoryId: 'business',
        categoryLabel: '商务文件',
        fileId: 'office-file',
        fileKind: 'word' as const,
        fileName: '成果.docx',
        label: '成果.docx',
      },
      displayName: '成果.docx',
      onClose: vi.fn(),
      onSendContextToAgent,
    };
    const toolbar = document.createElement('div');
    document.body.appendChild(toolbar);
    const { container, rerender, unmount } = render(
      <OnlyOfficeEditorWorkspace {...props} toolbarContainer={null} />,
    );

    await waitFor(() => expect(docEditor).toHaveBeenCalledOnce());
    expect(container.querySelector('header')).not.toBeInTheDocument();
    expect(screen.queryByText('成果.docx')).not.toBeInTheDocument();
    expect(screen.queryByText(/真实 Office/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭文件预览' })).not.toBeInTheDocument();
    expect(container.querySelector('.onlyoffice-workspace--tabbed .onlyoffice-workspace__editor')).toBeInTheDocument();

    rerender(<OnlyOfficeEditorWorkspace {...props} toolbarContainer={toolbar} />);
    expect(await within(toolbar).findByText('已连接')).toBeInTheDocument();
    const quoteButton = within(toolbar).getByRole('button', { name: '引用到对话框' });
    expect(quoteButton).toHaveTextContent('引用到对话框');
    expect(within(toolbar).getByRole('button', { name: '下载文件' })).toHaveTextContent('下载文件');
    expect(quoteButton).toHaveAttribute('title', '读取 Office 当前选区并引用到对话框');
    expect(container.querySelector('.onlyoffice-workspace__toolbar')).not.toBeInTheDocument();
    await user.click(quoteButton);
    expect(onSendContextToAgent).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'office-file', selectedText: '当前选区' }));
    expect(screen.queryByText(/已引用当前/)).not.toBeInTheDocument();
    expect(docEditor).toHaveBeenCalledOnce();

    unmount();
    expect(toolbar).toBeEmptyDOMElement();
    toolbar.remove();
  });

  it('does not substitute a file reference when no text is selected', async () => {
    const user = userEvent.setup();
    mockCommunitySelection('');
    const quote = vi.fn();
    render(<OnlyOfficeEditorWorkspace
      bridgeFile={{ id: 'office-file', name: '成果.docx', relative: '成果.docx', size: 1024 }}
      contextBase={{ categoryId: 'business', categoryLabel: '商务文件', fileId: 'office-file', fileKind: 'word', fileName: '成果.docx', label: '成果.docx' }}
      displayName="成果.docx" onClose={vi.fn()} onSendContextToAgent={quote} />);
    await screen.findByText('已连接');
    await user.click(screen.getByRole('button', { name: '引用到对话框' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请先在文档中选中文字');
    expect(quote).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '引用到对话框' })).toBeEnabled();
  });

  it('ignores late Automation selection callbacks after the editor closes', async () => {
    const user = userEvent.setup();
    let selectionCallback!: (value: unknown) => void;
    window.DocsAPI = { DocEditor: class {
      constructor(_id: string, config: Record<string, unknown>) {
        queueMicrotask(() => (config.events as { onDocumentReady: () => void }).onDocumentReady());
      }
      createConnector() { return { executeMethod: (_method: string, _params: unknown, callback: (value: unknown) => void) => { selectionCallback = callback; } }; }
    } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      documentServerUrl: 'http://localhost:8080', editorConfig: {}, sessionId: 'closing',
    }) }));
    const quote = vi.fn();
    const { unmount } = render(<OnlyOfficeEditorWorkspace
      bridgeFile={{ id: 'office-file', name: '成果.docx', relative: '成果.docx', size: 1024 }}
      contextBase={{ categoryId: 'business', categoryLabel: '商务文件', fileId: 'office-file', fileKind: 'word', fileName: '成果.docx', label: '成果.docx' }}
      displayName="成果.docx" onClose={vi.fn()} onSendContextToAgent={quote} />);
    await screen.findByText('已连接');
    await user.click(screen.getByRole('button', { name: '引用到对话框' }));
    unmount();
    selectionCallback('不应引用的旧文档内容');
    await Promise.resolve();
    expect(quote).not.toHaveBeenCalled();
  });

  it('preserves connection errors when the standalone header is removed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const { container } = render(
      <OnlyOfficeEditorWorkspace
        bridgeFile={{ id: 'office-file', name: '成果.docx', relative: '成果.docx', size: 1024 }}
        displayName="成果.docx"
        onClose={vi.fn()}
        toolbarContainer={null}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('创建 Office 编辑会话失败。');
    expect(container.querySelector('header')).not.toBeInTheDocument();
    expect(container.querySelector('.onlyoffice-workspace--tabbed .onlyoffice-workspace__editor')).toBeInTheDocument();
  });
});
