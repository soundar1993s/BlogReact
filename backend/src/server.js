require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');

const { pool, checkDbConnection } = require('./config/db');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');

const app = express();
const PORT = process.env.PORT || 5000;
app.disable('x-powered-by');
app.set('trust proxy', 1);
let shuttingDown = false;

// --- Prometheus metrics ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
});
register.registerMetric(httpRequestDuration);
register.registerMetric(new client.Gauge({
  name: 'blogapp_database_up',
  help: 'Whether the API can query MySQL',
  async collect() {
    try {
      await checkDbConnection();
      this.set(1);
    } catch (_err) {
      this.set(0);
    }
  },
}));

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // Use route templates so post slugs cannot create unbounded metric labels.
    end({ method: req.method, route: req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched', status: res.statusCode });
  });
  next();
});

// --- Middleware ---
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));
app.use(
  '/api',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
);

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);

// Kubernetes liveness probe
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

// Kubernetes readiness probe - verifies DB connectivity
app.get('/readyz', async (_req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'not-ready' });
  try {
    await checkDbConnection();
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not-ready' });
  }
});

// Prometheus scrape endpoint
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`Blog API listening on port ${PORT}`));
  const stop = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 25000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = app;
