/* Interfaz: pantalla de inicio, bucle del juego, mouse (selección, órdenes, poderes),
   panel de ciudad, avisos, panel lateral y conexión con Claude. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var render2d = new SIM.Render($('mapa'));
  var render3d = null;
  try { if (SIM.Render3D && window.THREE) render3d = new SIM.Render3D($('mapa'), $('mapa3d')); } catch (e) { console.warn('Vista 2.5D no disponible', e); render3d = null; }
  var render = params.get('vista') === '2d' ? render2d : (render3d || render2d);
  var mundo = null;
  var velocidad = 1, velocidadPrevia = 1, acumulado = 0, ultimo = performance.now();
  var TICK_MS = 1000 / (SIM.TICKS_POR_TURNO * SIM.TURNOS_POR_SEGUNDO);
  var LIMITE_AVISO = 60;   // turnos para responder un aviso antes de que decida la IA
  var claude = { disponible: false, fallas: 0 };
  var finMostrado = false, ultimoPanel = 0;
  var humano = 0, claudeIdx = 1;
  var tarjetas = [];
  var seleccion = {}, ciudadSel = null, poderActivo = null, cursor = null, caja = null, arrastreDer = null;
  var teclas = {};
  var eleccion = {
    civ: params.get('civ') || 'espanoles',
    claude: params.get('claude') || null,
    bots: Number(params.get('bots') || 2),
    semilla: Number(params.get('semilla')) || Math.floor(Math.random() * 99999) + 1,
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function controlTexto(c) { return c.control === 'humano' ? '👤 Vos' : (c.control === 'claude' ? '🤖 Claude' : '⚙ IA del juego'); }
  function nombreItem(item) {
    if (item.tipo === 'unidad') { var d = SIM.UNIDADES[item.id]; return d.icono + ' ' + d.nombre; }
    return SIM.EDIFICIOS[item.id].nombre;
  }

  var relojToast = null;
  function toast(txt) {
    var t = $('toast');
    t.textContent = txt; t.classList.remove('oculto');
    clearTimeout(relojToast);
    relojToast = setTimeout(function () { t.classList.add('oculto'); }, txt.indexOf('Tip:') >= 0 ? 6000 : 2600);
  }

  // ---------- estado de Claude ----------
  function estadoClaude(ok, corto, largo) {
    var el = $('estado-claude');
    el.textContent = '🤖 Claude: ' + corto;
    el.className = 'estado-claude ' + (ok ? 'ok' : 'mal');
    el.title = (largo || '').replace(/<[^>]+>/g, '');
    $('inicio-claude').innerHTML = largo || '';
  }

  function comprobarServidor() {
    if (location.protocol === 'file:') {
      claude.disponible = false;
      estadoClaude(false, 'sin servidor', 'Abriste el juego directo desde el archivo, así que Claude no puede jugar: su civilización la maneja la IA del juego. Para jugar contra Claude abrilo con <code>JUGAR (EJECUTABLE).bat</code>.');
      return;
    }
    fetch('/api/estado').then(function (r) { return r.json(); }).then(function (j) {
      claude.disponible = !!j.claude;
      if (j.claude) estadoClaude(true, 'listo', 'Claude está conectado (modelo ' + esc(j.modelo) + '). Cuando su civilización tenga que decidir algo, el juego le pregunta sin frenar la partida.');
      else estadoClaude(false, 'no encontrado', 'No encontré el programa <code>claude</code> en esta PC. Su civilización la va a manejar la IA del juego.');
      if (mundo) mundo.claudeActivo = claude.disponible;
    }).catch(function () {
      claude.disponible = false;
      estadoClaude(false, 'sin servidor', 'No pude hablar con el servidor del juego. Cerralo y volvé a abrir <code>JUGAR (EJECUTABLE).bat</code>.');
    });
  }

  // ---------- pantalla de inicio ----------
  function armarInicio() {
    var cont = $('elegir-civ');
    cont.innerHTML = '';
    SIM.ORDEN_CIVS.forEach(function (k) {
      var d = SIM.CIVS[k], u = SIM.UNIDADES[d.unica];
      var b = document.createElement('button');
      b.className = k === eleccion.civ ? 'activo' : '';
      b.innerHTML = '<div class="n"><span class="pt" style="background:' + d.color + '"></span>' + d.nombre + '</div>' +
        '<div class="b">' + esc(d.bonus) + '<br>Única: ' + u.icono + ' ' + esc(u.nombre) + '</div>';
      b.onclick = function () { eleccion.civ = k; if (eleccion.claude === k) eleccion.claude = null; armarInicio(); };
      cont.appendChild(b);
    });
    var sel = $('sel-claude');
    sel.innerHTML = '';
    var opciones = SIM.ORDEN_CIVS.filter(function (k) { return k !== eleccion.civ; });
    if (!eleccion.claude || opciones.indexOf(eleccion.claude) < 0) eleccion.claude = opciones.indexOf('aztecas') >= 0 ? 'aztecas' : opciones[0];
    opciones.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = SIM.CIVS[k].nombre; o.selected = k === eleccion.claude;
      sel.appendChild(o);
    });
    sel.onchange = function () { eleccion.claude = sel.value; };
    $('sel-bots').value = String(eleccion.bots);
    $('inp-semilla').value = eleccion.semilla;
  }
  $('sel-bots').onchange = function () { eleccion.bots = Number($('sel-bots').value); };
  $('inp-semilla').onchange = function () { eleccion.semilla = Number($('inp-semilla').value) || 1; };
  $('btn-dado').onclick = function () { eleccion.semilla = Math.floor(Math.random() * 99999) + 1; $('inp-semilla').value = eleccion.semilla; };
  $('btn-empezar').onclick = function () { iniciarPartida(); };
  $('btn-nueva').onclick = function () { mostrarInicio(); };
  $('btn-otra').onclick = function () { $('final').classList.add('oculto'); mostrarInicio(); };
  $('btn-seguir').onclick = function () { $('final').classList.add('oculto'); };

  function mostrarInicio() {
    fijarVelocidad(0);
    armarInicio();
    $('inicio').classList.remove('oculto');
  }

  function iniciarPartida() {
    var restantes = SIM.ORDEN_CIVS.filter(function (c) { return c !== eleccion.civ && c !== eleccion.claude; });
    var jugadores = [{ civ: eleccion.civ, control: 'humano' }, { civ: eleccion.claude, control: 'claude' }]
      .concat(restantes.slice(0, eleccion.bots).map(function (c) { return { civ: c, control: 'bot' }; }));
    mundo = SIM.crearMundo({ semilla: eleccion.semilla, jugadores: jugadores, claudeActivo: claude.disponible });
    humano = 0; claudeIdx = 1;
    mundo.pilotoAutomatico = params.get('auto') === '1';
    $('chk-piloto').checked = mundo.pilotoAutomatico;
    render.nuevoMundo(mundo);
    actualizarBotonVista();
    enfocar('capital', 2.4);
    finMostrado = false; claude.fallas = 0;
    seleccion = {}; ciudadSel = null; poderActivo = null;
    $('avisos').innerHTML = '';
    $('banner-claude').classList.add('oculto');
    $('inicio').classList.add('oculto');
    $('cronica').innerHTML = '';
    firmaDiario = ''; firmaSel = '';
    TIPS.forEach(function (t) { t.visto = false; });
    armarTarjetas();
    armarPlan();
    armarPoderes();
    actualizarPanel();
    fijarVelocidad(2);
  }

  // ---------- vista 2D / 2.5D ----------
  function actualizarBotonVista() {
    var b = $('btn-vista');
    b.classList.toggle('oculto', !render3d);
    b.textContent = render === render3d ? '🗺 Vista 2D' : '⛰ Vista 2.5D';
    $('mapa3d').classList.toggle('oculto', render !== render3d);
  }
  $('btn-vista').onclick = function () {
    if (!render3d || !mundo) return;
    render = render === render3d ? render2d : render3d;
    render.nuevoMundo(mundo);
    actualizarBotonVista();
    enfocar('capital', 2.4);
  };

  // ---------- velocidad y teclado ----------
  function fijarVelocidad(v) {
    if (v > 0) velocidadPrevia = v;
    velocidad = v;
    acumulado = 0;
    Array.prototype.forEach.call(document.querySelectorAll('#velocidades button'), function (b) {
      b.classList.toggle('activo', Number(b.dataset.vel) === v);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#velocidades button'), function (b) {
    b.onclick = function () { fijarVelocidad(Number(b.dataset.vel)); };
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || !mundo) return;
    var k = e.key.toLowerCase();
    teclas[k] = true;
    if (e.code === 'Space') { e.preventDefault(); fijarVelocidad(velocidad > 0 ? 0 : velocidadPrevia); }
    else if (k === '1') fijarVelocidad(1);
    else if (k === '2') fijarVelocidad(2);
    else if (k === '3') fijarVelocidad(4);
    else if (k === '4') fijarVelocidad(8);
    else if (k === '+') render.zoom(1.2, render.ancho / 2, render.alto / 2);
    else if (k === '-') render.zoom(1 / 1.2, render.ancho / 2, render.alto / 2);
    else if (k === '0') render.ajustar();
    else if (k === 'escape') { if (poderActivo) activarPoder(null); else { seleccion = {}; ciudadSel = null; } }
    else if (k === 'e') seleccionarEjercito();
    else if (k === 'c') enfocar('capital', 2.4);
    if (k.indexOf('arrow') === 0) e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { teclas[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function () { teclas = {}; });

  function moverConTeclas(dt) {
    var v = 700 * dt / 1000, dx = 0, dy = 0;
    if (teclas.a || teclas.arrowleft) dx += v;
    if (teclas.d || teclas.arrowright) dx -= v;
    if (teclas.w || teclas.arrowup) dy += v;
    if (teclas.s || teclas.arrowdown) dy -= v;
    if (dx || dy) render.mover(dx, dy);
  }

  // ---------- mouse sobre el mapa ----------
  var canvas = $('mapa');
  function posMouse(e) { var r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = posMouse(e);
    render.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, p[0], p[1]);
  }, { passive: false });

  canvas.addEventListener('pointerdown', function (e) {
    if (!mundo) return;
    var p = posMouse(e);
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 0) {
      if (poderActivo) { lanzarPoder(render.aMundo(p[0], p[1])); return; }
      caja = { x0: p[0], y0: p[1], x1: p[0], y1: p[1], shift: e.shiftKey };
    } else if (e.button === 2 || e.button === 1) {
      arrastreDer = { x: p[0], y: p[1], x0: p[0], y0: p[1], movido: false };
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!mundo) return;
    var p = posMouse(e);
    cursor = render.aMundo(p[0], p[1]);
    if (caja) { caja.x1 = p[0]; caja.y1 = p[1]; $('tooltip').classList.add('oculto'); return; }
    if (arrastreDer) {
      if (Math.abs(p[0] - arrastreDer.x0) + Math.abs(p[1] - arrastreDer.y0) > 5) arrastreDer.movido = true;
      if (arrastreDer.movido) { render.mover(p[0] - arrastreDer.x, p[1] - arrastreDer.y); canvas.classList.add('arrastrando'); }
      arrastreDer.x = p[0]; arrastreDer.y = p[1];
      $('tooltip').classList.add('oculto');
      return;
    }
    var html = poderActivo ? null : tooltipEn(cursor[0], cursor[1]);
    var t = $('tooltip');
    if (!html) { t.classList.add('oculto'); return; }
    t.innerHTML = html; t.classList.remove('oculto');
    var r = canvas.getBoundingClientRect();
    t.style.left = Math.min(p[0] + 16, r.width - t.offsetWidth - 8) + 'px';
    t.style.top = Math.min(p[1] + 16, r.height - t.offsetHeight - 8) + 'px';
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!mundo) return;
    var p = posMouse(e);
    if (e.button === 0 && caja) {
      var c = caja; caja = null;
      if (Math.abs(c.x1 - c.x0) < 6 && Math.abs(c.y1 - c.y0) < 6) clicSimple(render.aMundo(p[0], p[1]), c.shift);
      else seleccionarCaja(c);
    } else if ((e.button === 2 || e.button === 1) && arrastreDer) {
      if (!arrastreDer.movido && e.button === 2) darOrden(render.aMundo(p[0], p[1]));
      arrastreDer = null;
      canvas.classList.remove('arrastrando');
    }
  });
  canvas.addEventListener('pointerleave', function () { $('tooltip').classList.add('oculto'); cursor = null; });
  canvas.addEventListener('dblclick', function (e) {
    if (!mundo) return;
    var p = posMouse(e), w = render.aMundo(p[0], p[1]);
    var u = unidadEn(w[0], w[1], true);
    if (!u) return;
    // Doble clic: todas las unidades de ese tipo que se ven en pantalla
    seleccion = {};
    mundo.unidades.forEach(function (x) {
      if (x.muerta || x.civ !== humano || x.tipo !== u.tipo) return;
      var q = render.aPantalla(x.x, x.y);
      if (q[0] >= 0 && q[1] >= 0 && q[0] <= render.ancho && q[1] <= render.alto) seleccion[x.id] = true;
    });
  });

  function unidadEn(x, y, soloMias) {
    var mejor = null, md = 0.75;
    mundo.unidades.forEach(function (u) {
      if (u.muerta || (soloMias && u.civ !== humano)) return;
      var d = Math.hypot(u.x - x, u.y - y);
      if (d < md) { md = d; mejor = u; }
    });
    return mejor;
  }
  function ciudadEn(x, y) {
    var mejor = null, md = 1;
    mundo.ciudades.forEach(function (c) { var d = Math.hypot(c.x - x, c.y - y); if (d < md) { md = d; mejor = c; } });
    return mejor;
  }

  function clicSimple(w, shift) {
    // Clic justo sobre una ciudad: se elige la ciudad (las tropas de adentro se eligen con el recuadro)
    var cc = ciudadEn(w[0], w[1]);
    if (cc && !shift && Math.hypot(cc.x - w[0], cc.y - w[1]) < 0.55) { ciudadSel = cc.id; seleccion = {}; SIM.Sonido.tocar('clic'); return; }
    var u = unidadEn(w[0], w[1], true);
    if (u) {
      SIM.Sonido.tocar('clic');
      if (shift) { if (seleccion[u.id]) delete seleccion[u.id]; else seleccion[u.id] = true; }
      else seleccion = {}, seleccion[u.id] = true;
      ciudadSel = null;
      return;
    }
    var c = ciudadEn(w[0], w[1]);
    if (c) { ciudadSel = c.id; seleccion = {}; return; }
    if (!shift) { seleccion = {}; ciudadSel = null; }
  }

  function seleccionarCaja(c) {
    var x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1);
    if (!c.shift) seleccion = {};
    var militares = 0, todas = [];
    mundo.unidades.forEach(function (u) {
      if (u.muerta || u.civ !== humano) return;
      var q = render.aPantalla(u.x, u.y);
      if (q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) { todas.push(u); if (u.d.rol !== 'colono') militares++; }
    });
    // Si en el recuadro hay soldados y colonos, se eligen solo los soldados (como en el Age)
    todas.forEach(function (u) { if (!militares || u.d.rol !== 'colono') seleccion[u.id] = true; });
    ciudadSel = null;
  }

  function seleccionarEjercito() {
    seleccion = {};
    mundo.unidades.forEach(function (u) { if (!u.muerta && u.civ === humano && u.d.rol !== 'colono') seleccion[u.id] = true; });
    ciudadSel = null;
    var n = Object.keys(seleccion).length;
    toast(n ? '🪖 Seleccionaste todo tu ejército: ' + n + ' unidades' : 'No tenés tropas todavía');
  }

  function unidadesSeleccionadas() {
    return mundo.unidades.filter(function (u) { return seleccion[u.id] && !u.muerta && u.civ === humano; });
  }

  var OFFSETS = (function () {
    var r = [[0, 0]];
    for (var anillo = 1; anillo <= 4; anillo++)
      for (var dy = -anillo; dy <= anillo; dy++) for (var dx = -anillo; dx <= anillo; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === anillo) r.push([dx, dy]);
    return r;
  })();

  function darOrden(w) {
    var sel = unidadesSeleccionadas(), m = mundo, yo = m.civs[humano];
    if (!sel.length) return;
    var tx = Math.round(w[0]), ty = Math.round(w[1]);
    if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return;
    var ciudad = ciudadEn(w[0], w[1]), enemigo = unidadEn(w[0], w[1], false);
    if (enemigo && enemigo.civ === humano) enemigo = null;
    var ataqueCiudad = ciudad && ciudad.civ !== humano && SIM.enGuerra(m, humano, ciudad.civ);
    var ataqueUnidad = !ataqueCiudad && enemigo && SIM.enGuerra(m, humano, enemigo.civ);
    if ((ciudad && ciudad.civ !== humano && !ataqueCiudad) || (enemigo && !ataqueUnidad && !ataqueCiudad)) {
      var otro = m.civs[ciudad && ciudad.civ !== humano ? ciudad.civ : enemigo.civ];
      toast('🕊 Estás en paz con los ' + otro.nombre + '. Declarales la guerra (panel de la derecha) para atacarlos.');
    }
    var k = 0, fallaron = 0;
    sel.forEach(function (u) {
      u.manual = true; u.mision = false; u.enemigo = null; u.camino = null; u.esperaCamino = 0;
      if (u.d.rol === 'colono') {
        if (SIM.sitioValido(m, yo, tx, ty)) u.orden = { tipo: 'fundar', x: tx, y: ty };
        else { u.orden = { tipo: 'ir', x: tx, y: ty }; toast('🏕 Ahí no se puede fundar una ciudad (muy cerca de otra, agua o tierra ajena)'); }
        return;
      }
      if (ataqueCiudad && (u.d.rol !== 'naval' || ciudad.costera)) { u.orden = { tipo: 'atacarCiudad', ciudad: ciudad.id }; return; }
      if (ataqueUnidad) { u.orden = { tipo: 'atacarUnidad', unidad: enemigo.id }; return; }
      // Moverse en formación alrededor del punto
      var puesto = null;
      for (; k < OFFSETS.length; k++) {
        var x = tx + OFFSETS[k][0], y = ty + OFFSETS[k][1];
        if (x < 0 || y < 0 || x >= m.W || y >= m.H) continue;
        if (u.d.rol === 'aire' || SIM.transitable(m, yo, u.d.rol, y * m.W + x)) { puesto = [x, y]; k++; break; }
      }
      if (!puesto) { fallaron++; return; }
      u.orden = { tipo: 'ir', x: puesto[0], y: puesto[1] };
    });
    if (fallaron === sel.length) toast(sel[0].d.rol === 'naval' ? '⛵ Los barcos solo navegan por agua' : '🚫 Tus tropas no pueden llegar ahí todavía (necesitan otra era para cruzar el mar)');
    SIM.Sonido.tocar('orden');
    render.marca(w[0] - 0.5, w[1] - 0.5, (ataqueCiudad || ataqueUnidad) ? 'rgba(255,90,70,0.95)' : 'rgba(140,255,160,0.95)');
  }

  function tooltipEn(x, y) {
    var m = mundo, c = ciudadEn(x, y), k;
    if (c) {
      var civ = m.civs[c.civ], eds = [];
      for (k in c.ed) if (c.ed[k]) eds.push(SIM.EDIFICIOS[k].nombre);
      return '<b>' + esc(c.nombre) + '</b>' + (c.capital ? ' 👑' : '') + (c.ed.maravilla ? ' 🏛' : '') + ' — <span style="color:' + civ.color + '">' + civ.nombre + '</span><br>' +
        'Población ' + Math.floor(c.pop) + ' · Defensa ' + Math.round(SIM.defensaCiudad(m, c)) + ' · Vida ' + Math.round(c.hp) + '/' + Math.round(SIM.hpMaxCiudad(m, c)) + '<br>' +
        'Edificios: ' + (eds.join(', ') || 'ninguno todavía') + '<br><span style="color:#93a1bd">Clic para ver la ciudad</span>';
    }
    var cerca = m.unidades.filter(function (u) { return !u.muerta && Math.hypot(u.x - x, u.y - y) < 0.7; });
    if (cerca.length) {
      var u = cerca[0], cu = m.civs[u.civ], orden = u.manual ? 'esperando tus órdenes' : 'patrullando';
      if (u.orden && u.orden.tipo === 'atacarCiudad') { var co = SIM.ciudadPorId(m, u.orden.ciudad); orden = 'atacando ' + (co ? co.nombre : 'una ciudad'); }
      else if (u.orden && u.orden.tipo === 'atacarUnidad') orden = 'combatiendo';
      else if (u.orden && u.orden.tipo === 'fundar') orden = 'yendo a fundar una ciudad';
      else if (u.orden && u.orden.tipo === 'ir') orden = 'en marcha';
      if (u.embarcado) orden += ' (embarcados)';
      if (u.bendicionHasta > m.turno) orden += ' · ✨ bendecidos';
      return '<b>' + u.d.icono + ' ' + esc(u.d.nombre) + '</b> — <span style="color:' + cu.color + '">' + cu.nombre + '</span><br>' +
        'Vida ' + Math.round(u.hp) + '/' + u.d.hp + ' · Ataque ' + u.d.atk + ' · Defensa ' + u.d.def + '<br>' + orden +
        (cerca.length > 1 ? '<br><span style="color:#93a1bd">y ' + (cerca.length - 1) + ' unidades más acá</span>' : '');
    }
    var tx = Math.round(x), ty = Math.round(y);
    if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return null;
    var i = ty * m.W + tx, dueno = m.dueno[i];
    return SIM.TERRENOS[m.mapa.tipo[i]].nombre + (dueno >= 0 ? ' — territorio de los <span style="color:' + m.civs[dueno].color + '">' + m.civs[dueno].nombre + '</span>' : '');
  }

  // Centra la vista en tu capital o en la batalla más reciente
  function enfocar(que, factor) {
    var m = mundo, blanco = null;
    if (que === 'batalla') {
      m.ciudades.forEach(function (c) { if (!blanco || c.ultimoAtaque > blanco.ultimoAtaque) blanco = c; });
      if (blanco && blanco.ultimoAtaque < 0) blanco = null;
    }
    if (!blanco) blanco = m.ciudades.filter(function (c) { return c.civ === humano && c.capital; })[0] || m.ciudades[0];
    if (!blanco) return;
    render.ajustar();
    render.zoom(factor, render.ancho / 2, render.alto / 2);
    var p = render.aPantalla(blanco.x, blanco.y);
    render.mover(render.ancho / 2 - p[0], render.alto / 2 - p[1]);
  }

  // ---------- poderes de Dios ----------
  function armarPoderes() {
    var cont = $('barra-poderes');
    var h = '';
    for (var k in SIM.PODERES) {
      var P = SIM.PODERES[k];
      h += '<button data-poder="' + k + '" title="' + esc(P.nombre + ': ' + P.desc) + '">' + P.icono + '<span>' + P.nombre.split(' ')[0] + '</span><div class="rec oculto"></div></button>';
    }
    h += '<div class="sep"></div><button data-accion="ejercito" title="Seleccionar todo tu ejército (tecla E)">🪖<span>Ejército</span></button>' +
      '<button data-accion="capital" title="Ir a tu capital (tecla C)">👑<span>Capital</span></button>' +
      '<button data-accion="mundo" title="Ver el mundo entero (tecla 0)">🌍<span>Mundo</span></button>';
    cont.innerHTML = h;
    cont.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b || !mundo) return;
      if (b.dataset.poder) activarPoder(poderActivo === b.dataset.poder ? null : b.dataset.poder);
      else if (b.dataset.accion === 'ejercito') seleccionarEjercito();
      else if (b.dataset.accion === 'capital') enfocar('capital', 2.4);
      else if (b.dataset.accion === 'mundo') render.ajustar();
    };
  }

  function activarPoder(tipo) {
    if (tipo && SIM.recargaPoder(mundo, humano, tipo) > 0) { toast(SIM.PODERES[tipo].icono + ' ' + SIM.PODERES[tipo].nombre + ' se está recargando'); return; }
    if (tipo && !mundo.civs[humano].viva) return;
    poderActivo = tipo;
    canvas.classList.toggle('apuntando', !!tipo);
    if (tipo) toast(SIM.PODERES[tipo].icono + ' Hacé clic en el mapa para usar ' + SIM.PODERES[tipo].nombre + ' (Esc cancela)');
    actualizarPoderes();
  }

  function lanzarPoder(w) {
    var r = SIM.usarPoder(mundo, humano, poderActivo, w[0], w[1]);
    if (!r.ok) { toast('✋ ' + r.motivo); return; }
    activarPoder(null);
  }

  function actualizarPoderes() {
    Array.prototype.forEach.call($('barra-poderes').querySelectorAll('button[data-poder]'), function (b) {
      var falta = SIM.recargaPoder(mundo, humano, b.dataset.poder), rec = b.querySelector('.rec');
      b.classList.toggle('activo', poderActivo === b.dataset.poder);
      rec.classList.toggle('oculto', falta <= 0);
      if (falta > 0) rec.textContent = falta;
    });
  }

  // ---------- panel de selección (tropas o ciudad) ----------
  var firmaSel = '';
  $('panel-sel').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled || !mundo) return;
    var m = mundo, acc = b.dataset.acc;
    if (acc === 'cerrar') { seleccion = {}; ciudadSel = null; }
    else if (acc === 'casa') {
      unidadesSeleccionadas().forEach(function (u) {
        var mejor = null, md = Infinity;
        m.ciudades.forEach(function (c) { if (c.civ === humano) { var d = Math.hypot(c.x - u.x, c.y - u.y); if (d < md) { md = d; mejor = c; } } });
        if (mejor) { u.manual = true; u.mision = false; u.camino = null; u.orden = u.d.rol === 'naval' && mejor.agua !== null ? { tipo: 'ir', x: mejor.agua % m.W, y: Math.floor(mejor.agua / m.W) } : { tipo: 'ir', x: mejor.x, y: mejor.y }; }
      });
    } else if (acc === 'solas') {
      unidadesSeleccionadas().forEach(function (u) { u.manual = false; u.orden = null; u.camino = null; });
      toast('🤖 Esas tropas vuelven a manejarse solas según tu plan');
      seleccion = {};
    } else if (acc === 'producir' || acc === 'construir') {
      var c = SIM.ciudadPorId(m, ciudadSel);
      if (!c || c.civ !== humano) return;
      var item = { tipo: acc === 'producir' ? 'unidad' : 'edificio', id: b.dataset.id };
      c.colaUsuario = c.colaUsuario || [];
      if (!c.cola || !c.cola.usuario) { c.cola = { tipo: item.tipo, id: item.id, usuario: true }; }
      else if (c.colaUsuario.length < 6) c.colaUsuario.push(item);
      else toast('La cola de esta ciudad está llena');
    } else if (acc === 'quitar') {
      var c2 = SIM.ciudadPorId(m, ciudadSel);
      if (c2 && c2.colaUsuario) c2.colaUsuario.splice(Number(b.dataset.i), 1);
    } else if (acc === 'comprar') {
      var c3 = SIM.ciudadPorId(m, ciudadSel);
      if (c3 && SIM.comprar(m, c3)) toast('💰 Comprado: sale en el próximo turno');
      else toast('No te alcanza el oro');
    }
    firmaSel = '';
    actualizarSeleccion();
  });

  function actualizarSeleccion() {
    var panel = $('panel-sel'), m = mundo;
    var sel = unidadesSeleccionadas();
    if (!sel.length && Object.keys(seleccion).length) seleccion = {};
    var c = ciudadSel !== null ? SIM.ciudadPorId(m, ciudadSel) : null;
    if (!sel.length && !c) { panel.classList.add('oculto'); firmaSel = ''; return; }
    panel.classList.remove('oculto');
    var yo = m.civs[humano];
    if (sel.length) {
      var cuenta = {};
      sel.forEach(function (u) { cuenta[u.tipo] = (cuenta[u.tipo] || 0) + 1; });
      var firma = 'u|' + JSON.stringify(cuenta) + sel.filter(function (u) { return u.manual; }).length;
      if (firma === firmaSel) return;
      firmaSel = firma;
      var chips = Object.keys(cuenta).map(function (t) { return '<span>' + SIM.UNIDADES[t].icono + ' ' + esc(SIM.UNIDADES[t].nombre) + ' ×' + cuenta[t] + '</span>'; }).join('');
      panel.innerHTML = '<div class="t">🪖 ' + sel.length + (sel.length === 1 ? ' unidad' : ' unidades') + '<button class="cerrar" data-acc="cerrar" title="Deseleccionar (Esc)">✕</button></div>' +
        '<div class="chips">' + chips + '</div>' +
        '<div class="d">🖱 <b>Clic derecho</b> en el mapa para moverlas, sobre una ciudad o tropa enemiga para atacar.' + (cuenta.colono ? ' Con colonos: clic derecho donde quieras fundar una ciudad.' : '') + '</div>' +
        '<div class="grilla"><button data-acc="casa">🏠 Volver a casa</button><button data-acc="solas" title="Que peleen y se muevan solas según tu plan">🤖 Que se manejen solas</button></div>';
      return;
    }
    var civ = m.civs[c.civ], mia = c.civ === humano;
    var colaTxt = c.cola ? nombreItem(c.cola) : '—';
    var costoCola = c.cola ? SIM.costoDe(m, c, c.cola) : 1;
    var firma2 = 'c|' + c.id + '|' + c.civ + '|' + (c.cola ? c.cola.id : '') + '|' + JSON.stringify(c.colaUsuario || []) + '|' + JSON.stringify(c.ed) + '|' + civ.era + '|' + (mia && c.cola && yo.oro >= SIM.costoCompra(m, c));
    if (firma2 !== firmaSel) {
      firmaSel = firma2;
      var h = '<div class="t"><span>' + (c.capital ? '👑 ' : '🏰 ') + esc(c.nombre) + '</span><button class="cerrar" data-acc="cerrar">✕</button></div>' +
        '<div class="d"><span style="color:' + civ.color + '">● ' + civ.nombre + '</span> · Era ' + SIM.ERAS[civ.era].nombre + '</div>' +
        '<div class="d" id="sel-datos"></div>';
      if (mia) {
        h += '<div class="et">Produciendo</div><div class="d">' + colaTxt + (c.cola && !c.cola.usuario ? ' <span class="costo">(elegido automáticamente)</span>' : '') + '</div>' +
          '<div class="barra"><div id="sel-prog" style="width:0%"></div></div>';
        if (c.cola) {
          var cc = SIM.costoCompra(m, c);
          h += '<div class="grilla"><button data-acc="comprar" ' + (yo.oro >= cc ? '' : 'disabled') + '>💰 Comprar ya (' + cc + ' oro)</button></div>';
        }
        if (c.colaUsuario && c.colaUsuario.length) {
          h += '<div class="et">En cola</div><div class="chips">' + c.colaUsuario.map(function (it, i) { return '<span>' + nombreItem(it) + '<button data-acc="quitar" data-i="' + i + '" title="Quitar">✕</button></span>'; }).join('') + '</div>';
        }
        h += '<div class="et">Entrenar</div><div class="grilla">';
        var roles = ['melee', 'distancia', 'asedio', 'naval', 'aire', 'colono'], vistos = {};
        for (var id in SIM.UNIDADES) {
          var d = SIM.UNIDADES[id];
          if (roles.indexOf(d.rol) < 0 || !SIM.itemValido(m, civ, c, { tipo: 'unidad', id: id })) continue;
          // Solo lo mejor de cada rol de la era actual (más la unidad única)
          var mejorEra = 0;
          for (var id2 in SIM.UNIDADES) { var d2 = SIM.UNIDADES[id2]; if (d2.rol === d.rol && d2.era <= civ.era && (!d2.civ || d2.civ === civ.clave)) mejorEra = Math.max(mejorEra, d2.era); }
          if (d.era < mejorEra || vistos[id]) continue;
          vistos[id] = true;
          h += '<button data-acc="producir" data-id="' + id + '" title="Ataque ' + d.atk + ' · Defensa ' + d.def + '">' + d.icono + ' ' + esc(d.nombre) + ' <span class="costo">' + Math.round(SIM.costoDe(m, c, { tipo: 'unidad', id: id })) + '</span></button>';
        }
        h += '</div><div class="et">Construir</div><div class="grilla">';
        var algun = false;
        for (var e in SIM.EDIFICIOS) {
          if (!SIM.itemValido(m, civ, c, { tipo: 'edificio', id: e })) continue;
          algun = true;
          h += '<button data-acc="construir" data-id="' + e + '" title="' + esc(SIM.EDIFICIOS[e].desc) + '">' + esc(SIM.EDIFICIOS[e].nombre) + ' <span class="costo">' + SIM.EDIFICIOS[e].costo + '</span></button>';
        }
        if (!algun) h += '<span class="costo">Ya tiene todo lo disponible en esta era</span>';
        h += '</div><div class="d" style="margin-top:6px;color:#93a1bd">Cuando termina tu cola, la ciudad sigue eligiendo sola según tu plan. Tenés ' + Math.floor(yo.oro) + ' de oro.</div>';
      } else if (SIM.enGuerra(m, humano, c.civ)) {
        h += '<div class="d">⚔ Están en guerra con vos. Seleccioná tropas y hacé <b>clic derecho</b> sobre esta ciudad para atacarla. Si su vida llega a cero y una tropa terrestre está al lado, la conquistás.</div>';
      } else {
        h += '<div class="d">🕊 Estás en paz con ellos.</div>';
      }
      panel.innerHTML = h;
    }
    var datos = $('sel-datos');
    if (datos) datos.textContent = 'Población ' + Math.floor(c.pop) + ' · Vida ' + Math.round(c.hp) + '/' + Math.round(SIM.hpMaxCiudad(m, c)) + ' · Defensa ' + Math.round(SIM.defensaCiudad(m, c));
    var prog = $('sel-prog');
    if (prog) prog.style.width = (c.cola ? Math.min(100, Math.round(c.prog / costoCola * 100)) : 0) + '%';
  }

  // ---------- panel: civilizaciones ----------
  function armarTarjetas() {
    var cont = $('lista-civs');
    cont.innerHTML = ''; tarjetas = [];
    mundo.civs.forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'civ' + (c.idx === humano ? ' yo' : '');
      el.innerHTML = '<div class="color" style="background:' + c.color + '"></div>' +
        '<div><div class="nombre">' + c.nombre + '<span class="quien">' + controlTexto(c) + '</span></div><div class="datos"></div><div class="rel"></div></div>' +
        '<div class="acciones"></div>';
      cont.appendChild(el);
      var t = { el: el, datos: el.querySelector('.datos'), rel: el.querySelector('.rel'), acciones: el.querySelector('.acciones'), firma: '' };
      t.acciones.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b || b.disabled || !mundo) return;
        if (b.dataset.acc === 'guerra') { SIM.Consejo.aplicarEfecto(mundo, mundo.civs[humano], 'guerra:' + c.idx); toast('⚔ ¡Le declaraste la guerra a los ' + c.nombre + '!'); }
        if (b.dataset.acc === 'paz') { SIM.proponerPaz(mundo, humano, c.idx); toast('🕊 Les propusiste la paz a los ' + c.nombre); }
        actualizarPanel();
      });
      tarjetas.push(t);
    });
  }

  function actualizarTarjetas() {
    var yo = mundo.civs[humano];
    mundo.civs.forEach(function (c, i) {
      var t = tarjetas[i], e = SIM.estadisticas(mundo, c.idx);
      t.el.classList.toggle('muerta', !c.viva);
      if (!c.viva) { t.datos.textContent = '💀 Eliminados'; t.rel.textContent = ''; t.acciones.innerHTML = ''; t.firma = ''; return; }
      t.datos.textContent = 'Era ' + SIM.ERAS[c.era].nombre + ' · 🏙 ' + e.ciudades + ' · 👥 ' + e.pop + ' · ⚔ ' + e.poder + (i === humano ? ' · 💰 ' + e.oro : '') + (c.maravillaDesde !== null ? ' · 🏛 ' + Math.max(0, SIM.TURNOS_MARAVILLA - (mundo.turno - c.maravillaDesde)) : '');
      var relTxt = '', relCls = 'rel', firma = '';
      if (i !== humano) {
        if (!yo.conoce[i]) relTxt = '❔ Todavía no los conocés';
        else if (yo.rel[i] === 'guerra') { relTxt = '⚔ En guerra con vos'; relCls += ' guerra'; }
        else if (yo.tregua[i] > mundo.turno) relTxt = '🕊 En paz (tregua)';
        else relTxt = '🕊 En paz' + (yo.amigos[i] ? ' · comercio' : '');
        if (yo.viva && yo.conoce[i]) firma = yo.rel[i] === 'guerra' ? 'paz' : (yo.tregua[i] > mundo.turno ? 'tregua' : 'guerra');
      } else {
        var enemigos = SIM.enemigosDe(mundo, c).map(function (k) { return mundo.civs[k].nombre; });
        relTxt = enemigos.length ? '⚔ En guerra con: ' + enemigos.join(', ') : '🕊 En paz con todos';
        if (enemigos.length) relCls += ' guerra';
      }
      t.rel.textContent = relTxt; t.rel.className = relCls;
      if (firma !== t.firma) {
        t.firma = firma;
        if (firma === 'paz') t.acciones.innerHTML = '<button data-acc="paz" title="Proponerles la paz">🕊 Paz</button>';
        else if (firma === 'guerra') t.acciones.innerHTML = '<button data-acc="guerra" title="Declararles la guerra">⚔ Guerra</button>';
        else if (firma === 'tregua') t.acciones.innerHTML = '<button disabled title="Hay una tregua vigente">⚔ Tregua</button>';
        else t.acciones.innerHTML = '';
      }
    });
  }

  // ---------- panel: tu plan ----------
  function armarPlan() {
    var cont = $('plan');
    var h = '<div class="plan-fila"><span class="et">Foco</span>';
    for (var k in SIM.FOCOS) h += '<button data-foco="' + k + '" title="' + esc(SIM.FOCOS[k].desc) + '">' + SIM.FOCOS[k].icono + ' ' + SIM.FOCOS[k].nombre + '</button>';
    h += '</div><div class="plan-fila"><span class="et">Extras</span>' +
      '<button data-extra="murallas" title="Construir murallas en todas las ciudades">🧱 Murallas</button>' +
      '<button data-extra="armada" title="Puertos y barcos de guerra (desde la era Clásica)">⛵ Flota</button>' +
      '<button data-extra="maravilla" title="Construir una Maravilla en la capital (desde la era Pólvora)">🏛 Maravilla</button>' +
      '<button data-extra="aire" title="Aeródromos y aviones (era Moderna)">✈ Aviación</button>' +
      '</div><div class="plan-fila"><span class="et">Tropas que no manejás vos</span>' +
      '<button data-postura="defensa" title="Defienden tus ciudades">🛡 Defender</button>' +
      '<button data-postura="ataque" title="Atacan solas a tus enemigos">⚔ Atacar</button>' +
      '<span id="plan-objetivo" style="font-size:12px;color:#93a1bd"></span></div>';
    cont.innerHTML = h;
    cont.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled || !mundo) return;
      var yo = mundo.civs[humano];
      if (!yo.viva) return;
      if (b.dataset.foco) {
        yo.plan.foco = b.dataset.foco;
        SIM.registrar(mundo, humano, 'decision', '👤 ' + yo.nombre + ': cambiaste el foco a ' + SIM.FOCOS[b.dataset.foco].nombre);
      } else if (b.dataset.extra) {
        yo.plan[b.dataset.extra] = !yo.plan[b.dataset.extra];
      } else if (b.dataset.postura) {
        yo.plan.postura = b.dataset.postura;
        var en = SIM.enemigosDe(mundo, yo);
        if (b.dataset.postura === 'ataque' && en.length && en.indexOf(yo.plan.objetivo) < 0) yo.plan.objetivo = en[0];
      } else if (b.dataset.obj) {
        yo.plan.objetivo = Number(b.dataset.obj);
        yo.plan.postura = 'ataque';
      }
      actualizarPlan();
    };
  }

  function actualizarPlan() {
    var yo = mundo.civs[humano], cont = $('plan');
    Array.prototype.forEach.call(cont.querySelectorAll('button[data-foco]'), function (b) { b.classList.toggle('activo', yo.plan.foco === b.dataset.foco); b.disabled = !yo.viva; });
    var eraMin = { murallas: 0, armada: 1, maravilla: 3, aire: 5 };
    Array.prototype.forEach.call(cont.querySelectorAll('button[data-extra]'), function (b) {
      var k = b.dataset.extra;
      b.classList.toggle('activo', !!yo.plan[k]);
      b.disabled = !yo.viva || yo.era < eraMin[k];
    });
    Array.prototype.forEach.call(cont.querySelectorAll('button[data-postura]'), function (b) { b.classList.toggle('activo', yo.plan.postura === b.dataset.postura); b.disabled = !yo.viva; });
    var en = SIM.enemigosDe(mundo, yo), obj = $('plan-objetivo');
    var firma = en.join(',') + '|' + yo.plan.objetivo + '|' + yo.plan.postura;
    if (obj.dataset.firma !== firma) {
      obj.dataset.firma = firma;
      if (!en.length) obj.innerHTML = 'sin guerras';
      else obj.innerHTML = 'contra: ' + en.map(function (k) {
        var activo = yo.plan.postura === 'ataque' && yo.plan.objetivo === k;
        return '<button data-obj="' + k + '" class="' + (activo ? 'activo' : '') + '">' + mundo.civs[k].nombre + '</button>';
      }).join(' ');
    }
  }

  // ---------- panel: diario de Claude y crónica ----------
  var firmaDiario = '';
  function actualizarDiario() {
    var c = mundo.civs[claudeIdx], cont = $('diario-claude');
    var firma = c.diario.length + '|' + (c.diario.length ? c.diario[c.diario.length - 1].anio : '') + '|' + mundo.claudeActivo;
    if (firma === firmaDiario) return;
    firmaDiario = firma;
    if (!c.diario.length) {
      cont.innerHTML = '<p class="vacio">' + (mundo.claudeActivo ? 'Todavía no tomó ninguna decisión.' : 'Claude no está conectado: los ' + c.nombre + ' los maneja la IA del juego.') + '</p>';
      return;
    }
    cont.innerHTML = c.diario.slice().reverse().map(function (d) {
      return '<div class="ent"><div class="cab">' + esc(d.anio) + ' · ' + esc(d.titulo || '') + '</div><div>' + esc(d.decision) + '</div>' +
        '<div style="color:#b9c4dc;margin-top:2px">' + esc(d.texto) + '</div>' + (d.mensaje ? '<div class="msg">“' + esc(d.mensaje) + '”</div>' : '') + '</div>';
    }).join('');
  }

  function actualizarCronica() {
    var nuevas = [];
    mundo.cronica.forEach(function (e) { if (!e._mostrada) { e._mostrada = true; nuevas.push(e); } });
    if (!nuevas.length) return;
    var cont = $('cronica'), html = '';
    nuevas.reverse().forEach(function (e) {
      html += '<div class="l ' + e.tipo + '"><span class="a">' + esc(e.anio) + '</span>' + esc(e.texto) + '</div>';
    });
    cont.insertAdjacentHTML('afterbegin', html);
    while (cont.children.length > 200) cont.removeChild(cont.lastChild);
  }

  // Consejos para arrancar (aparecen una sola vez por partida)
  var TIPS = [
    [3, '👋 Tip: arrastrá un recuadro sobre tus tropas y hacé clic derecho en el mapa para moverlas'],
    [18, '🏰 Tip: hacé clic en una de tus ciudades para elegir qué entrena o construye'],
    [35, '⚡ Tip: los poderes de abajo (rayo, lluvia, bendición...) se usan con un clic en el mapa'],
    [55, '🏕 Tip: seleccioná tus colonos y hacé clic derecho donde quieras fundar una ciudad nueva'],
  ];
  function mostrarTips() {
    if (params.get('inicio') === '1') return;
    for (var k = 0; k < TIPS.length; k++) {
      if (!TIPS[k].visto && mundo.turno >= TIPS[k][0]) { TIPS[k].visto = true; toast(TIPS[k][1]); return; }
    }
  }

  function actualizarPanel() {
    if (!mundo) return;
    mostrarTips();
    $('anio').textContent = SIM.anioTexto(mundo.turno);
    actualizarTarjetas();
    actualizarPlan();
    actualizarDiario();
    actualizarCronica();
    actualizarPoderes();
    actualizarSeleccion();
    actualizarAvisos();
    SIM.modulos.forEach(function (mod) { if (mod.panel) mod.panel(mundo, humano); });
  }

  // ---------- avisos (decisiones sin frenar el juego) ----------
  $('chk-piloto').onchange = function () {
    if (!mundo) return;
    mundo.pilotoAutomatico = $('chk-piloto').checked;
  };

  function crearAviso(k) {
    var el = document.createElement('div');
    el.className = 'aviso' + (k.tipo === 'guerra_recibida' || k.tipo === 'ciudad_perdida' || k.tipo === 'maravilla_rival' ? ' urgente' : '');
    el.innerHTML = '<div class="t">' + esc(k.titulo) + '</div><div class="x">' + esc(k.texto) + '</div><div class="ops"></div><div class="tiempo" title="Si no respondés, decide tu consejero"><div style="width:100%"></div></div>';
    var ops = el.querySelector('.ops');
    k.opciones.forEach(function (op, i) {
      var b = document.createElement('button');
      b.textContent = op.texto;
      b.onclick = function () {
        if (mundo.consejos.indexOf(k) < 0) return;
        quitarAviso(k);
        SIM.Consejo.resolver(mundo, k, i, { fuente: 'humano' });
        actualizarPanel();
      };
      ops.appendChild(b);
    });
    k.el = el;
    $('avisos').appendChild(el);
    SIM.Sonido.tocar('aviso');
  }
  function quitarAviso(k) { if (k.el && k.el.parentNode) k.el.parentNode.removeChild(k.el); k.el = null; }

  function actualizarAvisos() {
    mundo.consejos.forEach(function (k) {
      if (k.control !== 'humano' || !k.el) return;
      var resto = Math.max(0, 1 - (mundo.turno - k.turno) / LIMITE_AVISO);
      k.el.querySelector('.tiempo div').style.width = Math.round(resto * 100) + '%';
    });
  }

  function procesarConsejos() {
    mundo.consejos.slice().forEach(function (k) {
      if (k.control === 'humano') {
        if (mundo.pilotoAutomatico || mundo.turno - k.turno > LIMITE_AVISO) {
          quitarAviso(k);
          SIM.Consejo.resolver(mundo, k, SIM.Consejo.decidirBot(mundo, mundo.civs[k.civ], k), { fuente: 'bot' });
        } else if (!k.el) crearAviso(k);
      } else if (k.control === 'claude' && k.estado === 'esperando') {
        k.estado = 'pidiendo';
        pedirAClaude(k);
      }
    });
    // Avisos de consejos que ya no existen (por ejemplo, porque cambió la situación)
    Array.prototype.forEach.call($('avisos').children, function (el) {
      if (!mundo.consejos.some(function (k) { return k.el === el; })) el.parentNode.removeChild(el);
    });
    var pendiente = mundo.consejos.filter(function (k) { return k.control === 'claude'; })[0];
    var banner = $('banner-claude');
    if (pendiente) {
      var seg = Math.floor((performance.now() - pendiente.inicio) / 1000);
      var txt = '🤖 <span>Claude está pensando qué hacer con los <b>' + mundo.civs[pendiente.civ].nombre + '</b>: «' + esc(pendiente.titulo) + '» <span class="puntos"></span> ' + seg + ' s</span>';
      if (banner.dataset.txt !== txt) { banner.dataset.txt = txt; banner.innerHTML = txt; }
      banner.classList.remove('oculto');
    } else banner.classList.add('oculto');
  }

  function pedirAClaude(k) {
    var m = mundo, civ = m.civs[k.civ];
    var p = SIM.Consejo.promptClaude(m, k);
    var ctrl = new AbortController();
    k.inicio = performance.now();
    var reloj = setTimeout(function () { ctrl.abort(); }, 150000);
    function sigueVigente() { return mundo === m && m.consejos.indexOf(k) >= 0; }
    fetch('/api/claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ sistema: p.sistema, prompt: p.prompt, cantidad: k.opciones.length }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(reloj);
      if (!sigueVigente()) return;
      if (!j.ok) throw j;
      claude.fallas = 0;
      var idx = Math.max(0, Math.min(k.opciones.length - 1, (Number(j.opcion) || 1) - 1));
      SIM.Consejo.resolver(m, k, idx, { fuente: 'claude', mensaje: j.mensaje, razon: j.razon });
      estadoClaude(true, 'jugando', 'Claude está jugando con los ' + civ.nombre + '.');
      if (j.mensaje) { toast('💬 ' + civ.nombre + ' (Claude): "' + j.mensaje + '"'); SIM.decir(m, k.civ, j.mensaje); }
      actualizarPanel();
    }).catch(function (err) {
      clearTimeout(reloj);
      if (!sigueVigente()) return;
      var motivo = err && err.name === 'AbortError' ? 'tardó demasiado' : ((err && err.error) || 'no respondió');
      claude.fallas++;
      if (err && (err.codigo === 'login' || err.codigo === 'no_instalado') || claude.fallas >= 3) {
        m.claudeActivo = false;
        if (err && err.codigo === 'login') estadoClaude(false, 'sin sesión', 'Claude no tiene la sesión iniciada en esta PC. Abrí una terminal, escribí <code>claude</code> y después <code>/login</code>. Mientras tanto, sus decisiones las toma la IA del juego.');
        else estadoClaude(false, 'desconectado', 'Claude falló varias veces (' + esc(motivo) + '). Sus decisiones las toma la IA del juego.');
      }
      SIM.registrar(m, k.civ, 'decision', '⚠ Claude ' + motivo + ': esta vez decide la IA del juego');
      SIM.Consejo.resolver(m, k, SIM.Consejo.decidirBot(m, civ, k), { fuente: 'bot' });
      actualizarPanel();
    });
  }

  // ---------- final ----------
  function mostrarFinal() {
    finMostrado = true;
    var f = mundo.fin, g = mundo.civs[f.ganador];
    var motivos = { conquista: 'por conquista', maravilla: 'por su Maravilla', puntaje: 'por puntaje al llegar al año 2050' };
    $('final-titulo').textContent = f.ganador === humano ? '🏆 ¡Ganaste!' : '🏆 Ganaron los ' + g.nombre;
    $('final-texto').textContent = 'Los ' + g.nombre + ' (' + controlTexto(g).replace(/^\S+ /, '') + ') ganaron ' + motivos[f.motivo] + (f.motivo === 'puntaje' ? '.' : ', en el año ' + SIM.anioTexto(f.turno));
    var filas = mundo.civs.map(function (c) { return { c: c, p: c.viva ? SIM.puntaje(mundo, c.idx) : 0 }; }).sort(function (a, b) { return b.p - a.p; });
    $('final-tabla').innerHTML = '<tr><th>Civilización</th><th>Quién</th><th>Era</th><th>Ciudades</th><th>Puntaje</th></tr>' + filas.map(function (x) {
      var e = SIM.estadisticas(mundo, x.c.idx);
      return '<tr><td><span style="color:' + x.c.color + '">●</span> ' + x.c.nombre + '</td><td>' + controlTexto(x.c) + '</td><td>' + (x.c.viva ? SIM.ERAS[x.c.era].nombre : '💀') + '</td><td>' + e.ciudades + '</td><td>' + x.p + '</td></tr>';
    }).join('');
    $('final').classList.remove('oculto');
  }

  // ---------- sonido ----------
  function sonarEfectos() {
    var ef = mundo.efectos;
    for (var k = 0; k < ef.length; k++) {
      var e = ef[k];
      if (e._sonado) continue;
      e._sonado = true;
      var q = render.aPantalla(e.x2, e.y2);
      if (q[0] < -50 || q[1] < -50 || q[0] > render.ancho + 50 || q[1] > render.alto + 50) continue;
      var grande = e.tipo === 'rayo' || e.tipo === 'terremoto' || e.tipo === 'lluvia' || e.tipo === 'bendicion' || e.tipo === 'peste' || e.tipo === 'intriga';
      SIM.Sonido.tocar(e.tipo, grande ? 1 : 0.5);
    }
  }
  $('btn-ayuda').onclick = function () { $('ayuda').classList.remove('oculto'); };
  $('btn-cerrar-ayuda').onclick = function () { $('ayuda').classList.add('oculto'); };
  $('btn-sonido').onclick = function () { $('btn-sonido').textContent = SIM.Sonido.alternar() ? '🔊' : '🔇'; };

  // ---------- bucle principal ----------
  function bucle(ahora) {
    var dt = Math.min(250, ahora - ultimo);
    ultimo = ahora;
    if (mundo) {
      moverConTeclas(dt);
      if (!mundo.fin && velocidad > 0) {
        acumulado += dt * velocidad;
        var n = 0;
        while (acumulado >= TICK_MS && n < 40) {
          SIM.paso(mundo);
          acumulado -= TICK_MS; n++;
          if (mundo.fin) { acumulado = 0; break; }
        }
        if (n >= 40) acumulado = 0;
      }
      var alfa = velocidad > 0 && !mundo.fin ? Math.min(1, acumulado / TICK_MS) : 1;
      var P = poderActivo && cursor ? { tipo: poderActivo, x: cursor[0], y: cursor[1] } : null;
      sonarEfectos();
      render.dibujar(alfa, ahora, { sel: seleccion, ciudadSel: ciudadSel, caja: caja && (Math.abs(caja.x1 - caja.x0) > 5 || Math.abs(caja.y1 - caja.y0) > 5) ? caja : null, poder: P });
      procesarConsejos();
      if (ahora - ultimoPanel > 250) { actualizarPanel(); ultimoPanel = ahora; }
      if (mundo.fin && !finMostrado) mostrarFinal();
    }
    requestAnimationFrame(bucle);
  }

  window.addEventListener('resize', function () { if (mundo) { render.redimensionar(); render.limitar(); } });
  $('mapa').addEventListener('webglcontextlost', function () {});

  // Para pruebas y capturas: ?inicio=1&ff=600&vel=0&auto=1&enfocar=batalla&acercar=2.6
  window.JUEGO = {
    mundo: function () { return mundo; }, get render() { return render; }, velocidad: fijarVelocidad,
    seleccionar: function (ids) { seleccion = {}; ids.forEach(function (id) { seleccion[id] = true; }); },
    orden: function (x, y) { darOrden([x, y]); }, ciudad: function (id) { ciudadSel = id; seleccion = {}; },
    poder: function (tipo, x, y) { poderActivo = tipo; lanzarPoder([x, y]); },
  };

  comprobarServidor();
  armarInicio();
  if (params.get('inicio') === '1') {
    iniciarPartida();
    var ff = Number(params.get('ff') || 0);
    if (ff > 0) {
      var antes = mundo.todoBot;
      mundo.todoBot = true;
      while (mundo.turno < ff && !mundo.fin) SIM.paso(mundo);
      mundo.todoBot = antes;
      mundo.efectos.forEach(function (e) { e.visto = true; });
    }
    if (params.get('enfocar')) enfocar(params.get('enfocar'), Number(params.get('acercar') || 2.6));
    if (params.has('vel')) fijarVelocidad(Number(params.get('vel')));
    actualizarPanel();
  } else {
    fijarVelocidad(0);
  }
  requestAnimationFrame(bucle);
})();
