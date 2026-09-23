/* Religiones y sociedades secretas (módulo opcional).
   Estado en m.religion y en cada ciudad (c.fe[idReligion] = proporción de fieles, c.feMayor = religión mayoritaria o -1). */
var SIM = SIM || {};

(function () {
  var RELIGIONES = {
    espanoles: { nombre: 'Catolicismo', icono: '✝', color: '#ffe27a', sym: true },
    aztecas: { nombre: 'Culto a Huitzilopochtli', icono: '☀', color: '#ff7a52', sym: true },
    mayas: { nombre: 'Culto a Kukulkán', icono: '🐍', color: '#c98bff' },
    coreanos: { nombre: 'Budismo', icono: '☸', color: '#6fe3f5', sym: true },
    hunos: { nombre: 'Tengrismo', icono: '🐺', color: '#ffab5c' },
  };
  var GENERICAS = [
    { nombre: 'Culto del Sol Naciente', icono: '🌞', color: '#ffd36b' },
    { nombre: 'Fe de los Ancestros', icono: '🔥', color: '#ff9a7a' },
    { nombre: 'Culto de la Luna', icono: '🌙', color: '#b8c8ff' },
  ];
  var SECTAS = ['Los Iluminados', 'La Orden del Ojo', 'La Hermandad de la Pirámide', 'Los Templarios del Alba', 'La Logia del Compás', 'Los Hijos de la Niebla'];
  var FUENTE_EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  var FUENTE_SIMBOLO = '"Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",sans-serif';   // ✝ ☀ ☸ en color plano
  var RADIO_FE = 13;          // hasta dónde llega la presión religiosa de una ciudad (casillas)
  var UMBRAL_MAYORIA = 0.38;  // proporción mínima para que una religión sea "mayoritaria" en una ciudad

  // ---------- utilidades ----------
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function rel(m, id) { return id >= 0 ? m.religion.lista[id] : null; }
  function relDeCiv(m, idx) { return rel(m, m.religion.deCiv[idx]); }
  function capitalDe(m, idx) {
    for (var i = 0; i < m.ciudades.length; i++) if (m.ciudades[i].civ === idx && m.ciudades[i].capital) return m.ciudades[i];
    return null;
  }
  function elegir(m, arr) { return arr.length ? arr[Math.floor(m.rng() * arr.length)] : null; }
  function stat(m, k, n) { m.religion.stats[k] = (m.religion.stats[k] || 0) + (n || 1); }
  function secta(m, id) {
    var ss = m.religion.sectas;
    for (var i = 0; i < ss.length; i++) if (ss[i].id === id) return ss[i];
    return null;
  }
  function sectaActiva(m) {
    var ss = m.religion.sectas;
    for (var i = 0; i < ss.length; i++) if (ss[i].viva) return ss[i];
    return null;
  }
  function humanoIdx(m) {
    if (m.religion && m.religion.yo !== undefined) return m.religion.yo;
    for (var i = 0; i < m.civs.length; i++) if (m.civs[i].control === 'humano') return i;
    return -1;
  }
  // Lo que sabe el jugador humano de la secta: '' | 'rumor' | 'descubierta' | 'miembro'
  function saberHumano(m, s) { var h = humanoIdx(m); return h >= 0 ? (s.conoce[h] || '') : ''; }
  function laConoce(m, s) { var k = saberHumano(m, s); return k === 'descubierta' || k === 'miembro'; }
  function nombreSecta(m, s) { return laConoce(m, s) ? s.nombre : 'una sociedad secreta'; }
  function Mayus(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function totalSecta(s) { var t = 0; for (var k in s.infl) t += s.infl[k]; return t; }
  function oroCivil(civ, v) { civ.oro += v; civ.oroTurno = (civ.oroTurno || 0) + v; }

  // Fieles por religión dentro de una civilización (ponderado por población)
  function feDeCiv(m, idx) {
    var n = m.religion.lista.length, r = [], pop = 0, k;
    for (k = 0; k < n; k++) r.push(0);
    m.ciudades.forEach(function (c) {
      if (c.civ !== idx || !c.fe) return;
      pop += c.pop;
      for (var j = 0; j < n; j++) r[j] += (c.fe[j] || 0) * c.pop;
    });
    for (k = 0; k < n; k++) r[k] = pop ? r[k] / pop : 0;
    return r;
  }

  // ---------- creación ----------
  function iniciar(m) {
    var n = m.civs.length, cd = [], deCiv = [], fundo = [];
    for (var i = 0; i < n; i++) { cd.push({ conv: 150, cruz: 250, conc: 0 }); deCiv.push(-1); fundo.push(false); }
    m.religion = {
      lista: [], deCiv: deCiv, fundo: fundo, cd: cd, sectas: [], sigSecta: 1, proxSecta: 0,
      conteo: null, ultLogMayoria: -99, stats: {},
    };
    var h = humanoIdx(m);
    if (h >= 0) m.religion.yo = h;
  }

  function fundar(m, civ) {
    var cap = capitalDe(m, civ.idx);
    if (!cap) return;
    var L = m.religion.lista, usados = {};
    L.forEach(function (r) { usados[r.nombre] = true; });
    var def = RELIGIONES[civ.clave];
    if (!def || usados[def.nombre]) def = GENERICAS.filter(function (g) { return !usados[g.nombre]; })[0];
    if (!def) return;
    var r = { id: L.length, nombre: def.nombre, icono: def.icono, color: def.color, sym: !!def.sym, fundador: civ.idx, santa: cap.id, santaNombre: cap.nombre, turno: m.turno };
    L.push(r);
    m.religion.deCiv[civ.idx] = r.id;
    m.religion.fundo[civ.idx] = true;
    SIM.ciudadesDe(m, civ.idx).forEach(function (c) {
      if (!c.fe) c.fe = [];
      var nueva = c === cap ? 0.9 : 0.2, resto = 1 - nueva, suma = 0, k;
      for (k = 0; k < L.length; k++) suma += c.fe[k] || 0;
      if (suma > resto) for (k = 0; k < L.length; k++) c.fe[k] = (c.fe[k] || 0) * resto / suma;
      c.fe[r.id] = Math.max(c.fe[r.id] || 0, nueva);
    });
    stat(m, 'fundadas');
    SIM.registrar(m, civ.idx, 'religion', '⛪ ¡Los ' + civ.nombre + ' fundan el ' + r.nombre + '! ' + r.icono + ' Su ciudad santa es ' + cap.nombre);
  }

  function adoptar(m, civ, rId, motivo) {
    var r = rel(m, rId);
    if (!r || m.religion.deCiv[civ.idx] === rId) return;
    m.religion.deCiv[civ.idx] = rId;
    stat(m, 'adopciones');
    SIM.registrar(m, civ.idx, 'religion', r.icono + ' Los ' + civ.nombre + ' adoptan el ' + r.nombre + ' como religión oficial' + (motivo ? ' (' + motivo + ')' : ''));
  }

  // ---------- difusión (cada 3 turnos) ----------
  function difundir(m) {
    var L = m.religion.lista, nR = L.length;
    if (!nR) return;
    var cs = m.ciudades, n = cs.length, deCiv = m.religion.deCiv, i, j, r;
    var peso = new Array(n), objetivos = new Array(n);
    for (i = 0; i < n; i++) { if (!cs[i].fe) cs[i].fe = []; peso[i] = 1 + Math.min(cs[i].pop, 30) * 0.12; }
    var R2 = RADIO_FE * RADIO_FE;
    for (i = 0; i < n; i++) {
      var c = cs[i], civ = m.civs[c.civ], t = [], tot = 0;
      for (r = 0; r < nR; r++) t.push(0);
      // Inercia pagana: las creencias viejas pesan menos con cada era
      tot += Math.max(0.15, 0.7 - civ.era * 0.1);
      // El clero oficial predica en sus propias ciudades
      if (deCiv[c.civ] >= 0) { t[deCiv[c.civ]] += 1.1; tot += 1.1; }
      // Misioneros que llegan con el comercio
      for (var k = 0; k < m.civs.length; k++) {
        if (k !== c.civ && civ.amigos[k] && m.civs[k].viva && deCiv[k] >= 0) { t[deCiv[k]] += 0.25; tot += 0.25; }
      }
      for (j = 0; j < n; j++) {
        if (j === i) continue;
        var s = cs[j], dx = s.x - c.x, dy = s.y - c.y, d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        var f = 1 - Math.sqrt(d2) / RADIO_FE;
        f = f * f * peso[j];
        if (s.civ !== c.civ) f *= civ.rel[s.civ] === 'guerra' ? 0.35 : (civ.amigos[s.civ] ? 1.3 : 0.8);
        tot += f;
        var fe = s.fe;
        for (r = 0; r < nR; r++) if (fe[r]) t[r] += f * fe[r] * (L[r].santa === s.id ? 2.2 : 1);
      }
      var sum = 0;
      for (r = 0; r < nR; r++) { t[r] /= tot; sum += t[r]; }
      if (sum > 1) for (r = 0; r < nR; r++) t[r] /= sum;
      objetivos[i] = t;
    }
    var conteo = { porRel: [], sinFe: 0, propias: [], extranjeras: [] };
    for (r = 0; r < nR; r++) conteo.porRel.push(0);
    for (i = 0; i < m.civs.length; i++) { conteo.propias.push(0); conteo.extranjeras.push(0); }
    for (i = 0; i < n; i++) {
      var ci = cs[i], ti = objetivos[i], s2 = 0, mejor = -1, mejorV = 0;
      for (r = 0; r < nR; r++) {
        var v = (ci.fe[r] || 0) + 0.06 * (ti[r] - (ci.fe[r] || 0));
        if (L[r].santa === ci.id) v = Math.max(v, 0.85);
        if (v < 0.005) v = 0;
        ci.fe[r] = v; s2 += v;
      }
      if (s2 > 1) for (r = 0; r < nR; r++) ci.fe[r] /= s2;
      for (r = 0; r < nR; r++) if (ci.fe[r] > mejorV) { mejorV = ci.fe[r]; mejor = r; }
      var nuevo = mejorV >= UMBRAL_MAYORIA ? mejor : -1, previo = ci.feMayor === undefined ? -1 : ci.feMayor;
      ci.feMayor = nuevo;
      if (nuevo >= 0) {
        conteo.porRel[nuevo]++;
        if (deCiv[ci.civ] === nuevo) conteo.propias[ci.civ]++;
        var fund = L[nuevo].fundador;
        if (fund !== ci.civ && deCiv[fund] === nuevo) conteo.extranjeras[fund]++;
      } else conteo.sinFe++;
      if (nuevo !== previo && nuevo >= 0) {
        stat(m, 'cambiosMayoria');
        if (nuevo !== deCiv[ci.civ] && (ci.pop >= 9 || ci.capital) && m.turno - m.religion.ultLogMayoria >= 15) {
          m.religion.ultLogMayoria = m.turno;
          stat(m, 'logsMayoria');
          SIM.registrar(m, ci.civ, 'religion', L[nuevo].icono + ' ' + ci.nombre + ' (' + m.civs[ci.civ].nombre + ') ahora es mayoritariamente del ' + L[nuevo].nombre);
        }
      }
    }
    m.religion.conteo = conteo;
    // Beneficios de la fe (por 3 turnos): diezmo y escuelas religiosas
    m.civs.forEach(function (cv) {
      if (!cv.viva || deCiv[cv.idx] < 0) return;
      var b = bonoFe(m, cv.idx);
      oroCivil(cv, 3 * b.oro);
      cv.ciencia += 3 * b.ciencia;
    });
  }

  function bonoFe(m, idx) {
    var k = m.religion.conteo;
    if (!k || m.religion.deCiv[idx] < 0) return { oro: 0, ciencia: 0 };
    return { oro: 0.1 * k.propias[idx] + 0.06 * k.extranjeras[idx], ciencia: 0.04 * k.propias[idx] };
  }

  // Quién predica una religión: el fundador si la mantiene; si no, cualquiera que la tenga de oficial
  function predicador(m, rId, noEs) {
    var r = rel(m, rId), deCiv = m.religion.deCiv;
    if (r.fundador !== noEs && m.civs[r.fundador].viva && deCiv[r.fundador] === rId) return r.fundador;
    for (var k = 0; k < m.civs.length; k++) if (k !== noEs && m.civs[k].viva && deCiv[k] === rId) return k;
    return null;
  }

  // ---------- política religiosa (fundar, adoptar, avisos) ----------
  function politica(m, civ) {
    var R = m.religion, idx = civ.idx, deCiv = R.deCiv, cd = R.cd[idx];
    // Fundar o adoptar una religión
    if (deCiv[idx] < 0 && civ.era >= 1) {
      var fe = feDeCiv(m, idx), mejor = -1, mv = 0;
      fe.forEach(function (v, k) { if (v > mv) { mv = v; mejor = k; } });
      var tope = Math.max(2, m.civs.length - 1);
      if (mejor >= 0 && mv > 0.4) adoptar(m, civ, mejor, 'la mayoría de su pueblo ya lo practicaba');
      else if (!R.fundo[idx] && R.lista.length < tope && m.rng() < (0.1 + (civ.era - 1) * 0.05) * Math.max(0.15, 1 - mv * 2.5)) fundar(m, civ);
    }
    var mia = deCiv[idx];
    // "Los X quieren convertir a tu pueblo"
    if (m.turno >= cd.conv && R.lista.length) {
      var fe2 = feDeCiv(m, idx), rMax = -1, vMax = 0;
      fe2.forEach(function (v, k) { if (k !== mia && v > vMax) { vMax = v; rMax = k; } });
      if (rMax >= 0 && vMax >= 0.2 && m.rng() < 0.5) {
        var misionero = predicador(m, rMax, idx);
        if (misionero !== null) {
          cd.conv = m.turno + 140;
          stat(m, 'avisosConversion');
          SIM.encolarEvento(m, civ, { tipo: 'rel_conversion', otro: misionero, rel: rMax }, 3);
        }
      }
    }
    // Cruzadas: recuperar la ciudad santa o ir contra los infieles
    if (mia >= 0 && civ.era >= 2 && m.turno >= cd.cruz) {
      var r = rel(m, mia), santa = SIM.ciudadPorId(m, r.santa), obj = null, recuperar = false;
      if (santa && santa.civ !== idx && deCiv[santa.civ] !== mia && m.civs[santa.civ].viva && civ.conoce[santa.civ]) { obj = santa.civ; recuperar = true; }
      else if (m.rng() < 0.2) {
        var miPoder = SIM.poder(m, idx), mejorR = 1.3;
        m.civs.forEach(function (o) {
          if (o === civ || !o.viva || !civ.conoce[o.idx] || civ.rel[o.idx] === 'guerra' || civ.tregua[o.idx] > m.turno) return;
          if (deCiv[o.idx] < 0 || deCiv[o.idx] === mia) return;
          var ratio = miPoder / Math.max(5, SIM.poder(m, o.idx));
          if (ratio > mejorR) { mejorR = ratio; obj = o.idx; }
        });
      }
      if (obj !== null && civ.rel[obj] !== 'guerra') {
        cd.cruz = m.turno + 160;
        stat(m, 'avisosCruzada');
        SIM.encolarEvento(m, civ, { tipo: 'rel_cruzada', otro: obj, recuperar: recuperar }, recuperar ? 4 : 2);
      }
    }
    // Hermanos de fe en guerra: el clero pide la paz
    if (mia >= 0 && m.turno >= cd.conc) {
      civ.rel.forEach(function (x, o) {
        if (m.turno < cd.conc || x !== 'guerra' || deCiv[o] !== mia || !m.civs[o].viva || m.turno - civ.guerraDesde[o] < 25) return;
        if (SIM.poder(m, idx) < SIM.poder(m, o) || m.rng() > 0.45) return;
        cd.conc = m.turno + 90;
        stat(m, 'avisosConcilio');
        SIM.encolarEvento(m, civ, { tipo: 'rel_concilio', otro: o }, 4);
      });
    }
  }

  // Los fieles de una religión extranjera a veces conspiran para pasarse a un rey de su fe
  function deslealtad(m) {
    if (m.turno < 200) return;
    var deCiv = m.religion.deCiv, L = m.religion.lista;
    m.ciudades.slice().forEach(function (c) {
      var r = c.feMayor;
      if (r === undefined || r < 0 || deCiv[c.civ] === r || c.capital || c.intriga || c.fe[r] < 0.5) return;
      var por = L[r].fundador;
      if (por === c.civ || !m.civs[por].viva || deCiv[por] !== r) por = predicador(m, r, c.civ);
      if (por === null) return;
      var civ = m.civs[c.civ];
      var prob = 0.006 * c.fe[r] * (civ.rel[por] === 'guerra' ? 3 : 1) * (deCiv[c.civ] >= 0 ? 1.5 : 1);
      if (m.rng() > prob) return;
      SIM.iniciarIntriga(m, c, por, false);
      if (c.intriga) c.intriga.texto = 'los fieles del ' + L[r].nombre + ' de ' + c.nombre + ' quieren un gobernante de su misma fe';
      stat(m, 'traicionesReligiosas');
      SIM.registrar(m, c.civ, 'religion', L[r].icono + ' Los fieles del ' + L[r].nombre + ' en ' + c.nombre + ' (' + civ.nombre + ') miran con simpatía a los ' + m.civs[por].nombre);
    });
  }

  // ---------- sociedades secretas ----------
  function nuevaSecta(m) {
    var R = m.religion, usados = {};
    R.sectas.forEach(function (s) { usados[s.nombre] = true; });
    var libres = SECTAS.filter(function (n) { return !usados[n]; });
    var nombre = elegir(m, libres.length ? libres : SECTAS);
    var candidatas = m.ciudades.filter(function (c) { return c.pop >= 3 && !c.capital; });
    if (!candidatas.length) candidatas = m.ciudades.slice();
    var cuna = elegir(m, candidatas);
    if (!cuna) return;
    var s = {
      id: R.sigSecta++, nombre: nombre, viva: true, desde: m.turno, cuna: cuna.id, infl: {}, miembros: {}, conoce: {}, pagado: {}, avisado: {},
      proxAccion: m.turno + 50, proxPacto: m.turno + 70, acciones: 0,
    };
    s.infl[cuna.id] = 0.25;
    m.civs.forEach(function (c) { s.conoce[c.idx] = 'rumor'; });
    R.sectas.push(s);
    stat(m, 'sectas');
    SIM.registrar(m, -1, 'secta', '🔺 Circulan rumores: encapuchados que se juntan de noche y un ojo dentro de un triángulo. Nadie sabe quiénes son…');
  }

  function disolver(m, s, texto) {
    s.viva = false;
    m.religion.proxSecta = m.turno + 150;
    stat(m, 'sectasDisueltas');
    SIM.registrar(m, -1, 'secta', texto || ('👁 ' + Mayus(nombreSecta(m, s)) + ' se disolvió en las sombras… por ahora.'));
  }

  function turnoSecta(m) {
    var R = m.religion, s = sectaActiva(m);
    if (!s) {
      var maxEra = 0;
      m.civs.forEach(function (c) { if (c.viva) maxEra = Math.max(maxEra, c.era); });
      if (maxEra >= 2 && m.turno >= R.proxSecta && m.ciudades.length >= 6 && m.rng() < 0.05) nuevaSecta(m);
      return;
    }
    var n = m.ciudades.length, limite = Math.max(3, Math.ceil(n * 0.45)), ids = Object.keys(s.infl), cant = ids.length;
    // Crecer y expandirse
    ids.forEach(function (id) {
      var c = SIM.ciudadPorId(m, +id);
      if (!c) { delete s.infl[id]; return; }
      var lv = Math.min(1, s.infl[id] + 0.02 + m.rng() * 0.02 + (s.miembros[c.civ] !== undefined ? 0.01 : 0));
      s.infl[id] = lv;
      if (cant < limite && m.rng() < 0.22 * lv) {
        var lejos = m.rng() < 0.08;
        var cands = m.ciudades.filter(function (x) { return s.infl[x.id] === undefined && (lejos || dist(x, c) < 14); });
        var nueva = elegir(m, cands);
        if (nueva) { s.infl[nueva.id] = 0.08; cant++; }
      }
    });
    // Rumores para los dueños de ciudades muy infiltradas
    for (var id2 in s.infl) {
      var ci = SIM.ciudadPorId(m, +id2);
      if (!ci || s.infl[id2] < 0.3) continue;
      var sabe = s.conoce[ci.civ];
      if (sabe === 'descubierta' || sabe === 'miembro') continue;
      if (s.avisado[ci.civ] !== undefined && m.turno - s.avisado[ci.civ] < 140) continue;
      if (m.rng() > 0.3) continue;
      s.avisado[ci.civ] = m.turno;
      stat(m, 'avisosRumor');
      SIM.encolarEvento(m, m.civs[ci.civ], { tipo: 'secta_rumor', ciudad: ci.id, secta: s.id }, 3);
    }
    // Los miembros reciben oro e información… y se arriesgan a un escándalo
    for (var k in s.miembros) {
      var civ = m.civs[+k];
      if (!civ.viva) { delete s.miembros[k]; continue; }
      var paga = Math.min(8, 1.5 + cant * 0.4);
      oroCivil(civ, paga); s.pagado[k] = (s.pagado[k] || 0) + paga;
      if (m.turno - s.miembros[k] > 30 && m.rng() < 0.008) escandalo(m, s, civ);
    }
    // Ofrecer un pacto a algún gobierno
    if (m.turno >= s.proxPacto && totalSecta(s) >= 1.2) {
      s.proxPacto = m.turno + 90 + Math.floor(m.rng() * 60);
      var cands2 = m.civs.filter(function (c) { return c.viva && s.miembros[c.idx] === undefined && s.conoce[c.idx] !== 'descubierta' && (c.control !== 'humano' || m.rng() < 0.5); });
      var elegido = elegir(m, cands2);
      if (elegido) { stat(m, 'avisosPacto'); SIM.encolarEvento(m, elegido, { tipo: 'secta_pacto', secta: s.id }, 3); }
    }
    // Actuar
    if (m.turno >= s.proxAccion && totalSecta(s) >= 1.0) {
      s.proxAccion = m.turno + 35 + Math.floor(m.rng() * 35);
      actuarSecta(m, s);
    }
    if (s.viva && totalSecta(s) < 0.12) disolver(m, s);
  }

  function escandalo(m, s, civ) {
    delete s.miembros[civ.idx];
    var perdida = Math.floor(Math.max(0, civ.oro) * 0.5);
    civ.oro -= perdida;
    m.civs.forEach(function (o) {
      if (o === civ) return;
      o.amigos[civ.idx] = false; civ.amigos[o.idx] = false;
      if (s.conoce[o.idx] !== 'miembro') s.conoce[o.idx] = 'descubierta';
    });
    s.conoce[civ.idx] = 'descubierta';
    var cap = capitalDe(m, civ.idx);
    if (cap) cap.pop = Math.max(1, cap.pop * 0.85);
    stat(m, 'escandalos');
    SIM.registrar(m, civ.idx, 'secta', '💥🔺 ¡ESCÁNDALO! Se descubrió que el gobierno de los ' + civ.nombre + ' era parte de ' + s.nombre + '. Pierden ' + perdida + ' de oro y todos sus socios comerciales les dan la espalda');
  }

  function actuarSecta(m, s) {
    var niveles = {}, id;
    m.civs.forEach(function (c) { niveles[c.idx] = 0; });
    for (id in s.infl) { var c0 = SIM.ciudadPorId(m, +id); if (c0) niveles[c0.civ] = Math.max(niveles[c0.civ], s.infl[id]); }
    var esMiembro = function (i) { return s.miembros[i] !== undefined; };
    var victimas = m.civs.filter(function (c) { return c.viva && !esMiembro(c.idx) && niveles[c.idx] >= 0.35; });
    if (!victimas.length) return;
    var acciones = [];
    // Guerra entre dos civilizaciones que no son de la secta
    var parGuerra = null;
    victimas.forEach(function (a) {
      m.civs.forEach(function (b) {
        if (parGuerra || b === a || !b.viva || esMiembro(b.idx) || !a.conoce[b.idx] || a.rel[b.idx] === 'guerra' || a.tregua[b.idx] > m.turno) return;
        if (m.rng() < 0.5) parGuerra = [a.idx, b.idx];
      });
    });
    if (parGuerra) acciones.push({ t: 'guerra', p: 3 });
    // Paz: la secta salva a un miembro en guerra (o arregla una paz que le conviene)
    var parPaz = null;
    m.civs.forEach(function (a) {
      if (!a.viva || parPaz) return;
      a.rel.forEach(function (x, b) { if (!parPaz && x === 'guerra' && m.civs[b].viva && ((esMiembro(a.idx) && SIM.poder(m, a.idx) < SIM.poder(m, b)) || m.rng() < 0.1)) parPaz = [a.idx, b]; });
    });
    if (parPaz) acciones.push({ t: 'paz', p: esMiembro(parPaz[0]) ? 2.5 : 1 });
    var ricas = victimas.filter(function (c) { return c.oro >= 40; });
    if (ricas.length) acciones.push({ t: 'robo', p: 2 });
    // Traición: una ciudad muy infiltrada se entrega a un miembro o a un enemigo de su dueño
    var traicion = null;
    for (id in s.infl) {
      var ct = SIM.ciudadPorId(m, +id);
      if (!ct || s.infl[id] < 0.5 || ct.capital || ct.intriga || esMiembro(ct.civ)) continue;
      var dueno = m.civs[ct.civ], mejor = null, md = Infinity;
      m.ciudades.forEach(function (x) {
        if (x.civ === ct.civ || !(esMiembro(x.civ) || dueno.rel[x.civ] === 'guerra')) return;
        var d = dist(x, ct);
        if (d < md) { md = d; mejor = x.civ; }
      });
      if (mejor !== null && md < 30) { traicion = { c: ct, por: mejor }; break; }
    }
    if (traicion) acciones.push({ t: 'traicion', p: 2 });
    var golpe = victimas.filter(function (v) { var cap = capitalDe(m, v.idx); return cap && (s.infl[cap.id] || 0) >= 0.55; });
    if (golpe.length) acciones.push({ t: 'golpe', p: 0.6 });
    if (!acciones.length) return;
    var tot = 0; acciones.forEach(function (a) { tot += a.p; });
    var x = m.rng() * tot, eleg = acciones[0];
    for (var i = 0; i < acciones.length; i++) { x -= acciones[i].p; if (x <= 0) { eleg = acciones[i]; break; } }
    s.acciones++;
    stat(m, 'sectaAcciones');
    stat(m, 'secta_' + eleg.t);
    var quien = Mayus(nombreSecta(m, s)), victima = null;
    if (eleg.t === 'guerra') {
      var A = m.civs[parGuerra[0]], B = m.civs[parGuerra[1]];
      SIM.registrar(m, -1, 'secta', '👁 Aparecen cartas falsificadas en la corte de los ' + A.nombre + ': "los ' + B.nombre + ' preparan una invasión"…');
      SIM.declararGuerra(m, A.idx, B.idx);
      SIM.registrar(m, -1, 'secta', '🔺 Dicen que detrás de esta guerra está la mano de ' + nombreSecta(m, s));
      victima = A;
    } else if (eleg.t === 'paz') {
      var P = m.civs[parPaz[0]], Q = m.civs[parPaz[1]];
      if (SIM.hacerPaz(m, P.idx, Q.idx)) SIM.registrar(m, -1, 'secta', '👁 Nadie entiende por qué los ' + P.nombre + ' y los ' + Q.nombre + ' firmaron la paz de golpe. Detrás de todo: ' + quien);
    } else if (eleg.t === 'robo') {
      victima = elegir(m, ricas);
      var monto = Math.floor(Math.min(victima.oro * 0.3, 40 + victima.era * 25));
      victima.oro -= monto;
      var miembros = Object.keys(s.miembros);
      miembros.forEach(function (k) {
        var parte = monto * 0.5 / miembros.length;
        oroCivil(m.civs[+k], parte); s.pagado[k] = (s.pagado[k] || 0) + parte;
      });
      SIM.registrar(m, victima.idx, 'secta', '🔺 Desaparecieron ' + monto + ' de oro del tesoro de los ' + victima.nombre + '. En la bóveda sólo quedó un triángulo dibujado con tiza');
    } else if (eleg.t === 'traicion') {
      victima = m.civs[traicion.c.civ];
      SIM.iniciarIntriga(m, traicion.c, traicion.por, false);
      if (traicion.c.intriga) traicion.c.intriga.texto = nombreSecta(m, s) + ' compró al gobernador de ' + traicion.c.nombre;
      s.infl[traicion.c.id] = Math.max(0.2, s.infl[traicion.c.id] - 0.3);
      SIM.registrar(m, victima.idx, 'secta', '👁 En ' + traicion.c.nombre + ' (' + victima.nombre + ') el gobernador recibe visitas encapuchadas cada noche…');
    } else if (eleg.t === 'golpe') {
      victima = elegir(m, golpe);
      var cap = capitalDe(m, victima.idx), perdida = Math.floor(Math.max(0, victima.oro) * 0.6);
      victima.oro -= perdida;
      cap.pop = Math.max(1, cap.pop * 0.8);
      SIM.enemigosDe(m, victima).forEach(function (o) { SIM.hacerPaz(m, victima.idx, o); });
      victima.plan.foco = elegir(m, ['expansion', 'economia', 'ciencia', 'militar']);
      victima.plan.postura = 'defensa'; victima.plan.maravilla = false;
      s.infl[cap.id] = 0.3;
      stat(m, 'golpes');
      SIM.registrar(m, victima.idx, 'secta', '🔺👁 ¡GOLPE DE ESTADO en ' + cap.nombre + '! Detrás de todo: ' + quien + '. Derrocaron al gobierno de los ' + victima.nombre + '. El nuevo gobierno vacía el tesoro (' + perdida + ' de oro), firma la paz con todos y cambia el rumbo a ' + SIM.FOCOS[victima.plan.foco].nombre);
    }
    // Cada golpe deja rastros: la víctima puede sospechar
    if (victima && victima.viva && s.conoce[victima.idx] !== 'descubierta' && m.rng() < 0.5) {
      var rastro = null;
      for (id in s.infl) { var cr = SIM.ciudadPorId(m, +id); if (cr && cr.civ === victima.idx) { rastro = cr; break; } }
      if (rastro) { s.avisado[victima.idx] = m.turno; stat(m, 'avisosRumor'); SIM.encolarEvento(m, victima, { tipo: 'secta_rumor', ciudad: rastro.id, secta: s.id }, 4); }
    }
  }

  function purgar(m, s, civIdx, factor) {
    var quitadas = 0;
    for (var id in s.infl) {
      var c = SIM.ciudadPorId(m, +id);
      if (c && c.civ === civIdx) { if (factor <= 0) { delete s.infl[id]; quitadas++; } else s.infl[id] *= factor; }
    }
    return quitadas;
  }

  // ---------- turno ----------
  function turno(m) {
    if (!m.religion) iniciar(m);
    var t = m.turno;
    if (t % 3 === 1) difundir(m);
    m.civs.forEach(function (civ) {
      if (civ.viva && (t + civ.idx * 3) % 10 === 0) politica(m, civ);
    });
    if (t % 10 === 5) deslealtad(m);
    if (t % 5 === 2) turnoSecta(m);
  }

  // ---------- avisos ----------
  function indiceCon(consejo, prefijo) {
    for (var i = 0; i < consejo.opciones.length; i++) {
      if (consejo.opciones[i].efectos.some(function (e) { return e.indexOf(prefijo) === 0; })) return i;
    }
    return -1;
  }
  function primero(consejo, prefijos) {
    for (var i = 0; i < prefijos.length; i++) { var k = indiceCon(consejo, prefijos[i]); if (k >= 0) return k; }
    return 0;
  }
  function ratioPoder(m, a, b) { return SIM.poder(m, a) / Math.max(5, SIM.poder(m, b)); }
  function costoProhibir(m, civ) { return 40 + civ.era * 25; }
  function costoInvestigar(m, civ) { return 30 + civ.era * 20; }

  function registrarAvisos() {
    if (!SIM.Consejo || !SIM.Consejo.extras) return;
    var X = SIM.Consejo.extras, E = SIM.Consejo.efectos;

    // --- Conversión ---
    X.rel_conversion = {
      valido: function (m, civ, ev) {
        return !!(m.religion && civ.viva && m.civs[ev.otro] && m.civs[ev.otro].viva && m.religion.deCiv[civ.idx] !== ev.rel && m.religion.deCiv[ev.otro] === ev.rel);
      },
      plantilla: function (m, civ, ev) {
        var o = m.civs[ev.otro], r = rel(m, ev.rel), mia = relDeCiv(m, civ.idx);
        var pct = Math.round(feDeCiv(m, civ.idx)[ev.rel] * 100), costo = costoProhibir(m, civ);
        var ops = [{ texto: '🙏 Aceptar la conversión: el ' + r.nombre + ' pasa a ser nuestra religión', efectos: ['rel_adoptar:' + ev.rel + ':' + o.idx] }];
        if (civ.oro >= costo) ops.push({ texto: '🚫 Prohibir la prédica y echar a los misioneros (' + costo + ' de oro)', efectos: ['rel_prohibir:' + ev.rel + ':' + costo] });
        if (civ.rel[o.idx] !== 'guerra') ops.push({ texto: '⚔ ¡Guerra santa contra los ' + o.nombre + '!', efectos: ['guerra:' + o.idx, 'rel_santa:' + o.idx] });
        ops.push({ texto: '🤷 Que cada uno crea en lo que quiera', efectos: ['nada'] });
        return {
          titulo: r.icono + ' Los ' + o.nombre + ' quieren convertir a tu pueblo',
          texto: 'Misioneros del ' + r.nombre + ' recorren nuestras ciudades y ya los sigue el ' + pct + '% de nuestra gente' +
            (mia ? ' (nuestra religión oficial es el ' + mia.nombre + ')' : ' (todavía no tenemos religión oficial)') + '. Los ' + o.nombre + ' nos piden que la adoptemos. ¿Qué hacemos?',
          opciones: ops,
        };
      },
      decidir: function (m, civ, k) {
        var r = m.rng(), p = civ.datos.personalidad, mia = m.religion.deCiv[civ.idx];
        var ratio = ratioPoder(m, civ.idx, k.otro);
        if (mia >= 0 && ratio > 1.3 && r < p.agresion * 0.35) return primero(k, ['rel_santa']);
        if (mia < 0) return r < 0.75 ? primero(k, ['rel_adoptar']) : primero(k, ['nada']);
        if (!m.religion.fundo[civ.idx] && r < 0.4) return primero(k, ['rel_adoptar']);
        if (r < 0.6) return primero(k, ['rel_prohibir', 'nada']);
        return primero(k, ['nada']);
      },
    };
    E.rel_adoptar = function (m, civ, v, w) {
      var o = m.civs[+w];
      adoptar(m, civ, +v, 'convencidos por los ' + o.nombre);
      if (SIM.enGuerra(m, civ.idx, o.idx)) SIM.hacerPaz(m, civ.idx, o.idx);
      else { civ.amigos[o.idx] = true; o.amigos[civ.idx] = true; }
      stat(m, 'conversionesAceptadas');
    };
    E.rel_prohibir = function (m, civ, v, w) {
      var costo = +w, r = rel(m, +v);
      if (!r) return;
      if (civ.oro < costo) { SIM.registrar(m, civ.idx, 'religion', '🚫 Los ' + civ.nombre + ' quisieron prohibir el ' + r.nombre + ' pero no les alcanzó el oro'); return; }
      civ.oro -= costo;
      SIM.ciudadesDe(m, civ.idx).forEach(function (c) { if (c.fe && c.fe[r.id] && r.santa !== c.id) c.fe[r.id] *= 0.45; });
      stat(m, 'prohibiciones');
      SIM.registrar(m, civ.idx, 'religion', '🚫 Los ' + civ.nombre + ' prohíben el ' + r.nombre + ' y expulsan a sus misioneros');
    };
    E.rel_santa = function (m, civ, v) {
      var o = m.civs[+v], r = relDeCiv(m, civ.idx);
      if (!SIM.enGuerra(m, civ.idx, o.idx)) return;
      stat(m, 'guerrasSantas');
      SIM.registrar(m, civ.idx, 'religion', '⚔' + (r ? r.icono : '🔥') + ' ¡GUERRA SANTA! Los ' + civ.nombre + ' marchan contra los ' + o.nombre + (r ? ' en nombre del ' + r.nombre : ''));
    };

    // --- Cruzadas ---
    X.rel_cruzada = {
      valido: function (m, civ, ev) {
        var o = m.civs[ev.otro];
        return !!(m.religion && civ.viva && o && o.viva && civ.rel[o.idx] !== 'guerra' && m.religion.deCiv[civ.idx] >= 0 && m.religion.deCiv[o.idx] !== m.religion.deCiv[civ.idx]);
      },
      plantilla: function (m, civ, ev) {
        var o = m.civs[ev.otro], r = relDeCiv(m, civ.idx), ro = relDeCiv(m, o.idx);
        var fuerzas = ' Nuestro poder: ' + SIM.poder(m, civ.idx) + '. El de ellos: ' + SIM.poder(m, o.idx) + '.';
        var texto = ev.recuperar
          ? 'Nuestra ciudad santa, ' + r.santaNombre + ', está en manos de los ' + o.nombre + (ro ? ', que adoran el ' + ro.nombre : ', que no tienen fe') + '. Los sacerdotes piden una cruzada para recuperarla.' + fuerzas
          : 'Los sacerdotes del ' + r.nombre + ' dicen que los ' + o.nombre + (ro ? ' (fieles del ' + ro.nombre + ')' : '') + ' son infieles y piden una guerra santa.' + fuerzas;
        return {
          titulo: r.icono + (ev.recuperar ? ' ¡Cruzada por ' + r.santaNombre + '!' : ' El clero pide una guerra santa'),
          texto: texto,
          opciones: [
            { texto: '⚔ Proclamar la guerra santa contra los ' + o.nombre, efectos: ['guerra:' + o.idx, 'rel_santa:' + o.idx] },
            { texto: '🕊 La fe se defiende con palabras, no con espadas', efectos: ['nada'] },
          ],
        };
      },
      decidir: function (m, civ, k) {
        var p = civ.datos.personalidad, ratio = ratioPoder(m, civ.idx, k.otro);
        return m.rng() < p.agresion * Math.min(1.5, ratio / 1.2) * 0.8 ? primero(k, ['guerra']) : primero(k, ['nada']);
      },
    };

    // --- Paz entre hermanos de fe ---
    X.rel_concilio = {
      valido: function (m, civ, ev) { return !!(civ.viva && m.civs[ev.otro] && m.civs[ev.otro].viva && civ.rel[ev.otro] === 'guerra'); },
      plantilla: function (m, civ, ev) {
        var o = m.civs[ev.otro], r = relDeCiv(m, civ.idx);
        return {
          titulo: (r ? r.icono : '⛪') + ' El clero pide paz entre hermanos',
          texto: 'Los ' + o.nombre + ' también son fieles del ' + (r ? r.nombre : 'nuestra fe') + '. Los sacerdotes dicen que es pecado que hermanos de fe se maten entre sí y piden la paz. Nuestro poder: ' + SIM.poder(m, civ.idx) + '. El de ellos: ' + SIM.poder(m, o.idx) + '.',
          opciones: [
            { texto: '🕊 Firmar la paz entre hermanos de fe (el clero lo agradece con oro)', efectos: ['rel_paz:' + o.idx] },
            { texto: '⚔ Seguir la guerra (el clero se va a enojar)', efectos: ['rel_desoir:' + o.idx] },
          ],
        };
      },
      decidir: function (m, civ, k) {
        return m.rng() < (ratioPoder(m, civ.idx, k.otro) > 1.8 ? 0.35 : 0.7) ? 0 : 1;
      },
    };
    E.rel_paz = function (m, civ, v) {
      if (SIM.hacerPaz(m, civ.idx, +v)) {
        oroCivil(civ, 20 + civ.era * 5);
        stat(m, 'pacesReligiosas');
        SIM.registrar(m, civ.idx, 'religion', '⛪ El clero celebra: los ' + civ.nombre + ' y los ' + m.civs[+v].nombre + ' dejan de pelear entre hermanos de fe');
      }
    };
    E.rel_desoir = function (m, civ) {
      var mia = m.religion.deCiv[civ.idx];
      if (mia >= 0) SIM.ciudadesDe(m, civ.idx).forEach(function (c) { if (c.fe && c.fe[mia] && rel(m, mia).santa !== c.id) c.fe[mia] *= 0.9; });
      SIM.registrar(m, civ.idx, 'religion', '😠 El clero de los ' + civ.nombre + ' está furioso: el rey no escucha a los sacerdotes');
    };

    // --- Sociedades secretas ---
    X.secta_rumor = {
      valido: function (m, civ, ev) {
        var s = m.religion && secta(m, ev.secta), c = SIM.ciudadPorId(m, ev.ciudad);
        return !!(civ.viva && s && s.viva && c && c.civ === civ.idx && s.conoce[civ.idx] !== 'miembro');
      },
      plantilla: function (m, civ, ev) {
        var s = secta(m, ev.secta), c = SIM.ciudadPorId(m, ev.ciudad), costo = costoInvestigar(m, civ);
        var sabe = s.conoce[civ.idx] === 'descubierta', ops = [];
        if (civ.oro >= costo) ops.push({ texto: '🔍 Investigar a fondo (' + costo + ' de oro)', efectos: ['secta_investigar:' + s.id + ':' + c.id] });
        ops.push({ texto: '🔺 Buscarlos… y unirnos a la secta', efectos: ['secta_unirse:' + s.id] });
        ops.push({ texto: '🤷 Son habladurías, ignorarlos', efectos: ['nada'] });
        return {
          titulo: '🔺 Rumores de una sociedad secreta en ' + c.nombre,
          texto: (sabe ? s.nombre + ' volvió a aparecer. ' : 'Encapuchados que se juntan de noche, símbolos raros en las paredes y un ojo dentro de un triángulo. ') +
            'Dicen que una sociedad secreta está metiendo a su gente en el gobierno de ' + c.nombre + '. Si la investigamos quizás la desarmemos; si nos unimos, nos puede pasar oro e información… hasta que alguien se entere.',
          opciones: ops,
        };
      },
      decidir: function (m, civ, k) {
        var r = m.rng(), inv = indiceCon(k, 'secta_investigar');
        if (inv >= 0 && r < 0.6) return inv;
        if (r < 0.7) return primero(k, ['secta_unirse']);
        return primero(k, ['nada']);
      },
    };
    E.secta_investigar = function (m, civ, v, w) {
      var s = secta(m, +v), c = SIM.ciudadPorId(m, +w), costo = costoInvestigar(m, civ);
      if (!s || !s.viva) return;
      if (civ.oro < costo) { SIM.registrar(m, civ.idx, 'secta', '🔍 Los ' + civ.nombre + ' no tenían oro para investigar los rumores'); return; }
      civ.oro -= costo;
      var nivel = c && s.infl[c.id] ? s.infl[c.id] : 0.2;
      var exito = m.rng() < 0.45 + (s.conoce[civ.idx] === 'descubierta' ? 0.2 : 0) + (1 - nivel) * 0.2;
      stat(m, 'investigaciones');
      if (exito) {
        s.conoce[civ.idx] = 'descubierta';
        var n = purgar(m, s, civ.idx, 0);
        for (var id in s.infl) s.infl[id] *= 0.8;
        stat(m, 'investigacionesExito');
        SIM.registrar(m, civ.idx, 'secta', '👁 ¡Los ' + civ.nombre + ' desenmascararon a ' + s.nombre + (c ? ' en ' + c.nombre : '') + '! ' + (n > 1 ? 'Limpiaron ' + n + ' ciudades de conspiradores' : 'Los conspiradores van presos'));
        if (totalSecta(s) < 0.12) disolver(m, s, '👁 Sin su red de espías, ' + s.nombre + ' se desarma. Por ahora…');
      } else {
        if (c && s.infl[c.id] !== undefined) s.infl[c.id] = Math.min(1, s.infl[c.id] + 0.1);
        SIM.registrar(m, civ.idx, 'secta', '🔍 Los ' + civ.nombre + ' investigaron los rumores' + (c ? ' en ' + c.nombre : '') + ' pero no encontraron nada… o alguien quemó las pruebas');
      }
    };
    E.secta_unirse = function (m, civ, v) {
      var s = secta(m, +v);
      if (!s || !s.viva) return;
      s.miembros[civ.idx] = m.turno;
      s.conoce[civ.idx] = 'miembro';
      oroCivil(civ, 25);
      stat(m, 'uniones');
      SIM.registrar(m, civ.idx, 'secta', '🔺 Un anillo con un ojo grabado llega en secreto a la corte de los ' + civ.nombre + '…');
    };
    E.secta_revelar = function (m, civ, v) {
      var s = secta(m, +v);
      if (!s || !s.viva) return;
      s.conoce[civ.idx] = 'descubierta';
      purgar(m, s, civ.idx, 0.3);
      stat(m, 'revelaciones');
      SIM.registrar(m, civ.idx, 'secta', '⛓ Los ' + civ.nombre + ' arrestaron a un emisario de ' + s.nombre + ' y el secreto salió a la luz');
      if (totalSecta(s) < 0.12) disolver(m, s);
    };

    X.secta_pacto = {
      valido: function (m, civ, ev) { var s = m.religion && secta(m, ev.secta); return !!(civ.viva && s && s.viva && s.miembros[civ.idx] === undefined); },
      plantilla: function (m, civ, ev) {
        var s = secta(m, ev.secta), cant = Object.keys(s.infl).length;
        return {
          titulo: '👁 Un emisario encapuchado pide audiencia',
          texto: 'Dice representar a ' + s.nombre + ', una hermandad que tiene "amigos" en ' + cant + ' ciudades del mundo. Ofrece oro e información a cambio de que miremos para otro lado. Si algún día se descubre el pacto, va a ser un escándalo.',
          opciones: [
            { texto: '🔺 Aceptar el pacto secreto', efectos: ['secta_unirse:' + s.id] },
            { texto: '⛓ Arrestarlo y denunciar a la secta', efectos: ['secta_revelar:' + s.id] },
            { texto: '🤷 Echarlo sin hacer ruido', efectos: ['nada'] },
          ],
        };
      },
      decidir: function (m, civ) {
        var r = m.rng(), p = civ.datos.personalidad;
        if (r < 0.12 + p.agresion * 0.15) return 0;
        return r < 0.7 ? 1 : 2;
      },
    };
  }

  // ---------- mapa ----------
  function dibujar(g, render, ahora) {
    var m = render.m;
    if (!m || !m.religion || render.escala < 10) return;
    var s = render.escala, L = m.religion.lista, sec = sectaActiva(m);
    var verSecta = !!(sec && laConoce(m, sec));
    if (!L.length && !verSecta) return;
    var W = render.ancho || 99999, H = render.alto || 99999;
    var pulso = 0.7 + 0.25 * Math.sin(ahora / 400);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var i = 0; i < m.ciudades.length; i++) {
      var c = m.ciudades[i];
      var r = c.feMayor !== undefined && c.feMayor >= 0 ? L[c.feMayor] : null;
      var marcada = verSecta && (sec.infl[c.id] || 0) >= 0.2;
      if (!r && !marcada) continue;
      var p = render.aPantalla(c.x, c.y);
      if (p[0] < -40 || p[1] < -40 || p[0] > W + 40 || p[1] > H + 40) continue;
      var tam = Math.max(26, s * (2.1 + Math.min(c.pop, 30) / 30 * 1.6));
      var ts = Math.max(11, Math.min(20, tam * 0.2));
      if (r) {
        var x = p[0] + tam * 0.4, y = p[1] - tam * 0.42;
        g.fillStyle = 'rgba(10,14,24,0.72)';
        g.beginPath(); g.arc(x, y, ts * 0.68, 0, 6.2832); g.fill();
        g.strokeStyle = r.color; g.lineWidth = r.santa === c.id ? 2.2 : 1;
        g.stroke();
        g.fillStyle = r.color;
        g.font = (r.sym ? 'bold ' + Math.round(ts * 0.95) + 'px ' + FUENTE_SIMBOLO : Math.round(ts * 0.85) + 'px ' + FUENTE_EMOJI);
        g.fillText(r.icono, x, y + 1);
      }
      if (marcada) {
        g.globalAlpha = pulso;
        var sx = p[0] - tam * 0.44, sy = p[1] + tam * 0.08;
        g.fillStyle = 'rgba(40,0,34,0.75)';
        g.beginPath(); g.arc(sx, sy, ts * 0.7, 0, 6.2832); g.fill();
        g.font = Math.round(ts * 0.95) + 'px ' + FUENTE_EMOJI;
        g.fillStyle = '#ff5ad9';
        g.fillText('🔺', sx, sy + 1);
        g.globalAlpha = 1;
      }
    }
  }

  // ---------- panel lateral ----------
  var ultimoHtml = '', seccion = null;
  function esc(t) { return String(t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }

  function panel(m, humano) {
    if (typeof document === 'undefined' || !m || !m.religion || !m.civs[humano]) return;
    if (!seccion || !seccion.isConnected) seccion = document.getElementById('sec-religion');
    if (!seccion) return;
    m.religion.yo = humano;
    var L = m.religion.lista, yo = m.civs[humano], mia = relDeCiv(m, humano), k = m.religion.conteo;
    var h = '<h3>⛪ Religión <span class="sub">(la fe de tu pueblo)</span></h3>';
    var misCiudades = SIM.ciudadesDe(m, humano);
    if (mia) {
      var siguen = misCiudades.filter(function (c) { return c.feMayor === mia.id; }).length, b = bonoFe(m, humano);
      h += '<div class="rel-mia"><span class="ico" style="color:' + mia.color + '">' + mia.icono + '</span><div><b>' + esc(mia.nombre) + '</b>' +
        (mia.fundador === humano ? ' <span class="tag">fundada por vos</span>' : ' <span class="tag">de los ' + esc(m.civs[mia.fundador].nombre) + '</span>') +
        '<div class="det">Ciudad santa: ' + esc(mia.santaNombre) + ' · te siguen ' + siguen + ' de ' + misCiudades.length + ' ciudades · +' + b.oro.toFixed(1) + ' 💰 +' + b.ciencia.toFixed(2) + ' 📚 por turno</div></div></div>';
    } else {
      h += '<div class="rel-mia vacia">Tu pueblo no tiene religión todavía' + (yo.era < 1 ? ' (las religiones aparecen desde la Era Clásica).' : ': puede nacer en tu capital en cualquier momento, o podés adoptar la de un vecino.') + '</div>';
    }
    if (L.length && k) {
      var total = Math.max(1, m.ciudades.length);
      h += '<div class="rel-barras">';
      L.forEach(function (r) {
        var n = k.porRel[r.id] || 0, pct = Math.round(n / total * 100);
        h += '<div class="rel-fila' + (mia && mia.id === r.id ? ' mia' : '') + '" title="' + esc(r.nombre) + ': mayoría en ' + n + ' ciudades (fundada por los ' + esc(m.civs[r.fundador].nombre) + ')">' +
          '<span class="n"><span style="color:' + r.color + '">' + r.icono + '</span> ' + esc(r.nombre) + '</span>' +
          '<span class="bar"><i style="width:' + pct + '%;background:' + r.color + '"></i></span><span class="k">' + n + '</span></div>';
      });
      h += '<div class="rel-fila sin"><span class="n">🗿 Sin fe mayoritaria</span><span class="bar"><i style="width:' + Math.round(k.sinFe / total * 100) + '%"></i></span><span class="k">' + k.sinFe + '</span></div>';
      h += '</div>';
    }
    var s = sectaActiva(m), txt;
    if (!s) {
      var vieja = m.religion.sectas.length ? m.religion.sectas[m.religion.sectas.length - 1] : null;
      txt = vieja && (vieja.conoce[humano] === 'descubierta' || vieja.conoce[humano] === 'miembro')
        ? 'por ahora ninguna (' + esc(vieja.nombre) + ' se disolvió).'
        : 'ni noticias. Todo parece tranquilo… demasiado tranquilo.';
    } else {
      var sabe = s.conoce[humano] || '', ids = Object.keys(s.infl), mias = 0;
      ids.forEach(function (id) { var c = SIM.ciudadPorId(m, +id); if (c && c.civ === humano && s.infl[id] >= 0.2) mias++; });
      if (sabe === 'miembro') txt = 'sos miembro de <b>' + esc(s.nombre) + '</b> 👁. Tiene gente en ' + ids.length + ' ciudades y ya te pasó ' + Math.floor(s.pagado[humano] || 0) + ' de oro. Ojo con los escándalos.';
      else if (sabe === 'descubierta') txt = 'descubriste a <b>' + esc(s.nombre) + '</b>. Se sospecha que infiltró ' + ids.length + ' ciudades' + (mias ? ', ' + mias + ' tuyas' : '') + ' (🔺 en el mapa).';
      else txt = 'se oyen rumores de una sociedad secreta, pero nadie sabe quiénes son' + (mias ? '. Algo raro pasa en tus ciudades…' : '.');
    }
    h += '<div class="rel-secta"><b>🔺 Sociedades secretas:</b> ' + txt + '</div>';
    if (h !== ultimoHtml) { ultimoHtml = h; seccion.innerHTML = h; }
    if (seccion.classList.contains('oculto')) seccion.classList.remove('oculto');
  }

  registrarAvisos();
  SIM.modulos = SIM.modulos || [];
  SIM.Religion = { iniciar: iniciar, turno: turno, dibujar: dibujar, panel: panel, sectaActiva: sectaActiva, feDeCiv: feDeCiv };
  SIM.modulos.push(SIM.Religion);
})();
