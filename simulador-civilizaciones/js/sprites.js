/* Figuras dibujadas a mano con canvas (sin imágenes externas): soldados, jinetes, barcos,
   aviones, máquinas de asedio y ciudades. Se dibujan una vez y se guardan en caché. */
var SIM = SIM || {};

SIM.Sprites = (function () {
  var cache = {};
  var PIEL = '#e6bf98', OSCURO = '#1b1f2a', MADERA = '#7a5230', MADERA2 = '#5b3a1f', METAL = '#9aa3ad', ACERO = '#6b737c';

  function lienzo(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function obtener(clave, w, h, dibujar) {
    if (!cache[clave]) { var c = lienzo(w, h); dibujar(c.getContext('2d'), w, h); cache[clave] = c; }
    return cache[clave];
  }
  function sombra(g, x, y, rx, ry) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  function oscurecer(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(gg * f) + ',' + Math.round(b * f) + ')';
  }
  function linea(g, x1, y1, x2, y2, color, ancho) { g.strokeStyle = color; g.lineWidth = ancho; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  function bandera(g, x, y, alto, color) {
    linea(g, x, y, x, y - alto, OSCURO, 1.6);
    g.fillStyle = color; g.strokeStyle = OSCURO; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y - alto); g.lineTo(x + alto * 0.55, y - alto * 0.82); g.lineTo(x, y - alto * 0.64); g.closePath(); g.fill(); g.stroke();
  }

  // ---------- soldado ----------
  // arma: espada | lanza | arco | honda | mosquete | fusil ; casco: 0..5 (según la era)
  function soldado(g, x, y, esc, color, arma, era, especial) {
    g.save(); g.translate(x, y); g.scale(esc, esc);
    sombra(g, 0, 1, 7, 2.5);
    g.lineCap = 'round';
    linea(g, -2, -6, -3, 0, OSCURO, 2.4); linea(g, 2, -6, 3, 0, OSCURO, 2.4);                 // piernas
    g.fillStyle = especial === 'jaguar' ? '#e0a526' : color; g.strokeStyle = OSCURO; g.lineWidth = 1.2;
    g.beginPath(); g.roundRect(-4.5, -15, 9, 10, 2.5); g.fill(); g.stroke();                     // cuerpo
    if (especial === 'jaguar') { g.fillStyle = OSCURO; [[-2, -12], [1.5, -9], [-1, -7]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 0.9, 0, 7); g.fill(); }); }
    g.fillStyle = PIEL; g.beginPath(); g.arc(0, -18.5, 3.6, 0, Math.PI * 2); g.fill(); g.stroke(); // cabeza
    // casco según la era
    if (especial === 'jaguar') { g.fillStyle = '#e0a526'; g.beginPath(); g.arc(0, -19.5, 4, Math.PI, 0); g.fill(); g.stroke(); }
    else if (era >= 5) { g.fillStyle = '#556b3a'; g.beginPath(); g.arc(0, -19.3, 4.4, Math.PI, 0); g.fill(); g.stroke(); }
    else if (era >= 3) { g.fillStyle = OSCURO; g.fillRect(-4.5, -22.8, 9, 2.4); g.fillRect(-2.6, -25, 5.2, 2.6); }
    else if (era >= 1) { g.fillStyle = METAL; g.beginPath(); g.arc(0, -19.5, 4.1, Math.PI, 0); g.fill(); g.stroke(); linea(g, 0, -23.6, 0, -26, '#c0392b', 1.6); }
    // arma
    if (arma === 'lanza') { linea(g, 6, 0, 6, -30, MADERA, 1.6); g.fillStyle = METAL; g.beginPath(); g.moveTo(6, -34); g.lineTo(7.8, -29); g.lineTo(4.2, -29); g.fill(); }
    else if (arma === 'espada') { linea(g, 5, -10, 10, -21, METAL, 2); linea(g, 3.8, -12, 7, -10, OSCURO, 1.5); }
    else if (arma === 'arco') { g.strokeStyle = MADERA; g.lineWidth = 1.6; g.beginPath(); g.arc(4, -12, 8, -1.2, 1.2); g.stroke(); linea(g, 4 + 8 * Math.cos(-1.2), -12 + 8 * Math.sin(-1.2), 4 + 8 * Math.cos(1.2), -12 + 8 * Math.sin(1.2), '#ddd', 0.7); }
    else if (arma === 'honda') { linea(g, 4, -12, 9, -20, MADERA2, 1.2); g.fillStyle = '#888'; g.beginPath(); g.arc(9.5, -21, 1.5, 0, 7); g.fill(); }
    else if (arma === 'mosquete' || arma === 'fusil') { linea(g, -2, -8, 11, -20, arma === 'fusil' ? OSCURO : MADERA2, 2); linea(g, 8, -17, 12, -21, OSCURO, 1.4); }
    // escudo para la infantería antigua
    if ((arma === 'espada' || arma === 'lanza') && era <= 2) {
      g.fillStyle = oscurecer(color, 0.75); g.strokeStyle = OSCURO; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(-5.5, -10, 3.6, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#f3e3a0'; g.beginPath(); g.arc(-5.5, -10, 1.1, 0, 7); g.fill();
    }
    g.restore();
  }

  function caballo(g, x, y, esc, color, era, especial) {
    g.save(); g.translate(x, y); g.scale(esc, esc);
    sombra(g, 0, 1, 12, 3);
    var pelo = especial === 'tarkan' ? '#3b2a1a' : '#8a5a33';
    g.strokeStyle = OSCURO; g.lineWidth = 1.2;
    [-8, -4, 5, 9].forEach(function (px) { linea(g, px, -6, px + (px < 0 ? -1 : 1), 0, OSCURO, 2.2); });
    g.fillStyle = pelo; g.beginPath(); g.ellipse(0, -9, 12, 5.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();   // cuerpo
    g.beginPath(); g.moveTo(8, -12); g.lineTo(14, -20); g.lineTo(18, -18); g.lineTo(12, -9); g.closePath(); g.fill(); g.stroke(); // cuello
    g.beginPath(); g.ellipse(17.5, -18.5, 4, 2.4, 0.4, 0, Math.PI * 2); g.fill(); g.stroke();               // cabeza
    linea(g, -12, -10, -16, -4, OSCURO, 2);                                                                // cola
    g.fillStyle = color; g.fillRect(-5, -14, 9, 4);                                                        // manta
    // jinete
    g.fillStyle = color; g.beginPath(); g.roundRect(-3, -25, 7, 11, 2); g.fill(); g.stroke();
    g.fillStyle = PIEL; g.beginPath(); g.arc(0.5, -28, 3.3, 0, 7); g.fill(); g.stroke();
    if (era >= 3) { g.fillStyle = OSCURO; g.fillRect(-3.5, -32, 8, 2.2); }
    else { g.fillStyle = METAL; g.beginPath(); g.arc(0.5, -29, 3.6, Math.PI, 0); g.fill(); g.stroke(); }
    if (especial === 'conquistador') linea(g, 2, -22, 16, -30, OSCURO, 2);
    else linea(g, 3, -20, 20, -34, MADERA, 1.6);
    g.restore();
  }

  function asedio(g, x, y, esc, color, tipo) {
    g.save(); g.translate(x, y); g.scale(esc, esc);
    sombra(g, 0, 1, 13, 3);
    g.strokeStyle = OSCURO; g.lineWidth = 1.2;
    if (tipo === 'catapulta' || tipo === 'trebuchet') {
      g.fillStyle = MADERA; g.fillRect(-11, -6, 22, 4); g.strokeRect(-11, -6, 22, 4);
      [-7, 7].forEach(function (rx) { g.fillStyle = MADERA2; g.beginPath(); g.arc(rx, -1, 3.2, 0, 7); g.fill(); g.stroke(); });
      if (tipo === 'trebuchet') { linea(g, -4, -6, 0, -26, MADERA2, 2.2); linea(g, 4, -6, 0, -26, MADERA2, 2.2); linea(g, -14, -30, 10, -20, MADERA, 2); g.fillStyle = '#555'; g.fillRect(6, -22, 6, 6); }
      else { linea(g, -2, -6, 8, -20, MADERA, 2.2); g.fillStyle = '#666'; g.beginPath(); g.arc(9, -21, 3, 0, 7); g.fill(); }
    } else if (tipo === 'tanque') {
      g.fillStyle = '#3c4a2c'; g.beginPath(); g.roundRect(-14, -7, 28, 7, 3.5); g.fill(); g.stroke();   // orugas
      g.fillStyle = '#5c7040'; g.beginPath(); g.roundRect(-12, -13, 24, 7, 2); g.fill(); g.stroke();      // casco
      g.fillStyle = color; g.fillRect(-12, -10, 24, 2);
      g.fillStyle = '#6b8050'; g.beginPath(); g.roundRect(-6, -19, 12, 7, 3); g.fill(); g.stroke();       // torreta
      linea(g, 5, -16, 20, -17, OSCURO, 2.4);
    } else { // cañón / artillería
      [-5, 5].forEach(function (rx) { g.fillStyle = MADERA2; g.beginPath(); g.arc(rx, -4, 4.2, 0, 7); g.fill(); g.stroke(); linea(g, rx - 3, -4, rx + 3, -4, OSCURO, 0.8); });
      g.fillStyle = tipo === 'artilleria' ? ACERO : '#2b2b2b';
      g.save(); g.translate(0, -8); g.rotate(-0.35); g.beginPath(); g.roundRect(-8, -3, 22, 6, 2.5); g.fill(); g.stroke(); g.restore();
      g.fillStyle = color; g.fillRect(-9, -9, 5, 4);
    }
    g.restore();
  }

  function barco(g, x, y, esc, color, tipo) {
    g.save(); g.translate(x, y); g.scale(esc, esc);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2;                                   // estela
    g.beginPath(); g.moveTo(-20, 1); g.quadraticCurveTo(-26, -1, -30, 2); g.stroke();
    g.strokeStyle = OSCURO; g.lineWidth = 1.2;
    var metal = tipo === 'acorazado' || tipo === 'destructor';
    g.fillStyle = metal ? '#5d6670' : (tipo === 'barco_tortuga' ? '#5b3a1f' : MADERA);
    g.beginPath(); g.moveTo(-18, -8); g.lineTo(18, -8); g.lineTo(22, -11); g.lineTo(14, 1); g.lineTo(-14, 1); g.closePath(); g.fill(); g.stroke();   // casco
    g.fillStyle = color; g.fillRect(-15, -7, 30, 2);
    if (metal) {
      g.fillStyle = '#7b858f'; g.fillRect(-8, -15, 14, 7); g.strokeRect(-8, -15, 14, 7);
      g.fillRect(-4, -21, 6, 6); g.strokeRect(-4, -21, 6, 6);
      linea(g, 8, -11, 19, -13, OSCURO, 2); linea(g, -10, -11, -19, -13, OSCURO, 2);
      bandera(g, -1, -21, 8, color);
    } else if (tipo === 'barco_tortuga') {
      g.fillStyle = '#3f6b3a'; g.beginPath(); g.ellipse(0, -9, 14, 7, 0, Math.PI, 0); g.fill(); g.stroke();
      for (var k = -10; k <= 10; k += 5) linea(g, k, -13, k, -16, '#ccc', 1);
      g.fillStyle = '#e0c060'; g.beginPath(); g.arc(18, -10, 2.5, 0, 7); g.fill();
    } else {
      var mastiles = tipo === 'galeon' ? 3 : (tipo === 'carraca' ? 2 : 1);
      for (var mm = 0; mm < mastiles; mm++) {
        var mx = mastiles === 1 ? 0 : -8 + mm * (16 / (mastiles - 1));
        linea(g, mx, -8, mx, -30, MADERA2, 1.6);
        g.fillStyle = '#f2ecd8'; g.beginPath(); g.moveTo(mx - 6, -27); g.quadraticCurveTo(mx + 2, -20, mx - 6, -12); g.lineTo(mx + 6, -12); g.quadraticCurveTo(mx + 9, -20, mx + 6, -27); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = color; g.fillRect(mx - 5, -21, 10, 3);
      }
      if (tipo === 'trirreme') for (var r = -12; r <= 10; r += 4) linea(g, r, -3, r - 3, 4, MADERA2, 1);
      bandera(g, mastiles === 1 ? 0 : 8, -30, 6, color);
    }
    g.restore();
  }

  function balsa(g, x, y, esc, color) {
    g.save(); g.translate(x, y); g.scale(esc, esc);
    g.strokeStyle = OSCURO; g.lineWidth = 1.2;
    g.fillStyle = MADERA; g.beginPath(); g.moveTo(-12, -6); g.lineTo(12, -6); g.lineTo(8, 1); g.lineTo(-8, 1); g.closePath(); g.fill(); g.stroke();
    linea(g, 0, -6, 0, -22, MADERA2, 1.4);
    g.fillStyle = '#f2ecd8'; g.beginPath(); g.moveTo(0, -21); g.lineTo(9, -9); g.lineTo(0, -9); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = color; g.fillRect(1, -13, 6, 2.5);
    [-6, -1, 4].forEach(function (px) { g.fillStyle = color; g.beginPath(); g.arc(px, -8, 2.2, 0, 7); g.fill(); g.stroke(); });
    g.restore();
  }

  function avion(g, x, y, esc, color, tipo) {
    g.save(); g.translate(x, y); g.scale(esc, esc);
    g.strokeStyle = OSCURO; g.lineWidth = 1.2;
    var grande = tipo === 'bombardero';
    var ala = grande ? 20 : 14;
    g.fillStyle = '#b8c0c8';
    g.beginPath(); g.moveTo(-3, -ala); g.lineTo(3, -ala); g.lineTo(5, 0); g.lineTo(3, ala); g.lineTo(-3, ala); g.lineTo(-1, 0); g.closePath(); g.fill(); g.stroke(); // alas
    g.fillStyle = color; g.fillRect(-2.5, -ala + 2, 5, 4); g.fillRect(-2.5, ala - 6, 5, 4);
    g.fillStyle = '#d7dde3'; g.beginPath(); g.ellipse(0, 0, grande ? 20 : 16, 3.6, 0, 0, Math.PI * 2); g.fill(); g.stroke();                         // fuselaje
    g.fillStyle = '#b8c0c8'; g.beginPath(); g.moveTo(-14, -6); g.lineTo(-11, -6); g.lineTo(-9, 0); g.lineTo(-11, 6); g.lineTo(-14, 6); g.closePath(); g.fill(); g.stroke(); // cola
    g.fillStyle = '#5aa0d8'; g.beginPath(); g.ellipse(8, 0, 3.5, 2, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function carreta(g, x, y, esc, color) {
    g.save(); g.translate(x, y); g.scale(esc, esc);
    sombra(g, 0, 1, 12, 3);
    g.strokeStyle = OSCURO; g.lineWidth = 1.2;
    g.fillStyle = MADERA; g.fillRect(-10, -9, 18, 5); g.strokeRect(-10, -9, 18, 5);
    g.fillStyle = '#efe6cf'; g.beginPath(); g.moveTo(-10, -9); g.quadraticCurveTo(-1, -24, 8, -9); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = color; g.fillRect(-4, -15, 6, 3);
    [-6, 5].forEach(function (rx) { g.fillStyle = MADERA2; g.beginPath(); g.arc(rx, -3, 3.3, 0, 7); g.fill(); g.stroke(); });
    soldado(g, 14, 0, 0.7, color, null, 0);
    g.restore();
  }

  // ---------- unidades ----------
  function arma(tipo, d) {
    if (d.rol === 'distancia') return tipo === 'hondero' ? 'honda' : 'arco';
    if (tipo === 'lancero') return 'lanza';
    if (tipo === 'mosquetero') return 'mosquete';
    if (tipo === 'fusilero' || tipo === 'infanteria') return 'fusil';
    return 'espada';
  }

  function estrella(g, x, y, r) {
    g.fillStyle = '#ffd84a'; g.strokeStyle = '#7a5a00'; g.lineWidth = 1;
    g.beginPath();
    for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke();
  }

  function unidad(tipo, color, embarcado) {
    var d = SIM.UNIDADES[tipo];
    var clave = tipo + '|' + color + '|' + (embarcado ? 'b' : '');
    return obtener(clave, 72, 72, function (g) {
      var x = 36, y = 56;
      if (embarcado) { balsa(g, x, y, 1.3, color); return; }
      if (d.heroe) {
        // Halo dorado, figura grande y una estrella arriba
        var halo = g.createRadialGradient(x, y - 20, 4, x, y - 20, 34);
        halo.addColorStop(0, 'rgba(255,220,90,0.55)'); halo.addColorStop(1, 'rgba(255,220,90,0)');
        g.fillStyle = halo; g.fillRect(0, 0, 72, 72);
        if (d.rol === 'naval') barco(g, x, y, 1.35, '#ffd84a', 'galeon');
        else if (d.caballo) caballo(g, x - 2, y, 1.25, color, 3, tipo === 'heroe_hunos' ? 'tarkan' : 'conquistador');
        else soldado(g, x, y, 1.6, color, d.rol === 'distancia' ? 'arco' : 'lanza', 2, tipo === 'heroe_aztecas' ? 'jaguar' : null);
        estrella(g, x, 8, 7);
        return;
      }
      if (d.rol === 'naval') { barco(g, x, y, 1.25, color, tipo); return; }
      if (d.rol === 'aire') { avion(g, x, 36, 1.3, color, tipo); return; }
      if (d.rol === 'colono') { carreta(g, x - 4, y, 1.35, color); return; }
      if (d.rol === 'asedio') { asedio(g, x, y, 1.4, color, tipo === 'canon' ? 'canon' : tipo); return; }
      if (tipo === 'tanque') { asedio(g, x, y, 1.4, color, 'tanque'); return; }
      if (d.caballo) { caballo(g, x - 2, y, 1.15, color, d.era, tipo); return; }
      // Una escuadra de tres soldados
      var a = arma(tipo, d), esp = tipo === 'jaguar' ? 'jaguar' : null;
      soldado(g, x - 11, y - 6, 1.05, oscurecer(color, 0.85), a, d.era, esp);
      soldado(g, x + 11, y - 6, 1.05, oscurecer(color, 0.85), a, d.era, esp);
      soldado(g, x, y, 1.2, color, a, d.era, esp);
    });
  }

  // ---------- ciudades ----------
  function choza(g, x, y, s) {
    g.fillStyle = '#8b6a45'; g.strokeStyle = OSCURO; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - s * 1.3); g.lineTo(x + s, y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#3a2a1a'; g.fillRect(x - s * 0.2, y - s * 0.45, s * 0.4, s * 0.45);
  }
  function casa(g, x, y, s, techo, pared) {
    g.strokeStyle = OSCURO; g.lineWidth = 1;
    g.fillStyle = pared; g.fillRect(x - s, y - s * 1.1, s * 2, s * 1.1); g.strokeRect(x - s, y - s * 1.1, s * 2, s * 1.1);
    g.fillStyle = techo; g.beginPath(); g.moveTo(x - s * 1.2, y - s * 1.1); g.lineTo(x, y - s * 2); g.lineTo(x + s * 1.2, y - s * 1.1); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#4a3322'; g.fillRect(x - s * 0.25, y - s * 0.55, s * 0.5, s * 0.55);
  }
  function torre(g, x, y, s, color) {
    g.strokeStyle = OSCURO; g.lineWidth = 1;
    g.fillStyle = '#a9a39a'; g.fillRect(x - s, y - s * 3, s * 2, s * 3); g.strokeRect(x - s, y - s * 3, s * 2, s * 3);
    for (var k = 0; k < 3; k++) { g.fillRect(x - s + k * s * 0.8, y - s * 3.5, s * 0.5, s * 0.5); g.strokeRect(x - s + k * s * 0.8, y - s * 3.5, s * 0.5, s * 0.5); }
    g.fillStyle = '#3a3a3a'; g.fillRect(x - s * 0.3, y - s * 2.2, s * 0.6, s * 0.8);
    bandera(g, x, y - s * 3.5, s * 1.8, color);
  }
  function fabrica(g, x, y, s) {
    g.strokeStyle = OSCURO; g.lineWidth = 1;
    g.fillStyle = '#8c4a3a'; g.fillRect(x - s * 1.4, y - s * 1.3, s * 2.8, s * 1.3); g.strokeRect(x - s * 1.4, y - s * 1.3, s * 2.8, s * 1.3);
    g.fillStyle = '#6d3a2e'; g.fillRect(x + s * 0.6, y - s * 3, s * 0.5, s * 1.7); g.strokeRect(x + s * 0.6, y - s * 3, s * 0.5, s * 1.7);
    g.fillStyle = 'rgba(200,200,200,0.55)'; g.beginPath(); g.arc(x + s * 1.1, y - s * 3.4, s * 0.5, 0, 7); g.arc(x + s * 1.6, y - s * 3.9, s * 0.6, 0, 7); g.fill();
  }
  function edificio(g, x, y, s, alto, color) {
    g.strokeStyle = OSCURO; g.lineWidth = 1;
    g.fillStyle = '#7d8fa3'; g.fillRect(x - s * 0.8, y - s * alto, s * 1.6, s * alto); g.strokeRect(x - s * 0.8, y - s * alto, s * 1.6, s * alto);
    g.fillStyle = '#e8f0a8';
    for (var fy = y - s * alto + s * 0.4; fy < y - s * 0.4; fy += s * 0.6) { g.fillRect(x - s * 0.5, fy, s * 0.3, s * 0.3); g.fillRect(x + s * 0.2, fy, s * 0.3, s * 0.3); }
    g.fillStyle = color; g.fillRect(x - s * 0.8, y - s * alto, s * 1.6, s * 0.25);
  }
  function templo(g, x, y, s) {
    g.strokeStyle = OSCURO; g.lineWidth = 1;
    for (var k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#e8c860' : '#d4a93c'; g.fillRect(x - s * (2 - k * 0.45), y - s * (k + 1) * 0.55, s * (4 - k * 0.9), s * 0.55); g.strokeRect(x - s * (2 - k * 0.45), y - s * (k + 1) * 0.55, s * (4 - k * 0.9), s * 0.55); }
  }

  function ciudad(c, civ) {
    var era = civ.era, n = Math.max(1, Math.min(10, Math.round(1 + c.pop / 2.5)));
    var etapa = era >= 5 ? 'moderna' : (era >= 4 ? 'industrial' : (era >= 1 ? 'clasica' : 'antigua'));
    var clave = ['c', civ.color, etapa, n, c.ed.murallas ? 1 : 0, c.capital ? 1 : 0, c.ed.maravilla ? 1 : 0, c.id % 5].join('|');
    return obtener(clave, 128, 128, function (g) {
      var cx = 64, cy = 76, rng = SIM.crearRNG(c.id * 97 + n);
      // plaza con el color de la civilización
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(cx, cy + 6, 44, 20, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = etapa === 'moderna' ? '#8d949c' : (etapa === 'antigua' ? '#b39a6e' : '#c9b48a');
      g.strokeStyle = civ.color; g.lineWidth = 3;
      g.beginPath(); g.ellipse(cx, cy, 40, 18, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      if (c.ed.murallas) {
        g.strokeStyle = '#8e8a82'; g.lineWidth = 5; g.beginPath(); g.ellipse(cx, cy - 2, 44, 21, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = OSCURO; g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy - 2, 46.5, 23.5, 0, 0, Math.PI * 2); g.stroke();
      }
      // posiciones de los edificios en espiral, de atrás hacia adelante
      var pos = [];
      for (var k = 0; k < n; k++) {
        var ang = k * 2.4 + rng() * 0.5, rad = k === 0 ? 0 : 9 + Math.sqrt(k) * 9;
        pos.push([cx + Math.cos(ang) * rad * 1.35, cy + Math.sin(ang) * rad * 0.55 + 4]);
      }
      pos.sort(function (a, b) { return a[1] - b[1]; });
      var principal = pos.reduce(function (a, b) { return Math.abs(b[0] - cx) + Math.abs(b[1] - cy) < Math.abs(a[0] - cx) + Math.abs(a[1] - cy) ? b : a; });
      pos.forEach(function (p) {
        var esPrincipal = p === principal;
        if (etapa === 'antigua') choza(g, p[0], p[1], esPrincipal ? 9 : 6.5 + rng() * 2);
        else if (etapa === 'clasica') {
          if (esPrincipal && (c.capital || c.ed.murallas)) torre(g, p[0], p[1], 6, civ.color);
          else casa(g, p[0], p[1], 5.5 + rng() * 1.5, rng() < 0.7 ? '#b5452e' : '#8a5a33', rng() < 0.5 ? '#efe2c4' : '#e0cfa8');
        } else if (etapa === 'industrial') {
          if (esPrincipal) torre(g, p[0], p[1], 6, civ.color);
          else if (rng() < 0.35) fabrica(g, p[0], p[1], 5.5);
          else casa(g, p[0], p[1], 5.5, '#6b4a3a', '#c9a27a');
        } else {
          edificio(g, p[0], p[1], 5.5, esPrincipal ? 7 : 3 + rng() * 3.5, civ.color);
        }
      });
      if (etapa === 'antigua' || etapa === 'moderna') bandera(g, principal[0] + 2, principal[1] - (etapa === 'moderna' ? 40 : 11), 13, civ.color);
      if (c.ed.maravilla) templo(g, cx + 30, cy - 4, 6);
    });
  }

  return { unidad: unidad, ciudad: ciudad, limpiar: function () { cache = {}; } };
})();
