/* Globos de diálogo sobre las capitales: lo que dice Claude y las cargadas de las IAs del juego. */
var SIM = SIM || {};

(function () {
  var FRASES = {
    guerra: ['¡Prepárense para sufrir!', '¡Sus tierras van a ser nuestras!', 'Hoy es un buen día para una guerra.', '¡A las armas!', 'No es personal... bueno, un poco sí.', '¡Ahí vamos!', 'Ustedes se lo buscaron.'],
    paz: ['Está bien, guardemos las espadas... por ahora.', 'Paz. Pero los tenemos vigilados.', 'Brindemos por la paz (mientras dure).', 'Tregua aceptada. No se acostumbren.'],
    conquista: ['¡Esta ciudad ahora es nuestra!', '¡Ja! Otra más para la colección.', '¿Alguien más quiere?', 'Gracias por la ciudad, la vamos a cuidar.'],
    perdida: ['¡Esto no queda así!', '¡Vamos a volver!', 'Nos agarraron distraídos...'],
  };

  // Dice algo arriba de su capital durante unos turnos
  SIM.decir = function (m, idx, texto) {
    if (!m.burbujas) m.burbujas = [];
    m.burbujas = m.burbujas.filter(function (b) { return b.civ !== idx; });
    m.burbujas.push({ civ: idx, texto: String(texto).slice(0, 140), hasta: m.turno + 14 });
  };

  // Frase al azar de las IAs del juego (el jugador y Claude hablan por su cuenta)
  SIM.cargada = function (m, idx, tipo) {
    var civ = m.civs[idx];
    if (!civ || civ.control !== 'bot' || !FRASES[tipo] || m.rng() > 0.7) return;
    SIM.decir(m, idx, FRASES[tipo][Math.floor(m.rng() * FRASES[tipo].length)]);
  };

  function globo(g, x, y, texto, color) {
    g.font = '600 13px "Segoe UI",system-ui,sans-serif';
    var palabras = texto.split(' '), lineas = [], linea = '';
    palabras.forEach(function (p) {
      var prueba = linea ? linea + ' ' + p : p;
      if (g.measureText(prueba).width > 220 && linea) { lineas.push(linea); linea = p; } else linea = prueba;
    });
    if (linea) lineas.push(linea);
    var ancho = Math.max.apply(null, lineas.map(function (l) { return g.measureText(l).width; })) + 20;
    var alto = lineas.length * 17 + 12, bx = x - ancho / 2, by = y - alto - 14;
    g.fillStyle = 'rgba(255,252,240,0.96)'; g.strokeStyle = color; g.lineWidth = 2.5;
    g.beginPath(); g.roundRect(bx, by, ancho, alto, 10); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - 8, by + alto - 1); g.lineTo(x, y - 4); g.lineTo(x + 8, by + alto - 1); g.fillStyle = 'rgba(255,252,240,0.96)'; g.fill();
    g.beginPath(); g.moveTo(x - 8, by + alto); g.lineTo(x, y - 4); g.lineTo(x + 8, by + alto); g.stroke();
    g.fillStyle = '#1b1f2a'; g.textAlign = 'center'; g.textBaseline = 'top';
    lineas.forEach(function (l, k) { g.fillText(l, x, by + 7 + k * 17); });
  }

  SIM.modulos.push({
    dibujar: function (g, render) {
      var m = render.m;
      if (!m || !m.burbujas || !m.burbujas.length) return;
      m.burbujas = m.burbujas.filter(function (b) { return b.hasta > m.turno && m.civs[b.civ].viva; });
      m.burbujas.forEach(function (b) {
        var cap = m.ciudades.filter(function (c) { return c.civ === b.civ && c.capital; })[0];
        if (!cap) return;
        var p = render.aPantalla(cap.x, cap.y);
        var x = Math.max(130, Math.min(render.ancho - 130, p[0])), y = Math.max(90, Math.min(render.alto - 20, p[1] - render.escala * 1.2));
        g.save();
        globo(g, x, y, (m.civs[b.civ].control === 'claude' ? '🤖 ' : '') + b.texto, m.civs[b.civ].color);
        g.restore();
      });
    },
  });
})();
