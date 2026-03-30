import { Router } from 'express';
import { getNarrators, getNarratorById, getNarratorsLite } from '../services/supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { limit, offset, generation, fields } = req.query;

    if (fields === 'lite') {
      const data = await getNarratorsLite({ limit: parseInt(limit) || 500 });
      return res.json(data);
    }

    const data = await getNarrators({
      limit: parseInt(limit) || 1000,
      offset: parseInt(offset) || 0,
      generation,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await getNarratorById(parseInt(req.params.id));
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
