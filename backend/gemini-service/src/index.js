import { loadConfig, configured } from './config.js';
import { createService } from './server.js';
try {
  const config = loadConfig();
  const server = createService(config);
  server.listen(config.port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'started', ready: configured(config) })));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  });
} catch { console.error('Horizon backend configuration is invalid.'); process.exitCode = 1; }
