import { tsImport } from 'tsx/esm/api';

// El ejecutable JavaScript reutiliza validadores y repositorios TypeScript de la aplicación.
const { ejecutarCli } = await tsImport('../backend/src/shared/db/demo/cli.ts', import.meta.url);
await ejecutarCli();
