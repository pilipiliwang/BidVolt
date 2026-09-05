export const SELECTION_PLUGIN_GUID = 'asc.{81914572-8197-4BA7-9B46-E6D6E28BC657}';
export const SELECTION_PLUGIN_PATH = '/plugins/bidvolt-selection';

export class SelectionBridgeValidationError extends Error {}

const channelPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// This is a local development bridge, not an authorization service for arbitrary
// origins. Production must configure authenticated tenant/session allowlists.
export function validateSelectionBridge(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || typeof value.channel !== 'string'
    || !channelPattern.test(value.channel)) {
    throw new SelectionBridgeValidationError('selection bridge channel must be a UUID');
  }
  let origin;
  try {
    origin = new URL(value.hostOrigin);
  } catch {
    throw new SelectionBridgeValidationError('selection bridge host origin is invalid');
  }
  if (!['http:', 'https:'].includes(origin.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    || origin.username || origin.password || origin.search || origin.hash
    || (origin.pathname !== '/' && origin.pathname !== '')
    || value.hostOrigin !== origin.origin) {
    throw new SelectionBridgeValidationError('selection bridge host must be a loopback HTTP(S) origin');
  }
  return { channel: value.channel, hostOrigin: origin.origin };
}

function pluginUrl(publicBridgeUrl, name, selectionBridge) {
  const url = new URL(`${SELECTION_PLUGIN_PATH}/${name}`, publicBridgeUrl);
  url.searchParams.set('channel', selectionBridge.channel);
  url.searchParams.set('hostOrigin', selectionBridge.hostOrigin);
  return url.href;
}

export function selectionEditorPlugins(publicBridgeUrl, value) {
  const selectionBridge = validateSelectionBridge(value);
  if (!selectionBridge) return null;
  return {
    autostart: [SELECTION_PLUGIN_GUID],
    pluginsData: [pluginUrl(publicBridgeUrl, 'config.json', selectionBridge)],
  };
}

export function selectionPluginConfig(publicBridgeUrl, value) {
  const selectionBridge = validateSelectionBridge(value);
  // The Docs loader prefixes baseUrl itself, then appends ?lang= unconditionally.
  // A relative entry plus a final sentinel query parameter preserves our values.
  // The plugin SDK also fetches ./config.json without the session query on load;
  // that bootstrap response needs only the stable plugin metadata/GUID.
  const entryUrl = selectionBridge
    ? `index.html${new URL(pluginUrl(publicBridgeUrl, 'index.html', selectionBridge)).search}&sdkSuffix=`
    : 'index.html';
  return {
    name: 'BidVolt selection bridge',
    guid: SELECTION_PLUGIN_GUID,
    version: '1.0.0',
    baseUrl: '',
    variations: [{
      description: 'Read the selected text for an explicit BidVolt quote request',
      url: entryUrl,
      EditorsSupport: ['word', 'cell', 'slide'],
      type: 'background',
      isViewer: true,
      isDisplayedInViewer: true,
      initDataType: 'none',
      initData: '',
      buttons: [],
    }],
  };
}

export function selectionPluginHtml(publicDocumentServerUrl) {
  const scriptUrl = new URL('/sdkjs-plugins/v1/plugins.js', publicDocumentServerUrl).href
    .replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>BidVolt selection bridge</title></head><body><script src="${scriptUrl}"></script><script src="${SELECTION_PLUGIN_PATH}/selection.js"></script></body></html>`;
}
