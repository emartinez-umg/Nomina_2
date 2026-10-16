import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { ConstructorHorario, bloqueInicial } from './ConstructorHorario';
import type { BloqueHorario } from '../../../../backend/src/shared/horarios/modelo';
import { CatalogoFormulario } from '../catalogos/pages/CatalogoFormulario';
import { catalogoSchema } from '../catalogos/api/catalogos';
import definiciones from '../catalogos/catalogos.fixture.json';
import { HelpProvider } from '../../components/help/HelpProvider';
import { ToastProvider } from '../../components/ui/Toast';
import { guardarCsrf } from '../../lib/http';
import { claveBorrador } from '../../lib/formDraft';
vi.mock('../../app/session', () => ({
  useSession: () => ({ usuario: { idUsuario: 7, rol: 'RH' } }),
}));
const limitesHorario = {
  DIURNA: { diarias: 8, semanales: 44 },
  MIXTA: { diarias: 7, semanales: 42 },
  NOCTURNA: { diarias: 6, semanales: 36 },
};
const cat = catalogoSchema.parse({
  ...definiciones.find((c) => c.slug === 'horarios'),
  legal: false,
});
const respuesta = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200 });
function Proveedores({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <ToastProvider>
        <HelpProvider>{children}</HelpProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
function Editor() {
  const [value, onChange] = useState<BloqueHorario[]>([bloqueInicial()]);
  return <ConstructorHorario value={value} onChange={onChange} />;
}
beforeEach(() => {
  localStorage.clear();
  guardarCsrf('prueba');
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) =>
      respuesta(
        String(url).includes('vista-previa')
          ? { codigo: 'PRUE', reservado: false }
          : { ultimoCierre: null, limitesHorario },
      ),
    ),
  );
});
it('ofrece 48 horas cerradas, descanso 30/60 y cambia rangos y chips con teclado', async () => {
  const user = userEvent.setup();
  render(
    <Proveedores>
      <Editor />
    </Proveedores>,
  );
  const entrada = screen.getByLabelText('Entrada · bloque 1');
  expect(entrada.tagName).toBe('SELECT');
  expect(within(entrada).getAllByRole('option')).toHaveLength(48);
  expect(
    within(screen.getByLabelText('Descanso · bloque 1'))
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['30 minutos', '60 minutos']);
  await user.click(screen.getByRole('button', { name: 'Fin de semana' }));
  expect(screen.getByRole('button', { name: 'Lunes' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Sábado' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Personalizado' }));
  expect(screen.getByRole('button', { name: 'Lunes' })).toHaveFocus();
  await user.keyboard(' ');
  expect(screen.getByText(/Horas semanales: 24.00/)).toBeInTheDocument();
});
it('muestra solapes, límites y cruce nocturno mientras se construye', async () => {
  const user = userEvent.setup();
  render(
    <Proveedores>
      <Editor />
    </Proveedores>,
  );
  await user.click(screen.getByRole('button', { name: 'Agregar bloque' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/solapan/);
  await user.click(screen.getByRole('button', { name: 'Quitar bloque 2' }));
  fireEvent.change(screen.getByLabelText('Entrada · bloque 1'), { target: { value: '22:00' } });
  fireEvent.change(screen.getByLabelText('Salida · bloque 1'), { target: { value: '05:00' } });
  fireEvent.change(screen.getByLabelText('Cruza medianoche · bloque 1'), {
    target: { value: '1' },
  });
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText(/Horas semanales: 30.00 · Jornada nocturna/)).toBeInTheDocument();
});
it('restaura bloques del borrador y elimina el borrador al guardar', async () => {
  const clave = claveBorrador(7, 'catalogo-horarios', undefined);
  localStorage.setItem(
    clave,
    JSON.stringify({
      version: 4,
      guardado: Date.now(),
      valores: {
        nombre: 'Horario recuperado',
        descripcion: '',
        bloques: JSON.stringify([bloqueInicial()]),
        motivo: '',
      },
    }),
  );
  const cerrar = vi.fn(),
    creado = vi.fn();
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (init?.method === 'POST')
      return respuesta({
        id: 8,
        activo: true,
        enUso: false,
        nombre: 'Horario recuperado',
        codigo: 'HR',
        bloques: [bloqueInicial()],
      });
    return respuesta(
      String(url).includes('vista-previa')
        ? { codigo: 'HR', reservado: false }
        : { ultimoCierre: null, limitesHorario },
    );
  });
  render(
    <Proveedores>
      <CatalogoFormulario cat={cat} cierre={null} onCerrar={cerrar} onGuardado={creado} />
    </Proveedores>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(screen.getByLabelText('Nombre')).toHaveValue('Horario recuperado');
  await waitFor(() => expect(screen.getByText(/Límites vigentes/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(cerrar).toHaveBeenCalled());
  expect(creado).toHaveBeenCalled();
  expect(localStorage.getItem(clave)).toBeNull();
  const llamada = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(llamada[1]?.body))).toMatchObject({ bloques: [bloqueInicial()] });
});
it('duplicar un horario asignado habilita los bloques y guarda un alta sin código manual', async () => {
  const actual = {
    id: 9,
    activo: true,
    enUso: true,
    nombre: 'Patrón asignado',
    descripcion: null,
    jornada: 'DIURNA',
    codigo: 'PA',
    bloques: [bloqueInicial()],
  };
  const cerrar = vi.fn();
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    init?.method === 'POST'
      ? respuesta({ ...actual, id: 10, enUso: false, codigo: 'PA2' })
      : respuesta(
          String(url).includes('vista-previa')
            ? { codigo: 'PA2', reservado: false }
            : { ultimoCierre: null, limitesHorario },
        ),
  );
  render(
    <Proveedores>
      <CatalogoFormulario cat={cat} actual={actual} duplicar cierre={null} onCerrar={cerrar} />
    </Proveedores>,
  );
  expect(screen.getByLabelText('Entrada · bloque 1')).toBeEnabled();
  await waitFor(() => expect(screen.getByText(/Límites vigentes/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(cerrar).toHaveBeenCalled());
  const llamada = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(String(llamada[0])).toMatch(/\/catalogos\/horarios$/);
  expect(JSON.parse(String(llamada[1]?.body))).not.toHaveProperty('codigo');
});
