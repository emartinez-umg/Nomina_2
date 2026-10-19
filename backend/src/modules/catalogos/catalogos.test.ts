import { describe, expect, it } from 'vitest';
import { obtenerCatalogo } from './catalogos.definiciones.js';
import { entradaSchema, querySchema, diaSchema } from './catalogos.schemas.js';
const schema = (slug: string) => entradaSchema(obtenerCatalogo(slug)!);
const base = { codigo: 'PRUEBA', nombre: 'Registro de prueba', descripcion: null };
const legal = {
  codigo: 'TASA_PRUEBA',
  nombre: 'Tasa de prueba',
  valor: '4.83',
  unidad: 'PORCENTAJE',
  vigenteDesde: '2027-01-01',
  vigenteHasta: null,
  fundamento: 'Referencia de prueba',
  motivo: 'Prueba de cambio',
  confirmado: true,
};
describe('Validación de catálogos', () => {
  it('R2-4: rechaza nombres inválidos y normaliza espacios también al editar', () => {
    for (const nombre of ['   ', 'A', '123456', '/*%$#&/@#^', 'Ventas!', 'Área <script>'])
      expect(schema('departamentos').safeParse({ ...base, nombre }).success, nombre).toBe(false);
    expect(
      schema('departamentos').parse({ ...base, nombre: '  Área   de  Ingeniería  ' }).nombre,
    ).toBe('Área de Ingeniería');
  });
  it('exige rangos salariales completos y ordenados con precisión decimal', () => {
    const puesto = {
      ...base,
      idDepartamento: 1,
      salarioMinimo: '1234.56',
      salarioMaximo: '1234.57',
    };
    expect(schema('puestos').safeParse(puesto).success).toBe(true);
    expect(schema('puestos').safeParse({ ...puesto, salarioMaximo: '1234.55' }).success).toBe(
      false,
    );
    expect(schema('puestos').safeParse({ ...puesto, salarioMinimo: null }).success).toBe(false);
    expect(schema('puestos').safeParse({ ...puesto, salarioMinimo: 1234.56 }).success).toBe(false);
  });
  it('rechaza porcentajes fuera de rango, NaN, texto y precisión excesiva sin lanzar excepciones', () => {
    for (const valor of ['101', 'NaN', 'abc', '1e10', '0.1234567', '-1'])
      expect(schema('parametros-legales').safeParse({ ...legal, valor }).success).toBe(false);
  });
  it('exige confirmación, motivo y fechas reales coherentes', () => {
    for (const cambio of [
      { confirmado: false },
      { motivo: '' },
      { vigenteDesde: '2027-02-30' },
      { vigenteHasta: '2026-12-31' },
    ])
      expect(schema('parametros-legales').safeParse({ ...legal, ...cambio }).success).toBe(false);
  });
  it('valida límites de tramos y tasa hasta cuatro decimales', () => {
    const tramo = {
      limiteInferior: '300000.00',
      limiteSuperior: null,
      tasaPorcentaje: '7.0000',
      cuotaFija: '15000.00',
      vigenteDesde: '2027-01-01',
      vigenteHasta: null,
      motivo: 'Prueba ISR',
      confirmado: true,
    };
    expect(schema('tramos-isr').safeParse(tramo).success).toBe(true);
    for (const cambio of [
      { limiteSuperior: '300000.00' },
      { tasaPorcentaje: '100.0001' },
      { tasaPorcentaje: '0.00001' },
    ])
      expect(schema('tramos-isr').safeParse({ ...tramo, ...cambio }).success).toBe(false);
  });
  it('acepta jornadas variables y cruce nocturno; rechaza días repetidos, vacío y descanso excesivo', () => {
    const dias = Array.from({ length: 7 }, (_, i) => ({
      diaSemana: i + 1,
      laborable: i < 5,
      entrada: i < 5 ? '08:00' : null,
      salida: i < 5 ? (i === 4 ? '14:00' : '17:00') : null,
      cruzaMedianoche: false,
      minutosDescanso: i < 4 ? 60 : 0,
    }));
    const bloques = dias
      .filter((d) => d.laborable)
      .map((d) => ({
        dias: [d.diaSemana],
        entrada: d.entrada!,
        salida: d.salida!,
        cruzaMedianoche: d.cruzaMedianoche,
        minutosDescanso: 60,
      }));
    const horario = { ...base, jornada: 'DIURNA', bloques };
    expect(schema('horarios').safeParse(horario).success).toBe(true);
    expect(
      schema('horarios').safeParse({
        ...horario,
        bloques: bloques.map((b) => ({ ...b, dias: [1, 1] })),
      }).success,
    ).toBe(false);
    expect(
      diaSchema.safeParse({ ...dias[0], entrada: '22:00', salida: '05:00', cruzaMedianoche: true })
        .success,
    ).toBe(true);
    expect(diaSchema.safeParse({ ...dias[0], minutosDescanso: 540 }).success).toBe(false);
    expect(diaSchema.safeParse({ ...dias[0], entrada: '25:00' }).success).toBe(false);
  });
  it('valida franjas y ámbito de feriados', () => {
    const feriado = {
      codigo: 'FERIADO',
      nombre: 'Descanso',
      fecha: '2027-01-01',
      fechaConmemoracion: '2027-01-01',
      ambito: 'NACIONAL',
      localidad: '*',
      minutoInicio: 720,
      minutoFin: 1440,
      fundamento: 'Norma de referencia',
    };
    expect(schema('feriados').safeParse(feriado).success).toBe(true);
    for (const cambio of [{ localidad: 'CIUDAD' }, { minutoFin: 720 }, { fecha: '2027-02-29' }])
      expect(schema('feriados').safeParse({ ...feriado, ...cambio }).success).toBe(false);
  });
  it('rechaza campos, órdenes y rangos de filtro fuera de la lista blanca', () => {
    const q = querySchema(obtenerCatalogo('puestos')!);
    expect(
      q.safeParse({ idDepartamento: '1', salarioMinimoMin: '1234.56', salarioMaximoMax: '6000.00' })
        .success,
    ).toBe(true);
    for (const v of [
      { sql: 'SELECT' },
      { ordenarPor: 'CONTRASENA_HASH' },
      { salarioMinimoMin: 'abc' },
      { salarioMinimoMin: '3', salarioMinimoMax: '2' },
      { pagina: '-1' },
    ])
      expect(q.safeParse(v).success).toBe(false);
  });
});
