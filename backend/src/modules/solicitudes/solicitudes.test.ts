import { describe, expect, it } from 'vitest';
import { validarTransicion } from './solicitudes.service.js';
import { rellenarPlantilla, solicitudPdf } from './solicitudes.pdf.js';
import {
  crearSchema,
  resolverSchema,
  plantillaSchema,
  contactoSchema,
  querySchema,
} from './solicitudes.schemas.js';
describe('Gestiones: estados, validación y PDF', () => {
  it.each([
    ['EN_PROCESO', 'APROBADA'],
    ['EN_PROCESO', 'RECHAZADA'],
    ['APROBADA', 'ENTREGADA'],
  ])('permite %s → %s', (a, b) => expect(() => validarTransicion(a, b)).not.toThrow());
  it.each([
    ['RECHAZADA', 'ENTREGADA'],
    ['EN_PROCESO', 'ENTREGADA'],
    ['APROBADA', 'RECHAZADA'],
    ['ENTREGADA', 'APROBADA'],
    ['APROBADA', 'APROBADA'],
  ])('bloquea %s → %s', (a, b) => expect(() => validarTransicion(a, b)).toThrow());
  it('exige rechazo motivado y confirmación', () => {
    expect(
      resolverSchema.safeParse({ estado: 'RECHAZADA', motivo: '   ', confirmado: true }).success,
    ).toBe(false);
    expect(resolverSchema.safeParse({ estado: 'APROBADA' }).success).toBe(false);
    expect(
      resolverSchema.safeParse({
        estado: 'RECHAZADA',
        motivo: 'Completa la información',
        confirmado: true,
      }).success,
    ).toBe(true);
  });
  it('rechaza ids y campos ajenos al trámite y contacto', () => {
    expect(crearSchema.safeParse({ tipo: 'GAFETE', idEmpleado: 2, confirmado: true }).success).toBe(
      false,
    );
    expect(crearSchema.safeParse({ tipo: 'ACTUALIZACION_DATOS', confirmado: true }).success).toBe(
      false,
    );
    expect(contactoSchema.safeParse({ telefono: 'ABC', dpi: '123' }).success).toBe(false);
  });
  it('valida rangos y rechaza variables no permitidas o mal formadas', () => {
    expect(querySchema.safeParse({ desde: '2026-02-30' }).success).toBe(false);
    expect(querySchema.safeParse({ desde: '2026-03-01', hasta: '2026-02-01' }).success).toBe(false);
    for (const contenido of [
      'Constancia para {{contrasena}} de empleado',
      'Constancia para {{nombre} de empleado',
      'Constancia con {{ nombre }} de empleado',
    ])
      expect(
        plantillaSchema.safeParse({
          contenido,
          version: 1,
          motivo: 'Edición de plantilla',
          confirmado: true,
        }).success,
      ).toBe(false);
  });
  it('sustituye literalmente sin ejecutar variables del empleado y bloquea faltantes', () => {
    expect(rellenarPlantilla('Hola {{nombre}} · {{nombre}}', { nombre: '{{salario}}' })).toBe(
      'Hola {{salario}} · {{salario}}',
    );
    expect(() => rellenarPlantilla('DPI {{dpi}}', { dpi: null })).toThrow('dpi');
    expect(() => rellenarPlantilla('{{clave}}', { clave: 'dato' })).toThrow();
  });
  it('genera PDF real con contenido extenso y cierre correcto', async () => {
    const b = await solicitudPdf(
      'Constancia laboral',
      'Relación laboral.\n'.repeat(150),
      1,
      'Empresa de prueba',
    );
    expect(b.subarray(0, 5).toString()).toBe('%PDF-');
    expect(b.toString('latin1')).toMatch(/\/Count [2-9]/);
    expect(b.subarray(-6).toString().trim()).toBe('%%EOF');
  });
});
