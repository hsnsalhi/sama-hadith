#!/usr/bin/env node
/**
 * Rebuild database pipeline:
 * 1. Truncate all tables
 * 2. Fetch hadiths from 9 collections
 * 3. Parse isnads → ordered narrator chains
 * 4. Build narrators (enriched with reference data)
 * 5. Deduce transmissions from chain adjacency
 * 6. Insert everything into Supabase
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseIsnad, extractTransmissions } from './lib/isnad-parser.js';
import { normalize, matchName } from './lib/name-matcher.js';
import { loadReference, estimateGeneration } from './lib/reference-loader.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const COLLECTIONS = [
  { id: 'ara-bukhari1', name: 'البخاري' },
  { id: 'ara-muslim1', name: 'مسلم' },
  { id: 'ara-abudawud1', name: 'أبو داود' },
  { id: 'ara-tirmidhi1', name: 'الترمذي' },
  { id: 'ara-nasai1', name: 'النسائي' },
  { id: 'ara-ibnmajah1', name: 'ابن ماجه' },
  { id: 'ara-malik1', name: 'الموطأ' },
  // Note: Ahmad and Darimi not available in fawazahmed0 API
];

const API_BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';

function log(msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }

// ── Step 1: Truncate ──────────────────────────────────────────────────────────

async function truncateAll() {
  log('Step 1: Truncating all tables...');
  // Delete in batches to avoid statement timeout
  for (const table of ['transmissions', 'hadiths', 'narrators']) {
    let deleted = 0;
    while (true) {
      const { data } = await supabase.from(table).select('id').limit(5000);
      if (!data || data.length === 0) break;
      const ids = data.map(r => r.id);
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) { log(`  Warning on ${table}: ${error.message}`); break; }
      deleted += ids.length;
      log(`  ${table}: deleted ${deleted} rows...`);
    }
    log(`  Cleared: ${table} (${deleted} rows)`);
  }
}

// ── Step 2: Fetch hadiths ─────────────────────────────────────────────────────

async function fetchCollection(collId) {
  const url = `${API_BASE}/${collId}.min.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${collId}: ${res.status}`);
  const data = await res.json();
  // The API returns { hadiths: [...] } or the array directly
  return data.hadiths || data;
}

async function fetchAllHadiths() {
  log('Step 2: Fetching hadiths from 9 collections...');
  const allHadiths = [];

  for (const coll of COLLECTIONS) {
    try {
      const hadiths = await fetchCollection(coll.id);
      const items = Array.isArray(hadiths) ? hadiths : Object.values(hadiths);
      log(`  ${coll.name}: ${items.length} hadiths`);
      for (const h of items) {
        allHadiths.push({
          text_ar: h.text,
          collection: coll.name,
          hadith_number: h.hadithnumber || h.arabicnumber,
          grades: h.grades || [],
        });
      }
    } catch (e) {
      log(`  ERROR fetching ${coll.name}: ${e.message}`);
    }
  }

  log(`  Total hadiths fetched: ${allHadiths.length}`);
  return allHadiths;
}

// ── Step 3: Parse isnads ──────────────────────────────────────────────────────

function parseAllIsnads(hadiths) {
  log('Step 3: Parsing isnads...');
  const narratorStats = new Map(); // normalized name → stats
  const allChains = [];            // { hadithIdx, chain }
  let parsedCount = 0;

  for (let i = 0; i < hadiths.length; i++) {
    const chain = parseIsnad(hadiths[i].text_ar);
    if (chain.length === 0) continue;

    parsedCount++;
    allChains.push({ hadithIdx: i, chain });

    for (const link of chain) {
      const key = link.name_normalized;
      if (!narratorStats.has(key)) {
        narratorStats.set(key, {
          name_raw: link.name_raw,
          name_normalized: key,
          count: 0,
          collections: new Set(),
          positions: [],
          maxChainLen: 0,
        });
      }
      const stat = narratorStats.get(key);
      stat.count++;
      stat.collections.add(hadiths[i].collection);
      stat.positions.push(link.position);
      stat.maxChainLen = Math.max(stat.maxChainLen, chain.length);
    }
  }

  log(`  Chains parsed: ${parsedCount}/${hadiths.length}`);
  log(`  Unique narrator names: ${narratorStats.size}`);
  return { narratorStats, allChains };
}

// ── Step 4: Build narrators ───────────────────────────────────────────────────

function buildNarrators(narratorStats, refMap) {
  log('Step 4: Building narrators with reference enrichment...');
  const narrators = [];
  let matched = 0;

  for (const [key, stat] of narratorStats) {
    // Skip very rare names (likely parsing errors)
    if (stat.count < 2) continue;
    // Skip very short names
    if (key.length < 3) continue;

    const ref = matchName(key, refMap);
    const avgPos = stat.positions.reduce((a, b) => a + b, 0) / stat.positions.length;
    const avgMaxLen = stat.maxChainLen;

    if (ref) {
      matched++;
      narrators.push({
        name_ar: stat.name_raw,
        name_latin: ref.name_latin || null,
        death_ah: ref.death_ah || null,
        generation: ref.generation,
        origin: ref.origin || null,
        reliability: ref.reliability || null,
        hadith_count: stat.count,
        collections: [...stat.collections],
        _normalized: key,
      });
    } else {
      narrators.push({
        name_ar: stat.name_raw,
        name_latin: null,
        death_ah: null,
        generation: estimateGeneration(avgPos, avgMaxLen),
        origin: null,
        reliability: null,
        hadith_count: stat.count,
        collections: [...stat.collections],
        _normalized: key,
      });
    }
  }

  log(`  Narrators built: ${narrators.length}`);
  log(`  Matched with reference: ${matched} (${Math.round(matched / narrators.length * 100)}%)`);
  return narrators;
}

// ── Step 5: Insert narrators ──────────────────────────────────────────────────

async function insertNarrators(narrators) {
  log('Step 5: Inserting narrators into database...');
  const idMap = new Map(); // normalized name → DB id
  const BATCH = 100;

  for (let i = 0; i < narrators.length; i += BATCH) {
    const batch = narrators.slice(i, i + BATCH).map(n => ({
      name_ar: n.name_ar,
      name_latin: n.name_latin,
      death_ah: n.death_ah,
      generation: n.generation,
      origin: n.origin,
      reliability: n.reliability,
      hadith_count: n.hadith_count,
      collections: n.collections,
    }));

    const { data, error } = await supabase.from('narrators').insert(batch).select('id, name_ar');
    if (error) {
      log(`  ERROR batch ${i}: ${error.message}`);
      continue;
    }

    // Map back to normalized names
    for (let j = 0; j < data.length; j++) {
      const norm = narrators[i + j]._normalized;
      idMap.set(norm, data[j].id);
    }

    if ((i / BATCH) % 10 === 0) {
      log(`  Inserted ${Math.min(i + BATCH, narrators.length)}/${narrators.length}`);
    }
  }

  log(`  Narrator IDs mapped: ${idMap.size}`);
  return idMap;
}

// ── Step 6: Insert hadiths ────────────────────────────────────────────────────

async function insertHadiths(hadiths, allChains, narratorIdMap) {
  log('Step 6: Inserting hadiths...');
  const BATCH = 200;
  const hadithIdMap = new Map(); // hadithIdx → DB id

  // For each hadith, find the primary narrator (last in chain = closest to Prophet)
  const hadithRecords = hadiths.map((h, idx) => {
    const chain = allChains.find(c => c.hadithIdx === idx);
    let narratorId = null;
    if (chain && chain.chain.length > 0) {
      const lastNarrator = chain.chain[chain.chain.length - 1];
      narratorId = narratorIdMap.get(lastNarrator.name_normalized) || null;
    }
    return {
      text_ar: h.text_ar?.substring(0, 5000) || '',
      collection: h.collection,
      hadith_number: h.hadith_number ? Math.floor(Number(h.hadith_number)) : null,
      narrator_id: narratorId,
    };
  });

  for (let i = 0; i < hadithRecords.length; i += BATCH) {
    const batch = hadithRecords.slice(i, i + BATCH);
    const { data, error } = await supabase.from('hadiths').insert(batch).select('id');
    if (error) {
      log(`  ERROR hadith batch ${i}: ${error.message}`);
      continue;
    }
    for (let j = 0; j < data.length; j++) {
      hadithIdMap.set(i + j, data[j].id);
    }
    if ((i / BATCH) % 50 === 0) {
      log(`  Inserted ${Math.min(i + BATCH, hadithRecords.length)}/${hadithRecords.length} hadiths`);
    }
  }

  log(`  Hadiths inserted: ${hadithIdMap.size}`);
  return hadithIdMap;
}

// ── Step 7: Deduce and insert transmissions ───────────────────────────────────

async function buildAndInsertTransmissions(allChains, narratorIdMap) {
  log('Step 7: Deducing transmissions from isnad chains...');

  // Build unique transmission pairs with counts
  const pairMap = new Map(); // "teacherId-studentId" → { teacher_id, student_id, confidence, count }

  for (const { chain } of allChains) {
    const transmissions = extractTransmissions(chain);
    for (const t of transmissions) {
      const teacherId = narratorIdMap.get(t.teacher_name);
      const studentId = narratorIdMap.get(t.student_name);
      if (!teacherId || !studentId) continue;
      if (teacherId === studentId) continue;

      const key = `${teacherId}-${studentId}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          teacher_id: teacherId,
          student_id: studentId,
          confidence: t.connector_type,
          chain_position: t.chain_position,
          chain_length: chain.length,
        });
      }
    }
  }

  log(`  Unique transmission pairs: ${pairMap.size}`);

  // Insert in batches
  const pairs = [...pairMap.values()];
  const BATCH = 200;

  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);
    const { error } = await supabase.from('transmissions').insert(batch);
    if (error) {
      log(`  ERROR transmission batch ${i}: ${error.message}`);
      continue;
    }
    if ((i / BATCH) % 20 === 0) {
      log(`  Inserted ${Math.min(i + BATCH, pairs.length)}/${pairs.length} transmissions`);
    }
  }

  log(`  Transmissions inserted: ${pairs.length}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  SAMA AL-HADITH — Database Rebuild');
  console.log('═══════════════════════════════════════════\n');

  const start = Date.now();

  // Step 1: Truncate
  await truncateAll();

  // Step 2: Load reference
  const refMap = loadReference();

  // Step 3: Fetch hadiths
  const hadiths = await fetchAllHadiths();

  // Step 4: Parse isnads
  const { narratorStats, allChains } = parseAllIsnads(hadiths);

  // Step 5: Build narrators
  const narrators = buildNarrators(narratorStats, refMap);

  // Step 6: Insert narrators
  const narratorIdMap = await insertNarrators(narrators);

  // Step 7: Insert hadiths
  const hadithIdMap = await insertHadiths(hadiths, allChains, narratorIdMap);

  // Step 8: Deduce & insert transmissions
  await buildAndInsertTransmissions(allChains, narratorIdMap);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Done in ${elapsed}s`);
  console.log(`  Narrators: ${narrators.length}`);
  console.log(`  Hadiths:   ${hadiths.length}`);
  console.log(`  Chains:    ${allChains.length}`);
  console.log('═══════════════════════════════════════════');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
