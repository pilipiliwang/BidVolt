(function installSelectionBridge(window) {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const channel = params.get('channel');
  const hostOrigin = params.get('hostOrigin');
  const hostWindow = window.top;
  let parsedOrigin;
  try {
    parsedOrigin = new URL(hostOrigin);
  } catch {
    return;
  }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(channel || '')
    || !['http:', 'https:'].includes(parsedOrigin.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname)
    || hostOrigin !== parsedOrigin.origin
    || !hostWindow || hostWindow === window
    || !window.Asc || !window.Asc.plugin) return;

  let ready = false;
  let activeRequest = null;
  const options = {
    Numbering: false,
    Math: false,
    TableCellSeparator: '\t',
    ParaSeparator: '\n',
    TabSymbol: '\t',
    NewLineSeparator: '\n',
  };

  function send(payload) {
    hostWindow.postMessage({ ...payload, channel }, hostOrigin);
  }

  window.Asc.plugin.init = function onPluginReady() {
    ready = true;
    send({ type: 'bidvolt-office-selection-ready' });
  };

  window.addEventListener('message', function onQuoteRequest(event) {
    const data = event.data;
    if (!ready || event.origin !== hostOrigin || event.source !== hostWindow
      || !data || typeof data !== 'object'
      || data.type !== 'bidvolt-office-selection-request' || data.channel !== channel
      || typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.requestId)) return;

    const requestId = data.requestId;
    if (activeRequest) {
      send({ type: 'bidvolt-office-selection-result', requestId, text: '', error: 'selection-busy' });
      return;
    }
    const request = { requestId, finished: false, timer: null };
    activeRequest = request;
    function finish(text, error) {
      if (request.finished) return;
      request.finished = true;
      window.clearTimeout(request.timer);
      if (activeRequest === request) activeRequest = null;
      send({ type: 'bidvolt-office-selection-result', requestId, text, ...(error ? { error } : {}) });
    }
    request.timer = window.setTimeout(function onTimeout() {
      finish('', 'selection-timeout');
    }, 4000);
    try {
      // GetSelectedText is a read-only Plugins API method supported by Community
      // Docs. No Automation API license or document modification is required.
      window.Asc.plugin.executeMethod('GetSelectedText', [options], function onSelectedText(result) {
        if (typeof result !== 'string') {
          finish('', 'selection-unavailable');
          return;
        }
        finish(result);
      });
    } catch {
      finish('', 'selection-unavailable');
    }
  });
})(window);
