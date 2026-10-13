function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid configuration: ${name}`);
  return value;
}
export function loadConfig(env = process.env) {
  const models = [...new Set([env.GEMINI_MODEL || 'gemini-3.1-flash-lite', env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite'])];
  if (models.some(model => !/^gemini-[a-z0-9.-]{1,70}$/.test(model))) throw new Error('Invalid model configuration');
  return {
    port: integer(env, 'PORT', 8080, 1, 65535),
    projectId: env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT,
    apiKey: env.GEMINI_API_KEY || '', models,
    requestTimeoutMs: integer(env, 'MODEL_TIMEOUT_MS', 60000, 1000, 120000),
    limits: {
      globalMinute: integer(env, 'GLOBAL_CALLS_PER_MINUTE', 10, 1, 100),
      globalDay: integer(env, 'GLOBAL_CALLS_PER_DAY', 100, 1, 1000),
      globalConcurrent: integer(env, 'GLOBAL_CONCURRENT_CALLS', 2, 1, 16),
    },
  };
}
export const configured = config => Boolean(config.apiKey && config.apiKey !== 'your_gemini_api_key_here');
