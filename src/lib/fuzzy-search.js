/**
 * Motor de Búsqueda Inteligente y Tolerante a Errores (Fuzzy Search)
 * Diseñado para entornos POS rápidos y pantallas táctiles.
 * 
 * Soporta:
 * 1. Insensibilidad total a tildes / acentos (á, é, í, ó, ú, ü, etc.)
 * 2. Tolerancia a errores ortográficos y dedos rápidos (Damerau-Levenshtein)
 * 3. Búsqueda por palabras desordenadas (ej. "pollo yaroa" -> "Yaroa de Pollo")
 * 4. Búsqueda por prefijos y subcadenas sin espacios/guiones (ej. "cocacola" -> "Coca-Cola")
 * 5. Equivalencias fonéticas comunes en español (b/v, s/z/c, y/ll, omisión de h muda)
 * 6. Palabras de enlace opcionales (de, con, para, el, la...) cuando hay términos clave
 */

const CONNECTORS = new Set(['de', 'con', 'en', 'el', 'la', 'los', 'las', 'un', 'una', 'y', 'o', 'al', 'del', 'para', 'por']);

/**
 * Normaliza texto eliminando acentos, caracteres diacríticos y pasando a minúsculas.
 */
export function normalizeSearchText(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Distancia Damerau-Levenshtein: cuenta inserciones, eliminaciones,
 * sustituciones y transposiciones de letras adyacentes como costo 1.
 */
export function damerauLevenshtein(a, b) {
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;

  const d = [];
  for (let i = 0; i <= al; i++) {
    d[i] = new Array(bl + 1);
    d[i][0] = i;
  }
  for (let j = 0; j <= bl; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    const aChar = a[i - 1];
    for (let j = 1; j <= bl; j++) {
      const cost = aChar === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // Eliminación
        d[i][j - 1] + 1,      // Inserción
        d[i - 1][j - 1] + cost // Sustitución
      );
      // Transposición adyacente (ej. "teh" -> "the", "platnao" -> "platano")
      if (i > 1 && j > 1 && aChar === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[al][bl];
}

/**
 * Genera clave fonética simplificada en español:
 * - b/v unificadas
 * - c (ante e/i), z, s unificadas
 * - qu y c (ante a/o/u) unificadas a k
 * - ll y y unificadas
 * - h muda eliminada (excepto ch)
 * - Letras duplicadas colapsadas (ej. "oo" -> "o", "pp" -> "p")
 */
export function toPhoneticKey(text) {
  const norm = normalizeSearchText(text);
  if (!norm) return '';
  return norm
    .replace(/v/g, 'b')
    .replace(/z/g, 's')
    .replace(/ce/g, 'se')
    .replace(/ci/g, 'si')
    .replace(/ll/g, 'y')
    .replace(/qu/g, 'k')
    .replace(/c(?=[aou\s\d]|$)/g, 'k')
    .replace(/(?<!c)h/g, '')
    .replace(/([a-z])\1+/g, '$1');
}

/**
 * Determina el margen máximo de tolerancia a errores según la longitud del token.
 */
export function maxAllowedDistance(len) {
  if (len <= 2) return 0; // 1-2 letras: coincidencia exacta o prefijo
  if (len <= 4) return 1; // 3-4 letras: 1 error o transposición permitida
  return 2;              // 5+ letras: hasta 2 errores permitidos
}

/**
 * Evalúa si un token individual coincide con alguna palabra del texto objetivo.
 */
export function tokenMatchesWord(token, word) {
  if (!token || !word) return false;
  if (token === word) return true;

  // 1. Prefijo directo
  if (word.startsWith(token)) return true;
  if (token.startsWith(word) && word.length >= 3) return true;

  // 2. Subcadena directa
  if (word.includes(token)) return true;

  const tLen = token.length;
  const wLen = word.length;
  const maxDist = maxAllowedDistance(tLen);

  if (maxDist > 0) {
    // 3. Distancia Damerau-Levenshtein contra la palabra completa
    if (Math.abs(wLen - tLen) <= maxDist) {
      if (damerauLevenshtein(token, word) <= maxDist) return true;
    }

    // 4. Prefijo con error (si la palabra objetivo es más larga)
    if (wLen > tLen && tLen >= 4) {
      const wordPrefix = word.slice(0, tLen);
      if (damerauLevenshtein(token, wordPrefix) <= 1) return true;
    }

    // 5. Comparación fonética
    const phToken = toPhoneticKey(token);
    const phWord = toPhoneticKey(word);
    if (phToken.length >= 3 && phWord.length >= 3) {
      if (phWord.startsWith(phToken)) return true;
      if (Math.abs(phWord.length - phToken.length) <= maxDist) {
        if (damerauLevenshtein(phToken, phWord) <= maxDist) return true;
      }
    }
  }

  return false;
}

/**
 * Evalúa si la consulta coincide con el texto objetivo con tolerancia a errores y tildes.
 * @param {string} query - Lo que escribió el usuario.
 * @param {string} target - Texto donde buscar (nombre del producto, SKU, categoría, etc.).
 * @returns {boolean} true si coincide, false si no.
 */
export function matchesFuzzy(query, target) {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return true;

  const normTarget = normalizeSearchText(target);
  if (!normTarget) return false;

  // Vía rápida 1: Subcadena directa
  if (normTarget.includes(normQuery)) return true;

  // Vía rápida 2: Compacta (sin espacios ni puntuación, ej. "cocacola" en "coca-cola")
  const compQuery = normQuery.replace(/[^a-z0-9]/g, '');
  const compTarget = normTarget.replace(/[^a-z0-9]/g, '');
  if (compQuery && compTarget.includes(compQuery)) return true;

  // Separar en palabras clave
  const queryTokens = normQuery.split(/[^a-z0-9]+/).filter(Boolean);
  if (!queryTokens.length) return true;

  const targetWords = normTarget.split(/[^a-z0-9]+/).filter(Boolean);
  if (!targetWords.length) return false;

  // Identificar tokens significativos vs conectores
  const significantTokens = queryTokens.filter(t => !CONNECTORS.has(t) || t.length >= 4);
  const tokensToCheck = significantTokens.length > 0 ? significantTokens : queryTokens;

  // Cada token de la consulta debe coincidir con al menos una palabra del objetivo
  return tokensToCheck.every((qToken) => {
    // Verificar si coincide con el texto objetivo completo como subcadena
    if (normTarget.includes(qToken)) return true;
    return targetWords.some((tWord) => tokenMatchesWord(qToken, tWord));
  });
}

/**
 * Calcula un puntaje de relevancia (score) para ordenar resultados.
 * Cuanto mayor el puntaje, mejor la coincidencia.
 * Retorna 0 si no coincide.
 */
export function fuzzyScore(query, target) {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return 100;

  const normTarget = normalizeSearchText(target);
  if (!normTarget) return 0;

  // 1. Coincidencia exacta completa
  if (normTarget === normQuery) return 1000;

  // 2. Empieza exactamente con la consulta
  if (normTarget.startsWith(normQuery)) return 800;

  // 3. Contiene la frase completa como subcadena
  if (normTarget.includes(normQuery)) return 600;

  // 4. Versión compacta contiene la consulta (ej. "cocacola" -> "coca-cola")
  const compQuery = normQuery.replace(/[^a-z0-9]/g, '');
  const compTarget = normTarget.replace(/[^a-z0-9]/g, '');
  if (compQuery && compTarget.includes(compQuery)) return 500;

  // 5. Coincidencia por tokens
  const queryTokens = normQuery.split(/[^a-z0-9]+/).filter(Boolean);
  if (!queryTokens.length) return 100;

  const targetWords = normTarget.split(/[^a-z0-9]+/).filter(Boolean);
  if (!targetWords.length) return 0;

  let totalScore = 0;
  let matchesCount = 0;

  for (const qToken of queryTokens) {
    let bestWordScore = 0;
    for (const tWord of targetWords) {
      if (tWord === qToken) {
        bestWordScore = Math.max(bestWordScore, 200);
      } else if (tWord.startsWith(qToken)) {
        bestWordScore = Math.max(bestWordScore, 150);
      } else if (tWord.includes(qToken)) {
        bestWordScore = Math.max(bestWordScore, 100);
      } else if (tokenMatchesWord(qToken, tWord)) {
        const dist = damerauLevenshtein(qToken, tWord);
        bestWordScore = Math.max(bestWordScore, Math.max(20, 80 - dist * 25));
      }
    }
    if (bestWordScore > 0) {
      matchesCount++;
      totalScore += bestWordScore;
    }
  }

  const significantTokens = queryTokens.filter(t => !CONNECTORS.has(t) || t.length >= 4);
  const requiredCount = significantTokens.length > 0 ? significantTokens.length : queryTokens.length;

  return matchesCount >= requiredCount ? totalScore : 0;
}
