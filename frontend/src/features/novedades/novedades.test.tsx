import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { campos, cuerpo, iniciales, schemaFormulario } from './api/formulario';
import { VistaPrevia } from './pages/NovedadFormulario';
describe('Captura guiada de novedades', () => {
  it('no conserva cuotas ocultas ni fin derivado al cambiar de modalidad', () => {
    const d = {
      ...iniciales('descuentos', '2027-01-01'),
      idEmpleado: '1',
      idTipo: '2',
      monto: '1,234.56',
      modalidad: 'FIJO',
      cuotas: '10',
      fechaFin: '',
      motivo: 'Parqueo mensual',
    };
    expect(cuerpo('descuentos', d)).toMatchObject({
      monto: '1234.56',
      cuotas: null,
      fechaFin: null,
    });
    expect(cuerpo('descuentos', { ...d, modalidad: 'UNICO' })).toMatchObject({
      cuotas: 1,
      fechaFin: null,
    });
    expect(campos('descuentos', 'FIJO').some((c) => c.nombre === 'cuotas')).toBe(false);
  });
  it('rechaza una primera cuota pasada, desembolso posterior y ausencia invertida', () => {
    const hoy = '2027-01-02';
    const p = {
      ...iniciales('prestamos', hoy),
      idEmpleado: '1',
      idTipo: '2',
      monto: '100',
      cuotas: '3',
      referencia: 'P01',
      motivo: 'Préstamo autorizado',
      fechaInicio: '2027-01-01',
      fechaDesembolso: '2027-02-01',
    };
    const parsed = schemaFormulario('prestamos', hoy).safeParse(p);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.map((e) => e.path[0])).toEqual(
        expect.arrayContaining(['fechaInicio', 'fechaDesembolso']),
      );
    expect(
      schemaFormulario('ausencias', hoy).safeParse({
        ...iniciales('ausencias', hoy),
        idEmpleado: '1',
        idTipo: '2',
        fechaFin: '2027-01-01',
        motivo: 'Permiso solicitado',
      }).success,
    ).toBe(false);
  });
  it('no acepta horas o dinero de otro tipo ni un empleado escrito sin seleccionar', () => {
    for (const horas of ['abc', '0', '2.25', '1.123'])
      expect(
        schemaFormulario('horas-extra', '2027-01-01').safeParse({
          ...iniciales('horas-extra', '2027-01-01'),
          idEmpleado: '1',
          horas,
          motivo: 'Horas autorizadas',
        }).success,
      ).toBe(false);
    expect(
      schemaFormulario('comisiones', '2027-01-01').safeParse({
        idEmpleado: 'Ana',
        monto: '-2',
        fecha: '2027-02-30',
        referencia: 'X',
        motivo: 'Pago',
      }).success,
    ).toBe(false);
  });
  it('muestra amortización y recargo devueltos por la API', () => {
    render(
      <VistaPrevia
        datos={{
          plan: [{ numero: 1, fecha: '2027-01-15', monto: '33.34', saldo: '0.00' }],
          calculo: { valorHora: '20.83', recargo: '50', monto: '62.50' },
        }}
      />,
    );
    expect(screen.getByText('Q 33.34')).toBeInTheDocument();
    expect(screen.getByText('Q 0.00')).toBeInTheDocument();
    expect(screen.getByText(/62.50/)).toBeInTheDocument();
  });
});
