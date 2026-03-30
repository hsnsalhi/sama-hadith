import { Router } from 'express';
import { getTransmissions } from '../services/supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { teacher_id, student_id, limit } = req.query;
    const data = await getTransmissions({
      teacherId: teacher_id ? parseInt(teacher_id) : undefined,
      studentId: student_id ? parseInt(student_id) : undefined,
      limit: parseInt(limit) || 5000,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
