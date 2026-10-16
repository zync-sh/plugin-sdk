import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { validatePackageDirectory } from '../validate.js';
import { readIconThemeAssets } from '../icon-theme.js';

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zync icon pack preview</title>
<style>body{font:15px system-ui;margin:32px;background:#18181b;color:#e4e4e7}main{max-width:960px;margin:auto}button,input{font:inherit;padding:8px}input:not([type=checkbox]){width:min(400px,80%)}ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:16px;padding:0;list-style:none}li{display:flex;align-items:center;gap:10px;min-width:0;padding:12px;border:1px solid #71717a;border-radius:6px}img{width:28px;height:28px}span{overflow-wrap:anywhere}body.light{background:#fff;color:#18181b}</style>
<main><h1 id="title">Icon pack preview</h1><p>Local preview only. No plugin runtime or Zync data is available.</p><button id="theme">Toggle light/dark</button><h2>Try a filename</h2><label>File or folder name <input id="name" value="package.json"></label> <label><input id="folder" type="checkbox">Folder</label><ul id="sample" aria-live="polite"></ul><h2>Pack artwork</h2><ul id="icons"></ul></main><script type="module" src="/preview.js"></script></html>`;
const script = `const response=await fetch('/theme.json'); const manifest=await response.json(); const theme=manifest.iconTheme;
document.querySelector('#title').textContent=manifest.name;
const icon=(id,label)=>{const row=document.createElement('li');const image=document.createElement('img');image.alt='';image.src='/icons/'+encodeURIComponent(id);const text=document.createElement('span');text.textContent=label;row.append(image,text);return row;};
for(const id of Object.keys(theme.iconDefinitions)) document.querySelector('#icons').append(icon(id,id));
const lookup=(mapping,name)=>Object.entries(mapping??{}).find(([key])=>key.toLowerCase()===name)?.[1];
const update=()=>{const name=document.querySelector('#name').value;const lower=name.toLowerCase();const folder=document.querySelector('#folder').checked;
const id=folder?lookup(theme.folderNames,lower)??theme.folder:lookup(theme.fileNames,lower)??Object.entries(theme.fileExtensions??{}).sort((a,b)=>b[0].length-a[0].length).find(([extension])=>lower.endsWith('.'+extension.toLowerCase()))?.[1]??theme.file;
document.querySelector('#sample').replaceChildren(icon(id,name||'(empty name)'));};
document.querySelector('#name').addEventListener('input',update);document.querySelector('#folder').addEventListener('change',update);document.querySelector('#theme').addEventListener('click',()=>document.body.classList.toggle('light'));update();`;

/** Read-only loopback preview. Routes expose only the already validated pack's declared icons. */
export async function startIconThemePreview(directory, options = {}) {
  const root = path.resolve(directory);
  const result = validatePackageDirectory(root);
  if (!result.valid) throw new Error(JSON.stringify(result.issues, null, 2));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!manifest.iconTheme) throw new Error('Preview requires a declarative iconTheme contribution.');
  // Snapshot validated resources: filesystem edits cannot swap the served assets after validation.
  const snapshot = readIconThemeAssets(root, manifest.iconTheme);
  const icons = new Map(Object.entries(manifest.iconTheme.iconDefinitions).map(([id, icon]) =>
    [`/icons/${encodeURIComponent(id)}`, snapshot.get(icon.iconPath)]));
  const routes = new Map([['/', ['text/html; charset=utf-8', html]], ['/preview.js', ['text/javascript; charset=utf-8', script]],
    ['/theme.json', ['application/json', JSON.stringify(manifest)]]]);
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== expectedHost) { response.writeHead(403); response.end(); return; }
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    let url;
    try { url = new URL(request.url, `http://${expectedHost}`); }
    catch { response.writeHead(400); response.end(); return; }
    if (url.origin !== `http://${expectedHost}`) { response.writeHead(400); response.end(); return; }
    const icon = icons.get(url.pathname);
    const route = routes.get(url.pathname);
    if (!icon && !route) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', icon ? 'image/svg+xml' : route[0]);
    response.end(icon ?? route[1]);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', resolve); });
  return server;
}
