import { defineManifest } from '@zync-sh/plugin-sdk';
import { defineIconTheme } from '@zync-sh/plugin-sdk/icon-theme';

export default defineManifest({
  manifestVersion: 2, id: 'dev.example.icons', name: 'Example Icons', version: '1.0.0',
  publisher: 'dev.example', license: 'MIT', type: 'icon-theme',
  engines: { zync: '>=2.35.1', pluginApi: '>=2.2.0, <3.0.0' },
  iconTheme: defineIconTheme({
    version: 1,
    iconDefinitions: { file: { iconPath: 'icons/file.svg' }, folder: { iconPath: 'icons/folder.svg' }, source: { iconPath: 'icons/source.svg' } },
    file: 'file', folder: 'folder',
    fileNames: { 'package.json': 'source' }, fileExtensions: { ts: 'source', tsx: 'source', 'tar.gz': 'file' }, folderNames: { src: 'source' },
  }),
});
