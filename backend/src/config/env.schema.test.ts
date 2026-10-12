import { describe, expect, it } from 'vitest';
import { validarEntorno } from './env.schema.js';

const valido = {
  DB_USER: 'NOMINA2',
  DB_PASSWORD: 'clave-solo-pruebas',
  DB_CONNECT_STRING: 'db/XEPDB1',
};

describe('configuración de entorno', () => {
  it('convierte números y completa valores no sensibles', () => {
    const config = validarEntorno({ ...valido, PORT: '4000' });
    expect(config.PORT).toBe(4000);
    expect(config.TZ).toBe('America/Guatemala');
    expect(config.DB_POOL_MAX).toBe(5);
  });

  it.each(['SYS', 'system'])('rechaza el usuario privilegiado %s', (DB_USER) => {
    expect(() => validarEntorno({ ...valido, DB_USER })).toThrow('DB_USER');
  });

  it.each(['0', '65536', 'texto', '1.5'])('rechaza el puerto %s', (PORT) => {
    expect(() => validarEntorno({ ...valido, PORT })).toThrow('PORT');
  });

  it('rechaza pools incoherentes', () => {
    expect(() => validarEntorno({ ...valido, DB_POOL_MIN: '6', DB_POOL_MAX: '5' })).toThrow(
      'DB_POOL_MIN',
    );
    expect(() => validarEntorno({ ...valido, DB_POOL_INCREMENT: '6' })).toThrow(
      'DB_POOL_INCREMENT',
    );
  });

  it('no incluye secretos en el diagnóstico de variables inválidas', () => {
    expect(() => validarEntorno({ ...valido, DB_PASSWORD: 'secreto' })).toThrow('DB_PASSWORD');
    expect(() => validarEntorno({ ...valido, DB_PASSWORD: 'secreto' })).not.toThrow('secreto');
    expect(() => validarEntorno({})).toThrow('DB_CONNECT_STRING');
  });

  it('rechaza claves que excedan el límite de Oracle XE', () => {
    expect(() => validarEntorno({ ...valido, DB_PASSWORD: 'a'.repeat(31) })).toThrow('DB_PASSWORD');
  });
});
