import { describe, it, expect } from 'vitest';
import { resumirColisiones } from './vacaciones.colisiones.js';
import type { ColisionVacaciones } from './vacaciones.colisiones.js';
const solicitud = {
  id: 1,
  idEmpleado: 1,
  inicio: '2026-11-01',
  fin: '2026-11-03',
  estado: 'EN_PROCESO',
};
const colision: ColisionVacaciones = {
  idSolicitud: 2,
  codigoSolicitud: 'SOL_2026_0002',
  idEmpleado: 2,
  empleado: 'Ana López',
  codigo: 'EMP_ING_0002',
  departamento: 'Ingeniería',
  centro: null,
  inicio: '2026-10-31',
  fin: '2026-11-02',
  inicioCoincidencia: '2026-11-01',
  finCoincidencia: '2026-11-02',
  diasCoincidentes: 2,
  estado: 'APROBADA',
  tipoCoincidencia: 'Mismo departamento',
};
describe('Ocupación de vacaciones', () => {
  it('cuenta personas únicas y prima aprobada sobre pendiente incluso con varias solicitudes', () => {
    const r = resumirColisiones(
      solicitud,
      [colision, { ...colision, idSolicitud: 3, estado: 'EN_PROCESO' }],
      8,
    );
    expect(r.ocupacion).toEqual({ maximoAusentes: 2, tamanoEquipo: 8, fechaMaximo: '2026-11-01' });
    expect(r.lineaTiempo).toEqual([
      { fecha: '2026-11-01', aprobadas: 1, enProceso: 1, ausentes: 2 },
      { fecha: '2026-11-02', aprobadas: 1, enProceso: 1, ausentes: 2 },
      { fecha: '2026-11-03', aprobadas: 0, enProceso: 1, ausentes: 1 },
    ]);
  });
  it('no suma colisiones en días distintos como si estuvieran ausentes a la vez', () => {
    const otra = {
      ...colision,
      idSolicitud: 3,
      idEmpleado: 3,
      inicioCoincidencia: '2026-11-03',
      finCoincidencia: '2026-11-03',
      diasCoincidentes: 1,
    };
    expect(resumirColisiones(solicitud, [colision, otra], 8).ocupacion.maximoAusentes).toBe(2);
  });
  it('sin colisiones incluye solo la solicitud revisada y distingue aprobada de pendiente', () => {
    expect(
      resumirColisiones({ ...solicitud, estado: 'APROBADA' }, [], 8).lineaTiempo[0],
    ).toMatchObject({ aprobadas: 1, enProceso: 0, ausentes: 1 });
    expect(
      resumirColisiones({ ...solicitud, estado: 'RECHAZADA' }, [], 8).ocupacion.maximoAusentes,
    ).toBe(0);
  });
  it('la revisión permanece estable y cambia al cambiar estado, rango o tamaño de equipo', () => {
    const r = resumirColisiones(solicitud, [colision], 8).revision;
    expect(resumirColisiones(solicitud, [colision], 8).revision).toBe(r);
    expect(
      resumirColisiones(solicitud, [{ ...colision, estado: 'EN_PROCESO' }], 8).revision,
    ).not.toBe(r);
    expect(resumirColisiones(solicitud, [colision], 9).revision).not.toBe(r);
  });
});
