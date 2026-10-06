const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFileSync } = require('node:child_process');
const VERSION = 'v0.35.1';
// Official GitHub release asset hashes, pinned so runtime builds are reproducible.
const assets = {
  darwin: ['ollama-darwin.tgz', '3137dbf28948ee844e0fb3e584d9b5de6879d73d9f0cb7eff3ad64930601d307'],
  'win32-x64': ['ollama-windows-amd64.zip', 'dc50b9ca7f9023c86525012632cd1615b093d0407987444a7f62ecab617e8e93'],
  'win32-arm64': ['ollama-windows-arm64.zip', '1aced40f0654eae8ef1ba07fa101be4b48225308288b0f54c5681ccf1e4199db'],
  'linux-x64': ['ollama-linux-amd64.tar.zst', '9fcd79ac4575b2bd31b992eee18b1000c8ad126b451627c8f8cd091714cfbb10'],
  'linux-arm64': ['ollama-linux-arm64.tar.zst', 'b1b1c85d25136b256d3740f6ecd2f7c0105e8ca71642fd6ff2fc199f3cefd69d']
};
async function main() {
  const asset = assets[process.platform === 'darwin' ? 'darwin' : `${process.platform}-${process.arch}`];
  if (!asset) throw new Error('No bundled runtime is configured for this platform.');
  const vendor = path.resolve(__dirname, '../vendor');
  fs.mkdirSync(vendor, { recursive: true });
  const target = path.join(vendor, 'ollama');
  const manifest = path.join(target, 'deed-runtime.json');
  if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).sha256 === asset[1]) { console.log('Verified runtime already prepared.'); return; }
  if (fs.existsSync(target)) throw new Error('A different runtime already exists. Move vendor/ollama aside before preparing another version.');
  const archive = path.join(vendor, asset[0]);
  if (!fs.existsSync(archive)) {
    console.log(`Downloading official Ollama ${VERSION}: ${asset[0]}`);
    const response = await fetch(`https://github.com/ollama/ollama/releases/download/${VERSION}/${asset[0]}`, { signal: AbortSignal.timeout(600000) });
    if (!response.ok || !response.body) throw new Error(`Runtime download failed (${response.status}).`);
    const temporary = `${archive}.partial`;
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
    fs.renameSync(temporary, archive);
  }
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(archive)) digest.update(chunk);
  if (digest.digest('hex') !== asset[1]) throw new Error('Runtime checksum mismatch. Move the archive aside and retry.');
  const staging = fs.mkdtempSync(path.join(vendor, '.extract-'));
  // Use the OS archive tool (macOS/Windows bsdtar or Linux tar with zstd support).
  const names = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim().split('\n');
  if (names.some(name => name.startsWith('/') || /^[a-z]:/i.test(name) || name.replace(/\\/g, '/').split('/').includes('..'))) throw new Error('Unsafe runtime archive paths.');
  execFileSync('tar', ['-xf', archive, '-C', staging]);
  const binary = path.join(staging, process.platform === 'win32' ? 'ollama.exe' : process.platform === 'darwin' ? 'ollama' : 'bin/ollama');
  if (!fs.existsSync(binary)) throw new Error('Runtime archive did not contain the expected executable.');
  fs.writeFileSync(path.join(staging, 'deed-runtime.json'), JSON.stringify({ version: VERSION, asset: asset[0], sha256: asset[1], platform: process.platform, arch: process.arch }, null, 2));
  fs.renameSync(staging, target);
  console.log(`Runtime verified and ready in ${target}.`);
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
