# Zync plugin SDK

Start with the community guides: [build a plugin](https://zync.thesudoer.in/docs/plugin-development/),
[API and permissions](https://zync.thesudoer.in/docs/plugin-api/),
[sign and publish](https://zync.thesudoer.in/docs/plugin-publishing/), and
[best practices](https://zync.thesudoer.in/docs/plugin-best-practices/).
The signed marketplace uses [zync-plugin-registry](https://github.com/zync-sh/zync-plugin-registry).

## Declarative icon packs (2.2.0)

SDK 2.2.0 adds a versioned, data-only `iconTheme` contribution.
Built-in and community packs use Zync's existing plugin registry, enable/disable
controls, installation review and update/rollback paths. No worker, CSS, network
permission or new registration API is needed.

Start from [`templates/icon-theme`](templates/icon-theme/README.md). It includes
three SVGs, filename/compound-extension/folder associations, a validated build,
and `zync-plugin preview-icons dist`, a localhost-only preview that runs no plugin
code. The exported `./icon-theme` helpers and `./icon-theme.schema.json` support
typed authoring and editor validation. Native package validation is authoritative.

Declare `engines.pluginApi: ">=2.2.0, <3.0.0"`; older hosts cannot interpret this
contribution. The SDK release does not establish a released desktop minimum:
test against a host providing API 2.2 before distributing packs.
Legacy `iconsPath` packs and existing SDK exports remain supported.

## Terminal overlays (2.1.0-beta.4)

`registerTerminalOverlay(popupElement)` from `@zync-sh/plugin-sdk/terminal`
registers an open rectangular popup above embedded host terminal content.
Call the returned `dispose()` when the popup closes or unmounts; use `refresh()`
after layout changes not observable through resize/style/scroll events.
Registration is limited to eight concurrent elements per SDK instance.
The host validates all geometry and clips only actual popup rectangles, including
over the header. Separate host approval dialogs remain protected. Older hosts
hide the surface for any registered popup; no new fields are sent to old parsers.
No terminal I/O, approval authority, DOM access or arbitrary z-index is exposed.
The overlay helper is included in SDK 2.2.0 and was introduced in 2.1.0-beta.4.

Public authoring types for Manifest v2 plugins. This package is maintained separately from the Zync desktop app and has its own npm version and release lifecycle.

This SDK targets API **2.2**. The earlier API 2.1 addition `sshCommand.execute(paneInstanceId, { program, args, expectedConnectionToken? })` requires `ssh.command.execute` and `engines.pluginApi: "^2.1.0"`. The returned `connectionToken` must be carried into commands following a confirmation so reconnect/rebind cannot silently change their destination. Commands use the SSH account's full authority; this is not a read-only or PM2-only permission. API 2.0 hosts reject plugins requiring this addition.

To test changes from a local checkout, install the SDK as a development dependency:

```sh
npm install --save-dev /path/to/npm-packages/plugin-sdk
```

Install this SDK version explicitly with:

```sh
npm install --save-dev --save-exact @zync-sh/plugin-sdk@2.2.0
```

The starter's external pane assets require Zync `>=2.33.8`. The SDK is
for authoring plugin source; it does not make external assets work
in Zync 2.33.7 or older. Do not publish migrated plugin builds to users until
the compatible desktop release has passed packaged-app testing.

Zync supplies the `zync` object when it starts a plugin worker or pane. Import worker
and pane declarations as types; they do not create runtime authority. If using the
SDK's terminal surface helpers, bundle those helper implementations into your pane.

## Editor status (desktop host)

Editor-provider iframes receive a separate `zyncEditor` bridge. After `zync:editor:open-document`, a provider can report its one-based cursor position and optional short language label to Zync's bottom status bar:

```ts
import type { ZyncEditorBridge } from '@zync-sh/plugin-sdk/editor';

declare const zyncEditor: ZyncEditorBridge;

zyncEditor.reportStatus({ docId: currentDocument.docId, line: 12, column: 4, language: 'typescript' });
```

Report on cursor or selection changes, not on a timer. The `docId` must match the current document; stale, invalid, or oversized values are ignored. Zync supplies the filename, encoding, and modified state itself. Older desktop hosts ignore this optional message.

## Manifest

`defineManifest` gives TypeScript a Manifest v2 contract and returns the same object. It does **not** validate a package or grant permissions; the Zync host is the final authority.

```ts
import { defineManifest } from '@zync-sh/plugin-sdk';

export default defineManifest({
  manifestVersion: 2,
  id: 'com.example.hello',
  name: 'Hello',
  version: '1.0.0',
  publisher: 'com.example',
  engines: { zync: '>=2.32.2', pluginApi: '^2.0.0' },
  runtime: { entry: 'worker.js' },
  contributes: {
    commands: [{ id: 'hello.say-hi', title: 'Say hi' }],
  },
  permissions: {
    required: [{ id: 'ui.commands.register', reason: 'Add the command to Zync.' }],
  },
});
```

Write the resulting object to `manifest.json` during your build. Zync installs the JSON and the built plugin files, not the TypeScript source.

## Validate before signing

### Generate a publisher key using OpenSSL

The SDK includes `keygen` and the `zync-sdk` executable. Use the official scoped package explicitly:

```powershell
npx --package=@zync-sh/plugin-sdk@2.2.0 zync-sdk keygen --out C:\ZyncSigningKeys\publisher-v1
```

Do not use `npx zync-sdk`: that can resolve an unrelated unscoped npm package. In a project with this SDK installed, `npx --no-install zync-sdk keygen --out <new-directory>` runs its installed executable. Developers working in this source checkout can test it with `node bin/zync-plugin.mjs keygen --out <new-directory>`.

Install OpenSSL first, or supply `--openssl <executable-path>`. Git for Windows' bundled OpenSSL is detected automatically. The command invokes OpenSSL directly without a shell; Node.js does not generate keys. The SDK prompts with hidden input: **press Enter to skip encryption**, or enter and confirm a passphrase to encrypt the private key. Nonempty passphrases go to OpenSSL through stdin, never command arguments. Use a long unique passphrase and keep it in your password manager. An interactive terminal is required; Ctrl+C cancels. Passphrases briefly exist in process memory.

Choose encrypted, non-synced storage outside Git. The parent directory must exist; the output directory must not exist. The command writes a PKCS#8 Ed25519 `publisher-private.pem` (AES-256-CBC encrypted if you enter a passphrase) and a public `publisher-public.pem`; only the public file may be shared. Skipping encryption prints a warning: anyone who copies the private file can sign as you. Unix permissions are restricted; Windows users must also ensure suitable folder access permissions. Keep encrypted backups. A failed command stops immediately and may leave partial output, which must not be used.

This command is for plugin publishers, not marketplace root-key management. Generating a key does not register a publisher or publish a plugin. Sign the built directory, then verify it independently:

Publishers choose their key-custody model, including local signing or protected CI secrets. Never commit private keys, include them in packages, print them in logs, or send them to the marketplace. Keep signing secrets out of PR-validation jobs and untrusted code execution. Protected release environments, reviewed dependencies and restricted secret access are recommended; passphrase encryption is optional. The marketplace root key has a separate operator policy and must not be substituted for a publisher key.

```powershell
npx --package=@zync-sh/plugin-sdk@2.2.0 zync-sdk sign --source ./dist/my-plugin --key C:\ZyncSigningKeys\publisher-v1\publisher-private.pem --out ./signed/my-plugin
npx --package=@zync-sh/plugin-sdk@2.2.0 zync-sdk verify --source ./signed/my-plugin
```

The signer accepts Ed25519 private PEM keys (encrypted or unencrypted) and existing JSON publisher keys. Encrypted PEM keys prompt once using hidden input. The PEM publisher identity comes from the manifest; trusted marketplace metadata must separately authorize that public key for the publisher. Verification checks package integrity and its signature, not publisher authorization, behavior safety, or registry trust. Signed output must be new and outside the source directory; the private key must also be outside the source. Never include private keys in build output. Keep the signed folder's contents at the ZIP root, including `integrity.json` and `signature.json`.

Run the packaged CLI against the **built plugin directory** (the one containing `manifest.json` and its referenced assets):

```sh
npx --no-install zync-sdk validate ./dist/my-plugin --zync-version 2.34.0
```

This assumes the scoped SDK is already installed in your project. From this SDK
source checkout, use `node bin/zync-plugin.mjs validate <built-directory>`.
For programmatic checks, import `validateManifest` or `validatePackageDirectory`
from `@zync-sh/plugin-sdk/validate`. Validation returns `{ valid, issues }`;
warnings do not fail the check. Also check the earliest desktop version you claim
to support, not only the example version above.

The preflight checks Manifest v2 fields, publisher namespace, semantic plugin version, contribution/permission declarations, known permissions, network host declarations, referenced files, basic package limits, and plugin API compatibility. For static pane resource links it also checks package-relative paths, supported asset types, the 2 MiB resource limit, and a minimum Zync version for external pane assets. Use relative bundler output (for example, Vite `base: './'`); root-relative URLs cannot resolve inside a plugin pane. Pass `--zync-version` to check compatibility with a specific app build; without it, the Zync range is syntax-checked only. Unknown optional permissions produce warnings because the host denies them until supported. The preflight does **not** validate signatures, inspect executable behavior, or replace native install-time validation. The signing tool and native host retain their own package and security checks.

The [basic starter template](templates/basic/README.md) is included in this package. It builds a minimal worker and isolated pane with external CSS/JavaScript, validates the output, and offers a localhost visual preview. The preview does not simulate Worker actions or permissions. See [RELEASE.md](RELEASE.md) for versioning and the publication checklist.

## Host-provided APIs

For a worker:

Declare `ui.commands.register`, the command contribution, and
`ui.notifications.emit` in the manifest before using this example:

```ts
import type { ZyncWorkerApi } from '@zync-sh/plugin-sdk/worker';

declare const zync: ZyncWorkerApi;

zync.on('ready', async () => {
  await zync.commands.register('hello.say-hi', 'Say hi', async () => {
    await zync.ui.notify({ message: 'Hello from the plugin' });
  });
});
```

For an isolated pane, use `import type { ZyncPaneApi } from '@zync-sh/plugin-sdk/pane'` and declare `window.zync` with that type in your pane source. Panes can exchange messages with their worker; they do not get the worker API, host DOM, or direct network access.

The typed worker interface covers the Manifest v2 broker APIs only. Legacy plugin APIs are deliberately absent. Every host operation is still checked against the installed manifest, current grant, runtime identity, and applicable scope. The SDK version does not replace the manifest's `engines.pluginApi` compatibility declaration.

See the [community plugin guide](https://zync.thesudoer.in/docs/plugins/) and
[basic starter template](templates/basic/README.md) for package format,
permissions, signing, and manual testing. Internal architecture references are
maintained separately; contributors do not need access to them.

## Experimental host-owned terminals (2.1.0-beta.4)

Declare `ssh.terminal.open` with a clear remote-execution permission reason. The
worker can propose a launch, but cannot start it silently, send input or read PTY
output. The pane mounts only a rectangular slot; Zync owns xterm and its controls.

```js
// Worker: check for older hosts before requesting a proposal.
if (!zync.sshTerminal) return; // Retain your old confirmed command-runner fallback.
const { connectionToken } = await zync.sshTerminal.context(paneInstanceId);
const offer = await zync.sshTerminal.prepare(paneInstanceId, {
  program: 'example-tool', args: ['interactive'],
  expectedConnectionToken: connectionToken,
});
await zync.panel.postMessage(paneInstanceId, { kind: 'terminal-offer', ...offer });
```

```js
// Pane: bundle this helper into the plugin package; never load it from a CDN.
import { mountTerminalSurface } from '@zync-sh/plugin-sdk/terminal';
const surface = mountTerminalSurface(slotElement, message.offerId);
if (!await surface.ready) { /* Host does not support this surface; show fallback. */ }
// On pane UI teardown or replacing the slot:
surface.dispose();
```

Use an axis-aligned slot at least 240×100 CSS pixels, without transforms or elements
layered over it. Call `refresh()` after custom layout changes. Scroll, resize and
ancestor style changes are coalesced; fully clipped or hidden slots remain hidden.
Offers expire after 60 seconds and are specific to a pane/document/connection.
After natural exit, close the surface and explicitly request a fresh offer; there
is no automatic restart. Zync's foreground **Open terminal** button and confirmation
are required once per session, not per command typed afterward.

The terminal integration remains experimental against a matching updated desktop
build, **not a stable marketplace rollout**. A stable SDK version does not promote
experimental host features. Published older desktop versions lack these routes.
Packaged WebView2 testing, real-server profiling and the SSH library cancellation/
buffering limitations documented in `docs/PLUGIN_TERMINALS.md` remain release gates.
