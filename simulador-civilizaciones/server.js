// Servidor local del juego: sirve los archivos y le pasa a Claude (Claude Code instalado en la PC)
// las decisiones de su civilización. Solo usa módulos que vienen con Node, no hace falta instalar nada.
// Uso: node server.js [--abrir]
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PUERTO = Number(process.env.PUERTO) || 8123;
const MODELO = process.env.MODELO_CLAUDE || 'sonnet';
const RAIZ = __dirname;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};
const ESQUEMA = {
  type: 'object',
  properties: {
    opcion: { type: 'integer', description: 'Número de la opción elegida (empieza en 1)' },
    mensaje: { type: 'string', description: 'Frase corta para los demás jugadores' },
    razon: { type: 'string', description: 'Por qué elegiste esa opción' },
  },
  required: ['opcion', 'mensaje', 'razon'],
};

let claudeInstalado = false;

// Si el servidor se abre desde adentro de otra sesión de Claude Code, no le pasamos esas variables al proceso hijo
function entornoLimpio() {
  const env = { ...process.env };
  if (env.CLAUDECODE) {
    for (const k of Object.keys(env)) {
      if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'ANTHROPIC_BASE_URL' || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT' || k === 'CLAUDE_AGENT_SDK_VERSION') delete env[k];
    }
  }
  return env;
}

function ejecutar(args, entrada, msMax) {
  return new Promise((resolve) => {
    let hijo;
    try {
      hijo = spawn('claude', args, { cwd: os.tmpdir(), env: entornoLimpio(), windowsHide: true, shell: false });
    } catch (e) {
      resolve({ codigo: -1, salida: '', error: String(e) });
      return;
    }
    let salida = '', error = '', terminado = false;
    const reloj = setTimeout(() => { if (!terminado) { hijo.kill(); resolve({ codigo: -2, salida, error: 'tiempo agotado' }); terminado = true; } }, msMax);
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { error += d; });
    hijo.on('error', (e) => { if (!terminado) { terminado = true; clearTimeout(reloj); resolve({ codigo: -1, salida, error: String(e) }); } });
    hijo.on('close', (codigo) => { if (!terminado) { terminado = true; clearTimeout(reloj); resolve({ codigo, salida, error }); } });
    if (entrada) hijo.stdin.write(entrada);
    hijo.stdin.end();
  });
}

function extraerJSON(texto) {
  if (!texto) return null;
  const a = texto.indexOf('{'), b = texto.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(texto.slice(a, b + 1)); } catch (e) { return null; }
}

async function preguntarAClaude(sistema, prompt) {
  const args = [
    '-p', '--model', MODELO, '--output-format', 'json',
    '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence',
    '--system-prompt', sistema,
    '--json-schema', JSON.stringify(ESQUEMA),
  ];
  const t0 = Date.now();
  const r = await ejecutar(args, prompt, 140000);
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.codigo === -1) return { ok: false, codigo: 'no_instalado', error: 'no encontré el programa claude' };
  if (r.codigo === -2) return { ok: false, codigo: 'tiempo', error: 'tardó demasiado' };
  const res = extraerJSON(r.salida);
  if (!res) return { ok: false, codigo: 'raro', error: 'respuesta inesperada', detalle: (r.salida + r.error).slice(0, 300) };
  if (res.is_error) {
    const txt = String(res.result || '');
    const login = /auth|login|oauth|credential|api key/i.test(txt);
    console.log(`  ✗ Claude devolvió error (${seg} s): ${txt}`);
    return { ok: false, codigo: login ? 'login' : 'error', error: login ? 'no tiene la sesión iniciada' : txt.slice(0, 120) };
  }
  const datos = res.structured_output || extraerJSON(res.result);
  if (!datos || typeof datos.opcion === 'undefined') return { ok: false, codigo: 'raro', error: 'no eligió ninguna opción' };
  console.log(`  ✓ Claude eligió la opción ${datos.opcion} en ${seg} s: "${datos.mensaje}"`);
  return { ok: true, opcion: Number(datos.opcion), mensaje: String(datos.mensaje || '').slice(0, 200), razon: String(datos.razon || '').slice(0, 400) };
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 200000) { reject(new Error('muy grande')); req.destroy(); } });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}

function responderJSON(res, codigo, obj) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const servidor = http.createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    if (url === '/api/estado') return responderJSON(res, 200, { claude: claudeInstalado, modelo: MODELO });
    if (url === '/api/claude' && req.method === 'POST') {
      const cuerpo = JSON.parse(await leerCuerpo(req));
      if (!claudeInstalado) return responderJSON(res, 200, { ok: false, codigo: 'no_instalado', error: 'no encontré el programa claude' });
      console.log('→ Consultando a Claude…');
      return responderJSON(res, 200, await preguntarAClaude(String(cuerpo.sistema || ''), String(cuerpo.prompt || '')));
    }
    const rel = url === '/' ? '/index.html' : url;
    const archivo = path.normalize(path.join(RAIZ, rel));
    if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end('Prohibido'); }
    fs.readFile(archivo, (err, datos) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(datos);
    });
  } catch (e) {
    responderJSON(res, 500, { ok: false, error: String(e.message || e) });
  }
});

(async () => {
  const v = await ejecutar(['--version'], '', 20000);
  claudeInstalado = v.codigo === 0;
  servidor.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('El juego ya estaba abierto: te lo muestro en el navegador.');
      if (process.argv.includes('--abrir')) spawn('cmd', ['/c', 'start', '', 'http://localhost:' + PUERTO], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      setTimeout(() => process.exit(0), 1500);
    } else console.log('Error del servidor:', e.message);
  });
  servidor.listen(PUERTO, '127.0.0.1', () => {
    const url = `http://localhost:${PUERTO}`;
    console.log('===============================================');
    console.log('  Simulador de Civilizaciones');
    console.log(`  Abrí ${url} en el navegador`);
    console.log(claudeInstalado ? `  Claude: encontrado (${v.salida.trim()}), modelo ${MODELO}` : '  Claude: NO encontrado (juega la IA del juego en su lugar)');
    console.log('  Para cerrar el juego, cerrá esta ventana.');
    console.log('===============================================');
    if (process.argv.includes('--abrir')) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  });
})();
