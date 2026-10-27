import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const builds = ['js', 'css'].map(extension => ({
  absWorkingDir: root,
  entryPoints: [`./leaflet-pegman.${extension}`],
  outfile: `leaflet-pegman.min.${extension}`,
  minify: true,
}));

export async function build({ watch = false } = {}) {
  if (!watch) {
    await Promise.all(builds.map(options => esbuild.build(options)));
    return;
  }
  const contexts = await Promise.all(builds.map(options => esbuild.context(options)));
  try {
    await Promise.all(contexts.map(context => context.rebuild()));
    await Promise.all(contexts.map(context => context.watch()));
  } catch (error) {
    await Promise.all(contexts.map(context => context.dispose()));
    throw error;
  }
  return () => Promise.all(contexts.map(context => context.dispose()));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await build();
}
