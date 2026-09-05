/**
 * Arabic name normalization and fuzzy matching for hadith narrators.
 */

// Remove Arabic diacritics (tashkeel)
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

/**
 * Normalize an Arabic name for comparison.
 * Strips diacritics, normalizes letter variants, trims.
 */
export function normalize(name) {
  if (!name) return '';
  return name
    .replace(DIACRITICS, '')        // Remove tashkeel
    .replace(/[أإآٱ]/g, 'ا')        // Normalize alef variants
    .replace(/ؤ/g, 'و')             // Waw with hamza → waw
    .replace(/ئ/g, 'ي')             // Ya with hamza → ya
    .replace(/ة/g, 'ه')             // Ta marbuta → ha
    .replace(/ى/g, 'ي')             // Alef maqsura → ya
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .trim();
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Match a normalized name against a reference dictionary.
 * Returns the best match or null.
 *
 * @param {string} name - Normalized Arabic name
 * @param {Map<string, object>} refMap - Map of normalized name → reference data
 * @param {number} maxDist - Max Levenshtein distance for fuzzy match
 * @returns {object|null} Reference data or null
 */
export function matchName(name, refMap, maxDist = 3) {
  // Exact match
  if (refMap.has(name)) return refMap.get(name);

  // Substring match: only if one name fully contains the other
  // AND the shorter name is at least 8 chars (avoid false positives on short names)
  for (const [refName, refData] of refMap) {
    const shorter = name.length < refName.length ? name : refName;
    if (shorter.length >= 8 && (refName.includes(name) || name.includes(refName))) {
      return refData;
    }
  }

  // Fuzzy match (only for names > 6 chars to avoid false positives)
  if (name.length > 6) {
    let bestMatch = null;
    let bestDist = maxDist + 1;
    for (const [refName, refData] of refMap) {
      const dist = levenshtein(name, refName);
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = refData;
      }
    }
    if (bestMatch && bestDist <= maxDist) return bestMatch;
  }

  return null;
}
