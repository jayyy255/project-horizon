// Publish the tested Windows installer using the existing GitHub Git credential.
// Credentials stay in memory and are never written to logs or release files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

async function main() {
  const root = path.resolve(__dirname, '..');
  process.chdir(root);
  const version = require('../package.json').version;
  const friends = process.argv.includes('--friends');
  const tag = `v${version}`;
  const repository = 'jayyy255/project-horizon';
  const installerName = `Project-Horizon-${friends ? 'Friends-' : ''}Setup-${version}-x64.exe`;
  const installer = path.join(root, 'release', installerName);
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
  const commit = git(['rev-parse', 'HEAD']);
  if (git(['status', '--porcelain'])) throw new Error('Commit the source before publishing.');
  const remoteHead = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
  if (remoteHead !== commit) throw new Error('Push this commit to origin/main before publishing.');
  const report = JSON.parse(fs.readFileSync(path.join(root, 'release', friends ? 'package-verification-friends.json' : 'package-verification.json'), 'utf8'));
  if (report.version !== version || report.passed !== true || report.checks?.length < (friends ? 16 : 12)
    || report.checks.some((check) => check.passed !== true)) {
    throw new Error('The packaged smoke checks must pass before publishing.');
  }
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  const checksumFile = path.join(root, 'release', 'SHA256SUMS.txt');
  fs.writeFileSync(checksumFile, `${checksum}  ${installerName}\n`);

  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    const credential = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    });
    token = credential.split(/\r?\n/).find((line) => line.startsWith('password='))?.slice(9);
  }
  if (!token) throw new Error('No existing GitHub credential is available.');
  const headers = {
    Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Project-Horizon-release',
  };
  const api = async (endpoint, options = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, {
      ...options, headers: { ...headers, 'Content-Type': 'application/json', ...options.headers },
    });
    if (response.status === 404 && options.allowMissing) return null;
    if (!response.ok) throw new Error(`GitHub API ${response.status} for ${endpoint}`);
    if (response.status === 204) return null;
    return response.json();
  };
  const repositoryInfo = await api('');
  if (friends && !repositoryInfo.private) throw new Error('The friends installer may only be published to the private repository.');
  const notes = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/^# Changes\s*/, '').split(/\n## /)[0]
    + '\n\nDownload the x64 setup executable below. Run the setup wizard and approve first-run consent. '
    + (friends ? 'This temporary friends build includes owner-provided Gemini access; users do not enter an API key. Keep this installer private. '
      : 'Enter your own Gemini API key in Preferences → Inference Engine. ')
    + 'Python and the perception models are included; no separate Python installation is needed.\n\n'
    + `SHA-256: \`${checksum}\`\n`;
  let release = await api(`/releases/tags/${tag}`, { allowMissing: true });
  if (!release) {
    release = await api('/releases', { method: 'POST', body: JSON.stringify({
      tag_name: tag, target_commitish: commit, name: `Project Horizon ${version}`,
      body: notes, draft: true, prerelease: false,
    }) });
  }
  if (release.target_commitish !== commit && release.draft) {
    const expectedNames = [installerName, 'SHA256SUMS.txt'];
    if (release.assets.some(asset => !expectedNames.includes(asset.name))) throw new Error('The draft contains unrelated assets.');
    // Replace only this unpublished installer draft after a local rebuild.
    for (const asset of release.assets) await api(`/releases/assets/${asset.id}`, { method: 'DELETE' });
    release = await api(`/releases/${release.id}`, { method: 'PATCH', body: JSON.stringify({ target_commitish: commit, body: notes }) });
  }
  if (release.target_commitish !== commit) throw new Error('The published release points to another source commit.');
  for (const file of [installer, checksumFile]) {
    const name = path.basename(file);
    const size = fs.statSync(file).size;
    const existing = release.assets.find((asset) => asset.name === name);
    if (existing) {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (existing.size !== size || existing.state !== 'uploaded' || existing.digest !== `sha256:${digest}`) throw new Error(`Existing asset differs: ${name}`);
      console.log(`Already uploaded: ${name}`);
      continue;
    }
    console.log(`Uploading ${name} (${size} bytes)...`);
    const response = await fetch(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
      body: fs.createReadStream(file), duplex: 'half',
    });
    if (!response.ok) throw new Error(`GitHub upload ${response.status} for ${name}`);
    const asset = await response.json();
    if (asset.size !== size || asset.state !== 'uploaded') throw new Error(`Incomplete upload: ${name}`);
    console.log(`Uploaded ${name}`);
  }
  if (release.draft) release = await api(`/releases/${release.id}`, {
    method: 'PATCH', body: JSON.stringify({ draft: false, body: notes }),
  });
  release = await api(`/releases/${release.id}`);
  const asset = release.assets.find((entry) => entry.name === installerName);
  if (!asset || asset.size !== fs.statSync(installer).size || asset.state !== 'uploaded') {
    throw new Error('Published release is missing the complete installer.');
  }
  const result = { version, commit, url: release.html_url, installerUrl: asset.browser_download_url,
    size: asset.size, sha256: checksum, draft: release.draft };
  fs.writeFileSync(path.join(root, 'release', 'published-release.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
