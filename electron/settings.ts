import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

const keyPath = () => path.join(app.getPath('userData'), 'gemini-api-key.enc');

export function loadGeminiKey(): void {
  if (!fs.existsSync(keyPath()) || !safeStorage.isEncryptionAvailable()) return;
  try { process.env.GEMINI_API_KEY = safeStorage.decryptString(fs.readFileSync(keyPath())); }
  catch { console.warn('[Project Horizon] Saved Gemini key could not be unlocked. Re-enter it in Preferences.'); }
}

export function getGeminiStatus() {
  return { configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') };
}

export function saveGeminiKey(value: string) {
  const key = value.trim();
  if (!key) {
    fs.rmSync(keyPath(), { force: true });
    delete process.env.GEMINI_API_KEY;
    return getGeminiStatus();
  }
  if (!/^AIza[\w-]{20,}$/.test(key)) throw new Error('Enter a valid Gemini API key.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable.');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(keyPath(), safeStorage.encryptString(key), { mode: 0o600 });
  process.env.GEMINI_API_KEY = key;
  return getGeminiStatus();
}
