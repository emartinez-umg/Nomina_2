import { describe, it, expect } from 'vitest';
import {
  crearEmpleadoSchema,
  editarEmpleadoSchema,
  erroresFechas,
  nitValido,
  dinero,
  querySchema,
} from './empleados.schemas.js';
import { leerCsv, plantillaCsv, columnasCsv, escribirCsv } from './empleados.csv.js';
const fixture = {
  codigo: 'EMP_001',
  nombres: 'Ana',
  apellidos: 'Lopez',
  dpi: '1234567890123',
  nit: '1234567-9',
  afiliacionIgss: null,
  fechaNacimiento: '1995-05-15',
  sexo: 'F',
  estadoCivil: 'SOLTERO',
  direccion: 'Dirección del empleado',
  telefono: '55551234',
  correo: 'ana@example.test',
  idDepartamento: 1,
  idPuesto: 1,
  idJefatura: null,
  idTipoContrato: 1,
  idCentroTrabajo: 1,
  idHorario: 1,
  fechaIngreso: '2026-10-12',
  fechaFinContrato: null,
  salarioBase: '5000.00',
  idBanco: null,
  cuentaBancaria: null,
  tipoCuenta: null,
  contactoNombre: 'Contacto Familiar',
  contactoParentesco: 'Hermana',
  contactoTelefono: '55554321',
  estado: 'ACTIVO',
  generarUsuario: true,
};
const reglas = { hoy: '2026-10-12', edadMinima: 18, edadMaxima: 75, ultimoCierre: null };
describe('Empleados: validación y CSV', () => {
  it('valida y normaliza correo y dinero sin perder centavos', () => {
    const r = crearEmpleadoSchema.parse({
      ...fixture,
      correo: ' ANA@EXAMPLE.TEST ',
      salarioBase: '9999999999.99',
    });
    expect(r.correo).toBe('ana@example.test');
    expect(r.salarioBase).toBe('9999999999.99');
  });
  it.each([
    { dpi: '123' },
    { nit: '1234567-4' },
    { telefono: '5555 1234' },
    { correo: 'no-es-correo' },
    { afiliacionIgss: '12A' },
    { salarioBase: 'NaN' },
    { salarioBase: '-1' },
    { salarioBase: '0' },
    { salarioBase: '1.001' },
    { salarioBase: '10000000000.00' },
    { fechaNacimiento: '2025-02-29' },
    { idDepartamento: 0 },
    { nombres: 'Ana12' },
  ])('rechaza dato inválido %j', (c) =>
    expect(crearEmpleadoSchema.safeParse({ ...fixture, ...c }).success).toBe(false),
  );
  it('verifica NIT con K y rechaza cero y formatos ambiguos', () => {
    expect(nitValido('1234567-9')).toBe(true);
    expect(nitValido('6-K')).toBe(true);
    for (const v of ['0-0', '1234567--0', '12345670', 'ABC-K']) expect(nitValido(v)).toBe(false);
  });
  it('exige banco, cuenta y tipo juntos y fin de contrato coherente', () => {
    expect(crearEmpleadoSchema.safeParse({ ...fixture, idBanco: 1 }).success).toBe(false);
    expect(
      crearEmpleadoSchema.safeParse({ ...fixture, fechaFinContrato: '2026-01-01' }).success,
    ).toBe(false);
  });
  it('no permite modificar salario ni usuario mediante el endpoint de edición', () => {
    expect(editarEmpleadoSchema.safeParse({ ...fixture, motivo: 'Corrección real' }).success).toBe(
      false,
    );
  });
  it('respeta límites exactos de edad, ingreso y 30 días futuros', () => {
    expect(erroresFechas({ ...fixture, fechaNacimiento: '2008-10-12' }, reglas)).toEqual({});
    expect(erroresFechas({ ...fixture, fechaNacimiento: '2008-10-13' }, reglas)).toHaveProperty(
      'fechaNacimiento',
    );
    expect(erroresFechas({ ...fixture, fechaNacimiento: '1950-10-12' }, reglas)).toHaveProperty(
      'fechaNacimiento',
    );
    expect(erroresFechas({ ...fixture, fechaNacimiento: '1950-10-13' }, reglas)).toEqual({});
    expect(erroresFechas({ ...fixture, fechaNacimiento: '2027-01-01' }, reglas)).toHaveProperty(
      'fechaNacimiento',
    );
    expect(erroresFechas({ ...fixture, fechaIngreso: '2010-01-01' }, reglas)).toHaveProperty(
      'fechaIngreso',
    );
    expect(erroresFechas({ ...fixture, fechaIngreso: '2026-11-11' }, reglas)).toEqual({});
    expect(erroresFechas({ ...fixture, fechaIngreso: '2026-11-12' }, reglas)).toHaveProperty(
      'fechaIngreso',
    );
  });
  it('rechaza orden no permitido, filtros desconocidos y rangos invertidos', () => {
    for (const q of [
      { ordenarPor: 'SALARIO DESC;DROP TABLE X' },
      { secreto: '1' },
      { salarioMin: '5000', salarioMax: '4000' },
      { ingresoDesde: '2026-11-01', ingresoHasta: '2026-10-01' },
    ])
      expect(querySchema.safeParse(q).success).toBe(false);
  });
  it('un monto no numérico produce validación, sin excepción Decimal', () => {
    expect(() => dinero.safeParse('mal')).not.toThrow();
    expect(dinero.safeParse('mal').success).toBe(false);
  });
  it('la plantilla contiene una fila ilustrativa válida con 28 columnas y sin código manual', () => {
    const filas = leerCsv(plantillaCsv());
    expect(filas).toHaveLength(1);
    expect(filas[0]?.errores).toEqual({});
    expect(columnasCsv).toHaveLength(28);
  });
  it('lee UTF-8 BOM, comillas escapadas, comas y saltos de línea', () => {
    const valores = columnasCsv.map((k) => fixture[k as keyof typeof fixture] ?? '');
    valores[columnasCsv.indexOf('direccion')] = 'Calle, casa "A"';
    const filas = leerCsv(escribirCsv([Array.from(columnasCsv), valores]));
    expect(filas[0]?.datos.direccion).toBe('Calle, casa "A"');
  });
  it('informa errores por fila, incluidos tipos y columnas sobrantes', () => {
    const csv = plantillaCsv().replace('5000.00', 'invalido');
    expect(leerCsv(csv)[0]?.errores).toHaveProperty('salarioBase');
    expect(leerCsv(plantillaCsv() + ',extra')[0]?.errores).toHaveProperty('csv');
  });
  it('rechaza cabecera alterada, archivo vacío, comillas rotas y exceso de filas', () => {
    for (const csv of [
      '',
      plantillaCsv().replace('nombres', 'clave'),
      plantillaCsv() + '"',
      columnasCsv.join(',') +
        '\n' +
        Array.from({ length: 101 }, () => Array.from({ length: 28 }, () => 'x').join(',')).join(
          '\n',
        ),
    ])
      expect(() => leerCsv(csv)).toThrow();
  });
  it('neutraliza fórmulas de hojas de cálculo al exportar', () =>
    expect(escribirCsv([[' =HYPERLINK("x")', '+SUM(1)', '@cmd']])).toContain(
      '"\' =HYPERLINK(""x"")"',
    ));
});
