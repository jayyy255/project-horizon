function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid configuration: ${name}`);
  return value;
}
export function loadConfig(env = process.env) {
  const csv = name => (env[name] || '').split(',').map(value => value.trim()).filter(Boolean);
  const models = [...new Set([env.GEMINI_MODEL || 'gemini-3.1-flash-lite', env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite'])];
  if (models.some(model => !/^gemini-[a-z0-9.-]{1,70}$/.test(model))) throw new Error('Invalid model configuration');
  const audience = csv('GOOGLE_OAUTH_CLIENT_IDS');
  if (audience.some(id => !/^[a-zA-Z0-9.-]+\.apps\.googleusercontent\.com$/.test(id))) throw new Error('Invalid OAuth client configuration');
  const allowedEmails = csv('ALLOWED_EMAILS').map(email => email.toLowerCase());
  if (allowedEmails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Invalid account allowlist');
  return {
    port: integer(env, 'PORT', 8080, 1, 65535),
    projectId: env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT,
    apiKey: env.GEMINI_API_KEY || '', oauthClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET || '', audience, allowedEmails, models,
    requestTimeoutMs: integer(env, 'MODEL_TIMEOUT_MS', 60000, 1000, 120000),
    limits: {
      userMinute: integer(env, 'USER_CALLS_PER_MINUTE', 10, 1, 100),
      userDay: integer(env, 'USER_CALLS_PER_DAY', 100, 1, 1000),
      globalMinute: integer(env, 'GLOBAL_CALLS_PER_MINUTE', 20, 1, 100),
      globalDay: integer(env, 'GLOBAL_CALLS_PER_DAY', 200, 1, 1000),
      userConcurrent: integer(env, 'USER_CONCURRENT_CALLS', 2, 1, 5),
      globalConcurrent: integer(env, 'GLOBAL_CONCURRENT_CALLS', 4, 1, 16),
    },
  };
}
export const configured = config => Boolean(config.apiKey && config.apiKey !== 'your_gemini_api_key_here' && config.audience.length && config.allowedEmails.length);
