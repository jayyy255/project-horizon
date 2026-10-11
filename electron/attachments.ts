import { app, nativeImage } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID, createHash } from 'crypto';
import { execFile } from 'child_process';
import { Worker } from 'worker_threads';
import { LatencyTrace } from './latency';
import type { ContextAttachment } from '../shared/types';

const TEXT_EXT = new Set(['.txt', '.md', '.csv', '.json', '.log', '.ts', '.tsx', '.js', '.jsx', '.py', '.css', '.html', '.xml', '.yaml', '.yml', '.toml', '.ini', '.sql', '.c', '.cpp', '.h', '.java', '.rs', '.go']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_BYTES = 20 * 1024 * 1024;
export interface DocumentContext { id: string; type: 'pdf' | 'file'; text: string; pdfBase64?: string; }
const stored = new Map<string, DocumentContext>();
function remember(context: DocumentContext) {
  stored.set(context.id, context);
  let bytes = [...stored.values()].reduce((sum, doc) => sum + doc.text.length * 2 + (doc.pdfBase64?.length || 0) * 2, 0);
  while (bytes > 64 * 1024 * 1024 || stored.size > 30) {
    const oldest = stored.keys().next().value!; const doc = stored.get(oldest)!;
    bytes -= doc.text.length * 2 + (doc.pdfBase64?.length || 0) * 2; stored.delete(oldest);
  }
}
const directory = () => path.join(app.getPath('userData'), 'attachments');

export function screenInjection(text: string): void {
  const normalized = text.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '').replace(/\s+/g, ' ');
  if (/ignore\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|rules|prompts)|(?:reveal|print|expose|leak)\s+(?:the\s+|your\s+)?(?:system prompt|api key|secret)|(?:system|developer)\s*:\s*(?:you are|ignore)|<\|(?:im_start|system|developer)|send\s+(?:all\s+)?(?:secrets|credentials|api keys)\s+to/i.test(normalized)) {
    throw new Error('Attachment blocked: suspected prompt-injection instructions were found.');
  }
}

export async function scanWithDefender(snapshot: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Attachment blocked: Microsoft Defender scanning requires Windows.');
  await new Promise<void>((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$s = Get-MpComputerStatus -ErrorAction Stop; if (-not $s.AMServiceEnabled -or -not $s.AntivirusEnabled -or -not $s.AntivirusSignatureVersion -or $s.AntivirusSignatureAge -gt 14) { exit 2 }'], { windowsHide: true, timeout: 15000, maxBuffer: 16384 }, error => error ? reject(new Error('Attachment blocked: Defender must be enabled with current virus definitions. Open Windows Security.')) : resolve());
  });
  const platformDir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows Defender', 'Platform');
  const versions = await fs.readdir(platformDir).catch(() => [] as string[]);
  const candidates = versions.sort().reverse().map(version => path.join(platformDir, version, 'MpCmdRun.exe'));
  candidates.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe'));
  let scanner: string | undefined;
  for (const candidate of candidates) if (await fs.stat(candidate).then(stat => stat.isFile()).catch(() => false)) { scanner = candidate; break; }
  if (!scanner) throw new Error('Attachment blocked: Microsoft Defender is unavailable. Enable it before attaching files.');
  await new Promise<void>((resolve, reject) => {
    execFile(scanner!, ['-Scan', '-ScanType', '3', '-File', snapshot, '-DisableRemediation'], { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 }, error => {
      if (error) reject(new Error('Attachment blocked: Defender detected a threat or could not complete the scan. Check Windows Security.'));
      else resolve();
    });
  });
}

async function runPdfWorker(bytes: Buffer, pages?: number[]): Promise<{ text: string; images?: Array<{ number: number; data: string }>; totalPages: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdf-worker.js'), { workerData: { bytes, pages }, resourceLimits: { maxOldGenerationSizeMb: 192 } });
    let settled = false;
    const finish = (error?: Error, result?: any) => { if (settled) return; settled = true; clearTimeout(timer); void worker.terminate(); error ? reject(error) : resolve(result); };
    const timer = setTimeout(() => finish(new Error('Attachment blocked: PDF inspection exceeded its processing limit.')), 30000);
    worker.once('message', result => finish(result.error ? new Error(result.error) : undefined, result));
    worker.once('error', () => finish(new Error('Attachment blocked: PDF inspection failed.')));
    worker.once('exit', code => { if (!settled) finish(new Error(`Attachment blocked: PDF inspection stopped (${code}).`)); });
  });
}
export async function inspectPdf(bytes: Buffer): Promise<string> { return (await runPdfWorker(bytes)).text; }
export async function renderPdfContext(document: DocumentContext, question: string) {
  if (!document.pdfBase64) throw new Error('Stored PDF is unavailable. Reattach it.');
  const explicit = [...question.matchAll(/\bpage\s+(\d+)\b/gi)].map(match => Number(match[1]));
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])];
  const sections = [...document.text.matchAll(/\[Page (\d+)\]([\s\S]*?)(?=\[Page \d+\]|$)/g)].map(match => ({ number: Number(match[1]), score: terms.reduce((n, term) => n + Math.min(10, match[2].toLowerCase().split(term).length - 1), 0) }));
  const pages = [...new Set(explicit.length ? explicit : sections.sort((a,b) => b.score - a.score).slice(0,3).map(page => page.number))];
  if (pages.length > 3) throw new Error('Attachment blocked: choose at most three PDF pages per visual question.');
  return runPdfWorker(Buffer.from(document.pdfBase64, 'base64'), pages);
}

export async function ingestAttachment(file: string, scan: typeof scanWithDefender = scanWithDefender): Promise<ContextAttachment> {
  const extension = path.extname(file).toLowerCase();
  const type = extension === '.pdf' ? 'pdf' : IMAGE_EXT.has(extension) ? 'image' : 'file';
  const trace = new LatencyTrace(type);
  let snapshot: string | undefined;
  try {
    await trace.measure('file_validation', async () => {
      if (!(extension === '.pdf' || TEXT_EXT.has(extension) || IMAGE_EXT.has(extension))) throw new Error('Unsupported attachment. Choose a PDF, text/code file, PNG, JPEG or WebP. Executables, archives and Office macros are blocked.');
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES || stat.size === 0) throw new Error('Choose a regular, non-empty file smaller than 20 MB.');
    });
    const bytes = await trace.measure('read_and_snapshot', async () => {
      const handle = await fs.open(file, 'r');
      try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('File changed or exceeds 20 MB.'); const value = await handle.readFile(); if (value.length > MAX_BYTES) throw new Error('File exceeds 20 MB.'); return value; }
      finally { await handle.close(); }
    });
    const dir = directory(); await fs.mkdir(dir, { recursive: true });
    snapshot = path.join(dir, randomUUID() + extension);
    await fs.writeFile(snapshot, bytes, { flag: 'wx', mode: 0o600 });
    await trace.measure('malware_scan', () => scan(snapshot!));
    // Parse the exact bytes scanned, never reread the user's mutable original.
    const scanned = await fs.readFile(snapshot);
    if (createHash('sha256').update(scanned).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Attachment blocked: its contents changed during scanning.');
    const id = randomUUID();
    let text = '', image: string | undefined;
    if (type === 'pdf') {
      if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Attachment blocked: PDF file signature is invalid.');
      text = await trace.measure('pdf_inspection_and_text_extraction', () => inspectPdf(bytes));
    } else if (type === 'image') {
      image = await trace.measure('image_validation', () => {
        const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp = bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
        if (!(extension === '.png' && png || ['.jpg','.jpeg'].includes(extension) && jpeg || extension === '.webp' && webp)) throw new Error('Attachment blocked: image type does not match its file signature.');
        const bitmap = nativeImage.createFromBuffer(bytes); const size = bitmap.getSize();
        if (bitmap.isEmpty() || size.width * size.height > 32_000_000) throw new Error('Attachment blocked: invalid image or image exceeds 32 megapixels.');
        return bitmap.toDataURL();
      });
    } else {
      text = await trace.measure('text_extraction', () => {
        if (bytes.includes(0)) throw new Error('Attachment blocked: binary files cannot be attached as text.');
        try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('Choose a UTF-8 text file.'); }
      });
    }
    if (text.length > 1_000_000) throw new Error('Attachment blocked: extracted text exceeds the 1-million-character processing limit.');
    await trace.measure('prompt_injection_screen', () => screenInjection(text));
    if (type !== 'image') {
      const context: DocumentContext = { id, type, text, ...(type === 'pdf' ? { pdfBase64: bytes.toString('base64') } : {}) };
      remember(context);
      await fs.writeFile(path.join(dir, id + '.json'), JSON.stringify(context), { mode: 0o600 });
    }
    trace.save();
    return { id, label: path.basename(file), type, timestamp: Date.now(), ...(image ? { croppedDataUrl: image } : { documentId: id }), traceId: trace.id, safety: 'Defender scan completed; treated as untrusted context' };
  } catch (error) { trace.save(); throw error; }
  finally { if (snapshot) await fs.unlink(snapshot).catch(() => {}); }
}

export async function resolveDocuments(attachments: ContextAttachment[]): Promise<DocumentContext[]> {
  const documents: DocumentContext[] = [];
  for (const attachment of attachments) {
    if (!['pdf','file'].includes(attachment.type)) continue;
    const id = attachment.documentId;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('Reattach the document before asking about it.');
    let context = stored.get(id);
    if (!context) {
      const file = path.join(directory(), id + '.json');
      if ((await fs.stat(file)).size > 30 * 1024 * 1024) throw new Error('Stored attachment exceeds its processing limit.');
      context = JSON.parse(await fs.readFile(file, 'utf8'));
    }
    if (!context || context.id !== id || !['pdf','file'].includes(context.type) || typeof context.text !== 'string' || context.text.length > 1_000_000) throw new Error('Stored document is invalid. Reattach it.');
    if (context.pdfBase64 && (typeof context.pdfBase64 !== 'string' || context.pdfBase64.length > Math.ceil(MAX_BYTES / 3) * 4 || !Buffer.from(context.pdfBase64.slice(0, 12), 'base64').subarray(0,5).equals(Buffer.from('%PDF-')))) throw new Error('Stored PDF is invalid. Reattach it.');
    screenInjection(context.text);
    documents.push(context);
  }
  return documents;
}

export function relevantText(text: string, question: string): string {
  if (text.length <= 60000) return text;
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])];
  const chunks = text.match(/[\s\S]{1,3500}/g) || [];
  const ranked = chunks.map((content, index) => ({ content, index, score: terms.reduce((n, term) => n + Math.min(10, content.toLowerCase().split(term).length - 1), 0) }));
  const selected = [...new Set([0, ...ranked.sort((a,b) => b.score - a.score).slice(0, 12).map(chunk => chunk.index)])].sort((a,b) => a-b);
  return '[Relevant excerpts from a larger document; omitted sections are not visible in this request.]\n' + selected.map(index => `[Section ${index + 1}]\n${chunks[index]}`).join('\n');
}
