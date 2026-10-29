import { it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { prestacionPdf } from './prestaciones.pdf.js';
import type { Registro } from './prestaciones.repository.js';
import type { Snapshot } from './prestaciones.service.js';
import { empresaPrueba, firmaPrueba } from '../../shared/pdf/documento.fixture.js';
const registro: Registro = {
  id: 1,
  idEmpleado: 1,
  empleado: 'EMP_ING_0001 · Persona Prueba',
  tipo: 'BONO_14',
  inicio: '2025-07-01',
  fin: '2026-06-30',
  promedio: '10000.00',
  total: '10000.00',
  estado: 'APROBADA',
  hash: null,
  snapshot: null,
  fechaPago: null,
  referencia: null,
  motivo: 'Revisión de prestación anual.',
};
const snapshot: Snapshot = {
  ...registro,
  exento: '10000.00',
  gravado: '0.00',
  hash: 'huella',
  fuentes: [],
  nominas: [],
  versionMotor: 'v1',
  empresa: null,
  seleccion: { tipo: 'BONO_14', anio: 2026, idEmpleado: 1 },
  componentes: [
    {
      concepto: 'BONO_14',
      inicio: registro.inicio,
      fin: registro.fin,
      promedio: '10000.00',
      meses: '12',
      tiempo: '1',
      monto: '10000.00',
      exento: '10000.00',
      gravado: '0.00',
    },
  ],
};
it('R3-4: el PDF presenta las mismas etiquetas de estado y concepto que la pantalla', async () => {
  const pdf = await prestacionPdf(registro, snapshot, empresaPrueba, firmaPrueba);
  const texto = [...pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .flatMap((m) => {
      try {
        return [
          ...inflateSync(Buffer.from(m[1]!, 'latin1'))
            .toString('latin1')
            .matchAll(/<([a-f\d]+)>/gi),
        ].map((x) => Buffer.from(x[1]!, 'hex').toString('latin1'));
      } catch {
        return [];
      }
    })
    .join('');
  expect(texto).toContain('Estado: Aprobada');
  expect(texto).toContain('Bono 14');
  expect(texto).not.toMatch(/APROBADA|BONO_14/);
});
