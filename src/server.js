import { createApp } from './app.js';

const port = Number(process.env.PORT || 3028);
const { server, store } = createApp({
  origin: process.env.APP_ORIGIN || `http://localhost:${port}`,
  dbPath: process.env.DB_PATH || './data/translate.sqlite',
  username: process.env.ADMIN_USERNAME || 'admin',
  passwordHash: process.env.ADMIN_PASSWORD_HASH,
  omniUrl: process.env.OMNI_BASE_URL || 'http://127.0.0.1:20128/v1',
  omniKey: process.env.OMNI_API_KEY,
  defaultModel: process.env.DEFAULT_MODEL || 'openrouter/auto',
  fallbackModels: (process.env.FALLBACK_MODELS || 'gpt-6-astra,sv2969').split(',').map((m) => m.trim()).filter(Boolean),
  secureCookie: process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY === '1',
});

server.listen(port, '127.0.0.1', () => console.log(`Translation service listening on 127.0.0.1:${port}`));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 95000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
