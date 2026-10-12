import { app, safeStorage, shell, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { CloudAccount, CloudSession } from './cloudAccount';
let account: CloudAccount | undefined;
export const useHostedService = () => process.env.HORIZON_GEMINI_DIRECT !== '1';
export function cloudAccount(): CloudAccount {
  if (!account) {
    const file = path.join(app.getPath('userData'), 'horizon-account.enc');
    account = new CloudAccount({
      read: () => {
        if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(file)) return undefined;
        return JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as CloudSession;
      },
      write: session => {
        if (!session) { fs.rmSync(file, { force: true }); return; }
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable.');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temporary = file + '.tmp';
        fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(session)), { mode: 0o600 });
        fs.renameSync(temporary, file);
      },
      openBrowser: url => shell.openExternal(url),
      onChange: status => { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('horizon:account-status', status); },
    });
  }
  return account;
}
