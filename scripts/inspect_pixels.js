const fs = require('fs');
const buf = fs.readFileSync('scratch/real_desktop_test.bmp');
console.log('BMP header (first 54 bytes):', buf.subarray(0, 54));
const raw = buf.subarray(54);
let nonZeroCount = 0;
let samplePixels = [];
for (let i = 0; i < raw.length; i += 4) {
  const b = raw[i];
  const g = raw[i+1];
  const r = raw[i+2];
  const a = raw[i+3];
  if (b !== 0 || g !== 0 || r !== 0) {
    nonZeroCount++;
    if (samplePixels.length < 5) {
      samplePixels.push({ idx: i / 4, r, g, b, a });
    }
  }
}
console.log(`Total pixels: ${raw.length / 4}, Non-zero RGB pixels: ${nonZeroCount}`);
console.log('Sample non-zero pixels:', samplePixels);
