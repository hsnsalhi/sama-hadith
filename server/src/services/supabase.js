import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

export async function getNarrators({ limit = 1000, offset = 0, generation } = {}) {
  let query = supabase
    .from('narrators')
    .select('*')
    .order('death_ah', { ascending: true })
    .range(offset, offset + limit - 1);

  if (generation && generation !== 'all') {
    query = query.eq('generation', generation);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getNarratorById(id) {
  const { data, error } = await supabase
    .from('narrators')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function getTransmissions({ teacherId, studentId, limit = 5000 } = {}) {
  let query = supabase
    .from('transmissions')
    .select('*')
    .limit(limit);

  if (teacherId && studentId) {
    query = query.or(`teacher_id.eq.${teacherId},student_id.eq.${studentId}`);
  } else if (teacherId) {
    query = query.eq('teacher_id', teacherId);
  } else if (studentId) {
    query = query.eq('student_id', studentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getHadiths({ narratorId, limit = 2000 } = {}) {
  let query = supabase
    .from('hadiths')
    .select('*')
    .limit(limit);

  if (narratorId) {
    query = query.eq('narrator_id', narratorId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getNarratorsLite({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('narrators')
    .select('id,name_ar,generation,death_ah')
    .limit(limit);

  if (error) throw error;
  return data;
}
