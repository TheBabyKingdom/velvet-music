// Build a Windows ZIP (default), portable EXE, or unpacked directory.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'win32') throw new Error('Build this Windows release on Windows, or use the included Windows GitHub Actions workflow.');
const cacheRoot = path.join(root, 'work', 'build-cache');
const temporary = path.join(cacheRoot, 'temp');
fs.mkdirSync(temporary, {recursive:true});
for (const file of ['src/index.html','src/app.js','src/styles.css','assets/icon.ico','assets/demo/library.json']) {
  if (!fs.existsSync(path.join(root,file))) throw new Error('Missing app source or generated asset: ' + file + '. Run pnpm install first.');
}
const env = {...process.env, ELECTRON_BUILDER_CACHE:path.join(cacheRoot,'builder'), electron_config_cache:path.join(root,'work','electron-cache'), ELECTRON_CACHE:path.join(root,'work','electron-cache'), TEMP:temporary, TMP:temporary};
const nodeArgs = [];
// Optional compatibility for a host that rejects async realpath on otherwise allowed files.
// Normal Windows and GitHub Actions builds use the unmodified Node filesystem API.
if (process.env.VELVET_WINDOWS_HOST_COMPAT === '1') {
  const compatibility = path.join(__dirname,'windows-host.cjs');
  nodeArgs.push('--require', compatibility);
  env.NODE_OPTIONS = [process.env.NODE_OPTIONS || '', '--require=' + JSON.stringify(compatibility)].filter(Boolean).join(' ');
}
const target = process.argv.includes('--dir') ? '--dir' : process.argv.includes('--portable') ? 'portable' : 'zip';
const args = [...nodeArgs,path.join(root,'node_modules','electron-builder','cli.js'), '--win', target, '--publish','never', '--config.electronDist=node_modules/electron/dist'];
const result = spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

