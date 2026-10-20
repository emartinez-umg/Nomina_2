import { tsImport } from 'tsx/esm/api';

const { ejecutarCli } = await tsImport('../backend/src/shared/db/demo/cli.ts', import.meta.url);
await ejecutarCli('remoto');
