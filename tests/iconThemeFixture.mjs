import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** Build the shipped starter in an isolated project using this SDK checkout. */
export function iconThemeFixture() {
  const packageRoot = fileURLToPath(new URL('../', import.meta.url));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zync-icon-theme-'));
  const cleanup = () => fs.rmSync(root, { recursive: true, force: true });
  try {
    fs.cpSync(path.join(packageRoot, 'templates/icon-theme'), root, { recursive: true });
    const link = path.join(root, 'node_modules/@zync-sh/plugin-sdk');
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(packageRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
    const build = () => {
      const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    };
    build();
    const directory = path.join(root, 'dist');
    return { root, directory, build, cleanup,
      manifest: JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) };
  } catch (error) { cleanup(); throw error; }
}
