import { describe, it, expect } from 'vitest';
import { datosSchema, querySchema, fechaSchema, instanteSchema } from './comunicacion.schemas.js';
import { validarFechas } from './comunicacion.service.js';
const datos = {
  titulo: 'Reunión de equipo',
  contenido: 'Contenido real de prueba',
  inicio: '2026-11-01T10:00',
  fin: '2026-11-01T11:00',
  lugar: 'Oficina',
  paraTodos: true,
  destinatarios: [],
  version: 1,
};
describe('Comunicación: fechas y audiencias', () => {
  it('rechaza fechas imposibles y horas fuera del reloj', () => {
    expect(fechaSchema.safeParse('2026-02-29').success).toBe(false);
    expect(instanteSchema.safeParse('2026-12-01T24:00').success).toBe(false);
    expect(instanteSchema.safeParse('2026-12-01T10:60').success).toBe(false);
    expect(instanteSchema.safeParse('2028-02-29T23:59').success).toBe(true);
  });
  it('compara los minutos contra el reloj de Guatemala', () => {
    expect(() => validarFechas('eventos', datos, '2026-11-01T10:00:01')).toThrow('futuro');
    expect(() => validarFechas('eventos', datos, '2026-11-01T09:59:59')).not.toThrow();
  });
  it('rechaza evento pasado, fin anterior y falta de lugar', () => {
    expect(() => validarFechas('eventos', datos, '2027-01-01T00:00:00')).toThrow();
    expect(() =>
      validarFechas('eventos', { ...datos, fin: '2026-10-01T10:00' }, '2026-10-01T00:00:00'),
    ).toThrow();
    expect(() => validarFechas('eventos', { ...datos, lugar: '' }, '2026-10-01T00:00:00')).toThrow(
      'dónde',
    );
  });
  it('anuncio incluye hoy en el último día y admite programación', () => {
    const d = { ...datos, inicio: '2026-11-01', fin: '2026-11-01' };
    expect(() => validarFechas('anuncios', d, '2026-11-01T23:59:59')).not.toThrow();
    expect(() => validarFechas('anuncios', d, '2026-11-02T00:00:00')).toThrow('vigencia');
  });
  it('requiere todos o grupos y prohíbe duplicados', () => {
    expect(datosSchema.safeParse({ ...datos, paraTodos: false }).success).toBe(false);
    expect(
      datosSchema.safeParse({ ...datos, destinatarios: [{ tipo: 'PUESTO', id: 1 }] }).success,
    ).toBe(false);
    expect(
      datosSchema.safeParse({
        ...datos,
        paraTodos: false,
        destinatarios: [
          { tipo: 'PUESTO', id: 1 },
          { tipo: 'PUESTO', id: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      datosSchema.safeParse({
        ...datos,
        paraTodos: false,
        destinatarios: [
          { tipo: 'PUESTO', id: 1 },
          { tipo: 'DEPARTAMENTO', id: 1 },
        ],
      }).success,
    ).toBe(true);
  });
  it('lista blanca impide identidad enviada y órdenes SQL', () => {
    expect(querySchema.safeParse({ idEmpleado: 2 }).success).toBe(false);
    expect(querySchema.safeParse({ ordenarPor: 'TITULO;DROP TABLE ANUNCIOS' }).success).toBe(false);
    expect(querySchema.safeParse({ grupo: 'PUESTO' }).success).toBe(false);
    expect(querySchema.safeParse({ grupo: 'PUESTO', idGrupo: 1 }).success).toBe(true);
  });
});
