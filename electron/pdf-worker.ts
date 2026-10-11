import { parentPort, workerData } from 'worker_threads';
import { pathToFileURL } from 'url';
import path from 'path';

async function inspect() {
  let task: any;
  try {
    const bytes = new Uint8Array(workerData.bytes);
    const raw = Buffer.from(bytes).toString('latin1').replace(/#([a-f\d]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (/\/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|OpenAction|AA|SubmitForm|ImportData)\b/.test(raw)) throw new Error('Attachment blocked: PDF contains active actions, scripts or embedded files. Export a plain PDF first.');
    // Fixed library URL only; PDF data is never evaluated as JavaScript.
    const moduleUrl = pathToFileURL(path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'legacy/build/pdf.mjs')).href;
    const pdfjs = await (new Function('url', 'return import(url)'))(moduleUrl);
    task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: true,
      standardFontDataUrl: path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replace(/\\/g, '/') + '/' });
    const document = await task.promise;
    if (document.numPages > 100) throw new Error('Attachment blocked: PDFs are limited to 100 pages. Attach a smaller section.');
    if (await document.getJSActions() || await document.getAttachments()) throw new Error('Attachment blocked: PDF contains scripts or embedded files.');
    let text = '';
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      if (await page.getJSActions()) throw new Error('Attachment blocked: PDF page contains scripts.');
      const annotations = await page.getAnnotations();
      if (annotations.some((annotation: any) => annotation.actions || annotation.file || /^(?:file|javascript):/i.test(annotation.unsafeUrl || annotation.url || ''))) throw new Error('Attachment blocked: PDF annotations contain active content.');
      const content = await page.getTextContent();
      text += `\n[Page ${index}]\n` + content.items.map((item: any) => item.str + (item.hasEOL ? '\n' : ' ')).join('');
      if (text.length > 1_000_000) throw new Error('Attachment blocked: PDF text exceeds its processing limit.');
      page.cleanup();
    }
    const images: Array<{ number: number; data: string }> = [];
    if (workerData.pages) {
      const selected: number[] = workerData.pages.length ? workerData.pages : Array.from({ length: Math.min(3, document.numPages) }, (_, index) => index + 1);
      const { createCanvas } = require('@napi-rs/canvas');
      for (const number of selected) {
        if (!Number.isInteger(number) || number < 1 || number > document.numPages) throw new Error('Attachment blocked: the requested PDF page does not exist.');
        const page = await document.getPage(number), base = page.getViewport({ scale: 1 });
        if (!(base.width > 0 && base.height > 0 && Number.isFinite(base.width + base.height))) throw new Error('Attachment blocked: invalid PDF page dimensions.');
        const viewport = page.getViewport({ scale: 1600 / Math.max(base.width, base.height) });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        images.push({ number, data: canvas.encodeSync('jpeg', 90).toString('base64') });
        page.cleanup();
      }
    }
    parentPort!.postMessage({ text: text.replace(/\[Page \d+\]/g, '').trim() ? text : '', images, totalPages: document.numPages });
  } catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : 'PDF inspection failed.' }); }
  finally { await task?.destroy(); }
}
void inspect();
