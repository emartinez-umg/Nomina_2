import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { validarEntorno } from './env.schema.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

export const config = validarEntorno(process.env);
process.env.TZ = config.TZ;
