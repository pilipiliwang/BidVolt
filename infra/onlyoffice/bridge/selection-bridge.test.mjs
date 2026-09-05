import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {
  SELECTION_PLUGIN_GUID,
  SelectionBridgeValidationError,
  selectionEditorPlugins,
  selectionPluginConfig,
  selectionPluginHtml,
  validateSelectionBridge,
} from './selection-bridge.mjs';

const channel = 'aae2e532-b2ba-4881-b83f-14c5873a5e55';
const hostOrigin = 'http://127.0.0.1:4173';
const selectionBridge = { channel, hostOrigin };
const bridgeUrl = 'http://localhost:8081';
const source = await readFile(new URL('./selection.js', import.meta.url), 'utf8');

test('optional selection integration leaves existing sessions unchanged', () => {
  assert.equal(validateSelectionBridge(undefined), null);
  assert.equal(selectionEditorPlugins(bridgeUrl, null), null);
});

test('accepts canonical loopback origins without confusing the app and bridge origin', () => {
  for (const origin of [hostOrigin, 'http://localhost:4173', 'https://[::1]:4173']) {
    assert.deepEqual(validateSelectionBridge({ channel, hostOrigin: origin }), { channel, hostOrigin: origin });
  }
});

test('rejects nonlocal, noncanonical, credentialed, path, query and non-HTTP origins', () => {
  for (const origin of [
    'https://example.com', 'http://127.0.0.1.evil.test:4173', 'file://localhost',
    'http://localhost:4173/', 'http://user@localhost:4173', 'http://localhost:4173/path',
    'http://localhost:4173?x=1', 'http://localhost:4173#fragment', '*', 'null', undefined,
  ]) {
    assert.throws(() => validateSelectionBridge({ channel, hostOrigin: origin }), SelectionBridgeValidationError);
  }
});

test('rejects missing, injected and malformed channels', () => {
  for (const candidate of ['', 'not-a-uuid', `${channel}&hostOrigin=https://evil.test`, [channel], 1, undefined]) {
    assert.throws(() => validateSelectionBridge({ channel: candidate, hostOrigin }), SelectionBridgeValidationError);
  }
});

test('autostarts one hidden viewer-compatible plugin with session-scoped URLs', () => {
  const plugins = selectionEditorPlugins(bridgeUrl, selectionBridge);
  assert.deepEqual(plugins.autostart, [SELECTION_PLUGIN_GUID]);
  const configUrl = new URL(plugins.pluginsData[0]);
  assert.equal(configUrl.origin, bridgeUrl);
  assert.equal(configUrl.pathname, '/plugins/bidvolt-selection/config.json');
  assert.equal(configUrl.searchParams.get('channel'), channel);
  assert.equal(configUrl.searchParams.get('hostOrigin'), hostOrigin);
  const config = selectionPluginConfig(bridgeUrl, selectionBridge);
  assert.equal(config.guid, SELECTION_PLUGIN_GUID);
  assert.equal(config.variations[0].type, 'background');
  assert.equal(config.variations[0].isViewer, true);
  assert.equal(config.variations[0].isDisplayedInViewer, true);
  assert.deepEqual(config.variations[0].EditorsSupport, ['word', 'cell', 'slide']);
  const entryUrl = new URL(config.variations[0].url, configUrl);
  assert.equal(entryUrl.origin, bridgeUrl);
  assert.equal(entryUrl.searchParams.get('channel'), channel);
  assert.equal(entryUrl.searchParams.get('hostOrigin'), hostOrigin);
});

test('survives the real Docs 9.4 baseUrl prefix and unconditional language suffix', () => {
  const config = selectionPluginConfig(bridgeUrl, selectionBridge);
  const configUrl = selectionEditorPlugins(bridgeUrl, selectionBridge).pluginsData[0];
  const docsBaseUrl = configUrl.substring(0, configUrl.lastIndexOf('config.json'));
  const iframeUrl = new URL(docsBaseUrl + config.variations[0].url + '?lang=zh-CN&theme-type=light');
  assert.equal(iframeUrl.origin, bridgeUrl);
  assert.equal(iframeUrl.pathname, '/plugins/bidvolt-selection/index.html');
  assert.deepEqual(validateSelectionBridge({
    channel: iframeUrl.searchParams.get('channel'), hostOrigin: iframeUrl.searchParams.get('hostOrigin'),
  }), selectionBridge);
});

test('bare config.json supports the plugin SDK bootstrap without exposing session data', () => {
  const config = selectionPluginConfig(bridgeUrl);
  assert.equal(config.guid, SELECTION_PLUGIN_GUID);
  assert.equal(config.variations[0].url, 'index.html');
  assert.doesNotMatch(JSON.stringify(config), new RegExp(channel));
  assert.throws(() => selectionPluginConfig(bridgeUrl, { channel }), SelectionBridgeValidationError);
});

test('uses the local Document Server plugin SDK instead of a remote code provider', () => {
  const html = selectionPluginHtml('http://localhost:8080');
  assert.match(html, /src="http:\/\/localhost:8080\/sdkjs-plugins\/v1\/plugins.js"/);
  assert.match(html, /src="\/plugins\/bidvolt-selection\/selection.js"/);
  assert.doesNotMatch(html, /eval\(|cdn\.|unpkg\.|createConnector/);
});

function createPlugin({ query = selectionBridge, executeMethod } = {}) {
  const messages = [];
  const calls = [];
  const timers = new Map();
  const listeners = new Map();
  const hostWindow = { postMessage: (message, targetOrigin) => messages.push({ message, targetOrigin }) };
  const plugin = { executeMethod: (...args) => { calls.push(args); executeMethod?.(...args); } };
  const window = {
    top: hostWindow,
    location: { search: `?${new URLSearchParams(query)}` },
    Asc: { plugin },
    addEventListener: (name, listener) => listeners.set(name, listener),
    setTimeout: (fn) => { const id = Symbol('timer'); timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.runInNewContext(source, { window, URL, URLSearchParams });
  function request(overrides = {}) {
    listeners.get('message')?.({
      origin: hostOrigin,
      source: hostWindow,
      data: { type: 'bidvolt-office-selection-request', channel, requestId: 'quote-1' },
      ...overrides,
    });
  }
  return { plugin, messages, calls, request, hostWindow, timers, listeners };
}

test('plugin readiness sends only the channel to the explicitly authorized host', () => {
  const { plugin, messages, calls } = createPlugin();
  plugin.init();
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), {
    message: { type: 'bidvolt-office-selection-ready', channel }, targetOrigin: hostOrigin,
  });
  assert.equal(calls.length, 0, 'initialization does not collect or transmit document text');
});

test('returns actual selected text and whitespace for only an explicit host request', () => {
  const selectedText = '授权范围\n第一条\t上海公司\n第二条';
  const { plugin, request, calls, messages, timers } = createPlugin({
    executeMethod: (_method, _options, callback) => callback(selectedText),
  });
  plugin.init();
  request();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'GetSelectedText');
  assert.equal(calls[0][1][0].ParaSeparator, '\n');
  assert.equal(calls[0][1][0].TableCellSeparator, '\t');
  assert.equal(messages[1].message.text, selectedText);
  assert.equal(messages[1].message.requestId, 'quote-1');
  assert.equal(messages[1].message.channel, channel);
  assert.equal(messages[1].targetOrigin, hostOrigin);
  assert.equal(timers.size, 0);
});

test('rejects mismatched origin, sibling frame, channel, message type, request id and preready messages', () => {
  const { plugin, request, calls, messages } = createPlugin();
  request();
  assert.equal(calls.length, 0);
  plugin.init();
  request({ origin: 'https://evil.test' });
  request({ source: {} });
  request({ data: { type: 'bidvolt-office-selection-request', channel: 'other', requestId: '1' } });
  request({ data: { type: 'write-document', channel, requestId: '1' } });
  request({ data: { type: 'bidvolt-office-selection-request', channel, requestId: '' } });
  request({ data: null });
  assert.equal(calls.length, 0);
  assert.equal(messages.length, 1);
});

test('rejects plugin boot parameters that would leak selections to an external origin', () => {
  const { plugin, listeners, messages } = createPlugin({ query: { channel, hostOrigin: 'https://evil.test' } });
  assert.equal(plugin.init, undefined);
  assert.equal(listeners.size, 0);
  assert.equal(messages.length, 0);
});

test('empty selection stays empty rather than being replaced by a whole-file quote', () => {
  const { plugin, request, messages } = createPlugin({ executeMethod: (_method, _options, callback) => callback('') });
  plugin.init();
  request();
  assert.equal(messages[1].message.text, '');
  assert.equal(messages[1].message.error, undefined);
});

test('nonstring and thrown SDK errors return explicit failures, not fabricated excerpts', () => {
  for (const executeMethod of [(_method, _options, callback) => callback(undefined), () => { throw new Error('SDK failed'); }]) {
    const { plugin, request, messages, timers } = createPlugin({ executeMethod });
    plugin.init();
    request();
    assert.equal(messages[1].message.text, '');
    assert.equal(messages[1].message.error, 'selection-unavailable');
    assert.equal(timers.size, 0);
  }
});

test('times out once, ignores late SDK callbacks and accepts a later quote request', () => {
  const { plugin, request, messages, calls, timers } = createPlugin();
  plugin.init();
  request();
  [...timers.values()][0]();
  assert.equal(messages[1].message.error, 'selection-timeout');
  calls[0][2]('late text');
  assert.equal(messages.length, 2);
  request({ data: { type: 'bidvolt-office-selection-request', channel, requestId: 'quote-2' } });
  calls[1][2]('fresh selection');
  assert.equal(messages[2].message.text, 'fresh selection');
  assert.equal(messages[2].message.requestId, 'quote-2');
});

test('a second in-flight request cannot overwrite the first request callback', () => {
  const { plugin, request, messages, calls } = createPlugin();
  plugin.init();
  request();
  request({ data: { type: 'bidvolt-office-selection-request', channel, requestId: 'quote-2' } });
  assert.equal(calls.length, 1);
  assert.equal(messages[1].message.requestId, 'quote-2');
  assert.equal(messages[1].message.error, 'selection-busy');
  calls[0][2]('first selection');
  assert.equal(messages[2].message.requestId, 'quote-1');
  assert.equal(messages[2].message.text, 'first selection');
});
