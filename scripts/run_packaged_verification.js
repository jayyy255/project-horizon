const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const exePath = path.resolve(__dirname, '../release/win-unpacked/Project Horizon.exe');
const logFile = path.join(os.tmpdir(), 'horizon_packaged_verify.log');

// Clear existing log file
try { fs.unlinkSync(logFile); } catch {}

console.log('================================================================');
console.log('🧪 LAUNCHING PACKAGED EXECUTABLE FOR FULL VERIFICATION:');
console.log(`Executable: ${exePath}`);
console.log(`Monitoring Log: ${logFile}`);
console.log('================================================================\n');

if (!fs.existsSync(exePath)) {
  console.error(`❌ Packaged executable not found at: ${exePath}`);
  process.exit(1);
}

const child = spawn(exePath, ['--verify-packaged'], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
    VERIFY_PACKAGED: '1',
    GEMINI_API_KEY: 'AQ.Ab8RN6JxggWgpyw3FhkE5-wFffCLTsXZoItHPRmFWB4F24xvyA',
  },
  stdio: 'ignore',
});

let lastOffset = 0;
const pollInterval = setInterval(() => {
  if (fs.existsSync(logFile)) {
    try {
      const stats = fs.statSync(logFile);
      if (stats.size > lastOffset) {
        const stream = fs.createReadStream(logFile, { start: lastOffset, end: stats.size });
        stream.on('data', chunk => {
          process.stdout.write(chunk.toString());
        });
        lastOffset = stats.size;
      }
    } catch {}
  }
}, 300);

child.on('error', (err) => {
  clearInterval(pollInterval);
  console.error('Failed to spawn packaged executable:', err);
  process.exit(1);
});

child.on('close', (code) => {
  clearInterval(pollInterval);

  setTimeout(() => {
    if (fs.existsSync(logFile)) {
      try {
        const remaining = fs.readFileSync(logFile, 'utf8').slice(lastOffset);
        if (remaining) process.stdout.write(remaining);
      } catch {}
    }

    console.log(`\nPackaged executable exited with code: ${code}`);

    const reportCandidates = [
      path.resolve(__dirname, '../packaged_verification_report.json'),
      path.join(os.tmpdir(), 'packaged_verification_report.json'),
    ];
    for (const reportPath of reportCandidates) {
      if (fs.existsSync(reportPath)) {
        try {
          const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
          console.log('\n================================================================');
          console.log('📊 VERIFIED PACKAGED PRODUCTION REPORT:');
          console.log('================================================================');
          console.log(JSON.stringify(report, null, 2));
          break;
        } catch (e) {
          console.warn('Could not parse report json:', e);
        }
      }
    }

    process.exit(code || 0);
  }, 500);
});
