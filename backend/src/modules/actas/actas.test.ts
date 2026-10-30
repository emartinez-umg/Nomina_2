import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Logger } from 'pino';
import { manejarErrores } from '../../shared/middleware/error-handler.js';
import {
  actaSchema,
  accionActaSchema,
  plantillaActaSchema,
  validarFechaHecho,
  validarDiasSuspension,
  variablesActa,
} from '../../shared/actas/modelo.js';
import { rellenarPlantilla } from '../solicitudes/solicitudes.pdf.js';
import { actaPdf } from './actas.pdf.js';
import { empresaPrueba, firmaPrueba } from '../../shared/pdf/documento.fixture.js';
const base = {
  idEmpleado: 1,
  idTipo: 1,
  fechaHecho: '2026-10-29',
  lugar: 'Sede principal',
  descripcion: 'Descripción verificable del hecho ocurrido en el centro de trabajo.',
  testigos: '',
  norma: 'Reglamento interno',
  medida: 'Amonestación escrita',
  descargos: '',
  diasSuspension: 0,
};
describe('C8: validación compartida, plantilla y confidencialidad', () => {
  it('limita descripción, rechaza campos extra, controles y fechas imposibles', () => {
    expect(actaSchema.parse(base)).toEqual(base);
    for (const extra of [
      { descripcion: 'a'.repeat(29) },
      { descripcion: 'a'.repeat(4001) },
      { fechaHecho: '2026-02-30' },
      { fechaHecho: '2026-2-01' },
      { estado: 'FIRMADA' },
      { descripcion: 'a'.repeat(40) + '\u0000' },
    ])
      expect(actaSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(actaSchema.safeParse({ ...base, descripcion: 'a'.repeat(4000) }).success).toBe(true);
  });
  it('acepta límites inclusivos de fecha y días parametrizados', () => {
    expect(validarFechaHecho('2026-10-29', '2020-01-01', '2026-10-29')).toBeNull();
    expect(validarFechaHecho('2020-01-01', '2020-01-01', '2026-10-29')).toBeNull();
    expect(validarFechaHecho('2026-10-30', '2020-01-01', '2026-10-29')).toContain('futura');
    expect(validarFechaHecho('2019-12-31', '2020-01-01', '2026-10-29')).toContain('ingreso');
    expect(validarDiasSuspension(8, true, 8)).toBeNull();
    expect(validarDiasSuspension(9, true, 8)).toContain('8');
    expect(validarDiasSuspension(0, true, 8)).toContain('1');
    expect(validarDiasSuspension(1, false, 8)).toContain('Solo');
  });
  it('exige motivo, testigos y confirmación por acción, sin transferir autorizaciones', () => {
    for (const d of [
      { accion: 'ANULAR' },
      { accion: 'NEGATIVA' },
      { accion: 'EMITIR', registrarAusencia: true },
      { accion: 'FIRMAR' },
      { accion: 'EMITIR', motivo: 'Motivo ajeno' },
      { accion: 'EMITIR', confirmado: false },
    ])
      expect(accionActaSchema.safeParse({ version: 1, confirmado: true, ...d }).success).toBe(
        false,
      );
    expect(
      accionActaSchema.safeParse({
        version: 1,
        confirmado: true,
        accion: 'NEGATIVA',
        testigos: 'Testigo presente',
      }).success,
    ).toBe(true);
  });
  it('protege variables y exige todos los datos en la plantilla', () => {
    const contenido = variablesActa.map((v) => `{{${v}}}`).join('\n'),
      p = {
        version: 1,
        nombre: 'Acta administrativa',
        contenido,
        motivo: 'Nueva versión documental',
        confirmado: true,
      };
    expect(plantillaActaSchema.safeParse(p).success).toBe(true);
    expect(
      plantillaActaSchema.safeParse({ ...p, contenido: contenido + ' {{contrasena}}' }).success,
    ).toBe(false);
    expect(
      plantillaActaSchema.safeParse({ ...p, contenido: contenido.replace('{{descripcion}}', '') })
        .success,
    ).toBe(false);
    expect(
      rellenarPlantilla(
        contenido,
        Object.fromEntries(variablesActa.map((v) => [v, 'Dato'])),
        variablesActa,
      ),
    ).not.toContain('{{');
    expect(() => rellenarPlantilla('{{codigo}}', {}, variablesActa)).toThrow();
  });
  it('genera PDF real membretado, incluso con cuatro mil caracteres', async () => {
    const b = await actaPdf(
      'ACT_2026_0001',
      'Acta administrativa',
      'Hechos documentados. '.repeat(200),
      empresaPrueba,
      firmaPrueba,
    );
    expect(b.subarray(0, 5).toString()).toBe('%PDF-');
    expect(b.length).toBeGreaterThan(2000);
    await expect(
      actaPdf('ACT_2026_0001', 'Acta', 'Texto', empresaPrueba, { ...firmaPrueba, cargo: '' }),
    ).rejects.toThrow('cargo');
  });
  it('un fallo inesperado jamás registra contenido del acta ni del error', async () => {
    const error = vi.fn(),
      app = express();
    app.get('/api/actas/falla', () => {
      throw new Error('Hechos sensibles del empleado');
    });
    app.use(manejarErrores({ error } as unknown as Logger));
    await request(app).get('/api/actas/falla?texto=Privado').expect(500);
    expect(error).toHaveBeenCalledOnce();
    expect(JSON.stringify(error.mock.calls)).not.toContain('Hechos sensibles');
    expect(JSON.stringify(error.mock.calls)).not.toContain('Privado');
  });
});
