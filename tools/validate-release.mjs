import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const downloads = join(root, 'public', 'downloads');
const release = readJson(join(root, 'release.json'));
const packageJson = readJson(join(root, 'package.json'));
const packageLock = readJson(join(root, 'package-lock.json'));
const update = readJson(join(downloads, 'update.json'));
// Existing code-10 terminals only accept updates signed by this original key.
const trustedSigningCertificate = '42DE27571244F0A23E533BF1C97D5D8587F4F12C3C34EA3209EDFBC67B8B3395';

assert(Number.isInteger(release.versionCode) && release.versionCode > 0, 'release.json: versionCode inválido.');
assert(packageJson.version === release.versionName, 'package.json no coincide con release.json.');
assert(packageLock.version === release.versionName && packageLock.packages?.['']?.version === release.versionName,
  'package-lock.json no coincide con release.json.');
assert(update.schemaVersion === 1 && update.packageName === 'com.panitas.pos', 'update.json: identidad inválida.');
assert(update.versionCode === release.versionCode && update.versionName === release.versionName,
  'update.json no coincide con release.json.');
assert(update.channel === release.channel, 'update.json: canal de publicación desalineado.');
assert(Number.isInteger(release.minimumSupportedVersionCode) && release.minimumSupportedVersionCode > 0
  && release.minimumSupportedVersionCode <= release.versionCode, 'release.json: versión mínima inválida.');
assert(update.minimumSupportedVersionCode === release.minimumSupportedVersionCode,
  'update.json: minimumSupportedVersionCode desalineado.');
assert(update.mandatory === release.mandatory, 'update.json: mandatory desalineado.');
assert(Array.isArray(update.releaseNotes) && JSON.stringify(update.releaseNotes) === JSON.stringify(release.releaseNotes),
  'update.json: notas de versión desalineadas.');
assert(!Number.isNaN(Date.parse(update.publishedAt)), 'update.json: publishedAt inválido.');

const url = new URL(update.artifact?.url || '');
assert(url.protocol === 'https:' && url.hostname === 'los-panitas-by-nechy.web.app'
  && url.port === '' && url.search === '' && url.hash === '' && url.pathname.startsWith('/downloads/'),
  'update.json: URL de artefacto no autorizada.');
assert(update.artifact.filename === basename(url.pathname), 'update.json: filename y URL no coinciden.');
const artifactPath = join(downloads, update.artifact.filename);
assert(existsSync(artifactPath), `Falta ${update.artifact.filename}.`);

const artifact = readFileSync(artifactPath);
assert(artifact.length === update.artifact.size, 'El tamaño del ZIP no coincide con update.json.');
assert(sha256(artifact) === update.artifact.sha256, 'El SHA-256 del ZIP no coincide con update.json.');
assert(update.apk.entry === 'LosPanitas-Elo-POS.apk', 'La entrada APK no tiene el nombre permitido.');
assert(isSha256(update.apk.sha256) && isSha256(update.apk.signingCertificateSha256),
  'update.json: hashes APK/certificado inválidos.');
assert(update.apk.signingCertificateSha256.toUpperCase() === trustedSigningCertificate,
  'La llave de firma cambió; los terminales existentes rechazarían esta actualización.');

const entries = readZipEntries(artifact);
assert(entries.has(update.apk.entry), 'El ZIP no contiene LosPanitas-Elo-POS.apk.');
const apk = entries.get(update.apk.entry);
assert(apk.length === update.apk.size, 'El tamaño del APK no coincide con update.json.');
assert(sha256(apk) === update.apk.sha256, 'El SHA-256 del APK no coincide con update.json.');

const friendly = readFileSync(join(downloads, 'LosPanitas-Elo-POS-APK.zip'));
assert(sha256(friendly) === update.artifact.sha256, 'El ZIP amigable no coincide con el artefacto versionado.');
validateChecksums(apk);
await validateAndroidArtifact(apk);

console.log(`Release validado: ${release.versionName} (código ${release.versionCode}), ZIP y APK íntegros y firmados.`);

function validateChecksums(apkBytes) {
  const rows = readFileSync(join(downloads, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/);
  const declared = new Map(rows.map((line) => {
    const match = line.match(/^([0-9A-Fa-f]{64})\s+(.+)$/);
    assert(match, `Línea inválida en SHA256SUMS.txt: ${line}`);
    return [match[2].trim(), match[1].toUpperCase()];
  }));
  const required = new Map([
    ['LosPanitas-Elo-POS.apk', sha256(apkBytes)],
    ['LosPanitas-Elo-POS-APK.zip', sha256(friendly)],
    ['Paquete-Recursos-Terminal-ELO.zip', sha256(readFileSync(join(downloads, 'Paquete-Recursos-Terminal-ELO.zip')))],
    [update.artifact.filename, sha256(artifact)],
    ['update.json', sha256(readFileSync(join(downloads, 'update.json')))]
  ]);
  for (const [name, hash] of required) {
    assert(declared.get(name) === hash, `SHA256SUMS.txt no valida ${name}.`);
  }
}

async function validateAndroidArtifact(apkBytes) {
  const tools = findAndroidTools();
  if (!tools) {
    throw new Error('Faltan aapt2/apksigner en Android SDK: no se puede validar la identidad y firma del APK.');
  }
  const folder = await mkdtemp(join(tmpdir(), 'panitas-release-'));
  const apkPath = join(folder, 'LosPanitas-Elo-POS.apk');
  try {
    writeFileSync(apkPath, apkBytes);
    const badging = run(tools.aapt2, ['dump', 'badging', apkPath]);
    assert(badging.includes("package: name='com.panitas.pos'"), 'El APK tiene un packageName inesperado.');
    assert(badging.includes(`versionCode='${release.versionCode}'`), 'El APK tiene otro versionCode.');
    assert(badging.includes(`versionName='${release.versionName}'`), 'El APK tiene otro versionName.');
    const signature = run(tools.apksigner, ['verify', '--verbose', '--print-certs', apkPath]);
    assert(/Verifies\s*$/m.test(signature), 'apksigner no confirmó la firma del APK.');
    const cert = signature.match(/certificate SHA-256 digest:\s*([0-9a-fA-F]{64})/);
    assert(cert && cert[1].toUpperCase() === update.apk.signingCertificateSha256,
      'La huella del certificado no coincide con update.json.');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function findAndroidTools() {
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
    || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const buildTools = join(sdk, 'build-tools');
  if (!existsSync(buildTools)) return null;
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const signerSuffix = process.platform === 'win32' ? '.bat' : '';
  const versions = readdirSync(buildTools, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  for (const version of versions) {
    const folder = join(buildTools, version.name);
    const aapt2 = join(folder, `aapt2${suffix}`);
    const apksigner = join(folder, `apksigner${signerSuffix}`);
    if (existsSync(aapt2) && existsSync(apksigner)) return { aapt2, apksigner };
  }
  return null;
}

function run(command, args) {
  const environment = { ...process.env };
  const javaHome = findJavaHome();
  if (javaHome) {
    environment.JAVA_HOME = javaHome;
    environment.PATH = `${join(javaHome, 'bin')}${delimiter}${environment.PATH || ''}`;
  }
  const isBatch = process.platform === 'win32' && /\.bat$/i.test(command);
  const options = { encoding: 'utf8', windowsHide: true, env: environment };
  const result = isBatch
    ? spawnSync([command, ...args].map(quoteWindowsArgument).join(' '), { ...options, shell: true })
    : spawnSync(command, args, options);
  if (result.status !== 0) throw new Error(`${basename(command)} falló:\n${result.stdout || ''}${result.stderr || ''}`);
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function findJavaHome() {
  const executable = process.platform === 'win32' ? 'java.exe' : 'java';
  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin', executable))) return process.env.JAVA_HOME;
  if (process.platform !== 'win32') return '';
  const root = 'C:\\Program Files\\Android\\openjdk';
  if (!existsSync(root)) return '';
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .filter((folder) => existsSync(join(folder, 'bin', 'java.exe')))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return candidates[0] || '';
}

function quoteWindowsArgument(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function readZipEntries(buffer) {
  const eocd = findSignatureBackwards(buffer, 0x06054b50, Math.max(0, buffer.length - 65_557));
  assert(eocd >= 0, 'ZIP sin directorio central válido.');
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  let offset = buffer.readUInt32LE(eocd + 16);
  assert(count > 0 && count <= 32 && offset + centralSize <= buffer.length, 'ZIP fuera de límites.');
  const result = new Map();
  for (let index = 0; index < count; index += 1) {
    assert(buffer.readUInt32LE(offset) === 0x02014b50, 'Entrada central ZIP inválida.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert(!result.has(name), `Entrada ZIP duplicada: ${name}`);
    assert(buffer.readUInt32LE(localOffset) === 0x04034b50, 'Cabecera local ZIP inválida.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    let contents;
    if (method === 0) contents = Buffer.from(compressed);
    else if (method === 8) contents = inflateRawSync(compressed);
    else throw new Error(`Método ZIP no permitido: ${method}.`);
    assert(contents.length === uncompressedSize && contents.length <= 50 * 1024 * 1024,
      `Tamaño ZIP inválido para ${name}.`);
    result.set(name, contents);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function findSignatureBackwards(buffer, signature, minimum) {
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === signature) return index;
  }
  return -1;
}

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sha256(value) { return createHash('sha256').update(value).digest('hex').toUpperCase(); }
function isSha256(value) { return /^[0-9A-F]{64}$/i.test(value || ''); }
function assert(condition, message) { if (!condition) throw new Error(message); }
