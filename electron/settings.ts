import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

const keyPath = () => path.join(app.getPath('userData'), 'gemini-api-key.enc');
let ownerKey: string | undefined;

export function loadGeminiKey(): void {
  // Explicit private friends builds may include the owner's shared access.
  // Standard builds never contain this file; no key is exposed through IPC.
  if (app.isPackaged) {
    try {
      const access = JSON.parse(fs.readFileSync(path.join(process.resourcesPath, 'app-access', 'owner-gemini.json'), 'utf8'));
      if (/^(?:AIza[\w-]{20,}|AQ\.[\w.-]{20,})$/.test(access.apiKey)) {
        ownerKey = access.apiKey;
        process.env.GEMINI_API_KEY = ownerKey;
        return;
      }
    } catch {}
  }
  if (!fs.existsSync(keyPath()) || !safeStorage.isEncryptionAvailable()) return;
  try { process.env.GEMINI_API_KEY = safeStorage.decryptString(fs.readFileSync(keyPath())); }
  catch { console.warn('[Project Horizon] Saved Gemini key could not be unlocked. Re-enter it in Preferences.'); }
}

export function getGeminiStatus() {
  return { configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'),
    ownerProvided: Boolean(ownerKey && process.env.GEMINI_API_KEY === ownerKey) };
}

export function saveGeminiKey(value: string) {
  const key = value.trim();
  if (!key) {
    fs.rmSync(keyPath(), { force: true });
    if (ownerKey) process.env.GEMINI_API_KEY = ownerKey;
    else delete process.env.GEMINI_API_KEY;
    return getGeminiStatus();
  }
  if (!/^(?:AIza[\w-]{20,}|AQ\.[\w.-]{20,})$/.test(key)) throw new Error('Enter a valid Gemini API key.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable.');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(keyPath(), safeStorage.encryptString(key), { mode: 0o600 });
  process.env.GEMINI_API_KEY = key;
  return getGeminiStatus();
}
