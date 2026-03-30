import { GEO_CITIES } from './constants.js';

// Geographic origin → Y world coordinate mapping
const GEO_Y_MAP = [
  { keys: ['الأندلس', 'أندلس', 'قرطبة', 'إشبيلية'], y: 160 },
  { keys: ['المغرب', 'فاس', 'مراكش', 'القيروان', 'تونس'], y: 140 },
  { keys: ['الشام', 'دمشق', 'سوريا', 'حلب', 'حمص', 'حماة'], y: 110 },
  { keys: ['بغداد', 'العراق'], y: 100 },
  { keys: ['الكوفة', 'كوفة'], y: 90 },
  { keys: ['واسط'], y: 85 },
  { keys: ['البصرة', 'بصرة'], y: 75 },
  { keys: ['خراسان', 'نيسابور', 'مرو', 'هراة', 'بلخ'], y: 105 },
  { keys: ['الري', 'ري', 'همدان', 'أصبهان', 'إصبهان'], y: 95 },
  { keys: ['فارس', 'شيراز', 'الأهواز'], y: 70 },
  { keys: ['الأناضول', 'قسطنطينية', 'أنقرة'], y: 120 },
  { keys: ['أذربيجان', 'أرمينيا'], y: 130 },
  { keys: ['الجزيرة', 'الموصل', 'نصيبين'], y: 95 },
  { keys: ['فلسطين', 'القدس', 'الرملة', 'عسقلان'], y: 80 },
  { keys: ['مصر', 'الفسطاط', 'الإسكندرية', 'القاهرة'], y: 40 },
  { keys: ['المدينة', 'المدينة المنورة', 'يثرب'], y: -10 },
  { keys: ['مكة', 'مكة المكرمة'], y: -30 },
  { keys: ['الطائف'], y: -40 },
  { keys: ['الحجاز'], y: -20 },
  { keys: ['نجد', 'الرياض'], y: -50 },
  { keys: ['اليمن', 'صنعاء', 'حضرموت', 'عدن'], y: -110 },
];

export function getGeoY(origin) {
  if (!origin) return null;
  const o = origin.toLowerCase();
  for (const { keys, y } of GEO_Y_MAP) {
    for (const k of keys) {
      if (o.includes(k.toLowerCase())) return y;
    }
  }
  return null;
}

export function getCoords(origin) {
  if (!origin) return null;
  for (const [k, v] of Object.entries(GEO_CITIES)) {
    if (origin.includes(k)) return v;
  }
  return null;
}
