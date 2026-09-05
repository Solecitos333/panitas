import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = join(root, 'android-elo-kiosk', 'app', 'src', 'main', 'java');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
  || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const platformJar = await newestAndroidJar(sdk);
if (!platformJar) throw new Error(`No se encontró android.jar dentro de ${sdk}.`);

const temporary = await mkdtemp(join(tmpdir(), 'panitas-android-'));
try {
  const generated = join(temporary, 'generated', 'com', 'panitas', 'pos');
  const classes = join(temporary, 'classes');
  await mkdir(generated, { recursive: true });
  await mkdir(classes, { recursive: true });
  const rSource = join(generated, 'R.java');
  await writeFile(rSource,
    'package com.panitas.pos; public final class R { public static final class drawable { public static final int app_icon = 1; } }\n');
  const sources = [...await walk(sourceRoot), rSource].filter((file) => file.endsWith('.java'));
  const javac = findJavac();
  const result = spawnSync(javac, [
    '-encoding', 'UTF-8', '-source', '8', '-target', '8',
    '-cp', platformJar, '-d', classes, ...sources
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`El contenedor Android no compila:\n${result.stdout || ''}${result.stderr || ''}${result.error || ''}`);
  }
  console.log(`Android validado: ${sources.length - 1} fuentes Java compiladas contra ${basename(platformJar)}.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function findJavac() {
  const executable = process.platform === 'win32' ? 'javac.exe' : 'javac';
  if (process.env.JAVA_HOME) {
    const configured = join(process.env.JAVA_HOME, 'bin', executable);
    if (existsSync(configured)) return configured;
  }
  if (process.platform === 'win32') {
    const androidJdks = 'C:\\Program Files\\Android\\openjdk';
    if (existsSync(androidJdks)) {
      const candidates = readdirSync(androidJdks, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .map((name) => join(androidJdks, name, 'bin', executable))
        .filter(existsSync)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      if (candidates[0]) return candidates[0];
    }
  }
  return executable;
}

async function newestAndroidJar(sdkRoot) {
  const platforms = join(sdkRoot, 'platforms');
  if (!existsSync(platforms)) return '';
  const folders = (await readdir(platforms, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^android-\d+(?:\.\d+)?$/.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  for (const folder of folders) {
    const candidate = join(platforms, folder.name, 'android.jar');
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

async function walk(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
