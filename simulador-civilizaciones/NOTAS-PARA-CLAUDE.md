# Simulador de Civilizaciones — notas para seguir el desarrollo

Juego de navegador hecho a medida (sin motor ni build): simulador tipo "juego de Dios" inspirado en
Age of Empires II: The Conquerors. Las civilizaciones crecen solas; el jugador humano aconseja a la suya
(y puede mover tropas, manejar ciudades y usar poderes), Claude maneja otra civilización y hay IAs del juego.

## Cómo correrlo
- `JUGAR (EJECUTABLE).bat` → `node server.js --abrir` → http://localhost:8123
- Sin Node: abrir `index.html` directo (funciona todo menos Claude).
- Claude: el server llama a `claude -p` (Claude Code de la PC, usa la suscripción) con `--json-schema`.
  Si la sesión del CLI está vencida, la UI muestra "sin sesión" y juega la IA del juego en su lugar.
  Modelo por variable de entorno `MODELO_CLAUDE` (default `sonnet`).

## Archivos
- `js/datos.js` — terrenos, eras, civs (Españoles, Aztecas, Mayas, Coreanos, Hunos), unidades, edificios, poderes, `SIM.modulos`.
- `js/mapa.js` — generación del mapa (ruido fBm, continentes, costa, inicios).
- `js/sim.js` — simulación (sin DOM): ciudades, economía, A* con regiones, combate con grilla espacial,
  gobernador automático, diplomacia, poderes de Dios, intrigas/traiciones, fuego amigo, victoria.
  1 turno = 10 ticks; a 1x corre 1 turno por segundo; partida = 1200 turnos (3000 a.C. → 2050).
- `js/consejo.js` — avisos/decisiones (plantillas, IA de decisión `decidirBot`, prompt para Claude).
  Extensible con `SIM.Consejo.extras` y `SIM.Consejo.efectos`.
- `js/sprites.js` — figuras dibujadas con canvas (soldados, jinetes, barcos, aviones, ciudades) cacheadas.
- `js/render.js` — vista 2D (terreno pintado, fronteras suaves, efectos). Expone helpers para la 2.5D.
- `js/render3d.js` — vista 2.5D con three.js r149 (CDN). Misma interfaz que `SIM.Render`.
- `js/comercio.js` (caravanas/barcos mercantes, saqueos), `js/religion.js` (5 religiones, cruzadas, conversiones, secta secreta con golpes de estado), `js/burbujas.js` (globos de diálogo) — módulos opcionales (`SIM.modulos`: iniciar/turno/tick/dibujar/panel).
- Héroes (El Cid, Moctezuma, Pacal, Yi Sun-sin, Atila): unidades `heroe_*` en datos.js, nacen en la Era Medieval (sim.js `revisarHeroes`), aura +20% de ataque.
- `js/sonido.js` — sonidos sintetizados con WebAudio (sin archivos).
- `js/main.js` — UI: inicio, bucle, mouse (selección, órdenes, poderes), panel de ciudad, avisos, Claude.
- `server.js` — servidor local (solo módulos de Node) + `/api/claude` + `/api/estado`.
- `herramientas/navegador.js` — maneja Edge headless por DevTools (clics, eval, capturas): `node herramientas/navegador.js "<url>" pasos.js <carpeta>`.
- `herramientas/probar.js` — partida completa sin pantalla: `node herramientas/probar.js 7 5 1200 [--cronica] [--modulos]`.

## Pruebas rápidas
- URL de prueba: `http://localhost:8123/?inicio=1&ff=450&vel=1&semilla=7&auto=1&enfocar=batalla&acercar=3&vista=2d`
  (`ff` adelanta turnos, `auto` = piloto automático, `vista=2d` fuerza la vista plana).
- Capturas sin abrir el navegador: Edge headless `--screenshot` con `--virtual-time-budget` (ver historial).
- `window.JUEGO` en la consola: `mundo()`, `render`, `seleccionar(ids)`, `orden(x,y)`, `ciudad(id)`, `poder(tipo,x,y)`.

## Ideas pendientes
- Modelos 3D más realistas (Kenney / Quaternius, CC0) en la vista 2.5D — preguntar antes de descargar.
- Guardar / cargar partida. Sonido. Más tipos de avisos diplomáticos con Claude (que pueda proponer alianzas).
- Héroes (tipo Sansón/Salomón) como unidades especiales.
