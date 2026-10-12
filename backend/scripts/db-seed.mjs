import process from 'node:process';

if (process.env.NODE_ENV === 'production') {
  await import('../dist/shared/db/seed-cli.js');
} else {
  const { tsImport } = await import('tsx/esm/api');
  await tsImport('../src/shared/db/seed-cli.ts', import.meta.url);
}
