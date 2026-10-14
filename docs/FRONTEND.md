# Base del frontend — FASE 3

## Referencia visual

Se revisaron las 38 páginas de `MOCKUP/mockup.pdf`; las páginas 1–5 definen autenticación,
6 el shell y tarjetas, 7–10 tablas/formularios/modales y 29–32 administración. Esta fase
adapta esas estructuras al dominio de Nómina y a los roles del backend.

| Token                         | Valor actual                    |
| ----------------------------- | ------------------------------- |
| Marca / sidebar / títulos     | `#1d395e`                       |
| Acción primaria               | `#28622a`                       |
| Acento del emblema            | `#2e245b`                       |
| Fondo / superficie            | `#f4f4f4` / `#ffffff`           |
| Texto secundario / borde      | `#576573` / `#d5dde2`           |
| Radio tarjeta / campo / login | 12 px / 10 px / píldora         |
| Sombra tarjeta                | `0 8px 20px rgb(0 0 0 / 12%)`   |
| Sidebar / cabecera            | 240 px / 72 px (desktop)        |
| Campo / sección               | 16 px / 32 px                   |
| Familia                       | Trebuchet MS, Arial, sans-serif |

La paleta principal se muestreó del raster del PDF; fuente, radios y medidas se aproximan
porque no hay metadatos tipográficos utilizables. Los tokens están en
`frontend/src/styles/tokens/index.ts` y Tailwind los importa directamente. Los botones generales
usan radio de control; los del login conservan la píldora. `frontend/public/logo-mockup.png`
es el emblema recortado del PDF, sin los textos de empresa de ejemplo.

La marca visible es **Nómina** hasta disponer de configuración de empresa. No se muestran nombres,
saldos, contadores ni estadísticas inventados. Los accesos pendientes están deshabilitados y
explican el motivo. Las tarjetas principales siguen el esquema de dos tarjetas del mockup;
el portal de empleado conserva sus accesos en una columna en móvil.

## Rutas y autenticación

- `/login`: usuario y contraseña reales; errores en español y validación al salir del campo.
- `/cambiar-contrasena`: cambio obligatorio, política y confirmación; no envía la confirmación a la API.
- `/admin`, `/rh`, `/mis-gestiones`: entradas independientes protegidas por rol y sesión.
- `/salud`: comprobación técnica pública conservada de FASE 0, con ayuda contextual.
- Otras rutas regresan a la entrada autorizada. Escribir una ruta de otro rol redirige a la propia.

El login usa **usuario**, no correo, porque ese es el contrato de FASE 2. No se incorporan
Google, registro, recuperación pública ni sesiones persistentes de “recordarme”. El administrador
restablece contraseñas mediante la API existente; su pantalla corresponde a una fase posterior.

`SessionProvider` consulta `/auth/sesion`, verifica al recuperar el foco y vacía los datos privados
al cerrar/expirar/cambiar de identidad. No hace polling de sesión para no prolongar la inactividad.
El backend sigue siendo la autoridad de permisos y vencimiento. Un fallo de red ofrece reintento;
no se interpreta como cierre de sesión.

`lib/http.ts` valida la respuesta con Zod, usa `/api` del mismo origen y cookies httpOnly.
Recupera CSRF antes de una escritura y lo conserva solo en memoria; lo rota con login/cambio.
No repite escrituras fallidas. `CSRF_INVALIDO` elimina el token para recuperarlo en el siguiente
intento; si la recuperación indica una sesión irrecuperable, vuelve al login. Los 401 autenticados
activan el guard; las credenciales inválidas permanecen en el formulario. El código de cambio
obligatorio también activa su pantalla. `mapearErrores` admite una lista explícita de campos y
mapea las respuestas 400/409/422 del backend a React Hook Form.

## Componentes

`components/ui/`: Button, Card, ConfirmModal/Modal, Tooltip, Badge, Table, Skeleton, EmptyState,
ToastProvider/useToast, Tabs, Breadcrumbs y NotificationBell (contador opcional desde la API). Todos los iconos salen de `ui/icons.ts`.
`Button` exige icono y soporta carga, variantes, solo icono con nombre/tooltip y motivo de bloqueo.
El modal usa dialog nativo: foco, Escape, contención y restauración. Tabs admite flechas/Home/End.

`Table` recibe filas del servidor, total, página/límite, orden y callbacks. Los callbacks deben
actualizar los query params de la API mediante TanStack Query; no ordena ni pagina un lote local.
Las búsquedas, filtros y exportaciones de cada CRUD se implementarán junto con sus endpoints.

`components/forms/`: TextField, NumberField, MoneyField/CurrencyField, DateField, DpiField,
NitField, PhoneField, EmailField, SelectField, TextAreaField, FileField y FormErrorSummary.
Los campos usan un contrato controlado (`value`/`onValueChange`/`onBlur`/`error`) compatible con
Controller de React Hook Form. `inputRef` permite enfocar errores desde React Hook Form.
Cada campo incluye etiqueta, obligatorio, hint con tooltip, límites y atributos accesibles.

- Usar `form-grid` (12 columnas) y `ancho="corto"/"medio"/"ancho"`; en móvil ocupan 12 columnas.
- TextField admite tipos texto, nombre, usuario y contraseña. Contraseñas conservan lo escrito.
- DPI se muestra `#### ##### ####`, teléfono `#### ####`, NIT con guion y K en mayúscula.
- MoneyField usa Decimal y muestra prefijo Q con agrupación y dos decimales al salir. Al enviar
  importes al backend, quitar comas y conservar la cadena decimal; nunca convertir a float.
- DateField entrega ISO `aaaa-mm-dd` cuando está completo y muestra `dd/mm/aaaa`. Durante edición
  puede entregar un valor incompleto: validarlo con Zod antes de enviar. El calendario recibe
  min/max/deshabilitar y el texto manual aplica las mismas restricciones al salir.
- SelectField filtra etiquetas sin distinguir acentos, admite teclado y solo entrega valores del catálogo.
- FileField verifica extensión/MIME declarado y tamaño. Los endpoints futuros deben inspeccionar
  también el contenido; el atributo accept del navegador no protege al servidor.

`lib/validadores.ts` cubre formato de DPI, NIT módulo 11, teléfono, correo, fechas reales,
edad parametrizable, ingreso, egreso, rangos sin traslape, días laborales/feriados, vacaciones,
fechas efectivas fuera de periodos cerrados y eventos futuros. Las restricciones de negocio
requieren datos reales del endpoint: no se suponen horarios ni periodos del empleado. DPI valida
13 dígitos; no consulta identidad en RENAP. NIT valida el dígito; no consulta inscripción en SAT.

## Ayuda

`HelpProvider` usa driver.js. Cada página llama `usePageHelp(definicion, rol)` con pasos en
`features/<modulo>/help/` y selectores `data-tour`. Los pasos pueden restringirse a roles.
La primera visita ofrece el recorrido; puede rechazarse y repetirse desde la barra superior.
Solo la preferencia de ayuda se guarda en localStorage, nunca credenciales ni tokens.
Login, cambio obligatorio, inicio por rol y salud tienen recorridos completos.

## Ejecutar y verificar

1. Oracle saludable: `docker compose up -d nomina2-db`.
2. Node 20 y `.env` configurado: `npm ci`, `npm run db:setup` si aún no se instaló el esquema.
3. `NODE_ENV=development npm run dev`; abrir `http://localhost:5173/login`.
4. Entrar con ADMIN_USER/ADMIN_PASSWORD de `.env`; el primer ingreso exige cambiar la contraseña.
   Los seeds posteriores no restablecen la clave cambiada. Después probar ayuda, recarga y logout.
5. `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
6. Node 20 alternativo: `docker build --target build -f frontend/Dockerfile -t nomina2-frontend-tests .`
   y `docker run --rm nomina2-frontend-tests npm test -w frontend`.

Compose mantiene `NODE_ENV=production` y cookies Secure: la autenticación desplegada requiere
HTTPS. Para HTTP local usar el servidor de desarrollo anterior, no desactivar Secure en producción.

La validación de esta fase incluyó Chromium real con API/Oracle thin y cuentas exclusivamente de
un esquema N2UI aleatorio: tres roles, cambio obligatorio, rotación CSRF, recarga, guard de rol,
expiración provocada en Oracle, logout, ayuda login/layout, notificaciones UI y móvil de 390 px.
El esquema y procesos se eliminaron al terminar; no se cambiaron cuentas de aplicación.
Las fixtures solo existen en pruebas, no en las pantallas de producto.

## Cierre — ayuda y accesibilidad

`pasosVisibles` complementa los pasos declarativos por módulo con orientación de todos los campos
visibles (formato, selección/teclado, pegado, errores y corrección). Escapa texto antes de Driver y
usa elementos DOM dentro del diálogo activo. Modal ofrece ayuda universal, incluso en confirmaciones.
La bienvenida está integrada en el contenido para no cubrir botones. Se añadieron nombres accesibles
estables, salto al contenido y foco blanco en el sidebar. Usuarios ADMIN y Datos de empresa usan
los componentes y tokens existentes. Playwright/axe recorren páginas por rol y portal de 390 px.

## Navegación v1 (FASE V1-1, A2)

La barra superior reemplaza al menú lateral. `components/layout/navigation.config.ts` define
los grupos, rutas, iconos, descripciones y sinónimos por ADMIN, RH y EMPLEADO; tanto los
acordeones y desplegables como la paleta leen esa configuración. Los destinos corresponden
al router existente, incluidos los trece catálogos y las cinco clases de novedades. Los detalles
y la edición de registros conservan sus acciones contextuales dentro de cada módulo.

Enter/Espacio abre una categoría; izquierda/derecha cambia de categoría; arriba/abajo abre y
recorre opciones; Inicio/Fin va a los extremos. Escape cierra y devuelve el foco; salir con Tab
o hacer clic fuera también cierra. La opción activa se determina por la ruta más específica.
En pantallas menores de 1200 px aparece el botón Menú con acordeones; Buscar sigue visible.

Buscar o Ctrl+K / ⌘+K abre la paleta de [cmdk](https://github.com/dip/cmdk). Acepta sinónimos,
acentos y pequeños errores de escritura; muestra la categoría y permite elegir con flechas y
Enter. Escape cierra el diálogo y restaura el foco. Los cinco accesos recientes se guardan por
ID de usuario y se filtran contra sus permisos actuales; almacenamiento bloqueado no impide
navegar. Las acciones rápidas abren los formularios actuales, sin ejecutar escrituras.

El historial usa `nomina2:navegacion:v1:{idUsuario}` y almacena solo IDs de opciones, sin datos
de expedientes. Simulación de pagos y las demás reglas del adendo se reservan para fases
posteriores. `docs/PROGRESO_V1.md` registra las pruebas y decisiones de esta fase.

## Borradores v1 (FASE V1-2, A3)

`hooks/useFormDraft.ts` conecta `useFormDraft(formKey, recordId, { form, version })` con
React Hook Form. Cada esquema declara una versión; increméntala si cambian los datos
compatibles del formulario. La clave es `nomina2:borrador:{usuarioId}:{formKey}:{recordId|nuevo}`;
el contenido incluye versión, fecha de guardado, valores y paso opcional. No se guardan
formularios intactos ni se considera una hidratación desde la API como una edición.

Incluye `FormDraftNotice` en el formulario y llama `draft.limpiar()` únicamente después de
confirmar el éxito de la API. Cancelar, navegar, cerrar una ventana o perder la sesión por
inactividad conserva el borrador. Al regresar al mismo formulario y registro, Continuar
restaura los valores conservando la validación habitual y el estado modificado de RHF.
Descartar exige confirmación y restablece los valores iniciales. Usa `alDescartar` para
invalidar revisiones, vistas previas o confirmaciones que dependan de esos datos.

Las opciones `paso` y `restaurarPaso` conservan la sección actual del expediente y la revisión
legal; el editor IGSS conserva sección, listas y fila parcial, y Fiscal su operación seleccionada.
`useDraftValues` adapta editores controlados a RHF: recibe valores iniciales, habilitación y
opciones de versión/descarte; `campo(nombre)` devuelve el valor y su setter compatible con
actualizaciones funcionales. Formularios diferentes y ediciones de registros distintos usan
claves independientes. Los modales se retoman abriendo la misma acción desde su listado/ficha.

El debounce es de 500 ms. `pagehide`, ocultar la pestaña y desmontar el formulario vacían la
escritura pendiente, sin avisos que bloqueen la navegación. Login y consulta inicial de sesión
purgan borradores ajenos; logout exitoso los elimina y cancela escrituras pendientes, también
mediante eventos de almacenamiento entre pestañas. Las preferencias de ayuda y navegación
se conservan. Almacenamiento bloqueado o lleno muestra un aviso y permite seguir editando.

El saneamiento recursivo excluye contraseñas, tokens, credenciales, archivos, adjuntos,
contenido base64 y objetos del navegador. Solo se conserva JSON de los campos editables.
Autenticación/cambio de contraseña y filtros de consulta no generan borradores de escritura.
En carga masiva se conserva la modalidad; el CSV debe seleccionarse y validarse otra vez.
Las confirmaciones y los cálculos derivados requieren revisión actual; nunca se ejecuta una
acción de negocio automáticamente por restaurar un borrador. Los hints del aviso y el paso
compartido de `pasosVisibles` explican estos límites en todos los módulos y roles.
