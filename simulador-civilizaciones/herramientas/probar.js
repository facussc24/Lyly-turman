// Corre una partida completa sin pantalla (todas las civs con la IA del juego) y muestra un resumen.
// Uso: node herramientas/probar.js [semilla] [cantidadCivs] [turnos]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Math, Date };
vm.createContext(ctx);
const extra = process.argv.includes('--modulos') ? ['comercio.js', 'religion.js'] : [];
for (const f of ['datos.js', 'mapa.js', 'sim.js', 'consejo.js'].concat(extra)) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const SIM = ctx.SIM;

const semilla = Number(process.argv[2] || 7);
const cantidad = Number(process.argv[3] || 4);
const turnos = Number(process.argv[4] || SIM.TURNO_FINAL);

const t0 = Date.now();
const m = SIM.crearMundo({
  semilla, todoBot: true,
  jugadores: SIM.ORDEN_CIVS.slice(0, cantidad).map((civ, i) => ({ civ, control: i === 0 ? 'humano' : (i === 1 ? 'claude' : 'bot') })),
});

function fila() {
  return m.civs.map(c => {
    const e = SIM.estadisticas(m, c.idx);
    if (!c.viva) return `${c.nombre.padEnd(10)} 💀`;
    return `${c.nombre.padEnd(10)} era ${e.era} ciud ${String(e.ciudades).padStart(2)} pop ${String(e.pop).padStart(3)} mil ${String(e.militares).padStart(3)} poder ${String(e.poder).padStart(5)} cien ${String(e.ciencia).padStart(5)} guerras ${c.rel.filter(r => r === 'guerra').length} foco ${c.plan.foco}/${c.plan.postura}`;
  }).join('\n  ');
}

let ultimaCronica = 0;
while (m.turno < turnos && !m.fin) {
  SIM.paso(m);
  if (m.tick % (SIM.TICKS_POR_TURNO * 100) === 0) {
    console.log(`\n== Turno ${m.turno} (${SIM.anioTexto(m.turno)}) unidades=${m.unidades.length} ciudades=${m.ciudades.length}`);
    console.log('  ' + fila());
  }
}
const ms = Date.now() - t0;
console.log('\n== FIN', m.fin ? JSON.stringify(m.fin) : '(sin terminar)', `turno ${m.turno}, ${ms} ms (${(ms / m.turno).toFixed(2)} ms/turno)`);
console.log('  ' + fila());

const tipos = {};
m.cronica.forEach(c => { tipos[c.tipo] = (tipos[c.tipo] || 0) + 1; });
console.log('\nEventos por tipo:', JSON.stringify(tipos));
if (process.argv.includes('--cronica')) {
  console.log('\nCRÓNICA:');
  m.cronica.forEach(c => console.log(`${c.anio.padStart(10)}  ${c.texto}`));
}
