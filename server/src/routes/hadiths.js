import { Router } from 'express';
import { getHadiths } from '../services/supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { narrator_id, limit } = req.query;
    const data = await getHadiths({
      narratorId: narrator_id ? parseInt(narrator_id) : undefined,
      limit: parseInt(limit) || 2000,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
