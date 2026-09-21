import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSearchText,
  damerauLevenshtein,
  toPhoneticKey,
  matchesFuzzy,
  fuzzyScore
} from '../../src/lib/fuzzy-search.js';

test('normalizeSearchText elimina tildes y diacríticos preservando legibilidad', () => {
  assert.equal(normalizeSearchText('Plátanos'), 'platanos');
  assert.equal(normalizeSearchText('Sándwich'), 'sandwich');
  assert.equal(normalizeSearchText('Maíz'), 'maiz');
  assert.equal(normalizeSearchText('Jamón'), 'jamon');
  assert.equal(normalizeSearchText('Kétchup'), 'ketchup');
  assert.equal(normalizeSearchText('CAFÉ'), 'cafe');
  assert.equal(normalizeSearchText('  Güira  '), 'guira');
});

test('damerauLevenshtein calcula distancias con transposiciones', () => {
  assert.equal(damerauLevenshtein('platano', 'platano'), 0);
  assert.equal(damerauLevenshtein('platano', 'platanos'), 1); // inserción
  assert.equal(damerauLevenshtein('platnao', 'platano'), 1); // transposición adyacente
  assert.equal(damerauLevenshtein('pepsi', 'pesi'), 1); // omisión
  assert.equal(damerauLevenshtein('yaroa', 'yarooa'), 1); // letra extra
});

test('toPhoneticKey unifica letras con sonidos equivalentes en español', () => {
  assert.equal(toPhoneticKey('cerveza'), toPhoneticKey('servesa'));
  assert.equal(toPhoneticKey('pollo'), toPhoneticKey('poyo'));
  assert.equal(toPhoneticKey('queso'), toPhoneticKey('keso'));
  assert.equal(toPhoneticKey('hamburguesa'), toPhoneticKey('amburguesa'));
});

test('matchesFuzzy encuentra palabras sin importar tildes / acentos', () => {
  const target = 'Yaroa de Maíz Especial con Jamón y Queso';

  // Sin tilde busca con tilde
  assert.ok(matchesFuzzy('maiz', target), 'maiz debe encontrar Maíz');
  assert.ok(matchesFuzzy('jamon', target), 'jamon debe encontrar Jamón');
  assert.ok(matchesFuzzy('yaroa', target), 'yaroa debe encontrar Yaroa');

  // Con tilde busca sin tilde
  assert.ok(matchesFuzzy('plátano', 'Platano con Salami'));
  assert.ok(matchesFuzzy('sándwich', 'Sandwich de Pierna'));
});

test('matchesFuzzy tolera errores ortográficos y dedos rápidos (typos)', () => {
  // Letras repetidas o dedos rápidos
  assert.ok(matchesFuzzy('yarooa', 'Yaroa de Pollo'), 'yarooa debe encontrar Yaroa');
  assert.ok(matchesFuzzy('pesi', 'Refresco Pepsi 20oz'), 'pesi debe encontrar Pepsi');
  assert.ok(matchesFuzzy('sandwis', 'Sándwich Especial'), 'sandwis debe encontrar Sándwich');
  assert.ok(matchesFuzzy('sandwish', 'Sándwich Especial'), 'sandwish debe encontrar Sándwich');
  assert.ok(matchesFuzzy('chimichuri', 'Chimichurri Especial'), 'chimichuri debe encontrar Chimichurri');
  assert.ok(matchesFuzzy('hamburgesa', 'Hamburguesa Doble'), 'hamburgesa debe encontrar Hamburguesa');
  assert.ok(matchesFuzzy('amborguesa', 'Hamburguesa Clásica'), 'amborguesa debe encontrar Hamburguesa');
  assert.ok(matchesFuzzy('platanos', 'Plátano Maduro'), 'platanos debe encontrar Plátano');
  assert.ok(matchesFuzzy('platano', 'Plátanos Maduros'), 'platano debe encontrar Plátanos');
  assert.ok(matchesFuzzy('nacho', 'Nachos Supremos'), 'nacho debe encontrar Nachos');
  assert.ok(matchesFuzzy('servesa', 'Cerveza Presidente'), 'servesa debe encontrar Cerveza');
});

test('matchesFuzzy soporta palabras desordenadas y omisión de conectores', () => {
  const product = 'Yaroa Especial de Pollo';

  assert.ok(matchesFuzzy('pollo yaroa', product), 'pollo yaroa debe encontrar Yaroa de Pollo');
  assert.ok(matchesFuzzy('yaroa pollo', product), 'yaroa pollo debe encontrar Yaroa de Pollo');
  assert.ok(matchesFuzzy('yaroa con pollo', product), 'yaroa con pollo debe encontrar Yaroa Especial de Pollo');
  assert.ok(matchesFuzzy('pollo especial', product), 'pollo especial debe encontrar Yaroa Especial de Pollo');
});

test('matchesFuzzy soporta búsquedas compactas sin espacios ni guiones', () => {
  assert.ok(matchesFuzzy('cocacola', 'Refresco Coca-Cola 2L'));
  assert.ok(matchesFuzzy('coca cola', 'Refresco Coca-Cola 2L'));
  assert.ok(matchesFuzzy('7up', 'Refresco 7-Up Lata'));
});

test('matchesFuzzy rechaza palabras totalmente inconexas', () => {
  const product = 'Yaroa de Pollo';
  assert.ok(!matchesFuzzy('pizza', product));
  assert.ok(!matchesFuzzy('sushi', product));
  assert.ok(!matchesFuzzy('mofongo', product));
  assert.ok(!matchesFuzzy('zzzzzz', product));
});

test('fuzzyScore califica mejor las coincidencias exactas sobre las aproximadas', () => {
  const scoreExact = fuzzyScore('yaroa', 'Yaroa');
  const scorePrefix = fuzzyScore('yar', 'Yaroa');
  const scoreFuzzy = fuzzyScore('yarooa', 'Yaroa');
  const scoreNone = fuzzyScore('hamburguesa', 'Yaroa');

  assert.ok(scoreExact > scorePrefix, 'Exacto debe puntuar más alto que prefijo');
  assert.ok(scorePrefix > scoreFuzzy, 'Prefijo debe puntuar más alto que fuzzy');
  assert.ok(scoreFuzzy > scoreNone, 'Fuzzy debe puntuar más alto que no coincidencia');
  assert.equal(scoreNone, 0, 'No coincidencia debe retornar 0');
});
