import { describe, expect, it, vi, afterEach } from 'vitest';
import { pasosVisibles } from './pasosVisibles';
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
function visibles() {
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
    { width: 100, height: 20 },
  ] as unknown as DOMRectList);
}
describe('Ayuda final por contexto', () => {
  it.each(['ADMIN', 'RH', 'EMPLEADO'] as const)(
    'explica borradores y sus límites para %s',
    (rol) => {
      visibles();
      document.body.innerHTML =
        '<dialog open><aside data-tour="borrador-formulario"></aside></dialog>';
      const pasos = pasosVisibles(
        { id: 'formulario', pasos: [] },
        rol,
        document.querySelector('dialog')!,
      );
      expect(pasos[1]!.popover!.description).toMatch(
        /medio segundo.*Continuar.*Descartar.*confirmación/,
      );
      expect(pasos[1]!.popover!.description).toMatch(
        /Cerrar sesión.*otro usuario.*contraseñas, tokens ni archivos/,
      );
    },
  );
  it.each(['ADMIN', 'RH', 'EMPLEADO'] as const)(
    'explica navegación y buscador nuevos para %s',
    (rol) => {
      visibles();
      document.body.innerHTML =
        '<div data-tour="navegacion"></div><div data-tour="buscador"></div>';
      const pasos = pasosVisibles({ id: 'layout', pasos: [] }, rol, document);
      expect(pasos).toHaveLength(2);
      expect(pasos[0]!.popover!.description).toMatch(/categor|barra/i);
      expect(pasos[0]!.popover!.description).toMatch(/móvil/);
      expect(pasos[1]!.popover!.description).toMatch(/Ctrl\+K.*⌘\+K.*cinco.*usuario/);
      expect(pasos[1]!.popover!.description).toMatch(/acciones rápidas.*sin guardar/);
    },
  );
  it('limita los objetivos al diálogo y filtra roles', () => {
    visibles();
    document.body.innerHTML =
      '<section data-tour="detalle"></section><dialog open><section data-tour="detalle"></section><div data-tour="admin"></div></dialog>';
    const dialogo = document.querySelector('dialog')!;
    const pasos = pasosVisibles(
      {
        id: 'x',
        pasos: [
          { elemento: 'detalle', titulo: 'Detalle', descripcion: 'Texto útil' },
          { elemento: 'admin', titulo: 'Admin', descripcion: 'Control', roles: ['ADMIN'] },
        ],
      },
      'RH',
      dialogo,
    );
    expect(pasos).toHaveLength(2);
    expect(pasos[1]!.element).toBe(dialogo.querySelector('section'));
  });
  it('incluye todos los campos visibles con formato, errores y corrección', () => {
    visibles();
    document.body.innerHTML =
      '<div data-campo="Monto"><input inputmode="decimal" required><p class="campo-hint">Importe por quincena.</p></div><div data-campo="Mes"><select required><option>Octubre</option></select><p class="campo-hint">Mes de la operación.</p></div><div data-campo="Código"><input readonly><p class="campo-hint">Código permanente.</p></div><div data-campo="Teléfono"><input inputmode="numeric"><p class="campo-hint">Ocho dígitos.</p></div><div data-campo="Fecha"><input inputmode="numeric" placeholder="dd/mm/aaaa"><p class="campo-hint">Fecha de la operación.</p></div><div data-campo="Oculto" hidden><input></div>';
    const pasos = pasosVisibles({ id: 'x', pasos: [] }, 'EMPLEADO', document);
    expect(pasos).toHaveLength(5);
    expect(pasos[0]!.popover!.description).toMatch(/centavos.*obligatorio.*servidor/);
    expect(pasos[1]!.popover!.description).toMatch(/lista.*teclado.*texto libre/);
    expect(pasos[2]!.popover!.description).toMatch(
      /solo lectura.*automáticamente.*No debes escribir/,
    );
    expect(pasos[3]!.popover!.description).not.toMatch(/dd\/mm/);
    expect(pasos[4]!.popover!.description).toMatch(/dd\/mm\/aaaa.*calendario/);
  });
  it('mantiene secciones de ayuda en contenedores sin caja y explica el límite del campo', () => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return (this.hasAttribute('data-campo')
        ? [{ width: 100, height: 20 }]
        : []) as unknown as DOMRectList;
    });
    document.body.innerHTML =
      '<div data-tour="nombre"><div data-campo="Nombre"><input maxlength="50"><p class="campo-hint">Nombre del catálogo.</p></div></div>';
    const pasos = pasosVisibles(
      {
        id: 'formulario',
        pasos: [
          {
            elemento: 'nombre',
            titulo: 'Nombre de catálogo',
            descripcion: 'Identifica el catálogo.',
          },
        ],
      },
      'RH',
      document,
    );
    expect(pasos[0]!.element).toBe(document.querySelector('[data-campo]'));
    expect(pasos[1]!.popover!.description).toMatch(/ancho.*móvil.*50 caracteres/);
  });
  it('escapa contenido de API antes de pasarlo a driver', () => {
    visibles();
    document.body.innerHTML = '<div data-tour="x"></div>';
    const pasos = pasosVisibles(
      {
        id: 'x',
        pasos: [{ elemento: 'x', titulo: '<img>', descripcion: '<script>alert(1)</script>' }],
      },
      undefined,
      document,
    );
    expect(pasos[0]!.popover!.description).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
