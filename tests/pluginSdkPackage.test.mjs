import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineManifest } from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = root;
const manifest = { manifestVersion: 2, id: 'com.example.test' };
assert.equal(defineManifest(manifest), manifest, 'manifest helper must not mutate plugin metadata');

const packageJson = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
assert.equal(packageJson.name, '@zync-sh/plugin-sdk');
assert.equal(packageJson.private, undefined, 'SDK must remain independently publishable');

const cacheDir = mkdtempSync(path.join(tmpdir(), 'zync-plugin-sdk-pack-'));
try {
  const npmCli = process.env.npm_execpath;
  const useNodeCli = Boolean(npmCli);
  const npm = useNodeCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = [...(npmCli ? [npmCli] : []), 'pack', '--dry-run', '--json', '--cache', cacheDir];
  const result = spawnSync(npm, args, {
    cwd: packageDir,
    encoding: 'utf8',
    shell: process.platform === 'win32' && !useNodeCli,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const [packed] = JSON.parse(result.stdout);
  const files = packed.files.map(file => file.path).sort();
  assert.deepEqual(files, [
    'LICENSE', 'README.md', 'RELEASE.md', 'bin/icon-theme-preview.mjs', 'bin/keygen.mjs', 'bin/pem-key.mjs', 'bin/zync-plugin.mjs', 'editor.d.ts',
    'icon-theme.d.ts', 'icon-theme.js', 'icon-theme.schema.json', 'index.d.ts', 'index.js', 'package.json',
    'pane.d.ts', 'signing.js', 'templates/basic/README.md', 'templates/basic/manifest.mjs',
    'templates/basic/package.json', 'templates/basic/scripts/build.mjs',
    'templates/basic/scripts/preview.mjs',
    'templates/basic/src/ui/index.html', 'templates/basic/src/ui/pane.css',
    'templates/basic/src/ui/pane.js', 'templates/basic/src/worker.js',
    'templates/icon-theme/LICENSE', 'templates/icon-theme/README.md', 'templates/icon-theme/icons/file.svg',
    'templates/icon-theme/icons/folder.svg', 'templates/icon-theme/icons/source.svg', 'templates/icon-theme/manifest.mjs',
    'templates/icon-theme/package.json', 'templates/icon-theme/scripts/build.mjs',
    'terminal.d.ts', 'terminal.js', 'validate.d.ts', 'validate.js', 'worker.d.ts',
  ]);
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}

console.log('plugin SDK package: manifest identity and npm contents OK');
