/* Cliente del backend Apps Script. Transporte: GET para configuración y POST text/plain
   (solicitud simple, sin preflight). Se lee siempre la respuesta JSON; nunca se usa no-cors. */
(function () {
  'use strict';
  var TIMEOUT = 30000;
  var INTENTOS = 3;

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
    return withTimeout(fetch(url + '?action=' + encodeURIComponent(action), { method: 'GET', redirect: 'follow', cache: 'no-store', credentials: 'omit', signal: ctrl && ctrl.signal }).then(parse), TIMEOUT, ctrl)
      .catch(function (e) { if (!e.code) e.code = 'RED'; throw e; });
  }

  function postOnce(url, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    return withTimeout(fetch(url, {
      method: 'POST', redirect: 'follow', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), signal: ctrl && ctrl.signal
    }).then(parse), TIMEOUT, ctrl).catch(function (e) { if (!e.code) e.code = 'RED'; throw e; });
  }

  /* Si la respuesta se pierde (red o acuse ilegible), se reintenta con el MISMO cuerpo y el mismo
     identificador de solicitud: el servidor devuelve el resultado ya registrado, sin duplicar.
     Peor caso: 3 × 30 s + esperas de 1,5 s y 3 s ≈ 94,5 s. progreso(intento, total) informa a la interfaz.
     Si todos los intentos fallan, el error lleva incierto = true: el servidor pudo haber registrado la operación. */
  function post(body, progreso) {
    var url = apiUrl();
    if (!url) return Promise.reject(Object.assign(new Error('Sin endpoint'), { code: 'PENDIENTE' }));
    var intentos = 0;
    function intento() {
      intentos++;
      if (progreso) try { progreso(intentos, INTENTOS); } catch (x) {}
      return postOnce(url, body).catch(function (e) {
        if (e.code !== 'RED') throw e;
        if (intentos >= INTENTOS) { e.incierto = !!body.request_id; throw e; }
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

  /* Huella SHA-256 del contenido (no se guardan nombres ni DNI en el navegador). */
  function huella(obj) {
    var txt = JSON.stringify(obj);
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    var h = 2166136261; // respaldo FNV-1a (solo para distinguir reintentos del mismo contenido)
    for (var i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return Promise.resolve('f' + h.toString(16));
  }

  /* Un identificador por intención: reintentar el mismo contenido reutiliza el id (no duplica);
     cambiar los datos genera uno nuevo. Solo se guarda {id, huella} en esta pestaña. */
  function requestIdFor(kind, payload) {
    var key = 'rq:' + kind;
    return huella(payload).then(function (h) {
      var saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) {}
      if (saved && saved.h === h && saved.id) return saved.id;
      var id = newId();
      try { sessionStorage.setItem(key, JSON.stringify({ id: id, h: h })); } catch (e) {}
      return id;
    });
  }
  function forgetRequest(kind) { try { sessionStorage.removeItem('rq:' + kind); } catch (e) {} }

  /* Almacenamiento: por defecto solo en esta pestaña; en el dispositivo solo si la persona lo elige. */
  function store(k, v, recordar) {
    try {
      localStorage.removeItem(k); sessionStorage.removeItem(k);
      if (v == null) return;
      (recordar ? localStorage : sessionStorage).setItem(k, v);
    } catch (e) {}
  }
  function load(k) {
    try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; }
  }
  function remembered(k) { try { return !!localStorage.getItem(k); } catch (e) { return false; } }

  window.API = { url: apiUrl, get: get, post: post, requestIdFor: requestIdFor, forgetRequest: forgetRequest, store: store, load: load, remembered: remembered, newId: newId, INTENTOS: INTENTOS };
})();
