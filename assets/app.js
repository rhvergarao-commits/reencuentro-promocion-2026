(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var CFG = null, cfgAt = 0;
  var selected = [];
  var DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  var AVISO_CODIGO = 'No compartas tu código de grupo: permite consultar todas las entradas y pagos de tu grupo. Comparte solo la entrada individual de cada asistente';
  var ICON = {
    info: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
    bad: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/></svg>',
    ok: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------------- Utilidades de interfaz ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function notice(kind, title, text, retry) {
    return '<div class="notice ' + kind + '">' + (ICON[kind] || ICON.info) +
      '<div><b>' + esc(title) + '</b>' + (text ? '<p>' + esc(text) + '</p>' : '') + (retry ? '<p><button class="link" type="button" data-retry>Reintentar</button></p>' : '') + '</div></div>';
  }
  function show(el, on) { el.hidden = !on; }
  var anuncioT = null;
  /* Región viva dedicada: anuncia solo el mensaje relevante (no toda la aplicación). */
  function anunciar(t) {
    var a = $('anuncio'); a.textContent = '';
    clearTimeout(anuncioT); anuncioT = setTimeout(function () { a.textContent = t; }, 60);
  }
  function setMsg(id, kind, title, text, silencioso) {
    $(id).innerHTML = title ? notice(kind, title, text) : '';
    if (title && !silencioso) anunciar(title + (text ? '. ' + text : ''));
  }
  function money(n) { return 'S/ ' + Number(n || 0).toFixed(2); }
  function hoyLima() { return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); }
  function labelDate(iso, anio) {
    var d = new Date(iso + 'T12:00:00-05:00');
    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: anio ? 'numeric' : undefined, timeZone: 'America/Lima' });
  }
  function hora(iso) { try { return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }); } catch (e) { return ''; } }

  function netError(e) {
    if (e && e.code === 'PENDIENTE') return ['warn', 'Conexión pendiente', 'La web aún no está conectada al servidor. Vuelve pronto.'];
    if (e && e.incierto) return ['warn', 'Resultado incierto', 'No sabemos si el servidor registró la operación. Vuelve a confirmar desde esta misma página: si ya se registró, verás el mismo resultado sin duplicarse. No la repitas desde otro dispositivo.'];
    return ['bad', 'No pudimos comunicarnos con el servidor', 'Revisa tu conexión. Tus datos siguen en el formulario.'];
  }
  /* Progreso de reintentos (hasta ~95 s): se informa sin invitar a una segunda operación. */
  function progreso(btn, base, msgId) {
    return function (i, n) {
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + esc(base) + (i > 1 ? ' (intento ' + i + ' de ' + n + ')' : '');
      if (i > 1) setMsg(msgId, 'warn', 'La conexión está lenta', 'Seguimos intentando con el mismo envío; puede tardar hasta un minuto y medio. No cierres esta página ni envíes desde otro dispositivo.');
    };
  }
  function ocupado(btn, on, texto) {
    btn.disabled = on;
    if (on) { btn.dataset.txt = btn.dataset.txt || btn.textContent; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + esc(texto); }
    else if (btn.dataset.txt) { btn.textContent = texto || btn.dataset.txt; delete btn.dataset.txt; }
  }

  /* Errores por campo: aria-invalid, aria-describedby, foco y anuncio específico. */
  function fieldOf(form, f) { return form.querySelector('.field[data-f="' + f + '"]'); }
  function setErr(form, f, msg) {
    var el = fieldOf(form, f);
    if (!el) return false;
    el.classList.add('err');
    var em = el.querySelector('.err-msg'); em.textContent = msg;
    el.querySelectorAll('input:not([type=hidden]),select,.day.on').forEach(function (i) {
      i.setAttribute('aria-invalid', 'true');
      var d = (i.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (d.indexOf(em.id) < 0) d.push(em.id);
      i.setAttribute('aria-describedby', d.join(' '));
    });
    return true;
  }
  function clearErr(form, f) {
    var el = fieldOf(form, f); if (!el || !el.classList.contains('err')) return;
    el.classList.remove('err');
    el.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
  }
  function clearAll(form) { form.querySelectorAll('.field.err').forEach(function (x) { clearErr(form, x.dataset.f); }); }
  function mostrarErrores(form, errs, generalId) {
    var n = 0, primero = '';
    for (var k in errs) { if (!setErr(form, k, errs[k]) && generalId) setErr(form, generalId, errs[k]); n++; if (!primero) primero = errs[k]; }
    var e = form.querySelector('.field.err');
    if (e) {
      e.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      var i = e.querySelector('.day.on[tabindex="0"], input:not([type=hidden]), select, button');
      if (i) i.focus({ preventScroll: true });
    }
    anunciar((n > 1 ? n + ' campos por corregir. ' : '') + primero);
  }

  /* Copiado con confirmación solo si fue efectivo. */
  function copiar(texto, btn, msgEl, codeEl) {
    function ok() { msgEl.textContent = 'Copiado.'; msgEl.className = 'copy-msg ok'; setTimeout(function () { msgEl.textContent = ''; }, 2500); }
    function fallo() {
      msgEl.textContent = 'No se pudo copiar. Selecciona y copia el código manualmente'; msgEl.className = 'copy-msg bad';
      if (codeEl && window.getSelection) { var r = document.createRange(); r.selectNodeContents(codeEl); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
    function legado() {
      try {
        var ta = document.createElement('textarea'); ta.value = texto; ta.setAttribute('readonly', ''); ta.className = 'offscreen';
        document.body.appendChild(ta); ta.select(); var r = document.execCommand('copy'); ta.remove();
        r ? ok() : fallo();
      } catch (e) { fallo(); }
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(ok, legado); else legado();
  }

  var cargados = {};
  function cargarScript(src) {
    if (!cargados[src]) cargados[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { delete cargados[src]; rej(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
    return cargados[src];
  }

  /* ---------------- Configuración y estados ---------------- */
  var CACHE_CFG = 'cfg:v1';
  function cfgGuardada() {
    try { var o = JSON.parse(localStorage.getItem(CACHE_CFG) || 'null'); return o && o.c && o.c.estado_publico ? o.c : null; } catch (e) { return null; }
  }
  function cfgGuardar(c) { try { localStorage.setItem(CACHE_CFG, JSON.stringify({ c: c, t: Date.now() })); } catch (e) {} }
  function boot() {
    $('banner').innerHTML = '';
    var previa = cfgGuardada();
    if (previa) { CFG = previa; cfgAt = 0; show($('loading'), false); render(); } else show($('loading'), true);
    API.get('config').then(function (r) {
      show($('loading'), false);
      if (!r || !r.ok || !r.config) throw Object.assign(new Error('respuesta'), { code: 'RED' });
      var antes = previa ? JSON.stringify(previa) : null;
      CFG = r.config; cfgAt = Date.now(); cfgGuardar(CFG);
      if (antes !== JSON.stringify(CFG)) render();
    }).catch(function (e) {
      show($('loading'), false);
      if (previa) return;
      var m = netError(e);
      $('banner').innerHTML = notice(m[0], m[1], e.code === 'PENDIENTE' ? m[2] : 'No se pudo cargar la información. Revisa tu conexión.', e.code !== 'PENDIENTE');
      var b = $('banner').querySelector('[data-retry]'); if (b) b.onclick = boot;
    });
  }
  /* Vuelve a leer la configuración sin tocar los formularios (al volver a la pestaña y antes de confirmar). */
  function refrescarConfig() {
    return API.get('config').then(function (r) {
      if (r && r.ok && r.config) {
        var antes = CFG ? CFG.estado_publico : null;
        CFG = r.config; cfgAt = Date.now(); cfgGuardar(CFG);
        if (antes !== CFG.estado_publico) render(); else aplicarPermisos();
      }
      return CFG;
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && CFG && Date.now() - cfgAt > 15000) refrescarConfig().catch(function () {});
  });

  var ETIQUETA = {
    BORRADOR: 'Consulta en preparación', CONSULTA_ABIERTA: 'Consulta abierta', CONSULTA_CERRADA: 'Consulta cerrada · resultado pendiente',
    VENTA: 'Entradas', DESCONOCIDO: 'Etapa no disponible'
  };
  var vista = null;
  function render() {
    var c = CFG, ep = c.estado_publico || 'DESCONOCIDO';
    $('estadoChip').textContent = ETIQUETA[ep] || ETIQUETA.DESCONOCIDO; show($('estadoChip'), true);
    $('banner').innerHTML = '';
    ['venta', 'mis', 'tabs'].forEach(function (id) { show($(id), false); });
    var votoEnCurso = built && $('done').hidden && ($('nombre').value || $('dni').value || selected.length);
    if (!votoEnCurso) show($('voteForm'), false);
    show($('reciboLinkWrap'), !$('done').hidden ? false : true);
    if (ep === 'CONSULTA_ABIERTA' || ep === 'BORRADOR' || ep === 'CONSULTA_CERRADA') {
      $('heroText').textContent = 'Ayúdanos a elegir la fecha y lo que no puede faltar en el reencuentro.';
      if (ep === 'CONSULTA_ABIERTA') {
        buildVote();
        if ($('done').hidden) show($('voteForm'), true);
        if (c.consulta.cierre) $('banner').innerHTML = notice('info', 'Consulta abierta', 'Recibimos respuestas hasta el ' + new Date(c.consulta.cierre).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' }) + '.');
      } else if (ep === 'CONSULTA_CERRADA') {
        $('banner').innerHTML = notice('warn', 'La consulta está cerrada', 'Gracias por participar. El resultado está pendiente: el organizador anunciará la fecha y el contenido.');
      } else {
        $('banner').innerHTML = notice('info', 'La consulta aún no está abierta', 'Pronto podrás elegir tus fechas. Vuelve en unos días.');
      }
      votoCerrado(ep !== 'CONSULTA_ABIERTA');
      return;
    }
    show($('voteForm'), false);
    if (ep !== 'VENTA') {
      $('heroText').textContent = 'Reencuentro de la promoción.';
      $('banner').innerHTML = notice('info', 'Esta sección no está disponible por ahora', 'El organizador está preparando la siguiente etapa. Vuelve más tarde.');
      return;
    }
    $('heroText').textContent = 'Registra tu entrada y la de tus invitados.';
    show($('tabs'), true);
    var saved = API.load('grupo');
    selectTab(vista || (c.permisos.reservas && !saved ? 'venta' : 'mis'));
    if (saved && !grupoActual) { $('cred').value = saved; $('recordar').checked = API.remembered('grupo'); consultarGrupo(saved); }
  }
  function aplicarPermisos() {
    if (!CFG) return;
    if (CFG.estado_publico === 'CONSULTA_ABIERTA') votoCerrado(false);
    if (CFG.estado_publico !== 'VENTA') return;
    if (vista === 'venta') selectTab('venta');
    if (grupoActual) permisosGrupo();
  }
  function selectTab(view) {
    vista = view;
    ['venta', 'mis'].forEach(function (v) { show($(v), v === view); });
    $('tabComprar').setAttribute('aria-pressed', view === 'venta');
    $('tabMis').setAttribute('aria-pressed', view === 'mis');
    $('banner').innerHTML = '';
    if (view === 'venta') {
      if (!CFG.permisos.reservas) {
        show($('venta'), false);
        $('banner').innerHTML = notice('info', 'El registro de nuevas entradas no está abierto', 'Si ya tienes entradas, revísalas en «Mis entradas».');
      } else buildVenta();
    }
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-view]'); if (b) selectTab(b.dataset.view); });

  /* ---------------- Votación ---------------- */
  var built = false;
  function buildVote() {
    if (built) return; built = true;
    var form = $('voteForm');
    $('fechasLead').textContent = 'Elige ' + CFG.min_fechas + ' o ' + CFG.max_fechas + ' fechas distintas en las que podrías asistir. Solo viernes, sábados y domingos.';
    $('acompanantes').max = (CFG.limites && CFG.limites.max_acompanantes) || 50;
    buildCal();
    var ch = $('chips');
    ch.innerHTML = CFG.opciones.map(function (o, i) {
      return '<label class="chip"><input type="checkbox" name="adic" value="' + esc(o) + '" id="op' + i + '"><span>' + esc(o) + '</span></label>';
    }).join('') + '<label class="chip none wide"><input type="checkbox" id="opNinguna" value="Ningún adicional"><span>Ningún adicional</span></label>';
    $('aviso').textContent = CFG.aviso;
    ch.addEventListener('change', function (e) {
      if (e.target.id === 'opNinguna' && e.target.checked) ch.querySelectorAll('input[name=adic]').forEach(function (x) { x.checked = false; });
      if (e.target.name === 'adic' && e.target.checked) $('opNinguna').checked = false;
      clearErr(form, 'adicionales');
    });
    document.querySelectorAll('.stepper button').forEach(function (b) {
      b.onclick = function () { var i = $('acompanantes'); var n = Math.min(Number(i.max) || 50, Math.max(0, (parseInt(i.value, 10) || 0) + Number(b.dataset.step))); i.value = n; clearErr(form, 'acompanantes'); editado(); };
    });
    $('dni').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 8); });
    ['nombre', 'dni', 'whatsapp', 'acompanantes'].forEach(function (f) { $(f).addEventListener('input', function () { clearErr(form, f); }); });
    $('integrante').addEventListener('change', function () { clearErr(form, 'integrante'); });
    form.addEventListener('input', editado); form.addEventListener('change', editado);
    form.addEventListener('submit', submitVote);
    $('btnEditar').onclick = function () { editado(); $('nombre').focus(); };
  }
  function votoCerrado(cerrado) {
    if (!built) return;
    var b = $('btnVotar');
    if (cerrado) { b.disabled = true; b.textContent = 'Consulta no disponible'; }
    else if (b.textContent === 'Consulta no disponible') { b.disabled = false; b.textContent = 'Revisar mi respuesta'; }
  }

  /* Calendario accesible: botones con nombre completo de la fecha, foco itinerante y flechas. */
  function buildCal() {
    var allowed = CFG.fechas;
    var first = new Date(Date.UTC(2026, 11, 1));
    var lead = (first.getUTCDay() + 6) % 7;
    var html = '<div class="cal-head"><b id="calTitulo">Diciembre 2026</b><span class="cal-count" id="calCount"></span></div><div class="cal-grid" role="group" aria-labelledby="calTitulo" aria-describedby="calAyuda fechasLead">';
    DOW.forEach(function (d, i) { html += '<div class="cal-dow' + (i >= 4 ? ' we' : '') + '" aria-hidden="true">' + d + '</div>'; });
    for (var i = 0; i < lead; i++) html += '<span aria-hidden="true"></span>';
    var primero = true;
    for (var d = 1; d <= 31; d++) {
      var iso = '2026-12-' + (d < 10 ? '0' : '') + d;
      var on = allowed.indexOf(iso) >= 0;
      html += on ? '<button type="button" class="day on" data-d="' + iso + '" aria-pressed="false" tabindex="' + (primero ? '0' : '-1') + '" aria-label="' + esc(labelDate(iso, true)) + '">' + d + '</button>'
        : '<span class="day" aria-hidden="true">' + d + '</span>';
      if (on) primero = false;
    }
    html += '</div><div class="cal-sel" id="calSel"></div>';
    var cal = $('cal');
    cal.innerHTML = html;
    cal.addEventListener('click', function (e) { var b = e.target.closest('button.day'); if (b) toggleDay(b); });
    cal.addEventListener('keydown', function (e) {
      var b = e.target.closest('button.day'); if (!b) return;
      var dias = Array.prototype.slice.call(cal.querySelectorAll('button.day'));
      var k = dias.indexOf(b), dest = null, n = Number(b.textContent);
      function porDia(target, dir) {
        for (var t = target; t >= 1 && t <= 31; t += dir) { var x = cal.querySelector('button.day[data-d="2026-12-' + (t < 10 ? '0' : '') + t + '"]'); if (x) return x; }
        return null;
      }
      switch (e.key) {
        case 'ArrowRight': dest = dias[k + 1]; break;
        case 'ArrowLeft': dest = dias[k - 1]; break;
        case 'ArrowDown': dest = porDia(n + 7, 1); break;
        case 'ArrowUp': dest = porDia(n - 7, -1); break;
        case 'Home': dest = dias[0]; break;
        case 'End': dest = dias[dias.length - 1]; break;
        default: return;
      }
      e.preventDefault();
      if (dest) { dias.forEach(function (x) { x.tabIndex = -1; }); dest.tabIndex = 0; dest.focus(); }
    });
    paintCal();
  }
  function toggleDay(b) {
    var iso = b.dataset.d, k = selected.indexOf(iso);
    if (k >= 0) { selected.splice(k, 1); anunciar('Quitaste ' + labelDate(iso) + '. ' + selected.length + ' de ' + CFG.max_fechas + '.'); }
    else if (selected.length >= CFG.max_fechas) { anunciar('Máximo ' + CFG.max_fechas + ' fechas. Quita una para cambiarla.'); flashCount(); return; }
    else { selected.push(iso); anunciar('Elegiste ' + labelDate(iso) + '. ' + selected.length + ' de ' + CFG.max_fechas + '.'); }
    $('cal').querySelectorAll('button.day').forEach(function (x) { x.tabIndex = x === b ? 0 : -1; });
    paintCal(); clearErr($('voteForm'), 'fechas'); editado();
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
    $('calSel').innerHTML = selected.slice().sort().map(function (s) { return '<span class="tag">' + esc(labelDate(s)) + '</span>'; }).join('');
  }
  function flashCount() { var c = $('calCount'); c.textContent = 'Máximo ' + CFG.max_fechas + ' fechas. Quita una para cambiarla.'; c.classList.remove('full'); setTimeout(paintCal, 2200); }

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
  var RE_NOMBRE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .'’-]*[A-Za-zÀ-ÖØ-öø-ÿ.]$/;
  function nombreOk(n) { return n.length >= 5 && n.length <= 80 && n.split(' ').length >= 2 && RE_NOMBRE.test(n); }
  function wspOk(w) { return /^\+?\d{9,15}$/.test(String(w).replace(/[\s()\-]/g, '')); }
  function validarVoto(p) {
    var e = {}, maxA = (CFG.limites && CFG.limites.max_acompanantes) || 50;
    if (!nombreOk(p.nombre)) e.nombre = 'Escribe tu nombre completo (nombre y apellido), solo con letras.';
    if (!/^\d{8}$/.test(p.dni)) e.dni = 'El DNI debe tener 8 dígitos.';
    if (!wspOk(p.whatsapp)) e.whatsapp = 'Escribe un número de WhatsApp válido (9 a 15 dígitos).';
    if (p.acompanantes === '' || !(p.acompanantes >= 0) || p.acompanantes !== Math.floor(p.acompanantes) || p.acompanantes > maxA) e.acompanantes = 'Indica un número entero entre 0 y ' + maxA + '.';
    if (!p.integrante) e.integrante = 'Confirma que eres integrante de la promoción.';
    if (p.fechas.length < CFG.min_fechas || p.fechas.length > CFG.max_fechas) e.fechas = 'Elige entre ' + CFG.min_fechas + ' y ' + CFG.max_fechas + ' fechas.';
    if (!p.adicionales_respondido) e.adicionales = 'Elige al menos una opción o marca «Ningún adicional».';
    return e;
  }

  /* Paso de revisión antes de enviar. */
  var revisando = false, sending = false;
  function editado() {
    if (!revisando || sending) return;
    revisando = false; show($('voteResumen'), false); show($('btnEditar'), false);
    $('btnVotar').textContent = 'Revisar mi respuesta';
  }
  function listaDatos(d) {
    return '<dt>Nombre</dt><dd>' + esc(d.nombre) + '</dd><dt>DNI</dt><dd>' + esc(d.dni) + '</dd><dt>WhatsApp</dt><dd>' + esc(d.whatsapp) + '</dd>' +
      '<dt>Acompañantes</dt><dd>' + esc(d.acompanantes) + '</dd><dt>Fechas</dt><dd>' + d.fechas.map(function (f) { return esc(labelDate(f)); }).join('<br>') + '</dd>' +
      '<dt>Adicionales</dt><dd>' + (d.adicionales.length ? d.adicionales.map(esc).join(', ') : 'Ningún adicional') + '</dd>';
  }
  function submitVote(ev) {
    ev.preventDefault();
    if (sending) return;
    var form = $('voteForm'); clearAll(form); setMsg('formMsg');
    var p = payloadVoto();
    var errs = validarVoto(p);
    if (Object.keys(errs).length) { editado(); mostrarErrores(form, errs); return; }
    if (!revisando) {
      revisando = true;
      $('voteResumen').innerHTML = '<h3>Revisa tu respuesta</h3><dl class="kv">' + listaDatos(p) + '</dl><p class="hint">Después de enviarla no podrás corregirla en línea.</p>';
      show($('voteResumen'), true); show($('btnEditar'), true);
      $('btnVotar').textContent = 'Confirmar y enviar';
      $('voteResumen').focus();
      anunciar('Revisa tu respuesta y pulsa Confirmar y enviar.');
      return;
    }
    sending = true; ocupado($('btnVotar'), true, 'Enviando…');
    var btn = $('btnVotar');
    refrescarConfig().catch(function () { return CFG; }).then(function () {
      if (CFG.estado_publico !== 'CONSULTA_ABIERTA') throw { cerrada: true };
      return API.requestIdFor('voto', p);
    }).then(function (rid) {
      var body = Object.assign({ action: 'votar', request_id: rid, empresa_web: $('empresa_web').value }, p);
      return API.post(body, progreso(btn, 'Enviando…', 'formMsg'));
    }).then(function (r) {
      if (r && r.ok && r.recibo) {
        API.store('recibo', r.recibo);
        API.forgetRequest('voto');
        show(form, false); show($('reciboLinkWrap'), false); show($('reciboBox'), false);
        $('doneTitle').textContent = r.estado === 'Registrado' ? '¡Respuesta registrada!' : 'Respuesta recibida';
        $('doneMsg').textContent = r.mensaje;
        $('doneDatos').innerHTML = r.datos ? listaDatos(r.datos) + '<dt>Estado</dt><dd>' + esc(r.estado) + '</dd>' : '';
        $('doneRecibo').textContent = r.recibo;
        show($('done'), true); $('done').focus();
        anunciar(r.mensaje);
        return;
      }
      handleError(r, form, 'formMsg', 'voto');
    }).catch(function (e) {
      if (e && e.cerrada) { setMsg('formMsg', 'warn', 'La consulta ya no recibe respuestas', 'El organizador la cerró o aún no la abre. Tus datos no se enviaron.'); return; }
      var m = netError(e); setMsg('formMsg', m[0], m[1], m[2]);
    }).then(function () {
      sending = false; ocupado(btn, false, revisando ? 'Confirmar y enviar' : 'Revisar mi respuesta');
      if (CFG.estado_publico !== 'CONSULTA_ABIERTA') votoCerrado(true);
    });
  }

  var TITULOS = {
    DATOS: 'Revisa los datos marcados', DUPLICADO: 'Ya respondiste', CONFLICTO: 'Datos cambiados', CERRADA: 'Consulta cerrada', NO_ABIERTA: 'Consulta no abierta',
    CAPACIDAD: 'Cupo de respuestas completo', TEMPORAL: 'Servidor ocupado', FRECUENCIA: 'Demasiados intentos', VENTA_CERRADA: 'Registro de entradas cerrado',
    PAGOS_CERRADOS: 'Reporte de pagos no habilitado', DUPLICADO_ENTRADA: 'DNI con entrada activa', DUPLICADO_PERSONA: 'Registro existente', REFERENCIA_REPETIDA: 'Pago ya reportado',
    NO_AUTORIZADO: 'Código no válido', CREDENCIAL_ROTADA: 'Código de grupo renovado', REVISION: 'En revisión', OFERTA_CAMBIADA: 'El precio cambió', FASE: 'Etapa no disponible'
  };
  function handleError(r, form, msgId, kind, generalId) {
    if (!r) { setMsg(msgId, 'bad', 'Respuesta no válida del servidor', 'Inténtalo otra vez.'); return; }
    if (r.error === 'CONFLICTO' && kind) API.forgetRequest(kind);
    setMsg(msgId, r.error === 'TEMPORAL' ? 'warn' : 'bad', TITULOS[r.error] || 'No se pudo completar', r.mensaje, !!r.campos);
    if (r.campos) mostrarErrores(form, r.campos, generalId);
  }

  $('copyRecibo').onclick = function () { copiar($('doneRecibo').textContent, this, $('copyReciboMsg'), $('doneRecibo')); };

  /* Consulta de recibo (disponible en todas las etapas). */
  $('reciboLink').onclick = function () { show($('reciboBox'), true); $('reciboIn').value = API.load('recibo') || ''; $('reciboIn').focus(); };
  var reciboSeq = 0;
  $('btnRecibo').onclick = function () {
    var box = $('reciboBox'), r = $('reciboIn').value.trim(), seq = ++reciboSeq;
    clearAll(box); show($('reciboDatos'), false);
    if (!r) { mostrarErrores(box, { recibo: 'Escribe tu recibo.' }); return; }
    if (!/^R-[A-Za-z0-9_-]{20,40}$/.test(r)) { mostrarErrores(box, { recibo: 'El recibo empieza con «R-» seguido de letras y números.' }); return; }
    setMsg('reciboMsg', 'info', 'Consultando…', '', true);
    API.post({ action: 'recibo', recibo: r }).then(function (x) {
      if (seq !== reciboSeq) return;
      if (x.ok) {
        setMsg('reciboMsg', x.estado === 'Registrado' ? 'ok' : 'warn', x.estado, x.mensaje);
        if (x.datos) { $('reciboDatos').innerHTML = listaDatos(x.datos); show($('reciboDatos'), true); }
      } else setMsg('reciboMsg', 'bad', x.error === 'NO_ENCONTRADO' ? 'No se encontró' : (TITULOS[x.error] || 'No se pudo consultar'), x.mensaje);
    }).catch(function (e) { if (seq === reciboSeq) { var m = netError(e); setMsg('reciboMsg', m[0], m[1], 'Inténtalo otra vez.'); } });
  };

  /* ---------------- Venta ---------------- */
  var ventaBuilt = false;
  function maxInv() { return (CFG.limites && CFG.limites.max_invitados) || 20; }
  function buildVenta() {
    var v = CFG.venta;
    $('ventaInclus').textContent = v.inclusiones || '';
    var fecha = v.fecha_evento ? labelDate(v.fecha_evento, true) : '';
    $('ventaKv').innerHTML = '<dt>Fecha</dt><dd>' + esc(fecha) + '</dd><dt>Precio por entrada</dt><dd>' + money(v.oferta && v.oferta.precio) + (v.oferta && v.oferta.modalidad === 'Preventa' ? ' · preventa hasta ' + esc(labelDate(v.oferta.preventa_hasta)) : '') + '</dd>';
    document.querySelectorAll('.maxInv').forEach(function (x) { x.textContent = maxInv(); });
    cotizar('venta');
    if (ventaBuilt) return; ventaBuilt = true;
    var form = $('ventaForm');
    $('vDni').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 8); });
    $('addGuest').onclick = function () { addGuest($('guests'), form, 'venta'); };
    form.addEventListener('input', function (e) { var f = e.target.closest('.field'); if (f) clearErr(form, f.dataset.f); if (!e.target.closest('.resumen')) ventaEditado('venta'); });
    form.addEventListener('change', function (e) { if (!e.target.closest('.resumen')) ventaEditado('venta'); });
    form.addEventListener('submit', function (ev) { ev.preventDefault(); enviarVenta('venta'); });
    $('btnVentaEditar').onclick = function () { ventaEditado('venta'); $('vNombre').focus(); };
  }
  function addGuest(cont, form, modo) {
    if (cont.children.length >= maxInv()) { mostrarErrores(form, { invitados: 'Puedes registrar hasta ' + maxInv() + ' invitados por solicitud.' }); return; }
    var d = document.createElement('div'); d.className = 'guest';
    cont.appendChild(d);
    renumber(cont);
    d.querySelector('input').focus();
    cotizar(modo); ventaEditado(modo);
  }
  function renumber(cont) {
    var datos = Array.prototype.map.call(cont.children, function (g) { var i = g.querySelectorAll('input'); return i.length ? [i[0].value, i[1].value] : ['', '']; });
    var pre = cont.id;
    Array.prototype.forEach.call(cont.children, function (g, i) {
      var n = i + 1;
      g.innerHTML = '<div class="guest-head"><span>Invitado ' + n + '</span><button type="button" class="link" aria-label="Quitar invitado ' + n + '">Quitar</button></div>' +
        '<div class="row2"><div class="field" data-f="invitado_' + i + '_nombre"><label for="' + pre + 'n' + i + '">Nombre completo</label><input type="text" id="' + pre + 'n' + i + '" maxlength="80" data-g="nombre"><div class="err-msg" id="' + pre + 'n' + i + '-err"></div></div>' +
        '<div class="field" data-f="invitado_' + i + '_dni"><label for="' + pre + 'd' + i + '">DNI</label><input type="text" id="' + pre + 'd' + i + '" inputmode="numeric" maxlength="8" data-g="dni"><div class="err-msg" id="' + pre + 'd' + i + '-err"></div></div></div>';
      g.querySelector('[data-g=nombre]').value = datos[i][0]; g.querySelector('[data-g=dni]').value = datos[i][1];
      g.querySelector('[data-g=dni]').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 8); });
      g.querySelector('button').onclick = function () {
        var modo = pre === 'guests' ? 'venta' : 'agregar';
        g.remove(); renumber(cont); cotizar(modo); ventaEditado(modo);
        var sig = cont.querySelector('input') || $(modo === 'venta' ? 'addGuest' : 'addGuest2'); sig.focus();
        anunciar('Invitado quitado.');
      };
    });
  }
  function invitadosDe(cont) {
    return Array.prototype.map.call(cont.children, function (g) { return { nombre: g.querySelector('[data-g=nombre]').value.replace(/\s+/g, ' ').trim(), dni: g.querySelector('[data-g=dni]').value.trim() }; });
  }
  /* Cotización mostrada (precio unitario × cantidad = total). El servidor decide el precio. */
  var M = {
    venta: { form: 'ventaForm', guests: 'guests', cot: 'ventaCot', conf: 'ventaConf', msg: 'ventaMsg', btn: 'btnVenta', edit: 'btnVentaEditar', base: 1, revisando: false, sending: false, oferta: null, kind: 'venta' },
    agregar: { form: 'agregarForm', guests: 'guests2', cot: 'agregarCot', conf: 'agregarConf', msg: 'agregarMsg', btn: 'btnAgregar', edit: 'btnAgregarEditar', base: 0, revisando: false, sending: false, oferta: null, kind: 'agregar' }
  };
  function cotizar(modo) {
    var m = M[modo], of = CFG.venta && CFG.venta.oferta;
    if (!of) { $(m.cot).innerHTML = ''; return; }
    var n = m.base + $(m.guests).children.length;
    $(m.cot).innerHTML = n ? '<div class="cot-fila"><span>' + money(of.precio) + ' × ' + n + ' entrada' + (n > 1 ? 's' : '') + '</span><b>' + money(of.precio * n) + '</b></div>' : '';
  }
  function ventaEditado(modo) {
    var m = M[modo];
    if (!m.revisando || m.sending) return;
    m.revisando = false; show($(m.conf), false); show($(m.edit), false); $(m.btn).textContent = 'Revisar total';
  }
  function validarVenta(modo, p) {
    var e = {};
    if (modo === 'venta') {
      if (!nombreOk(p.nombre)) e.nombre = 'Escribe tu nombre completo, solo con letras.';
      if (!/^\d{8}$/.test(p.dni)) e.dni = 'El DNI debe tener 8 dígitos.';
      if (!wspOk(p.whatsapp)) e.whatsapp = 'WhatsApp no válido (9 a 15 dígitos).';
      if (!p.integrante) e.integrante = 'Confirma que eres integrante de la promoción.';
      if (!p.acepta_adelantos) e.acepta_adelantos = 'Debes aceptar que los adelantos no son reembolsables.';
    } else if (!p.invitados.length) e.invitados = 'Agrega al menos un invitado.';
    var vistos = {}; if (p.dni) vistos[p.dni] = 1;
    p.invitados.forEach(function (g, i) {
      if (!nombreOk(g.nombre)) e['invitado_' + i + '_nombre'] = 'Nombre completo del invitado ' + (i + 1) + '.';
      if (!/^\d{8}$/.test(g.dni)) e['invitado_' + i + '_dni'] = 'DNI de 8 dígitos del invitado ' + (i + 1) + '.';
      else if (vistos[g.dni]) e['invitado_' + i + '_dni'] = 'DNI repetido en la solicitud.';
      vistos[g.dni] = 1;
    });
    if (p.invitados.length > maxInv()) e.invitados = 'Puedes registrar hasta ' + maxInv() + ' invitados por solicitud.';
    return e;
  }
  function payloadVenta(modo) {
    var inv = invitadosDe($(M[modo].guests));
    if (modo === 'agregar') return { invitados: inv };
    return {
      nombre: $('vNombre').value.replace(/\s+/g, ' ').trim(), dni: $('vDni').value.trim(), whatsapp: $('vWsp').value.trim(),
      integrante: $('vIntegrante').checked, acepta_adelantos: $('vAcepta').checked, invitados: inv
    };
  }
  function mostrarConfirmacion(modo, p, of, previo) {
    var m = M[modo], n = m.base + p.invitados.length, total = of.precio * n;
    var nombres = (modo === 'venta' ? ['<li>' + esc(p.nombre) + ' <span class="hint-inline">(integrante)</span></li>'] : []).concat(p.invitados.map(function (g) { return '<li>' + esc(g.nombre) + ' <span class="hint-inline">(invitado)</span></li>'; }));
    var cambio = previo && cents(previo.precio) !== cents(of.precio)
      ? '<div class="notice warn"><div><b>El precio vigente cambió</b><p>Antes ' + money(previo.precio) + ' por entrada; ahora ' + money(of.precio) + '. Diferencia en el total: ' + (of.precio > previo.precio ? '+' : '−') + money(Math.abs(of.precio - previo.precio) * n) + '.</p></div></div>' : '';
    $(m.conf).innerHTML = '<h3>Revisa antes de registrar</h3>' + cambio + '<ul class="nombres">' + nombres.join('') + '</ul>' +
      '<div class="cot-fila"><span>Precio por entrada (' + esc(of.modalidad) + ')</span><b>' + money(of.precio) + '</b></div>' +
      '<div class="cot-fila"><span>Cantidad</span><b>' + n + '</b></div>' +
      '<div class="cot-fila total"><span>Total</span><b>' + money(total) + '</b></div>' +
      '<div class="field" data-f="oferta"><label class="check"><input type="checkbox" id="' + modo + 'AceptaTotal"> <span>Acepto el total de ' + money(total) + ' con el precio vigente.</span></label><div class="err-msg" id="' + modo + 'Oferta-err"></div></div>';
    show($(m.conf), true); show($(m.edit), true);
    $(m.btn).textContent = 'Confirmar registro';
    m.oferta = of; m.revisando = true;
    $(m.conf).focus();
    anunciar((cambio ? 'El precio vigente cambió. ' : '') + 'Total ' + money(total) + '. Marca la aceptación y confirma.');
  }
  function cents(x) { return Math.round(Number(x) * 100); }
  function enviarVenta(modo) {
    var m = M[modo], form = $(m.form);
    if (m.sending) return;
    clearAll(form); setMsg(m.msg);
    var p = payloadVenta(modo);
    var errs = validarVenta(modo, p);
    if (Object.keys(errs).length) { ventaEditado(modo); mostrarErrores(form, errs, 'invitados'); return; }
    var btn = $(m.btn);
    if (!m.revisando) {
      ocupado(btn, true, 'Consultando precio vigente…');
      refrescarConfig().then(function () {
        ocupado(btn, false);
        if (!CFG.permisos.reservas || !CFG.venta.oferta) { setMsg(m.msg, 'bad', TITULOS.VENTA_CERRADA, 'El registro de nuevas entradas no está abierto en este momento.'); return; }
        cotizar(modo); mostrarConfirmacion(modo, p, CFG.venta.oferta, m.oferta);
      }).catch(function (e) { ocupado(btn, false); var x = netError(e); setMsg(m.msg, x[0], x[1], 'No se pudo consultar el precio vigente. Inténtalo otra vez.'); });
      return;
    }
    if (!$(modo + 'AceptaTotal').checked) { mostrarErrores(form, { oferta: 'Marca que aceptas el total para continuar.' }); return; }
    var body = Object.assign({ action: modo === 'venta' ? 'venta_registrar' : 'venta_agregar', acepta_oferta: true, oferta_id: m.oferta.oferta_id }, p);
    if (modo === 'venta') body.empresa_web = $('vEmpresa').value; else body.credencial = grupoActual.credencial;
    m.sending = true; ocupado(btn, true, 'Registrando…');
    var intent = Object.assign({ of: m.oferta.oferta_id, g: modo === 'agregar' ? grupoActual.grupo : '' }, p);
    API.requestIdFor(m.kind, intent).then(function (rid) {
      body.request_id = rid;
      return API.post(body, progreso(btn, 'Registrando…', m.msg));
    }).then(function (r) {
      if (r && r.ok && r.credencial) {
        API.forgetRequest(m.kind);
        m.revisando = false; show($(m.conf), false); show($(m.edit), false);
        $(m.guests).innerHTML = ''; cotizar(modo);
        if (modo === 'venta') {
          form.reset(); m.oferta = null;
          API.store('grupo', r.credencial, false);
          selectTab('mis');
        }
        pintarGrupo(r);
        setMsg(modo === 'venta' ? 'resumenMsg' : m.msg, 'ok', modo === 'venta' ? 'Entradas registradas' : 'Invitados agregados', 'Guarda tu código de grupo. Las entradas cuentan como pagadas solo cuando el organizador verifica el pago.');
        if (modo === 'venta') $('resumenGrupo').focus();
        return;
      }
      if (r && r.error === 'OFERTA_CAMBIADA' && r.cotizacion) {
        var nuevo = { oferta_id: r.cotizacion.oferta_id, precio: r.cotizacion.precio, modalidad: r.cotizacion.modalidad, preventa_hasta: r.cotizacion.preventa_hasta };
        var previo = m.oferta;
        if (CFG.venta) CFG.venta.oferta = nuevo;
        cotizar(modo); buildVentaKv();
        mostrarConfirmacion(modo, p, nuevo, previo);
        return;
      }
      handleError(r, form, m.msg, m.kind, 'invitados');
      if (r && (r.error === 'VENTA_CERRADA' || r.error === 'NO_AUTORIZADO' || r.error === 'CREDENCIAL_ROTADA')) refrescarConfig().catch(function () {});
    }).catch(function (e) { var x = netError(e); setMsg(m.msg, x[0], x[1], x[2]); })
      .then(function () { m.sending = false; ocupado(btn, false, m.revisando ? 'Confirmar registro' : 'Revisar total'); });
  }
  function buildVentaKv() { if (CFG.estado_publico === 'VENTA' && CFG.venta.oferta && ventaBuilt) buildVenta(); }

  /* ---------------- Mis entradas ---------------- */
  var grupoActual = null, consultaSeq = 0;
  $('credForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = $('credForm'), c = $('cred').value.trim();
    clearAll(form);
    if (!/^G-[A-Za-z0-9_-]{32}$/.test(c)) { mostrarErrores(form, { credencial: 'El código de grupo empieza con «G-» y tiene 34 caracteres.' }); return; }
    consultarGrupo(c, $('recordar').checked);
  });
  $('cred').addEventListener('input', function () { clearErr($('credForm'), 'credencial'); });
  function consultarGrupo(c, recordar, silencioso) {
    var seq = ++consultaSeq;
    if (!silencioso) setMsg('credMsg', 'info', 'Consultando…', '', true);
    var btn = $('btnActualizar'); if (btn) ocupado(btn, true, 'Actualizando…');
    return API.post({ action: 'venta_consultar', credencial: c }).then(function (r) {
      if (seq !== consultaSeq) return; // respuesta antigua: se ignora
      if (r.ok) {
        setMsg('credMsg');
        if (recordar !== undefined) API.store('grupo', r.credencial, recordar);
        pintarGrupo(r);
      } else {
        setMsg('credMsg', 'bad', TITULOS[r.error] || 'No se pudo abrir', r.mensaje);
        if (r.error === 'NO_AUTORIZADO') { API.store('grupo', null); cerrarGrupo(true); }
      }
    }).catch(function (e) {
      if (seq !== consultaSeq) return;
      var m = netError(e);
      if (grupoActual) setMsg('resumenMsg', m[0], m[1], 'No se pudo actualizar. Lo que ves corresponde a la última consulta.');
      else setMsg('credMsg', m[0], m[1], 'Inténtalo otra vez.');
    }).then(function () { var b = $('btnActualizar'); if (b && seq === consultaSeq) ocupado(b, false, 'Actualizar estado'); });
  }
  function cerrarGrupo(mantenerMsg) {
    consultaSeq++; grupoActual = null;
    show($('grupoView'), false); show($('credForm'), true);
    $('tickets').innerHTML = ''; $('resumenGrupo').innerHTML = ''; $('pagosLista').innerHTML = '';
    $('cred').value = ''; $('recordar').checked = false;
    if (!mantenerMsg) setMsg('credMsg');
    M.agregar.revisando = false; $('guests2').innerHTML = ''; show($('agregarConf'), false);
  }
  $('cambiarGrupo').onclick = function () { API.store('grupo', null); cerrarGrupo(); $('cred').focus(); anunciar('Ingresa otro código de grupo.'); };
  $('cerrarSesion').onclick = function () {
    API.store('grupo', null); API.forgetRequest('pago'); API.forgetRequest('agregar');
    cerrarGrupo(); setMsg('credMsg', 'ok', 'Sesión cerrada', 'El código de grupo se borró de este dispositivo.'); $('cred').focus();
  };
  $('recordar2').addEventListener('change', function () { if (grupoActual) API.store('grupo', grupoActual.credencial, this.checked); anunciar(this.checked ? 'Se recordará en este dispositivo.' : 'Solo se mantiene en esta pestaña.'); });
  $('copyCred').onclick = function () { copiar(grupoActual.credencial, this, $('copyCredMsg'), $('grupoCred')); };

  function pintarGrupo(r) {
    grupoActual = r;
    show($('credForm'), false); show($('grupoView'), true);
    $('grupoCred').textContent = r.credencial;
    $('avisoCodigo').innerHTML = (ICON.bad) + '<div><b>' + esc(r.aviso || AVISO_CODIGO) + '</b></div>';
    $('recordar2').checked = API.remembered('grupo');
    var s = r.resumen || {};
    $('resumenGrupo').innerHTML = '<h2>Estado del grupo</h2><dl class="kv">' +
      '<dt>Asistentes (entradas activas)</dt><dd>' + esc(s.asistentes) + '</dd>' +
      '<dt>Total de entradas</dt><dd>' + money(s.total) + '</dd>' +
      '<dt>Pago verificado aplicado</dt><dd>' + money(s.aplicado) + '</dd>' +
      '<dt>Saldo pendiente</dt><dd>' + money(s.saldo) + '</dd>' +
      '<dt>Pagos por verificar</dt><dd>' + esc(s.pendientes) + (s.pendientes ? ' (' + money(s.pendientes_monto) + ')' : '') + '</dd>' +
      '<dt>Dinero verificado sin asignar</dt><dd>' + money(s.sin_asignar) + '</dd></dl>' +
      '<p class="hint" id="consultadoEl">Consultado a las ' + esc(hora(r.consultado)) + '</p><div id="resumenMsg"></div>' +
      '<button class="btn small ghost" type="button" id="btnActualizar">Actualizar estado</button>';
    $('resumenGrupo').tabIndex = -1;
    $('btnActualizar').onclick = function () { consultarGrupo(grupoActual.credencial, undefined, true); };
    $('tickets').innerHTML = r.entradas.map(function (t, i) {
      var b = t.estado_pago === 'Pagada' ? 'ok' : (t.estado_pago === 'Parcial' ? 'warn' : 'bad');
      return '<article class="ticket" aria-labelledby="tk' + i + '"><div><div class="cod" id="tk' + i + '">' + esc(t.codigo) + ' · ' + esc(t.categoria) + '</div><div class="nom">' + esc(t.titular) + '</div>' +
        '<span class="badge ' + b + '">' + esc(t.estado_pago) + '</span>' +
        '<div class="meta mt8">Precio ' + money(t.precio) + ' · Verificado ' + money(t.pagado) + ' · Saldo <b>' + money(t.saldo) + '</b></div>' +
        (t.ingreso ? '<div class="meta">Ingresó: ' + esc(t.ingreso) + '</div>' : '') +
        (t.qr ? '<div class="meta mt6">El QR se valida en la puerta: sin pago completo verificado no hay ingreso.</div>' +
          '<div class="acciones mt8"><button class="btn small ghost" type="button" data-descargar="' + i + '">Descargar entrada</button>' +
          (navigator.share ? '<button class="btn small ghost" type="button" data-compartir="' + i + '">Compartir entrada</button>' : '') + '</div><div class="copy-msg" id="tkMsg' + i + '" role="status"></div>' : '') +
        '</div>' + (t.qr ? '<canvas class="qr" data-qr="' + i + '" width="148" height="148" role="img" aria-label="Código QR de la entrada ' + esc(t.codigo) + '"></canvas>' : '') + '</article>';
    }).join('');
    pintarQRs(r);
    $('pagosLista').innerHTML = r.pagos.length ? '<div class="card"><h2>Pagos reportados</h2><dl class="kv">' + r.pagos.map(function (p) { return '<dt>' + esc(p.id) + ' · ' + esc(p.canal) + ' · ' + esc(p.fecha) + '</dt><dd>' + money(p.monto) + ' — ' + esc(p.estado) + '</dd>'; }).join('') + '</dl></div>' : '';
    permisosGrupo();
  }
  function permisosGrupo() {
    var r = grupoActual, P = CFG.permisos || {};
    var activas = r.entradas.filter(function (t) { return t.estado === 'Activa'; });
    $('pEntradas').innerHTML = activas.map(function (t) { return '<label class="chip"><input type="checkbox" name="pent" value="' + esc(t.codigo) + '"' + (t.saldo > 0 ? ' checked' : '') + '><span>' + esc(t.codigo) + ' · saldo ' + money(t.saldo) + '</span></label>'; }).join('') || '<p class="hint">No hay entradas activas.</p>';
    $('pagoInstr').textContent = (CFG.venta && CFG.venta.instrucciones_pago) || 'Reporta aquí cada pago realizado.';
    show($('pagoForm'), !!P.pagos);
    show($('agregarForm'), !!P.reservas);
    if (P.reservas) {
      document.querySelectorAll('.maxInv').forEach(function (x) { x.textContent = maxInv(); }); cotizar('agregar');
      if (!agregarBuilt) buildAgregar();
    }
  }
  var agregarBuilt = false;
  function buildAgregar() {
    agregarBuilt = true;
    var form = $('agregarForm');
    $('addGuest2').onclick = function () { addGuest($('guests2'), form, 'agregar'); };
    form.addEventListener('input', function (e) { var f = e.target.closest('.field'); if (f) clearErr(form, f.dataset.f); if (!e.target.closest('.resumen')) ventaEditado('agregar'); });
    form.addEventListener('submit', function (ev) { ev.preventDefault(); enviarVenta('agregar'); });
    $('btnAgregarEditar').onclick = function () { ventaEditado('agregar'); var i = $('guests2').querySelector('input'); (i || $('addGuest2')).focus(); };
  }

  /* QR: generador local cargado solo cuando se necesita; margen blanco de 4 módulos. */
  function matrizQR(texto) {
    var q = qrcode(0, 'M'); q.addData(texto); q.make();
    var n = q.getModuleCount(), m = [];
    for (var y = 0; y < n; y++) { m.push([]); for (var x = 0; x < n; x++) m[y].push(q.isDark(y, x)); }
    return m;
  }
  function dibujarQR(ctx, m, x0, y0, lado) {
    var n = m.length, total = n + 8, s = Math.floor(lado / total), real = s * total;
    var ox = x0 + Math.floor((lado - real) / 2), oy = y0 + Math.floor((lado - real) / 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, y0, lado, lado);
    ctx.fillStyle = '#000000';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) ctx.fillRect(ox + (x + 4) * s, oy + (y + 4) * s, s, s);
  }
  function pintarQRs(r) {
    if (!document.querySelector('canvas[data-qr]')) return;
    cargarScript('vendor/qrcode.js').then(function () {
      if (grupoActual !== r) return;
      document.querySelectorAll('canvas[data-qr]').forEach(function (cv) {
        var t = r.entradas[Number(cv.dataset.qr)];
        dibujarQR(cv.getContext('2d'), matrizQR(t.qr), 0, 0, cv.width);
      });
    }).catch(function () { setMsg('resumenMsg', 'bad', 'No se pudo generar el QR', 'Recarga la página.'); });
  }
  /* Imagen de entrada individual: nombre, categoría, código y QR. Nunca el código de grupo ni el DNI. */
  function imagenEntrada(t, emitido) {
    return cargarScript('vendor/qrcode.js').then(function () {
      var W = 720, H = 1040, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      c.fillStyle = '#f6f1e7'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#1b2440'; c.fillRect(0, 0, W, 150);
      c.fillStyle = '#ff7a4d'; c.font = '700 26px "DM Sans", system-ui, sans-serif'; c.fillText('PROMOCIÓN · DICIEMBRE 2026', 48, 62);
      c.fillStyle = '#ffffff'; c.font = '800 46px "Fraunces", Georgia, serif'; c.fillText('Reencuentro', 48, 118);
      c.fillStyle = '#1b2440'; c.font = '800 40px "Fraunces", Georgia, serif';
      var nombre = t.titular, lineas = [], pal = nombre.split(' '), l = '';
      pal.forEach(function (w) { var p = l ? l + ' ' + w : w; if (c.measureText(p).width > W - 96 && l) { lineas.push(l); l = w; } else l = p; });
      lineas.push(l);
      lineas.slice(0, 2).forEach(function (x, i) { c.fillText(x, 48, 220 + i * 48); });
      c.fillStyle = '#b93a0c'; c.font = '700 26px ui-monospace, Menlo, Consolas, monospace'; c.fillText(t.codigo + ' · ' + t.categoria, 48, 330);
      dibujarQR(c, matrizQR(t.qr), (W - 520) / 2, 370, 520);
      c.fillStyle = '#4a5470'; c.font = '600 22px "DM Sans", system-ui, sans-serif';
      c.fillText('Estado de pago al emitir: ' + t.estado_pago + ' (' + emitido + ')', 48, 940);
      c.fillText('El ingreso se verifica nuevamente en la puerta.', 48, 976);
      c.fillText('Entrada individual · sin reingreso autorizado.', 48, 1012);
      return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, 'image/png'); });
    });
  }
  $('tickets').addEventListener('click', function (e) {
    var b = e.target.closest('[data-descargar],[data-compartir]'); if (!b || !grupoActual) return;
    var i = Number(b.dataset.descargar != null ? b.dataset.descargar : b.dataset.compartir), t = grupoActual.entradas[i], msg = $('tkMsg' + i);
    var emitido = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' });
    var nombreArchivo = 'entrada-' + t.codigo + '.png';
    imagenEntrada(t, emitido).then(function (blob) {
      if (b.dataset.compartir != null) {
        var file = new File([blob], nombreArchivo, { type: 'image/png' });
        if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error('compartir');
        return navigator.share({ files: [file], title: 'Entrada ' + t.codigo }).then(function () { msg.textContent = 'Entrada compartida.'; msg.className = 'copy-msg ok'; });
      }
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = nombreArchivo; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      msg.textContent = 'Entrada descargada.'; msg.className = 'copy-msg ok';
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      msg.textContent = b.dataset.compartir != null ? 'Este dispositivo no permite compartir la imagen. Usa «Descargar entrada».' : 'No se pudo generar la imagen.'; msg.className = 'copy-msg bad';
    });
  });

  /* ---------------- Reporte de pagos ---------------- */
  var sendingP = false;
  function payloadPago() {
    return {
      canal: $('pCanal').value, monto: $('pMonto').value.trim().replace(',', '.'), referencia: $('pRef').value.replace(/\s+/g, '').toUpperCase(),
      fecha_operacion: $('pFecha').value, pagador: $('pPagador').value.replace(/\s+/g, ' ').trim(),
      entradas: Array.prototype.map.call(document.querySelectorAll('input[name=pent]:checked'), function (x) { return x.value; }).sort()
    };
  }
  function validarPago(p) {
    var e = {};
    if (['Yape', 'Plin', 'Transferencia'].indexOf(p.canal) < 0) e.canal = 'Elige Yape, Plin o Transferencia.';
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(p.monto) || !(Number(p.monto) > 0)) e.monto = 'Escribe un monto mayor que cero con máximo dos decimales (por ejemplo 60 o 60.50).';
    if (!/^[A-Z0-9-]{4,40}$/.test(p.referencia)) e.referencia = 'Escribe el número de operación (4 a 40 letras o números).';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.fecha_operacion);
    if (!m) e.fecha_operacion = 'Indica la fecha del pago.';
    else {
      var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) e.fecha_operacion = 'Esa fecha no existe.';
      else if (p.fecha_operacion > hoyLima()) e.fecha_operacion = 'La fecha del pago no puede ser posterior a hoy.';
    }
    if (!nombreOk(p.pagador)) e.pagador = 'Nombre completo de quien pagó.';
    return e;
  }
  $('pFecha').max = hoyLima();
  $('pagoForm').addEventListener('input', function (e) { var f = e.target.closest('.field'); if (f) clearErr($('pagoForm'), f.dataset.f); });
  $('pagoForm').addEventListener('submit', function (ev) {
    ev.preventDefault(); if (sendingP || !grupoActual) return;
    var form = $('pagoForm'); clearAll(form); setMsg('pagoMsg');
    var p = payloadPago(), errs = validarPago(p);
    if (Object.keys(errs).length) { mostrarErrores(form, errs); return; }
    var body = Object.assign({ action: 'pago_reportar', credencial: grupoActual.credencial }, p), btn = $('btnPago');
    sendingP = true; ocupado(btn, true, 'Reportando…');
    API.requestIdFor('pago', Object.assign({ g: grupoActual.grupo }, p)).then(function (rid) {
      body.request_id = rid;
      return API.post(body, progreso(btn, 'Reportando…', 'pagoMsg'));
    }).then(function (r) {
      if (r.ok) {
        API.forgetRequest('pago');
        setMsg('pagoMsg', r.estado === 'Rechazado' ? 'bad' : 'ok', (r.repetido ? 'Pago ya registrado' : 'Pago reportado') + ' (' + r.pago + ' · ' + money(r.monto) + ')', r.mensaje);
        form.reset(); $('pFecha').max = hoyLima();
        consultarGrupo(grupoActual.credencial, undefined, true);
        return;
      }
      handleError(r, form, 'pagoMsg', 'pago');
      if (r.error === 'PAGOS_CERRADOS') refrescarConfig().catch(function () {});
    }).catch(function (e) { var m = netError(e); setMsg('pagoMsg', m[0], m[1], m[2]); })
      .then(function () { sendingP = false; ocupado(btn, false, 'Reportar pago'); });
  });

  boot();
})();
