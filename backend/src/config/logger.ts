import pino from 'pino';

export function crearLogger(nivel = 'info') {
  return pino({
    level: nivel,
    base: { servicio: 'nomina2-api' },
    redact: [
      'password',
      'DB_PASSWORD',
      'ORACLE_PASSWORD',
      'ADMIN_PASSWORD',
      'token',
      'authorization',
      'cookie',
    ],
    // Los errores de Oracle pueden incluir SQL o datos sensibles en el mensaje.
    serializers: {
      err: (error: unknown) => {
        if (!(error instanceof Error)) return { tipo: 'ErrorDesconocido' };
        return {
          tipo: error.name,
          codigo: 'code' in error ? String(error.code) : undefined,
          numero: 'errorNum' in error ? Number(error.errorNum) : undefined,
        };
      },
    },
  });
}
