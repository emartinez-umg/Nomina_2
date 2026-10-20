import { tsImport } from 'tsx/esm/api';

const { exportarCli } = await tsImport(
  '../backend/src/shared/db/demo/exportar.ts',
  import.meta.url,
);
await exportarCli();
