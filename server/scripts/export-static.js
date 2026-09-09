#!/usr/bin/env node
/**
 * Exports a static JSON snapshot of the database for GitHub Pages
 * (no server available there). Mirrors the default API responses:
 *   client/public/data/narrators.json        - same 1000 rows as GET /api/narrators
 *   client/public/data/transmissions.json    - every transmission linking those narrators
 *   client/public/data/hadiths/<id>.json     - up to 30 hadiths per narrator
 *   client/public/data/manifest.json         - counts + generation date
 */
import 'dotenv/config';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('export-static: SUPABASE_URL and SUPABASE_KEY must be set');
  process.exit(1);
}

const { getNarrators, getTransmissionsAmong, getHadiths } = await import('../src/services/supabase.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../client/public/data');
const HADITHS_PER_NARRATOR = 30;
const CONCURRENCY = 8;

const log = m => console.log(`[export] ${m}`);

await rm(OUT, { recursive: true, force: true });
await mkdir(resolve(OUT, 'hadiths'), { recursive: true });

log('narrators…');
const narrators = await getNarrators();
await writeFile(resolve(OUT, 'narrators.json'), JSON.stringify(narrators));
log(`  ${narrators.length} narrators`);

log('transmissions…');
const ids = narrators.map(n => n.id);
const transmissions = await getTransmissionsAmong(ids);
await writeFile(resolve(OUT, 'transmissions.json'), JSON.stringify(transmissions));
log(`  ${transmissions.length} transmissions`);

log('hadiths (per narrator)…');
let done = 0, withHadiths = 0;
const queue = [...ids];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const id = queue.shift();
    const rows = await getHadiths({ narratorId: id, limit: HADITHS_PER_NARRATOR });
    if (rows.length) {
      withHadiths++;
      await writeFile(resolve(OUT, 'hadiths', `${id}.json`), JSON.stringify(rows));
    }
    if (++done % 200 === 0) log(`  ${done}/${ids.length}`);
  }
}));
log(`  ${withHadiths} narrators with hadiths`);

await writeFile(resolve(OUT, 'manifest.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  narrators: narrators.length,
  transmissions: transmissions.length,
  narrators_with_hadiths: withHadiths,
}, null, 2));
log('done');
