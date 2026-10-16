import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { defineIconTheme, validateIconTheme, validateIconSvg, validateIconThemeAssets } from '../icon-theme.js';
import { validateManifest, validatePackageDirectory } from '../validate.js';
import { startIconThemePreview } from '../bin/icon-theme-preview.mjs';
import { iconThemeFixture as fixture } from './iconThemeFixture.mjs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));

test('editor schema rejects unsafe paths, invalid IDs and control characters without rejecting ordinary names', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(packageRoot, 'icon-theme.schema.json'), 'utf8'));
  const iconPath = new RegExp(schema.properties.iconDefinitions.additionalProperties.properties.iconPath.pattern);
  for (const name of ['icons/source.svg', 'folder.svg', 'icons/full-name.svg']) assert.equal(iconPath.test(name), true, name);
  for (const name of ['/file.svg', '../file.svg', 'icons/../file.svg', 'icons//file.svg', 'icons/a\u0001.svg', 'C:/file.svg']) assert.equal(iconPath.test(name), false, name);
  const id = new RegExp(schema.properties.iconDefinitions.propertyNames.pattern);
  for (const name of ['file', 'folder-default', 'lang.ts']) assert.equal(id.test(name), true, name);
  for (const name of ['file..name', 'file.', '.file']) assert.equal(id.test(name), false, name);
  const leaf = new RegExp(schema.properties.fileNames.propertyNames.pattern);
  for (const name of ['source.ts', 'package.json', 'upper.ts', 'spaces ', '.config']) assert.equal(leaf.test(name), true, name);
  for (const name of ['a/b', 'a\\b', 'a\u0001b']) assert.equal(leaf.test(name), false, name);
});

test('starter builds a valid data-only package without a worker', () => {
  const sample = fixture();
  try {
    assert.equal(validatePackageDirectory(sample.directory).valid, true);
    assert.equal(sample.manifest.runtime, undefined);
    assert.equal(fs.existsSync(path.join(sample.directory, 'worker.js')), false);
    fs.writeFileSync(path.join(sample.directory, 'stale.svg'), '<svg/>');
    sample.build();
    assert.equal(fs.existsSync(path.join(sample.directory, 'stale.svg')), false, 'rebuild removes stale generated assets');
    assert.equal(defineIconTheme(sample.manifest.iconTheme), sample.manifest.iconTheme);
    assert.equal(validateManifest(sample.manifest, { pluginApiVersion: '2.1.0' }).valid, false);
    const oldRange = structuredClone(sample.manifest); oldRange.engines.pluginApi = '^2.0.0';
    assert.equal(validateManifest(oldRange).valid, false);
    for (const [field, value] of [['runtime', { entry: 'worker.js' }], ['main', 'worker.js'], ['style', 'theme.css'], ['iconsPath', 'icons'],
      ['permissions', { required: [{ id: 'network.fetch', reason: 'test', hosts: ['example.com'] }] }]]) {
      assert.equal(validateManifest({ ...sample.manifest, [field]: value }).valid, false, field);
    }
  } finally { sample.cleanup(); }
});

test('definition validation rejects versions, unknown keys, missing references, paths and collisions', () => {
  const base = { version: 1, iconDefinitions: { file: { iconPath: 'icons/file.svg' } }, file: 'file', folder: 'file' };
  assert.equal(validateIconTheme(base).valid, true);
  for (const value of [null, [], { ...base, version: 2 }, { ...base, unknown: true }, { ...base, file: 'missing' },
    { ...base, fileNames: { 'App.ts': 'file', 'APP.TS': 'file' } }, { ...base, folderNames: { 'src/path': 'file' } }]) {
    assert.equal(validateIconTheme(value).valid, false);
  }
  for (const iconPath of ['../file.svg', '/file.svg', 'C:/file.svg', 'icons\\file.svg', 'icons/%2e.svg', 'icons//file.svg', 'icons/./file.svg', 'icons/file.svg?q=1', 'icons/file.png']) {
    assert.equal(validateIconTheme({ ...base, iconDefinitions: { file: { iconPath } } }).valid, false, iconPath);
  }
});

test('static SVG preflight rejects active and external content', () => {
  assert.equal(validateIconSvg('<svg xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M0 0"/></svg>'), true);
  for (const source of ['', '<svg>', '<svg/><svg/>', '<svg><path></svg>', '<svg width="1" width="2"/>', '<html/>', '<svg><script/></svg>', '<svg onload="alert(1)"/>', '<svg><foreignObject/></svg>',
    '<svg><image href="https://example.com"/></svg>', '<svg><style/></svg>', '<svg><animate/></svg>', '<svg><use href="#loop"/></svg>',
    '<svg fill="url(https://example.com)"/>', '<svg fill="u\\72l(https://example.com)"/>', '<!DOCTYPE svg><svg/>', '<svg><title>&amp;</title></svg>']) {
    assert.equal(validateIconSvg(source), false, source);
  }
});

test('resource preflight rejects missing, oversized, invalid UTF-8 and linked resources', () => {
  const sample = fixture();
  try {
    const icon = path.join(sample.directory, 'icons/file.svg');
    for (const bytes of [Buffer.alloc(128 * 1024 + 1), Buffer.from([0xff]), Buffer.from('<svg><script/></svg>')]) {
      fs.writeFileSync(icon, bytes);
      assert.equal(validateIconThemeAssets(sample.directory, sample.manifest.iconTheme).valid, false);
    }
    fs.unlinkSync(icon);
    assert.equal(validatePackageDirectory(sample.directory).valid, false);
    const linked = path.join(sample.directory, 'linked');
    fs.symlinkSync(path.join(sample.directory, 'icons'), linked, process.platform === 'win32' ? 'junction' : 'dir');
    const theme = structuredClone(sample.manifest.iconTheme); theme.iconDefinitions.file.iconPath = 'linked/folder.svg';
    assert.equal(validateIconThemeAssets(sample.directory, theme).valid, false);
  } finally { sample.cleanup(); }
});

test('resource preflight rejects special files before opening and protects a raced replacement', t => {
  const sample = fixture();
  try {
    const icon = path.join(sample.directory, 'icons/file.svg');
    const stat = fs.lstatSync;
    const open = fs.openSync;
    let opened = false;
    t.mock.method(fs, 'lstatSync', target => target === icon
      ? { isSymbolicLink: () => false, isFile: () => false, size: 0 } : stat(target));
    t.mock.method(fs, 'openSync', (...args) => { opened = true; return open(...args); });
    assert.equal(validateIconThemeAssets(sample.directory, sample.manifest.iconTheme).valid, false);
    // Other declared icons are regular; only this resource must not reach open.
    assert.equal(fs.openSync.mock.calls.some(call => call.arguments[0] === icon), false);
    assert.equal(opened, true);
    t.mock.restoreAll();

    let flags;
    t.mock.method(fs, 'openSync', (target, value) => { if (target === icon) flags = value; return open(target, value); });
    t.mock.method(fs, 'fstatSync', () => ({ isFile: () => false, size: 0 }));
    assert.equal(validateIconThemeAssets(sample.directory, sample.manifest.iconTheme).valid, false);
    if (fs.constants.O_NONBLOCK) assert.equal(flags & fs.constants.O_NONBLOCK, fs.constants.O_NONBLOCK);
    if (fs.constants.O_NOFOLLOW) assert.equal(flags & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW);
  } finally { t.mock.restoreAll(); sample.cleanup(); }
});

test('preview exposes only validated snapshots on loopback, with no arbitrary files or write methods', async () => {
  const sample = fixture();
  let server;
  try {
    server = await startIconThemePreview(sample.directory);
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base);
    assert.match(await response.text(), /script type="module" src="\/preview.js"/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal((await fetch(`${base}/icons/source`)).status, 200);
    assert.equal((await fetch(`${base}/manifest.json`)).status, 404);
    assert.equal((await fetch(`${base}/icons/missing`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const call = request(base, { headers: { Host: 'example.com' } }, response => { response.resume(); resolve(response.statusCode); });
      call.on('error', reject); call.end();
    });
    assert.equal(foreignHostStatus, 403);
    fs.writeFileSync(path.join(sample.directory, 'icons/source.svg'), '<svg><script/></svg>');
    assert.doesNotMatch(await (await fetch(`${base}/icons/source`)).text(), /script/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    sample.cleanup();
  }
});
