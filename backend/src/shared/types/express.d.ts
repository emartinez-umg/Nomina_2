import type { Autenticacion } from '../../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      autenticacion?: Autenticacion;
    }
  }
}
