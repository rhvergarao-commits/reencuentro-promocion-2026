/* Puerta: máquina de estados explícita. Nunca autoriza sin respuesta del servidor (sin modo sin conexión).
   Estados: sin_sesion → listo → verificando → por_confirmar → registrando → confirmado | error (reintento). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var OP = null, estado = 'sin_sesion', turno = 0, pendiente = null, stream = null, pidiendoCam = false, venceT = null;
  var lastQr = '', lastAt = 0;
  var ETIQUETAS = {
    sin_sesion: 'Sin sesión', listo: 'Lista para escanear', verificando: 'Verificando…', por_confirmar: 'Por confirmar',
    registrando: 'Registrando…', confirmado: 'Ingreso confirmado', error: 'Error · reintento pendiente'
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function anunciar(t) { var a = $('anuncio'); a.textContent = ''; setTimeout(function () { a.textContent = t; }, 60); }
  function setEstado(s) { estado = s; $('estadoPuerta').textContent = ETIQUETAS[s]; document.body.dataset.estado = s; }
  function notice(kind, title, text) { return '<div class="notice ' + kind + '"><div><b>' + esc(title) + '</b>' + (text ? '<p>' + esc(text) + '</p>' : '') + '</div></div>'; }

  /* ---------- Sesión ---------- */
  function validarSesion(tok, desdeLogin) {
    var btn = $('btnEntrar'); btn.disabled = true; btn.textContent = 'Validando…';
    return API.post({ action: 'puerta_sesion', operador: tok }).then(function (r) {
      if (!r.ok) {
        ss('op', null);
        $('loginMsg').innerHTML = notice('bad', r.error === 'NO_AUTORIZADO' ? 'Credencial no válida' : 'No se pudo validar', r.mensaje);
        anunciar(r.mensaje || 'Credencial no válida');
        return;
      }
      OP = tok; ss('op', tok);
      $('login').hidden = true; $('scan').hidden = false; $('loginMsg').innerHTML = '';
      $('operadorInfo').textContent = 'Operador: ' + r.operador.nombre + ' · sesión válida hasta ' + new Date(r.operador.vence).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' });
      clearTimeout(venceT);
      var ms = new Date(r.operador.vence).getTime() - Date.now();
      if (ms > 0 && ms < 2147483000) venceT = setTimeout(function () { expirar('La sesión de operador venció.'); }, ms);
      setEstado('listo');
      $('result').innerHTML = r.acceso ? '' : notice('warn', 'Control de acceso no habilitado', 'El organizador aún no habilita el ingreso. Las verificaciones serán rechazadas.');
      anunciar('Sesión iniciada. ' + ETIQUETAS.listo);
    }).catch(function () {
      $('loginMsg').innerHTML = notice('bad', 'Sin conexión', 'No se pudo validar la credencial. La puerta no funciona sin conexión.');
      if (!desdeLogin) { $('login').hidden = false; $('scan').hidden = true; }
    }).then(function () { btn.disabled = false; btn.textContent = 'Entrar'; });
  }
  function expirar(msg) {
    turno++; pendiente = null; OP = null; ss('op', null); clearTimeout(venceT);
    stopCam(); setEstado('sin_sesion');
    $('scan').hidden = true; $('login').hidden = false; $('result').innerHTML = '';
    $('loginMsg').innerHTML = notice('bad', 'Sesión cerrada', msg || 'La credencial fue revocada o venció. Pide una nueva al organizador.');
    $('op').value = ''; $('op').focus();
    anunciar(msg || 'Sesión cerrada');
  }
  $('login').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('op').value.trim(), f = document.querySelector('.field[data-f=op]');
    f.classList.remove('err'); $('op').removeAttribute('aria-invalid');
    if (!/^OP-[A-Za-z0-9_-]{32}$/.test(t)) {
      f.classList.add('err'); $('op-err').textContent = 'La credencial empieza con «OP-» y tiene 35 caracteres.';
      $('op').setAttribute('aria-invalid', 'true'); $('op').setAttribute('aria-describedby', 'op-err'); $('op').focus(); anunciar($('op-err').textContent); return;
    }
    validarSesion(t, true);
  });
  $('btnSalir').onclick = function () { expirar('Sesión cerrada por el operador.'); $('loginMsg').innerHTML = ''; };

  /* ---------- Resultado ---------- */
  function persona(v) {
    return v && v.titular ? '<div class="who">' + esc(v.titular) + (v.dni ? ' · DNI ' + esc(v.dni) : '') + '</div><div>' + esc(v.entrada || '') + ' · ' + esc(v.categoria || '') + '</div>' : (v && v.entrada ? '<div>' + esc(v.entrada) + '</div>' : '');
  }
  function verdict(kind, title, texto, v, botones) {
    $('result').innerHTML = '<div class="verdict ' + kind + '"><h2>' + esc(title) + '</h2>' + (texto ? '<p>' + esc(texto) + '</p>' : '') + persona(v) +
      (botones || []).map(function (b) { return '<button class="btn mt12' + (b[2] ? ' ' + b[2] : '') + '" type="button" data-accion="' + b[0] + '">' + esc(b[1]) + '</button>'; }).join('') + '</div>';
    anunciar(title + (texto ? '. ' + texto : '') + (v && v.titular ? '. ' + v.titular : ''));
    var p = $('result').querySelector('button'); if (p) p.focus(); else $('result').focus();
  }
  var acciones = {
    registrar: function () { registrar(); },
    siguiente: function () { pendiente = null; turno++; setEstado('listo'); $('result').innerHTML = ''; lastAt = Date.now(); anunciar(ETIQUETAS.listo); },
    reverificar: function () { var q = pendiente && pendiente.qr; pendiente = null; setEstado('listo'); if (q) verificar(q); },
    reintentar: function () { registrar(); }
  };
  $('result').addEventListener('click', function (e) { var b = e.target.closest('[data-accion]'); if (b && acciones[b.dataset.accion]) acciones[b.dataset.accion](); });

  function errorServidor(r, fase) {
    if (r.error === 'NO_AUTORIZADO') { expirar(r.mensaje); return true; }
    if (r.error === 'ACCESO_CERRADO') { setEstado('error'); verdict('bad', 'Control de acceso no habilitado', 'No dejes pasar. ' + (r.mensaje || ''), null, [['siguiente', 'Volver']]); return true; }
    return false;
  }

  /* ---------- Verificación ---------- */
  function verificar(qr) {
    if (estado !== 'listo' || !OP) return;
    var t = ++turno;
    pendiente = { qr: qr };
    setEstado('verificando');
    $('result').innerHTML = '<div class="verdict warn"><h2>Verificando…</h2><p>No dejes pasar todavía.</p></div>';
    API.post({ action: 'puerta_consultar', operador: OP, qr: qr }).then(function (r) {
      if (t !== turno) return; // respuesta antigua
      if (!r.ok) {
        if (errorServidor(r)) return;
        setEstado('error'); verdict('bad', 'No verificado', 'No dejes pasar. ' + (r.mensaje || ''), null, [['reverificar', 'Reintentar verificación'], ['siguiente', 'Volver', 'ghost']]); return;
      }
      var v = r.verificacion;
      if (v.ok) {
        pendiente = { qr: qr, rid: API.newId(), v: v };
        setEstado('por_confirmar');
        verdict('ok', 'Lista para registrar', 'Compara el nombre y el DNI con el documento. El ingreso aún no está confirmado', v, [['registrar', 'Registrar ingreso'], ['siguiente', 'No coincide · no dejar pasar', 'ghost']]);
      } else {
        pendiente = null; setEstado('error');
        verdict(v.codigo === 'YA_INGRESO' ? 'warn' : 'bad', v.codigo === 'YA_INGRESO' ? 'Ya ingresó' : 'No puede ingresar', v.motivo, v, [['siguiente', 'Escanear siguiente']]);
      }
    }).catch(function () {
      if (t !== turno) return;
      setEstado('error');
      verdict('bad', 'Sin conexión', 'No se pudo verificar. No dejes pasar hasta confirmar con el servidor.', null, [['reverificar', 'Reintentar verificación'], ['siguiente', 'Volver', 'ghost']]);
    });
  }

  /* ---------- Registro (mismo identificador hasta resolver) ---------- */
  function registrar() {
    if (!pendiente || !pendiente.rid || (estado !== 'por_confirmar' && estado !== 'error') || !OP) return;
    var t = ++turno, p = pendiente;
    setEstado('registrando');
    $('result').querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    var btnR = $('result').querySelector('[data-accion=registrar],[data-accion=reintentar]'); if (btnR) btnR.textContent = 'Registrando…';
    API.post({ action: 'puerta_ingresar', operador: OP, qr: p.qr, request_id: p.rid }, function (i, n) {
      if (i > 1 && t === turno && btnR) btnR.textContent = 'Registrando… (intento ' + i + ' de ' + n + ')';
    }).then(function (r) {
      if (t !== turno) return;
      if (!r.ok) {
        if (errorServidor(r)) return;
        if (r.error === 'CONFLICTO') { pendiente = null; setEstado('error'); verdict('bad', 'No registrado', 'No dejes pasar. ' + r.mensaje, null, [['siguiente', 'Escanear de nuevo']]); return; }
        setEstado('error');
        verdict('bad', 'No se pudo confirmar el ingreso. Reintenta sin dejar pasar todavía', r.mensaje, p.v, [['reintentar', 'Reintentar registro'], ['siguiente', 'Descartar (no dejar pasar)', 'ghost']]);
        return;
      }
      var v = r.verificacion;
      if (v.codigo === 'INGRESO_REGISTRADO') {
        pendiente = null; setEstado('confirmado');
        verdict('ok', 'Ingreso registrado', 'Puede pasar.', v, [['siguiente', 'Escanear siguiente']]);
      } else {
        pendiente = null; setEstado('error');
        verdict(v.codigo === 'YA_INGRESO' ? 'warn' : 'bad', v.codigo === 'YA_INGRESO' ? 'Ya ingresó' : 'No puede ingresar', v.motivo, v, [['siguiente', 'Escanear siguiente']]);
      }
    }).catch(function () {
      if (t !== turno) return;
      setEstado('error');
      verdict('bad', 'No se pudo confirmar el ingreso. Reintenta sin dejar pasar todavía', 'Si se registró, el reintento lo confirmará sin duplicarlo.', p.v, [['reintentar', 'Reintentar registro'], ['siguiente', 'Descartar (no dejar pasar)', 'ghost']]);
    });
  }

  /* ---------- Entrada manual ---------- */
  $('btnManual').onclick = function () {
    var q = $('manual').value.trim(), f = document.querySelector('.field[data-f=manual]');
    f.classList.remove('err'); $('manual').removeAttribute('aria-invalid');
    if (!/^RP1\.[A-Za-z0-9_-]{32}$/.test(q)) { f.classList.add('err'); $('manual-err').textContent = 'El código empieza con «RP1.» y tiene 36 caracteres.'; $('manual').setAttribute('aria-invalid', 'true'); $('manual').setAttribute('aria-describedby', 'manual-err'); $('manual').focus(); anunciar($('manual-err').textContent); return; }
    if (estado !== 'listo') { anunciar('Termina la verificación actual antes de escanear otra entrada.'); $('result').focus(); return; }
    verificar(q);
  };

  /* ---------- Cámara (carga diferida del lector y una sola solicitud de permiso a la vez) ---------- */
  var cargaJsQR = null;
  function cargarJsQR() {
    if (window.jsQR) return Promise.resolve();
    if (!cargaJsQR) cargaJsQR = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'vendor/jsQR.js'; s.onload = res; s.onerror = function () { cargaJsQR = null; rej(new Error('jsQR')); }; document.head.appendChild(s); });
    return cargaJsQR;
  }
  function stopCam() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; $('video').srcObject = null; $('camBox').hidden = true; $('btnCam').textContent = 'Activar cámara';
  }
  $('btnCam').onclick = function () {
    if (stream) { stopCam(); return; }
    if (pidiendoCam) return;
    var btn = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('camMsg').innerHTML = notice('warn', 'Cámara no disponible', 'Usa el ingreso manual.'); $('manualBox').open = true; return; }
    pidiendoCam = true; btn.disabled = true; btn.textContent = 'Solicitando cámara…';
    cargarJsQR().then(function () {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    }).then(function (s) {
      if (!OP || document.visibilityState !== 'visible') { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s; var v = $('video'); v.srcObject = s; v.play(); $('camBox').hidden = false; btn.textContent = 'Detener cámara'; $('camMsg').innerHTML = ''; loop();
    }).catch(function () {
      $('camMsg').innerHTML = notice('bad', 'Sin acceso a la cámara', 'Permite la cámara o usa el ingreso manual.'); $('manualBox').open = true;
      btn.textContent = 'Activar cámara';
    }).then(function () { pidiendoCam = false; btn.disabled = false; });
  };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'visible') stopCam(); });
  window.addEventListener('pagehide', stopCam);

  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true }), ultimo = 0;
  function loop() {
    if (!stream) return;
    var v = $('video'), ahora = Date.now();
    if (estado === 'listo' && ahora - ultimo > 150 && v.readyState === v.HAVE_ENOUGH_DATA) {
      ultimo = ahora;
      var w = 480, h = Math.round(v.videoHeight * (480 / v.videoWidth)) || 480;
      canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
      var code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (code && code.data && (code.data !== lastQr || ahora - lastAt > 4000)) {
        lastQr = code.data; lastAt = ahora;
        if (navigator.vibrate) navigator.vibrate(60);
        verificar(code.data);
      }
    }
    requestAnimationFrame(loop);
  }

  var saved = ss('op');
  if (saved) { $('op').value = ''; validarSesion(saved, false); }
  else setEstado('sin_sesion');
})();
