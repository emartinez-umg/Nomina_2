import type { DriveStep } from 'driver.js';
import type { Rol } from '../../features/auth/api/auth';
import type { DefinicionAyuda } from './HelpProvider';

// Driver interpreta HTML: los títulos y hints pueden contener nombres o texto de la API.
const escapar = (texto: string) =>
  texto.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]!,
  );
const visible = (elemento: Element) =>
  !elemento.closest('[hidden], [aria-hidden="true"]') && elemento.getClientRects().length > 0;
export function pasosVisibles(
  ayuda: DefinicionAyuda,
  rol: Rol | undefined,
  alcance: ParentNode,
): DriveStep[] {
  const pasos: DriveStep[] = [];
  const agregar = (elemento: Element, titulo: string, descripcion: string) => {
    if (visible(elemento))
      pasos.push({
        element: elemento,
        popover: { title: escapar(titulo), description: escapar(descripcion) },
      });
  };
  if (alcance instanceof HTMLDialogElement)
    agregar(
      alcance,
      'Revisa antes de confirmar',
      'Esta ventana conserva la operación pendiente. Comprueba la persona, fechas, importes y efectos indicados. Confirmar o Guardar envía los cambios; Cancelar, Cerrar o Escape permite volver. Durante el envío espera el resultado para evitar duplicados. Si aparece un conflicto, vuelve a consultar los datos antes de intentarlo de nuevo.',
    );
  for (const paso of ayuda.pasos) {
    if (paso.roles && (!rol || !paso.roles.includes(rol))) continue;
    const elemento = alcance.querySelector(`[data-tour="${paso.elemento}"]`);
    if (elemento) agregar(elemento, paso.titulo, paso.descripcion);
  }
  // Complementa las secciones declarativas de cada módulo con todos los campos realmente visibles.
  for (const campo of alcance.querySelectorAll('[data-campo]')) {
    if (!visible(campo)) continue;
    const control = campo.querySelector<HTMLInputElement>('input:not([type="hidden"]), textarea');
    if (!control || control.disabled) continue;
    const hint = campo.querySelector('.campo-hint')?.textContent?.trim() ?? '';
    const seleccion = control.getAttribute('role') === 'combobox';
    const formato = seleccion
      ? 'Escribe para buscar y elige una opción de la lista con clic o con las flechas y Enter. Escribir un nombre sin seleccionarlo no asigna el registro. Escape cierra las opciones.'
      : control.inputMode === 'numeric'
        ? 'Usa únicamente dígitos y los separadores mostrados. Las fechas se ingresan como dd/mm/aaaa; el calendario deshabilita fechas inválidas. Al pegar se retiran caracteres incompatibles: verifica el resultado.'
        : control.inputMode === 'decimal'
          ? 'Escribe el importe sin signo negativo y con los decimales indicados. En moneda, Q es quetzales y el punto separa centavos. Revisa el valor después de pegarlo.'
          : 'Respeta el formato y la longitud indicados; al pegar se retiran caracteres incompatibles. Revisa el contenido antes de guardar.';
    agregar(
      campo,
      campo.getAttribute('data-campo')!,
      `${hint} ${formato} ${control.required || control.getAttribute('aria-required') === 'true' ? 'El asterisco indica que es obligatorio.' : 'Si es opcional, déjalo vacío cuando no corresponda.'} Al salir se muestran errores junto al campo. El resumen del formulario indica qué corregir; el servidor vuelve a validar y puede rechazar duplicados, fechas o referencias que hayan cambiado.`,
    );
  }
  const errores = alcance.querySelector('.resumen-error, [role="alert"]');
  if (errores)
    agregar(
      errores,
      'Corregir errores',
      'Lee el mensaje y corrige los campos indicados. Un error de conexión permite reintentar; un conflicto exige actualizar la consulta. Los datos del formulario se conservan. Si tu sesión expiró, vuelve a iniciar sesión antes de continuar.',
    );
  if (alcance === document) {
    const comunes = [
      [
        'sidebar',
        'Navegación según tu rol',
        rol === 'EMPLEADO'
          ? 'Estas secciones muestran únicamente tus gestiones. En móvil abre Menú y elige una sección; Escape lo cierra. No compartas tu cuenta.'
          : 'El menú reúne los módulos permitidos por tu rol. En móvil abre Menú y elige una sección. La bitácora global y gestión de usuarios corresponden a ADMIN.',
      ],
      [
        'buscador',
        'Encontrar una sección',
        'Escribe el nombre de una sección y elige un resultado. Limpiar búsqueda cierra los resultados; esta búsqueda no consulta expedientes personales.',
      ],
      [
        'notificaciones',
        'Avisos y seguimiento',
        'Abre la campana para leer tus avisos y el contador pendiente. Ver abre el recurso autorizado; marcar leído no elimina la solicitud ni su historial. Si el recurso cambió de audiencia puede dejar de estar disponible.',
      ],
      [
        'usuario-menu',
        'Tu sesión',
        'Comprueba usuario y rol antes de trabajar. Cierra sesión al terminar, especialmente en equipos compartidos. Tras el tiempo de inactividad debes volver a ingresar; nunca compartas contraseñas.',
      ],
      [
        'ayuda-global',
        'Volver a consultar la ayuda',
        'Ayuda reinicia este recorrido cuando lo necesites. Cada formulario y ventana también tiene su botón de ayuda; ábrelo para conocer sus campos y confirmaciones. Usa Tab para mover el foco y Escape para cerrar ventanas.',
      ],
    ];
    for (const [selector, titulo, descripcion] of comunes) {
      const elemento = alcance.querySelector(`[data-tour="${selector}"]`);
      if (elemento) agregar(elemento, titulo!, descripcion!);
    }
  }
  return pasos;
}
