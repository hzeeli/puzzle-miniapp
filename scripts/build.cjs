const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
async function build() {
  await esbuild.build({ entryPoints:[path.join(root,'game/src/main.js')], bundle:true, platform:'neutral', target:['es2018'], outfile:path.join(root,'game/dist/main.js'), minify:true, sourcemap:false, legalComments:'none' });
  await esbuild.build({ entryPoints:[path.join(root,'game/src/main.js')], bundle:true, platform:'browser', target:['es2018'], outfile:path.join(root,'artifacts/web/main.js'), sourcemap:true });
  fs.rmSync(path.join(root,'artifacts/web/assets'),{recursive:true,force:true});
  fs.cpSync(path.join(root,'game/assets'),path.join(root,'artifacts/web/assets'),{recursive:true});
  fs.copyFileSync(path.join(root,'scripts/preview.html'),path.join(root,'artifacts/web/index.html'));
  fs.rmSync(path.join(root,'cloudfunctions/gameApi/shared'),{recursive:true,force:true});
  fs.cpSync(path.join(root,'shared'),path.join(root,'cloudfunctions/gameApi/shared'),{recursive:true});
  console.log('小游戏、浏览器验收包及云端共享规则已构建。');
}
build().catch(e=>{console.error(e);process.exitCode=1;});
