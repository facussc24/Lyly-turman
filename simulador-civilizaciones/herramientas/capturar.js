// Saca capturas del juego con Chromium headless (Playwright). Sirve en Linux/Mac/Windows si está Playwright.
// Levanta su propio servidor estático (no hace falta server.js) y junta los errores de la consola.
// Uso:
//   node herramientas/capturar.js [carpeta] [consulta] [ms] [ancho]x[alto]
//   node herramientas/capturar.js capturas "inicio=1&ff=450&vel=1&semilla=7&auto=1&vista=2d" 4000
// Con pasos propios: CAPTURA_PASOS=mis-pasos.js node herramientas/capturar.js carpeta "consulta"
//   (mis-pasos.js exporta async function (page, captura) { await page.mouse.click(...); await captura('nombre'); })
// Si no encuentra el módulo: NODE_PATH=$(npm root -g) node herramientas/capturar.js ...
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };

let playwright;
try { playwright = require('playwright'); } catch (e) {
  try { playwright = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); } catch (e2) {
    console.error('Falta Playwright (npm i -g playwright).'); process.exit(1);
  }
}

const [carpeta = path.join(RAIZ, 'capturas'), consulta = 'inicio=1&ff=300&vel=1&semilla=7&auto=1', msTexto = '3000', tam = '1600x900'] = process.argv.slice(2);
const [ancho, alto] = tam.split('x').map(Number);

const servidor = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(url === '/api/estado' ? '{"claude":false}' : '{"ok":false,"codigo":"no_instalado"}'); }
  const archivo = path.normalize(path.join(RAIZ, url === '/' ? '/index.html' : url));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream' });
    res.end(datos);
  });
});

(async () => {
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const puerto = servidor.address().port;
  fs.mkdirSync(carpeta, { recursive: true });
  const navegador = await playwright.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await navegador.newPage({ viewport: { width: ancho, height: alto } });
  const errores = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/GL Driver Message|GroupMarkerNotSet|Failed to load resource: net::ERR_FAILED/.test(t)) return; // ruido de WebGL por software y fuentes cortadas
    if (m.type() === 'error' || m.type() === 'warning') errores.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => errores.push('[pageerror] ' + (e.stack || e.message)));
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errores.push('[requestfailed] ' + r.url()); });
  // Las fuentes de Google no andan sin internet: las cortamos para no esperar.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${puerto}/index.html?${consulta}`, { waitUntil: 'load' });
  let n = 0;
  const captura = async (nombre) => {
    const archivo = path.join(carpeta, (nombre || 'captura-' + (++n)) + '.png');
    await page.screenshot({ path: archivo });
    console.log('captura:', archivo);
  };
  if (process.env.CAPTURA_PASOS) {
    await require(path.resolve(process.env.CAPTURA_PASOS))(page, captura);
  } else {
    await page.waitForTimeout(Number(msTexto));
    await captura('captura');
  }
  if (errores.length) console.log('ERRORES DE LA PÁGINA:\n  ' + errores.join('\n  '));
  else console.log('Sin errores en la consola.');
  await navegador.close();
  servidor.close();
})().catch((e) => { console.error(e); process.exit(1); });
