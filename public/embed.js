/* Nenocutter drop-in embed. Load this file, then call NenocutterEmbed.mount. */
(function (global) {
  var DEFAULT_ORIGIN = 'https://arcane3d.github.io/nenocutter/';

  function mount(target, options) {
    options = options || {};
    var origin = options.origin || DEFAULT_ORIGIN;
    if (origin.slice(-1) !== '/') origin += '/';
    var iframe = document.createElement('iframe');
    iframe.src = origin + '#/embed';
    iframe.title = options.title || 'Nenocutter designer';
    iframe.style.width = options.width || '100%';
    iframe.style.height = options.height || '720px';
    iframe.style.border = '0';
    iframe.style.borderRadius = '24px';
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('Nenocutter embed target was not found');
    host.appendChild(iframe);
    var targetOrigin = '*';
    try { targetOrigin = new URL(iframe.src).origin; } catch (error) { targetOrigin = '*'; }

    function send(message) {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage(Object.assign({ source: 'nenocutter-host' }, message), targetOrigin);
    }

    function onMessage(event) {
      var data = event.data;
      if (!data || data.source !== 'nenocutter') return;
      if (typeof options.onMessage === 'function') options.onMessage(data);
      if (data.type === 'ready') {
        if (options.design) send({ type: 'load-design', design: options.design });
        if (options.settings) send({ type: 'set-settings', settings: options.settings });
      }
    }
    global.addEventListener('message', onMessage);
    return {
      iframe: iframe,
      loadDesign: function (design) { send({ type: 'load-design', design: design }); },
      setSettings: function (settings) { send({ type: 'set-settings', settings: settings }); },
      export: function (format) { send({ type: 'export', format: format || 'stl' }); },
      destroy: function () {
        global.removeEventListener('message', onMessage);
        iframe.remove();
      },
    };
  }

  global.NenocutterEmbed = { mount: mount };
})(window);
