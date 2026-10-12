import process from 'node:process';

if (process.env.NODE_ENV === 'production') {
  await import('../dist/shared/db/migrate-cli.js');
} else {
  const { tsImport } = await import('tsx/esm/api');
  await tsImport('../src/shared/db/migrate-cli.ts', import.meta.url);
}
