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
    // Un contenedor sin caja deja fluir los campos; el foco visual recae en su primer campo.
    const objetivo = visible(elemento) ? elemento : elemento.querySelector('[data-campo]');
    if (objetivo && visible(objetivo))
      pasos.push({
        element: objetivo,
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
  for (const borrador of alcance.querySelectorAll('[data-tour="borrador-formulario"]'))
    agregar(
      borrador,
      'Retomar formularios con borradores',
      'Mientras escribes, el formulario guarda un borrador en este navegador después de medio segundo. Puedes cerrar la pestaña o volver a abrir el mismo formulario y registro; pulsa Continuar para recuperar los datos y la sección. Descartar borrador pide confirmación, devuelve los valores iniciales y cancela cualquier autoguardado pendiente. Al cancelar con datos, elige Conservar borrador y salir o Descartar y salir; sin cambios se cierra directamente. Tras descartar no se crea otro borrador hasta que escribas de nuevo. Guardar con éxito elimina el borrador; un error lo conserva. Cerrar sesión explícitamente elimina todos tus borradores; entrar con otro usuario purga los ajenos. La expiración por inactividad permite recuperarlos al volver a entrar con la misma cuenta. Nunca se guardan contraseñas, tokens ni archivos: vuelve a seleccionar los adjuntos. Si el navegador bloquea el almacenamiento o se llena, verás el aviso y podrás seguir editando y guardar en el servidor.',
    );
  // Complementa las secciones declarativas de cada módulo con todos los campos realmente visibles.
  for (const campo of alcance.querySelectorAll('[data-campo]')) {
    if (!visible(campo)) continue;
    const control = campo.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]), textarea, select',
    );
    if (!control) continue;
    const hint = campo.querySelector('.campo-hint')?.textContent?.trim() ?? '';
    const seleccion = control.getAttribute('role') === 'combobox';
    const formato = control.disabled
      ? 'El campo está bloqueado por las condiciones de esta operación. Revisa la explicación y completa o cambia primero el dato del que depende; el servidor mantiene la misma restricción.'
      : control instanceof HTMLSelectElement
        ? 'Selecciona una opción de la lista. Con teclado usa Tab para enfocar, flechas para recorrer y Enter para elegir; no se admite texto libre fuera del catálogo.'
        : control.readOnly
          ? 'Este dato es de solo lectura. El sistema lo obtiene automáticamente; revisa la vista previa y el valor definitivo después de guardar. No debes escribirlo ni modificarlo.'
          : seleccion
            ? 'Escribe para buscar y elige una opción de la lista con clic o con las flechas y Enter. Escribir un nombre sin seleccionarlo no asigna el registro. Escape cierra las opciones.'
            : control.inputMode === 'numeric'
              ? control.getAttribute('placeholder')?.includes('dd/mm')
                ? 'Ingresa la fecha como dd/mm/aaaa. El calendario deshabilita fechas inválidas; comprueba los límites y la relación con otras fechas antes de guardar.'
                : 'Usa únicamente los dígitos y separadores del formato indicado. Al escribir o pegar se retiran caracteres incompatibles; verifica la longitud y el resultado antes de guardar.'
              : control.inputMode === 'decimal'
                ? 'Escribe el importe sin signo negativo y con los decimales indicados. En moneda, Q es quetzales y el punto separa centavos. Revisa el valor después de pegarlo.'
                : 'Respeta el formato y la longitud indicados; al pegar se retiran caracteres incompatibles. Revisa el contenido antes de guardar.';
    agregar(
      campo,
      campo.getAttribute('data-campo')!,
      `${hint} ${formato} El ancho se ajusta al dato esperado; en móvil se adapta al espacio disponible. ${control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? (control.maxLength > 0 ? `El límite es de ${control.maxLength} caracteres, aunque el texto pueda desplazarse dentro del control. ` : '') : ''}${control.required || control.getAttribute('aria-required') === 'true' ? 'El asterisco indica que es obligatorio.' : 'Si es opcional, déjalo vacío cuando no corresponda.'} Al salir se muestran errores junto al campo. El resumen del formulario indica qué corregir; el servidor vuelve a validar y puede rechazar duplicados, fechas o referencias que hayan cambiado.`,
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
        'navegacion',
        'Navegación según tu rol',
        rol === 'EMPLEADO'
          ? 'La barra azul agrupa tus gestiones personales. Inicio abre tu tablero directamente, sin desplegable. Abre una categoría con clic, Enter o Espacio; usa flechas para recorrer categorías y opciones. Escape cierra el grupo y devuelve el foco. En móvil pulsa Menú para desplegar los acordeones; la opción activa se resalta con fondo y subrayado. Solo aparecen secciones de tu rol.'
          : 'La barra azul agrupa los módulos permitidos por tu rol. Inicio abre tu tablero directamente, sin desplegable. Abre categorías con clic, Enter o Espacio; flechas izquierda/derecha recorren categorías y arriba/abajo sus opciones. Inicio y Fin van a los extremos. Escape o clic fuera cierra el panel. En móvil pulsa Menú y abre los acordeones. Usuarios y Bitácora corresponden a ADMIN; el fondo y el subrayado identifican la sección activa.',
      ],
      [
        'buscador',
        'Encontrar una sección',
        'Pulsa Buscar o Ctrl+K / ⌘+K desde cualquier página. Busca nombres o sinónimos como boleta, agenda o constancia; también se toleran pequeños errores de escritura. Solo verás destinos de tu rol, con su categoría, acciones rápidas y los cinco últimos accesos de tu usuario en este navegador. Usa flechas y Enter para abrir, o Escape para cerrar y volver. Las acciones rápidas abren formularios sin guardar cambios. No se buscan expedientes personales.',
      ],
      [
        'notificaciones',
        'Avisos y seguimiento',
        'Abre la campana para leer tus avisos y el contador pendiente. Ver abre el recurso autorizado; marcar leído no elimina la solicitud ni su historial. El ícono de papelera borra ese aviso de tu cuenta. Borrar todas requiere confirmación e incluye los avisos anteriores a los 30 visibles; actualiza el contador sin afectar a otros destinatarios ni los documentos. Si el recurso cambió de audiencia puede dejar de estar disponible.',
      ],
      [
        'usuario-menu',
        'Tu sesión',
        'Comprueba tu nombre y rol antes de trabajar. Se muestra tu primer nombre y primer apellido de la ficha; sin ficha se utiliza el nombre de la cuenta con espacios. Cerrar sesión elimina todos tus borradores de formularios de este navegador. Tras el tiempo de inactividad debes volver a ingresar; tus borradores se conservan para la misma cuenta. Entrar con otro usuario elimina los ajenos. Nunca compartas contraseñas.',
      ],
      [
        'ayuda-global',
        'Volver a consultar la ayuda',
        'El recorrido solo comienza al pulsar Ayuda; no aparece una invitación automática al entrar. Puedes reiniciarlo siempre que lo necesites. Cada formulario y ventana también tiene su botón de ayuda; ábrelo para conocer sus campos y confirmaciones. Usa Tab para mover el foco y Escape para cerrar ventanas.',
      ],
    ];
    for (const [selector, titulo, descripcion] of comunes) {
      const elemento = alcance.querySelector(`[data-tour="${selector}"]`);
      if (elemento) agregar(elemento, titulo!, descripcion!);
    }
  }
  return pasos;
}
