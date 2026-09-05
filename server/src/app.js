import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
import narratorsRouter from './routes/narrators.js';
import transmissionsRouter from './routes/transmissions.js';
import hadithsRouter from './routes/hadiths.js';

export const app = express();

app.disable('x-powered-by');
app.use(corsMiddleware);

app.use('/api/narrators', narratorsRouter);
app.use('/api/transmissions', transmissionsRouter);
app.use('/api/hadiths', hadithsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
