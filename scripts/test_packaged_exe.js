const { spawn } = require('child_process');
const path = require('path');

const exePath = path.resolve(__dirname, '../release/win-unpacked/Project Horizon.exe');
console.log(`[Packaged Test] Testing executable: ${exePath}`);

const proc = spawn(exePath, [], {
  detached: true,
  stdio: 'ignore'
});

console.log(`[Packaged Test] Spawned PID: ${proc.pid}`);

setTimeout(() => {
  try {
    process.kill(proc.pid);
    console.log(`✓ Process ${proc.pid} was running healthy and terminated successfully.`);
    console.log('✓ Packaged Windows Executable validated!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to kill process or process crashed early:', err);
    process.exit(1);
  }
}, 3000);
