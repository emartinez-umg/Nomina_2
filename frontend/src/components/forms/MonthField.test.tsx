import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonthField } from './MonthField';
const props = {
  name: 'mes',
  label: 'Mes',
  hint: 'Elige el mes.',
  value: '2026-10',
  onValueChange: vi.fn(),
};
describe('R3-4: selector de años', () => {
  it('acota años con datos y omite huecos sin alterar el mes', () => {
    render(<MonthField {...props} anioMin={2021} anioMax={2026} anios={[2021, 2024, 2026]} />);
    const selector = screen.getByLabelText('Año de mes');
    expect(
      within(selector)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['2026', '2024', '2021']);
    fireEvent.change(selector, { target: { value: '2024' } });
    expect(props.onValueChange).toHaveBeenCalledWith('2024-10');
  });
  it('R3-10: un atajo conserva visible el año seleccionado sin ofrecer otros huecos', () => {
    render(
      <MonthField {...props} value="2025-01" anioMin={2024} anioMax={2026} anios={[2024, 2026]} />,
    );
    expect(screen.getByLabelText('Año de mes')).toHaveValue('2025');
    expect(screen.getByRole('option', { name: '2025 (sin registros)' })).toBeDisabled();
    expect(screen.queryByRole('option', { name: '2023' })).not.toBeInTheDocument();
  });
  it('respeta máximo mensual y sus meses bloqueados', () => {
    render(<MonthField {...props} max="2026-10" anioMin={2025} anioMax={2030} />);
    expect(within(screen.getByLabelText('Año de mes')).getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: 'Noviembre' })).toBeDisabled();
  });
  it('el uso sin rango conserva el límite histórico', () => {
    render(<MonthField {...props} max="2026-12" />);
    expect(within(screen.getByLabelText('Año de mes')).getAllByRole('option')).toHaveLength(127);
  });
});
