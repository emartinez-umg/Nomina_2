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

## FASE V1-3 — Generación automática de códigos

Estado: completada el 14/10/2026. Rama `v1`, alcance A4.

### Hecho

- Leídos AGENTS.md con adendo y progresos de v0/v1. Árbol limpio al iniciar; V000–V020 intactas.
- `generarCodigoGenerico(palabra, longitudMax = 3)` normaliza mayúsculas, acentos/ñ/ü y caracteres;
  usa iniciales significativas en compuestas, omite conectores, vuelve a la primera palabra cuando
  quedan menos de dos iniciales y recorta. Colisiones prueban opción B y después sufijos desde 2
  sobre la opción A. Pruebas de los siete casos solicitados, longitudes y entradas sin palabras útiles.
- V021 agrega CONFIG_CODIGOS, SECUENCIAS_CODIGOS y REGISTRO_CODIGOS con identity ALWAYS,
  UNIQUE, auditoría y FKs indexadas. El paquete N2_CODIGOS y los triggers asignan definitivamente
  dentro de la transacción de negocio; crean el contador tolerando concurrencia y bloquean su fila.
  Sin commits internos ni transacciones autónomas: falla de entidad/auditoría revierte las reservas.
- Configurados departamentos 3, puestos/jefaturas/horarios/centros 4 y los cuatro tipos 3. Bancos,
  feriados y parámetros usan 3. Reservas permanentes evitan reutilización tras eliminación física.
- Empleados EMP_<DEPTO>_<contador>, independiente por ID de departamento; traslados conservan el
  código original. Solicitudes SOL, préstamos PRE, descuentos DES, eventos EVT y anuncios ANU:
  prefijo/año/contador. El contador comienza con cuatro dígitos y crece sin truncamiento.
- Migración de todos los registros, incluidos inactivos, conservando CODIGO_ANTERIOR, PK, FK,
  importes y snapshots. Empleados ordenados por fecha de ingreso/id; transacciones por creación/id
  y año de creación. Las entidades sin código anterior conservan null en esa referencia.
- Parámetros separan CLAVE_INTERNA inmutable del código visible: migración conserva la clave
  semántica original; altas la derivan del nombre completo normalizado. Así RH puede crear, por
  ejemplo, Salario mínimo mensual sin escribir SALARIO_MINIMO_MENSUAL. Las vigencias conservan
  código/clave y validan traslapes. Tipos operativos conservan su alias para los cálculos/trámites.
- Seeds adaptados a claves preservadas/internas: repetibles sin duplicar catálogos ni alterar ajustes.
  Repositories de reglas, nómina, vacaciones, solicitudes y prestaciones mantienen sus referencias
  semánticas; no se modificaron fórmulas, porcentajes ni snapshots de periodos cerrados.
- GET /api/codigos/vista-previa validado con Zod, autenticado y sin reserva; RH/ADMIN consultan
  entidades permitidas, EMPLEADO solo solicitudes. Requiere haber cambiado contraseña temporal.
- CampoCodigo reutilizable de solo lectura, copiable, tooltip/hint, debounce de 250 ms y errores de
  API. Altas cambian la vista previa con nombre/departamento; edición muestra el código persistido.
  Todos los formularios de código interno manual lo reemplazan y los cuerpos omiten ese campo;
  backend también ignora códigos enviados por clientes anteriores. Oracle prohíbe cambiarlos.
- CSV de empleados actualizado a 28 columnas sin código; la importación asigna códigos en la
  transacción y el reporte incorpora los definitivos. Borradores de empleado/catálogos versión 2
  descartan el esquema anterior con códigos manuales. Formularios de transacciones muestran vista previa.
- Listados/búsquedas/CSV muestran códigos de solicitudes (incluidas vacaciones), préstamos,
  descuentos y comunicaciones; búsqueda de empleados incluye código. Catálogos permiten buscar
  código actual/anterior. Orden por código con lista blanca donde corresponde. Ayuda/hints actualizados.
- ERD, CATALOGOS, FRONTEND y README documentan tablas, API, numeración y operación.

### Validación realizada

- Lint, TypeScript strict, Prettier y builds de backend/frontend sin errores.
- 410 unitarias aprobadas: 220 backend y 190 frontend; 14 nuevas del algoritmo y cuatro del campo
  prueban lectura exclusiva, escritura/pegado bloqueados, API al cambiar nombre/departamento,
  conservación al trasladar/renombrar y fallo de consulta. Backend también probado con Node 20 Docker.
- Nueve pruebas nuevas Oracle/Supertest: migración con datos previos en los doce catálogos, empleados
  con empate de fecha/id y cinco transacciones; paridad TS/PLSQL; opciones A/B/sufijos; 25 asignaciones
  transaccionales y 15 genéricas paralelas; contador por departamento/año, crecimiento a 10000,
  rollback, inmutabilidad, seeds repetibles, parámetros versionados y API protegida sin reserva.
- Regresión Oracle: seguridad/catálogos/empleados/novedades/vacaciones/nómina 72, prestaciones 10,
  solicitudes 16 y comunicación 16. Los casos antiguos de códigos escritos ahora contrastan los
  códigos devueltos por API; conservan validaciones personales, RBAC, auditoría y rollback.
- db:verify desde cero V000–V021: objetos válidos, UNIQUE/FK e índices, seeds repetibles y datos
  operativos preservados. Esquemas temporales eliminados al terminar.
- Diecisiete E2E aprobados con API/Oracle reales, incluida matriz de páginas/roles, móvil, hints,
  recorridos y axe A/AA. Nuevo caso verifica VC → VNT → VC2, búsqueda y conservación al renombrar.
  Tres casos afectados de vacaciones/constancias/códigos repetidos después de ampliar su visualización.
  Cuatro flujos de alta, cálculo, empresa y códigos repetidos tras separar CLAVE_INTERNA.
  Captura `tmp/pdfs/codigos-automaticos.png` inspeccionada; artefactos locales ignorados.
- Backend final: 220 unitarias y nueve casos Oracle aprobados con Node 20.20.2 Docker.
- Entorno local reconstruido con Node 20, V021 aplicada y tres servicios saludables; verify:infra
  aprueba API/Oracle/nginx/React/assets/PDF. Conteos antes/después idénticos: dos empleados,
  dos departamentos, una solicitud, 38 parámetros y ninguna fila en préstamos/descuentos/eventos/anuncios.
  Cero objetos Oracle inválidos; ambos empleados conservan CODIGO_ANTERIOR. Volumen y credenciales conservados.

### Decisiones

- La asignación definitiva reside en Oracle para cubrir todos los caminos: API, carga masiva,
  solicitudes de vacaciones, parqueo automático y seeds. El generador TS y su equivalente PL/SQL
  tienen pruebas de paridad. Controllers/services/repositories conservan su separación existente.
- La vista previa no reserva números ni se usa como promesa: altas concurrentes pueden cambiarla.
  No se consumen contadores si se revierte la transacción. Eliminar físicamente no libera códigos.
- Códigos nuevos de parámetro son visibles abreviados; CLAVE_INTERNA conserva el significado legal
  y se genera sin entrada manual. Nuevas vigencias mantienen identidad aunque cambie el nombre.
- El test de borradores que esperaba conflicto por código manual ahora comprueba guardado automático;
  los conflictos personales y transaccionales reales conservan su cobertura. Las pruebas de rollback
  disparan por correo/nombre independiente, porque el usuario ya no elige el código.

### Supuestos

- Opción B opera sobre el texto completo limpio sin espacios: conserva la primera letra y quita
  las demás vocales; el sufijo siempre parte de A. Si no queda palabra significativa, se explica
  el error en nombre. No se inventa un identificador para un nombre vacío o compuesto solo por conectores.
- Bancos, feriados y parámetros no tienen longitud particular en A4 y usan el valor genérico 3.
  Roles, conceptos y plantillas son claves internas predefinidas, sin campos de código editables.
- Referencias oficiales de IGSS (número patronal, códigos inscritos de centro/tipo) conservan su
  captura validada: son datos externos oficiales, no códigos internos asignables por nomina2.
  A4 no puede inventar referencias para una declaración oficial.
- Año de numeración: creación en America/Guatemala; fechas de desembolso, evento o solicitud
  no alteran ese año. Las vacaciones usan el código de su trámite SOL vinculado.
- Primer intento E2E tuvo un reinicio del formulario; alta aislada y posterior regresión completa
  pasaron. Prueba Node 20 inicialmente carecía de SQL de seeds; al montarlos en lectura pasó.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de FASE V1-3.
- A5–A12 quedan reservadas para sus fases; no se adelantaron ubicaciones ni reglas nuevas de nómina.

### Cómo probar

1. `docker compose up --build` aplica V021 sobre el volumen existente sin reemplazarlo.
2. Entrar a https://localhost:8443/login con RH/ADMIN; crear/editar un catálogo. Escribir nombre,
   observar código de solo lectura, repetir nombre y comprobar alternativa/sufijo. Renombrar conserva.
3. Crear empleados en dos departamentos: cada uno inicia/continúa su contador. Editar departamento
   conserva el código. Descargar plantilla CSV actual, validar/importar y revisar códigos en el reporte.
4. Crear solicitudes/vacaciones, préstamos/descuentos y publicaciones; buscar sus códigos y exportar.
   Crear o versionar parámetros con motivo/confirmación, comprobando vigencias y clave conservada.
5. `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:codigos` y suites Oracle existentes; `npm run test:e2e`.
   Node 20: imagen de pruebas actualizada y `npm run verify:codigos -- --docker`.
