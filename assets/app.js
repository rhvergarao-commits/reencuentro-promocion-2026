(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var CFG = null;
  var selected = [];
  var MESES_DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  var ICON = {
    info: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
    bad: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/></svg>',
    ok: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function notice(kind, title, text, retry) {
    return '<div class="notice ' + kind + '" role="' + (kind === 'bad' ? 'alert' : 'status') + '">' + (ICON[kind] || ICON.info) +
      '<div><b>' + esc(title) + '</b>' + (text ? '<p>' + esc(text) + '</p>' : '') + (retry ? '<p><button class="link" type="button" data-retry>Reintentar</button></p>' : '') + '</div></div>';
  }
  function show(el, on) { el.hidden = !on; }
  function setMsg(id, kind, title, text) { $(id).innerHTML = title ? notice(kind, title, text) : ''; }

  function netError(e) {
    if (e && e.code === 'PENDIENTE') return ['warn', 'Conexión pendiente', 'La web aún no está conectada al servidor. Vuelve pronto.'];
    return ['bad', 'No pudimos comunicarnos con el servidor', 'Revisa tu conexión. Tus datos siguen en el formulario: vuelve a enviar y no se duplicará.'];
  }

  /* ---------------- Arranque ---------------- */
  function boot() {
    show($('loading'), true); $('banner').innerHTML = '';
    API.get('config').then(function (r) {
      show($('loading'), false);
      if (!r || !r.ok || !r.config) throw Object.assign(new Error('respuesta'), { code: 'RED' });
      CFG = r.config;
      render();
    }).catch(function (e) {
      show($('loading'), false);
      var m = netError(e);
      $('banner').innerHTML = notice(m[0], m[1], e.code === 'PENDIENTE' ? m[2] : 'No se pudo cargar la consulta. Revisa tu conexión.', e.code !== 'PENDIENTE');
      var b = $('banner').querySelector('[data-retry]'); if (b) b.onclick = boot;
    });
  }

  function render() {
    var c = CFG;
    if (c.fase === 'Votaciones') {
      $('heroText').textContent = 'Ayúdanos a elegir la fecha y lo que no puede faltar en el reencuentro.';
      if (c.consulta.recibe) {
        buildVote();
        show($('voteForm'), true);
        if (c.consulta.cierre) $('banner').innerHTML = notice('info', 'Consulta abierta', 'Recibimos respuestas hasta el ' + new Date(c.consulta.cierre).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' }) + '.');
      } else if (c.consulta.motivo === 'CERRADA') {
        $('banner').innerHTML = notice('warn', 'La consulta está cerrada', 'Gracias por participar. El organizador anunciará la fecha y el contenido.');
      } else {
        $('banner').innerHTML = notice('info', 'La consulta aún no está abierta', 'Pronto podrás elegir tus fechas. Vuelve en unos días.');
      }
      show($('reciboLinkWrap'), true);
      return;
    }
    // Fase Venta
    $('heroText').textContent = 'Registra tu entrada y la de tus invitados.';
    show($('tabs'), true);
    if (!c.venta.activa) {
      $('tabComprar').textContent = 'Venta';
    }
    var saved = API.load('grupo');
    selectTab(c.venta.activa && !saved ? 'venta' : 'mis');
    if (saved) { $('cred').value = saved; consultarGrupo(saved); }
  }

  function selectTab(view) {
    ['venta', 'mis'].forEach(function (v) { show($(v), v === view); });
    $('tabComprar').setAttribute('aria-selected', view === 'venta');
    $('tabMis').setAttribute('aria-selected', view === 'mis');
    if (view === 'venta') {
      if (!CFG.venta.activa) {
        show($('venta'), false);
        $('banner').innerHTML = notice('info', 'La venta aún no está abierta', 'El organizador la abrirá cuando confirme fecha, contenido y precio.');
      } else { $('banner').innerHTML = ''; buildVenta(); }
    } else if (!CFG.venta.activa) { $('banner').innerHTML = ''; }
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-view]'); if (b) selectTab(b.dataset.view); });

  /* ---------------- Votación ---------------- */
  var built = false;
  function buildVote() {
    if (built) return; built = true;
    $('fechasLead').textContent = 'Elige ' + CFG.min_fechas + ' o ' + CFG.max_fechas + ' fechas distintas en las que podrías asistir. Solo viernes, sábados y domingos.';
    buildCal();
    var ch = $('chips');
    ch.innerHTML = CFG.opciones.map(function (o, i) {
      return '<label class="chip"><input type="checkbox" name="adic" value="' + esc(o) + '" id="op' + i + '"><span>' + esc(o) + '</span></label>';
    }).join('') + '<label class="chip none" style="grid-column:1/-1"><input type="checkbox" id="opNinguna"><span>Ninguno, solo la base</span></label>';
    $('aviso').textContent = CFG.aviso;
    ch.addEventListener('change', function (e) {
      if (e.target.id === 'opNinguna' && e.target.checked) ch.querySelectorAll('input[name=adic]').forEach(function (x) { x.checked = false; });
      if (e.target.name === 'adic' && e.target.checked) $('opNinguna').checked = false;
      clearErr('adicionales');
    });
    document.querySelectorAll('.stepper button').forEach(function (b) {
      b.onclick = function () { var i = $('acompanantes'); var n = Math.max(0, (parseInt(i.value, 10) || 0) + Number(b.dataset.step)); i.value = n; clearErr('acompanantes'); };
    });
    $('dni').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 8); });
    ['nombre', 'dni', 'whatsapp', 'acompanantes'].forEach(function (f) { $(f).addEventListener('input', function () { clearErr(f); }); });
    $('integrante').addEventListener('change', function () { clearErr('integrante'); });
    $('voteForm').addEventListener('submit', submitVote);
  }

  function buildCal() {
    var allowed = CFG.fechas;
    var first = new Date(Date.UTC(2026, 11, 1));
    var lead = (first.getUTCDay() + 6) % 7; // lunes = 0
    var html = '<div class="cal-head"><b>Diciembre 2026</b><span class="cal-count" id="calCount"></span></div><div class="cal-grid">';
    MESES_DOW.forEach(function (d, i) { html += '<div class="cal-dow' + (i >= 4 ? ' we' : '') + '">' + d + '</div>'; });
    for (var i = 0; i < lead; i++) html += '<span></span>';
    for (var d = 1; d <= 31; d++) {
      var iso = '2026-12-' + (d < 10 ? '0' : '') + d;
      var on = allowed.indexOf(iso) >= 0;
      html += on ? '<button type="button" class="day on" data-d="' + iso + '" aria-pressed="false" aria-label="' + labelDate(iso) + '">' + d + '</button>'
        : '<span class="day" aria-hidden="true">' + d + '</span>';
    }
    html += '</div><div class="cal-sel" id="calSel"></div>';
    $('cal').innerHTML = html;
    $('cal').addEventListener('click', function (e) {
      var b = e.target.closest('button.day'); if (!b) return;
      var iso = b.dataset.d, k = selected.indexOf(iso);
      if (k >= 0) selected.splice(k, 1);
      else if (selected.length >= CFG.max_fechas) { flashCount(); return; }
      else selected.push(iso);
      paintCal(); clearErr('fechas');
    });
    paintCal();
  }
  function labelDate(iso) {
    var d = new Date(iso + 'T12:00:00-05:00');
    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' });
  }
  function paintCal() {
    $('cal').querySelectorAll('button.day').forEach(function (b) {
      var k = selected.indexOf(b.dataset.d);
      b.classList.toggle('sel', k >= 0); b.setAttribute('aria-pressed', k >= 0);
      if (k >= 0) b.dataset.n = k + 1; else delete b.dataset.n;
    });
    var cnt = $('calCount');
    cnt.textContent = selected.length + ' de ' + CFG.max_fechas + ' (mínimo ' + CFG.min_fechas + ')';
    cnt.classList.toggle('full', selected.length >= CFG.min_fechas);
    $('calSel').innerHTML = selected.map(function (s) { return '<span class="tag">' + esc(labelDate(s)) + '</span>'; }).join('');
  }
  function flashCount() { var c = $('calCount'); c.textContent = 'Máximo ' + CFG.max_fechas + ' fechas. Quita una para cambiarla.'; c.classList.remove('full'); setTimeout(paintCal, 2200); }

  function setErr(f, msg, form) {
    var el = (form || document).querySelector('.field[data-f="' + f + '"]');
    if (!el) return false;
    el.classList.add('err'); el.querySelector('.err-msg').textContent = msg; return el;
  }
  function clearErr(f, form) { var el = (form || document).querySelector('.field[data-f="' + f + '"]'); if (el) el.classList.remove('err'); }
  function clearAll(form) { form.querySelectorAll('.field.err').forEach(function (x) { x.classList.remove('err'); }); }
  function focusFirstErr(form) { var e = form.querySelector('.field.err'); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); var i = e.querySelector('input,select,button'); if (i) i.focus({ preventScroll: true }); } }

  function payloadVoto() {
    var adic = Array.prototype.map.call(document.querySelectorAll('input[name=adic]:checked'), function (x) { return x.value; });
    var answered = adic.length > 0 || $('opNinguna').checked;
    return {
      nombre: $('nombre').value.replace(/\s+/g, ' ').trim(),
      dni: $('dni').value.trim(),
      whatsapp: $('whatsapp').value.trim(),
      acompanantes: $('acompanantes').value === '' ? '' : Number($('acompanantes').value),
      integrante: $('integrante').checked,
      fechas: selected.slice().sort(),
      adicionales: adic.slice().sort(),
      adicionales_respondido: answered
    };
  }
  function validarLocal(p) {
    var e = {};
    if (p.nombre.length < 5 || p.nombre.split(' ').length < 2) e.nombre = 'Escribe tu nombre completo (nombre y apellido).';
    if (!/^\d{8}$/.test(p.dni)) e.dni = 'El DNI debe tener 8 dígitos.';
    if (!/^\+?\d{9,15}$/.test(p.whatsapp.replace(/[\s()\-]/g, ''))) e.whatsapp = 'Escribe un número de WhatsApp válido.';
    if (p.acompanantes === '' || !(p.acompanantes >= 0) || p.acompanantes !== Math.floor(p.acompanantes)) e.acompanantes = 'Indica un número entero (0 o más).';
    if (!p.integrante) e.integrante = 'Confirma que eres integrante de la promoción.';
    if (p.fechas.length < CFG.min_fechas || p.fechas.length > CFG.max_fechas) e.fechas = 'Elige entre ' + CFG.min_fechas + ' y ' + CFG.max_fechas + ' fechas.';
    if (!p.adicionales_respondido) e.adicionales = 'Elige al menos una opción o marca «Ninguno».';
    return e;
  }

  var sending = false;
  function submitVote(ev) {
    ev.preventDefault();
    if (sending) return;
    var form = $('voteForm'); clearAll(form); setMsg('formMsg');
    var p = payloadVoto();
    var errs = validarLocal(p);
    if (Object.keys(errs).length) { for (var k in errs) setErr(k, errs[k], form); focusFirstErr(form); return; }
    var body = Object.assign({ action: 'votar', request_id: API.requestIdFor('voto', p), empresa_web: $('empresa_web').value }, p);
    sending = true; $('btnVotar').disabled = true; $('btnVotar').innerHTML = '<span class="spinner" aria-hidden="true"></span> Enviando…';
    API.post(body).then(function (r) {
      if (r && r.ok && r.recibo) {
        API.store('recibo', r.recibo);
        API.forgetRequest('voto');
        show(form, false); show($('reciboLinkWrap'), false);
        $('doneTitle').textContent = r.estado === 'Registrado' ? '¡Respuesta registrada!' : 'Respuesta recibida';
        $('doneMsg').textContent = r.mensaje;
        $('doneRecibo').textContent = r.recibo;
        show($('done'), true);
        $('done').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      handleError(r, form, 'formMsg');
      if (r && (r.error === 'CERRADA' || r.error === 'NO_ABIERTA')) { $('btnVotar').disabled = true; sending = false; $('btnVotar').textContent = 'Consulta no disponible'; return; }
    }).catch(function (e) {
      var m = netError(e); setMsg('formMsg', m[0], m[1], m[2]);
    }).then(function () {
      if ($('btnVotar').textContent.indexOf('no disponible') < 0) { sending = false; $('btnVotar').disabled = false; $('btnVotar').textContent = 'Enviar mi respuesta'; }
    });
  }

  function handleError(r, form, msgId) {
    var titles = {
      DATOS: 'Revisa los datos marcados', DUPLICADO: 'Ya respondiste', CONFLICTO: 'Datos cambiados', CERRADA: 'Consulta cerrada', NO_ABIERTA: 'Consulta no abierta',
      CAPACIDAD: 'Cupo de respuestas completo', TEMPORAL: 'Servidor ocupado', FRECUENCIA: 'Demasiados intentos', VENTA_CERRADA: 'Venta no disponible',
      DUPLICADO_ENTRADA: 'DNI con entrada activa', REFERENCIA_REPETIDA: 'Pago ya reportado', NO_AUTORIZADO: 'Código no válido'
    };
    if (!r) { setMsg(msgId, 'bad', 'Respuesta no válida del servidor', 'Inténtalo otra vez.'); return; }
    if (r.campos) for (var k in r.campos) if (!setErr(k, r.campos[k], form)) { setErr('invitados', r.campos[k], form); }
    if (r.error === 'CONFLICTO') API.forgetRequest(form.id === 'voteForm' ? 'voto' : form.id);
    setMsg(msgId, r.error === 'TEMPORAL' ? 'warn' : 'bad', titles[r.error] || 'No se pudo completar', r.mensaje);
    focusFirstErr(form);
  }

  $('copyRecibo').onclick = function () { copy($('doneRecibo').textContent, this); };
  function copy(t, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = 'Copiado ✓'; setTimeout(function () { btn.textContent = o; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {}); else done();
  }

  $('reciboLink').onclick = function () { show($('reciboBox'), true); $('reciboIn').value = API.load('recibo') || ''; $('reciboIn').focus(); };
  $('btnRecibo').onclick = function () {
    var r = $('reciboIn').value.trim(); if (!r) return;
    setMsg('reciboMsg', 'info', 'Consultando…');
    API.post({ action: 'recibo', recibo: r }).then(function (x) {
      if (x.ok) setMsg('reciboMsg', x.estado === 'Registrado' ? 'ok' : 'warn', x.estado, x.mensaje);
      else setMsg('reciboMsg', 'bad', 'No se encontró', x.mensaje);
    }).catch(function (e) { var m = netError(e); setMsg('reciboMsg', m[0], m[1], 'Inténtalo otra vez.'); });
  };

  /* ---------------- Venta ---------------- */
  var ventaBuilt = false;
  function money(n) { return 'S/ ' + Number(n).toFixed(2); }
  function buildVenta() {
    if (ventaBuilt) return; ventaBuilt = true;
    var v = CFG.venta;
    $('ventaInclus').textContent = v.inclusiones;
    var fecha = v.fecha_evento ? new Date(v.fecha_evento + 'T12:00:00-05:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' }) : '';
    $('ventaKv').innerHTML = '<dt>Fecha</dt><dd>' + esc(fecha) + '</dd><dt>Precio por persona</dt><dd>' + money(v.precio) + (v.modalidad === 'Preventa' ? ' · preventa hasta ' + esc(v.preventa_hasta) : '') + '</dd>';
    $('vDni').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 8); });
    $('addGuest').onclick = function () { addGuest(); };
    $('ventaForm').addEventListener('submit', submitVenta);
  }
  function addGuest() {
    var n = $('guests').children.length + 1;
    var d = document.createElement('div'); d.className = 'guest';
    d.innerHTML = '<div class="guest-head"><span>Invitado ' + n + '</span><button type="button" class="link">Quitar</button></div>' +
      '<div class="row2"><input type="text" placeholder="Nombre completo" maxlength="80" data-g="nombre" aria-label="Nombre del invitado ' + n + '"><input type="text" placeholder="DNI" inputmode="numeric" maxlength="8" data-g="dni" aria-label="DNI del invitado ' + n + '"></div>';
    d.querySelector('button').onclick = function () { d.remove(); renumber(); };
    d.querySelector('[data-g=dni]').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 8); });
    $('guests').appendChild(d); d.querySelector('input').focus();
  }
  function renumber() { Array.prototype.forEach.call($('guests').children, function (g, i) { g.querySelector('.guest-head span').textContent = 'Invitado ' + (i + 1); }); }

  var sendingV = false;
  function submitVenta(ev) {
    ev.preventDefault(); if (sendingV) return;
    var form = $('ventaForm'); clearAll(form); setMsg('ventaMsg');
    var p = {
      nombre: $('vNombre').value.replace(/\s+/g, ' ').trim(), dni: $('vDni').value.trim(), whatsapp: $('vWsp').value.trim(),
      integrante: $('vIntegrante').checked, acepta_adelantos: $('vAcepta').checked,
      invitados: Array.prototype.map.call($('guests').children, function (g) { return { nombre: g.querySelector('[data-g=nombre]').value.replace(/\s+/g, ' ').trim(), dni: g.querySelector('[data-g=dni]').value.trim() }; })
    };
    var body = Object.assign({ action: 'venta_registrar', request_id: API.requestIdFor('ventaForm', p), empresa_web: $('vEmpresa').value }, p);
    sendingV = true; $('btnVenta').disabled = true; $('btnVenta').innerHTML = '<span class="spinner" aria-hidden="true"></span> Registrando…';
    API.post(body).then(function (r) {
      if (r && r.ok && r.credencial) { API.forgetRequest('ventaForm'); API.store('grupo', r.credencial); selectTab('mis'); pintarGrupo(r); return; }
      handleError(r, form, 'ventaMsg');
    }).catch(function (e) { var m = netError(e); setMsg('ventaMsg', m[0], m[1], m[2]); })
      .then(function () { sendingV = false; $('btnVenta').disabled = false; $('btnVenta').textContent = 'Registrar entradas'; });
  }

  $('credForm').addEventListener('submit', function (e) { e.preventDefault(); var c = $('cred').value.trim(); if (c) consultarGrupo(c); });
  function consultarGrupo(c) {
    setMsg('credMsg', 'info', 'Consultando…');
    API.post({ action: 'venta_consultar', credencial: c }).then(function (r) {
      if (r.ok) { setMsg('credMsg'); API.store('grupo', c); pintarGrupo(r); }
      else { setMsg('credMsg', 'bad', 'No se pudo abrir', r.mensaje); if (r.error === 'NO_AUTORIZADO') API.store('grupo', null); }
    }).catch(function (e) { var m = netError(e); setMsg('credMsg', m[0], m[1], 'Inténtalo otra vez.'); });
  }

  var grupoActual = null;
  function pintarGrupo(r) {
    grupoActual = r;
    show($('credForm'), false); show($('grupoView'), true);
    $('grupoCred').textContent = r.credencial;
    $('copyCred').onclick = function () { copy(r.credencial, this); };
    $('tickets').innerHTML = r.entradas.map(function (t) {
      var b = t.estado_pago === 'Pagada' ? 'ok' : (t.estado_pago === 'Parcial' ? 'warn' : 'bad');
      return '<article class="ticket"><div><div class="cod">' + esc(t.codigo) + ' · ' + esc(t.categoria) + '</div><div class="nom">' + esc(t.titular) + '</div>' +
        '<span class="badge ' + b + '">' + esc(t.estado_pago) + '</span>' +
        '<div class="meta" style="margin-top:8px">Precio ' + money(t.precio) + ' · Verificado ' + money(t.pagado) + ' · Saldo <b>' + money(t.saldo) + '</b></div>' +
        (t.ingreso ? '<div class="meta">Ingresó: ' + esc(t.ingreso) + '</div>' : '') +
        '<div class="meta" style="margin-top:6px">El QR se valida en la puerta: sin pago completo verificado no hay ingreso.</div></div>' +
        (t.qr ? '<div class="qr" data-qr="' + esc(t.qr) + '" role="img" aria-label="Código QR de ' + esc(t.codigo) + '"></div>' : '') + '</article>';
    }).join('') + (r.pagos.length ? '<div class="card"><h2>Pagos reportados</h2><dl class="kv">' + r.pagos.map(function (p) { return '<dt>' + esc(p.id) + ' · ' + esc(p.canal) + '</dt><dd>' + money(p.monto) + ' — ' + esc(p.estado) + '</dd>'; }).join('') + '</dl></div>' : '');
    $('tickets').querySelectorAll('[data-qr]').forEach(function (el) {
      var q = qrcode(0, 'M'); q.addData(el.dataset.qr); q.make();
      el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    });
    var activas = r.entradas.filter(function (t) { return t.estado === 'Activa' && t.saldo > 0; });
    $('pEntradas').innerHTML = activas.map(function (t) { return '<label class="chip"><input type="checkbox" name="pent" value="' + esc(t.codigo) + '" checked><span>' + esc(t.codigo) + ' · ' + money(t.saldo) + '</span></label>'; }).join('') || '<p class="hint">No hay saldos pendientes.</p>';
    $('pagoInstr').textContent = (CFG.venta && CFG.venta.instrucciones_pago) || 'Reporta aquí cada pago realizado.';
    show($('pagoForm'), CFG.venta && CFG.venta.activa && activas.length > 0);
  }

  var sendingP = false;
  $('pagoForm').addEventListener('submit', function (ev) {
    ev.preventDefault(); if (sendingP || !grupoActual) return;
    var form = $('pagoForm'); clearAll(form); setMsg('pagoMsg');
    var p = {
      credencial: grupoActual.credencial, canal: $('pCanal').value, monto: Number($('pMonto').value), referencia: $('pRef').value.trim(),
      fecha_operacion: $('pFecha').value, pagador: $('pPagador').value.replace(/\s+/g, ' ').trim(),
      entradas: Array.prototype.map.call(document.querySelectorAll('input[name=pent]:checked'), function (x) { return x.value; })
    };
    var body = Object.assign({ action: 'pago_reportar', request_id: API.requestIdFor('pagoForm', p) }, p);
    sendingP = true; $('btnPago').disabled = true;
    API.post(body).then(function (r) {
      if (r.ok) { API.forgetRequest('pagoForm'); setMsg('pagoMsg', 'ok', 'Pago reportado (' + r.pago + ')', r.mensaje); form.reset(); consultarGrupo(grupoActual.credencial); return; }
      handleError(r, form, 'pagoMsg');
    }).catch(function (e) { var m = netError(e); setMsg('pagoMsg', m[0], m[1], m[2]); })
      .then(function () { sendingP = false; $('btnPago').disabled = false; });
  });

  boot();
})();
