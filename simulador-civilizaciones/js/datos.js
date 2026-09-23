/* Datos del juego: terrenos, eras, civilizaciones, unidades y edificios. */
var SIM = SIM || {};

// Módulos opcionales (religión, comercio...). Cada uno puede tener: iniciar(m), turno(m),
// dibujar(g, render, ahora) para el mapa, y panel(m, humano) para la interfaz.
SIM.modulos = SIM.modulos || [];

SIM.TURNOS_POR_SEGUNDO = 1;   // a velocidad 1x
SIM.TICKS_POR_TURNO = 10;     // los movimientos se calculan en ticks, la economía en turnos
SIM.TURNO_FINAL = 1200;       // año 2050
SIM.TURNOS_MARAVILLA = 250;   // cuánto hay que mantener una Maravilla para ganar

// Tramos turno -> año (las primeras eras pasan más rápido, como en Civilization)
SIM.TRAMOS_ANIO = [[0, -3000], [200, -1000], [420, 500], [650, 1450], [850, 1780], [1000, 1920], [1200, 2050]];

SIM.T = { OCEANO: 0, COSTA: 1, PRADERA: 2, BOSQUE: 3, COLINAS: 4, DESIERTO: 5, NIEVE: 6, MONTANA: 7 };

SIM.TERRENOS = [
  { nombre: 'Océano',   color: [28, 58, 104],  comida: 1,   prod: 0,   agua: true },
  { nombre: 'Costa',    color: [48, 96, 150],  comida: 1.5, prod: 0,   agua: true },
  { nombre: 'Pradera',  color: [126, 176, 84], comida: 2,   prod: 1,   agua: false },
  { nombre: 'Bosque',   color: [58, 110, 56],  comida: 1,   prod: 2,   agua: false, lento: true },
  { nombre: 'Colinas',  color: [150, 150, 96], comida: 1,   prod: 2,   agua: false, lento: true },
  { nombre: 'Desierto', color: [220, 200, 140], comida: 0.5, prod: 0.5, agua: false },
  { nombre: 'Nieve',    color: [232, 238, 242], comida: 0.5, prod: 0,   agua: false },
  { nombre: 'Montaña',  color: [120, 116, 112], comida: 0,   prod: 1,   agua: false },
];

SIM.ERAS = [
  { nombre: 'Antigua',    ciencia: 0 },
  { nombre: 'Clásica',    ciencia: 150 },
  { nombre: 'Medieval',   ciencia: 700 },
  { nombre: 'Pólvora',    ciencia: 2200 },
  { nombre: 'Industrial', ciencia: 5000 },
  { nombre: 'Moderna',    ciencia: 9000 },
];

// Civilizaciones de "The Conquerors"
SIM.CIVS = {
  espanoles: {
    nombre: 'Españoles', color: '#ffd21f', unica: 'conquistador',
    bonus: 'Construyen edificios 30% más rápido',
    personalidad: { agresion: 0.55, expansion: 0.7, ciencia: 0.5, mar: 0.7 },
    ciudades: ['Toledo', 'Sevilla', 'Madrid', 'Burgos', 'Granada', 'Valencia', 'Zaragoza', 'Salamanca', 'Córdoba', 'León', 'Cádiz', 'Bilbao', 'Málaga', 'Segovia', 'Pamplona', 'Oviedo'],
  },
  aztecas: {
    nombre: 'Aztecas', color: '#ff3b30', unica: 'jaguar',
    bonus: 'Unidades militares 20% más baratas',
    personalidad: { agresion: 0.75, expansion: 0.6, ciencia: 0.4, mar: 0.3 },
    ciudades: ['Tenochtitlan', 'Texcoco', 'Tlacopan', 'Tlatelolco', 'Cholula', 'Xochimilco', 'Chalco', 'Coyoacán', 'Tula', 'Teotihuacan', 'Azcapotzalco', 'Culhuacán', 'Tlaxcala', 'Malinalco'],
  },
  mayas: {
    nombre: 'Mayas', color: '#c65bff', unica: 'arquero_emplumado',
    bonus: 'Sus ciudades crecen 20% más rápido',
    personalidad: { agresion: 0.35, expansion: 0.6, ciencia: 0.8, mar: 0.4 },
    ciudades: ['Tikal', 'Palenque', 'Copán', 'Calakmul', 'Chichén Itzá', 'Uxmal', 'Mayapán', 'Cobá', 'Tulum', 'Caracol', 'Yaxchilán', 'Bonampak', 'Quiriguá', 'Edzná'],
  },
  coreanos: {
    nombre: 'Coreanos', color: '#22d3ee', unica: 'barco_tortuga',
    bonus: 'Ciudades con 25% más de defensa',
    personalidad: { agresion: 0.3, expansion: 0.5, ciencia: 0.6, mar: 0.9 },
    ciudades: ['Hanseong', 'Gyeongju', 'Pyongyang', 'Kaesong', 'Busan', 'Gwangju', 'Daegu', 'Jeonju', 'Hamhung', 'Ulsan', 'Suwon', 'Wonju', 'Chuncheon', 'Mokpo'],
  },
  hunos: {
    nombre: 'Hunos', color: '#ff8a1f', unica: 'tarkan',
    bonus: 'Unidades terrestres 15% más rápidas',
    personalidad: { agresion: 0.9, expansion: 0.7, ciencia: 0.3, mar: 0.2 },
    ciudades: ['Aquincum', 'Sirmium', 'Naissus', 'Singidunum', 'Carnuntum', 'Savaria', 'Sopianae', 'Brigetio', 'Intercisa', 'Scarbantia', 'Lugio', 'Mursa', 'Cibalae', 'Poetovio'],
  },
};
SIM.ORDEN_CIVS = ['espanoles', 'aztecas', 'mayas', 'coreanos', 'hunos'];

// rol: melee | distancia | asedio | naval | aire | colono
SIM.UNIDADES = {
  colono:            { nombre: 'Colonos',            rol: 'colono',    era: 0, atk: 0,  def: 1,  hp: 10, vel: 0.07, costo: 30,  icono: '🏕' },
  guerrero:          { nombre: 'Guerreros',          rol: 'melee',     era: 0, atk: 4,  def: 3,  hp: 20, vel: 0.07, costo: 14,  icono: '🗡' },
  hondero:           { nombre: 'Honderos',           rol: 'distancia', era: 0, atk: 3,  def: 2,  hp: 16, vel: 0.07, costo: 14,  icono: '🏹', rango: 2 },
  lancero:           { nombre: 'Lanceros',           rol: 'melee',     era: 1, atk: 6,  def: 6,  hp: 20, vel: 0.07, costo: 20,  icono: '🔱', antiCaballo: true },
  arquero:           { nombre: 'Arqueros',           rol: 'distancia', era: 1, atk: 6,  def: 3,  hp: 16, vel: 0.07, costo: 20,  icono: '🏹', rango: 2 },
  catapulta:         { nombre: 'Catapultas',         rol: 'asedio',    era: 1, atk: 7,  def: 2,  hp: 14, vel: 0.05, costo: 26,  icono: '🪨', rango: 2, vsCiudad: 3 },
  trirreme:          { nombre: 'Trirremes',          rol: 'naval',     era: 1, atk: 6,  def: 5,  hp: 28, vel: 0.12, costo: 24,  icono: '⛵', rango: 1.5 },
  caballero:         { nombre: 'Caballeros',         rol: 'melee',     era: 2, atk: 10, def: 7,  hp: 22, vel: 0.11, costo: 30,  icono: '🐎', caballo: true },
  ballestero:        { nombre: 'Ballesteros',        rol: 'distancia', era: 2, atk: 9,  def: 5,  hp: 18, vel: 0.07, costo: 28,  icono: '🏹', rango: 2 },
  trebuchet:         { nombre: 'Trebuchets',         rol: 'asedio',    era: 2, atk: 12, def: 3,  hp: 14, vel: 0.05, costo: 34,  icono: '🪨', rango: 3, vsCiudad: 3.5 },
  carraca:           { nombre: 'Carracas',           rol: 'naval',     era: 2, atk: 10, def: 8,  hp: 30, vel: 0.13, costo: 32,  icono: '⛵', rango: 1.5 },
  mosquetero:        { nombre: 'Mosqueteros',        rol: 'melee',     era: 3, atk: 15, def: 12, hp: 22, vel: 0.07, costo: 38,  icono: '💂' },
  canon:             { nombre: 'Cañones',            rol: 'asedio',    era: 3, atk: 18, def: 6,  hp: 16, vel: 0.05, costo: 42,  icono: '💣', rango: 3, vsCiudad: 3 },
  galeon:            { nombre: 'Galeones',           rol: 'naval',     era: 3, atk: 17, def: 14, hp: 32, vel: 0.14, costo: 44,  icono: '⛵', rango: 2 },
  fusilero:          { nombre: 'Fusileros',          rol: 'melee',     era: 4, atk: 22, def: 18, hp: 24, vel: 0.08, costo: 48,  icono: '💂' },
  artilleria:        { nombre: 'Artillería',         rol: 'asedio',    era: 4, atk: 28, def: 8,  hp: 18, vel: 0.06, costo: 52,  icono: '💣', rango: 3, vsCiudad: 2.5 },
  acorazado:         { nombre: 'Acorazados',         rol: 'naval',     era: 4, atk: 30, def: 26, hp: 36, vel: 0.15, costo: 58,  icono: '🚢', rango: 3 },
  infanteria:        { nombre: 'Infantería',         rol: 'melee',     era: 5, atk: 32, def: 28, hp: 26, vel: 0.08, costo: 58,  icono: '🪖' },
  tanque:            { nombre: 'Tanques',            rol: 'melee',     era: 5, atk: 42, def: 32, hp: 28, vel: 0.12, costo: 70,  icono: '🛡', caballo: true, vsCiudad: 1.3 },
  bombardero:        { nombre: 'Bombarderos',        rol: 'aire',      era: 5, atk: 45, def: 10, hp: 20, vel: 0.28, costo: 72,  icono: '✈', vsCiudad: 3, rango: 1.2, alcance: 16 },
  caza:              { nombre: 'Cazas',              rol: 'aire',      era: 5, atk: 38, def: 25, hp: 20, vel: 0.32, costo: 64,  icono: '🛩', rango: 1.2, alcance: 12, antiAire: true },
  destructor:        { nombre: 'Destructores',       rol: 'naval',     era: 5, atk: 44, def: 36, hp: 40, vel: 0.17, costo: 70,  icono: '🚢', rango: 3 },
  // Unidades únicas (una por civilización)
  conquistador:      { nombre: 'Conquistadores',     rol: 'melee',     era: 3, atk: 20, def: 13, hp: 24, vel: 0.11, costo: 42,  icono: '🏇', civ: 'espanoles', caballo: true },
  jaguar:            { nombre: 'Guerreros Jaguar',   rol: 'melee',     era: 1, atk: 9,  def: 6,  hp: 22, vel: 0.08, costo: 22,  icono: '🐆', civ: 'aztecas', vsInfanteria: 1.3 },
  arquero_emplumado: { nombre: 'Arqueros Emplumados', rol: 'distancia', era: 1, atk: 8,  def: 5,  hp: 18, vel: 0.08, costo: 22,  icono: '🏹', civ: 'mayas', rango: 2 },
  // Héroes de las campañas de The Conquerors: uno por civilización, aparecen en la Era Medieval
  heroe_espanoles:   { nombre: 'El Cid',               rol: 'melee',     era: 2, atk: 26, def: 20, hp: 70, vel: 0.1,  costo: 999, icono: '⭐', civ: 'espanoles', caballo: true, heroe: true },
  heroe_aztecas:     { nombre: 'Moctezuma',            rol: 'melee',     era: 2, atk: 24, def: 22, hp: 70, vel: 0.09, costo: 999, icono: '⭐', civ: 'aztecas', heroe: true },
  heroe_mayas:       { nombre: 'Pacal el Grande',      rol: 'distancia', era: 2, atk: 22, def: 18, hp: 65, vel: 0.09, costo: 999, icono: '⭐', civ: 'mayas', rango: 2.5, heroe: true },
  heroe_coreanos:    { nombre: 'Almirante Yi Sun-sin', rol: 'naval',     era: 2, atk: 30, def: 30, hp: 90, vel: 0.14, costo: 999, icono: '⭐', civ: 'coreanos', rango: 2, heroe: true },
  heroe_hunos:       { nombre: 'Atila',                rol: 'melee',     era: 2, atk: 28, def: 18, hp: 70, vel: 0.12, costo: 999, icono: '⭐', civ: 'hunos', caballo: true, heroe: true, vsCiudad: 1.6 },
  barco_tortuga:     { nombre: 'Barcos Tortuga',     rol: 'naval',     era: 3, atk: 20, def: 24, hp: 40, vel: 0.12, costo: 48,  icono: '🐢', civ: 'coreanos', rango: 1.5 },
  tarkan:            { nombre: 'Tarkanes',           rol: 'melee',     era: 2, atk: 12, def: 8,  hp: 22, vel: 0.11, costo: 32,  icono: '🏇', civ: 'hunos', caballo: true, vsCiudad: 1.8 },
};

SIM.EDIFICIOS = {
  granja:     { nombre: 'Granjas',     costo: 40,  era: 0, desc: '+30% comida' },
  murallas:   { nombre: 'Murallas',    costo: 40,  era: 0, desc: 'mucha más defensa' },
  taller:     { nombre: 'Talleres',    costo: 45,  era: 0, desc: '+30% producción' },
  biblioteca: { nombre: 'Biblioteca',  costo: 50,  era: 1, desc: '+50% ciencia' },
  mercado:    { nombre: 'Mercado',     costo: 50,  era: 1, desc: '+60% oro' },
  puerto:     { nombre: 'Puerto',      costo: 45,  era: 1, desc: 'barcos y más comida del mar', costera: true },
  universidad:{ nombre: 'Universidad', costo: 80,  era: 3, desc: '+50% ciencia' },
  fabrica:    { nombre: 'Fábrica',     costo: 90,  era: 4, desc: '+50% producción' },
  aerodromo:  { nombre: 'Aeródromo',   costo: 90,  era: 5, desc: 'permite aviones' },
  maravilla:  { nombre: 'Maravilla',   costo: 1400, era: 3, desc: 'si la mantenés 250 turnos, ganás' },
};

SIM.FOCOS = {
  expansion: { nombre: 'Expansión', icono: '🏕', desc: 'fundar nuevas ciudades' },
  economia:  { nombre: 'Economía',  icono: '💰', desc: 'granjas, talleres y mercados' },
  ciencia:   { nombre: 'Ciencia',   icono: '📚', desc: 'avanzar de era más rápido' },
  militar:   { nombre: 'Ejército',  icono: '⚔', desc: 'entrenar tropas' },
};

// Poderes de Dios (recarga en turnos)
SIM.PODERES = {
  rayo:      { nombre: 'Rayo',           articulo: 'un',  icono: '⚡', recarga: 40,  radio: 1.5, desc: 'Cae sobre el lugar que elijas: daña a las tropas y a la ciudad que estén ahí.' },
  lluvia:    { nombre: 'Lluvia bendita', articulo: 'una', icono: '🌧', recarga: 60,  radio: 1,   desc: 'Sobre una ciudad tuya: gana 2 habitantes y se cura por completo.' },
  bendicion: { nombre: 'Bendición',      articulo: 'una', icono: '✨', recarga: 50,  radio: 3,   desc: 'Tus tropas en la zona se curan y pelean 30% más fuerte por un rato.' },
  terremoto: { nombre: 'Terremoto',      articulo: 'un',  icono: '🌋', recarga: 120, radio: 3,   desc: 'Derrumba murallas y daña ciudades y tropas enemigas en la zona.' },
  intriga:   { nombre: 'Intriga',        articulo: 'una', icono: '🕵', recarga: 180, radio: 1,   desc: 'Mandás una espía a una ciudad enemiga: si no reaccionan a tiempo, la ciudad se pasa a tu bando con sus tropas.' },
  peste:     { nombre: 'Peste',          articulo: 'una', icono: '🦠', recarga: 150, radio: 4,   desc: 'Enferma a las ciudades enemigas de la zona: pierden un tercio de la población.' },
};
