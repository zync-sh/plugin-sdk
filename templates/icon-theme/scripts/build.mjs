import { mkdir, cp, writeFile, lstat, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validatePackageDirectory } from '@zync-sh/plugin-sdk/validate';
import manifest from '../manifest.mjs';

// Authoring code runs locally, never inside Zync. Distribution contains only JSON and SVG.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
// Only the fixed generated output inside this starter may be cleaned, never a caller-supplied path.
const previous = await lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
if (previous?.isSymbolicLink() || previous && !previous.isDirectory()) throw new Error('dist must be a regular directory');
await rm(output, { recursive: true, force: true });
await mkdir(output);
await cp(path.join(root, 'icons'), path.join(output, 'icons'), { recursive: true });
await cp(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'));
await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const result = validatePackageDirectory(output);
if (!result.valid) throw new Error(JSON.stringify(result.issues, null, 2));
console.log('Built and validated the declarative icon pack in dist/.');
