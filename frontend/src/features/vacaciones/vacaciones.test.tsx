import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Semaforo, AprobarVacaciones } from './pages/VacacionesPage';
import { rangoLibre } from './api/vacaciones';
import type { Fila } from './api/vacaciones';
import { TextField } from '../../components/forms/TextField';
const base: Fila = {
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
  disponible: '3.00',
  alcanza: true,
  puedeAprobar: true,
  bloqueo: null,
};
describe('Semáforo y prevención de vacaciones', () => {
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
