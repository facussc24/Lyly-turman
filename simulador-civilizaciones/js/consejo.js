/* Consejos: las decisiones que toma cada bando (vos, Claude o la IA del juego).
   Acá están las preguntas, cómo decide la IA del juego y el texto que se le manda a Claude. */
var SIM = SIM || {};

SIM.Consejo = (function () {
  var sigId = 1;

  function st(m, idx) { return SIM.estadisticas(m, idx); }
  function nombreEra(i) { return SIM.ERAS[i].nombre; }
  function relacionTexto(m, civ, o) {
    if (!civ.conoce[o.idx]) return 'todavía no se conocen';
    if (civ.rel[o.idx] === 'guerra') return 'EN GUERRA';
    if (civ.tregua[o.idx] > m.turno) return 'paz (tregua vigente)';
    return 'paz' + (civ.amigos[o.idx] ? ' y comercio' : '');
  }
  function controlTexto(c) { return c.control === 'humano' ? 'el jugador humano' : (c.control === 'claude' ? 'Claude' : 'IA del juego'); }

  // Cada plantilla devuelve { titulo, texto, opciones: [{texto, efectos}] }
  var PLANTILLAS = {
    rumbo: function (m, civ) {
      var e = st(m, civ.idx);
      return {
        titulo: 'Rumbo de la civilización',
        texto: 'Año ' + SIM.anioTexto(m.turno) + '. Tenemos ' + e.ciudades + ' ciudades, ' + e.pop + ' de población y ' + e.militares + ' unidades militares. ¿En qué nos enfocamos ahora?',
        opciones: [
          { texto: '🏕 Expandirnos: fundar nuevas ciudades', efectos: ['foco:expansion'] },
          { texto: '💰 Economía: granjas, talleres y mercados', efectos: ['foco:economia'] },
          { texto: '📚 Ciencia: llegar antes a la próxima era', efectos: ['foco:ciencia'] },
          { texto: '⚔ Ejército: entrenar tropas', efectos: ['foco:militar'] },
        ],
      };
    },
    contacto: function (m, civ, ev) {
      var o = m.civs[ev.otro], e = st(m, o.idx);
      return {
        titulo: 'Primer contacto con los ' + o.nombre,
        texto: 'Nuestros exploradores se encontraron con los ' + o.nombre + ' (' + e.ciudades + ' ciudades, ' + e.militares + ' unidades, Era ' + nombreEra(o.era) + '). ¿Qué hacemos?',
        opciones: [
          { texto: '🤝 Paz y comercio', efectos: ['amistad:' + o.idx] },
          { texto: '👀 Mantener la paz pero armarnos', efectos: ['foco:militar'] },
          { texto: '⚔ Declararles la guerra', efectos: ['guerra:' + o.idx] },
        ],
      };
    },
    guerra_recibida: function (m, civ, ev) {
      var o = m.civs[ev.otro];
      return {
        titulo: '¡Guerra!',
        texto: '¡Los ' + o.nombre + ' nos declararon la guerra! Nuestro poder militar: ' + SIM.poder(m, civ.idx) + '. El de ellos: ' + SIM.poder(m, o.idx) + '.',
        opciones: [
          { texto: '🛡 Defendernos: murallas y tropas', efectos: ['postura:defensa', 'murallas:si', 'foco:militar'] },
          { texto: '⚔ Contraatacar', efectos: ['postura:ataque:' + o.idx, 'foco:militar'] },
          { texto: '🕊 Pedirles la paz', efectos: ['paz_proponer:' + o.idx] },
        ],
      };
    },
    propuesta_paz: function (m, civ, ev) {
      var o = m.civs[ev.otro];
      return {
        titulo: 'Propuesta de paz',
        texto: 'Los ' + o.nombre + ' nos proponen la paz. Nuestro poder militar: ' + SIM.poder(m, civ.idx) + '. El de ellos: ' + SIM.poder(m, o.idx) + '.',
        opciones: [
          { texto: '🕊 Aceptar la paz', efectos: ['paz_aceptar:' + o.idx] },
          { texto: '⚔ Rechazarla y seguir peleando', efectos: ['paz_rechazar:' + o.idx] },
        ],
      };
    },
    nueva_era: function (m, civ, ev) {
      var nuevas = [];
      for (var k in SIM.UNIDADES) {
        var d = SIM.UNIDADES[k];
        if (d.era === ev.era && (!d.civ || d.civ === civ.clave) && d.rol !== 'colono') nuevas.push(d.icono + ' ' + d.nombre);
      }
      var ops = [];
      if (ev.era >= 5) ops.push({ texto: '✈ Crear una fuerza aérea', efectos: ['aire:si'] });
      ops.push({ texto: '⛵ Construir una flota', efectos: ['armada:si'] });
      ops.push({ texto: '⚔ Reforzar el ejército', efectos: ['foco:militar'] });
      ops.push({ texto: '💰 Aprovechar para crecer', efectos: ['foco:economia'] });
      if (ev.era === 3 && !civ.plan.maravilla) ops.push({ texto: '🏛 Empezar una Maravilla', efectos: ['maravilla:si'] });
      return {
        titulo: '¡Nueva era: ' + nombreEra(ev.era) + '!',
        texto: 'Los ' + civ.nombre + ' entran en la Era ' + nombreEra(ev.era) + '. Se desbloquean: ' + (nuevas.join(', ') || 'mejoras') + '. ¿Qué priorizamos?',
        opciones: ops,
      };
    },
    oportunidad: function (m, civ, ev) {
      var o = m.civs[ev.otro];
      return {
        titulo: 'Oportunidad militar',
        texto: 'Nuestro ejército (poder ' + SIM.poder(m, civ.idx) + ') supera al de los ' + o.nombre + ' (poder ' + SIM.poder(m, o.idx) + '). ¿Los atacamos?',
        opciones: [
          { texto: '⚔ ¡Al ataque!', efectos: ['guerra:' + o.idx] },
          { texto: '🕊 No, seguimos en paz', efectos: ['nada'] },
        ],
      };
    },
    ciudad_perdida: function (m, civ, ev) {
      var o = m.civs[ev.otro];
      return {
        titulo: '¡Perdimos ' + ev.ciudad + '!',
        texto: 'Los ' + o.nombre + ' conquistaron ' + ev.ciudad + '. Nuestro poder: ' + SIM.poder(m, civ.idx) + '. El de ellos: ' + SIM.poder(m, o.idx) + '.',
        opciones: [
          { texto: '⚔ Recuperarla', efectos: ['postura:ataque:' + o.idx, 'foco:militar'] },
          { texto: '🛡 Reforzar las demás ciudades', efectos: ['postura:defensa', 'murallas:si'] },
          { texto: '🕊 Pedir la paz', efectos: ['paz_proponer:' + o.idx] },
        ],
      };
    },
    traicion: function (m, civ, ev) {
      var c = SIM.ciudadPorId(m, ev.ciudad), o = m.civs[ev.otro], costo = SIM.costoLealtad(m, c);
      var ops = [];
      if (civ.oro >= costo) ops.push({ texto: '💰 Pagarle al gobernador (' + costo + ' de oro)', efectos: ['lealtad:' + c.id + ':pagar'] });
      ops.push({ texto: '⛓ Arrestar a los traidores (la ciudad pierde gente)', efectos: ['lealtad:' + c.id + ':arrestar'] });
      ops.push({ texto: '🤷 Son rumores, ignorarlos', efectos: ['nada'] });
      return {
        titulo: '🕵 Rumores de traición en ' + c.nombre,
        texto: 'Dicen que ' + c.intriga.texto + '. Si no hacés nada, ' + c.nombre + ' se puede pasar a los ' + o.nombre + ' con sus tropas.',
        opciones: ops,
      };
    },
    maravilla_rival: function (m, civ, ev) {
      var o = m.civs[ev.otro];
      var faltan = SIM.TURNOS_MARAVILLA - (m.turno - o.maravillaDesde);
      var ops = [];
      if (civ.rel[o.idx] !== 'guerra') ops.push({ texto: '⚔ Declararles la guerra e ir a destruirla', efectos: ['guerra:' + o.idx] });
      else ops.push({ texto: '⚔ Atacar su Maravilla', efectos: ['postura:ataque:' + o.idx, 'foco:militar'] });
      if (civ.era >= 3) ops.push({ texto: '🏛 Construir nuestra propia Maravilla', efectos: ['maravilla:si'] });
      ops.push({ texto: '🤷 Ignorarlos', efectos: ['nada'] });
      return {
        titulo: '¡Maravilla rival!',
        texto: 'Los ' + o.nombre + ' terminaron una Maravilla. Si la mantienen ' + faltan + ' turnos más, ganan la partida.',
        opciones: ops,
      };
    },
  };

  // Otros módulos pueden sumar tipos de aviso: SIM.Consejo.extras[tipo] = { plantilla, valido, decidir }
  // y efectos: SIM.Consejo.efectos[clave] = function (m, civ, v, w) {}
  var extras = {}, efectosExtra = {};

  function valido(m, civ, ev) {
    if (extras[ev.tipo]) return extras[ev.tipo].valido ? extras[ev.tipo].valido(m, civ, ev) : true;
    var o = ev.otro !== undefined ? m.civs[ev.otro] : null;
    if (o && !o.viva) return false;
    switch (ev.tipo) {
      case 'guerra_recibida': case 'propuesta_paz': case 'ciudad_perdida': return civ.rel[o.idx] === 'guerra';
      case 'oportunidad': return civ.rel[o.idx] !== 'guerra' && civ.tregua[o.idx] <= m.turno;
      case 'contacto': return civ.rel[o.idx] !== 'guerra';
      case 'maravilla_rival': return o.maravillaDesde !== null;
      case 'traicion': var ct = SIM.ciudadPorId(m, ev.ciudad); return !!(ct && ct.civ === civ.idx && ct.intriga);
      default: return true;
    }
  }

  function crear(m, civ, ev) {
    var p = extras[ev.tipo] ? extras[ev.tipo].plantilla(m, civ, ev) : PLANTILLAS[ev.tipo](m, civ, ev);
    if (!p) return null;
    p.opciones = p.opciones.filter(function (op) {
      return !op.efectos.some(function (e) {
        if (e.indexOf('guerra:') !== 0) return false;
        return civ.tregua[+e.split(':')[1]] > m.turno;
      });
    });
    if (!p.opciones.length) return null;
    p.id = sigId++; p.civ = civ.idx; p.tipo = ev.tipo; p.otro = ev.otro; p.turno = m.turno; p.estado = 'esperando';
    return p;
  }

  function controlEfectivo(m, civ) {
    if (m.todoBot || civ.control === 'bot') return 'bot';
    if (civ.control === 'humano') return m.pilotoAutomatico ? 'bot' : 'humano';
    return m.claudeActivo ? 'claude' : 'bot';
  }

  function buscarOportunidad(m, civ) {
    var miPoder = SIM.poder(m, civ.idx), mejor = null;
    var mejorRatio = civ.control === 'bot' && civ.datos.personalidad.agresion >= 0.7 ? 0.95 : 1.15;
    m.civs.forEach(function (o) {
      if (o === civ || !o.viva || !civ.conoce[o.idx] || civ.rel[o.idx] === 'guerra' || civ.tregua[o.idx] > m.turno) return;
      var r = miPoder / Math.max(5, SIM.poder(m, o.idx));
      if (civ.amigos[o.idx]) r *= 0.7;
      if (r > mejorRatio) { mejorRatio = r; mejor = o.idx; }
    });
    return mejor;
  }

  function revisar(m) {
    m.civs.forEach(function (civ) {
      if (!civ.viva) return;
      if (m.turno >= civ.proximoRumbo) {
        civ.proximoRumbo = m.turno + 100;
        // El jugador cambia el rumbo cuando quiere desde el panel: a él no le preguntamos
        if (civ.control !== 'humano') SIM.encolarEvento(m, civ, { tipo: 'rumbo' }, 1);
      }
      if (m.turno >= civ.proximaOportunidad) {
        civ.proximaOportunidad = m.turno + 60;
        var obj = buscarOportunidad(m, civ);
        if (obj !== null) SIM.encolarEvento(m, civ, { tipo: 'oportunidad', otro: obj }, 2);
      }
      // La IA del juego pide la paz si viene perdiendo una guerra larga
      if (controlEfectivo(m, civ) === 'bot' && m.turno % 40 === (civ.idx * 7) % 40) {
        civ.rel.forEach(function (r, o) {
          if (r !== 'guerra') return;
          if (m.turno - civ.guerraDesde[o] > 120 && SIM.poder(m, civ.idx) < SIM.poder(m, o) * 0.8 && m.rng() < 0.5) SIM.proponerPaz(m, civ.idx, o);
        });
      }
      // Descartar eventos viejos poco importantes
      civ.eventos = civ.eventos.filter(function (e) { return e.prioridad >= 4 || m.turno - e.turno < 60; });
      if (!civ.eventos.length) return;
      if (m.consejos.some(function (k) { return k.civ === civ.idx; })) return;
      var control = controlEfectivo(m, civ);
      civ.eventos.sort(function (a, b) { return b.prioridad - a.prioridad; });
      var espera = control === 'bot' ? 0 : 15;
      if (m.turno - civ.ultimoConsejo < espera && civ.eventos[0].prioridad < 5) return;
      while (civ.eventos.length) {
        var ev = civ.eventos.shift();
        if (!valido(m, civ, ev)) continue;
        var consejo = crear(m, civ, ev);
        if (!consejo) continue;
        civ.ultimoConsejo = m.turno;
        if (control === 'bot') resolver(m, consejo, decidirBot(m, civ, consejo), { fuente: 'bot' });
        else { consejo.control = control; m.consejos.push(consejo); }
        break;
      }
    });
  }

  function aplicarEfecto(m, civ, efecto) {
    var p = efecto.split(':'), k = p[0], v = p[1], w = p[2];
    switch (k) {
      case 'foco': civ.plan.foco = v; break;
      case 'postura': civ.plan.postura = v; if (w !== undefined) civ.plan.objetivo = +w; break;
      case 'guerra':
        if (SIM.declararGuerra(m, civ.idx, +v)) { civ.plan.postura = 'ataque'; civ.plan.objetivo = +v; }
        break;
      case 'paz_proponer': SIM.proponerPaz(m, civ.idx, +v); break;
      case 'paz_aceptar': SIM.hacerPaz(m, civ.idx, +v); break;
      case 'paz_rechazar': SIM.registrar(m, civ.idx, 'diplomacia', '✋ Los ' + civ.nombre + ' rechazaron la paz con los ' + m.civs[+v].nombre); break;
      case 'amistad':
        civ.amigos[+v] = true;
        SIM.registrar(m, civ.idx, 'diplomacia', '🤝 Los ' + civ.nombre + ' abren el comercio con los ' + m.civs[+v].nombre);
        break;
      case 'armada': civ.plan.armada = v === 'si'; break;
      case 'aire': civ.plan.aire = v === 'si'; break;
      case 'maravilla': civ.plan.maravilla = v === 'si'; break;
      case 'murallas': civ.plan.murallas = v === 'si'; break;
      case 'lealtad': SIM.resolverIntriga(m, +v, w); break;
      default: if (efectosExtra[k]) efectosExtra[k](m, civ, v, w);
    }
  }

  function resolver(m, consejo, indice, info) {
    var civ = m.civs[consejo.civ];
    var op = consejo.opciones[indice] || consejo.opciones[0];
    m.consejos = m.consejos.filter(function (k) { return k.id !== consejo.id; });
    if (!civ.viva) return;
    op.efectos.forEach(function (e) { aplicarEfecto(m, civ, e); });
    var quien = info.fuente === 'claude' ? ' 🤖' : (info.fuente === 'humano' ? ' 👤' : '');
    var nota = info.fuente === 'bot' && civ.control !== 'bot' ? (civ.control === 'claude' ? ' (decidió la IA del juego en lugar de Claude)' : ' (piloto automático)') : '';
    SIM.registrar(m, civ.idx, 'decision', '🗳 ' + civ.nombre + quien + ' — ' + consejo.titulo + ': ' + op.texto + nota);
    if (info.mensaje) SIM.registrar(m, civ.idx, 'mensaje', '💬 ' + civ.nombre + ' (Claude): "' + info.mensaje + '"');
    if (info.razon) {
      civ.diario.push({ anio: SIM.anioTexto(m.turno), titulo: consejo.titulo, decision: op.texto, texto: info.razon, mensaje: info.mensaje || '' });
      if (civ.diario.length > 50) civ.diario.shift();
    }
  }

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

  function decidirBot(m, civ, consejo) {
    if (extras[consejo.tipo] && extras[consejo.tipo].decidir) return extras[consejo.tipo].decidir(m, civ, consejo) || 0;
    var p = civ.datos.personalidad, r = m.rng();
    var ratio = consejo.otro !== undefined ? SIM.poder(m, civ.idx) / Math.max(5, SIM.poder(m, consejo.otro)) : 1;
    var enGuerra = SIM.enemigosDe(m, civ).length > 0;
    var nCiudades = SIM.ciudadesDe(m, civ.idx).length;
    switch (consejo.tipo) {
      case 'rumbo': {
        var pesos = {
          'foco:expansion': p.expansion * (nCiudades < 7 ? 1.6 : 0.4) * (m.turno < civ.sinSitioHasta ? 0.1 : 1),
          'foco:economia': 0.6,
          'foco:ciencia': p.ciencia,
          'foco:militar': p.agresion * 0.7 + (enGuerra ? 1.3 : 0),
        };
        var total = 0, k;
        for (k in pesos) total += pesos[k];
        var x = r * total;
        for (k in pesos) { x -= pesos[k]; if (x <= 0) return primero(consejo, [k]); }
        return 0;
      }
      case 'contacto':
        if (p.agresion * ratio > 0.9 && r < p.agresion * 0.6) return primero(consejo, ['guerra']);
        return r < 0.65 ? primero(consejo, ['amistad']) : primero(consejo, ['foco:militar']);
      case 'guerra_recibida':
        if (ratio < 0.6 && r < 0.6) return primero(consejo, ['paz_proponer']);
        if (ratio > 1.1) return primero(consejo, ['postura:ataque']);
        return primero(consejo, ['postura:defensa']);
      case 'propuesta_paz':
        if (ratio < 1 || m.turno - civ.guerraDesde[consejo.otro] > 150 || r < 0.25) return primero(consejo, ['paz_aceptar']);
        return primero(consejo, ['paz_rechazar']);
      case 'nueva_era':
        if (civ.era >= 5 && r < 0.6) return primero(consejo, ['aire']);
        if (r < p.mar * 0.7) return primero(consejo, ['armada']);
        if (civ.era === 3 && r < 0.2) return primero(consejo, ['maravilla']);
        return r < 0.5 + p.agresion * 0.3 ? primero(consejo, ['foco:militar']) : primero(consejo, ['foco:economia']);
      case 'oportunidad':
        return r < p.agresion * Math.min(1.5, ratio / 1.1) ? primero(consejo, ['guerra']) : primero(consejo, ['nada']);
      case 'ciudad_perdida':
        if (ratio > 0.9) return primero(consejo, ['postura:ataque']);
        if (ratio < 0.5) return primero(consejo, ['paz_proponer']);
        return primero(consejo, ['postura:defensa']);
      case 'traicion':
        if (primero(consejo, ['lealtad']) === 0 && consejo.opciones[0].efectos[0].indexOf(':pagar') > 0 && r < 0.75) return 0;
        return r < 0.6 ? primero(consejo, ['lealtad']) : primero(consejo, ['nada']);
      case 'maravilla_rival':
        if (ratio > 0.7 || r < p.agresion) return primero(consejo, ['guerra', 'postura:ataque']);
        return r < 0.3 ? primero(consejo, ['maravilla']) : primero(consejo, ['nada']);
    }
    return 0;
  }

  // ---------- Claude ----------
  function promptClaude(m, consejo) {
    var civ = m.civs[consejo.civ], e = st(m, civ.idx), plan = civ.plan;
    var humano = m.civs.filter(function (c) { return c.control === 'humano'; })[0];
    var sistema = 'Sos Claude y estás jugando un simulador de civilizaciones (inspirado en Age of Empires II: The Conquerors) ' +
      'contra un jugador humano' + (humano ? ' que maneja a los ' + humano.nombre : '') + ' y contra otras IAs del juego. ' +
      'Vos manejás a los ' + civ.nombre + '. No movés unidades: sos el consejero que toma las grandes decisiones y la simulación ejecuta el resto sola. ' +
      'Querés ganar (por conquista, con una Maravilla o por puntaje en el año 2050), pero jugás con personalidad, con estrategia y con algo de humor. ' +
      'Respondé SOLO con el JSON pedido: "opcion" es el número de la opción elegida; "mensaje" es una frase corta (máximo 140 caracteres, en español rioplatense) ' +
      'que ven los demás jugadores: puede ser diplomática, una amenaza o una cargada; "razon" explica en 1 o 2 oraciones por qué elegiste eso (va a tu diario).';
    var l = [];
    l.push('Año ' + SIM.anioTexto(m.turno) + ' (turno ' + m.turno + ' de ' + SIM.TURNO_FINAL + ').');
    l.push('TUS ' + civ.nombre.toUpperCase() + ': Era ' + nombreEra(civ.era) + ', ' + e.ciudades + ' ciudades, población ' + e.pop +
      ', ' + e.militares + ' unidades militares (poder ' + e.poder + '), oro ' + e.oro + ', ciencia ' + e.ciencia + (e.proximaEra ? '/' + e.proximaEra + ' para la próxima era' : '') + '.');
    l.push('Bonus: ' + civ.datos.bonus + '. Unidad única: ' + SIM.UNIDADES[civ.datos.unica].nombre + ' (Era ' + nombreEra(SIM.UNIDADES[civ.datos.unica].era) + ').');
    l.push('Plan actual: foco ' + SIM.FOCOS[plan.foco].nombre + ', postura ' + plan.postura +
      (plan.postura === 'ataque' && plan.objetivo >= 0 ? ' contra los ' + m.civs[plan.objetivo].nombre : '') +
      (plan.armada ? ', con flota' : '') + (plan.aire ? ', con fuerza aérea' : '') + (plan.maravilla ? ', construyendo Maravilla' : '') + '.');
    l.push('OTRAS CIVILIZACIONES:');
    m.civs.forEach(function (o) {
      if (o === civ) return;
      if (!o.viva) { l.push('- ' + o.nombre + ': eliminados.'); return; }
      var eo = st(m, o.idx);
      l.push('- ' + o.nombre + ' (' + controlTexto(o) + '): Era ' + nombreEra(o.era) + ', ' + eo.ciudades + ' ciudades, población ' + eo.pop +
        ', poder militar ' + eo.poder + '. Relación: ' + relacionTexto(m, civ, o) + (o.maravillaDesde !== null ? '. ¡Tienen una Maravilla!' : '') + '.');
    });
    var ult = m.cronica.slice(-12).map(function (c) { return '  ' + c.anio + ': ' + c.texto; });
    l.push('ÚLTIMOS SUCESOS:');
    l = l.concat(ult);
    if (civ.diario.length) {
      l.push('TUS DECISIONES ANTERIORES:');
      civ.diario.slice(-4).forEach(function (d) { l.push('  ' + d.anio + ': ' + d.decision + ' (' + d.texto + ')'); });
    }
    l.push('');
    l.push('DECISIÓN: ' + consejo.titulo + '. ' + consejo.texto);
    consejo.opciones.forEach(function (op, i) { l.push((i + 1) + ') ' + op.texto); });
    return { sistema: sistema, prompt: l.join('\n') };
  }

  return {
    revisar: revisar, resolver: resolver, decidirBot: decidirBot, promptClaude: promptClaude,
    controlEfectivo: controlEfectivo, aplicarEfecto: aplicarEfecto,
    extras: extras, efectos: efectosExtra,
  };
})();
