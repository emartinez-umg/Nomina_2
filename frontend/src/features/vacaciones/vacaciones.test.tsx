import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Semaforo, AprobarVacaciones, SaldoCard } from './pages/VacacionesPage';
import { rangoLibre } from './api/vacaciones';
import type { Fila } from './api/vacaciones';
import { TextField } from '../../components/forms/TextField';
const base: Fila = {
  codigo: 'SOL_2026_0001',
  id: 1,
  idEmpleado: 1,
  empleado: 'Expediente de prueba',
  inicio: '2026-10-19',
  fin: '2026-10-20',
  dias: '2.00',
  diasRegistrados: '2.00',
  saldoAlSolicitar: '3.00',
  saldoAlResolver: null,
  estado: 'EN_PROCESO',
  motivo: null,
  saldo: null,
  solicitables: 3,
  puedeCancelar: false,
  solicitadoPor: 'empleado.prueba',
  solicitadoEn: '2026-10-15 08:00:00',
  aprobadoPor: null,
  aprobadoEn: null,
  canceladoPor: null,
  canceladoEn: null,
  motivoCancelacion: null,
  disponible: '3.00',
  alcanza: true,
  puedeAprobar: true,
  bloqueo: null,
};
describe('Semáforo y prevención de vacaciones', () => {
  it('muestra todos los saldos y conserva la fracción de cinco meses', () => {
    render(
      <SaldoCard
        s={{
          idEmpleado: 1,
          empleado: 'Persona',
          corte: '2026-10-15',
          mesesCompletos: 5,
          tasaMensual: '1.25',
          acumulado: '6.25',
          tomados: '0.00',
          previas: '0.00',
          disponible: '6.25',
          solicitables: 6,
          saldoInicial: '0.00',
          movimientos: '0.00',
          kardex: [],
        }}
      />,
    );
    expect(screen.getByText('Solicitables').nextElementSibling).toHaveTextContent('6 días');
    expect(screen.getByText('Disponibles').nextElementSibling).toHaveTextContent('6.25 días');
    expect(screen.getByText('Tomados / aprobados')).toBeVisible();
    expect(screen.getByText(/la fracción se conserva/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver kardex' }));
    expect(screen.getByText(/No hay consumos ni ajustes/)).toBeVisible();
  });
  it('habilita aprobar con saldo suficiente y presenta comparación verde', () => {
    const fn = vi.fn();
    render(
      <>
        <Semaforo f={base} />
        <AprobarVacaciones f={base} onClick={fn} />
      </>,
    );
    expect(screen.getByText('Saldo suficiente').closest('div')).toHaveClass('vacaciones-verde');
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(fn).toHaveBeenCalledOnce();
  });
  it('muestra rojo, bloqueo y tooltip cuando el saldo es insuficiente', () => {
    const f = {
      ...base,
      disponible: '1.25',
      alcanza: false,
      puedeAprobar: false,
      bloqueo: 'Saldo insuficiente: reduce el rango.',
    };
    render(
      <>
        <Semaforo f={f} />
        <AprobarVacaciones f={f} onClick={vi.fn()} />
      </>,
    );
    expect(screen.getByText('Saldo insuficiente o no verificable').closest('div')).toHaveClass(
      'vacaciones-rojo',
    );
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled();
    expect(screen.getByText(f.bloqueo, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar' }).parentElement).toHaveAttribute(
      'aria-describedby',
    );
  });
  it('impide cruzar bloqueos aunque los extremos estén libres', () => {
    const c = {
      hoy: '2026-10-12',
      dias: [],
      bloqueos: [{ inicio: '2026-10-14', fin: '2026-10-15' }],
    };
    expect(rangoLibre('2026-10-12', '2026-10-16', c)).toBe(false);
    expect(rangoLibre('2026-10-16', '2026-10-20', c)).toBe(true);
  });
  it('sanea referencias históricas al escribir o pegar', () => {
    const change = vi.fn();
    render(
      <TextField
        tipo="referencia"
        name="ref"
        label="Referencia"
        hint="Identificador"
        value=""
        onValueChange={change}
      />,
    );
    fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: 'EXP 01;<>_2026' } });
    expect(change).toHaveBeenCalledWith('EXP01_2026');
  });
});
