import { describe, it, expect } from 'vitest';
import {
  crearEmpleadoSchema,
  editarEmpleadoSchema,
  erroresFechas,
  nitValido,
  dinero,
  querySchema,
  selectorEmpleadosSchema,
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
  idDepartamentoGt: 1,
  idMunicipioGt: 1,
  zona: 1,
  direccion: '12-A',
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
  idBanco: 1,
  cuentaBancaria: '12345678',
  tipoCuenta: 'AHORRO',
  contactoNombre: 'Contacto Familiar',
  contactoParentesco: 'Hermano/a',
  contactoTelefono: '55554321',
  estado: 'ACTIVO',
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
    { nit: '1234' },
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
  it.each([
    ['1234567-9', true],
    ['6-K', true],
    ['123456-0', true],
    ['1234567-4', false],
    ['6-0', false],
    ['6-1', false],
    ['0-0', false],
    ['12-K', false],
  ])('módulo 11: %s válido=%s', (nit, valid) => expect(nitValido(nit)).toBe(valid));
  it.each([
    { sexo: 'O' },
    { direccion: '12 !' },
    { zona: 26 },
    { zona: 1.5 },
    { fechaFinContrato: '2026-10-12' },
  ])('V1-7: rechaza %j', (c) =>
    expect(crearEmpleadoSchema.safeParse({ ...fixture, ...c }).success).toBe(false),
  );
  it('exige banco, cuenta y tipo juntos y fin de contrato coherente', () => {
    expect(crearEmpleadoSchema.safeParse({ ...fixture, cuentaBancaria: null }).success).toBe(false);
    expect(
      crearEmpleadoSchema.safeParse({ ...fixture, fechaFinContrato: '2026-01-01' }).success,
    ).toBe(false);
  });
  it('permite salario inicial en edición y rechaza campos de usuario', () => {
    expect(
      editarEmpleadoSchema.safeParse({ ...fixture, motivo: 'Corrección real', usuario: 'otro' })
        .success,
    ).toBe(false);
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
  it('la plantilla contiene una fila ilustrativa válida con 30 columnas y sin código manual', () => {
    const filas = leerCsv(plantillaCsv());
    expect(filas).toHaveLength(1);
    expect(filas[0]?.errores).toEqual({});
    expect(columnasCsv).toHaveLength(30);
  });
  it('lee UTF-8 BOM, comillas escapadas, comas y saltos de línea', () => {
    const valores = columnasCsv.map((k) =>
      k === 'codigoHorario' ? 'LAV' : (fixture[k as keyof typeof fixture] ?? ''),
    );
    valores[columnasCsv.indexOf('contactoNombre')] = 'Persona, casa "A"';
    const filas = leerCsv(escribirCsv([Array.from(columnasCsv), valores]));
    expect(filas[0]?.datos.contactoNombre).toBe('Persona, casa "A"');
  });
  it('informa errores por fila, incluidos tipos y columnas sobrantes', () => {
    const csv = escribirCsv([
      Array.from(columnasCsv),
      columnasCsv.map((k) =>
        k === 'salarioBase'
          ? 'invalido'
          : k === 'codigoHorario'
            ? 'LAV'
            : fixture[k as keyof typeof fixture],
      ),
    ]);
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
        Array.from({ length: 101 }, () => Array.from({ length: 30 }, () => 'x').join(',')).join(
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

describe('R2-6: datos opcionales y Dirección', () => {
  const minimo = {
    ...fixture,
    salarioBase: null,
    idBanco: null,
    cuentaBancaria: null,
    tipoCuenta: null,
    contactoNombre: null,
    contactoParentesco: null,
    contactoTelefono: null,
  };
  it('guarda solo pasos 1 y 2 sin fabricar salario ni contacto', () => {
    expect(crearEmpleadoSchema.parse(minimo).salarioBase).toBeNull();
    const omitido = Object.fromEntries(
      Object.entries(minimo).filter(
        ([key]) =>
          ![
            'salarioBase',
            'idBanco',
            'cuentaBancaria',
            'tipoCuenta',
            'contactoNombre',
            'contactoParentesco',
            'contactoTelefono',
          ].includes(key),
      ),
    );
    expect(crearEmpleadoSchema.parse(omitido)).toMatchObject({
      salarioBase: null,
      idBanco: null,
      contactoNombre: null,
    });
    const edicion = { ...minimo };
    delete (edicion as { salarioBase?: null }).salarioBase;
    expect(
      editarEmpleadoSchema.safeParse({ ...edicion, motivo: 'Completar después' }).success,
    ).toBe(true);
  });
  it.each([
    'salarioBase',
    'idBanco',
    'cuentaBancaria',
    'tipoCuenta',
    'contactoNombre',
    'contactoParentesco',
    'contactoTelefono',
  ] as const)('rechaza grupo parcial con %s', (key) => {
    expect(crearEmpleadoSchema.safeParse({ ...minimo, [key]: fixture[key] }).success).toBe(false);
  });
  it.each(['Colonia Peña, 2.ª calle #4-12 / 3°', 'Avenida Ñandú 12-A', '123', 'Á'.repeat(100)])(
    'acepta Dirección %s',
    (direccion) => {
      // El ordinal ª no es puntuación: es una letra Unicode.
      expect(crearEmpleadoSchema.safeParse({ ...minimo, direccion }).success).toBe(true);
    },
  );
  it.each(['', ' .,#-/° ', 'Casa@12', 'Casa\\12', 'Casa\n12', 'a'.repeat(101)])(
    'rechaza Dirección %s',
    (direccion) =>
      expect(crearEmpleadoSchema.safeParse({ ...minimo, direccion }).success).toBe(false),
  );
  it.each(['12345', '1234-5', '123456789012', '123456789012K', '12345-k', '1234567-4'])(
    'acepta formato NIT relajado %s',
    (nit) => expect(crearEmpleadoSchema.safeParse({ ...minimo, nit }).success).toBe(true),
  );
  it.each(['1234', '1234567890123', '1234K', '123-45', 'K12345', '12345KK'])(
    'rechaza formato NIT %s',
    (nit) => expect(crearEmpleadoSchema.safeParse({ ...minimo, nit }).success).toBe(false),
  );
  it('normaliza guion y K para conservar unicidad', () =>
    expect(crearEmpleadoSchema.parse({ ...minimo, nit: '10003k' }).nit).toBe('10003-K'));
});

describe('R2-7: consultas del selector', () => {
  it('usa activos por defecto y permite filtros históricos explícitos', () => {
    expect(selectorEmpleadosSchema.parse({})).toMatchObject({
      soloActivos: true,
      limite: 50,
      pagina: 1,
    });
    expect(
      selectorEmpleadosSchema.parse({ departamentoId: '7', soloActivos: 'false' }),
    ).toMatchObject({ departamentoId: 7, soloActivos: false });
  });
  it.each([
    { departamentoId: '1 OR 1=1' },
    { pagina: '0' },
    { limite: '101' },
    { soloActivos: 'yes' },
    { usuarioId: '1' },
  ])('rechaza filtros no autorizados %j', (q) => {
    expect(selectorEmpleadosSchema.safeParse(q).success).toBe(false);
  });
});
