import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccionesPrestacion, DetalleCalculo } from './pages/PrestacionesPage';
import type { Registro } from './api/prestaciones';
const r: Registro = {
  id: 1,
  idEmpleado: 1,
  empleado: 'Persona de prueba',
  tipo: 'BONO_14',
  inicio: '2025-07-01',
  fin: '2026-06-30',
  promedio: '3000.00',
  total: '1500.00',
  estado: 'CALCULADA',
  hash: 'a'.repeat(64),
  fechaPago: null,
  referencia: null,
  motivo: 'Prueba de cálculo',
};
describe('Prestaciones: revisión y transiciones', () => {
  it('calculada permite aprobar y bloquea pago', () => {
    const fn = vi.fn();
    render(<AccionesPrestacion r={r} ocupado={false} onAccion={fn} />);
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(fn).toHaveBeenCalledWith('aprobar');
  });
  it('aprobada permite pago y anulación motivada', () => {
    render(
      <AccionesPrestacion r={{ ...r, estado: 'APROBADA' }} ocupado={false} onAccion={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Anular' })).toBeEnabled();
  });
  it('pagada y doble envío bloquean todas las mutaciones', () => {
    const { rerender } = render(
      <AccionesPrestacion r={{ ...r, estado: 'PAGADA' }} ocupado={false} onAccion={vi.fn()} />,
    );
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
    rerender(<AccionesPrestacion r={r} ocupado onAccion={vi.fn()} />);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });
  it('finiquito confirmado conserva la baja e impide anular', () => {
    render(
      <AccionesPrestacion
        r={{ ...r, estado: 'APROBADA', tipo: 'INDEMNIZACION' }}
        ocupado={false}
        onAccion={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Anular' })).toBeDisabled();
  });
  it('vista previa muestra error por persona', () => {
    render(
      <DetalleCalculo
        v={{
          idEmpleado: 1,
          empleado: 'Persona',
          inicio: r.inicio,
          fin: r.fin,
          componentes: [],
          total: '0.00',
          exento: '0.00',
          gravado: '0.00',
          hash: '',
          error: 'Falta salario vigente.',
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falta salario vigente.');
  });
});
