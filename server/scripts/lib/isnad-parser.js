/**
 * Isnad parser — extracts an ordered chain of narrators from hadith text.
 *
 * The isnad (chain of transmission) appears at the beginning of each hadith,
 * before the matn (body/content). Narrators are connected by transmission
 * verbs like حدثنا (told us), أخبرنا (informed us), عن (from/via).
 *
 * The chain order: position 0 = closest to the compiler (e.g. Bukhari),
 * position N = closest to the Prophet ﷺ.
 */

import { normalize } from './name-matcher.js';

// Transmission connectors (ordered by specificity)
const CONNECTORS = [
  { pattern: 'حدثنا', type: 'direct' },
  { pattern: 'حدثني', type: 'direct' },
  { pattern: 'أخبرنا', type: 'direct' },
  { pattern: 'أخبرني', type: 'direct' },
  { pattern: 'سمعت', type: 'direct' },
  { pattern: 'سمعنا', type: 'direct' },
  { pattern: 'أنبأنا', type: 'direct' },
  { pattern: 'عن', type: 'indirect' },
  { pattern: 'أن', type: 'indirect' },
];

// Words that mark the END of the isnad (beginning of matn)
const MATN_MARKERS = [
  'أن رسول الله',
  'أن النبي',
  'قال رسول الله',
  'قال النبي',
  'قال قال رسول',
  'رضي الله عنه قال',
  'رضي الله عنها قالت',
  'رضي الله عنهما',
  'يقول قال رسول',
];

// Stop words — not narrator names
const STOP_WORDS = new Set([
  'الله', 'رسول', 'النبي', 'محمد', 'رب', 'إن', 'لا', 'ما', 'من', 'في',
  'على', 'إلى', 'عند', 'كان', 'قال', 'يقول', 'ذلك', 'هذا', 'هؤلاء',
  'الذي', 'التي', 'الذين', 'ثم', 'بعد', 'قبل', 'حيث', 'لما', 'كل',
  'بعض', 'غير', 'مثل', 'أحد', 'شيء', 'يوم', 'ليلة', 'عام', 'سنة',
  'رجل', 'امرأة', 'ناس', 'قوم', 'أهل', 'أصحاب', 'عبد',
  'صلى', 'سلم', 'عليه', 'وسلم', 'بسم', 'الرحمن', 'الرحيم',
  'جميعا', 'أيضا', 'إذ', 'حتى', 'لعل', 'كيف', 'أين', 'متى',
]);

/**
 * Extract the isnad portion from hadith text (before the matn).
 */
function extractIsnadText(text) {
  // Find the earliest matn marker
  let cutoff = text.length;
  for (const marker of MATN_MARKERS) {
    const idx = text.indexOf(marker);
    if (idx > 0 && idx < cutoff) {
      cutoff = idx;
    }
  }

  // Also limit to first ~500 chars if no marker found (isnad rarely exceeds this)
  cutoff = Math.min(cutoff, 500);

  return text.substring(0, cutoff);
}

/**
 * Regex to capture a narrator name after a connector.
 * Handles: "حدثنا X بن Y بن Z" and "عن أبي X بن Y"
 */
const NAME_PATTERN = new RegExp(
  '(?:' + CONNECTORS.map(c => c.pattern).join('|') + ')' +
  '\\s+' +
  '(' +
    // Option 1: أبي/أبو/أم + name
    '(?:أب[يو]|أم)\\s+[\\u0600-\\u06FF]+' +
    '(?:\\s+بن\\s+[\\u0600-\\u06FF]+)*' +
  '|' +
    // Option 2: Regular name with patronymics
    '[\\u0600-\\u06FF]+' +
    '(?:\\s+بن\\s+[\\u0600-\\u06FF]+)*' +
    '(?:\\s+(?:ال)?[\\u0600-\\u06FF]+)?' +
  ')',
  'g'
);

/**
 * Parse a hadith text into an ordered chain of narrators.
 *
 * @param {string} text - Full hadith text (isnad + matn)
 * @returns {Array<{name_raw: string, name_normalized: string, position: number, connector_type: string}>}
 */
export function parseIsnad(text) {
  if (!text) return [];

  const isnadText = extractIsnadText(text);
  const chain = [];
  const seen = new Set(); // avoid duplicates within same chain

  // Strategy: scan for connectors in order of appearance in text
  // Build a list of all connector positions
  const connectorHits = [];
  for (const conn of CONNECTORS) {
    let startIdx = 0;
    while (true) {
      const idx = isnadText.indexOf(conn.pattern, startIdx);
      if (idx === -1) break;
      connectorHits.push({ idx, connector: conn.pattern, type: conn.type });
      startIdx = idx + conn.pattern.length;
    }
  }

  // Sort by position in text
  connectorHits.sort((a, b) => a.idx - b.idx);

  // For each connector, extract the name that follows
  for (const hit of connectorHits) {
    const afterConnector = isnadText.substring(hit.idx + hit.connector.length).trimStart();

    // Extract name: take words until we hit another connector or punctuation
    const nameMatch = extractNameAfterConnector(afterConnector);
    if (!nameMatch) continue;

    const raw = nameMatch.trim();
    if (raw.length < 3) continue;

    // Check stop words
    const firstWord = raw.split(/\s+/)[0];
    if (STOP_WORDS.has(normalize(firstWord))) continue;

    const normalized = normalize(raw);
    if (normalized.length < 3) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    chain.push({
      name_raw: raw,
      name_normalized: normalized,
      position: chain.length,
      connector_type: hit.type,
    });
  }

  return chain;
}

/**
 * Extract a narrator name from text that follows a connector word.
 */
function extractNameAfterConnector(text) {
  // Match: optional أبي/أبو prefix, then name words, with بن patronymics
  const match = text.match(
    /^((?:أب[يو]|أم)\s+[\u0600-\u06FF]+(?:\s+بن\s+[\u0600-\u06FF]+)*|[\u0600-\u06FF]+(?:\s+بن\s+[\u0600-\u06FF]+)*(?:\s+(?:ال)?[\u0600-\u06FF]+)?)/
  );
  if (!match) return null;

  let name = match[1];

  // Remove trailing particles that are not part of the name
  name = name.replace(/\s+(أنه|أنها|أن|عن|قال|قالت|يقول|كان|في|من|على|إلى|عند|لما|إذ|حتى|ثم)$/, '');

  return name.length >= 3 ? name : null;
}

/**
 * Build transmission pairs from a parsed chain.
 * Each adjacent pair (i, i+1) = student → teacher relationship.
 *
 * @param {Array} chain - Ordered chain from parseIsnad()
 * @returns {Array<{student_name: string, teacher_name: string, connector_type: string}>}
 */
export function extractTransmissions(chain) {
  const transmissions = [];
  for (let i = 0; i < chain.length - 1; i++) {
    transmissions.push({
      student_name: chain[i].name_normalized,
      teacher_name: chain[i + 1].name_normalized,
      student_raw: chain[i].name_raw,
      teacher_raw: chain[i + 1].name_raw,
      connector_type: chain[i + 1].connector_type,
      chain_position: i,
    });
  }
  return transmissions;
}
