const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {photoPath} = require('../game/src/photo-path.js');

function buildPhotoPacks() {
  const packRoot = path.join(root, 'game/packs');
  const webRoot = path.join(root, 'artifacts/web/packs');
  const configPath = path.join(root, 'game/game.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const entries = fs.existsSync(packRoot) ? fs.readdirSync(packRoot, {withFileTypes:true}) : [];
  const packages = [];
  fs.rmSync(webRoot, {recursive:true, force:true});
  for (const entry of entries.filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = entry.name;
    const dir = path.join(packRoot,name);
    const pictures = fs.readdirSync(dir).filter(file => file.endsWith('.jpg')).sort();
    if (!pictures.length) throw new Error('相册分包为空：'+name);
    const relativeRoot = 'packs/'+name+'/';
    fs.mkdirSync(path.join(webRoot,name),{recursive:true});
    for (const file of pictures) {
      if (photoPath(path.basename(file,'.jpg')).src !== relativeRoot+file) throw new Error('照片所在分包不符：'+name+'/'+file);
      fs.copyFileSync(path.join(dir,file),path.join(webRoot,name,file));
    }
    const entryPath = path.join(dir,'game.js');
    if (!fs.existsSync(entryPath)) fs.writeFileSync(entryPath,"'use strict';\n");
    packages.push({name,root:relativeRoot});
  }
  if (JSON.stringify(config.subpackages||[]) !== JSON.stringify(packages)) {
    config.subpackages=packages;
    fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
  }
}

async function build() {
  await esbuild.build({ entryPoints:[path.join(root,'game/src/main.js')], bundle:true, platform:'neutral', target:['es2018'], outfile:path.join(root,'game/dist/main.js'), minify:true, sourcemap:false, legalComments:'none' });
  await esbuild.build({ entryPoints:[path.join(root,'game/src/main.js')], bundle:true, platform:'browser', target:['es2018'], outfile:path.join(root,'artifacts/web/main.js'), sourcemap:true });
  fs.rmSync(path.join(root,'artifacts/web/assets'),{recursive:true,force:true});
  fs.cpSync(path.join(root,'game/assets'),path.join(root,'artifacts/web/assets'),{recursive:true});
  buildPhotoPacks();
  fs.copyFileSync(path.join(root,'scripts/preview.html'),path.join(root,'artifacts/web/index.html'));
  fs.rmSync(path.join(root,'cloudfunctions/gameApi/shared'),{recursive:true,force:true});
  fs.cpSync(path.join(root,'shared'),path.join(root,'cloudfunctions/gameApi/shared'),{recursive:true});
  console.log('小游戏、浏览器验收包及云端共享规则已构建。');
}
build().catch(e=>{console.error(e);process.exitCode=1;});
