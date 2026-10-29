import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { rutas } from './router';
import { TituloPagina, useTituloRegistro } from './titulos';
const hojas = (rs: RouteObject[]): RouteObject[] =>
  rs.flatMap((r) => (r.children ? hojas(r.children) : [r]));
function Registro({ codigo }: { codigo: string }) {
  useTituloRegistro(codigo);
  return <p>Detalle cargado</p>;
}
describe('R3-4: títulos definidos por el router', () => {
  it('todas las rutas de los tres roles y las públicas declaran título', () => {
    for (const ruta of hojas(rutas)) {
      expect(ruta.handle?.titulo, ruta.path).toBeDefined();
      if (ruta.path !== '*') expect(ruta.handle?.titulo, ruta.path).not.toBe('nomina2');
    }
  });
  it('el detalle usa código público y elimina el anterior al navegar', async () => {
    const ruta = hojas(rutas).find((r) => r.path === '/empleados/:id')!;
    const router = createMemoryRouter(
      [
        {
          element: <TituloPagina />,
          children: [
            {
              path: '/empleados/:id',
              handle: ruta.handle,
              element: <Registro codigo="EMP_ING_0001" />,
            },
            { path: '/rh', handle: { titulo: 'Inicio' }, element: <p>Inicio</p> },
          ],
        },
      ],
      { initialEntries: ['/empleados/1'] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(document.title).toBe('Empleado EMP_ING_0001 | nomina2'));
    await router.navigate('/rh');
    await screen.findByText('Inicio');
    expect(document.title).toBe('Inicio | nomina2');
  });
  it('no acepta datos personales como identificador del título', async () => {
    const router = createMemoryRouter([
      {
        element: <TituloPagina />,
        children: [
          {
            path: '/',
            handle: { titulo: ({ codigo }: { codigo?: string }) => codigo ?? 'Empleado' },
            element: <Registro codigo="persona@example.test" />,
          },
        ],
      },
    ]);
    render(<RouterProvider router={router} />);
    await screen.findByText('Detalle cargado');
    await waitFor(() => expect(document.title).toBe('Empleado | nomina2'));
  });
});
