/* Cliente del backend Apps Script. Transporte: GET para configuración y POST text/plain
   (solicitud simple, sin preflight). Se lee siempre la respuesta JSON; nunca se usa no-cors. */
(function () {
  'use strict';
  var TIMEOUT = 30000;

  function apiUrl() {
    var u = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u) ? u : '';
  }

  function withTimeout(promise, ms, ctrl) {
    var t;
    return Promise.race([
      promise,
      new Promise(function (_, rej) { t = setTimeout(function () { if (ctrl) ctrl.abort(); rej(Object.assign(new Error('timeout'), { code: 'RED' })); }, ms); })
    ]).finally(function () { clearTimeout(t); });
  }

  function parse(res) {
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { code: 'RED' });
    return res.text().then(function (txt) {
      try { return JSON.parse(txt); } catch (e) { throw Object.assign(new Error('Respuesta no legible'), { code: 'RED' }); }
    });
  }

  function get(action) {
    var url = apiUrl();
    if (!url) return Promise.reject(Object.assign(new Error('Sin endpoint'), { code: 'PENDIENTE' }));
    var ctrl = window.AbortController ? new AbortController() : null;
    return withTimeout(fetch(url + '?action=' + encodeURIComponent(action), { method: 'GET', redirect: 'follow', cache: 'no-store', signal: ctrl && ctrl.signal }).then(parse), TIMEOUT, ctrl)
      .catch(function (e) { if (!e.code) e.code = 'RED'; throw e; });
  }

  function postOnce(url, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    return withTimeout(fetch(url, {
      method: 'POST', redirect: 'follow', cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), signal: ctrl && ctrl.signal
    }).then(parse), TIMEOUT, ctrl).catch(function (e) { if (!e.code) e.code = 'RED'; throw e; });
  }

  /* Si la respuesta se pierde (red o acuse ilegible), se reintenta con el MISMO cuerpo y el mismo
     identificador de solicitud: el servidor devuelve el resultado ya registrado, sin duplicar. */
  function post(body) {
    var url = apiUrl();
    if (!url) return Promise.reject(Object.assign(new Error('Sin endpoint'), { code: 'PENDIENTE' }));
    var intentos = 0;
    function intento() {
      intentos++;
      return postOnce(url, body).catch(function (e) {
        if (e.code !== 'RED' || intentos >= 3) throw e;
        return new Promise(function (r) { setTimeout(r, 1500 * intentos); }).then(intento);
      });
    }
    return intento();
  }

  function newId() {
    var a = new Uint8Array(18);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  /* El identificador de solicitud se genera una vez por contenido: reintentar lo mismo reutiliza el id;
     cambiar los datos genera uno nuevo (evita conflictos). */
  function requestIdFor(kind, payload) {
    var key = 'rq:' + kind, sig = JSON.stringify(payload), saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) {}
    if (saved && saved.sig === sig) return saved.id;
    var id = newId();
    try { sessionStorage.setItem(key, JSON.stringify({ id: id, sig: sig })); } catch (e) {}
    return id;
  }
  function forgetRequest(kind) { try { sessionStorage.removeItem('rq:' + kind); } catch (e) {} }

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  window.API = { url: apiUrl, get: get, post: post, requestIdFor: requestIdFor, forgetRequest: forgetRequest, store: store, load: load, newId: newId };
})();
