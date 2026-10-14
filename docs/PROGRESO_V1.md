# Progreso de nomina2 v1

## FASE V1-1 — Navegación horizontal y buscador

Estado: completada el 13/10/2026. Alcance limitado a A2 del adendo.

### Hecho

- Releído AGENTS.md completo, incluido el adendo. La rama `v1` y la etiqueta `v0.0` ya existían;
  se trabaja en esa rama y se incorpora al commit el adendo añadido en la solicitud anterior.
- Base comprobada antes de modificar la presentación: 324 unitarias (206 backend, 118 frontend),
  lint y tres E2E de inicio de sesión/aislamiento ADMIN, RH y EMPLEADO aprobados.
- `navigation.config.ts` centraliza grupos, destinos reales, iconos, descripciones, sinónimos y
  acciones rápidas por rol. Incluye los trece catálogos y las cinco variantes de novedades.
- Barra horizontal con categorías desplegables, icono/nombre/descripción por destino y resaltado
  de la ruta más específica. Paneles ajustados a los bordes de pantalla aun con categorías en varias filas.
- Teclado: Enter/Espacio abre categorías; izquierda/derecha recorre grupos; arriba/abajo recorre
  opciones; Inicio/Fin va a los extremos; Escape cierra y devuelve el foco. Clic fuera o salir con Tab cierra.
- Paleta cmdk abierta por clic, Ctrl+K o ⌘+K: resultados por grupo, sinónimos, normalización de
  acentos y distancia de edición con transposiciones para errores pequeños (p. ej. «boltea»).
- Acciones rápidas de alta de empleado, comisión, horas extra, descuento, préstamo y ausencia;
  para EMPLEADO, solicitar vacaciones y actualizar contacto. Abren pantallas existentes sin guardar.
- Cinco accesos recientes únicos por usuario, persistidos como IDs permitidos en
  `nomina2:navegacion:v1:{idUsuario}`. Se ignoran datos inválidos, destinos ajenos al rol y fallos de almacenamiento.
- Menú móvil/tablet mediante botón y acordeones bajo 1200 px; búsqueda siempre accesible,
  diálogo con foco contenido y restaurado al cerrar. Se preservan las migas de pan de las páginas.
- Eliminados configuración anterior, JSX, CSS y token de ancho del sidebar. Actualizados data-tour,
  ayuda global por rol y hints de búsqueda. Guía de navegación en docs/FRONTEND.md.
- Sin modificaciones en backend, migraciones ni reglas de negocio.

### Validación realizada

- Lint, TypeScript strict (incluidos E2E), Prettier y builds backend/frontend aprobados.
- 351 unitarias aprobadas (206 backend, 145 frontend), también con Node 20.20.2.
  Las 27 nuevas comprueban rutas/roles a partir del router, destinos reales, catálogos/novedades,
  búsqueda con sinónimos/errores, historial aislado/limitado, almacenamiento fallido, atajos,
  acciones rápidas, foco/teclado/cierre y ayuda de los tres roles.
- 13 E2E aprobados con Oracle/API reales: diez flujos previos y tres pruebas de navegación nueva.
  Tras ajustar la posición de paneles, las tres pruebas de navegación pasaron de nuevo, comprobando
  límites de todos los grupos, Ctrl/⌘ K, persistencia tras recargar, acciones rápidas y móvil.
- Regresión E2E final con Node 20.20.2: los 13 casos aprobados (2.1 minutos), incluido el ajuste
  definitivo de paneles. El esquema Oracle temporal se eliminó al terminar.
- Axe WCAG A/AA sin infracciones en paleta y acordeones de los tres roles. La matriz previa de
  todas las páginas, formularios, ayuda y portal móvil sigue aprobada.
- Capturas de escritorio, acordeones móviles y paletas inspeccionadas en `tmp/pdfs/navegacion-*`
  y `tmp/pdfs/paleta-*` (artefactos locales ignorados por Git).
- npm install/auditoría: cero vulnerabilidades. Build nginx con Node 20 aprobado;
  servicio web local reconstruido y saludable. verify:infra aprueba API/Oracle/nginx/React,
  rutas SPA, assets y worker PDF. API y volumen Oracle conservados.

### Decisiones

- Router y guards existentes conservados. Detalle y edición de registros se alcanzan desde su
  listado y acciones contextuales; no se inventan IDs de recursos en el menú. Las pruebas contrastan
  configuración con el árbol real de RequireSession/AppLayout y detectan destinos de otros roles.
- cmdk se integra dentro del diálogo nativo compartido para conservar el comportamiento accesible
  existente. El atajo evita apilar la paleta sobre formularios o confirmaciones abiertos.
- Se reutilizan colores, fuente, radios y sombras extraídos del mockup; el cambio de distribución
  horizontal está solicitado expresamente por A2. Las categorías pueden envolver en escritorio.
- El primer intento de pruebas falló por puertos locales bloqueados por el sandbox; al permitirlos
  Supertest pasó. Chromium faltaba inicialmente: instalado y verificados los tres logins antes del cambio.
- El host usa Node 24; se ejecutan también unitarias/E2E con Node 20 temporal, sin cambiar el Node
  del sistema. La imagen web se construye con Node 20.

### Supuestos

- «Simular pago» se reserva para A11. Boletas, reporte IGSS e historial mantienen su acceso dentro
  de Planilla; plantillas dentro de Solicitudes; parqueo y tienda siguen los flujos vigentes de v0.
- El historial guarda únicamente IDs de navegación, no datos de formularios ni expedientes.
  Persiste tras cerrar sesión para recordar opciones en el próximo acceso del mismo usuario.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE V1-1.
- A3–A12 quedan reservadas para sus fases; no se implementaron borradores ni cambios de nómina.

### Cómo probar

1. `docker compose up --build`; abrir https://localhost:8443/login y entrar con una cuenta real.
2. ADMIN/RH: abrir Personal, Organización, Novedades, Nómina y las demás categorías. EMPLEADO:
   revisar Inicio, Mis gestiones, Vacaciones, Anuncios y eventos y Mis datos. Usuarios/Bitácora solo ADMIN.
3. Pulsar Ctrl+K o ⌘+K; buscar «boltea», «agenda» o «constancia». Usar flechas y Enter, probar
   acciones rápidas, recargar y comprobar Recientes. Escape devuelve el foco; clic fuera cierra categorías.
4. A 390 px abrir Menú, desplegar acordeones y navegar; probar Buscar, campana, Ayuda y Mi cuenta.
5. Con Node 20 y `npm ci`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
   `npm run format:check`, `npm run test:e2e` (Oracle en Docker) y `npm run verify:infra`.

## FASE V1-2 — Autoguardado de borradores en el navegador

Estado: completada el 13/10/2026. Alcance limitado a A3 del adendo; rama `v1`.

### Hecho

- Leídos AGENTS.md con el adendo completo y el progreso de v1. Inicio con árbol limpio.
- Hook `useFormDraft(formKey, recordId, { form, version, ... })` integrado con React Hook Form,
  debounce de 500 ms y claves por usuario/formulario/registro. El contenido versionado conserva
  fecha, valores y paso; versiones incompatibles o JSON dañado se descartan sin romper el formulario.
- `useDraftValues` adapta los editores controlados existentes a RHF, incluidos objetos, arreglos,
  setters funcionales y cambios de identidad del registro. No mezcla datos entre altas/ediciones.
- Aviso accesible con antigüedad en minutos, Continuar, Descartar borrador con confirmación e iconos,
  indicador Borrador guardado y orientación sobre persistencia local, limpieza y archivos excluidos.
- Limpieza después del éxito de la API y al descartar; logout exitoso elimina los borradores y cancela
  timers. Login y consulta inicial purgan los ajenos. La expiración por inactividad los conserva para
  la misma cuenta. El saneamiento excluye credenciales, contraseñas, tokens, archivos/adjuntos y
  objetos no JSON, también anidados. No se modifica el comportamiento de las cookies ni del backend.
- Escritura pendiente vaciada al ocultar/cerrar la pestaña o desmontar el formulario; tolerancia a
  almacenamiento bloqueado/lleno con aviso y posibilidad de continuar editando/guardando.
- Integración en todos los formularios de escritura existentes: empleados y cambios salariales/baja;
  trece catálogos (incluidos parámetros y empresa), horarios y sus acciones; descuentos, préstamos,
  comisiones, horas extra, ausencias y anulaciones; publicaciones de anuncios/eventos y eliminación;
  solicitudes, resolución de parqueo/datos críticos, plantillas y Mis datos; usuarios y sus acciones;
  solicitudes/resolución/historia de vacaciones; periodos, reapertura/devolución, fiscal, configuración
  IGSS y prestaciones/constancias/operaciones. Carga masiva conserva su modalidad sin guardar el CSV.
- Se conserva la sección enfocada del empleado, la revisión legal con motivo revalidado, la operación
  fiscal y toda la sección/listas/fila parcial de IGSS. Los destinatarios seleccionados aún sin agregar
  también se conservan. Descartar invalida revisiones/vistas previas dependientes de los datos.
- Hints y recorrido compartido de borradores aplicados a todos los formularios y roles; ayuda de sesión
  actualizada. Guía técnica y de uso en docs/FRONTEND.md. No había bloqueadores de navegación ni
  avisos de cambios sin guardar que retirar; sigue sin haberlos.

### Validación realizada

- Lint, TypeScript strict (incluidos E2E), Prettier y builds backend/frontend aprobados con Node 20.20.2.
- 392 pruebas aprobadas (206 backend, 186 frontend). Las 41 nuevas verifican debounce, restauración
  explícita, dirty de RHF, paso, descarte confirmado, limpieza y timers, expiración, cambio de usuario,
  aislamiento por registro, versión distinta, JSON dañado, exclusión recursiva de campos sensibles,
  almacenamiento fallido/recuperado, StrictMode, adaptador, autenticación y ayuda de los tres roles.
  Incluyen una regresión real de componente: descartar desde revisión legal invalida esa instantánea.
- Los trece E2E previos aprobaron con API/Oracle reales, incluida la matriz de páginas y axe A/AA por
  rol y portal móvil. Tres E2E nuevos aprobados con Node 20: cerrar pestaña y recuperar empleado,
  descarte/logout, alta y edición de catálogo con conflicto 409 y limpieza exitosa, sección/fila parcial
  IGSS y purga al entrar con otra cuenta. Los esquemas Oracle temporales se eliminaron al finalizar.
- El primer E2E de edición usó un nombre de botón incorrecto; corregido a su aria-label existente
  «Editar registro …» y los tres flujos nuevos pasaron. Sin cambios en la funcionalidad por ese ajuste.
- Captura de borrador del empleado inspeccionada y axe sin infracciones; artefactos locales en
  `tmp/pdfs/borrador-empleado.png` ignorados por Git.

### Decisiones

- Los borradores guardan entradas del usuario, nunca resultados de cálculo, PDFs, hashes de revisión
  ni credenciales generadas. Restaurar no confirma acciones; la API vuelve a validar antes de escribir.
- Se ofrece Continuar antes de aplicar el borrador; mientras se decide no se sobrescribe el existente.
  Cancelar/cerrar modales conserva datos para reabrir la misma acción, sin ejecutar escrituras.
- `draft.limpiar()` cancela timers e ignora los resets inmediatos posteriores al éxito. Así el cierre o
  desmontaje no recrea un borrador eliminado. Eventos de sesión también cancelan escrituras antiguas.
- Se usa el lenguaje visual y los componentes existentes. Los formularios de autenticación contienen
  secretos y no generan borradores; los filtros son consultas, no formularios de alta/edición.
- Pruebas aisladas existentes ahora proporcionan identidad de sesión y limpian almacenamiento entre
  casos; no se cambiaron reglas de negocio ni se redujeron aserciones previas.

### Supuestos

- Persistencia local por navegador/origen: al volver se abre el mismo formulario, registro o acción
  contextual. No se implementa sincronización de borradores con el servidor.
- Los archivos deben seleccionarse y validarse otra vez; por eso carga masiva conserva modalidad,
  pero su vista previa/importación requiere nuevamente el CSV. Una expiración no equivale a logout.
- Los motivos se conservan; aprobaciones, revisiones de importes y envíos requieren confirmación
  actual. No se restaura automáticamente una confirmación destructiva ni un envío en curso.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE V1-2.
- A4–A12 siguen reservadas para sus fases. No se tocaron backend, migraciones ni cálculo de nómina.

### Cómo probar

1. `docker compose up --build`; entrar con una cuenta real y abrir cualquier formulario de alta o edición.
2. Escribir, esperar Borrador guardado, cerrar la pestaña y volver al mismo formulario/registro/acción.
   Pulsar Continuar: se recuperan datos y sección. Probar también IGSS, parámetros legales y plantillas.
3. Descartar borrador → Cancelar conserva; Confirmar devuelve valores iniciales. Guardar con éxito elimina;
   un error del servidor conserva. Cerrar sesión elimina todos; una cuenta distinta purga los ajenos.
4. Volver a seleccionar adjuntos/CSV. Bloquear almacenamiento muestra el aviso y permite guardar por API.
5. Con Node 20: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run format:check`.
   E2E: `npm run test:e2e` o `npm run test:e2e -- --grep 'FASE V1-2'` con Oracle en Docker.
