import { readFileSync } from 'node:fs';
import type { Entrada, Parametro, Concepto } from './nomina.types.js';
// Exclusivo de pruebas: mismos valores de referencia que los seeds, sin cargar datos en producción.
export function entradaPrueba(salario = '3000'): Entrada {
  const sql = readFileSync(
    new URL('../../../../db/seeds/S002__parametros_legales.sql', import.meta.url),
    'utf8',
  );
  const parametros: Parametro[] = [
    ...sql.matchAll(/SELECT '([^']+)' CODIGO, '[^']+' NOMBRE, ([\d.]+) VALOR, '([^']+)' UNIDAD/g),
  ].map((m, i) => ({
    id: i + 1,
    codigo: m[1]!,
    valor: m[2]!,
    unidad: m[3]!,
    desde: '2026-01-01',
    hasta: null,
  }));
  const conceptosSql = readFileSync(
    new URL('../../../../db/seeds/S001__catalogos.sql', import.meta.url),
    'utf8',
  );
  const conceptos: Concepto[] = [
    ...conceptosSql.matchAll(
      /SELECT '([^']+)' CODIGO, '([^']+)' NOMBRE, '(INGRESO|DESCUENTO|PATRONAL)' NATURALEZA, (\d) AFECTA_IGSS, (\d) AFECTA_ISR, (\d) AFECTA_PRESTACIONES/g,
    ),
  ].map((m, i) => ({
    id: i + 1,
    codigo: m[1]!,
    nombre: m[2]!,
    naturaleza: m[3] as Concepto['naturaleza'],
    igss: Number(m[4]),
    isr: Number(m[5]),
    prestaciones: Number(m[6]),
    desde: '2026-01-01',
    hasta: null,
  }));
  conceptos.push({
    id: conceptos.length + 1,
    codigo: 'ISR_DEVOLUCION',
    nombre: 'Devolución ISR retenido en exceso',
    naturaleza: 'INGRESO',
    igss: 0,
    isr: 0,
    prestaciones: 0,
    desde: '2026-01-01',
    hasta: null,
  });
  return {
    inicio: '2026-01-01',
    fin: '2026-01-15',
    empleado: {
      id: 1,
      usuario: 2,
      codigo: 'PRUEBA',
      nombres: 'Persona',
      apellidos: 'Prueba',
      ingreso: '2026-01-01',
      egreso: null,
      departamento: 'Pruebas',
      idDepartamento: 1,
      puesto: 'Analista',
      centro: 1,
      localidad: 'PRUEBA',
      nit: '1234567-9',
      afiliacion: '123456789',
    },
    salarios: [{ id: 1, monto: salario, desde: '2026-01-01', hasta: null }],
    parametros,
    conceptos,
    tramos: [
      {
        id: 1,
        desde: '2026-01-01',
        hasta: null,
        inferior: '0',
        superior: '300000',
        tasa: '5',
        fija: '0',
      },
      {
        id: 2,
        desde: '2026-01-01',
        hasta: null,
        inferior: '300000',
        superior: null,
        tasa: '7',
        fija: '15000',
      },
    ],
    horarios: [{ desde: '2026-01-01', hasta: null, dias: [1, 2, 3, 4, 5] }],
    feriados: [],
    ausencias: [],
    comisiones: [],
    horas: [],
    descuentos: [],
    deducciones: [],
    acumulado: { renta: '0', igss: '0', isr: '0' },
    prestaciones: [],
  };
}
