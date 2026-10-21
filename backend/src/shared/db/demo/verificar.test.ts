import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'oracledb';
import {
  conexionSinEscrituras,
  opcionesVerificacion,
  registrar,
  type InformeVerificacion,
} from './verificar.service.js';

describe('Verificador demo y barrera de escrituras', () => {
  it('rechaza banderas de borrado o instalación y separa el destino remoto', () => {
    expect(opcionesVerificacion(['--remote', '--check-idempotency', '--with-extras'])).toEqual({
      remoto: true,
      idempotencia: true,
      extras: true,
    });
    for (const flag of ['--reset-demo', '--apply-schema', '--desconocida'])
      expect(() => opcionesVerificacion([flag])).toThrow('Opciones admitidas');
  });
  it('consulta la conexión real y conserva el receptor de sus métodos', async () => {
    const resultado = { rows: [[32]] };
    const execute = vi.fn(function (this: unknown) {
      expect(this).toBe(original);
      return Promise.resolve(resultado);
    });
    const original = { execute };
    const c = conexionSinEscrituras(original as unknown as Connection);
    expect(await c.execute('SELECT COUNT(*) FROM EMPLEADOS')).toBe(resultado);
    expect(await c.execute('LOCK TABLE PERIODOS_NOMINA IN SHARE MODE')).toBe(resultado);
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('rechaza DML, DDL y PL/SQL antes de enviarlos a Oracle', () => {
    const execute = vi.fn();
    const c = conexionSinEscrituras({ execute } as unknown as Connection);
    for (const sql of [
      'INSERT INTO X VALUES(1)',
      'UPDATE X SET A=1',
      'DELETE FROM X',
      'MERGE INTO X USING Y ON (1=1)',
      'BEGIN NULL; END;',
      'CREATE TABLE X(A NUMBER)',
      'WITH X AS(SELECT 1 FROM DUAL) DELETE FROM X',
    ])
      expect(() => c.execute(sql)).toThrow('intentó escribir');
    expect(() => c.commit()).toThrow();
    expect(() => c.rollback()).toThrow();
    expect(() => c.executeMany('INSERT INTO X VALUES(:v)', [])).toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it('un error queda en el informe con claves lógicas y conserva el fallo global', () => {
    const informe: InformeVerificacion = {
      ok: true,
      conjunto: 'demo',
      fecha: '2026-10-20',
      conteos: {},
      comprobaciones: [],
    };
    registrar(informe, 'FECHAS', false, 'Fechas incoherentes.', ['persona-001']);
    registrar(informe, 'OTRO', true, 'Otra comprobación correcta.');
    expect(informe.ok).toBe(false);
    expect(informe.comprobaciones[0]?.claves).toEqual(['persona-001']);
  });
});
