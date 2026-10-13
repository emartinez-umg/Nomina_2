import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccionesPeriodo, BoletaMovil } from './pages/NominaPage';
import type { Periodo } from './api/nomina';
import { alertasDe, query } from './api/nomina';
const p: Periodo = {
  id: 1,
  inicio: '2026-01-01',
  fin: '2026-01-15',
  estado: 'CALCULADO',
  version: 1,
  empleados: 2,
  alertas: [],
};
describe('Planilla: prevención de errores en el flujo', () => {
  it('calculado permite revisar y recalcular, pero impide saltar a aprobación/cierre', () => {
    const fn = vi.fn();
    render(<AccionesPeriodo p={p} admin={false} ocupado={false} onAccion={fn} />);
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar revisada' }));
    expect(fn).toHaveBeenCalledWith('revisar');
  });
  it('alertas bloquean revisión y permiten recalcular', () => {
    render(
      <AccionesPeriodo
        p={{ ...p, alertas: ['El neto sería negativo.'] }}
        admin={false}
        ocupado={false}
        onAccion={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Marcar revisada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recalcular' })).toBeEnabled();
  });
  it('cerrado bloquea recálculo y solo muestra reapertura a ADMIN', () => {
    const { rerender } = render(
      <AccionesPeriodo
        p={{ ...p, estado: 'CERRADO' }}
        admin={false}
        ocupado={false}
        onAccion={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recalcular' })).toBeDisabled();
    rerender(
      <AccionesPeriodo p={{ ...p, estado: 'CERRADO' }} admin ocupado={false} onAccion={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Reabrir' })).toBeEnabled();
  });
  it('aprobado permite cierre o devolución y bloquea recalcular', () => {
    render(
      <AccionesPeriodo p={{ ...p, estado: 'APROBADO' }} admin ocupado={false} onAccion={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Devolver a revisión' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Recalcular' })).toBeDisabled();
  });
  it('mutación pendiente impide envíos dobles', () => {
    render(<AccionesPeriodo p={p} admin ocupado onAccion={vi.fn()} />);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });
  it('boleta móvil presenta neto y descarga directa sin desplazamiento horizontal', () => {
    const fn = vi.fn();
    render(
      <BoletaMovil
        f={{
          id: 1,
          idEmpleado: 1,
          empleado: 'Persona',
          departamento: 'Área',
          inicio: p.inicio,
          fin: p.fin,
          estado: 'CERRADO',
          version: 1,
          ingresos: '1625.00',
          descuentos: '72.45',
          neto: '1552.55',
          patronal: '190.05',
          alertas: '[]',
        }}
        ocupado={false}
        detalle={vi.fn()}
        descargar={fn}
      />,
    );
    expect(screen.getByText(/Neto: Q 1,552.55/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    expect(fn).toHaveBeenCalledOnce();
  });
  it('preserva filtros combinados y decodifica alertas persistidas', () => {
    expect(
      query({ anio: '2026', mes: '10', idEmpleado: '7', buscar: 'Ana & Luis', estado: '' }),
    ).toBe('anio=2026&mes=10&idEmpleado=7&buscar=Ana+%26+Luis');
    expect(alertasDe({ ...p, alertas: '["Neto negativo"]' })).toEqual(['Neto negativo']);
  });
});
