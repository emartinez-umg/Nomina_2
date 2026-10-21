import { tsImport } from 'tsx/esm/api';

const { verificarCli } = await tsImport(
  '../backend/src/shared/db/demo/verificar.cli.ts',
  import.meta.url,
);
await verificarCli();
