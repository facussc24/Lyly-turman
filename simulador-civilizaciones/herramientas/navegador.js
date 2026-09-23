// Prueba el juego en Edge sin ventana (headless) usando el protocolo de DevTools.
// Uso: node herramientas/navegador.js "<url>" <script.js con pasos> <carpeta de capturas>
// El script de pasos exporta: module.exports = async function (p) { await p.esperar(ms); await p.eval('js'); await p.captura('nombre'); }
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PUERTO = 9333;
const [url, archivoPasos, carpeta = path.join(__dirname, '..', 'capturas')] = process.argv.slice(2);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-prueba-'));
  const edge = spawn(EDGE, ['--headless=new', '--hide-scrollbars', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
  let info = null;
  for (let i = 0; i < 40 && !info; i++) {
    try { info = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json(); } catch (e) { await esperar(250); }
  }
  const pagina = info.find((t) => t.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let sig = 1;
  const pendientes = new Map();
  const errores = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendientes.has(msg.id)) { pendientes.get(msg.id)(msg); pendientes.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errores.push(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errores.push(msg.params.args.map((a) => a.value || a.description).join(' '));
  });
  const cdp = (method, params = {}) => new Promise((r) => { const id = sig++; pendientes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  await esperar(1500);
  const p = {
    esperar,
    async eval(js) {
      const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : 'error');
      return r.result && r.result.result ? r.result.result.value : undefined;
    },
    async captura(nombre) {
      const r = await cdp('Page.captureScreenshot', { format: 'png' });
      const f = path.join(carpeta, nombre + '.png');
      fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
      console.log('captura:', f);
    },
    async clic(x, y, boton = 'left') {
      for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: boton, clickCount: 1 });
    },
    async arrastrar(x0, y0, x1, y1) {
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let k = 1; k <= 8; k++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * k / 8, y: y0 + (y1 - y0) * k / 8, button: 'left', buttons: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
    },
  };
  try {
    await require(path.resolve(archivoPasos))(p);
  } catch (e) {
    console.log('FALLÓ un paso:', e.message);
  }
  console.log(errores.length ? 'ERRORES EN LA PÁGINA:\n' + errores.join('\n') : 'Sin errores en la página');
  ws.close();
  edge.kill();
  process.exit(0);
})();
