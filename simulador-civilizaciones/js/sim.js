/* Simulación: ciudades, economía, unidades, combate, diplomacia y el "gobernador"
   automático que maneja cada civilización según su plan. No toca el DOM. */
var SIM = SIM || {};

(function () {
  var T = SIM.T;

  // ---------- utilidades ----------
  SIM.anio = function (turno) {
    var tr = SIM.TRAMOS_ANIO;
    for (var i = 1; i < tr.length; i++) {
      if (turno <= tr[i][0]) {
        var a = tr[i - 1], b = tr[i];
        return a[1] + (b[1] - a[1]) * (turno - a[0]) / (b[0] - a[0]);
      }
    }
    return tr[tr.length - 1][1];
  };
  SIM.anioTexto = function (turno) {
    var a = Math.round(SIM.anio(turno));
    if (a < 0) return (-a) + ' a.C.';
    return a + ' d.C.';
  };

  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function tileDe(m, u) { return Math.round(u.y) * m.W + Math.round(u.x); }
  function nuevoId(m) { return m.sigId++; }

  function registrar(m, civ, tipo, texto) {
    var e = { turno: m.turno, anio: SIM.anioTexto(m.turno), civ: civ, tipo: tipo, texto: texto };
    m.cronica.push(e);
    if (m.cronica.length > 500) m.cronica.shift();
  }
  SIM.registrar = registrar;

  function encolarEvento(m, civ, ev, prioridad) {
    if (!civ.viva) return;
    for (var i = 0; i < civ.eventos.length; i++) {
      var e = civ.eventos[i];
      if (e.tipo === ev.tipo && e.otro === ev.otro) { e.prioridad = Math.max(e.prioridad, prioridad); return; }
    }
    ev.prioridad = prioridad; ev.turno = m.turno;
    civ.eventos.push(ev);
  }
  SIM.encolarEvento = encolarEvento;

  // ---------- bus de eventos (contrato del rediseño, ver DISENO.md §6.1) ----------
  var oyentes = [];
  SIM.escuchar = function (fn) {
    oyentes.push(fn);
    return function () { var i = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1); };
  };
  SIM.emitir = function (m, tipo, datos) {
    for (var i = 0; i < oyentes.length; i++) {
      try { oyentes[i](m, tipo, datos || {}); } catch (e) { if (typeof console !== 'undefined') console.error('Oyente de "' + tipo + '":', e); }
    }
  };

  // ---------- Fe (recurso de cada dios, ver DISENO.md §3.1) ----------
  SIM.darFe = function (m, idx, cantidad, motivo, x, y) {
    var civ = m.civs[idx];
    if (!civ || !civ.viva || !cantidad) return 0;
    var antes = civ.puntosFe;
    civ.puntosFe = Math.max(0, civ.puntosFe + cantidad);
    var real = civ.puntosFe - antes;
    civ.puntosFeTurno += real;
    if (real > 0) civ.puntosFeTotal += real;
    SIM.emitir(m, 'fe', { civ: idx, cantidad: real, motivo: motivo || '', x: x, y: y });
    return real;
  };

  SIM.ciudadesDe = function (m, idx) { return m.ciudades.filter(function (c) { return c.civ === idx; }); };
  SIM.ciudadPorId = function (m, id) {
    for (var i = 0; i < m.ciudades.length; i++) if (m.ciudades[i].id === id) return m.ciudades[i];
    return null;
  };
  function unidadPorId(m, id) {
    for (var i = 0; i < m.unidades.length; i++) if (m.unidades[i].id === id) return m.unidades[i];
    return null;
  }
  function esCombatiente(u) { return u.d.rol !== 'colono'; }
  SIM.enGuerra = function (m, a, b) { return a !== b && a >= 0 && b >= 0 && m.civs[a].rel[b] === 'guerra'; };
  function enemigosDe(m, civ) {
    var r = [];
    for (var i = 0; i < m.civs.length; i++) if (m.civs[i].viva && civ.rel[i] === 'guerra') r.push(i);
    return r;
  }
  SIM.enemigosDe = enemigosDe;

  SIM.poder = function (m, idx) {
    var p = 0;
    for (var i = 0; i < m.unidades.length; i++) {
      var u = m.unidades[i];
      if (u.civ !== idx || u.muerta || !esCombatiente(u)) continue;
      p += (u.d.atk + u.d.def) * (0.4 + 0.6 * u.hp / u.d.hp);
    }
    return Math.round(p);
  };

  SIM.estadisticas = function (m, idx) {
    var civ = m.civs[idx], ciudades = SIM.ciudadesDe(m, idx), pop = 0, mil = 0;
    ciudades.forEach(function (c) { pop += c.pop; });
    m.unidades.forEach(function (u) { if (u.civ === idx && !u.muerta && esCombatiente(u)) mil++; });
    return {
      ciudades: ciudades.length, pop: Math.round(pop), militares: mil, poder: SIM.poder(m, idx),
      oro: Math.floor(civ.oro), ciencia: Math.floor(civ.ciencia), era: civ.era,
      proximaEra: SIM.ERAS[civ.era + 1] ? SIM.ERAS[civ.era + 1].ciencia : null,
    };
  };

  SIM.puntaje = function (m, idx) {
    var e = SIM.estadisticas(m, idx), civ = m.civs[idx];
    return Math.round(e.pop * 2 + e.ciudades * 10 + civ.era * 25 + civ.ciencia / 60 + e.militares + (civ.maravillaDesde !== null ? 60 : 0));
  };

  // ---------- creación ----------
  SIM.crearMundo = function (op) {
    var W = op.W || 96, H = op.H || 60;
    var mapa = SIM.generarMapa(W, H, op.semilla, op.jugadores.length);
    var m = {
      mapa: mapa, W: W, H: H, N: W * H, rng: SIM.crearRNG(mapa.semilla + 99),
      tick: 0, turno: 0, civs: [], ciudades: [], unidades: [], sigId: 1,
      dueno: new Int8Array(W * H).fill(-1), ciudadDe: new Int32Array(W * H).fill(-1), territorioVersion: 0,
      cronica: [], consejos: [], efectos: [], fin: null, opciones: op, presupuesto: 0,
      todoBot: !!op.todoBot, pilotoAutomatico: false, claudeActivo: !!op.claudeActivo,
    };
    op.jugadores.forEach(function (j, idx) {
      var d = SIM.CIVS[j.civ];
      m.civs.push({
        idx: idx, clave: j.civ, datos: d, nombre: d.nombre, color: d.color, control: j.control,
        era: 0, ciencia: 0, oro: 20, viva: true, nombreIdx: 0,
        plan: { foco: 'expansion', postura: 'defensa', objetivo: -1, armada: false, aire: false, maravilla: false, murallas: false },
        conoce: [], rel: [], tregua: [], amigos: [], guerraDesde: [],
        eventos: [], ultimoConsejo: -999, mision: null, sinSitioHasta: 0,
        proximoRumbo: 45 + idx * 9, proximaOportunidad: 90 + idx * 11,
        maravillaDesde: null, diario: [], cache: null, popTotal: 0, bajas: 0, victorias: 0,
        recargas: { rayo: 30, lluvia: 20, bendicion: 40, terremoto: 150, peste: 200, intriga: 160 },
        puntosFe: 40, puntosFeTurno: 0, puntosFeTotal: 0,
      });
    });
    calcularRegiones(m);
    var n = m.civs.length;
    m.civs.forEach(function (c) {
      for (var k = 0; k < n; k++) {
        c.conoce.push(k === c.idx); c.rel.push('paz'); c.tregua.push(0); c.amigos.push(false); c.guerraDesde.push(0);
      }
    });
    registrar(m, -1, 'inicio', '🌍 Comienza la historia. Año 3000 a.C.');
    m.civs.forEach(function (c, idx) {
      var p = mapa.inicios[idx];
      fundarCiudad(m, c, p[0], p[1], true);
      crearUnidad(m, c, 'guerrero', p[0], p[1]);
      crearUnidad(m, c, 'colono', p[0], p[1]);
    });
    recalcularTerritorio(m);
    SIM.modulos.forEach(function (mod) { if (mod.iniciar) mod.iniciar(m); });
    return m;
  };

  // ---------- ciudades ----------
  function radioCiudad(c) { return 2 + (c.pop >= 5 ? 1 : 0) + (c.pop >= 11 ? 1 : 0) + (c.pop >= 19 ? 1 : 0); }

  function aguaAdyacente(m, x, y) {
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
      var i = ny * m.W + nx;
      if (SIM.TERRENOS[m.mapa.tipo[i]].agua) return i;
    }
    return null;
  }

  function hpMaxCiudad(m, c) {
    var era = m.civs[c.civ].era;
    return 40 + c.pop * 3 + era * 10 + (c.ed.murallas ? 40 + era * 10 : 0);
  }
  SIM.hpMaxCiudad = hpMaxCiudad;

  function defensaCiudad(m, c) {
    var civ = m.civs[c.civ];
    var d = 3 + civ.era * 5 + c.pop * 0.25 + (c.ed.murallas ? 4 + civ.era * 3 : 0);
    if (civ.clave === 'coreanos') d *= 1.25;
    if (c.capital) d *= 1.1;
    return d;
  }
  SIM.defensaCiudad = defensaCiudad;

  function fundarCiudad(m, civ, x, y, capital) {
    var nombres = civ.datos.ciudades;
    var nombre = civ.nombreIdx < nombres.length ? nombres[civ.nombreIdx] : 'Nueva ' + nombres[civ.nombreIdx % nombres.length];
    civ.nombreIdx++;
    var c = {
      id: nuevoId(m), civ: civ.idx, nombre: nombre, x: x, y: y, pop: capital ? 2 : 1, prog: 0, cola: null,
      ed: {}, capital: !!capital, tiles: [], fundada: m.turno, hp: 0, radio: 0, agua: null, ultimoAtaque: -99,
    };
    c.agua = aguaAdyacente(m, x, y);
    c.costera = c.agua !== null;
    c.hp = hpMaxCiudad(m, c);
    c.radio = radioCiudad(c);
    m.ciudades.push(c);
    registrar(m, civ.idx, 'ciudad', capital
      ? '👑 Los ' + civ.nombre + ' fundan su capital: ' + nombre
      : '🏕 Los ' + civ.nombre + ' fundaron ' + nombre);
    SIM.emitir(m, 'ciudad_fundada', { civ: civ.idx, ciudad: c });
    return c;
  }

  function recalcularTerritorio(m) {
    var mejor = new Float32Array(m.N).fill(-1e9);
    m.dueno.fill(-1); m.ciudadDe.fill(-1);
    var porId = {};
    m.ciudades.forEach(function (c) {
      c.tiles = []; porId[c.id] = c;
      var r = radioCiudad(c);
      for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        var nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > r + 0.3) continue;
        var i = ny * m.W + nx;
        var s = r - d + (c.capital ? 0.3 : 0) + c.pop * 0.01;
        if (s > mejor[i]) { mejor[i] = s; m.dueno[i] = c.civ; m.ciudadDe[i] = c.id; }
      }
    });
    for (var i = 0; i < m.N; i++) if (m.ciudadDe[i] >= 0) porId[m.ciudadDe[i]].tiles.push(i);
    m.territorioVersion++;
  }
  SIM.recalcularTerritorio = recalcularTerritorio;

  function rendimientos(m, c) {
    var civ = m.civs[c.civ], F = 0, P = 0;
    for (var k = 0; k < c.tiles.length; k++) {
      var t = SIM.TERRENOS[m.mapa.tipo[c.tiles[k]]];
      F += t.comida + (t.agua && c.ed.puerto ? 0.75 : 0);
      P += t.prod;
    }
    if (c.ed.granja) F *= 1.3;
    F *= 1 + civ.era * 0.06;
    return {
      F: F,
      prod: (1 + P * 0.3 + c.pop * 0.35) * (c.ed.taller ? 1.3 : 1) * (c.ed.fabrica ? 1.5 : 1) * (1 + civ.era * 0.2),
      ciencia: (0.2 + c.pop * 0.05) * (c.ed.biblioteca ? 1.5 : 1) * (c.ed.universidad ? 1.3 : 1),
      oro: (0.2 + c.pop * 0.08) * (c.ed.mercado ? 1.6 : 1),
    };
  }
  SIM.rendimientos = rendimientos;

  function elegirCapital(m, civ) {
    var cs = SIM.ciudadesDe(m, civ.idx);
    if (!cs.length) return;
    cs.sort(function (a, b) { return b.pop - a.pop; });
    cs[0].capital = true;
    registrar(m, civ.idx, 'ciudad', '👑 Los ' + civ.nombre + ' mudan su capital a ' + cs[0].nombre);
  }

  function capturarCiudad(m, c, nuevo) {
    var viejo = c.civ, civV = m.civs[viejo], civN = m.civs[nuevo];
    if (c.ed.maravilla) {
      c.ed.maravilla = 0; civV.maravillaDesde = null;
      registrar(m, nuevo, 'maravilla', '💥 ¡La Maravilla de los ' + civV.nombre + ' en ' + c.nombre + ' fue destruida!');
    }
    var eraCapital = c.capital;
    c.civ = nuevo; c.pop = Math.max(1, c.pop * 0.7); c.ed.murallas = 0; c.cola = null; c.prog = 0; c.capital = false;
    c.hp = hpMaxCiudad(m, c) * 0.3; c.ultimoAtaque = m.turno;
    civN.victorias++;
    registrar(m, nuevo, 'conquista', '⚔ ¡Los ' + civN.nombre + ' conquistaron ' + c.nombre + ' (de los ' + civV.nombre + ')!');
    if (SIM.cargada) { SIM.cargada(m, nuevo, 'conquista'); SIM.cargada(m, viejo, 'perdida'); }
    if (eraCapital) elegirCapital(m, civV);
    recalcularTerritorio(m);
    SIM.emitir(m, 'ciudad_capturada', { civ: nuevo, ciudad: c, de: viejo, motivo: 'conquista' });
    if (!SIM.ciudadesDe(m, viejo).length) eliminarCiv(m, civV, civN);
    else encolarEvento(m, civV, { tipo: 'ciudad_perdida', otro: nuevo, ciudad: c.nombre }, 4);
  }

  function eliminarCiv(m, civ, porQuien) {
    civ.viva = false; civ.eventos = []; civ.mision = null; civ.maravillaDesde = null;
    m.unidades.forEach(function (u) { if (u.civ === civ.idx) u.muerta = true; });
    m.consejos = m.consejos.filter(function (k) { return k.civ !== civ.idx; });
    m.civs.forEach(function (o) { o.rel[civ.idx] = 'paz'; civ.rel[o.idx] = 'paz'; });
    registrar(m, porQuien.idx, 'eliminada', '💀 ¡Los ' + civ.nombre + ' fueron eliminados por los ' + porQuien.nombre + '!');
    SIM.emitir(m, 'civ_eliminada', { civ: civ.idx, por: porQuien.idx });
  }

  // ---------- unidades ----------
  function crearUnidad(m, civ, tipo, x, y) {
    var d = SIM.UNIDADES[tipo];
    var u = {
      id: nuevoId(m), civ: civ.idx, tipo: tipo, d: d, x: x, y: y, hp: d.hp, orden: null, camino: null, caminoDestino: -1,
      cd: 0, flash: 0, golpe: 0, embarcado: false, hogar: null, mision: false, municion: d.rol === 'aire' ? 3 : 0,
      esperaCamino: 0, enemigo: null, ultimoCombate: -99,
    };
    m.unidades.push(u);
    SIM.emitir(m, 'unidad_creada', { civ: civ.idx, unidad: u });
    return u;
  }

  function mejorUnidad(m, civ, rol) {
    var cands = [], maxEra = -1;
    for (var k in SIM.UNIDADES) {
      var d = SIM.UNIDADES[k];
      if (d.rol !== rol || d.era > civ.era || d.heroe) continue;
      if (d.civ && d.civ !== civ.clave) continue;
      if (d.era > maxEra) { maxEra = d.era; cands = [k]; } else if (d.era === maxEra) cands.push(k);
    }
    if (!cands.length) return null;
    return cands[Math.floor(m.rng() * cands.length)];
  }

  // ---------- caminos (A*) ----------
  function transitable(m, civ, rol, i) {
    var t = m.mapa.tipo[i];
    if (rol === 'aire') return true;
    if (rol === 'naval') return t === T.OCEANO || t === T.COSTA;
    if (t === T.MONTANA) return false;
    if (t === T.COSTA) return civ.era >= 1;
    if (t === T.OCEANO) return civ.era >= 3;
    return true;
  }
  SIM.transitable = transitable;

  // Regiones conectadas según qué puede cruzar cada tipo de unidad: permite descartar
  // al instante los caminos imposibles (por ejemplo, cruzar el océano antes de la era de la Pólvora).
  function calcularRegiones(m) {
    var W = m.W, H = m.H, tipo = m.mapa.tipo;
    function etiquetar(pasa) {
      var reg = new Int32Array(m.N).fill(-1), sig = 0, pila = [];
      for (var s = 0; s < m.N; s++) {
        if (reg[s] >= 0 || !pasa(tipo[s])) continue;
        reg[s] = sig; pila.push(s);
        while (pila.length) {
          var p = pila.pop(), px = p % W, py = (p - px) / W;
          if (px > 0 && reg[p - 1] < 0 && pasa(tipo[p - 1])) { reg[p - 1] = sig; pila.push(p - 1); }
          if (px < W - 1 && reg[p + 1] < 0 && pasa(tipo[p + 1])) { reg[p + 1] = sig; pila.push(p + 1); }
          if (py > 0 && reg[p - W] < 0 && pasa(tipo[p - W])) { reg[p - W] = sig; pila.push(p - W); }
          if (py < H - 1 && reg[p + W] < 0 && pasa(tipo[p + W])) { reg[p + W] = sig; pila.push(p + W); }
        }
        sig++;
      }
      return reg;
    }
    m.regiones = {
      tierra: etiquetar(function (t) { return !SIM.TERRENOS[t].agua && t !== T.MONTANA; }),
      costa: etiquetar(function (t) { return t !== T.OCEANO && t !== T.MONTANA; }),
      todo: etiquetar(function (t) { return t !== T.MONTANA; }),
      agua: etiquetar(function (t) { return SIM.TERRENOS[t].agua; }),
    };
  }

  function regionPara(m, civ, rol) {
    if (rol === 'aire') return null;
    if (rol === 'naval') return m.regiones.agua;
    if (civ.era >= 3) return m.regiones.todo;
    if (civ.era >= 1) return m.regiones.costa;
    return m.regiones.tierra;
  }

  var AS = null;
  function prepararAS(n) {
    if (AS && AS.n === n) return;
    AS = { n: n, g: new Float32Array(n), padre: new Int32Array(n), sello: new Uint32Array(n), cerrado: new Uint32Array(n), marca: 0 };
  }

  function Heap() { this.i = []; this.p = []; }
  Heap.prototype.push = function (i, p) {
    var a = this.i, b = this.p, k = a.length;
    a.push(i); b.push(p);
    while (k > 0) {
      var q = (k - 1) >> 1;
      if (b[q] <= b[k]) break;
      var ti = a[q]; a[q] = a[k]; a[k] = ti;
      var tp = b[q]; b[q] = b[k]; b[k] = tp;
      k = q;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.i, b = this.p, top = a[0], li = a.pop(), lp = b.pop();
    if (a.length) {
      a[0] = li; b[0] = lp;
      var k = 0, n = a.length;
      for (;;) {
        var l = 2 * k + 1, r = l + 1, s = k;
        if (l < n && b[l] < b[s]) s = l;
        if (r < n && b[r] < b[s]) s = r;
        if (s === k) break;
        var ti = a[s]; a[s] = a[k]; a[k] = ti;
        var tp = b[s]; b[s] = b[k]; b[k] = tp;
        k = s;
      }
    }
    return top;
  };

  var VECINOS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

  SIM.camino = function (m, civ, rol, desde, hasta) {
    if (desde === hasta) return [];
    if (!transitable(m, civ, rol, hasta)) return null;
    var reg = regionPara(m, civ, rol);
    if (reg && reg[desde] >= 0 && reg[desde] !== reg[hasta]) return null;
    prepararAS(m.N);
    AS.marca++;
    var W = m.W, marca = AS.marca, g = AS.g, padre = AS.padre, sello = AS.sello, cerrado = AS.cerrado;
    var hx = hasta % W, hy = (hasta - hx) / W;
    var h = new Heap();
    g[desde] = 0; sello[desde] = marca; padre[desde] = -1;
    h.push(desde, 0);
    var explorados = 0;
    while (h.i.length) {
      var cur = h.pop();
      if (cerrado[cur] === marca) continue;
      cerrado[cur] = marca;
      if (cur === hasta) break;
      if (++explorados > 4000) return null;
      var cx = cur % W, cy = (cur - cx) / W;
      var aguaCur = SIM.TERRENOS[m.mapa.tipo[cur]].agua;
      for (var v = 0; v < 8; v++) {
        var nx = cx + VECINOS[v][0], ny = cy + VECINOS[v][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= m.H) continue;
        var ni = ny * W + nx;
        if (cerrado[ni] === marca) continue;
        if (!transitable(m, civ, rol, ni)) continue;
        if (v >= 4 && (!transitable(m, civ, rol, cy * W + nx) || !transitable(m, civ, rol, ny * W + cx))) continue;
        var ter = SIM.TERRENOS[m.mapa.tipo[ni]], costo;
        if (rol === 'naval') costo = 1;
        else if (ter.agua) costo = aguaCur ? 1.2 : 5;   // embarcar cuesta
        else costo = ter.lento ? 1.6 : 1;
        var ng = g[cur] + costo * VECINOS[v][2];
        if (sello[ni] !== marca || ng < g[ni]) {
          sello[ni] = marca; g[ni] = ng; padre[ni] = cur;
          var dx = Math.abs(nx - hx), dy = Math.abs(ny - hy);
          h.push(ni, ng + Math.max(dx, dy) + 0.414 * Math.min(dx, dy));
        }
      }
    }
    if (cerrado[hasta] !== marca) return null;
    var res = [], p = hasta;
    while (p !== desde && p !== -1) { res.push(p); p = padre[p]; }
    res.reverse();
    return res;
  };

  function velocidad(m, u) {
    if (u.embarcado) return 0.1;
    var v = u.d.vel;
    if (m.civs[u.civ].clave === 'hunos' && u.d.rol !== 'naval' && u.d.rol !== 'aire') v *= 1.15;
    if (u.d.rol !== 'aire' && u.d.rol !== 'naval' && SIM.TERRENOS[m.mapa.tipo[tileDe(m, u)]].lento) v *= 0.7;
    return v;
  }

  // Devuelve true al llegar, false si sigue en camino, 'imposible' si no hay camino
  function moverHacia(m, u, tx, ty, tolerancia) {
    if (u.d.rol === 'aire') {
      var ddx = tx - u.x, ddy = ty - u.y, dd = Math.sqrt(ddx * ddx + ddy * ddy), va = velocidad(m, u);
      if (dd <= va) { u.x = tx; u.y = ty; return true; }
      u.x += ddx / dd * va; u.y += ddy / dd * va;
      return false;
    }
    var destino = ty * m.W + tx;
    var reusar = u.camino && u.caminoDestino >= 0 && (u.caminoDestino === destino ||
      (tolerancia && dist(u.caminoDestino % m.W, Math.floor(u.caminoDestino / m.W), tx, ty) <= tolerancia));
    if (!reusar) {
      if (u.esperaCamino > 0) { u.esperaCamino--; return false; }
      if (m.presupuesto <= 0) return false;
      m.presupuesto--;
      var c = SIM.camino(m, m.civs[u.civ], u.d.rol, tileDe(m, u), destino);
      if (!c) { u.esperaCamino = 25; u.camino = null; return 'imposible'; }
      u.camino = c; u.caminoDestino = destino;
    }
    if (!u.camino.length) return true;
    var sig = u.camino[0], sx = sig % m.W, sy = (sig - sx) / m.W;
    var dx = sx - u.x, dy = sy - u.y, d = Math.sqrt(dx * dx + dy * dy), v = velocidad(m, u);
    if (d <= v) { u.x = sx; u.y = sy; u.camino.shift(); } else { u.x += dx / d * v; u.y += dy / d * v; }
    if (u.d.rol !== 'naval') u.embarcado = SIM.TERRENOS[m.mapa.tipo[tileDe(m, u)]].agua;
    return u.camino.length === 0;
  }

  // ---------- combate ----------
  function alcance(u) { return u.d.rango ? u.d.rango + 0.3 : 1.5; }

  function heroeCerca(m, u) {
    var civ = m.civs[u.civ];
    if (!civ.heroeId || u.d.heroe) return false;
    var h = unidadPorId(m, civ.heroeId);
    return h && !h.muerta && dist(h.x, h.y, u.x, u.y) < 3.5;
  }

  function ataqueContra(m, a, b) {
    var atk = a.d.atk;
    if (heroeCerca(m, a)) atk *= 1.2;
    if (a.bendicionHasta > m.turno) atk *= 1.3;
    if (a.d.antiCaballo && b.d.caballo) atk *= 1.6;
    if (a.d.vsInfanteria && b.d.rol === 'melee' && !b.d.caballo) atk *= 1.3;
    if (a.d.antiAire && b.d.rol === 'aire') atk *= 1.6;
    if (a.d.rol === 'naval' && b.embarcado) atk *= 2;
    return atk;
  }

  function defensaDe(m, b) {
    var def = b.d.def;
    if (b.bendicionHasta > m.turno) def *= 1.2;
    if (b.embarcado) def *= 0.35;
    var i = tileDe(m, b);
    if (b.d.rol !== 'aire' && !b.embarcado && SIM.TERRENOS[m.mapa.tipo[i]].lento) def *= 1.15;
    if (m.dueno[i] === b.civ) def *= 1.1;
    return def;
  }

  function efecto(m, a, bx, by, tipo) {
    if (m.efectos.length < 250) m.efectos.push({ x1: a.x, y1: a.y, x2: bx, y2: by, t: 5, tipo: tipo });
  }

  // Fuego amigo: los disparos de lejos (asedio, barcos, aviones) a veces caen sobre los propios
  function fuegoAmigo(m, a, x, y) {
    if (!(a.d.rol === 'asedio' || a.d.rol === 'aire' || (a.d.rol === 'naval' && a.d.rango >= 2))) return null;
    if (m.rng() > 0.08) return null;
    for (var i = 0; i < m.unidades.length; i++) {
      var v = m.unidades[i];
      if (v === a || v.muerta || v.civ !== a.civ || dist(v.x, v.y, x, y) > 1.3) continue;
      var danio = 3 + a.d.atk * 0.15;
      v.hp -= danio; v.golpe = 4;
      efecto(m, a, v.x, v.y, a.d.rol === 'aire' ? 'bomba' : 'disparo');
      if (v.hp <= 0 && !v.muerta) { v.muerta = true; m.civs[v.civ].bajas++; }
      var civ = m.civs[a.civ];
      if (m.turno - (civ.ultimoFuegoAmigo || -99) > 60) {
        civ.ultimoFuegoAmigo = m.turno;
        registrar(m, a.civ, 'fuego', '💥 ¡Fuego amigo! ' + a.d.nombre + ' de los ' + civ.nombre + ' le pegaron a sus propias tropas');
      }
      return v;
    }
    return null;
  }

  function atacarUnidad(m, a, b) {
    if (a.cd > 0) return;
    if (fuegoAmigo(m, a, b.x, b.y)) { a.cd = SIM.TICKS_POR_TURNO; return; }
    var atk = ataqueContra(m, a, b), def = defensaDe(m, b);
    var p = atk * atk / (atk * atk + def * def);
    b.hp -= 8 * p * (0.75 + m.rng() * 0.5);
    a.cd = SIM.TICKS_POR_TURNO; a.flash = 3; b.golpe = 3;
    a.ultimoCombate = b.ultimoCombate = m.turno;
    efecto(m, a, b.x, b.y, a.d.rango ? 'disparo' : 'golpe');
    if (b.hp <= 0 && !b.muerta) { b.muerta = true; m.civs[b.civ].bajas++; SIM.emitir(m, 'unidad_muerta', { civ: b.civ, unidad: b, por: a.civ }); }
  }

  function atacarCiudad(m, a, c) {
    if (a.cd > 0) return;
    if (fuegoAmigo(m, a, c.x, c.y)) { a.cd = SIM.TICKS_POR_TURNO; return; }
    var atk = a.d.atk * (a.bendicionHasta > m.turno ? 1.3 : 1), def = defensaCiudad(m, c);
    var p = atk * atk / (atk * atk + def * def);
    c.hp = Math.max(0, c.hp - 8 * p * (0.75 + m.rng() * 0.5) * (a.d.vsCiudad || 1));
    c.ultimoAtaque = m.turno;
    if (c.hp <= 0 && c.ed.maravilla) {
      var duena = m.civs[c.civ];
      c.ed.maravilla = 0; duena.maravillaDesde = null;
      registrar(m, a.civ, 'maravilla', '💥 ¡Los ' + m.civs[a.civ].nombre + ' destruyeron la Maravilla de los ' + duena.nombre + ' en ' + c.nombre + '!');
    }
    a.cd = SIM.TICKS_POR_TURNO; a.flash = 3; a.ultimoCombate = m.turno;
    efecto(m, a, c.x, c.y, a.d.rol === 'aire' ? 'bomba' : (a.d.rango ? 'disparo' : 'golpe'));
  }

  // Grilla espacial: agrupa las unidades en celdas para buscar enemigos cercanos sin recorrer todo el mapa
  var CELDA = 4;
  function armarGrilla(m) {
    var GW = Math.ceil(m.W / CELDA), GH = Math.ceil(m.H / CELDA), k;
    if (!m.grilla || m.grilla.length !== GW * GH) {
      m.grilla = []; m.GW = GW; m.GH = GH;
      for (k = 0; k < GW * GH; k++) m.grilla.push([]);
    } else for (k = 0; k < m.grilla.length; k++) m.grilla[k].length = 0;
    for (var i = 0; i < m.unidades.length; i++) {
      var u = m.unidades[i];
      if (u.muerta) continue;
      var cx = Math.min(GW - 1, Math.max(0, Math.floor(u.x / CELDA)));
      var cy = Math.min(GH - 1, Math.max(0, Math.floor(u.y / CELDA)));
      m.grilla[cy * GW + cx].push(u);
    }
    m.hayGuerra = m.civs.map(function (c) { return c.viva && c.rel.indexOf('guerra') >= 0; });
  }

  function masCercanoEnGrilla(m, x, y, radio, acepta) {
    var mejor = null, md = radio * radio;
    var x0 = Math.max(0, Math.floor((x - radio) / CELDA)), x1 = Math.min(m.GW - 1, Math.floor((x + radio) / CELDA));
    var y0 = Math.max(0, Math.floor((y - radio) / CELDA)), y1 = Math.min(m.GH - 1, Math.floor((y + radio) / CELDA));
    for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) {
      var lista = m.grilla[cy * m.GW + cx];
      for (var k = 0; k < lista.length; k++) {
        var e = lista[k];
        if (e.muerta) continue;
        var dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
        if (d2 < md && acepta(e)) { md = d2; mejor = e; }
      }
    }
    return mejor;
  }

  function dispararCiudades(m) {
    m.ciudades.forEach(function (c) {
      if (c.hp <= 0 || !m.hayGuerra[c.civ]) return;
      var mejor = masCercanoEnGrilla(m, c.x, c.y, 2.6, function (u) { return SIM.enGuerra(m, c.civ, u.civ); });
      if (!mejor) return;
      var atk = defensaCiudad(m, c) * 0.75, def = defensaDe(m, mejor);
      var p = atk * atk / (atk * atk + def * def);
      mejor.hp -= 8 * p * (0.75 + m.rng() * 0.5);
      mejor.golpe = 3; mejor.ultimoCombate = m.turno;
      efecto(m, { x: c.x, y: c.y }, mejor.x, mejor.y, 'flecha');
      if (mejor.hp <= 0 && !mejor.muerta) { mejor.muerta = true; m.civs[mejor.civ].bajas++; }
    });
  }

  function enemigoCercano(m, u, radio) {
    if (!m.hayGuerra[u.civ]) return null;
    return masCercanoEnGrilla(m, u.x, u.y, radio, function (e) {
      if (e.civ === u.civ || !SIM.enGuerra(m, u.civ, e.civ)) return false;
      if (e.d.rol === 'aire' && !u.d.antiAire) return false;
      if (u.d.rol === 'naval' && e.d.rol !== 'naval' && !e.embarcado && !u.d.rango) return false;
      return true;
    });
  }

  function ciudadMasCercana(m, idx, x, y) {
    var mejor = null, md = Infinity;
    m.ciudades.forEach(function (c) {
      if (c.civ !== idx) return;
      var d = dist(c.x, c.y, x, y);
      if (d < md) { md = d; mejor = c; }
    });
    return mejor;
  }

  // ---------- comportamiento por tick ----------
  function actuarUnidad(m, u) {
    if (u.cd > 0) u.cd--;
    if (u.flash > 0) u.flash--;
    if (u.golpe > 0) u.golpe--;
    var rol = u.d.rol;
    if (rol === 'colono') return actuarColono(m, u);
    if (rol === 'aire') return actuarAvion(m, u);

    var moviendoManual = u.manual && u.orden && u.orden.tipo === 'ir';
    if (!u.embarcado && !moviendoManual && (m.tick + u.id) % 5 === 0) {
      var e0 = enemigoCercano(m, u, Math.max(alcance(u) + 0.5, 3.5));
      u.enemigo = e0 ? e0.id : null;
    }
    if (u.enemigo !== null && !u.embarcado && !moviendoManual) {
      var e = unidadPorId(m, u.enemigo);
      if (e && !e.muerta && SIM.enGuerra(m, u.civ, e.civ)) {
        var d = dist(u.x, u.y, e.x, e.y);
        if (d <= alcance(u)) { atacarUnidad(m, u, e); return; }
        if (rol !== 'asedio' && d <= 4.5) {
          var r0 = moverHacia(m, u, Math.round(e.x), Math.round(e.y), 1.5);
          if (r0 !== 'imposible') return;
        }
      }
      u.enemigo = null;
    }

    var o = u.orden;
    if (!o) return;
    if (o.tipo === 'ir') {
      var r1 = moverHacia(m, u, o.x, o.y);
      if (r1 === true || r1 === 'imposible') u.orden = null;
      return;
    }
    if (o.tipo === 'atacarUnidad') {
      var b = unidadPorId(m, o.unidad);
      if (!b || b.muerta || !SIM.enGuerra(m, u.civ, b.civ) || (b.d.rol === 'aire' && !u.d.antiAire)) { u.orden = null; return; }
      if (dist(u.x, u.y, b.x, b.y) <= alcance(u) && !u.embarcado) { atacarUnidad(m, u, b); return; }
      if (rol === 'naval' && !SIM.TERRENOS[m.mapa.tipo[tileDe(m, b)]].agua) { u.orden = null; return; }
      var r2 = moverHacia(m, u, Math.round(b.x), Math.round(b.y), 2);
      if (r2 === 'imposible') u.orden = null;
      return;
    }
    if (o.tipo === 'atacarCiudad') {
      var c = SIM.ciudadPorId(m, o.ciudad);
      if (!c || !SIM.enGuerra(m, u.civ, c.civ)) { u.orden = null; u.mision = false; return; }
      var dc = dist(u.x, u.y, c.x, c.y);
      if (dc <= alcance(u) && !u.embarcado) {
        if (c.hp > 0) { atacarCiudad(m, u, c); return; }
        if (rol === 'melee' || rol === 'distancia') {
          if (dc <= 1.5) { capturarCiudad(m, c, u.civ); u.orden = null; u.mision = false; }
          else moverHacia(m, u, c.x, c.y);
        }
        return;
      }
      var dest = rol === 'naval' ? c.agua : c.y * m.W + c.x;
      if (dest === null) { u.orden = null; u.mision = false; return; }
      var r3 = moverHacia(m, u, dest % m.W, Math.floor(dest / m.W));
      if (r3 === 'imposible') { u.orden = null; u.mision = false; }
    }
  }

  function actuarAvion(m, u) {
    var hogar = SIM.ciudadPorId(m, u.hogar);
    if (!hogar || hogar.civ !== u.civ) {
      hogar = ciudadMasCercana(m, u.civ, u.x, u.y);
      if (!hogar) { u.muerta = true; return; }
      u.hogar = hogar.id;
    }
    var o = u.orden;
    if (o && o.tipo === 'ir') {
      if (moverHacia(m, u, o.x, o.y) === true) {
        var cerca = u.municion >= 1 ? enemigoCercano(m, u, 3) : null;
        u.orden = cerca ? { tipo: 'atacarUnidad', unidad: cerca.id } : null;
      }
      return;
    }
    if (o && u.municion >= 1) {
      var tx, ty, ok = true, blanco = null;
      if (o.tipo === 'atacarCiudad') {
        blanco = SIM.ciudadPorId(m, o.ciudad);
        ok = blanco && SIM.enGuerra(m, u.civ, blanco.civ) && blanco.hp > 0;
      } else if (o.tipo === 'atacarUnidad') {
        blanco = unidadPorId(m, o.unidad);
        ok = blanco && !blanco.muerta && SIM.enGuerra(m, u.civ, blanco.civ);
      } else ok = false;
      if (ok) {
        tx = blanco.x; ty = blanco.y;
        if (dist(u.x, u.y, tx, ty) <= alcance(u)) {
          if (u.cd === 0) {
            if (o.tipo === 'atacarCiudad') atacarCiudad(m, u, blanco); else atacarUnidad(m, u, blanco);
            u.municion--;
          }
        } else moverHacia(m, u, tx, ty);
        return;
      }
      u.orden = null;
    }
    if (dist(u.x, u.y, hogar.x, hogar.y) > 0.2) moverHacia(m, u, hogar.x, hogar.y);
    else { u.orden = null; u.municion = Math.min(3, u.municion + 0.05); }
  }

  SIM.sitioValido = function (m, civ, x, y) { return sitioValido(m, civ, x, y); };
  function sitioValido(m, civ, x, y) {
    var i = y * m.W + x, t = m.mapa.tipo[i];
    if (SIM.TERRENOS[t].agua || t === T.MONTANA) return false;
    if (m.dueno[i] !== -1 && m.dueno[i] !== civ.idx) return false;
    for (var k = 0; k < m.ciudades.length; k++) if (dist(m.ciudades[k].x, m.ciudades[k].y, x, y) < 4) return false;
    return true;
  }

  function buscarSitio(m, civ, u) {
    var ux = Math.round(u.x), uy = Math.round(u.y), masaU = m.mapa.masa[uy * m.W + ux];
    var maxD = civ.era >= 3 ? 40 : (civ.era >= 1 ? 24 : 15);
    var reservados = [];
    m.unidades.forEach(function (o) { if (o !== u && o.civ === civ.idx && o.d.rol === 'colono' && o.orden) reservados.push(o.orden); });
    var mejores = [];
    for (var y = 1; y < m.H - 1; y += 2) {
      for (var x = 1; x < m.W - 1; x += 2) {
        var i = y * m.W + x, t = m.mapa.tipo[i];
        if (SIM.TERRENOS[t].agua || t === T.MONTANA || t === T.NIEVE) continue;
        var d = dist(ux, uy, x, y);
        if (d > maxD) continue;
        if (!sitioValido(m, civ, x, y)) continue;
        var ocupado = false;
        for (var r = 0; r < reservados.length; r++) if (dist(reservados[r].x, reservados[r].y, x, y) < 4) { ocupado = true; break; }
        if (ocupado) continue;
        var s = SIM.comidaAlrededor(m.mapa, x, y, 2) - d * 0.35 + (aguaAdyacente(m, x, y) !== null ? 2 : 0) - (m.mapa.masa[i] !== masaU ? 4 : 0);
        mejores.push([s, x, y]);
      }
    }
    mejores.sort(function (a, b) { return b[0] - a[0]; });
    for (var k = 0; k < Math.min(4, mejores.length); k++) {
      if (m.presupuesto <= 0) return 'esperar';
      m.presupuesto--;
      var cam = SIM.camino(m, civ, 'colono', tileDe(m, u), mejores[k][2] * m.W + mejores[k][1]);
      if (cam) return [mejores[k][1], mejores[k][2]];
    }
    return null;
  }

  function actuarColono(m, u) {
    var civ = m.civs[u.civ];
    if (!u.orden) {
      if ((m.tick + u.id) % 10 !== 0) return;
      var sitio = buscarSitio(m, civ, u);
      if (sitio === 'esperar') return;
      if (!sitio) {
        u.intentos = (u.intentos || 0) + 1;
        if (u.intentos > 3) {
          civ.sinSitioHasta = m.turno + 80;
          var c0 = ciudadMasCercana(m, civ.idx, u.x, u.y);
          if (c0) c0.pop += 1;
          u.muerta = true;
        }
        return;
      }
      u.orden = { tipo: 'fundar', x: sitio[0], y: sitio[1] };
      return;
    }
    var r = moverHacia(m, u, u.orden.x, u.orden.y);
    if (r === 'imposible') { u.orden = null; return; }
    if (r === true) {
      if (sitioValido(m, civ, u.orden.x, u.orden.y)) {
        fundarCiudad(m, civ, u.orden.x, u.orden.y, false);
        u.muerta = true;
        recalcularTerritorio(m);
      } else u.orden = null;
    }
  }

  // ---------- gobernador automático ----------
  function costoDe(civ, cola) {
    if (cola.tipo === 'edificio') return SIM.EDIFICIOS[cola.id].costo;
    var d = SIM.UNIDADES[cola.id];
    return d.costo * (civ.clave === 'aztecas' && d.rol !== 'colono' ? 0.8 : 1);
  }

  function itemValido(m, civ, c, item) {
    if (item.tipo === 'edificio') {
      var e = SIM.EDIFICIOS[item.id];
      return !c.ed[item.id] && e.era <= civ.era && (!e.costera || c.costera);
    }
    var d = SIM.UNIDADES[item.id];
    if (d.heroe || d.era > civ.era || (d.civ && d.civ !== civ.clave)) return false;
    if (d.rol === 'naval') return c.agua !== null;
    if (d.rol === 'aire') return !!c.ed.aerodromo;
    if (d.rol === 'colono') return c.pop >= 2;
    return true;
  }
  SIM.itemValido = itemValido;

  function elegirProduccion(m, civ, c) {
    while (c.colaUsuario && c.colaUsuario.length) {
      var pedido = c.colaUsuario.shift();
      if (itemValido(m, civ, c, pedido)) return { tipo: pedido.tipo, id: pedido.id, usuario: true };
    }
    var plan = civ.plan, era = civ.era, K = civ.cache;
    var enGuerra = K.enemigos.length > 0;
    var amenazada = m.turno - c.ultimoAtaque < 10 || K.amenazas.some(function (e) { return dist(e.x, e.y, c.x, c.y) < 7; });
    var capU = Math.floor(3 + K.ciudades * 1.5 + civ.popTotal * 0.12);
    var mult = { militar: 2.6, expansion: 0.9, economia: 1.1, ciencia: 1 }[plan.foco] || 1;
    var objetivoMil = Math.ceil(K.ciudades * mult * (enGuerra ? 1.8 : 1) + (plan.postura === 'ataque' && enGuerra ? 3 + era : 0) + 1);
    objetivoMil = Math.min(objetivoMil, capU);

    function ed(id) { return { tipo: 'edificio', id: id }; }
    function un(id) { return id ? { tipo: 'unidad', id: id } : null; }
    function tierra() {
      var ataque = era >= 1 && (plan.postura === 'ataque' || enGuerra);
      var desea = ataque ? { melee: 0.55, distancia: 0.3, asedio: 0.15 } : { melee: 0.6, distancia: 0.4, asedio: 0 };
      var total = K.porRol.melee + K.porRol.distancia + K.porRol.asedio + 1, mejor = 'melee', md = -Infinity;
      for (var r in desea) {
        if (!desea[r]) continue;
        var def = desea[r] * total - K.porRol[r];
        if (def > md) { md = def; mejor = r; }
      }
      return un(mejorUnidad(m, civ, mejor) || mejorUnidad(m, civ, 'melee'));
    }

    if (amenazada) {
      if (!c.ed.murallas) return ed('murallas');
      if (K.mil < capU + 2) return tierra();
    }
    if (K.mil < K.ciudades) return tierra();
    if (plan.maravilla && c.capital && era >= 3 && !c.ed.maravilla && civ.maravillaDesde === null && !amenazada) return ed('maravilla');
    var maxCiudades = plan.foco === 'expansion' ? 16 : 4 + Math.round(civ.datos.personalidad.expansion * 5);
    if (K.ciudades + K.colonos < maxCiudades && K.colonos < (plan.foco === 'expansion' ? 2 : 1) &&
        c.pop >= 3 && m.turno >= civ.sinSitioHasta) return un('colono');
    if (plan.armada && c.costera && era >= 1) {
      if (!c.ed.puerto) return ed('puerto');
      if (K.navales < Math.ceil(K.costeras * 1.2) + 1) return un(mejorUnidad(m, civ, 'naval'));
    }
    if (plan.aire && era >= 5) {
      if (!c.ed.aerodromo && (c.capital || c.pop >= 9)) return ed('aerodromo');
      if (c.ed.aerodromo && K.aereos < K.aerodromos * 3) return un(mejorUnidad(m, civ, 'aire'));
    }
    if (K.mil < objetivoMil) return tierra();
    var orden = {
      expansion: ['granja', 'taller', 'murallas', 'mercado', 'biblioteca', 'puerto', 'universidad', 'fabrica'],
      economia:  ['granja', 'taller', 'mercado', 'puerto', 'fabrica', 'biblioteca', 'universidad'],
      ciencia:   ['biblioteca', 'granja', 'universidad', 'taller', 'mercado', 'puerto', 'fabrica'],
      militar:   ['taller', 'murallas', 'granja', 'fabrica', 'puerto', 'mercado', 'biblioteca'],
    }[plan.foco];
    if (plan.murallas) orden = ['murallas'].concat(orden);
    for (var k = 0; k < orden.length; k++) {
      var id = orden[k], e = SIM.EDIFICIOS[id];
      if (c.ed[id] || e.era > era) continue;
      if (e.costera && !c.costera) continue;
      if (id === 'puerto' && !plan.armada && c.pop < 6) continue;
      return ed(id);
    }
    if (enGuerra && K.mil < capU) return tierra();
    if (K.mil < Math.min(capU, objetivoMil + 2) && m.rng() < 0.3) return tierra();
    return null;
  }

  function completar(m, civ, c, cola) {
    if (cola.tipo === 'unidad') {
      var d = SIM.UNIDADES[cola.id], x = c.x, y = c.y;
      if (d.rol === 'naval') {
        if (c.agua === null) return;
        x = c.agua % m.W; y = Math.floor(c.agua / m.W);
      }
      if (d.rol === 'colono') c.pop = Math.max(1, c.pop - 1);
      var u = crearUnidad(m, civ, cola.id, x, y);
      u.hogar = c.id;
      if (d.civ) {
        civ.primeraUnica = civ.primeraUnica || false;
        if (!civ.primeraUnica) { civ.primeraUnica = true; registrar(m, civ.idx, 'unidad', '⭐ Los ' + civ.nombre + ' entrenan su unidad única: ' + d.nombre + ' ' + d.icono); }
      }
      if ((d.rol === 'aire' || d.rol === 'naval') && !civ['primer_' + d.rol]) {
        civ['primer_' + d.rol] = true;
        registrar(m, civ.idx, 'unidad', (d.rol === 'aire' ? '✈ ' : '⛵ ') + 'Los ' + civ.nombre + ' tienen sus primeros ' + d.nombre);
      }
      return;
    }
    c.ed[cola.id] = 1;
    SIM.emitir(m, 'edificio', { civ: civ.idx, ciudad: c, edificio: cola.id });
    if (cola.id === 'maravilla') {
      civ.maravillaDesde = m.turno;
      registrar(m, civ.idx, 'maravilla', '🏛 ¡Los ' + civ.nombre + ' terminaron una Maravilla en ' + c.nombre + '! Si la mantienen ' + SIM.TURNOS_MARAVILLA + ' turnos, ganan.');
      m.civs.forEach(function (o) { if (o.viva && o !== civ) encolarEvento(m, o, { tipo: 'maravilla_rival', otro: civ.idx }, 4); });
    }
  }

  function produccion(m, civ, c, P) {
    if (!c.cola) c.cola = elegirProduccion(m, civ, c);
    if (!c.cola) { civ.oro += P * 0.12; return; }
    var costo = costoDe(civ, c.cola);
    c.prog += P * (c.cola.tipo === 'edificio' && civ.clave === 'espanoles' ? 1.3 : 1);
    if (c.prog < costo && c.cola.tipo === 'unidad' && m.turno - c.ultimoAtaque < 5 && civ.oro >= (costo - c.prog) * 2) {
      civ.oro -= (costo - c.prog) * 2; c.prog = costo;
    }
    // Las IAs también gastan el oro que les sobra para acelerar la producción
    if (c.prog < costo && civ.control !== 'humano' && civ.oro > 500 + civ.era * 150 && m.rng() < 0.12) {
      var falta = (costo - c.prog) * 2;
      if (civ.oro - falta > 300) { civ.oro -= falta; c.prog = costo; }
    }
    if (c.prog >= costo) {
      c.prog = Math.min(c.prog - costo, 15);
      var cola = c.cola; c.cola = null;
      completar(m, civ, c, cola);
    }
  }

  function elegirCiudadObjetivo(m, civ, objetivo, desde) {
    var cands = m.ciudades.filter(function (c) { return c.civ === objetivo; });
    cands.sort(function (a, b) {
      if (!!a.ed.maravilla !== !!b.ed.maravilla) return a.ed.maravilla ? -1 : 1;   // la Maravilla primero
      return dist(a.x, a.y, desde.x, desde.y) - dist(b.x, b.y, desde.x, desde.y);
    });
    for (var k = 0; k < Math.min(3, cands.length); k++) {
      if (m.presupuesto <= 0) return 'esperar';
      m.presupuesto--;
      if (SIM.camino(m, civ, 'melee', tileDe(m, desde), cands[k].y * m.W + cands[k].x)) return cands[k];
    }
    return null;
  }

  function gobernar(m, civ) {
    var mis = [], ciudades = SIM.ciudadesDe(m, civ.idx);
    var K = { mil: 0, colonos: 0, navales: 0, aereos: 0, porRol: { melee: 0, distancia: 0, asedio: 0 },
      ciudades: ciudades.length, costeras: 0, aerodromos: 0, enemigos: enemigosDe(m, civ), amenazas: [] };
    m.unidades.forEach(function (u) {
      if (u.civ !== civ.idx || u.muerta) return;
      mis.push(u);
      var r = u.d.rol;
      if (r === 'colono') K.colonos++;
      else {
        K.mil++;
        if (r === 'naval') K.navales++; else if (r === 'aire') K.aereos++; else K.porRol[r]++;
      }
    });
    civ.popTotal = 0;
    ciudades.forEach(function (c) { civ.popTotal += c.pop; if (c.costera) K.costeras++; if (c.ed.aerodromo) K.aerodromos++; });
    if (K.enemigos.length) {
      K.amenazas = m.unidades.filter(function (e) {
        if (e.muerta || K.enemigos.indexOf(e.civ) < 0 || e.d.rol === 'aire') return false;
        if (m.dueno[tileDe(m, e)] === civ.idx) return true;
        for (var k = 0; k < ciudades.length; k++) if (dist(ciudades[k].x, ciudades[k].y, e.x, e.y) < 6) return true;
        return false;
      });
    }
    civ.cache = K;
    poderesAutomaticos(m, civ, K);

    var terrestres = mis.filter(function (u) { return u.d.rol !== 'colono' && u.d.rol !== 'naval' && u.d.rol !== 'aire'; });

    // Defensa: mandar a los más cercanos contra los invasores
    K.amenazas.slice(0, 8).forEach(function (e) {
      var libres = terrestres.filter(function (u) { return !u.manual && !u.mision && (!u.orden || u.orden.tipo === 'ir'); });
      libres.sort(function (a, b) { return dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y); });
      libres.slice(0, 3).forEach(function (u) { u.orden = { tipo: 'atacarUnidad', unidad: e.id }; });
    });

    // Ataque
    if (civ.mision) {
      var cm = SIM.ciudadPorId(m, civ.mision.ciudad);
      if (!cm || !SIM.enGuerra(m, civ.idx, cm.civ) || m.turno - civ.mision.desde > 300) civ.mision = null;
    }
    if (civ.plan.postura === 'ataque' && K.enemigos.length) {
      var obj = K.enemigos.indexOf(civ.plan.objetivo) >= 0 ? civ.plan.objetivo : K.enemigos[0];
      var disp = terrestres.filter(function (u) { return !u.manual && !u.mision && (!u.orden || u.orden.tipo === 'ir'); });
      var guardia = {};
      ciudades.forEach(function (c) {
        var mejor = null, md = 3;
        disp.forEach(function (u) { var d = dist(u.x, u.y, c.x, c.y); if (d < md && !guardia[u.id]) { md = d; mejor = u; } });
        if (mejor) guardia[mejor.id] = true;
      });
      disp = disp.filter(function (u) { return !guardia[u.id]; });
      if (!civ.mision && disp.length >= 3 + civ.era && m.turno >= (civ.sinObjetivoHasta || 0)) {
        var cap = ciudades.filter(function (c) { return c.capital; })[0] || ciudades[0];
        var blanco = cap ? elegirCiudadObjetivo(m, civ, obj, cap) : null;
        if (blanco && blanco !== 'esperar') {
          civ.mision = { ciudad: blanco.id, desde: m.turno };
          registrar(m, civ.idx, 'ataque', '⚔ Los ' + civ.nombre + ' marchan sobre ' + blanco.nombre + ' con ' + disp.length + ' unidades');
        } else if (!blanco) civ.sinObjetivoHasta = m.turno + 40;
      }
      if (civ.mision && (disp.length >= 2 || civ.mision.desde === m.turno)) {
        disp.forEach(function (u) { u.orden = { tipo: 'atacarCiudad', ciudad: civ.mision.ciudad }; u.mision = true; });
      }
    } else if (civ.mision) {
      civ.mision = null;
    }
    if (!civ.mision) mis.forEach(function (u) { if (u.mision) { u.mision = false; if (u.orden && u.orden.tipo === 'atacarCiudad' && u.d.rol !== 'aire') u.orden = null; } });

    // Flota
    mis.forEach(function (u) {
      if (u.d.rol !== 'naval' || u.orden || u.manual) return;
      if (K.enemigos.length) {
        var e = null, md = 14;
        m.unidades.forEach(function (x) {
          if (x.muerta || K.enemigos.indexOf(x.civ) < 0 || (x.d.rol !== 'naval' && !x.embarcado)) return;
          var d = dist(x.x, x.y, u.x, u.y); if (d < md) { md = d; e = x; }
        });
        if (e) { u.orden = { tipo: 'atacarUnidad', unidad: e.id }; return; }
        if (civ.mision) {
          var c = SIM.ciudadPorId(m, civ.mision.ciudad);
          if (c && c.costera) { u.orden = { tipo: 'atacarCiudad', ciudad: c.id }; return; }
        }
      }
      if (m.rng() < 0.05) {
        var h = SIM.ciudadPorId(m, u.hogar) || ciudadMasCercana(m, civ.idx, u.x, u.y);
        if (h && h.agua !== null) {
          var ax = h.agua % m.W + Math.floor(m.rng() * 7) - 3, ay = Math.floor(h.agua / m.W) + Math.floor(m.rng() * 7) - 3;
          if (ax >= 0 && ay >= 0 && ax < m.W && ay < m.H && SIM.TERRENOS[m.mapa.tipo[ay * m.W + ax]].agua) u.orden = { tipo: 'ir', x: ax, y: ay };
        }
      }
    });

    // Aviones
    mis.forEach(function (u) {
      if (u.d.rol !== 'aire' || u.orden || u.manual || u.municion < 2 || !K.enemigos.length) return;
      var h = SIM.ciudadPorId(m, u.hogar);
      if (!h) return;
      if (u.d.antiAire) {
        var e = null, md = u.d.alcance;
        m.unidades.forEach(function (x) {
          if (x.muerta || K.enemigos.indexOf(x.civ) < 0) return;
          var d = dist(x.x, x.y, h.x, h.y); if (d < md) { md = d; e = x; }
        });
        if (e) u.orden = { tipo: 'atacarUnidad', unidad: e.id };
        return;
      }
      var blanco = null, mb = u.d.alcance;
      m.ciudades.forEach(function (c) {
        if (K.enemigos.indexOf(c.civ) < 0 || c.hp <= 0) return;
        var d = dist(c.x, c.y, h.x, h.y);
        if (civ.mision && c.id === civ.mision.ciudad) d -= 6;
        if (d < mb) { mb = d; blanco = c; }
      });
      if (blanco) u.orden = { tipo: 'atacarCiudad', ciudad: blanco.id };
    });

    // Unidades ociosas: volver cerca de casa y patrullar
    terrestres.forEach(function (u) {
      if (u.orden || u.mision || u.manual || u.enemigo !== null) return;
      var c = ciudadMasCercana(m, civ.idx, u.x, u.y);
      if (!c) return;
      var d = dist(u.x, u.y, c.x, c.y);
      if (d > 3 || m.rng() < 0.04) {
        var ox = Math.max(0, Math.min(m.W - 1, c.x + Math.floor(m.rng() * 5) - 2));
        var oy = Math.max(0, Math.min(m.H - 1, c.y + Math.floor(m.rng() * 5) - 2));
        if (SIM.transitable(m, civ, 'melee', oy * m.W + ox) && !SIM.TERRENOS[m.mapa.tipo[oy * m.W + ox]].agua) u.orden = { tipo: 'ir', x: ox, y: oy };
      }
    });
  }

  // ---------- comprar con oro ----------
  SIM.costoCompra = function (m, c) {
    if (!c.cola) return null;
    return Math.ceil(Math.max(0, costoDe(m.civs[c.civ], c.cola) - c.prog) * 2);
  };
  SIM.comprar = function (m, c) {
    var civ = m.civs[c.civ], costo = SIM.costoCompra(m, c);
    if (costo === null || civ.oro < costo) return false;
    civ.oro -= costo;
    c.prog = costoDe(civ, c.cola);
    return true;
  };
  SIM.costoDe = function (m, c, item) { return costoDe(m.civs[c.civ], item); };

  // ---------- poderes de Dios ----------
  SIM.recargaPoder = function (m, idx, tipo) {
    var civ = m.civs[idx];
    return Math.max(0, (civ.recargas[tipo] || 0) - m.turno);
  };

  SIM.usarPoder = function (m, idx, tipo, x, y) {
    var civ = m.civs[idx], P = SIM.PODERES[tipo];
    if (!civ.viva || !P) return { ok: false, motivo: 'No se puede' };
    if (SIM.recargaPoder(m, idx, tipo) > 0) return { ok: false, motivo: P.nombre + ' se está recargando' };
    var victimas = {}, lugar = null, md = Infinity;
    m.ciudades.forEach(function (c) { var d = dist(c.x, c.y, x, y); if (d < md) { md = d; lugar = c; } });
    var cerca = lugar && md < 8 ? ' cerca de ' + lugar.nombre : '';
    function daniarUnidades(radio, danio) {
      m.unidades.forEach(function (u) {
        if (u.muerta || u.civ === idx || dist(u.x, u.y, x, y) > radio) return;
        u.hp -= danio; u.golpe = 5; victimas[u.civ] = true;
        if (u.hp <= 0 && !u.muerta) { u.muerta = true; m.civs[u.civ].bajas++; SIM.emitir(m, 'unidad_muerta', { civ: u.civ, unidad: u, por: idx }); }
      });
    }
    function ciudadesEn(radio, propias) {
      return m.ciudades.filter(function (c) { return dist(c.x, c.y, x, y) <= radio && (propias ? c.civ === idx : c.civ !== idx); });
    }
    if (tipo === 'rayo') {
      daniarUnidades(P.radio, 18);
      ciudadesEn(1, false).forEach(function (c) { c.hp = Math.max(0, c.hp - SIM.hpMaxCiudad(m, c) * 0.25); c.ultimoAtaque = m.turno; victimas[c.civ] = true; });
    } else if (tipo === 'lluvia') {
      var cs = ciudadesEn(1.6, true);
      if (!cs.length) return { ok: false, motivo: 'La lluvia bendita va sobre una ciudad tuya' };
      cs[0].pop += 2; cs[0].hp = SIM.hpMaxCiudad(m, cs[0]); cerca = ' sobre ' + cs[0].nombre;
    } else if (tipo === 'bendicion') {
      var n = 0;
      m.unidades.forEach(function (u) {
        if (u.muerta || u.civ !== idx || dist(u.x, u.y, x, y) > P.radio) return;
        u.hp = u.d.hp; u.bendicionHasta = m.turno + 30; n++;
      });
      if (!n) return { ok: false, motivo: 'No hay tropas tuyas en esa zona' };
    } else if (tipo === 'terremoto') {
      daniarUnidades(P.radio, 8);
      ciudadesEn(P.radio, false).forEach(function (c) {
        c.hp = Math.max(0, c.hp - SIM.hpMaxCiudad(m, c) * 0.5); c.ed.murallas = 0; c.pop = Math.max(1, c.pop - 1);
        c.ultimoAtaque = m.turno; victimas[c.civ] = true;
      });
    } else if (tipo === 'intriga') {
      var blancos = ciudadesEn(1.6, false).filter(function (c) { return !c.capital; });
      if (!blancos.length) return { ok: false, motivo: 'La intriga va sobre una ciudad enemiga que no sea capital' };
      var bl = blancos[0];
      if (bl.intriga) return { ok: false, motivo: 'Ya hay una espía trabajando en ' + bl.nombre };
      SIM.iniciarIntriga(m, bl, idx, true);
      cerca = ' a ' + bl.nombre;
    } else if (tipo === 'peste') {
      var afectadas = ciudadesEn(P.radio, false);
      if (!afectadas.length) return { ok: false, motivo: 'No hay ciudades enemigas en esa zona' };
      afectadas.forEach(function (c) { c.pop = Math.max(1, c.pop * 0.65); victimas[c.civ] = true; });
    }
    civ.recargas[tipo] = m.turno + P.recarga;
    if (m.efectos.length < 280) m.efectos.push({ x1: x, y1: y, x2: x, y2: y, t: 5, tipo: tipo, radio: P.radio });
    registrar(m, idx, 'poder', tipo === 'intriga' ? '🕵 Los ' + civ.nombre + ' mandaron una espía' + cerca : P.icono + ' Los ' + civ.nombre + ' invocaron ' + P.articulo + ' ' + P.nombre + cerca);
    // Si le cae a alguien con quien estaban en paz, se enojan
    Object.keys(victimas).forEach(function (k) {
      var o = m.civs[+k];
      if (o.viva && o.rel[idx] !== 'guerra') encolarEvento(m, o, { tipo: 'oportunidad', otro: idx }, 4);
    });
    SIM.emitir(m, 'poder', { civ: idx, tipo: tipo, x: x, y: y, ciudad: lugar && md < 2 ? lugar.id : null, victimas: Object.keys(victimas).map(Number) });
    return { ok: true };
  };

  // Las civilizaciones que no maneja el jugador usan poderes con reglas simples
  function poderesAutomaticos(m, civ, K) {
    if (civ.control === 'humano' && !m.pilotoAutomatico) return;
    if (m.rng() > 0.25) return;
    function listo(t) { return SIM.recargaPoder(m, civ.idx, t) === 0; }
    if (K.amenazas.length >= 3 && listo('rayo')) {
      var e = K.amenazas[Math.floor(m.rng() * K.amenazas.length)];
      SIM.usarPoder(m, civ.idx, 'rayo', e.x, e.y); return;
    }
    if (civ.mision && listo('bendicion')) {
      var obj = SIM.ciudadPorId(m, civ.mision.ciudad);
      if (obj) {
        var cerca = m.unidades.filter(function (u) { return u.civ === civ.idx && !u.muerta && u.mision && dist(u.x, u.y, obj.x, obj.y) < 5; });
        if (cerca.length >= 4) { SIM.usarPoder(m, civ.idx, 'bendicion', cerca[0].x, cerca[0].y); return; }
      }
    }
    if (K.enemigos.length && m.rng() < 0.15) {
      var enemigas = m.ciudades.filter(function (c) { return K.enemigos.indexOf(c.civ) >= 0; });
      if (enemigas.length) {
        enemigas.sort(function (a, b) { return (b.ed.maravilla ? 100 : 0) + b.pop - (a.ed.maravilla ? 100 : 0) - a.pop; });
        var c = enemigas[0];
        if (listo('terremoto') && m.rng() < 0.5) { SIM.usarPoder(m, civ.idx, 'terremoto', c.x, c.y); return; }
        var sinCapital = enemigas.filter(function (x) { return !x.capital && !x.intriga; });
        if (listo('intriga') && sinCapital.length && m.rng() < 0.5) { var bl = sinCapital[Math.floor(m.rng() * sinCapital.length)]; SIM.usarPoder(m, civ.idx, 'intriga', bl.x, bl.y); return; }
        if (listo('peste')) { SIM.usarPoder(m, civ.idx, 'peste', c.x, c.y); return; }
      }
    }
    if (listo('lluvia') && m.rng() < 0.2) {
      var mias = SIM.ciudadesDe(m, civ.idx);
      if (mias.length) { var chica = mias[Math.floor(m.rng() * mias.length)]; SIM.usarPoder(m, civ.idx, 'lluvia', chica.x, chica.y); }
    }
  }

  // ---------- intrigas y traiciones ----------
  var LEYENDAS = [
    'una espía seduce al gobernador, como Dalila con Sansón',
    'la corte se llena de intrigas, como en los últimos años del rey Salomón',
    'un general ambicioso negocia en secreto con el enemigo',
    'los nobles de la ciudad cobran sobornos del enemigo',
  ];
  SIM.iniciarIntriga = function (m, c, porIdx, espia) {
    var victima = m.civs[c.civ];
    c.intriga = { por: porIdx, hasta: m.turno + 45, texto: LEYENDAS[Math.floor(m.rng() * LEYENDAS.length)], espia: !!espia };
    encolarEvento(m, victima, { tipo: 'traicion', ciudad: c.id, otro: porIdx }, 6);
  };

  SIM.costoLealtad = function (m, c) { return Math.round(40 + c.pop * 12 + m.civs[c.civ].era * 30); };

  function revisarIntrigas(m) {
    // Rumores nuevos: los imperios grandes o en guerra tienen más traidores
    if (m.turno % 10 === 0) {
      m.civs.forEach(function (civ) {
        if (!civ.viva || m.turno < 150) return;
        var cs = SIM.ciudadesDe(m, civ.idx).filter(function (c) { return !c.capital && !c.intriga; });
        if (cs.length < 3) return;
        var enGuerra = enemigosDe(m, civ).length > 0;
        var prob = 0.012 * (cs.length / 4) * (enGuerra ? 1.6 : 1);
        if (m.rng() > prob) return;
        var cap = SIM.ciudadesDe(m, civ.idx).filter(function (c) { return c.capital; })[0] || cs[0];
        cs.sort(function (a, b) { return dist(b.x, b.y, cap.x, cap.y) - dist(a.x, a.y, cap.x, cap.y); });
        var c = cs[Math.floor(m.rng() * Math.min(3, cs.length))];
        // Quién la tienta: un enemigo si hay guerra, si no el vecino más cercano
        var por = null, md = Infinity;
        m.civs.forEach(function (o) {
          if (o === civ || !o.viva) return;
          var cerca = Infinity;
          m.ciudades.forEach(function (x) { if (x.civ === o.idx) cerca = Math.min(cerca, dist(x.x, x.y, c.x, c.y)); });
          if (civ.rel[o.idx] === 'guerra') cerca *= 0.5;
          if (cerca < md) { md = cerca; por = o.idx; }
        });
        if (por !== null && md < 30) SIM.iniciarIntriga(m, c, por, false);
      });
    }
    // Intrigas que se cumplen
    m.ciudades.slice().forEach(function (c) {
      if (!c.intriga || m.turno < c.intriga.hasta) return;
      var it = c.intriga; c.intriga = null;
      var nuevo = m.civs[it.por], viejo = m.civs[c.civ];
      if (!nuevo.viva || c.capital || m.rng() > 0.6) {
        registrar(m, c.civ, 'traicion', '🕵 Los rumores de traición en ' + c.nombre + ' (' + viejo.nombre + ') se apagaron solos');
        return;
      }
      // La ciudad se pasa de bando, y las tropas que estaban adentro también
      var tropas = 0;
      m.unidades.forEach(function (u) {
        if (u.muerta || u.civ !== c.civ || u.d.rol === 'colono' || dist(u.x, u.y, c.x, c.y) > 2) return;
        u.civ = it.por; u.orden = null; u.mision = false; u.manual = false; u.camino = null; tropas++;
      });
      registrar(m, it.por, 'traicion', '🗡 ¡TRAICIÓN! ' + c.nombre + ' abandona a los ' + viejo.nombre + ' y se pasa a los ' + nuevo.nombre + (tropas ? ' con ' + tropas + ' unidades' : '') + ' (' + it.texto + ')');
      var eraCap = c.capital;
      c.civ = it.por; c.cola = null; c.colaUsuario = []; c.prog = 0;
      if (c.ed.maravilla) { c.ed.maravilla = 0; viejo.maravillaDesde = null; }
      if (eraCap) { c.capital = false; elegirCapital(m, viejo); }
      recalcularTerritorio(m);
      SIM.emitir(m, 'ciudad_capturada', { civ: it.por, ciudad: c, de: viejo.idx, motivo: 'traicion' });
      if (!SIM.ciudadesDe(m, viejo.idx).length) eliminarCiv(m, viejo, nuevo);
      else encolarEvento(m, viejo, { tipo: 'ciudad_perdida', otro: it.por, ciudad: c.nombre }, 4);
    });
  }

  SIM.resolverIntriga = function (m, cId, accion) {
    var c = SIM.ciudadPorId(m, cId);
    if (!c || !c.intriga) return;
    var civ = m.civs[c.civ];
    if (accion === 'pagar') {
      var costo = SIM.costoLealtad(m, c);
      if (civ.oro < costo) { registrar(m, c.civ, 'traicion', '🕵 Los ' + civ.nombre + ' no tenían oro para asegurar ' + c.nombre); return; }
      civ.oro -= costo; c.intriga = null;
      registrar(m, c.civ, 'traicion', '💰 Los ' + civ.nombre + ' compraron la lealtad de ' + c.nombre + ' (' + costo + ' de oro)');
    } else if (accion === 'arrestar') {
      c.intriga = null; c.pop = Math.max(1, c.pop * 0.8);
      registrar(m, c.civ, 'traicion', '⛓ Los ' + civ.nombre + ' arrestaron a los traidores de ' + c.nombre);
    }
  };

  // ---------- diplomacia ----------
  SIM.declararGuerra = function (m, a, b) {
    var A = m.civs[a], B = m.civs[b];
    if (a === b || !A.viva || !B.viva || A.rel[b] === 'guerra' || A.tregua[b] > m.turno) return false;
    A.rel[b] = B.rel[a] = 'guerra';
    A.amigos[b] = B.amigos[a] = false;
    A.guerraDesde[b] = B.guerraDesde[a] = m.turno;
    A.conoce[b] = B.conoce[a] = true;
    registrar(m, a, 'guerra', '⚔ ¡Los ' + A.nombre + ' le declararon la guerra a los ' + B.nombre + '!');
    if (SIM.cargada) SIM.cargada(m, a, 'guerra');
    encolarEvento(m, B, { tipo: 'guerra_recibida', otro: a }, 5);
    SIM.emitir(m, 'guerra', { civ: a, otro: b });
    return true;
  };

  SIM.hacerPaz = function (m, a, b) {
    var A = m.civs[a], B = m.civs[b];
    if (A.rel[b] !== 'guerra') return false;
    A.rel[b] = B.rel[a] = 'paz';
    A.tregua[b] = B.tregua[a] = m.turno + 80;
    [A, B].forEach(function (X) {
      if (X.mision) { var c = SIM.ciudadPorId(m, X.mision.ciudad); if (c && (c.civ === a || c.civ === b)) X.mision = null; }
      X.eventos = X.eventos.filter(function (e) { return !(e.otro === (X === A ? b : a) && (e.tipo === 'propuesta_paz' || e.tipo === 'guerra_recibida' || e.tipo === 'ciudad_perdida')); });
    });
    registrar(m, a, 'paz', '🕊 Los ' + A.nombre + ' y los ' + B.nombre + ' firmaron la paz');
    if (SIM.cargada) SIM.cargada(m, m.rng() < 0.5 ? a : b, 'paz');
    SIM.emitir(m, 'paz', { civ: a, otro: b });
    return true;
  };

  SIM.proponerPaz = function (m, a, b) {
    var A = m.civs[a], B = m.civs[b];
    if (A.rel[b] !== 'guerra' || !B.viva) return false;
    registrar(m, a, 'diplomacia', '🕊 Los ' + A.nombre + ' les proponen la paz a los ' + B.nombre);
    encolarEvento(m, B, { tipo: 'propuesta_paz', otro: a }, 6);
    return true;
  };

  function detectarContactos(m) {
    var vivas = m.civs.filter(function (c) { return c.viva; });
    for (var i = 0; i < vivas.length; i++) for (var j = i + 1; j < vivas.length; j++) {
      var A = vivas[i], B = vivas[j];
      if (A.conoce[B.idx]) continue;
      var cerca = false;
      for (var a = 0; a < m.ciudades.length && !cerca; a++) {
        var ca = m.ciudades[a];
        if (ca.civ !== A.idx && ca.civ !== B.idx) continue;
        var otra = ca.civ === A.idx ? B.idx : A.idx;
        for (var b = 0; b < m.ciudades.length; b++) {
          var cb = m.ciudades[b];
          if (cb.civ === otra && dist(ca.x, ca.y, cb.x, cb.y) < 18) { cerca = true; break; }
        }
        if (cerca) break;
        for (var u = 0; u < m.unidades.length; u++) {
          var un = m.unidades[u];
          if (un.civ === otra && !un.muerta && dist(un.x, un.y, ca.x, ca.y) < 8) { cerca = true; break; }
        }
      }
      if (cerca) {
        A.conoce[B.idx] = B.conoce[A.idx] = true;
        registrar(m, A.idx, 'contacto', '🤝 Los ' + A.nombre + ' y los ' + B.nombre + ' se encontraron por primera vez');
        encolarEvento(m, A, { tipo: 'contacto', otro: B.idx }, 3);
        encolarEvento(m, B, { tipo: 'contacto', otro: A.idx }, 3);
      }
    }
  }

  function comprobarVictoria(m) {
    if (m.fin) return;
    var vivas = m.civs.filter(function (c) { return c.viva; });
    function terminar(idx, motivo) {
      m.fin = { ganador: idx, motivo: motivo, turno: m.turno };
      var textos = { conquista: 'por conquista', maravilla: 'por su Maravilla', puntaje: 'por puntaje en el año 2050' };
      registrar(m, idx, 'fin', '🏆 ¡Ganaron los ' + m.civs[idx].nombre + ' ' + textos[motivo] + '!');
      SIM.emitir(m, 'fin', { civ: idx, motivo: motivo });
    }
    if (vivas.length === 1) return terminar(vivas[0].idx, 'conquista');
    for (var i = 0; i < vivas.length; i++) {
      if (vivas[i].maravillaDesde !== null && m.turno - vivas[i].maravillaDesde >= SIM.TURNOS_MARAVILLA) return terminar(vivas[i].idx, 'maravilla');
    }
    if (m.turno >= SIM.TURNO_FINAL) {
      var mejor = vivas[0];
      vivas.forEach(function (c) { if (SIM.puntaje(m, c.idx) > SIM.puntaje(m, mejor.idx)) mejor = c; });
      terminar(mejor.idx, 'puntaje');
    }
  }

  // ---------- héroes ----------
  function revisarHeroes(m) {
    m.civs.forEach(function (civ) {
      if (!civ.viva || civ.era < 2) return;
      var tipo = 'heroe_' + civ.clave, d = SIM.UNIDADES[tipo];
      if (!d) return;
      if (civ.heroeId) {
        var h = unidadPorId(m, civ.heroeId);
        if (h && !h.muerta) { h.hp = Math.min(h.d.hp, h.hp + 1.5); return; }
        civ.heroeId = null; civ.heroeVuelve = m.turno + 200;
        registrar(m, civ.idx, 'heroe', '💀 ¡Cayó ' + d.nombre + ', el héroe de los ' + civ.nombre + '! Su leyenda volverá algún día.');
        return;
      }
      if (civ.heroeVuelve && m.turno < civ.heroeVuelve) return;
      var cs = SIM.ciudadesDe(m, civ.idx);
      var lugar = d.rol === 'naval' ? cs.filter(function (c) { return c.agua !== null; }).sort(function (a, b) { return (b.capital ? 1 : 0) - (a.capital ? 1 : 0); })[0]
        : (cs.filter(function (c) { return c.capital; })[0] || cs[0]);
      if (!lugar) return;
      var x = lugar.x, y = lugar.y;
      if (d.rol === 'naval') { x = lugar.agua % m.W; y = Math.floor(lugar.agua / m.W); }
      var u = crearUnidad(m, civ, tipo, x, y);
      u.hogar = lugar.id;
      civ.heroeId = u.id;
      registrar(m, civ.idx, 'heroe', (civ.heroeVuelve ? '⭐ ¡Vuelve la leyenda! ' : '⭐ ¡Nace un héroe! ') + d.nombre + ' lidera a los ' + civ.nombre + ' desde ' + lugar.nombre);
      if (SIM.decir && civ.control === 'bot') SIM.decir(m, civ.idx, '¡' + d.nombre + ' cabalga con nosotros!');
    });
  }

  // ---------- turno económico ----------
  function turnoEconomico(m) {
    m.turno++;
    var cambio = false;
    m.civs.forEach(function (c) { c.cienciaTurno = 0; c.oroTurno = 0; c.puntosFeTurno = 0; });
    m.civs.forEach(function (civ) { if (civ.viva) gobernar(m, civ); });
    m.ciudades.slice().forEach(function (c) {
      var civ = m.civs[c.civ], r = rendimientos(m, c);
      var cap = 3 + 12 * Math.log(1 + r.F / 12);
      var tasa = 0.02 * (civ.clave === 'mayas' ? 1.2 : 1) * (civ.plan.foco === 'expansion' || civ.plan.foco === 'economia' ? 1.15 : 1);
      if (c.pop < cap) c.pop += tasa * (1 + c.pop * 0.02) * Math.min(1, (cap - c.pop) / 2 + 0.2);
      else if (c.pop > cap + 0.5) c.pop = Math.max(1, c.pop - 0.01);
      produccion(m, civ, c, r.prod);
      civ.cienciaTurno += r.ciencia * (civ.plan.foco === 'ciencia' ? 1.4 : 1);
      civ.oroTurno += r.oro;
      var hm = hpMaxCiudad(m, c);
      if (m.turno - c.ultimoAtaque > 3) c.hp = Math.min(hm, c.hp + hm * 0.03);
      var nr = radioCiudad(c);
      if (nr !== c.radio) { c.radio = nr; cambio = true; }
    });
    if (cambio || m.turno % 25 === 0) recalcularTerritorio(m);
    m.civs.forEach(function (civ) {
      if (!civ.viva) return;
      var amigos = civ.amigos.filter(function (x, k) { return x && m.civs[k].viva; }).length;
      civ.ciencia += civ.cienciaTurno;
      civ.oro += civ.oroTurno + amigos * 0.4;
      var sig = SIM.ERAS[civ.era + 1];
      if (sig && civ.ciencia >= sig.ciencia) {
        civ.era++;
        var mejoradas = 0;
        m.unidades.forEach(function (u) {
          if (u.civ !== civ.idx || u.muerta || u.d.rol === 'colono' || u.d.heroe) return;
          var nuevo = mejorUnidad(m, civ, u.d.rol);
          if (!nuevo || SIM.UNIDADES[nuevo].era <= u.d.era) return;
          var ratio = u.hp / u.d.hp;
          u.tipo = nuevo; u.d = SIM.UNIDADES[nuevo]; u.hp = u.d.hp * ratio; mejoradas++;
        });
        registrar(m, civ.idx, 'era', '🎓 Los ' + civ.nombre + ' entran en la Era ' + SIM.ERAS[civ.era].nombre + (mejoradas ? ' y modernizan ' + mejoradas + ' unidades' : ''));
        encolarEvento(m, civ, { tipo: 'nueva_era', era: civ.era }, 2);
        SIM.emitir(m, 'era', { civ: civ.idx, era: civ.era });
      }
    });
    revisarHeroes(m);
    dispararCiudades(m);
    m.unidades.forEach(function (u) {
      if (u.muerta || m.turno - u.ultimoCombate < 4) return;
      var propio = m.dueno[tileDe(m, u)] === u.civ;
      u.hp = Math.min(u.d.hp, u.hp + (propio ? 1.2 : 0.3));
    });
    if (m.turno % 5 === 0) detectarContactos(m);
    revisarIntrigas(m);
    SIM.modulos.forEach(function (mod) { if (mod.turno) mod.turno(m); });
    if (SIM.Consejo) SIM.Consejo.revisar(m);
    comprobarVictoria(m);
  }

  // ---------- paso principal ----------
  SIM.paso = function (m) {
    if (m.fin) return;
    m.tick++;
    m.presupuesto = 10;
    armarGrilla(m);
    var muertas = false;
    for (var i = 0; i < m.unidades.length; i++) {
      var u = m.unidades[i];
      if (u.muerta) { muertas = true; continue; }
      u.px = u.x; u.py = u.y;   // posición anterior, para dibujar el movimiento suave
      actuarUnidad(m, u);
    }
    if (muertas || m.tick % 10 === 0) m.unidades = m.unidades.filter(function (u) { return !u.muerta && u.hp > 0; });
    if (m.efectos.length) {
      for (var k = 0; k < m.efectos.length; k++) m.efectos[k].t--;
      m.efectos = m.efectos.filter(function (e) { return e.t > 0; });
    }
    for (var mo = 0; mo < SIM.modulos.length; mo++) if (SIM.modulos[mo].tick) SIM.modulos[mo].tick(m);
    if (m.tick % SIM.TICKS_POR_TURNO === 0) turnoEconomico(m);
  };

  SIM.esperandoDecision = function (m) { return false; };   // el juego ya no se frena para decidir
})();
