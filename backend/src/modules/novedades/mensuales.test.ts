import { describe, it, expect } from 'vitest';
import { rangoMes, validarMes, calcularAusencia, exigirEditable } from './mensuales.service.js';
import { validarCambioParqueo } from './parqueo.service.js';
import { calcularHoraExtra } from './novedades.reglas.js';
import { schemas } from './novedades.schemas.js';
import { crearSchema, resolverSchema } from '../solicitudes/solicitudes.schemas.js';
import { tarifaSchema } from './parqueo.schemas.js';
describe('V1-9: reglas mensuales independientes', () => {
  it.each([
    ['8', '93.75'],
    ['7', '107.14'],
    ['6', '125.00'],
    ['4', '187.50'],
  ])('valora 3 medias horas de salario 10000 con jornada %s', (jornada, total) =>
    expect(calcularHoraExtra('10000', '1.5', '30', jornada, '50').monto).toBe(total),
  );
  it('resta 3 días sin goce y conserva con goce, con redondeo al final', () => {
    expect(calcularAusencia('10000', 3, true)).toBe('1000.00');
    expect(calcularAusencia('10000', 3, false)).toBe('0.00');
    expect(calcularAusencia('1000', 2, true)).toBe('66.67');
  });
  it('resuelve meses completos, febrero bisiesto y diciembre', () => {
    expect(rangoMes('2028-02')).toEqual({ inicio: '2028-02-01', fin: '2028-02-29' });
    expect(rangoMes('2026-12').fin).toBe('2026-12-31');
    expect(() => rangoMes('2026-13')).toThrow();
  });
  it('rechaza mes futuro, admite mes anterior y actual', () => {
    expect(() => validarMes('2026-11', '2026-10-15')).toThrow();
    expect(validarMes('2026-10', '2026-10-01').inicio).toBe('2026-10-01');
    expect(() => validarMes('2026-09', '2026-10-15')).not.toThrow();
  });
  it.each(['0.5', '1', '1.5', '40.5', '150'])('admite cantidad mensual %s', (horas) =>
    expect(
      schemas['horas-extra'].safeParse({
        idEmpleado: 1,
        mes: '2026-10',
        horas,
        motivo: 'Horas del mes',
      }).success,
    ).toBe(true),
  );
  it.each(['0', '0.25', '1.33', '-1', 'abc'])('bloquea cantidad %s', (horas) =>
    expect(
      schemas['horas-extra'].safeParse({
        idEmpleado: 1,
        mes: '2026-10',
        horas,
        motivo: 'Horas del mes',
      }).success,
    ).toBe(false),
  );
  it('no acepta fecha ni estado de aplicación enviados por cliente', () => {
    expect(
      schemas['horas-extra'].safeParse({
        idEmpleado: 1,
        mes: '2026-10',
        fecha: '2026-10-01',
        horas: '2',
        motivo: 'Horas del mes',
      }).success,
    ).toBe(false);
    expect(
      schemas.comisiones.safeParse({
        idEmpleado: 1,
        mes: '2026-10',
        monto: '100',
        referencia: 'REF',
        motivo: 'Comisiones reales',
        estado: 'APLICADA',
      }).success,
    ).toBe(false);
  });
  it('protege aplicada, cerrado y anulado, y permite pendiente abierto', () => {
    for (const args of [
      ['APLICADA', 0, 1],
      ['PENDIENTE', 1, 1],
      ['PENDIENTE', 0, 0],
    ] as const)
      expect(() => exigirEditable(args[0], args[1], args[2])).toThrow();
    expect(() => exigirEditable('PENDIENTE', 0, 1)).not.toThrow();
  });
  it('alta activa permite baja y suspensión; repetición y estados finales se bloquean', () => {
    for (const accion of ['BAJA', 'SUSPENDER', 'SOLICITAR_BAJA'])
      expect(() => validarCambioParqueo('ACTIVA', accion, false)).not.toThrow();
    expect(() => validarCambioParqueo('ACTIVA', 'SOLICITAR_BAJA', true)).toThrow();
    for (const estado of ['BAJA', 'SUSPENDIDA'])
      expect(() => validarCambioParqueo(estado, 'BAJA', false)).toThrow();
  });
  it('pide vehículo en solicitud, placa opcional y tarifa configurada fuera de resolver', () => {
    expect(crearSchema.safeParse({ tipo: 'PARQUEO', confirmado: true }).success).toBe(false);
    expect(
      crearSchema.safeParse({ tipo: 'PARQUEO', vehiculo: 'MOTO', confirmado: true }).success,
    ).toBe(true);
    expect(
      resolverSchema.safeParse({ estado: 'APROBADA', parqueo: { monto: '1' }, confirmado: true })
        .success,
    ).toBe(false);
    expect(
      tarifaSchema.safeParse({
        vehiculo: 'CARRO',
        monto: '100',
        mes: '2026-10',
        motivo: 'Tarifa real',
        confirmado: true,
      }).success,
    ).toBe(true);
  });
});
