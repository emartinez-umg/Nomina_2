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
      '<div data-campo="Monto"><input inputmode="decimal" required><p class="campo-hint">Importe por quincena.</p></div><div data-campo="Oculto" hidden><input></div>';
    const pasos = pasosVisibles({ id: 'x', pasos: [] }, 'EMPLEADO', document);
    expect(pasos).toHaveLength(1);
    expect(pasos[0]!.popover!.description).toMatch(/centavos.*obligatorio.*servidor/);
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
