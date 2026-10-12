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

describe('configuración de seguridad', () => {
  it('inactividad de 30 min, límite de 30 y ningún proxy confiable por defecto', () => {
    const config = validarEntorno(valido);
    expect(config.SESSION_IDLE_MINUTES).toBe(30);
    expect(config.LOGIN_RATE_LIMIT).toBe(30);
    expect(config.TRUST_PROXY_CIDRS).toBe('');
  });
  it.each(['0', '1441', 'texto'])('rechaza inactividad inválida %s', (SESSION_IDLE_MINUTES) => {
    expect(() => validarEntorno({ ...valido, SESSION_IDLE_MINUTES })).toThrow(
      'SESSION_IDLE_MINUTES',
    );
  });
  it.each(['true', '*', '0.0.0.0/33', '127.0.0.1/abc', '::1/129'])(
    'rechaza configuración de proxy inválida %s',
    (TRUST_PROXY_CIDRS) => {
      expect(() => validarEntorno({ ...valido, TRUST_PROXY_CIDRS })).toThrow('TRUST_PROXY_CIDRS');
    },
  );
  it('acepta IPs y rangos CIDR explícitos', () => {
    expect(
      validarEntorno({ ...valido, TRUST_PROXY_CIDRS: '127.0.0.1, ::1/128, 172.20.0.0/24' })
        .TRUST_PROXY_CIDRS,
    ).toContain('::1/128');
  });
});
