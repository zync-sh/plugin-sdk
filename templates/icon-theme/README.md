# Declarative icon-theme starter

This starter needs an updated Zync host exposing plugin API **2.2**. SDK
2.2.0-beta.1 is currently unreleased source work; do not assume it is on npm.
Install the matching local SDK checkout while preparing or testing the package.

1. Copy this folder into a new project.
2. Run `npm install --save-dev <path-to-sdk-checkout>` (or use the matching published SDK after release).
3. Change `id`, `publisher`, name, version and attribution in `manifest.mjs`.
4. Add your static SVG artwork under `icons/` and map names/extensions in `iconTheme`.
5. Run `npm run build`, `npm run validate`, then `npm run preview`.

The preview prints a loopback URL. Test filenames, folder recognition and light/dark
backgrounds there; stop with Ctrl+C. Preview is not an installation or a security approval.
Restart it after edits: it intentionally serves a validated snapshot, not live filesystem changes.

Distribute `dist/`, not authoring scripts or `node_modules`. The package has no
Worker, runtime entry, host CSS, editor surface or permissions. Files in `dist/`
are JSON, SVG and license text only. Use the regular SDK signing and registry
submission workflow for marketplace distribution; local install still requires
Developer Mode and package review. Never publish a private signing key.

## Mapping rules

`iconTheme.version` is 1. `iconDefinitions` maps bounded icon IDs to package-relative
`.svg` paths. `file` and `folder` name required defaults. `fileNames`,
`fileExtensions` and `folderNames` are optional mappings to those IDs.

Matching is case-insensitive without trimming filenames. Exact filenames take
priority over extensions; the longest compound extension wins (`tar.gz` before
`gz`). Folder mappings match leaf names, not paths. Unknown entries use the pack's
defaults. There is no file-content inspection or automatic language parsing.

Version 1 supports at most 512 definitions and 2,048 total associations. Paths
cannot be absolute, linked, URL-encoded or leave the package. Each SVG is bounded
to 128 KiB, 4,096 elements and 64 levels. Only static shapes, groups, gradients,
clipping, titles and descriptions are accepted. Scripts, embedded images, styles,
event attributes, animation, entities, processing instructions and external
references are rejected. Export simple SVGs without an XML declaration.
The SDK schema and preflight help authors; the native host revalidates resources.

This is a documented subset of familiar file-icon mappings, not a complete
VS Code icon-theme importer. `languageIds`, per-folder path rules, expanded-folder
variants, light variants and fonts are not v1 fields.

The small example icons are MIT-licensed with the SDK. Keep the included license,
and add correct licenses/attribution when replacing or adding third-party artwork.
Do not bundle artwork whose redistribution rights you have not checked.
