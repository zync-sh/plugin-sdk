import fs from 'node:fs';
import path from 'node:path';
import { SaxesParser } from 'saxes';

export const iconThemeApiVersion = '2.2.0';
const allowedFields = new Set(['version', 'iconDefinitions', 'file', 'folder', 'fileNames', 'fileExtensions', 'folderNames']);
const identifier = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safePath = value => typeof value === 'string' && [...value].length <= 260 && value.endsWith('.svg')
  && !/[\\:%?#\u0000-\u001f\u007f-\u009f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const issue = (issues, location, message) => issues.push({ path: location, message, severity: 'error' });

/** Identity helper for a declarative contribution; no plugin code is executed by Zync. */
export function defineIconTheme(theme) { return theme; }

/** Validate author-owned mappings before packaging. Native validation remains authoritative. */
export function validateIconTheme(theme) {
  const issues = [];
  if (!object(theme)) return { valid: false, issues: [{ path: 'iconTheme', message: 'Must be an object', severity: 'error' }] };
  for (const key of Object.keys(theme)) if (!allowedFields.has(key)) issue(issues, `iconTheme.${key}`, 'Unknown v1 field');
  if (theme.version !== 1) issue(issues, 'iconTheme.version', 'Must be 1');
  const definitions = object(theme.iconDefinitions) ? theme.iconDefinitions : {};
  if (!object(theme.iconDefinitions) || !Object.keys(definitions).length || Object.keys(definitions).length > 512) {
    issue(issues, 'iconTheme.iconDefinitions', 'Must contain 1–512 definitions');
  }
  for (const [id, definition] of Object.entries(definitions)) {
    if (!identifier.test(id) || id.endsWith('.') || id.includes('..')) issue(issues, `iconTheme.iconDefinitions.${id}`, 'Invalid icon id');
    if (!object(definition) || Object.keys(definition).some(key => key !== 'iconPath') || !safePath(definition.iconPath)) {
      issue(issues, `iconTheme.iconDefinitions.${id}`, 'Must contain only a package-relative .svg iconPath');
    }
  }
  const reference = (id, location) => {
    if (typeof id !== 'string' || !Object.hasOwn(definitions, id)) issue(issues, location, 'Must reference an icon definition');
  };
  for (const key of ['file', 'folder']) reference(theme[key], `iconTheme.${key}`);
  let total = 0;
  for (const key of ['fileNames', 'fileExtensions', 'folderNames']) {
    const mapping = theme[key];
    if (mapping === undefined) continue;
    if (!object(mapping)) { issue(issues, `iconTheme.${key}`, 'Must be an object'); continue; }
    const seen = new Set();
    for (const [name, id] of Object.entries(mapping)) {
      total++;
      if (!name || [...name].length > 255 || /[/\\\u0000-\u001f\u007f-\u009f]/.test(name) || seen.has(name.toLowerCase())) {
        issue(issues, `iconTheme.${key}.${name}`, 'Use unique case-insensitive leaf names of at most 255 characters');
      }
      seen.add(name.toLowerCase());
      reference(id, `iconTheme.${key}.${name}`);
    }
  }
  if (total > 2048) issue(issues, 'iconTheme', 'Exceeds 2,048 associations');
  return { valid: issues.length === 0, issues };
}

const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title', 'desc']);
const attributes = new Set(['xmlns', 'xmlns:xlink', 'version', 'viewBox', 'width', 'height', 'preserveAspectRatio', 'id', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'clip-path', 'clip-rule', 'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity', 'color']);
const fragment = value => /^#[A-Za-z0-9_.-]{1,128}$/.test(value);

/** Static SVG preflight: no scripts, style, external resources, entities or animation. */
export function validateIconSvg(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 128 * 1024 || /&|<!DOCTYPE|<\?/i.test(source)) return false;
  let count = 0, depth = 0;
  const parser = new SaxesParser();
  const reject = () => { throw new Error('Unsupported static SVG'); };
  parser.on('error', reject);
  parser.on('opentag', node => {
    if (++count > 4096 || depth >= 64 || !tags.has(node.name) || depth === 0 && node.name !== 'svg') reject();
    depth++;
    for (const [key, rawValue] of Object.entries(node.attributes)) {
      const value = rawValue.trim();
      if (!(attributes.has(key) || ['image-rendering', 'shape-rendering', 'text-rendering'].includes(key) || key.startsWith('data-'))
        || value.includes('\\') || value.includes('/*') || value.includes('*/')) reject();
      if (key === 'xmlns' && value !== 'http://www.w3.org/2000/svg'
        || key === 'xmlns:xlink' && value !== 'http://www.w3.org/1999/xlink') reject();
      if (['fill', 'stroke', 'clip-path', 'stop-color', 'color'].includes(key)
        && /url\(/i.test(value) && !(value.startsWith('url(') && value.endsWith(')') && fragment(value.slice(4, -1)))) reject();
    }
  });
  parser.on('closetag', () => { depth--; });
  try { parser.write(source).close(); return count > 0 && depth === 0; }
  catch { return false; }
}

/** Read only declared resources, rejecting links at every path segment before decoding bounded UTF-8. */
function inspectAssets(root, theme) {
  const result = validateIconTheme(theme);
  if (!result.valid) return { ...result, assets: new Map() };
  const issues = [];
  const assets = new Map();
  for (const relative of new Set(Object.values(theme.iconDefinitions).map(icon => icon.iconPath))) {
    try {
      let current = path.resolve(root);
      let metadata;
      for (const segment of relative.split('/')) {
        current = path.join(current, segment);
        metadata = fs.lstatSync(current);
        if (metadata.isSymbolicLink()) throw new Error('Linked icon resources are unsupported');
      }
      // Reject devices/FIFOs before open can block; recheck the opened descriptor too.
      if (!metadata.isFile() || metadata.size > 128 * 1024) throw new Error('Icon must be a regular SVG of at most 128 KiB');
      const descriptor = fs.openSync(current, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
      try {
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.size > 128 * 1024) throw new Error('Icon must be a regular SVG of at most 128 KiB');
        const bytes = Buffer.alloc(128 * 1024 + 1);
        let length = 0, read;
        while (length < bytes.length && (read = fs.readSync(descriptor, bytes, length, bytes.length - length, null)) > 0) length += read;
        if (length > 128 * 1024) throw new Error('Icon exceeds 128 KiB');
        const content = bytes.subarray(0, length);
        const source = new TextDecoder('utf-8', { fatal: true }).decode(content);
        if (!validateIconSvg(source)) throw new Error('Icon must use the static SVG v1 vocabulary');
        assets.set(relative, Buffer.from(content));
      } finally { fs.closeSync(descriptor); }
    } catch (error) { issue(issues, `iconTheme:${relative}`, error.message); }
  }
  return { valid: issues.length === 0, issues, assets };
}

export function validateIconThemeAssets(root, theme) {
  const { valid, issues } = inspectAssets(root, theme);
  return { valid, issues };
}

/** Validated immutable snapshot for local previews; never serves resources from a later filesystem read. */
export function readIconThemeAssets(root, theme) {
  const result = inspectAssets(root, theme);
  if (!result.valid) throw new Error(JSON.stringify(result.issues));
  return result.assets;
}
