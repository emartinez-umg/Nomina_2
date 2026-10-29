import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EstadoBadge } from './EstadoBadge';
import { etiquetaCodigo, textoPresentacion } from '../../lib/estados';
import { CampoEmpleado } from '../../features/empleados/pages/CampoEmpleado';
import { fireEvent } from '@testing-library/react';
describe('R3-4: estados y códigos de presentación', () => {
  it('presenta texto, icono y tono accesibles en lugar del código', () => {
    const { container } = render(<EstadoBadge estado="EN_PROCESO" />);
    expect(screen.getByText('En proceso')).toHaveClass('badge-aviso');
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/EN_PROCESO/);
  });
  it.each(['FUTURO_INTERNO', '__proto__'])(
    'un estado desconocido se presenta neutral sin filtrar el código (%s)',
    (codigo) => {
      render(<EstadoBadge estado={codigo} />);
      expect(screen.getByText('Estado no disponible')).toBeVisible();
    },
  );
  it('traduce códigos en mensajes conservando identificadores públicos', () => {
    expect(etiquetaCodigo('BONO_14')).toBe('Bono 14');
    expect(textoPresentacion('Solicitud SOL_2026_0001: EN_PROCESO')).toBe(
      'Solicitud SOL_2026_0001: En proceso',
    );
  });
  it('elegir una etiqueta de estado civil conserva el código enviado al servidor', () => {
    const onValueChange = vi.fn();
    render(
      <CampoEmpleado
        campo={{
          nombre: 'estadoCivil',
          label: 'Estado civil',
          tipo: 'opcion',
          hint: 'Elige.',
          opciones: ['SOLTERO', 'CASADO'],
        }}
        name="estadoCivil"
        label="Estado civil"
        hint="Elige."
        value="SOLTERO"
        onValueChange={onValueChange}
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Casado' }));
    expect(onValueChange).toHaveBeenCalledWith('CASADO');
  });
});
