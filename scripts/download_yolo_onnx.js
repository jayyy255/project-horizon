const fs = require('fs');
const path = require('path');
const https = require('https');

const targetDir = path.resolve(__dirname, '../backend/perception-service/models');
if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
const targetFile = path.join(targetDir, 'yolov8n.onnx');

const url = 'https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n.onnx';

console.log('Downloading YOLOv8 ONNX model from:', url);

function download(url, dest, cb) {
  https.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      console.log('Redirecting to:', res.headers.location);
      return download(res.headers.location, dest, cb);
    }
    if (res.statusCode !== 200) {
      return cb(new Error('Failed with status: ' + res.statusCode));
    }
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => file.close(cb));
  }).on('error', cb);
}

download(url, targetFile, (err) => {
  if (err) {
    console.error('Download error:', err);
    process.exit(1);
  }
  const stat = fs.statSync(targetFile);
  console.log(`✓ Successfully downloaded yolov8n.onnx (${(stat.size / (1024 * 1024)).toFixed(2)} MB) to: ${targetFile}`);
  process.exit(0);
});
