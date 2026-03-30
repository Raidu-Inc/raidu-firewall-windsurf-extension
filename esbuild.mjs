import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const shared = { bundle: true, format: 'cjs', platform: 'node', target: 'node18', sourcemap: false, minify: !isWatch };

async function build() {
  if (isWatch) {
    const ext = await esbuild.context({ ...shared, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', external: ['vscode'] });
    const hook = await esbuild.context({ ...shared, entryPoints: ['hooks/src/index.ts'], outfile: 'hooks/dist/index.js' });
    await ext.watch();
    await hook.watch();
    console.log('[esbuild] Watching...');
  } else {
    await esbuild.build({ ...shared, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', external: ['vscode'] });
    await esbuild.build({ ...shared, entryPoints: ['hooks/src/index.ts'], outfile: 'hooks/dist/index.js' });
    console.log('[esbuild] Built: dist/extension.js + hooks/dist/index.js');
  }
}

build().catch((err) => { console.error(err); process.exit(1); });
