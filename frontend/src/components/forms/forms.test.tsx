import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import {
  TextField,
  NumberField,
  MoneyField,
  DpiField,
  NitField,
  PhoneField,
  EmailField,
  DateField,
  SelectField,
  TextAreaField,
  FileField,
} from './index';
import type { CampoProps } from './Field';
function Controlado({
  Campo,
  extra = {},
}: {
  Campo: React.ComponentType<CampoProps>;
  extra?: Partial<CampoProps>;
}) {
  const [v, setV] = useState('');
  return (
    <Campo
      name="dato"
      label="Dato"
      hint="Ingresa el dato con el formato indicado."
      value={v}
      onValueChange={setV}
      required
      {...extra}
    />
  );
}
describe('campos guiados', () => {
  it.each([
    [DpiField, '1234abc567890101', '1234 56789 0101'],
    [PhoneField, '5555abc1234', '5555 1234'],
    [NitField, '1234567-9', '1234567-9'],
    [NumberField, '12abc34', '1234'],
    [EmailField, 'ana @empresa.com', 'ana@empresa.com'],
  ])('bloquea caracteres al escribir en %s', async (Campo, entrada, salida) => {
    render(<Controlado Campo={Campo} />);
    await userEvent.type(screen.getByLabelText(/^Dato/), entrada);
    expect(screen.getByLabelText(/^Dato/)).toHaveValue(salida);
  });
  it('sanea un DPI pegado y explica la longitud incompleta al salir', async () => {
    render(<Controlado Campo={DpiField} />);
    const input = screen.getByLabelText(/^Dato/);
    input.focus();
    await userEvent.paste('12ab3456');
    await userEvent.tab();
    expect(input).toHaveValue('1234 56');
    expect(await screen.findByRole('alert')).toHaveTextContent('13 dígitos');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
  it('formatea moneda sin float y conserva dos decimales', async () => {
    render(<Controlado Campo={MoneyField} />);
    await userEvent.type(screen.getByLabelText(/^Dato/), '1234.56');
    await userEvent.tab();
    expect(screen.getByLabelText(/^Dato/)).toHaveValue('1,234.56');
    expect(screen.getByText('Q')).toBeInTheDocument();
  });
  it('nombres aceptan acentos y contraseñas conservan símbolos', async () => {
    const { unmount } = render(<Controlado Campo={TextField} extra={{}} />);
    await userEvent.type(screen.getByLabelText(/^Dato/), 'Ana Pérez');
    expect(screen.getByLabelText(/^Dato/)).toHaveValue('Ana Pérez');
    unmount();
    render(<Controlado Campo={(p) => <TextField {...p} tipo="contrasena" />} />);
    await userEvent.type(screen.getByLabelText(/^Dato/), 'Clave!2 A');
    expect(screen.getByLabelText(/^Dato/)).toHaveValue('Clave!2 A');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(screen.getByLabelText(/^Dato/)).toHaveAttribute('type', 'text');
  });
  it('fecha manual inválida muestra error y calendario deshabilita fuera de rango', async () => {
    render(<Controlado Campo={(p) => <DateField {...p} min="2026-10-01" max="2026-10-31" />} />);
    await userEvent.type(screen.getByLabelText(/^Dato/), '01112026');
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('no está permitida');
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar Dato' }));
    expect(screen.getByRole('dialog', { name: 'Calendario: Dato' })).toBeInTheDocument();
  });
  it('fecha inexistente se rechaza antes de aplicar límites', async () => {
    render(<Controlado Campo={DateField} />);
    await userEvent.type(screen.getByLabelText(/^Dato/), '31022026');
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('fecha válida');
  });
  it('select permite buscar sin acentos y elegir con teclado', async () => {
    render(
      <Controlado
        Campo={(p) => (
          <SelectField
            {...p}
            opciones={[
              { value: 'rh', label: 'Recursos Humanos' },
              { value: 'admin', label: 'Administración' },
            ]}
          />
        )}
      />,
    );
    await userEvent.type(screen.getByRole('combobox'), 'administracion');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('combobox')).toHaveValue('Administración');
  });
  it('textarea conserva saltos de línea y respeta longitud', () => {
    render(<Controlado Campo={(p) => <TextAreaField {...p} maxLength={20} />} />);
    fireEvent.change(screen.getByLabelText(/^Dato/), { target: { value: 'Calle 1\nZona 2' } });
    expect(screen.getByLabelText(/^Dato/)).toHaveValue('Calle 1\nZona 2');
    expect(screen.getByLabelText(/^Dato/)).toHaveAttribute('maxLength', '20');
  });
  it('archivo rechaza extensión y tamaño, sin entregar el archivo inválido', () => {
    const cambio = vi.fn();
    render(
      <FileField
        name="csv"
        label="Archivo"
        hint="CSV de hasta 1 MB."
        accept=".csv"
        maxBytes={10}
        onValueChange={cambio}
      />,
    );
    const input = screen.getByLabelText('Archivo');
    fireEvent.change(input, { target: { files: [new File(['mal'], 'datos.exe')] } });
    expect(screen.getByRole('alert')).toHaveTextContent('formato');
    expect(cambio).toHaveBeenLastCalledWith(null);
    fireEvent.change(input, { target: { files: [new File(['demasiado largo'], 'datos.csv')] } });
    expect(screen.getByRole('alert')).toHaveTextContent('supera');
    const valido = new File(['dato'], 'datos.csv');
    fireEvent.change(input, { target: { files: [valido] } });
    expect(cambio).toHaveBeenLastCalledWith(valido);
  });
});

it('pegar una fecha retira letras antes de aplicar la longitud de la máscara', async () => {
  const usuario = userEvent.setup();
  render(<Controlado Campo={DateField} />);
  await usuario.click(screen.getByRole('textbox'));
  await usuario.paste('abc01/10/2026xyz');
  expect(screen.getByRole('textbox')).toHaveValue('01/10/2026');
});
