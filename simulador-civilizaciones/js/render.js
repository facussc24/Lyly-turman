/* Dibujo del mundo en el canvas: terreno, fronteras, ciudades, unidades y efectos de batalla. */
var SIM = SIM || {};

SIM.Render = (function () {
  var TP = 32; // píxeles por casilla en las capas pre-dibujadas
  var FUENTE_EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

  function hexARgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) { var c = hexARgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function Render(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.escala = 12; this.ox = 0; this.oy = 0;
    this.m = null; this.terreno = null; this.territorio = null; this.version = -1;
    this.particulas = [];
    this.dpr = 1; this.ancho = 1; this.alto = 1;
  }

  Render.prototype.nuevoMundo = function (m) {
    this.m = m;
    this.terreno = dibujarTerreno(m);
    this.territorio = document.createElement('canvas');
    this.territorio.width = m.W * TP; this.territorio.height = m.H * TP;
    this.version = -1;
    this.particulas = [];
    this.redimensionar();
    this.ajustar();
  };

  Render.prototype.redimensionar = function () {
    var r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.ancho = Math.max(1, r.width); this.alto = Math.max(1, r.height);
    this.canvas.width = Math.round(this.ancho * this.dpr);
    this.canvas.height = Math.round(this.alto * this.dpr);
  };

  Render.prototype.ajustar = function () {
    if (!this.m) return;
    this.escala = Math.min(this.ancho / this.m.W, this.alto / this.m.H);
    this.minEscala = this.escala * 0.9;
    this.ox = (this.m.W - this.ancho / this.escala) / 2;
    this.oy = (this.m.H - this.alto / this.escala) / 2;
  };

  Render.prototype.aPantalla = function (x, y) {
    return [(x + 0.5 - this.ox) * this.escala, (y + 0.5 - this.oy) * this.escala];
  };
  Render.prototype.aMundo = function (px, py) {
    return [px / this.escala + this.ox - 0.5, py / this.escala + this.oy - 0.5];
  };

  Render.prototype.zoom = function (factor, px, py) {
    var wx = px / this.escala + this.ox, wy = py / this.escala + this.oy;
    this.escala = Math.max(this.minEscala, Math.min(64, this.escala * factor));
    this.ox = wx - px / this.escala; this.oy = wy - py / this.escala;
    this.limitar();
  };
  Render.prototype.mover = function (dx, dy) {
    this.ox -= dx / this.escala; this.oy -= dy / this.escala;
    this.limitar();
  };
  Render.prototype.limitar = function () {
    var vw = this.ancho / this.escala, vh = this.alto / this.escala, W = this.m.W, H = this.m.H;
    this.ox = vw >= W ? (W - vw) / 2 : Math.max(-2, Math.min(W - vw + 2, this.ox));
    this.oy = vh >= H ? (H - vh) / 2 : Math.max(-2, Math.min(H - vh + 2, this.oy));
  };

  // ---------- capas fijas ----------
  function dibujarTerreno(m) {
    var T = SIM.T, W = m.W, H = m.H, tipo = m.mapa.tipo;
    var esAgua = function (i) { return SIM.TERRENOS[tipo[i]].agua; };
    var rng = SIM.crearRNG(m.mapa.semilla + 5);
    var i, x, y, k;

    // 1) Colores de base: una imagen chica (1 píxel por casilla) agrandada con suavizado,
    //    así los terrenos se funden entre sí en vez de verse como cuadraditos.
    var chico = document.createElement('canvas');
    chico.width = W; chico.height = H;
    var gc = chico.getContext('2d'), img = gc.createImageData(W, H);
    for (i = 0; i < W * H; i++) {
      var c = SIM.TERRENOS[tipo[i]].color, v = (rng() - 0.5) * 16;
      if (tipo[i] === T.OCEANO) v = (rng() - 0.5) * 6;
      img.data[i * 4] = c[0] + v; img.data[i * 4 + 1] = c[1] + v; img.data[i * 4 + 2] = c[2] + v; img.data[i * 4 + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    var cv = document.createElement('canvas');
    cv.width = W * TP; cv.height = H * TP;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(chico, -TP / 2, -TP / 2, (W + 1) * TP, (H + 1) * TP);
    g.drawImage(chico, 0, 0, W * TP, H * TP);

    // 1b) Un poco de la grilla original encima, para que de cerca no se vea borroso
    g.globalAlpha = 0.35;
    g.imageSmoothingEnabled = false;
    g.drawImage(chico, 0, 0, W * TP, H * TP);
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 1;
    // 1c) Matas de pasto en praderas y colinas
    for (i = 0; i < W * H; i++) {
      if (tipo[i] !== T.PRADERA && tipo[i] !== T.COLINAS) continue;
      var gx = (i % W) * TP, gy = Math.floor(i / W) * TP;
      for (k = 0; k < 5; k++) {
        var hx = gx + rng() * TP, hy = gy + rng() * TP;
        g.strokeStyle = rng() < 0.5 ? 'rgba(60,110,40,0.55)' : 'rgba(190,220,120,0.45)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(hx - 2, hy); g.lineTo(hx - 1, hy - 4); g.moveTo(hx, hy); g.lineTo(hx, hy - 5); g.moveTo(hx + 2, hy); g.lineTo(hx + 1, hy - 4); g.stroke();
      }
    }
    // 2) Textura: manchitas claras y oscuras para que no se vea plano
    for (i = 0; i < W * H * 5; i++) {
      var px = rng() * W * TP, py = rng() * H * TP, ti = Math.floor(py / TP) * W + Math.floor(px / TP);
      if (esAgua(ti)) continue;
      g.fillStyle = rng() < 0.5 ? 'rgba(255,255,230,0.07)' : 'rgba(0,20,0,0.08)';
      g.beginPath(); g.arc(px, py, 1 + rng() * 2.5, 0, Math.PI * 2); g.fill();
    }

    // 3) Costas suaves (marching squares sobre los centros de las casillas)
    var tierra = function (x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return 0; return esAgua(y * W + x) ? 0 : 1; };
    var segmentos = [];
    for (y = -1; y < H; y++) for (x = -1; x < W; x++) {
      var a = tierra(x, y), b = tierra(x + 1, y), cc = tierra(x + 1, y + 1), d = tierra(x, y + 1);
      var caso = a * 8 + b * 4 + cc * 2 + d;
      if (caso === 0 || caso === 15) continue;
      var cx = (x + 0.5) * TP, cy = (y + 0.5) * TP, h = TP / 2;
      var N = [cx + h, cy], E = [cx + TP, cy + h], S = [cx + h, cy + TP], O = [cx, cy + h];
      var tabla = { 1: [[O, S]], 2: [[S, E]], 3: [[O, E]], 4: [[N, E]], 5: [[O, N], [S, E]], 6: [[N, S]], 7: [[O, N]],
        8: [[O, N]], 9: [[N, S]], 10: [[O, S], [N, E]], 11: [[N, E]], 12: [[O, E]], 13: [[S, E]], 14: [[O, S]] };
      tabla[caso].forEach(function (sg) { segmentos.push(sg); });
    }
    function trazo(color, ancho) {
      g.strokeStyle = color; g.lineWidth = ancho; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      segmentos.forEach(function (sg) { g.moveTo(sg[0][0], sg[0][1]); g.lineTo(sg[1][0], sg[1][1]); });
      g.stroke();
    }
    trazo('rgba(200,230,255,0.18)', 14);   // espuma
    trazo('rgba(200,230,255,0.25)', 8);
    trazo('rgba(232,216,160,0.95)', 4);    // arena
    trazo('rgba(120,100,60,0.35)', 1.2);

    // 4) Detalles: árboles, colinas, montañas y olas
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var t = tipo[i], bx = x * TP, by = y * TP;
      if (t === T.BOSQUE) {
        for (k = 0; k < 4; k++) {
          var tx = bx + 4 + rng() * (TP - 8), ty = by + 5 + rng() * (TP - 9), r = 3 + rng() * 2.5;
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(tx + 1.5, ty + r * 0.9, r, r * 0.45, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#4a3522'; g.fillRect(tx - 0.8, ty, 1.6, r);
          g.fillStyle = rng() < 0.5 ? '#2f6a2c' : '#3a7a33'; g.beginPath(); g.arc(tx, ty - r * 0.2, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(160,220,120,0.35)'; g.beginPath(); g.arc(tx - r * 0.35, ty - r * 0.55, r * 0.45, 0, Math.PI * 2); g.fill();
        }
      } else if (t === T.COLINAS) {
        for (k = 0; k < 2; k++) {
          var hx = bx + TP * (0.3 + k * 0.4), hy = by + TP * (0.62 + (k ? -0.12 : 0)), hr = TP * (0.28 - k * 0.06);
          g.fillStyle = 'rgba(110,105,60,0.55)'; g.beginPath(); g.arc(hx, hy, hr, Math.PI, 0); g.fill();
          g.fillStyle = 'rgba(210,205,140,0.35)'; g.beginPath(); g.arc(hx - hr * 0.2, hy, hr * 0.7, Math.PI, Math.PI * 1.5); g.lineTo(hx - hr * 0.2, hy); g.fill();
        }
      } else if (t === T.MONTANA) {
        var mx = bx + TP * (0.35 + rng() * 0.3), top = by - TP * 0.15 + rng() * TP * 0.3, base = by + TP - 1;
        g.fillStyle = '#5f5a56'; g.beginPath(); g.moveTo(mx, top); g.lineTo(bx + TP + 2, base); g.lineTo(bx - 2, base); g.fill();
        g.fillStyle = '#827c77'; g.beginPath(); g.moveTo(mx, top); g.lineTo(mx + 2, base); g.lineTo(bx - 2, base); g.fill();
        g.fillStyle = '#f4f6f8'; g.beginPath(); g.moveTo(mx, top); g.lineTo(mx + TP * 0.17, by + TP * 0.38); g.lineTo(mx, by + TP * 0.32); g.lineTo(mx - TP * 0.17, by + TP * 0.4); g.fill();
      } else if (t === T.DESIERTO) {
        g.strokeStyle = 'rgba(170,140,80,0.45)'; g.lineWidth = 1.2;
        g.beginPath(); var dx = bx + 3 + rng() * 8, dy = by + 6 + rng() * 10;
        g.moveTo(dx, dy); g.quadraticCurveTo(dx + 5, dy - 4, dx + 10, dy); g.stroke();
      } else if (t === T.NIEVE) {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (k = 0; k < 3; k++) { g.beginPath(); g.arc(bx + rng() * TP, by + rng() * TP, 1.5, 0, Math.PI * 2); g.fill(); }
      } else if (t === T.OCEANO && rng() < 0.14) {
        g.strokeStyle = 'rgba(150,190,235,0.3)'; g.lineWidth = 1.2;
        var wx = bx + 2 + rng() * (TP - 12), wy = by + 5 + rng() * (TP - 10);
        g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + 3, wy - 3, wx + 6, wy); g.quadraticCurveTo(wx + 9, wy + 3, wx + 12, wy); g.stroke();
      }
    }
    // 5) Viñeta suave en los bordes del mundo
    var vg = g.createRadialGradient(W * TP / 2, H * TP / 2, Math.min(W, H) * TP * 0.35, W * TP / 2, H * TP / 2, Math.max(W, H) * TP * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,30,0.45)');
    g.fillStyle = vg; g.fillRect(0, 0, W * TP, H * TP);
    return cv;
  }

  // Bordes suaves de una zona (marching squares sobre los centros de las casillas)
  function contorno(W, H, dentro) {
    var seg = [], h = TP / 2;
    for (var y = -1; y < H; y++) for (var x = -1; x < W; x++) {
      var a = dentro(x, y), b = dentro(x + 1, y), c = dentro(x + 1, y + 1), d = dentro(x, y + 1);
      var caso = a * 8 + b * 4 + c * 2 + d;
      if (caso === 0 || caso === 15) continue;
      var cx = (x + 0.5) * TP, cy = (y + 0.5) * TP;
      var N = [cx + h, cy], E = [cx + TP, cy + h], S = [cx + h, cy + TP], O = [cx, cy + h];
      var tabla = { 1: [[O, S]], 2: [[S, E]], 3: [[O, E]], 4: [[N, E]], 5: [[O, N], [S, E]], 6: [[N, S]], 7: [[O, N]],
        8: [[O, N]], 9: [[N, S]], 10: [[O, S], [N, E]], 11: [[N, E]], 12: [[O, E]], 13: [[S, E]], 14: [[O, S]] };
      for (var k = 0; k < tabla[caso].length; k++) seg.push(tabla[caso][k]);
    }
    return seg;
  }

  Render.prototype.actualizarTerritorio = function () {
    var m = this.m;
    if (this.version === m.territorioVersion) return;
    this.version = m.territorioVersion;
    pintarTerritorio(m, this.territorio);
  };

  // Pinta las fronteras en un canvas de W*TP x H*TP (lo usa también la vista 2.5D)
  function pintarTerritorio(m, lienzo) {
    var g = lienzo.getContext('2d'), W = m.W, H = m.H, dueno = m.dueno;
    g.clearRect(0, 0, lienzo.width, lienzo.height);
    // Relleno suave (se agranda una imagen chica con suavizado, así no se ven escalones)
    var chico = document.createElement('canvas');
    chico.width = W; chico.height = H;
    var gc = chico.getContext('2d'), img = gc.createImageData(W, H);
    var cols = m.civs.map(function (c) { return hexARgb(c.color); });
    for (var i = 0; i < W * H; i++) {
      var d = dueno[i];
      if (d < 0) continue;
      img.data[i * 4] = cols[d][0]; img.data[i * 4 + 1] = cols[d][1]; img.data[i * 4 + 2] = cols[d][2]; img.data[i * 4 + 3] = 48;
    }
    gc.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(chico, 0, 0, W * TP, H * TP);
    // Bordes de cada civilización
    g.lineCap = 'round'; g.lineJoin = 'round';
    m.civs.forEach(function (c) {
      var seg = contorno(W, H, function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && dueno[y * W + x] === c.idx ? 1 : 0; });
      if (!seg.length) return;
      [['rgba(10,14,24,0.55)', 6], [rgba(c.color, 0.95), 3]].forEach(function (estilo) {
        g.strokeStyle = estilo[0]; g.lineWidth = estilo[1];
        g.beginPath();
        seg.forEach(function (sg) { g.moveTo(sg[0][0], sg[0][1]); g.lineTo(sg[1][0], sg[1][1]); });
        g.stroke();
      });
    });
  }

  // ---------- efectos de batalla (en tiempo real, no en ticks, para que se vean a cualquier velocidad) ----------
  Render.prototype.tomarEfectos = function (ahora) {
    var m = this.m;
    for (var k = 0; k < m.efectos.length; k++) {
      var e = m.efectos[k];
      if (e.visto) continue;
      e.visto = true;
      if (this.particulas.length > 350) continue;
      var dur = { bomba: 700, golpe: 260, rayo: 900, lluvia: 1400, bendicion: 1300, terremoto: 1500, peste: 1800, marca: 650 }[e.tipo] || 320;
      if (e.tipo === 'terremoto') this.temblorHasta = ahora + 800;
      this.particulas.push({ tipo: e.tipo, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, t0: ahora, dur: dur, rnd: Math.random(), radio: e.radio || 1, color: e.color });
    }
  };

  function texto(g, s, x, y, tam, color) {
    g.font = 'bold ' + tam + 'px "Segoe UI",system-ui,sans-serif';
    g.lineWidth = 3; g.strokeStyle = 'rgba(10,14,24,0.85)';
    g.strokeText(s, x, y);
    g.fillStyle = color || '#fff';
    g.fillText(s, x, y);
  }
  function emoji(g, s, x, y, tam) {
    g.font = Math.round(tam) + 'px ' + FUENTE_EMOJI;
    g.fillText(s, x, y);
  }

  function iconoCiudad(m, c) {
    var era = m.civs[c.civ].era;
    if (era >= 5 && c.pop >= 8) return '🏙';
    if (c.ed.fabrica) return '🏭';
    if (c.ed.murallas) return '🏰';
    if (c.pop >= 5) return '🏘';
    return '🛖';
  }

  Render.prototype.dibujar = function (alfa, ahora, ui) {
    var m = this.m, g = this.ctx, s = this.escala, self = this;
    if (!m) return;
    ui = ui || {};
    var sel = ui.sel || {};
    this.actualizarTerritorio();
    this.tomarEfectos(ahora);
    var tx = 0, ty = 0;
    if (this.temblorHasta && ahora < this.temblorHasta) { tx = (Math.random() - 0.5) * 9; ty = (Math.random() - 0.5) * 9; }
    g.setTransform(this.dpr, 0, 0, this.dpr, tx * this.dpr, ty * this.dpr);
    g.fillStyle = '#0a1628';
    g.fillRect(0, 0, this.ancho, this.alto);
    var x0 = -this.ox * s, y0 = -this.oy * s;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.terreno, x0, y0, m.W * s, m.H * s);
    g.drawImage(this.territorio, x0, y0, m.W * s, m.H * s);

    var vis = function (px, py, margen) { return px > -margen && py > -margen && px < self.ancho + margen && py < self.alto + margen; };
    g.textAlign = 'center'; g.textBaseline = 'middle';

    // Ciudades
    var pulso = 0.5 + 0.5 * Math.sin(ahora / 180);
    m.ciudades.forEach(function (c) {
      var p = self.aPantalla(c.x, c.y);
      if (!vis(p[0], p[1], 60)) return;
      var civ = m.civs[c.civ];
      var tam = Math.max(30, s * (2.8 + Math.min(c.pop, 30) / 30 * 2));
      var atacada = m.turno - c.ultimoAtaque < 3;
      if (atacada) {
        g.strokeStyle = 'rgba(255,60,40,' + (0.4 + 0.5 * pulso) + ')'; g.lineWidth = 3;
        g.beginPath(); g.arc(p[0], p[1], tam * 0.75 + pulso * 4, 0, Math.PI * 2); g.stroke();
      }
      g.drawImage(SIM.Sprites.ciudad(c, civ), p[0] - tam / 2, p[1] - tam * 0.62, tam, tam);
      if (ui.ciudadSel === c.id) {
        g.save(); g.setLineDash([5, 4]); g.strokeStyle = '#ffe28a'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(p[0], p[1], tam * 0.8, 0, Math.PI * 2); g.stroke(); g.restore();
      }
      if (c.capital) emoji(g, '👑', p[0] - tam * 0.36, p[1] - tam * 0.42, Math.max(12, tam * 0.2));
      if (atacada) emoji(g, '⚔', p[0] + tam * 0.4, p[1] + tam * 0.15, Math.max(14, tam * 0.24));
      var hm = SIM.hpMaxCiudad(m, c);
      if (c.hp < hm - 0.5) {
        var bw = tam * 1.1;
        bw = tam * 0.6;
        g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(p[0] - bw / 2, p[1] - tam * 0.4, bw, 4);
        g.fillStyle = c.hp / hm > 0.5 ? '#6ee06e' : (c.hp / hm > 0.25 ? '#ffc94a' : '#ff4a3a');
        g.fillRect(p[0] - bw / 2, p[1] - tam * 0.4, bw * Math.max(0, c.hp / hm), 4);
      }
      if (c.capital || s >= 22 || (s >= 14 && c.pop >= 8)) {
        texto(g, c.nombre + ' ' + Math.floor(c.pop), p[0], p[1] + tam * 0.3 + 6, Math.max(10, Math.min(14, s * 0.8)), c.capital ? '#ffe9a8' : '#fff');
      }
    });

    // Unidades
    var radio = Math.max(4, s * 0.4), tamU = Math.max(18, s * 1.4);
    m.unidades.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (u) {
      if (u.muerta) return;
      var ux = u.px !== undefined ? u.px + (u.x - u.px) * alfa : u.x;
      var uy = u.py !== undefined ? u.py + (u.y - u.py) * alfa : u.y;
      var p = self.aPantalla(ux, uy);
      if (!vis(p[0], p[1], 20)) return;
      var civ = m.civs[u.civ], rol = u.d.rol;
      if (rol === 'aire' || rol === 'naval' || u.embarcado) {
        if (!u._estela) u._estela = [];
        var ult = u._estela[u._estela.length - 1];
        if (!ult || Math.abs(ult[0] - ux) + Math.abs(ult[1] - uy) > 0.25) { u._estela.push([ux, uy]); if (u._estela.length > 8) u._estela.shift(); }
        for (var k = 0; k < u._estela.length - 1; k++) {
          var q = self.aPantalla(u._estela[k][0], u._estela[k][1]);
          g.fillStyle = rol === 'aire' ? 'rgba(255,255,255,' + (0.08 + k * 0.05) + ')' : 'rgba(220,240,255,' + (0.06 + k * 0.04) + ')';
          g.beginPath(); g.arc(q[0], q[1], radio * (rol === 'aire' ? 0.25 : 0.35), 0, Math.PI * 2); g.fill();
        }
      }
      if (sel[u.id]) {
        g.strokeStyle = 'rgba(140,255,160,0.95)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(p[0], p[1] + tamU * 0.06, tamU * 0.36, tamU * 0.15, 0, 0, Math.PI * 2); g.stroke();
      }
      var img = SIM.Sprites.unidad(u.tipo, civ.color, u.embarcado && rol !== 'naval');
      if (rol === 'aire') {
        var ang = Math.atan2(u.y - (u.py !== undefined ? u.py : u.y), u.x - (u.px !== undefined ? u.px : u.x));
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(p[0] + tamU * 0.25, p[1] + tamU * 0.35, tamU * 0.3, tamU * 0.12, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(p[0], p[1]); g.rotate(ang);
        g.drawImage(img, -tamU * 0.6, -tamU * 0.6, tamU * 1.2, tamU * 1.2);
        g.restore();
        return;
      }
      g.drawImage(img, p[0] - tamU / 2, p[1] - tamU * 0.72, tamU, tamU);
      if (u.d.heroe && s >= 9) texto(g, u.d.nombre, p[0], p[1] - tamU * 0.85, 11, '#ffd84a');
      if (u.golpe > 0) { g.strokeStyle = 'rgba(255,60,40,0.9)'; g.lineWidth = 2; g.beginPath(); g.ellipse(p[0], p[1] + tamU * 0.06, tamU * 0.34, tamU * 0.13, 0, 0, Math.PI * 2); g.stroke(); }
      if (u.hp < u.d.hp && s >= 10) {
        g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(p[0] - tamU * 0.3, p[1] - tamU * 0.78, tamU * 0.6, 3);
        g.fillStyle = u.hp / u.d.hp > 0.5 ? '#6ee06e' : '#ff5a3a'; g.fillRect(p[0] - tamU * 0.3, p[1] - tamU * 0.78, tamU * 0.6 * u.hp / u.d.hp, 3);
      }
    });

    // Dibujos de los módulos (rutas de comercio, religión...)
    SIM.modulos.forEach(function (mod) { if (mod.dibujar) mod.dibujar(g, self, ahora); });

    // Órdenes de las unidades seleccionadas
    g.save(); g.setLineDash([4, 5]); g.lineWidth = 1.5;
    m.unidades.forEach(function (u) {
      if (!sel[u.id] || u.muerta || !u.orden) return;
      var destino = null, rojo = false;
      if (u.orden.tipo === 'ir' || u.orden.tipo === 'fundar') destino = [u.orden.x, u.orden.y];
      else if (u.orden.tipo === 'atacarCiudad') { var c = SIM.ciudadPorId(m, u.orden.ciudad); if (c) { destino = [c.x, c.y]; rojo = true; } }
      else if (u.orden.tipo === 'atacarUnidad') {
        for (var k = 0; k < m.unidades.length; k++) if (m.unidades[k].id === u.orden.unidad) { destino = [m.unidades[k].x, m.unidades[k].y]; rojo = true; break; }
      }
      if (!destino) return;
      var a = self.aPantalla(u.x, u.y), b = self.aPantalla(destino[0], destino[1]);
      g.strokeStyle = rojo ? 'rgba(255,90,70,0.7)' : 'rgba(140,255,160,0.7)';
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    });
    g.restore();

    // Efectos
    this.particulas = this.particulas.filter(function (e) { return ahora - e.t0 < e.dur; });
    this.particulas.forEach(function (e) {
      var f = Math.max(0, (ahora - e.t0) / e.dur);
      var a = self.aPantalla(e.x1, e.y1), b = self.aPantalla(e.x2, e.y2);
      if (e.tipo === 'disparo' || e.tipo === 'flecha') {
        var x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
        var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
        g.strokeStyle = e.tipo === 'flecha' ? 'rgba(255,226,138,0.95)' : 'rgba(255,255,255,0.95)';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(x - dx / d * 5, y - dy / d * 5); g.lineTo(x, y); g.stroke();
      } else if (e.tipo === 'golpe') {
        var r = 3 + f * radio;
        g.strokeStyle = 'rgba(255,210,90,' + (1 - f) + ')'; g.lineWidth = 2;
        g.beginPath();
        for (var k = 0; k < 4; k++) {
          var an = e.rnd * 6 + k * Math.PI / 2;
          g.moveTo(b[0] + Math.cos(an) * r * 0.3, b[1] + Math.sin(an) * r * 0.3);
          g.lineTo(b[0] + Math.cos(an) * r, b[1] + Math.sin(an) * r);
        }
        g.stroke();
      } else if (e.tipo === 'bomba') {
        var rr = radio * (0.5 + f * 2.2);
        g.fillStyle = 'rgba(255,' + Math.round(180 - f * 150) + ',40,' + (0.85 * (1 - f)) + ')';
        g.beginPath(); g.arc(b[0], b[1], rr, 0, Math.PI * 2); g.fill();
        if (f < 0.4) emoji(g, '💥', b[0], b[1], radio * 2.2);
      } else if (e.tipo === 'marca') {
        g.strokeStyle = e.color || 'rgba(140,255,160,' + (1 - f) + ')'; g.globalAlpha = 1 - f; g.lineWidth = 2.5;
        g.beginPath(); g.arc(b[0], b[1], 4 + f * s * 0.9, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      } else if (e.tipo === 'rayo') {
        if (f < 0.35) {
          g.strokeStyle = 'rgba(255,255,220,' + (1 - f * 2) + ')'; g.lineWidth = 4;
          g.beginPath(); var yy = b[1] - self.alto, xx = b[0];
          g.moveTo(xx, yy);
          for (var k = 1; k <= 8; k++) { var t = k / 8; g.lineTo(b[0] + (Math.random() - 0.5) * 30 * (1 - t), yy + (b[1] - yy) * t); }
          g.stroke();
          g.fillStyle = 'rgba(255,255,230,' + (0.5 - f) + ')';
          g.beginPath(); g.arc(b[0], b[1], s * e.radio * 1.4, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = 'rgba(40,30,20,' + 0.4 * (1 - f) + ')';
        g.beginPath(); g.arc(b[0], b[1], s * e.radio, 0, Math.PI * 2); g.fill();
      } else if (e.tipo === 'lluvia') {
        g.strokeStyle = 'rgba(140,190,255,' + (0.9 * (1 - f)) + ')'; g.lineWidth = 1.5;
        g.beginPath();
        for (var k = 0; k < 40; k++) {
          var ax = b[0] + (((k * 37) % 100) / 100 - 0.5) * s * 3.2;
          var ay = b[1] - s * 1.6 + ((((k * 53) % 100) / 100) * s * 3.2 + f * s * 6) % (s * 3.2);
          g.moveTo(ax, ay); g.lineTo(ax - 2, ay + 6);
        }
        g.stroke();
      } else if (e.tipo === 'bendicion') {
        for (var k = 0; k < 18; k++) {
          var an = k / 18 * Math.PI * 2 + f * 2, rr2 = s * e.radio * (0.3 + 0.7 * ((k * 7) % 10) / 10);
          g.fillStyle = 'rgba(255,225,120,' + (1 - f) + ')';
          g.beginPath(); g.arc(b[0] + Math.cos(an) * rr2, b[1] + Math.sin(an) * rr2 - f * s * 1.5, 2.5, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = 'rgba(255,225,120,' + 0.6 * (1 - f) + ')'; g.lineWidth = 2;
        g.beginPath(); g.arc(b[0], b[1], s * e.radio * f, 0, Math.PI * 2); g.stroke();
      } else if (e.tipo === 'terremoto') {
        for (var k = 0; k < 3; k++) {
          var ff = (f + k * 0.25) % 1;
          g.strokeStyle = 'rgba(150,100,50,' + (0.8 * (1 - ff)) + ')'; g.lineWidth = 4;
          g.beginPath(); g.arc(b[0], b[1], s * e.radio * ff * 1.2, 0, Math.PI * 2); g.stroke();
        }
      } else if (e.tipo === 'peste') {
        g.fillStyle = 'rgba(110,200,60,' + 0.35 * (1 - f) + ')';
        g.beginPath(); g.arc(b[0], b[1], s * e.radio * (0.6 + f * 0.5), 0, Math.PI * 2); g.fill();
        for (var k = 0; k < 6; k++) {
          var an2 = k / 6 * Math.PI * 2 + e.rnd * 6;
          emoji(g, '🦠', b[0] + Math.cos(an2) * s * e.radio * 0.6 * (0.5 + f), b[1] + Math.sin(an2) * s * e.radio * 0.6 * (0.5 + f), s * 0.9);
        }
      }
    });

    // Caja de selección y mira de los poderes
    if (ui.caja) {
      var cj = ui.caja;
      g.fillStyle = 'rgba(140,255,160,0.1)'; g.strokeStyle = 'rgba(140,255,160,0.9)'; g.lineWidth = 1.5;
      g.fillRect(Math.min(cj.x0, cj.x1), Math.min(cj.y0, cj.y1), Math.abs(cj.x1 - cj.x0), Math.abs(cj.y1 - cj.y0));
      g.strokeRect(Math.min(cj.x0, cj.x1), Math.min(cj.y0, cj.y1), Math.abs(cj.x1 - cj.x0), Math.abs(cj.y1 - cj.y0));
    }
    if (ui.poder) {
      var pp = this.aPantalla(ui.poder.x, ui.poder.y), P = SIM.PODERES[ui.poder.tipo];
      g.save(); g.setLineDash([6, 5]);
      g.strokeStyle = 'rgba(255,230,140,0.95)'; g.fillStyle = 'rgba(255,230,140,0.12)'; g.lineWidth = 2;
      g.beginPath(); g.arc(pp[0], pp[1], Math.max(10, s * Math.max(1, P.radio)), 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
      emoji(g, P.icono, pp[0], pp[1], Math.max(18, s * 1.2));
    }

  };

  // Marca visual donde se dio una orden
  Render.prototype.marca = function (x, y, color) {
    this.particulas.push({ tipo: 'marca', x1: x, y1: y, x2: x, y2: y, t0: performance.now(), dur: 650, rnd: 0, color: color });
  };

  // Para la vista 2.5D
  Render.TP = TP;
  Render.dibujarTerreno = dibujarTerreno;
  Render.pintarTerritorio = pintarTerritorio;
  Render.hexARgb = hexARgb;
  Render.rgba = rgba;

  return Render;
})();
