import { z } from 'zod';
import { fuentesAnios } from '../../shared/presentacion/calendario.js';
export type { FuenteAnios } from '../../shared/presentacion/calendario.js';
export const fuenteSchema = z.enum(fuentesAnios);
export const rangoAniosSchema = z.object({ fuente: fuenteSchema }).strict();
