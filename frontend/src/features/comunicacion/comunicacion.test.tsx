import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { formularioSchema, fechaHora } from './api/comunicacion';
import { FechaHoraField } from './pages/ComunicacionFormulario';
import { Indicador, ResumenComunicaciones } from '../inicio/pages/InicioPage';
const d = {
  titulo: 'Reunión de prueba',
  contenido: 'Contenido de la actividad',
  inicio: '2026-11-01T10:00',
  fin: '2026-11-01T11:00',
  lugar: 'Sala',
  paraTodos: true,
  destinatarios: [],
  version: 1,
};
describe('FASE 11: guía de comunicación y tableros', () => {
  it('rechaza hora pasada, fechas imposibles y fin anterior antes de enviar', () => {
    const s = formularioSchema('eventos', '2026-10-13T10:00');
    expect(s.safeParse({ ...d, inicio: '2026-02-30T10:00' }).success).toBe(false);
    expect(s.safeParse({ ...d, inicio: '2026-11-01T25:00' }).success).toBe(false);
    expect(s.safeParse({ ...d, fin: '2026-10-31T10:00' }).success).toBe(false);
    expect(s.safeParse(d).success).toBe(true);
  });
  it('exige grupo cuando no es para todos', () => {
    expect(
      formularioSchema('eventos', '2026-10-13T10:00').safeParse({ ...d, paraTodos: false }).success,
    ).toBe(false);
  });
  it('hora sanea pegado y conserva fecha', () => {
    const cambiar = vi.fn();
    render(
      <FechaHoraField
        name="inicio"
        label="Inicio"
        hint="Fecha y hora local"
        value="2026-11-01T10:00"
        onValueChange={cambiar}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Hora de inicio' }), {
      target: { value: '12ab:30' },
    });
    expect(cambiar).toHaveBeenCalledWith('2026-11-01T12:30');
  });
  it('indicador conserva cero y muestra explicación de falta de configuración', () => {
    const { rerender } = render(
      <Indicador titulo="Vacaciones" valor="0.00 días" icono="calendario" />,
    );
    expect(screen.getByText('0.00 días')).toBeInTheDocument();
    rerender(
      <Indicador
        titulo="Vacaciones"
        valor="Por revisar"
        icono="calendario"
        detalle="Falta vigencia histórica"
      />,
    );
    expect(screen.getByText('Falta vigencia histórica')).toBeInTheDocument();
  });
  it('anuncio se presenta como texto, sin interpretar HTML', () => {
    render(
      <MemoryRouter>
        <ResumenComunicaciones
          tipo="anuncios"
          total={1}
          filas={[
            {
              id: 1,
              titulo: 'Aviso',
              contenido: '<img src=x onerror=alert(1)>',
              inicio: '2026-10-13',
              fin: '2026-10-14',
              lugar: '',
              paraTodos: 1,
              activo: 1,
              version: 1,
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver todos (1)' })).toBeEnabled();
  });
  it('formato visible conserva la hora de Guatemala', () => {
    expect(fechaHora('2026-10-13T14:30:00-06:00')).toBe('13/10/2026 · 14:30');
  });
});
