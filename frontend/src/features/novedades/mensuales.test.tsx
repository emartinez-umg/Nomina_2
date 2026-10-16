import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthField } from '../../components/forms/MonthField';
import { campos, cuerpo, iniciales, schemaFormulario } from './api/formulario';
import { VistaPrevia } from './pages/NovedadFormulario';
function Selector({ inicial = '2025-12' }: { inicial?: string }) {
  const [value, setValue] = useState(inicial);
  return (
    <>
      <MonthField
        name="mes"
        label="Mes"
        hint="Mes abierto hasta octubre."
        value={value}
        onValueChange={setValue}
        max="2026-10"
        deshabilitar={(m) => m === '2026-02'}
      />
      <output>{value}</output>
    </>
  );
}
describe('V1-9: captura mensual guiada', () => {
  it('permite elegir el mes de un filtro vacío usando el año actual permitido', () => {
    render(<Selector inicial="" />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Mes' }), { target: { value: '03' } });
    expect(screen.getByRole('status')).toHaveTextContent('2026-03');
  });
  it('usa selectores de mes/año, bloquea futuros/cierres y corrige mes al cambiar año', () => {
    render(<Selector />);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Año de mes' }), {
      target: { value: '2026' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('2026-01');
    expect(screen.getByRole('option', { name: 'Diciembre' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Febrero' })).toBeDisabled();
  });
  it('la carga de horas omite fecha, jornada y autorización y admite medias horas', () => {
    const d = {
      ...iniciales('horas-extra', '2026-10-15'),
      idEmpleado: '1',
      mes: '2026-10',
      horas: '40.5',
      motivo: 'Horas respaldadas',
    };
    expect(schemaFormulario('horas-extra', '2026-10-15').safeParse(d).success).toBe(true);
    expect(cuerpo('horas-extra', d)).toEqual({
      idEmpleado: 1,
      mes: '2026-10',
      horas: '40.5',
      motivo: 'Horas respaldadas',
      confirmado: true,
    });
    expect(campos('horas-extra').some((c) => c.tipo === 'fecha')).toBe(false);
  });
  it.each(['comisiones', 'consumo-tienda'] as const)(
    'valida mes no futuro y cuerpo manual de %s',
    (tipo) => {
      const d = {
        ...iniciales(tipo, '2026-10-15'),
        idEmpleado: '1',
        mes: '2026-10',
        monto: '1,234.56',
        referencia: 'REF',
        motivo: 'Registro manual',
      };
      expect(schemaFormulario(tipo, '2026-10-15').safeParse(d).success).toBe(true);
      expect(cuerpo(tipo, d)).toMatchObject({
        mes: '2026-10',
        monto: '1234.56',
        referencia: 'REF',
      });
      expect(schemaFormulario(tipo, '2026-10-15').safeParse({ ...d, mes: '2026-11' }).success).toBe(
        false,
      );
    },
  );
  it('muestra advertencia del tope y descuento desglosado por mes', () => {
    render(
      <VistaPrevia
        datos={{
          plan: [],
          calculo: null,
          advertencia: 'Supera el tope mensual de 40 horas.',
          descuento: '500.00',
          meses: [{ mes: '2026-10', dias: 3, monto: '500.00' }],
        }}
      />,
    );
    expect(screen.getByText(/Supera el tope/)).toBeVisible();
    expect(screen.getByText(/Descuento por ausencias/)).toHaveTextContent('Q 500.00');
    expect(screen.getByText(/2026-10: 3 días/)).toBeVisible();
  });
});
