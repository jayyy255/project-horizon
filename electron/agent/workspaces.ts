import fs from 'fs';
import path from 'path';
import os from 'os';

/** Discover development locations, without crawling the user's whole drive. */
export function discoverWorkspaceRoots(cwd = process.cwd(), home = os.homedir()): string[] {
  const roots = [path.resolve(cwd)];
  let current = path.resolve(cwd);
  for (let level = 0; level < 5; level++) {
    if (/^(projects|workspace|workspaces|repos|repositories)$/i.test(path.basename(current))) {
      roots.push(current);
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const relative of ['projects', 'code/projects', 'workspace', 'repos', 'Documents/projects']) {
    const candidate = path.join(home, relative);
    try { if (fs.statSync(candidate).isDirectory()) roots.push(candidate); } catch {}
  }
  if (process.platform === 'win32') {
    // Installed apps no longer start inside a checkout. Check conventional
    // development locations without enumerating or crawling drive contents.
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      for (const relative of ['code/projects', 'projects', 'repos']) {
        const candidate = path.join(`${letter}:\\`, relative);
        try { if (fs.statSync(candidate).isDirectory()) roots.push(candidate); } catch {}
      }
    }
  }
  return [...new Map(roots.map(root => [root.toLowerCase(), root])).values()];
}

export function parseProjectOpen(prompt: string): { query: string } | null {
  if (/[\n;&|]/.test(prompt)) return null;
  const match = prompt.trim().match(/^(?:please\s+)?(?:open|launch|load)\s+(.+?)\s+(?:in|with|using)\s+(?:vs\s*code|visual\s+studio\s+code)\s*[.!]?$/i);
  if (!match) return null;
  const query = match[1].replace(/^(?:my|the|our)\s+/i, '').replace(/\s+(?:project|workspace|folder)$/i, '').replace(/^["']|["']$/g, '').trim();
  if (!query || /\b(and|then|after|also)\b/i.test(query)) return null;
  return { query };
}
