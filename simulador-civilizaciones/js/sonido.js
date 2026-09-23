/* Sonidos sintetizados con WebAudio (no hacen falta archivos): batallas, poderes y clics. */
var SIM = SIM || {};

SIM.Sonido = (function () {
  var ctx = null, maestro = null, activo = true, ultimos = {}, porSegundo = 0, segundo = 0;

  function iniciar() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    maestro = ctx.createGain();
    maestro.gain.value = 0.35;
    maestro.connect(ctx.destination);
    return ctx;
  }

  function ruido(dur) {
    var b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var s = ctx.createBufferSource(); s.buffer = b; return s;
  }

  function envolvente(nodo, t, ataque, dur, vol) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    nodo.connect(g); g.connect(maestro);
    return g;
  }

  var SONIDOS = {
    golpe: function (t, vol) {          // choque de espadas
      var o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(900 + Math.random() * 600, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
      envolvente(o, t, 0.002, 0.12, 0.12 * vol); o.start(t); o.stop(t + 0.13);
      var n = ruido(0.08), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500; n.connect(f);
      envolvente(f, t, 0.001, 0.07, 0.25 * vol); n.start(t);
    },
    disparo: function (t, vol) {        // flecha / mosquete
      var n = ruido(0.15), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 800; n.connect(f);
      envolvente(f, t, 0.002, 0.13, 0.35 * vol); n.start(t);
    },
    flecha: function (t, vol) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.15);
      envolvente(o, t, 0.005, 0.16, 0.06 * vol); o.start(t); o.stop(t + 0.17);
    },
    bomba: function (t, vol) {          // explosión grave
      var n = ruido(0.9), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(80, t + 0.8); n.connect(f);
      envolvente(f, t, 0.005, 0.85, 0.9 * vol); n.start(t);
    },
    rayo: function (t, vol) {           // trueno
      var n = ruido(1.6), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.4); n.connect(f);
      envolvente(f, t, 0.003, 1.5, 1.0 * vol); n.start(t);
    },
    terremoto: function (t, vol) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(38, t); o.frequency.linearRampToValueAtTime(28, t + 1.4);
      envolvente(o, t, 0.1, 1.5, 0.5 * vol); o.start(t); o.stop(t + 1.6);
      SONIDOS.bomba(t + 0.1, vol * 0.6);
    },
    magia: function (t, vol) {          // lluvia, bendición, peste, intriga
      [523, 659, 784, 1046].forEach(function (fr, k) {
        var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
        envolvente(o, t + k * 0.07, 0.01, 0.5, 0.08 * vol); o.start(t + k * 0.07); o.stop(t + k * 0.07 + 0.55);
      });
    },
    clic: function (t, vol) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.05);
      envolvente(o, t, 0.002, 0.07, 0.12 * vol); o.start(t); o.stop(t + 0.08);
    },
    orden: function (t, vol) {
      [440, 660].forEach(function (fr, k) {
        var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr;
        envolvente(o, t + k * 0.06, 0.002, 0.08, 0.05 * vol); o.start(t + k * 0.06); o.stop(t + k * 0.06 + 0.09);
      });
    },
    aviso: function (t, vol) {
      [392, 523].forEach(function (fr, k) {
        var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
        envolvente(o, t + k * 0.12, 0.01, 0.35, 0.12 * vol); o.start(t + k * 0.12); o.stop(t + k * 0.12 + 0.4);
      });
    },
  };
  var ALIAS = { lluvia: 'magia', bendicion: 'magia', peste: 'magia', intriga: 'magia', marca: null };

  function tocar(tipo, vol) {
    if (!activo) return;
    if (ALIAS.hasOwnProperty(tipo)) tipo = ALIAS[tipo];
    if (!tipo || !SONIDOS[tipo] || !iniciar()) return;
    if (ctx.state === 'suspended') ctx.resume();
    var ahora = performance.now();
    // No saturar: como mucho 10 sonidos por segundo y uno de cada tipo cada 70 ms
    if (Math.floor(ahora / 1000) !== segundo) { segundo = Math.floor(ahora / 1000); porSegundo = 0; }
    if (porSegundo >= 10 || ahora - (ultimos[tipo] || 0) < 70) return;
    porSegundo++; ultimos[tipo] = ahora;
    try { SONIDOS[tipo](ctx.currentTime + 0.01, vol === undefined ? 1 : vol); } catch (e) { /* sin sonido */ }
  }

  return {
    tocar: tocar,
    activo: function () { return activo; },
    alternar: function () { activo = !activo; if (activo) iniciar(); return activo; },
  };
})();
