/* Vista 2.5D: el mismo mundo pero con relieve de verdad (three.js) y la cámara inclinada, como en el Age.
   Abajo va el canvas WebGL (terreno, agua, ciudades y unidades como figuritas); arriba, el canvas 2D
   transparente con los efectos, barras de vida, nombres, selección y órdenes. Misma interfaz que SIM.Render. */
var SIM = SIM || {};

SIM.Render3D = (function () {
  var R = 2;                                  // vértices por casilla (esquinas y centros)
  var INCLINACION = 55 * Math.PI / 180;       // ángulo de la cámara sobre el horizonte
  var FOV = 38;                               // apertura vertical de la cámara (grados)
  var TAN_MEDIO = Math.tan(FOV / 2 * Math.PI / 180);
  var AGUA = 0;                               // altura del nivel del mar
  var ALTURA_MAX = 3.8;                       // techo del relieve (para buscar dónde pega el mouse)
  var ESCALA_MAX = 80;                        // zoom máximo (píxeles por casilla)
  var APLASTE = Math.sin(INCLINACION);        // cuánto se achatan los círculos apoyados en el piso
  var FUENTE_EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

  function limitarA(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function azar(i, s) {
    var h = Math.imul(i, 374761393) ^ Math.imul(s, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function Render3D(canvasOverlay, canvasGL) {
    var THREE = window.THREE;
    if (!THREE) throw new Error('three.js no está cargado');
    this.canvas = canvasOverlay;
    this.ctx = canvasOverlay.getContext('2d');
    this.canvasGL = canvasGL;
    // Si no hay WebGL, esto tira error y main.js se queda con la vista 2D
    var renderer = new THREE.WebGLRenderer({ canvas: canvasGL, antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('Sin WebGL');
    renderer.setClearColor(0x0a1628, 1);
    this.renderer = renderer;
    this.anisotropia = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);

    var escena = new THREE.Scene();
    // Cielo con degradé y bruma del mismo color en el horizonte
    var cielo = document.createElement('canvas'); cielo.width = 2; cielo.height = 256;
    var gc = cielo.getContext('2d'), grad = gc.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#081a36'); grad.addColorStop(0.55, '#1f4a7a'); grad.addColorStop(1, '#3f6f9c');
    gc.fillStyle = grad; gc.fillRect(0, 0, 2, 256);
    escena.background = new THREE.CanvasTexture(cielo);
    escena.fog = new THREE.Fog(0x3a6894, 70, 240);
    this.escena = escena;
    this.camara = new THREE.PerspectiveCamera(FOV, 1, 0.2, 2000);

    // Sol desde arriba a la izquierda (noroeste) y luz de cielo suave
    var sol = new THREE.DirectionalLight(0xfff2dc, 0.78);
    sol.position.set(-45, 70, -35);
    escena.add(sol);
    escena.add(new THREE.HemisphereLight(0xdfe9ff, 0x3b3a2c, 0.58));

    this.grupoMundo = new THREE.Group(); escena.add(this.grupoMundo);
    this.grupoFiguras = new THREE.Group(); escena.add(this.grupoFiguras);

    this.objetivo = new THREE.Vector3(48, 0, 30);
    this.dist = 60; this.dMin = 5; this.dMax = 400;
    this.escala = 12; this.minEscala = 4;
    this.m = null; this.version = -1; this.particulas = [];
    this.dpr = 1; this.ancho = 1; this.alto = 1;
    this._vp = new THREE.Matrix4(); this._ivp = new THREE.Matrix4();
    this._v = new THREE.Vector3(); this._dir = new THREE.Vector3();
    this._temblor = [0, 0];
    this._materiales = new Map();   // canvas -> SpriteMaterial (compartido por todas las figuras iguales)
    this._unidades = new Map();     // id -> { spr, sombra, canvas, cuadro }
    this._ciudades = new Map();
    this._cuadro = 0;
    this._w = 1;
    this._mundoArmado = null;

    this.geoSombra = new THREE.CircleGeometry(0.32, 14);
    this.geoSombra.rotateX(-Math.PI / 2);
    this.matSombra = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  }

  // ---------- mundo ----------
  Render3D.prototype.nuevoMundo = function (m) {
    this.m = m;
    this.version = -1;
    this.particulas = [];
    if (this._mundoArmado !== m) this._armarEscena(m);
    this.redimensionar();
    this.ajustar();
  };

  Render3D.prototype._limpiarEscena = function () {
    var self = this;
    this.grupoMundo.children.slice().forEach(function (o) {
      self.grupoMundo.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    this.grupoFiguras.children.slice().forEach(function (o) { self.grupoFiguras.remove(o); });
    this._unidades.clear(); this._ciudades.clear();
  };

  // Altura de cada casilla según el terreno: agua abajo, llanura apenas arriba, colinas y montañas bien altas
  function alturasCasillas(m) {
    var T = SIM.T, W = m.W, H = m.H, tipo = m.mapa.tipo, elev = m.mapa.elev;
    var nm = m.mapa.nivelMar != null ? m.mapa.nivelMar : 0.45;
    var nmo = m.mapa.nivelMontana != null ? m.mapa.nivelMontana : nm + 0.2;
    var h = new Float32Array(W * H), s = (m.mapa.semilla || 1) | 0;
    for (var i = 0; i < W * H; i++) {
      var t = tipo[i], e = elev ? elev[i] : nm, r = azar(i, s);
      if (t === T.OCEANO) h[i] = -0.3 - limitarA((nm - e) * 2.2, 0, 0.5);
      else if (t === T.COSTA) h[i] = -0.13;
      else if (t === T.MONTANA) h[i] = 1.75 + limitarA((e - nmo) * 14, 0, 0.9) + r * 0.55;
      else if (t === T.COLINAS) h[i] = 0.5 + limitarA((e - nm) * 1.2, 0, 0.25) + r * 0.15;
      else h[i] = 0.07 + limitarA((e - nm) * 1.4, 0, 0.3) + r * 0.03;
    }
    return h;
  }

  Render3D.prototype._armarEscena = function (m) {
    var THREE = window.THREE, W = m.W, H = m.H, GW = W * R, GH = H * R, TP = SIM.Render.TP;
    this._limpiarEscena();
    this._mundoArmado = m;

    // Grilla de alturas: interpolación bilineal entre los centros de las casillas + un poco de rugosidad en lo alto
    var hc = alturasCasillas(m), hv = new Float32Array((GW + 1) * (GH + 1)), s = (m.mapa.semilla || 1) | 0;
    var hC = function (x, y) { x = limitarA(x, 0, W - 1); y = limitarA(y, 0, H - 1); return hc[y * W + x]; };
    var gx, gz;
    for (gz = 0; gz <= GH; gz++) for (gx = 0; gx <= GW; gx++) {
      var fx = gx / R - 0.5, fz = gz / R - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      var a = hC(ix, iz), b = hC(ix + 1, iz), c = hC(ix, iz + 1), d = hC(ix + 1, iz + 1);
      var v = a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
      if (v > 0.6) v += (azar(gz * 1000 + gx, s + 9) - 0.5) * 0.4 * (v - 0.6);
      hv[gz * (GW + 1) + gx] = v;
    }
    this.hv = hv; this.GW = GW; this.GH = GH;

    // Geometría del terreno (un vértice por esquina y centro de casilla)
    var nV = (GW + 1) * (GH + 1), pos = new Float32Array(nV * 3), pos2 = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
    for (gz = 0; gz <= GH; gz++) for (gx = 0; gx <= GW; gx++) {
      var k = gz * (GW + 1) + gx, X = gx / R, Z = gz / R;
      pos[k * 3] = X; pos[k * 3 + 1] = hv[k]; pos[k * 3 + 2] = Z;
      pos2[k * 3] = X; pos2[k * 3 + 1] = Math.max(hv[k], AGUA + 0.015); pos2[k * 3 + 2] = Z;
      uv[k * 2] = X / W; uv[k * 2 + 1] = 1 - Z / H;
    }
    var idx = new Uint32Array(GW * GH * 6), n = 0;
    for (gz = 0; gz < GH; gz++) for (gx = 0; gx < GW; gx++) {
      var a0 = gz * (GW + 1) + gx, b0 = a0 + 1, c0 = a0 + GW + 1, d0 = c0 + 1;
      idx[n++] = a0; idx[n++] = c0; idx[n++] = b0;
      idx[n++] = b0; idx[n++] = c0; idx[n++] = d0;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    var texTerreno = new THREE.CanvasTexture(SIM.Render.dibujarTerreno(m));
    texTerreno.anisotropy = this.anisotropia;
    var terreno = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texTerreno }));
    this.grupoMundo.add(terreno);

    // Agua: una lámina semitransparente al nivel del mar (con un brillo que ondula un poco)
    var geoAgua = new THREE.PlaneGeometry(W * 8, H * 8, 1, 1);
    geoAgua.rotateX(-Math.PI / 2); geoAgua.translate(W / 2, AGUA, H / 2);
    this.matAgua = new THREE.MeshPhongMaterial({ color: 0x2f74bd, transparent: true, opacity: 0.4, shininess: 70, specular: 0x6f93b8, depthWrite: false });
    var agua = new THREE.Mesh(geoAgua, this.matAgua);
    agua.renderOrder = 1;
    this.grupoMundo.add(agua);

    // Fronteras: misma malla, apenas por encima del agua, con la textura del territorio
    var geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    geo2.setAttribute('uv', geo.getAttribute('uv'));
    geo2.setIndex(geo.getIndex());
    geo2.computeVertexNormals();
    this.lienzoTerritorio = document.createElement('canvas');
    this.lienzoTerritorio.width = W * TP; this.lienzoTerritorio.height = H * TP;
    this.texTerritorio = new THREE.CanvasTexture(this.lienzoTerritorio);
    this.texTerritorio.anisotropy = this.anisotropia;
    var territorio = new THREE.Mesh(geo2, new THREE.MeshLambertMaterial({
      map: this.texTerritorio, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    territorio.renderOrder = 2;
    this.grupoMundo.add(territorio);

    // Mar profundo alrededor del mapa, para que el horizonte no quede vacío
    var geoFondo = new THREE.PlaneGeometry(W * 10, H * 10, 1, 1);
    geoFondo.rotateX(-Math.PI / 2); geoFondo.translate(W / 2, -0.95, H / 2);
    this.grupoMundo.add(new THREE.Mesh(geoFondo, new THREE.MeshLambertMaterial({ color: 0x1b3561 })));
  };

  Render3D.prototype.actualizarTerritorio = function () {
    var m = this.m;
    if (this.version === m.territorioVersion) return;
    this.version = m.territorioVersion;
    SIM.Render.pintarTerritorio(m, this.lienzoTerritorio);
    this.texTerritorio.needsUpdate = true;
  };

  // ---------- alturas ----------
  // Altura del piso en coordenadas 3D (X = x + 0.5, Z = y + 0.5), bilineal sobre la grilla
  Render3D.prototype._suelo = function (X, Z) {
    var GW = this.GW, GH = this.GH;
    var fx = limitarA(X * R, 0, GW), fz = limitarA(Z * R, 0, GH);
    var ix = Math.min(GW - 1, Math.floor(fx)), iz = Math.min(GH - 1, Math.floor(fz)), tx = fx - ix, tz = fz - iz;
    var hv = this.hv, k = iz * (GW + 1) + ix;
    var a = hv[k], b = hv[k + 1], c = hv[k + GW + 1], d = hv[k + GW + 2];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  // Altura de la superficie (el agua cuenta como piso: los barcos flotan)
  Render3D.prototype._superficie = function (X, Z) { return Math.max(AGUA, this._suelo(X, Z)); };
  // En coordenadas de casilla, como el resto del juego
  Render3D.prototype.alturaEn = function (x, y) { return this.m ? this._superficie(x + 0.5, y + 0.5) : 0; };

  // ---------- cámara ----------
  Render3D.prototype.redimensionar = function () {
    var r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.ancho = Math.max(1, r.width); this.alto = Math.max(1, r.height);
    this.canvas.width = Math.round(this.ancho * this.dpr);
    this.canvas.height = Math.round(this.alto * this.dpr);
    this.renderer.setPixelRatio(Math.min(2, this.dpr));
    this.renderer.setSize(this.ancho, this.alto, false);
    this.camara.aspect = this.ancho / this.alto;
    this.camara.updateProjectionMatrix();
    this.dMin = this.alto / (2 * TAN_MEDIO * ESCALA_MAX);
    this._actualizarCamara();
  };

  Render3D.prototype._actualizarCamara = function () {
    var o = this.objetivo, d = this.dist, c = this.camara, tx = this._temblor[0], tz = this._temblor[1];
    c.position.set(o.x + tx, o.y + d * Math.sin(INCLINACION), o.z + tz + d * Math.cos(INCLINACION));
    c.lookAt(o.x + tx, o.y, o.z + tz);
    c.updateMatrixWorld(true);
    this._vp.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    this._ivp.copy(this._vp).invert();
    this.escala = this.alto / (2 * d * TAN_MEDIO);
    this.escena.fog.near = d * 1.25;
    this.escena.fog.far = d * 3.2 + 30;
  };

  // Proyecta un punto 3D a píxeles CSS; deja en this._w la profundidad (para saber la escala local)
  Render3D.prototype._proyectar = function (X, Y, Z) {
    var e = this._vp.elements;
    var x = e[0] * X + e[4] * Y + e[8] * Z + e[12];
    var y = e[1] * X + e[5] * Y + e[9] * Z + e[13];
    var w = e[3] * X + e[7] * Y + e[11] * Z + e[15];
    if (w < 0.01) { this._w = 0.01; return [-99999, -99999]; }
    this._w = w;
    return [(x / w + 1) * 0.5 * this.ancho, (1 - y / w) * 0.5 * this.alto];
  };
  // Píxeles por casilla en el último punto proyectado
  Render3D.prototype._escalaLocal = function () { return this.alto / (2 * TAN_MEDIO * this._w); };

  Render3D.prototype.aPantalla = function (x, y) {
    if (!this.m) return [0, 0];
    var X = x + 0.5, Z = y + 0.5;
    return this._proyectar(X, this._superficie(X, Z), Z);
  };
  Render3D.prototype._aPantallaAlto = function (x, y, dh) {
    var X = x + 0.5, Z = y + 0.5;
    return this._proyectar(X, this._superficie(X, Z) + dh, Z);
  };

  // Rayo desde la cámara por el píxel (px, py): origen en this.camara.position, dirección en this._dir
  Render3D.prototype._rayo = function (px, py) {
    var v = this._v.set(px / this.ancho * 2 - 1, 1 - py / this.alto * 2, 0.5).applyMatrix4(this._ivp);
    this._dir.copy(v).sub(this.camara.position).normalize();
    if (this._dir.y > -0.02) { this._dir.y = -0.02; this._dir.normalize(); }
    return this._dir;
  };
  // Punto del plano del mar bajo el píxel (para el zoom y el paneo)
  Render3D.prototype._plano = function (px, py) {
    var d = this._rayo(px, py), o = this.camara.position, t = (o.y - AGUA) / -d.y;
    return [o.x + d.x * t, o.z + d.z * t];
  };

  // Casilla bajo el mouse: se camina el rayo sobre el relieve y se afina con bisección
  Render3D.prototype.aMundo = function (px, py) {
    if (!this.m) return [0, 0];
    var d = this._rayo(px, py), o = this.camara.position;
    var tFin = (o.y - AGUA) / -d.y, tIni = Math.max(0, (o.y - ALTURA_MAX) / -d.y), paso = 0.1;
    var t0 = tIni, t = tIni, pego = false;
    for (; t <= tFin; t += paso) {
      if (o.y + d.y * t <= this._superficie(o.x + d.x * t, o.z + d.z * t)) { pego = true; break; }
      t0 = t;
    }
    if (pego) {
      var a = t0, b = t;
      for (var k = 0; k < 14; k++) {
        var mid = (a + b) / 2;
        if (o.y + d.y * mid <= this._superficie(o.x + d.x * mid, o.z + d.z * mid)) b = mid; else a = mid;
      }
      t = b;
    } else t = tFin;
    return [o.x + d.x * t - 0.5, o.z + d.z * t - 0.5];
  };

  Render3D.prototype._encuadra = function () {
    var W = this.m.W, H = this.m.H, mg = 4, self = this, ok = true;
    [[0, 0], [W, 0], [0, H], [W, H]].forEach(function (p) {
      var q = self._proyectar(p[0], 0, p[1]);
      if (q[0] < mg || q[1] < mg || q[0] > self.ancho - mg || q[1] > self.alto - mg) ok = false;
    });
    return ok;
  };
  Render3D.prototype._centrarVertical = function () {
    var W = this.m.W, H = this.m.H;
    for (var k = 0; k < 3; k++) {
      this._actualizarCamara();
      var a = this._proyectar(W / 2, 0, 0)[1], b = this._proyectar(W / 2, 0, H)[1];
      this._desplazar(0, this.alto / 2 - (a + b) / 2);
    }
    this._actualizarCamara();
  };

  // Mostrar el mapa entero
  Render3D.prototype.ajustar = function () {
    if (!this.m) return;
    var lo = 2, hi = 600;
    this.objetivo.set(this.m.W / 2, 0, this.m.H / 2);
    for (var k = 0; k < 24; k++) {
      this.dist = (lo + hi) / 2;
      this._centrarVertical();
      if (this._encuadra()) hi = this.dist; else lo = this.dist;
    }
    this.dist = hi;
    this._centrarVertical();
    this.dMax = hi / 0.9;
    this.minEscala = this.escala * 0.9;
    this.limitar();
  };

  Render3D.prototype.zoom = function (factor, px, py) {
    if (!this.m) return;
    var a = this._plano(px, py);
    this.dist = limitarA(this.dist / factor, this.dMin, this.dMax);
    this._actualizarCamara();
    var b = this._plano(px, py);
    this.objetivo.x += a[0] - b[0]; this.objetivo.z += a[1] - b[1];
    this.limitar();
  };

  // Paneo como arrastrar: lo que estaba en (centro - d) pasa a estar en el centro
  Render3D.prototype._desplazar = function (dx, dy) {
    var cx = this.ancho / 2, cy = this.alto / 2;
    if (Math.abs(dx) > this.ancho * 2 || cy - dy < -this.alto * 0.8 || cy - dy > this.alto * 3) {
      // Saltos enormes (fuera de la pantalla): aproximación lineal, el rayo ya no sirve
      this.objetivo.x -= dx / this.escala; this.objetivo.z -= dy / (this.escala * APLASTE);
    } else {
      var a = this._plano(cx - dx, cy - dy), b = this._plano(cx, cy);
      this.objetivo.x += a[0] - b[0]; this.objetivo.z += a[1] - b[1];
    }
    this._actualizarCamara();
  };
  Render3D.prototype.mover = function (dx, dy) {
    if (!this.m) return;
    this._desplazar(dx, dy);
    this.limitar();
  };

  Render3D.prototype.limitar = function () {
    if (!this.m) return;
    this.dist = limitarA(this.dist, this.dMin, Math.max(this.dMin, this.dMax));
    this.objetivo.x = limitarA(this.objetivo.x, 0, this.m.W);
    this.objetivo.z = limitarA(this.objetivo.z, 0, this.m.H);
    this._actualizarCamara();
  };

  // ---------- figuras (ciudades y unidades como carteles que miran a la cámara) ----------
  Render3D.prototype._material = function (lienzo) {
    var mat = this._materiales.get(lienzo);
    if (!mat) {
      var THREE = window.THREE, tex = new THREE.CanvasTexture(lienzo);
      tex.anisotropy = 2;
      mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.06, depthWrite: false });
      this._materiales.set(lienzo, mat);
    }
    return mat;
  };

  // Ubica un cartel: lo acerca 'k' unidades a la cámara por el mismo rayo (así no se entierra
  // la parte de abajo en el piso) y compensa el tamaño para que se vea igual.
  Render3D.prototype._ubicar = function (spr, X, Y, Z, tam, k) {
    var c = this.camara.position, dx = c.x - X, dy = c.y - Y, dz = c.z - Z, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    if (k > L * 0.5) k = L * 0.5;
    var f = k / L;
    spr.position.set(X + dx * f, Y + dy * f, Z + dz * f);
    var s = tam * (L - k) / L;
    spr.scale.set(s, s, 1);
  };

  Render3D.prototype._sincronizarCiudades = function () {
    var THREE = window.THREE, m = this.m, cuadro = this._cuadro, self = this;
    for (var i = 0; i < m.ciudades.length; i++) {
      var c = m.ciudades[i], e = this._ciudades.get(c.id);
      if (!e) {
        e = { spr: new THREE.Sprite(), canvas: null, cuadro: 0 };
        e.spr.center.set(0.5, 0.38); e.spr.renderOrder = 3;
        this.grupoFiguras.add(e.spr); this._ciudades.set(c.id, e);
      }
      e.cuadro = cuadro;
      var lienzo = SIM.Sprites.ciudad(c, m.civs[c.civ]);
      if (lienzo !== e.canvas) { e.canvas = lienzo; e.spr.material = this._material(lienzo); }
      var X = c.x + 0.5, Z = c.y + 0.5;
      this._ubicar(e.spr, X, this._superficie(X, Z), Z, 2.1 + Math.min(c.pop, 30) / 30 * 1.6, 1.25);
    }
    this._ciudades.forEach(function (e, id, mapa) { if (e.cuadro !== cuadro) { self.grupoFiguras.remove(e.spr); mapa.delete(id); } });
  };

  Render3D.prototype._sincronizarUnidades = function (alfa) {
    var THREE = window.THREE, m = this.m, cuadro = this._cuadro, self = this;
    for (var i = 0; i < m.unidades.length; i++) {
      var u = m.unidades[i];
      if (u.muerta) continue;
      var e = this._unidades.get(u.id);
      if (!e) {
        e = { spr: new THREE.Sprite(), sombra: null, canvas: null, cuadro: 0 };
        e.spr.renderOrder = 3;
        this.grupoFiguras.add(e.spr); this._unidades.set(u.id, e);
      }
      e.cuadro = cuadro;
      var rol = u.d.rol;
      var lienzo = SIM.Sprites.unidad(u.tipo, m.civs[u.civ].color, u.embarcado && rol !== 'naval');
      if (lienzo !== e.canvas) { e.canvas = lienzo; e.spr.material = this._material(lienzo); }
      var ux = u.px !== undefined ? u.px + (u.x - u.px) * alfa : u.x;
      var uy = u.py !== undefined ? u.py + (u.y - u.py) * alfa : u.y;
      var X = ux + 0.5, Z = uy + 0.5, Y = this._superficie(X, Z);
      if (rol === 'aire') {
        // Los aviones vuelan alto y dejan una sombrita en el piso
        if (!e.sombra) { e.sombra = new THREE.Mesh(this.geoSombra, this.matSombra); e.sombra.renderOrder = 2; this.grupoFiguras.add(e.sombra); }
        e.sombra.position.set(X + 0.35, Y + 0.03, Z + 0.25);
        e.spr.center.set(0.5, 0.5);
        this._ubicar(e.spr, X, Y + 2.8, Z, 1.9, 0);
      } else {
        if (e.sombra) { this.grupoFiguras.remove(e.sombra); e.sombra = null; }
        e.spr.center.set(0.5, 0.28);
        this._ubicar(e.spr, X, Y, Z, 1.55, 0.5);
      }
    }
    this._unidades.forEach(function (e, id, mapa) {
      if (e.cuadro === cuadro) return;
      self.grupoFiguras.remove(e.spr);
      if (e.sombra) self.grupoFiguras.remove(e.sombra);
      mapa.delete(id);
    });
  };

  // ---------- efectos de batalla (igual que en 2D) ----------
  Render3D.prototype.tomarEfectos = function (ahora) {
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
  function anillo(g, x, y, r) { r = Math.max(0, r); g.beginPath(); g.ellipse(x, y, r, r * APLASTE, 0, 0, Math.PI * 2); }

  // ---------- cuadro ----------
  Render3D.prototype.dibujar = function (alfa, ahora, ui) {
    var m = this.m, self = this;
    if (!m) return;
    ui = ui || {};
    var sel = ui.sel || {};
    this.actualizarTerritorio();
    this.tomarEfectos(ahora);

    // Temblor de tierra: se sacude la cámara unos píxeles
    if (this.temblorHasta && ahora < this.temblorHasta) {
      var amp = 4.5 / Math.max(1, this.escala);
      this._temblor[0] = (Math.random() - 0.5) * 2 * amp; this._temblor[1] = (Math.random() - 0.5) * 2 * amp;
    } else { this._temblor[0] = 0; this._temblor[1] = 0; }
    this._actualizarCamara();

    this.matAgua.opacity = 0.4 + 0.06 * Math.sin(ahora / 1100);
    this._cuadro++;
    this._sincronizarCiudades();
    this._sincronizarUnidades(alfa);
    this.renderer.render(this.escena, this.camara);

    // ----- capa 2D de arriba -----
    var g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.ancho, this.alto);
    var vis = function (p, margen) { return p[0] > -margen && p[1] > -margen && p[0] < self.ancho + margen && p[1] < self.alto + margen; };
    g.textAlign = 'center'; g.textBaseline = 'middle';

    // Ciudades: anillos de ataque y selección, corona, vida y nombre
    var pulso = 0.5 + 0.5 * Math.sin(ahora / 180);
    m.ciudades.forEach(function (c) {
      var p = self.aPantalla(c.x, c.y);
      if (!vis(p, 80)) return;
      var sl = self._escalaLocal();
      var tam = Math.max(26, sl * (2.1 + Math.min(c.pop, 30) / 30 * 1.6));
      var atacada = m.turno - c.ultimoAtaque < 3;
      if (atacada) {
        g.strokeStyle = 'rgba(255,60,40,' + (0.4 + 0.5 * pulso) + ')'; g.lineWidth = 3;
        anillo(g, p[0], p[1], tam * 0.7 + pulso * 4); g.stroke();
      }
      if (ui.ciudadSel === c.id) {
        g.save(); g.setLineDash([5, 4]); g.strokeStyle = '#ffe28a'; g.lineWidth = 2.5;
        anillo(g, p[0], p[1], tam * 0.75); g.stroke(); g.restore();
      }
      if (c.capital) emoji(g, '👑', p[0] - tam * 0.36, p[1] - tam * 0.42, Math.max(12, tam * 0.2));
      if (atacada) emoji(g, '⚔', p[0] + tam * 0.4, p[1] + tam * 0.15, Math.max(14, tam * 0.24));
      var hm = SIM.hpMaxCiudad(m, c);
      if (c.hp < hm - 0.5) {
        var bw = tam * 0.6;
        g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(p[0] - bw / 2, p[1] - tam * 0.62, bw, 4);
        g.fillStyle = c.hp / hm > 0.5 ? '#6ee06e' : (c.hp / hm > 0.25 ? '#ffc94a' : '#ff4a3a');
        g.fillRect(p[0] - bw / 2, p[1] - tam * 0.62, bw * Math.max(0, c.hp / hm), 4);
      }
      if (c.capital || sl >= 22 || (sl >= 14 && c.pop >= 8)) {
        texto(g, c.nombre + ' ' + Math.floor(c.pop), p[0], p[1] + tam * 0.3 + 6, Math.max(10, Math.min(14, sl * 0.8)), c.capital ? '#ffe9a8' : '#fff');
      }
    });

    // Unidades: estelas, selección, golpes y barras de vida
    for (var i = 0; i < m.unidades.length; i++) {
      var u = m.unidades[i];
      if (u.muerta) continue;
      var rol = u.d.rol, marcar = sel[u.id], herida = u.hp < u.d.hp, estela = rol === 'aire' || rol === 'naval' || u.embarcado;
      if (!marcar && !herida && !estela && !(u.golpe > 0) && !u.d.heroe) continue;
      var ux = u.px !== undefined ? u.px + (u.x - u.px) * alfa : u.x;
      var uy = u.py !== undefined ? u.py + (u.y - u.py) * alfa : u.y;
      var p = this.aPantalla(ux, uy);
      if (!vis(p, 30)) continue;
      var sl = this._escalaLocal(), tamU = Math.max(18, sl * 1.55), radio = Math.max(4, sl * 0.4);
      if (estela) {
        if (!u._estela) u._estela = [];
        var ult = u._estela[u._estela.length - 1];
        if (!ult || Math.abs(ult[0] - ux) + Math.abs(ult[1] - uy) > 0.25) { u._estela.push([ux, uy]); if (u._estela.length > 8) u._estela.shift(); }
        for (var k = 0; k < u._estela.length - 1; k++) {
          var q = rol === 'aire' ? this._aPantallaAlto(u._estela[k][0], u._estela[k][1], 2.8) : this.aPantalla(u._estela[k][0], u._estela[k][1]);
          g.fillStyle = rol === 'aire' ? 'rgba(255,255,255,' + (0.08 + k * 0.05) + ')' : 'rgba(220,240,255,' + (0.06 + k * 0.04) + ')';
          g.beginPath(); g.arc(q[0], q[1], radio * (rol === 'aire' ? 0.25 : 0.35), 0, Math.PI * 2); g.fill();
        }
        p = this.aPantalla(ux, uy); sl = this._escalaLocal();
      }
      if (marcar) {
        g.strokeStyle = 'rgba(140,255,160,0.95)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(p[0], p[1] + tamU * 0.04, tamU * 0.36, tamU * 0.15, 0, 0, Math.PI * 2); g.stroke();
      }
      if (rol === 'aire') continue;
      if (u.golpe > 0) { g.strokeStyle = 'rgba(255,60,40,0.9)'; g.lineWidth = 2; g.beginPath(); g.ellipse(p[0], p[1] + tamU * 0.04, tamU * 0.34, tamU * 0.13, 0, 0, Math.PI * 2); g.stroke(); }
      if (u.d.heroe && sl >= 9) {
        g.font = 'bold 11px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = 'rgba(10,14,24,0.85)'; g.strokeText(u.d.nombre, p[0], p[1] - tamU * 0.95);
        g.fillStyle = '#ffd84a'; g.fillText(u.d.nombre, p[0], p[1] - tamU * 0.95);
      }
      if (herida && sl >= 10) {
        g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(p[0] - tamU * 0.3, p[1] - tamU * 0.8, tamU * 0.6, 3);
        g.fillStyle = u.hp / u.d.hp > 0.5 ? '#6ee06e' : '#ff5a3a'; g.fillRect(p[0] - tamU * 0.3, p[1] - tamU * 0.8, tamU * 0.6 * u.hp / u.d.hp, 3);
      }
    }

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
      g.strokeStyle = rojo ? 'rgba(255,90,70,0.8)' : 'rgba(140,255,160,0.8)';
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.setLineDash([]); g.beginPath(); anillo(g, b[0], b[1], 4); g.stroke(); g.setLineDash([4, 5]);
    });
    g.restore();

    // Efectos
    this.particulas = this.particulas.filter(function (e) { return ahora - e.t0 < e.dur; });
    this.particulas.forEach(function (e) {
      var f = Math.max(0, (ahora - e.t0) / e.dur), a, b, s, k, an;
      if (e.tipo === 'disparo' || e.tipo === 'flecha') {
        // Los proyectiles viajan a la altura del pecho, con una pequeña parábola
        a = self._aPantallaAlto(e.x1, e.y1, 0.55); b = self._aPantallaAlto(e.x2, e.y2, 0.55); s = self._escalaLocal();
        var arco = (e.tipo === 'flecha' ? 0.9 : 0.25) * s * 4 * f * (1 - f);
        var x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f - arco;
        var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
        g.strokeStyle = e.tipo === 'flecha' ? 'rgba(255,226,138,0.95)' : 'rgba(255,255,255,0.95)';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(x - dx / d * 5, y - dy / d * 5); g.lineTo(x, y); g.stroke();
        return;
      }
      if (e.tipo === 'golpe') b = self._aPantallaAlto(e.x2, e.y2, 0.45);
      else b = self.aPantalla(e.x2, e.y2);
      s = self._escalaLocal();
      var radio = Math.max(4, s * 0.4);
      if (e.tipo === 'golpe') {
        var r = 3 + f * radio;
        g.strokeStyle = 'rgba(255,210,90,' + (1 - f) + ')'; g.lineWidth = 2;
        g.beginPath();
        for (k = 0; k < 4; k++) {
          an = e.rnd * 6 + k * Math.PI / 2;
          g.moveTo(b[0] + Math.cos(an) * r * 0.3, b[1] + Math.sin(an) * r * 0.3);
          g.lineTo(b[0] + Math.cos(an) * r, b[1] + Math.sin(an) * r);
        }
        g.stroke();
      } else if (e.tipo === 'bomba') {
        var rr = radio * (0.5 + f * 2.2);
        g.fillStyle = 'rgba(255,' + Math.round(180 - f * 150) + ',40,' + (0.85 * (1 - f)) + ')';
        g.beginPath(); g.arc(b[0], b[1] - rr * 0.3, rr, 0, Math.PI * 2); g.fill();
        if (f < 0.4) emoji(g, '💥', b[0], b[1] - rr * 0.3, radio * 2.2);
      } else if (e.tipo === 'marca') {
        g.strokeStyle = e.color || 'rgba(140,255,160,' + (1 - f) + ')'; g.globalAlpha = 1 - f; g.lineWidth = 2.5;
        anillo(g, b[0], b[1], 4 + f * s * 0.9); g.stroke();
        g.globalAlpha = 1;
      } else if (e.tipo === 'rayo') {
        if (f < 0.35) {
          g.strokeStyle = 'rgba(255,255,220,' + (1 - f * 2) + ')'; g.lineWidth = 4;
          g.beginPath(); var yy = b[1] - self.alto, xx = b[0];
          g.moveTo(xx, yy);
          for (k = 1; k <= 8; k++) { var t = k / 8; g.lineTo(b[0] + (Math.random() - 0.5) * 30 * (1 - t), yy + (b[1] - yy) * t); }
          g.stroke();
          g.fillStyle = 'rgba(255,255,230,' + (0.5 - f) + ')';
          anillo(g, b[0], b[1], s * e.radio * 1.4); g.fill();
        }
        g.fillStyle = 'rgba(40,30,20,' + 0.4 * (1 - f) + ')';
        anillo(g, b[0], b[1], s * e.radio); g.fill();
      } else if (e.tipo === 'lluvia') {
        g.strokeStyle = 'rgba(140,190,255,' + (0.9 * (1 - f)) + ')'; g.lineWidth = 1.5;
        g.beginPath();
        for (k = 0; k < 40; k++) {
          var ax = b[0] + (((k * 37) % 100) / 100 - 0.5) * s * 3.2;
          var ay = b[1] - s * 1.6 + ((((k * 53) % 100) / 100) * s * 3.2 + f * s * 6) % (s * 3.2);
          g.moveTo(ax, ay); g.lineTo(ax - 2, ay + 6);
        }
        g.stroke();
      } else if (e.tipo === 'bendicion') {
        for (k = 0; k < 18; k++) {
          an = k / 18 * Math.PI * 2 + f * 2;
          var rr2 = s * e.radio * (0.3 + 0.7 * ((k * 7) % 10) / 10);
          g.fillStyle = 'rgba(255,225,120,' + (1 - f) + ')';
          g.beginPath(); g.arc(b[0] + Math.cos(an) * rr2, b[1] + Math.sin(an) * rr2 * APLASTE - f * s * 1.5, 2.5, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = 'rgba(255,225,120,' + 0.6 * (1 - f) + ')'; g.lineWidth = 2;
        anillo(g, b[0], b[1], s * e.radio * f); g.stroke();
      } else if (e.tipo === 'terremoto') {
        for (k = 0; k < 3; k++) {
          var ff = (f + k * 0.25) % 1;
          g.strokeStyle = 'rgba(150,100,50,' + (0.8 * (1 - ff)) + ')'; g.lineWidth = 4;
          anillo(g, b[0], b[1], s * e.radio * ff * 1.2); g.stroke();
        }
      } else if (e.tipo === 'peste') {
        g.fillStyle = 'rgba(110,200,60,' + 0.35 * (1 - f) + ')';
        anillo(g, b[0], b[1], s * e.radio * (0.6 + f * 0.5)); g.fill();
        for (k = 0; k < 6; k++) {
          var an2 = k / 6 * Math.PI * 2 + e.rnd * 6;
          emoji(g, '🦠', b[0] + Math.cos(an2) * s * e.radio * 0.6 * (0.5 + f), b[1] + Math.sin(an2) * s * e.radio * 0.6 * (0.5 + f) * APLASTE, s * 0.9);
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
      var pp = this.aPantalla(ui.poder.x, ui.poder.y), sp = this._escalaLocal(), P = SIM.PODERES[ui.poder.tipo];
      g.save(); g.setLineDash([6, 5]);
      g.strokeStyle = 'rgba(255,230,140,0.95)'; g.fillStyle = 'rgba(255,230,140,0.12)'; g.lineWidth = 2;
      anillo(g, pp[0], pp[1], Math.max(10, sp * Math.max(1, P.radio))); g.fill(); g.stroke();
      g.restore();
      emoji(g, P.icono, pp[0], pp[1], Math.max(18, sp * 1.2));
    }
  };

  // Marca visual donde se dio una orden
  Render3D.prototype.marca = function (x, y, color) {
    this.particulas.push({ tipo: 'marca', x1: x, y1: y, x2: x, y2: y, t0: performance.now(), dur: 650, rnd: 0, color: color });
  };

  return Render3D;
})();
