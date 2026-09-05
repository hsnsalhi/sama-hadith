// Vercel serverless entry point: every /api/* request is rewritten here
// (see vercel.json) and handled by the shared Express app.
import { app } from '../server/src/app.js';

export default app;
