const { app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(() => {
  const bmpPath = path.resolve('scratch/real_desktop_test.bmp');
  const buf = fs.readFileSync(bmpPath);
  // In BMP, header is 54 bytes. The rest is 1920*1080*4 raw BGRA bytes!
  const rawBg = buf.subarray(54);

  const t0 = performance.now();
  const img = nativeImage.createFromBitmap(rawBg, { width: 1920, height: 1080 });
  const t1 = performance.now();
  const pngBuf = img.toPNG();
  const t2 = performance.now();
  const dataUrl = img.toDataURL();
  const t3 = performance.now();

  console.log('--- NativeImage createFromBitmap Timings ---');
  console.log(`createFromBitmap: ${(t1 - t0).toFixed(2)} ms`);
  console.log(`toPNG: ${(t2 - t1).toFixed(2)} ms (png size: ${Math.round(pngBuf.length / 1024)} KB)`);
  console.log(`toDataURL: ${(t3 - t2).toFixed(2)} ms`);
  console.log(`Total: ${(t3 - t0).toFixed(2)} ms`);
  console.log(`Image Size: ${JSON.stringify(img.getSize())}`);
  console.log(`DataURL Length: ${Math.round(dataUrl.length / 1024)} KB`);

  // Verify it can be written to PNG and opened
  fs.writeFileSync('scratch/real_desktop_test.png', pngBuf);
  console.log('Successfully wrote scratch/real_desktop_test.png');

  app.quit();
});
