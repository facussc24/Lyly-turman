/* Generación del mapa: continentes, islas y terrenos a partir de una semilla. */
var SIM = SIM || {};

SIM.crearRNG = function (semilla) {
  var a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

(function () {
  function hash2(ix, iy, s) {
    var h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function ruido(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  function fbm(x, y, s, octavas) {
    var v = 0, amp = 0.5, f = 1, total = 0;
    for (var i = 0; i < octavas; i++) {
      v += amp * ruido(x * f, y * f, s + i * 1013);
      total += amp; amp *= 0.5; f *= 2;
    }
    return v / total;
  }

  function percentil(arr, p) {
    var copia = Array.prototype.slice.call(arr).sort(function (a, b) { return a - b; });
    return copia[Math.min(copia.length - 1, Math.floor(p * copia.length))];
  }

  // Devuelve { W, H, tipo, masa, tamMasa } o null si el mapa no sirve
  function intentarMapa(W, H, semilla) {
    var T = SIM.T, N = W * H;
    var elev = new Float32Array(N), hum = new Float32Array(N), tipo = new Uint8Array(N);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y * W + x;
        var e = fbm(x / 17, y / 17, semilla, 5);
        var bx = Math.min(x, W - 1 - x) / (W * 0.1), by = Math.min(y, H - 1 - y) / (H * 0.12);
        var borde = Math.min(1, bx, by);
        elev[i] = e - (1 - borde) * 0.3;
        hum[i] = fbm(x / 12 + 50, y / 12 + 50, semilla + 77, 4);
      }
    }
    var mar = percentil(elev, 0.56), colina = percentil(elev, 0.9), montana = percentil(elev, 0.965);
    for (var j = 0; j < N; j++) {
      var ey = Math.floor(j / W), ev = elev[j];
      if (ev < mar) { tipo[j] = T.OCEANO; continue; }
      if (ev >= montana) { tipo[j] = T.MONTANA; continue; }
      if (ev >= colina) { tipo[j] = T.COLINAS; continue; }
      var lat = Math.abs(ey - H / 2) / (H / 2);
      if (lat > 0.88) tipo[j] = T.NIEVE;
      else if (hum[j] < 0.4) tipo[j] = T.DESIERTO;
      else if (hum[j] > 0.57) tipo[j] = T.BOSQUE;
      else tipo[j] = T.PRADERA;
    }
    // El agua pegada a tierra es costa (se puede cruzar desde la era Clásica)
    var esCosta = new Uint8Array(N);
    for (var k = 0; k < N; k++) {
      if (tipo[k] !== T.OCEANO) continue;
      var kx = k % W, ky = (k - kx) / W;
      for (var dy = -2; dy <= 2 && !esCosta[k]; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var nx = kx + dx, ny = ky + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          if (!SIM.TERRENOS[tipo[ny * W + nx]].agua) { esCosta[k] = 1; break; }
        }
      }
    }
    for (var c = 0; c < N; c++) if (esCosta[c]) tipo[c] = T.COSTA;

    // Masas de tierra (continentes e islas)
    var masa = new Int16Array(N).fill(-1), tamMasa = [], pila = [];
    for (var s = 0; s < N; s++) {
      if (masa[s] >= 0 || SIM.TERRENOS[tipo[s]].agua) continue;
      var id = tamMasa.length, tam = 0;
      masa[s] = id; pila.push(s);
      while (pila.length) {
        var p = pila.pop(); tam++;
        var px = p % W, py = (p - px) / W;
        var vec = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var v = 0; v < 4; v++) {
          var qx = px + vec[v][0], qy = py + vec[v][1];
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          var q = qy * W + qx;
          if (masa[q] >= 0 || SIM.TERRENOS[tipo[q]].agua) continue;
          masa[q] = id; pila.push(q);
        }
      }
      tamMasa.push(tam);
    }
    return { W: W, H: H, tipo: tipo, masa: masa, tamMasa: tamMasa, elev: elev, nivelMar: mar, nivelMontana: montana };
  }

  function comidaAlrededor(mapa, x, y, r) {
    var total = 0;
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= mapa.W || ny >= mapa.H) continue;
      if (dx * dx + dy * dy > r * r + 1) continue;
      var t = SIM.TERRENOS[mapa.tipo[ny * mapa.W + nx]];
      total += t.comida + t.prod * 0.5;
    }
    return total;
  }
  SIM.comidaAlrededor = comidaAlrededor;

  // Elige posiciones de inicio lo más separadas posible
  function elegirInicios(mapa, cantidad, rng) {
    var T = SIM.T, cand = [];
    for (var y = 3; y < mapa.H - 3; y += 1) for (var x = 3; x < mapa.W - 3; x += 1) {
      var i = y * mapa.W + x, t = mapa.tipo[i];
      if (t !== T.PRADERA && t !== T.BOSQUE && t !== T.COLINAS) continue;
      if (mapa.tamMasa[mapa.masa[i]] < 70) continue;
      if (comidaAlrededor(mapa, x, y, 2) < 26) continue;
      cand.push([x, y]);
    }
    if (cand.length < cantidad * 4) return null;
    var elegidos = [cand[Math.floor(rng() * cand.length)]];
    while (elegidos.length < cantidad) {
      var mejor = null, mejorD = -1;
      for (var c = 0; c < cand.length; c++) {
        var dmin = Infinity;
        for (var e = 0; e < elegidos.length; e++) {
          var dx = cand[c][0] - elegidos[e][0], dy = cand[c][1] - elegidos[e][1];
          dmin = Math.min(dmin, dx * dx + dy * dy);
        }
        if (dmin > mejorD) { mejorD = dmin; mejor = cand[c]; }
      }
      if (Math.sqrt(mejorD) < 16) return null;
      elegidos.push(mejor);
    }
    // Mezclar para que no siempre el jugador 0 quede en el mismo lugar relativo
    for (var m = elegidos.length - 1; m > 0; m--) {
      var r = Math.floor(rng() * (m + 1)), tmp = elegidos[m];
      elegidos[m] = elegidos[r]; elegidos[r] = tmp;
    }
    return elegidos;
  }

  SIM.generarMapa = function (W, H, semilla, cantidadCivs) {
    for (var intento = 0; intento < 25; intento++) {
      var s = (semilla + intento * 7919) >>> 0;
      var mapa = intentarMapa(W, H, s);
      var inicios = elegirInicios(mapa, cantidadCivs, SIM.crearRNG(s + 1));
      if (inicios) { mapa.inicios = inicios; mapa.semilla = s; return mapa; }
    }
    throw new Error('No se pudo generar un mapa válido');
  };
})();
