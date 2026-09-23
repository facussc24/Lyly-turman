/* Comercio: caravanas por tierra y barcos mercantes por mar entre ciudades.
   Viajan solos, dejan oro al llegar y los enemigos en guerra los pueden saquear. */
var SIM = SIM || {};

(function () {
  var VEL_TIERRA = 0.06, VEL_MAR = 0.1;   // casillas por tick

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function crearRuta(m, civ, origen, destino) {
    var W = m.W, camino = SIM.camino(m, civ, 'colono', origen.y * W + origen.x, destino.y * W + destino.x), porMar = false;
    if (camino && camino.some(function (i) { return SIM.TERRENOS[m.mapa.tipo[i]].agua; })) camino = null;   // por tierra sin embarcar
    if (!camino && origen.agua !== null && destino.agua !== null && civ.era >= 1) {
      camino = SIM.camino(m, civ, 'naval', origen.agua, destino.agua);
      porMar = !!camino;
    }
    if (!camino || camino.length < 4) return null;
    var inicio = porMar ? origen.agua : origen.y * W + origen.x;
    return {
      id: m.comercio.sig++, civ: civ.idx, origen: origen.id, destino: destino.id, porMar: porMar,
      puntos: [inicio].concat(camino), prog: 0, px: 0, py: 0,
      valor: Math.round(6 + camino.length * 0.45 + civ.era * 3 + (destino.civ !== civ.idx ? 6 : 0)),
    };
  }

  function posicion(m, r, prog) {
    var i = Math.min(r.puntos.length - 2, Math.floor(prog)), f = prog - i;
    var a = r.puntos[i], b = r.puntos[i + 1];
    var ax = a % m.W, ay = Math.floor(a / m.W), bx = b % m.W, by = Math.floor(b / m.W);
    return [ax + (bx - ax) * f, ay + (by - ay) * f];
  }

  var modulo = {
    iniciar: function (m) { m.comercio = { rutas: [], sig: 1, conocidas: {} }; },

    turno: function (m) {
      var K = m.comercio;
      if (!K) return;
      // Nuevas caravanas
      m.civs.forEach(function (civ) {
        if (!civ.viva || (m.turno + civ.idx * 7) % 15 !== 0) return;
        var mias = SIM.ciudadesDe(m, civ.idx);
        var activas = K.rutas.filter(function (r) { return r.civ === civ.idx; }).length;
        if (mias.length < 2 && !civ.amigos.some(Boolean)) return;
        if (activas >= Math.min(6, 1 + Math.floor(mias.length / 2))) return;
        var origenes = mias.filter(function (c) { return c.pop >= 3; });
        if (!origenes.length) return;
        var origen = origenes[Math.floor(m.rng() * origenes.length)];
        // Destinos: ciudades de civilizaciones amigas (dan más oro) o ciudades propias lejanas
        var destinos = m.ciudades.filter(function (c) {
          if (c === origen) return false;
          if (c.civ === civ.idx) return dist(c.x, c.y, origen.x, origen.y) > 5;
          return civ.amigos[c.civ] && civ.rel[c.civ] !== 'guerra' && dist(c.x, c.y, origen.x, origen.y) < 40;
        });
        if (!destinos.length) return;
        destinos.sort(function (a, b) { return (b.civ !== civ.idx) - (a.civ !== civ.idx) || dist(a.x, a.y, origen.x, origen.y) - dist(b.x, b.y, origen.x, origen.y); });
        var destino = destinos[Math.floor(m.rng() * Math.min(3, destinos.length))];
        var r = crearRuta(m, civ, origen, destino);
        if (!r) return;
        K.rutas.push(r);
        var clave = Math.min(origen.id, destino.id) + '-' + Math.max(origen.id, destino.id);
        if (destino.civ !== civ.idx && !K.conocidas[clave]) {
          K.conocidas[clave] = true;
          SIM.registrar(m, civ.idx, 'comercio', (r.porMar ? '⛵' : '🐪') + ' Nueva ruta comercial de los ' + civ.nombre + ': ' + origen.nombre + ' ⇄ ' + destino.nombre + ' (' + m.civs[destino.civ].nombre + ')');
        }
      });
      // Saqueos: si pasa cerca de tropas enemigas, se pierde la carga
      K.rutas = K.rutas.filter(function (r) {
        var p = posicion(m, r, r.prog), dueno = m.civs[r.civ];
        if (!dueno.viva) return false;
        for (var i = 0; i < m.unidades.length; i++) {
          var u = m.unidades[i];
          if (u.muerta || u.d.rol === 'colono' || !SIM.enGuerra(m, r.civ, u.civ)) continue;
          if (dist(u.x, u.y, p[0], p[1]) < 1.6) {
            var ladron = m.civs[u.civ];
            ladron.oro += r.valor * 0.6;
            if (m.turno - (ladron.ultimoSaqueo || -99) > 40) {
              ladron.ultimoSaqueo = m.turno;
              SIM.registrar(m, u.civ, 'saqueo', (r.porMar ? '🏴‍☠️ Piratas' : '🗡 Bandidos') + ' de los ' + ladron.nombre + ' saquearon un' + (r.porMar ? ' barco mercante' : 'a caravana') + ' de los ' + dueno.nombre);
            }
            return false;
          }
        }
        return true;
      });
    },

    tick: function (m) {
      var K = m.comercio;
      if (!K) return;
      K.rutas = K.rutas.filter(function (r) {
        var p = posicion(m, r, r.prog);
        r.px = p[0]; r.py = p[1];
        r.prog += r.porMar ? VEL_MAR : VEL_TIERRA;
        if (r.prog < r.puntos.length - 1) return true;
        // Llegó: oro para los dos lados
        var destino = SIM.ciudadPorId(m, r.destino), civ = m.civs[r.civ];
        if (civ.viva) civ.oro += r.valor;
        if (destino && destino.civ !== r.civ && m.civs[destino.civ].viva) m.civs[destino.civ].oro += r.valor * 0.5;
        return false;
      });
    },

    dibujar: function (g, render, ahora) {
      var m = render.m, K = m && m.comercio;
      if (!K || !K.rutas.length) return;
      var s = render.escala, tam = Math.max(14, s * 1.1);
      // Rutas activas: líneas doradas punteadas
      g.save();
      g.setLineDash([3, 6]); g.lineDashOffset = -ahora / 60; g.lineWidth = 1.5;
      K.rutas.forEach(function (r) {
        g.strokeStyle = r.porMar ? 'rgba(170,220,255,0.35)' : 'rgba(255,215,120,0.4)';
        g.beginPath();
        for (var k = Math.floor(r.prog); k < r.puntos.length; k += 2) {
          var i = r.puntos[k], q = render.aPantalla(i % m.W, Math.floor(i / m.W));
          if (k === Math.floor(r.prog)) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]);
        }
        var fin = r.puntos[r.puntos.length - 1], qf = render.aPantalla(fin % m.W, Math.floor(fin / m.W));
        g.lineTo(qf[0], qf[1]);
        g.stroke();
      });
      g.restore();
      // Caravanas y barcos mercantes
      K.rutas.forEach(function (r) {
        var p = render.aPantalla(r.px, r.py);
        if (p[0] < -30 || p[1] < -30 || p[0] > render.ancho + 30 || p[1] > render.alto + 30) return;
        var civ = m.civs[r.civ];
        var tipo = r.porMar ? (civ.era >= 3 ? 'galeon' : 'carraca') : 'colono';
        var img = SIM.Sprites.unidad(tipo, civ.color, false);
        g.globalAlpha = 0.95;
        g.drawImage(img, p[0] - tam / 2, p[1] - tam * 0.72, tam, tam);
        g.globalAlpha = 1;
        if (s >= 12) {
          g.font = Math.round(tam * 0.4) + 'px "Segoe UI Emoji",sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('💰', p[0] + tam * 0.35, p[1] - tam * 0.55);
        }
      });
    },
  };

  SIM.modulos.push(modulo);
})();
