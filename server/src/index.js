import express from 'express';
import { config } from './config.js';
import { corsMiddleware } from './middleware/cors.js';
import narratorsRouter from './routes/narrators.js';
import transmissionsRouter from './routes/transmissions.js';
import hadithsRouter from './routes/hadiths.js';

const app = express();

app.use(corsMiddleware);

app.use('/api/narrators', narratorsRouter);
app.use('/api/transmissions', transmissionsRouter);
app.use('/api/hadiths', hadithsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
