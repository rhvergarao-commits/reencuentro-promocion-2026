(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var OP = null, stream = null, busy = false, lastQr = '', lastAt = 0, current = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }

  function enter(tok) { OP = tok; ss('op', tok); $('login').hidden = true; $('scan').hidden = false; }
  $('login').addEventListener('submit', function (e) { e.preventDefault(); var t = $('op').value.trim(); if (/^OP-[A-Za-z0-9_-]{32}$/.test(t)) enter(t); else $('op').focus(); });
  $('btnSalir').onclick = function () { ss('op', null); OP = null; stopCam(); location.reload(); };
  var saved = ss('op'); if (saved) enter(saved);

  function verdict(kind, title, v, extra) {
    var who = v && v.titular ? '<div class="who">' + esc(v.titular) + (v.dni ? ' · DNI ' + esc(v.dni) : '') + '</div><div>' + esc(v.entrada || '') + ' · ' + esc(v.categoria || '') + '</div>' : '';
    $('result').innerHTML = '<div class="verdict ' + kind + '"><h2>' + esc(title) + '</h2><div>' + esc(v && v.motivo || '') + '</div>' + who + (extra || '') + '</div>';
  }

  function check(qr) {
    if (busy) return; busy = true; current = qr;
    verdict('warn', 'Verificando…', null);
    API.post({ action: 'puerta_consultar', operador: OP, qr: qr }).then(function (r) {
      if (!r.ok) { verdict('bad', r.error === 'NO_AUTORIZADO' ? 'Credencial no válida' : 'No verificado', { motivo: r.mensaje }); if (r.error === 'NO_AUTORIZADO') { ss('op', null); } return; }
      var v = r.verificacion;
      if (v.ok) {
        verdict('ok', 'Apta para ingresar', v, '<p style="margin-top:12px">Compara el nombre y el DNI con el documento.</p><button class="btn" type="button" id="btnIngreso">Registrar ingreso</button>');
        var rid = API.newId();
        $('btnIngreso').onclick = function () { registrar(qr, rid, this); };
      } else verdict(v.codigo === 'YA_INGRESO' ? 'warn' : 'bad', v.codigo === 'YA_INGRESO' ? 'Ya ingresó' : 'No puede ingresar', v);
    }).catch(function () {
      verdict('bad', 'Sin conexión', { motivo: 'No se pudo verificar. NO permitas el ingreso hasta confirmar con el servidor.' });
    }).then(function () { busy = false; });
  }
  function registrar(qr, rid, btn) {
    btn.disabled = true; btn.textContent = 'Registrando…';
    API.post({ action: 'puerta_ingresar', operador: OP, qr: qr, request_id: rid }).then(function (r) {
      if (!r.ok) { verdict('bad', 'No registrado', { motivo: r.mensaje }); return; }
      var v = r.verificacion;
      if (v.codigo === 'INGRESO_REGISTRADO') verdict('ok', '✓ Ingreso registrado', v);
      else verdict(v.codigo === 'YA_INGRESO' ? 'warn' : 'bad', v.codigo === 'YA_INGRESO' ? 'Ya ingresó' : 'No puede ingresar', v);
    }).catch(function () {
      verdict('bad', 'Sin conexión', { motivo: 'No se confirmó el registro. Vuelve a intentarlo; no se duplicará.' }, '<button class="btn" type="button" id="btnRetry">Reintentar registro</button>');
      $('btnRetry').onclick = function () { registrar(qr, rid, this); };
    });
  }

  $('btnManual').onclick = function () { var q = $('manual').value.trim(); if (q) check(q); };

  function stopCam() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  $('btnCam').onclick = function () {
    if (stream) { stopCam(); this.textContent = 'Activar cámara'; return; }
    var btn = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('camMsg').innerHTML = '<div class="notice warn"><div><b>Cámara no disponible</b><p>Usa el ingreso manual.</p></div></div>'; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
      stream = s; var v = $('video'); v.srcObject = s; v.play(); btn.textContent = 'Detener cámara'; $('camMsg').innerHTML = ''; loop();
    }).catch(function () { $('camMsg').innerHTML = '<div class="notice bad"><div><b>Sin permiso de cámara</b><p>Permite la cámara o usa el ingreso manual.</p></div></div>'; });
  };
  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  function loop() {
    if (!stream) return;
    var v = $('video');
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      var w = 480, h = Math.round(v.videoHeight * (480 / v.videoWidth)) || 480;
      canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
      var code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (code && code.data && (code.data !== lastQr || Date.now() - lastAt > 6000)) { lastQr = code.data; lastAt = Date.now(); if (navigator.vibrate) navigator.vibrate(60); check(code.data); }
    }
    requestAnimationFrame(loop);
  }
})();
