# Rediseño 2026: «Dioses»

Documento de diseño y **contrato técnico** del rediseño. Lo escribió el orquestador para que ~20 agentes
trabajen en paralelo sin pisarse. Si sos un agente: leé todo, respetá la tabla de dueños (sección 7) y los
contratos (sección 6). Si necesitás algo de un archivo que no es tuyo, usá el contrato o dejalo anotado en tu
respuesta final; **no edites archivos ajenos**.

---

## 1. Por qué el juego «no tenía sentido»

- **El jugador mira, no juega.** Las civilizaciones crecen solas, el gobernador decide todo y hasta hay
  «piloto automático». Nada de lo que hacés es necesario ni se nota.
- **Poderes gratis con recarga**: no hay decisiones (se tiran cuando están listos).
- **Sin metas cercanas**: la victoria está a 1200 turnos; no hay nada que perseguir en los próximos 2 minutos.
- **Ruido**: religiones, sectas secretas, intrigas, fuego amigo, comercio, héroes, diario de Claude… todo a la vez,
  casi nada con interacción. El panel derecho es un muro de texto.
- **Ilegible**: cientos de muñequitos iguales, ciudades todas iguales, batallas que no se entienden.

## 2. La fantasía: sos un DIOS

> Cada pueblo tiene su dios. **Vos sos el dios de uno. Claude es el dios de otro.** Las IAs del juego son los demás.
> Los pueblos viven, crecen y pelean solos, pero **te rezan**: cuanto más te creen, más **Fe** tenés, y con Fe hacés
> **milagros**. Si les mandás algo (mover tropas, qué construir), te obedecen.
> Gana el dios cuyo pueblo domine la historia.

Todo lo que no sirva a esta fantasía se simplifica, se esconde o se saca.

### El bucle (lo que hace el jugador minuto a minuto)

```
tu pueblo crece ──► genera Fe ──► gastás Fe en milagros ──► tu pueblo prospera / tus enemigos sufren
      ▲                                                                   │
      └──────────── más seguidores, más devoción, más Fe ◄────────────────┘

+ PLEGARIAS: tus ciudades te piden cosas con tiempo límite (globo sobre la ciudad). Atenderlas = Fe + devoción.
+ OBJETIVOS: siempre hay 3 metas cortas con recompensa (las primeras enseñan a jugar).
+ VICTORIA: un panel con barras muestra cuánto le falta a cada dios para ganar.
```

## 3. Mecánicas (números iniciales; la ola de balance los ajusta)

### 3.1 Fe (recurso principal del jugador)
- Campos por civilización: `civ.puntosFe` (actual), `civ.puntosFeTurno` (lo que entró el último turno),
  `civ.puntosFeTotal` (acumulado histórico). **Ojo**: `c.fe` (en las *ciudades*) es otra cosa: el array de
  proporción de fieles por religión que ya usa `religion.js`. No mezclar.
- Arranque: 40 de Fe.
- Ingreso por turno (lo calcula `religion.js`, el módulo de fe): por cada ciudad del mundo,
  `pop × proporción de fieles de tu religión × devoción × 0.06`, con +50% si tiene **Templo**; las ciudades
  ajenas que te rezan aportan al 60%. Mínimo 0.3/turno mientras tengas ciudades.
- Otras fuentes: plegarias atendidas (+15 a +40), objetivos (+20 a +80), batallas ganadas cerca de tus ciudades
  (+1 por unidad enemiga muerta en tu territorio), maravilla (+2/turno).
- Todo ingreso pasa por `SIM.darFe(m, idx, cantidad, motivo)` (ver contratos) para que haya texto flotante y sonido.

### 3.2 Milagros (reemplazan a los poderes gratis)
`SIM.PODERES` sigue existiendo (mismo nombre, para no romper) pero cada milagro tiene `costo` (Fe), `era` mínima
y una `recarga` corta (anti-spam). El límite real es la Fe.

| clave | nombre | era | costo | recarga | efecto |
|---|---|---|---|---|---|
| rayo | Rayo | 0 | 25 | 6 | daña tropas y ciudad en radio 1.5 |
| lluvia | Lluvia bendita | 0 | 30 | 10 | ciudad propia: +2 pop, se cura, +devoción |
| bendicion | Bendición | 0 | 35 | 12 | tus tropas en radio 3: curan y +30% ataque por 30 turnos |
| inspiracion | Inspiración | 1 | 45 | 20 | ciudad propia: +ciencia instantánea (≈25 turnos de ciencia de la ciudad) y termina lo que está produciendo |
| profeta | Profeta | 1 | 60 | 25 | ciudad ajena: +35% de fieles de tu religión; si ya era mayoría, +devoción hacia vos |
| terremoto | Terremoto | 2 | 80 | 40 | derrumba murallas, daña ciudades y tropas enemigas en radio 3 |
| peste | Peste | 2 | 90 | 50 | ciudades enemigas en radio 4 pierden un tercio de la población |
| intriga | Tentación | 3 | 110 | 60 | espía en ciudad enemiga no capital: si no reaccionan, se pasa a tu bando |
| meteoro | Meteoro | 4 | 160 | 80 | impacto enorme radio 2.5: destruye tropas, ciudad pierde mitad de pop y queda cráter (terreno dañado un rato) |

Las IAs y Claude también gastan Fe en milagros (con las mismas reglas). Cuando un rival lanza un milagro,
se ve en el mapa y aparece un globo con el nombre de su dios.

### 3.3 Devoción y plegarias (módulo nuevo `js/plegarias.js`)
- Cada ciudad tiene `c.devocion` (0.2 a 1.5, empieza en 1). Multiplica la Fe que aporta.
  Tiende lentamente a 1. Baja si la ciudad sufre (hambre, asedio, peste) y sube con milagros a favor.
- **Plegarias**: cada tanto (cada ~40–70 turnos por civilización, máximo 3 activas a la vez para el humano)
  una ciudad pide algo con tiempo límite (~45 turnos). Tipos iniciales:
  - 🌧 **Sequía** en X → lanzá *Lluvia bendita* sobre X.
  - ⚔ **¡Nos invaden!** (hay enemigos cerca de X) → lanzá *Rayo* o *Bendición* a menos de 4 casillas de X, o que no
    queden enemigos cerca.
  - 📚 **Los sabios piden luz** en X → lanzá *Inspiración* sobre X.
  - 🛕 **Queremos un templo** en X → que X termine un Templo (se puede comprar con oro).
  - 🎉 **Fiesta** en X → pagá oro (botón en la plegaria).
  - 🙏 **Señal divina** → lanzá cualquier milagro a menos de 3 casillas de X.
- Cumplida: +Fe (15–40 según dificultad), +0.2 devoción en X, texto flotante, sonido de coro.
- Vencida: −0.25 devoción en X; si X queda con devoción < 0.4, **crisis de fe**: pierde población o la religión
  rival más cercana gana terreno ahí.
- Las IAs/Claude también tienen plegarias (resueltas por su IA, con probabilidad según su Fe) para que la
  economía de Fe sea pareja.

### 3.4 Conversión y deserción (en `js/religion.js`)
- Cada civilización **nace con su religión** (la de su dios) desde el turno 0. Nada de «adoptar» la religión de otro
  a nivel civilización: la fe se juega **ciudad por ciudad**.
- La difusión por cercanía que ya existe sigue; el milagro *Profeta* la acelera.
- Una ciudad ajena donde tu religión es mayoría **te reza** (te da Fe al 60%) y, si además tiene devoción alta hacia
  vos y su dueño la descuida, **puede pasarse a tu pueblo** (reemplaza la vieja «deslealtad»). Es una conquista
  pacífica y tiene que verse venir (ícono y aviso).
- Sectas secretas y golpes de estado: **fuera del juego base** (código apagado o borrado). Cruzadas/concilios: solo si
  aportan y sin spam.

### 3.5 Objetivos (módulo nuevo `js/objetivos.js`)
- Siempre hay **3 objetivos activos** visibles (tarjeta a la izquierda del mapa). Cada uno con barra de progreso y
  recompensa (Fe, oro o desbloquear algo).
- Los primeros 5–6 son un **tutorial encubierto**: «Lanzá tu primer Rayo», «Atendé una plegaria», «Fundá tu 2ª ciudad»
  (con colonos + clic derecho), «Elegí qué construye tu capital», «Llegá a la Era Clásica»…
- Después, objetivos dinámicos según la situación: «Conquistá una ciudad de los X», «Convertí una ciudad ajena»,
  «Sobreviví a la invasión de los X», «Tené 8 ciudades», «Construí la Maravilla»…

### 3.6 Victoria (clara y a la vista)
`SIM.progresoVictoria(m, idx)` devuelve el progreso 0..1 de cada camino; la UI muestra un panel con barras por dios.
- ⚔ **Conquista**: controlar todas las capitales originales rivales (o ser el único vivo).
- 🙏 **Fe**: tu religión es mayoritaria en el 60% de las ciudades del mundo durante 60 turnos seguidos.
- 🏛 **Maravilla**: construirla (Era Pólvora) y mantenerla 150 turnos.
- 🏆 **Puntaje**: el mejor al llegar al 2050 (turno 1200).

### 3.7 Ritmo y claridad
- Menos unidades y más significativas: tope de ejército por civilización (≈ 4 + 2×ciudades), unidades algo más
  fuertes. Lejos, las unidades cercanas del mismo bando se dibujan como **un estandarte con número**.
- La crónica solo muestra lo importante para el jugador (sus ciudades, sus guerras, milagros, eras, victorias);
  el resto queda filtrable.
- Avisos (decisiones con opciones) más espaciados y siempre relevantes. Se puede pausar al llegar uno (opción).
- Velocidad por defecto 1x; 2x/4x/8x para adelantar.

### 3.8 Control directo (se mantiene, reencuadrado)
«Tu pueblo te obedece»: seleccionar tropas y darles órdenes, elegir producción de ciudades y comprar con oro sigue
igual (gratis). El «Plan» (foco/postura) sigue, más compacto. El piloto automático queda como opción, apagado.

## 4. Dirección de arte

- **Vista 2.5D por defecto** (three.js, `js/vendor/three.min.js` local — sin CDN), 2D como alternativa. Ambas dibujan
  unidades, ciudades y efectos en el canvas 2D de arriba (overlay), así que sprites y efectos sirven para las dos.
- Paleta cálida tipo «maqueta pintada»: agua con brillo y olas, costas con espuma, bosques con árboles, montañas con
  nieve, relieve suave (nada de escalones de 1 casilla).
- **Ciudades por cultura y tamaño**: europea (españoles), mesoamericana (aztecas y mayas: pirámides escalonadas),
  asiática (coreanos: techos curvos), estepa (hunos: yurtas y empalizadas). Crecen en 4 tamaños y cambian por era.
- **Unidades más grandes y legibles**, con color de bando fuerte, animación de caminar y de ataque, banderita.
- **Milagros espectaculares**: rayo con destello y temblor, nubes y gotas, rayos dorados, grietas y polvo, miasma verde,
  meteoro con estela y cráter, halo del profeta. Números flotantes (+20 🙏, −3 👥).
- UI: estilo pergamino/oro sobre azul noche (ya existe la base), íconos grandes, menos texto.

## 5. Interfaz (layout objetivo)

```
┌ barra superior: ⚜ Dioses | año · era ▓▓▓░ | 🙏 Fe 123 (+2.4) | 💰 Oro | 👥 Pob | 🏙 Ciudades | ⏸ 1x 2x 4x 8x | 🤖 Claude | ❔ 🔊 ⚙ ┐
├──────────────────────────────────────────────────────────────┬────────────────────────────┤
│ [Objetivos: 3 tarjetas]                                      │ pestañas: Dioses | Crónica │
│ [Plegarias activas: clic = ir a la ciudad]        MAPA       │           | Claude | Plan  │
│                                                              │ (Dioses = tarjetas de civs │
│ [avisos/decisiones]                              [minimapa]  │  + diplomacia + victoria)  │
│            [barra de milagros con costo en Fe y bloqueos]    │                            │
└──────────────────────────────────────────────────────────────┴────────────────────────────┘
```

## 6. Contratos técnicos (NO cambiar nombres sin avisar)

### 6.1 Bus de eventos (en `sim.js`, ya creado por el orquestador)
```js
SIM.escuchar(function (m, tipo, datos) { ... });   // registra un oyente (devuelve una función para desuscribirse)
SIM.emitir(m, tipo, datos);                          // avisa a todos los oyentes; nunca tira excepción hacia afuera
```
Eventos que emite el núcleo (`datos` siempre trae `civ` = índice de la civ protagonista):
- `ciudad_fundada` {civ, ciudad}
- `ciudad_capturada` {civ, ciudad, de} (también por traición/deserción: {…, motivo:'traicion'|'desercion'|'conquista'})
- `unidad_creada` {civ, unidad}
- `unidad_muerta` {civ, unidad, por} (civ = dueño de la muerta, por = civ que la mató o -1)
- `edificio` {civ, ciudad, edificio}
- `era` {civ, era}
- `poder` {civ, tipo, x, y, ciudad (id o null), victimas (array de índices de civ)}
- `guerra` {civ, otro} / `paz` {civ, otro}
- `civ_eliminada` {civ, por}
- `fe` {civ, cantidad, motivo, x, y} (lo emite `SIM.darFe`)
- `fin` {civ, motivo}
Ojo: en `SIM.crearMundo` se emiten `ciudad_fundada`/`unidad_creada` **antes** de `iniciar(m)` de los módulos:
los oyentes tienen que tolerar que su estado en `m` todavía no exista.
Módulos: `plegaria_nueva`, `plegaria_cumplida`, `plegaria_fallida` {civ, ciudad, plegaria}; `objetivo_cumplido`
{civ, objetivo}; `conversion` {civ, ciudad, de} (civ = nuevo dios mayoritario).

### 6.2 Fe y milagros (núcleo)
- `SIM.darFe(m, idx, cantidad, motivo, x, y)` → suma a `puntosFe` y `puntosFeTotal`, acumula en `puntosFeTurno`,
  emite `fe`. Cantidades negativas permitidas (gasto), sin bajar de 0.
- `SIM.PODERES[tipo]` con `{nombre, articulo, icono, costo, era, recarga, radio, desc, objetivo}` donde
  `objetivo` ∈ `'lugar' | 'ciudad_propia' | 'ciudad_ajena' | 'tropas_propias'`.
- `SIM.puedeUsarPoder(m, idx, tipo)` → `{ok, motivo}` (era, Fe, recarga). `SIM.usarPoder` lo respeta y descuenta Fe.
- `SIM.recargaPoder(m, idx, tipo)` se mantiene.
- Edificio nuevo `templo` en `SIM.EDIFICIOS` (+50% Fe de la ciudad; el gobernador lo construye).

### 6.3 Victoria (núcleo)
- `SIM.progresoVictoria(m, idx)` → `{conquista:{p, texto}, fe:{p, texto}, maravilla:{p, texto}, puntaje:{p, texto}}`
  con `p` en 0..1 y `texto` corto para la UI («3 de 4 capitales», «48% de las ciudades, faltan 12%»…).
- `m.fin = {ganador, motivo, turno}` con motivo ∈ `conquista | fe | maravilla | puntaje`.

### 6.4 Módulos (patrón existente `SIM.modulos`)
Cada módulo: `SIM.modulos.push({ iniciar(m), turno(m), tick(m), dibujar(g, render, ahora), panel(m, humano) })`.
`dibujar` recibe el contexto 2D del overlay y el render (usar `render.aPantalla(x, y)`, `render.escala`,
`render.ancho/alto`); lo llaman **las dos vistas**. `panel` lo llama main.js cada ~250 ms.
- `SIM.Plegarias` (plegarias.js): `activas(m, idx)` → lista `{id, ciudad, tipo, icono, titulo, texto, hasta, recompensa, accion}`;
  `pagar(m, id)` para las que se resuelven con oro. Dibuja globos sobre las ciudades. Llena `#hud-plegarias`.
- `SIM.Objetivos` (objetivos.js): `activos(m, idx)` → `{id, titulo, texto, progreso, meta, recompensa}`. Llena `#hud-objetivos`.
- `SIM.Efectos` (efectos.js): partículas y milagros. `SIM.Efectos.lanzar(tipo, x, y, opciones)`, `SIM.Efectos.texto(x, y, txt, color)`,
  y se dibuja como módulo (`dibujar`). Escucha los eventos `poder`, `fe`, `unidad_muerta`, `ciudad_capturada`.
  `SIM.Efectos.temblor(ms)` para sacudir la cámara: los renders leen `SIM.Efectos.desplazamiento(ahora)` → `[dx, dy]`.
- `SIM.Minimapa` (minimapa.js): dibuja en `#minimapa`; clic mueve la cámara con `render.centrarEn(x, y)` (lo agrega el dueño
  de cada render: los dos tienen que tenerlo).
- `SIM.Sonido.tocar(nombre, volumen)` (sonido.js) — nombres nuevos: `fe`, `plegaria`, `plegaria_ok`, `plegaria_mal`,
  `objetivo`, `meteoro`, `inspiracion`, `profeta`, `clic`, `victoria`, `derrota`. `SIM.Sonido.musica(era)` para la música.

### 6.5 Render (las dos vistas)
Interfaz común que usa main.js: `nuevoMundo(m)`, `redimensionar()`, `ajustar()`, `limitar()`, `aPantalla(x,y)`, `aMundo(px,py)`,
`zoom(f,px,py)`, `mover(dx,dy)`, `dibujar(alfa, ahora, ui)`, `marca(x,y,color)`, `centrarEn(x, y, escala?)` (nuevo),
`ancho`, `alto`, `escala`. Ambos llaman a los `dibujar` de los módulos al final del overlay.

### 6.6 DOM (index.html, creado por el orquestador; los estilos de cada bloque los pone su dueño)
- `#hud-recursos` (barra superior, main.js), `#hud-objetivos` y `#hud-plegarias` (overlay izquierdo del mapa),
  `#minimapa` (canvas abajo a la derecha del mapa), `#panel-victoria` (dentro del panel derecho).
- CSS por módulo: `estilos-objetivos.css`, `estilos-plegarias.css`, `estilos-minimapa.css`, `estilos-pantallas.css`.
- **Posición** de los contenedores en pantalla (dónde va `#hud-izq`, `#minimapa`, `#avisos`, etc.): la decide E en `estilos.css`.
  El **contenido** y su estilo interno: el dueño del módulo, en su propio CSS.
- Los scripts nuevos ya están en `index.html` (plegarias, objetivos, efectos, minimapa, pantallas) con archivos vacíos.
  `herramientas/probar.js --modulos` carga también `plegarias.js` y `objetivos.js`: esos dos **no pueden tocar el DOM**
  fuera de `panel()`/`dibujar()` (en Node no hay `document`).

## 7. Dueños de archivo (ola 2)

| agente | archivos que puede editar | qué hace |
|---|---|---|
| A · Núcleo | `js/sim.js`, `js/datos.js` | Fe, milagros con costo, milagros nuevos, templo, IA de dioses que gasta Fe, victoria nueva, tope de ejército, ritmo, eventos |
| B · Fe | `js/religion.js`, `estilos-religion.css` | religión desde el turno 0, ingreso de Fe, devoción en la difusión, conversión y deserción, sacar sectas, panel de fe |
| C · Plegarias | `js/plegarias.js`, `estilos-plegarias.css` | plegarias, devoción, globos en el mapa, lista en `#hud-plegarias` |
| D · Objetivos | `js/objetivos.js`, `estilos-objetivos.css` | objetivos/tutorial, recompensas, tarjeta en `#hud-objetivos` |
| E · Interfaz | `js/main.js`, `index.html`, `estilos.css` | HUD, barra de milagros con costo, panel con pestañas, panel de victoria, avisos, crónica filtrada, panel de ciudad |
| F · Render 2D | `js/render.js` | terreno pintado, agua animada, costas, fronteras, agrupar unidades, `centrarEn`, llamar a efectos |
| G · Efectos | `js/efectos.js` | partículas, milagros, números flotantes, temblor |
| H · Render 2.5D | `js/render3d.js` | relieve suave, agua, luz, árboles/montañas, ciudades 3D por cultura, `centrarEn` |
| I · Sprites | `js/sprites.js` | unidades y ciudades por cultura/era, animación, estandartes de grupo |
| J · Sonido | `js/sonido.js` | efectos nuevos y música generativa por era |
| K · Consejo/Claude | `js/consejo.js`, `server.js`, `js/burbujas.js` | avisos menos y mejores, Claude como dios rival (decide milagros), prompts nuevos, globos |
| L · Minimapa y pantallas | `js/minimapa.js`, `js/pantallas.js`, `estilos-minimapa.css`, `estilos-pantallas.css` | minimapa; pantalla de inicio temática «elegí tu pueblo y tu dios»; pantalla final con resumen |

`js/comercio.js` queda como está (solo lo toca la ola 3 si hace falta). `herramientas/` es de todos (agregar, no romper).

## 8. Reglas para los agentes

1. Leé `NOTAS-PARA-CLAUDE.md` y este archivo. Español rioplatense en comentarios y textos. Mismo estilo de código
   (ES5, `var`, funciones, sin build ni dependencias nuevas).
2. **Solo editá tus archivos.** Los demás están cambiando al mismo tiempo. Si una prueba falla por un archivo ajeno, esperá
   un minuto y reintentá; si sigue, anotalo en tu respuesta final.
3. **No hagas `git commit`** ni `git checkout/stash/reset`: el orquestador commitea al final de cada ola.
4. Probá siempre: `node herramientas/probar.js 7 5 300 --modulos` (sin pantalla) y capturas con
   `node herramientas/capturar.js <carpeta> "inicio=1&ff=300&vel=1&semilla=7&vista=2d" 3000` (mirá los PNG con Read).
   La vista 2.5D en headless es lenta (WebGL por software): usala solo si sos el dueño del render 3D o la necesitás de verdad.
   Guardá capturas en tu carpeta del scratchpad, no en el repo.
5. Todo tiene que funcionar aunque otro módulo no esté: chequeá `if (SIM.Efectos)`, `if (SIM.Plegarias)`, etc.
6. Rendimiento: el juego corre a 60 fps con ~150 unidades. Nada de trabajo pesado por frame sin cache.
7. Respuesta final: qué hiciste, qué probaste, qué contratos usaste/agregaste y qué le queda pendiente a otro dueño.
