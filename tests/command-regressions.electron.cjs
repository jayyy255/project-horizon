// Use Electron's production SQLite runtime; native app launches are stubbed.
const { app } = require('electron');
const path = require('node:path');
app.setPath('userData', path.resolve('scratch/command-regression-electron-profile'));
app.whenReady().then(() => require('./command-regressions.cjs'));
