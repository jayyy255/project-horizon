import { ServiceError } from './errors.js';
export const MAX_BODY_BYTES = 20 * 1024 * 1024;
export const MAX_MODEL_BYTES = 19 * 1024 * 1024;
const invalid = () => { throw new ServiceError(400, 'invalid_request', 'Use a question with bounded image or extracted document context.'); };
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid();
}
function text(value, max) { if (typeof value !== 'string' || value.length > max) invalid(); return value; }
export function validateQuestion(body) {
  object(body, ['prompt', 'history', 'parts']);
  const prompt = text(body.prompt, 12000).trim();
  if (!prompt) invalid();
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 10) invalid();
  const checkedHistory = history.map(item => {
    object(item, ['role', 'text']);
    if (!['user', 'assistant'].includes(item.role)) invalid();
    return { role: item.role, text: text(item.text, 4000) };
  });
  const parts = body.parts ?? [];
  if (!Array.isArray(parts) || parts.length > 16) invalid();
  let images = 0, documents = 0;
  const checkedParts = parts.map(part => {
    object(part, ['text', 'inlineData']);
    if (Object.keys(part).length !== 1) invalid();
    if ('text' in part) {
      if (++documents > 4) invalid();
      return { text: text(part.text, 60000) };
    }
    if (++images > 12) invalid();
    object(part.inlineData, ['mimeType', 'data']);
    const { mimeType, data } = part.inlineData;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) || typeof data !== 'string' || !data || data.length > MAX_MODEL_BYTES || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) invalid();
    const bytes = Buffer.from(data, 'base64');
    if (bytes.toString('base64') !== data) invalid();
    const valid = mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!valid) invalid();
    return { inlineData: { mimeType, data } };
  });
  return { prompt, history: checkedHistory, parts: checkedParts };
}
