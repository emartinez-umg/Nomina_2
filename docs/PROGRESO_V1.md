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

## FASE V1-4 — Catálogo oficial de ubicaciones de Guatemala

Estado: completada el 14/10/2026. Rama `v1`, alcance A5 solicitado para centros y componentes reutilizables.

### Hecho

- Leídos AGENTS.md completo con adendo y los progresos. Inicio en `v1` con árbol limpio;
  V000–V021 intactas. No se modificó el formulario de empleado ni se adelantaron fases futuras.
- Descargada la fuente oficial del INE «Lugares poblados de la República de Guatemala. Censo 2018»,
  recurso publicado el 25/03/2024. XLSX íntegro versionado en `db/data/ine`, con URL, fecha y SHA-256.
  Extraídos únicamente códigos/nombres únicos de departamento y municipio (columnas A–D, hoja A_3):
  22 departamentos y 340 municipios, sin pares contradictorios, sin inventar ni corregir nombres.
  JSON versionado y extractor reproducible con biblioteca estándar Python; generador de seed en Node.
- V022 crea DEPARTAMENTOS_GT/MUNICIPIOS_GT con PK identity ALWAYS, códigos INE UNIQUE, auditoría,
  estado, índices y FKs; agrega a centros referencias geográficas, LOCALIDAD_ANTERIOR y propuesta.
  FK compuesta y CHECK impiden pares cruzados/parciales; históricos pueden quedar pendientes.
- S006 idempotente carga por código INE sin sobrescribir filas. Preserva el texto de todos los centros
  previos, incluidos inactivos. Propone solo coincidencias completas únicas, ignorando separadores/
  acentos, municipio/departamento en ambos órdenes y el alias histórico GUATEMALA_CIUDAD.
  Ambigüedad/desconocido queda sin propuesta. Ninguna coincidencia confirma automáticamente la ubicación.
- Módulo routes → controller → service → repository con SQL parametrizado y Zod. GET autenticados
  `/api/ubicaciones/departamentos` y `/api/ubicaciones/municipios`, búsqueda sin acentos/mayúsculas,
  municipios filtrables por idDepartamentoGt. Colecciones completas de tamaño acotado; solo lectura
  para los tres roles después del cambio obligatorio de contraseña.
- UbicacionSelect controlado, con API/TanStack Query, búsqueda, cascada, teclado, carga/error/reintento.
  Resuelve Guatemala/Guatemala por códigos INE 01/0101, sin asumir IDs Oracle. Cambiar departamento
  borra municipio. Predeterminados solo en altas; edición conserva su selección o queda pendiente.
- ZonaSelect reutilizable con 1–25 y No aplica, obligatoriedad/error solo para municipio 0101;
  regla exportada para el resolver y equivalente backend. No se añade zona a centros, que solo requiere
  departamento/municipio. Ubicación/zona quedan listas para la integración del empleado en A8.
- Centros reemplaza localidad libre por referencias obligatorias; el servidor valida existencia, estado
  y pertenencia. Edición muestra LOCALIDAD_ANTERIOR y botón Usar coincidencia propuesta; solo llena
  campos, Guardar confirma y audita. Listado/filtros/orden/CSV muestran las referencias geográficas.
- Borradores de centros versión 3 (otros catálogos siguen en 2); descartan borradores antiguos con
  localidad libre. Conservan ambas selecciones, se restauran explícitamente y se limpian tras éxito.
  Hints/recorrido actualizados y ayuda ofrecida de nuevo con ID v1-4. Se reutilizan tokens/componentes.
- Actualizados README, CATALOGOS, FRONTEND, ERD, manifiesto de filtros y documentación de fuente/seeds.
  `verify:ubicaciones` se integra en `verify:all`. Fixtures anteriores ajustados solo al nuevo contrato
  de centros y al conteo de migraciones; no se cambiaron fórmulas ni se redujeron aserciones previas.

### Validación realizada

- Lint, TypeScript strict (incluidos E2E), builds backend/frontend y Prettier aprobados.
- 421 pruebas unitarias aprobadas: 224 backend y 197 frontend. Backend también aprobado con Node 20
  en Docker. Once pruebas nuevas comprueban conteos 22/340, unicidad/relación/distribución por
  departamento, huella del XLSX, nombres/relaciones cargados, filtros y zona; además cascada/búsqueda,
  defaults con IDs distintos de los códigos, pares inválidos, error/reintento, borrador/restauración/
  éxito/cambio de versión y aplicación explícita de propuestas históricas.
- Seis pruebas Oracle/Supertest nuevas aprobadas: migración con localidades previas, ambigüedad,
  conservación sin confirmar, totales y relaciones, semillas repetibles, UNIQUE/FK compuesta,
  autenticación/cambio obligatorio/tres roles, consultas filtradas, escrituras no disponibles,
  rechazo de localidad libre/pares cruzados, guardado/filtrado de centros y auditoría.
- db:verify desde cero V000–V022 aprobado: 56 tablas, objetos válidos, índices/FKs y seeds repetibles.
  Regresiones Oracle de seguridad/catálogos/empleados/vacaciones/nómina: 72 casos; códigos: nueve.
- Dieciocho E2E aprobados con Chromium/API/Oracle reales (2.7 minutos), incluida matriz de páginas,
  roles/móvil/hints/ayuda/axe A/AA. El caso nuevo prueba Guatemala por defecto, cascada, Guastatoya,
  borrador/restauración, limpieza, guardado y edición a Mixco. Captura del selector inspeccionada en
  `tmp/pdfs/ubicaciones-centro.png` (artefacto local ignorado). Esquemas temporales eliminados.
- Entorno local reconstruido con Node 20, V022/S006 aplicados y tres servicios saludables.
  verify:infra aprobado para Oracle/API/nginx/React/rutas/assets/PDF. Volumen y credenciales conservados.
- Incidencias resueltas: Supertest requirió puertos locales fuera del sandbox; índice duplicado de
  NOMBRE (ya cubierto por UNIQUE) retirado de V022 antes de aplicarla al entorno local. La prueba E2E
  selecciona el aviso de ayuda del modal y espera la respuesta de detalle/apertura antes de editar;
  flujo aislado y regresión completa aprobados. No fue necesario cambiar la funcionalidad por ese ajuste.

### Decisiones y supuestos

- Se eligió el XLSX oficial íntegro: la tabla S17 del Manual del Supervisor presenta códigos
  inconsistentes de Guatemala y la boleta ENEIC tiene erratas en nombres. No se mezclan fuentes ni
  se normalizan nombres visibles; la limpieza solo compara localidades y permite búsquedas.
- Coincidencias son propuestas revisables; no asignar Guatemala a un histórico desconocido evita
  introducir datos falsos. Es válido que RH deba completar un centro antes de su siguiente edición.
- LOCALIDAD permanece como clave operativa compatible con feriados v0: al confirmar por primera vez
  un histórico se conserva su clave anterior. Nuevos centros y cambios posteriores de municipio usan
  el nombre INE normalizado con guiones bajos (0101 conserva GUATEMALA_CIUDAD). LOCALIDAD_ANTERIOR
  siempre queda intacta. No se migran feriados ni se modifican snapshots/cálculos de periodos cerrados.
- La dirección de empleado y DIRECCION_ANTERIOR pertenecen a A8 en esta planificación; el criterio
  de esta fase pide centros y componentes listos para reutilizar. Zona admite No aplica fuera de 0101.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de FASE V1-4.
- RH revisa las propuestas y completa ubicaciones de centros históricos al editarlos.
- Integración de dirección/zona del empleado en A8; A6–A12 reservadas a sus fases solicitadas.

### Cómo probar

1. `docker compose up --build`; entrar a https://localhost:8443/login como RH/ADMIN y abrir
   Organización → Centros de trabajo. En Crear comprobar Guatemala/Guatemala; buscar otro departamento,
   observar municipio vacío y seleccionar uno de ese departamento. Guardar y revisar el listado/CSV.
2. Editar un centro previo: consultar Localidad anterior y, cuando exista, usar/revisar la coincidencia
   propuesta. Completar manualmente los desconocidos. Guardar conserva la referencia original.
3. Elegir ubicación y escribir nombre; esperar Borrador guardado, cancelar/reabrir y Continuar.
   Confirmar ambos selectores. Guardar elimina el borrador; el logout sigue limpiándolos.
4. Usar Ayuda del modal para recorrer cascada, migración y borradores. UbicacionSelect/ZonaSelect
   están exportados desde components/forms para el futuro formulario de empleado.
5. `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:ubicaciones`; `npm run test:e2e -- --grep 'FASE V1-4'`.
   Fuente reproducible: `python3 scripts/extraer-ubicaciones-ine.py && node scripts/generar-seed-ubicaciones.mjs`.

## FASE V1-5 — Identidad de empresa y documentos membretados

Estado: completada el 14/10/2026. Rama `v1`, alcance A6 solicitado.

### Hecho

- Leídos AGENTS.md completo con adendo y progreso v1. Inicio con árbol limpio; V000–V022 intactas.
- V023 amplía la configuración sin perder datos ni FORMATO_IGSS: IDENTIDAD_EMPRESA guarda nombre
  comercial, sitio web, logo PNG privado, SHA-256 y versión. FIRMAS_DOCUMENTO conserva identidad
  y fecha para periodos/prestaciones; CONSTANCIAS_SALARIO_PDF archiva PDF/huella/aprobación.
  DOCUMENTOS_GENERADOS incorpora usuario, fecha, nombre/cargo y versión de membrete.
  Las tablas nuevas tienen identity ALWAYS, auditoría, estado, restricciones y FKs indexadas.
- Pantalla específica Configuración de empresa para RH/ADMIN en la ruta existente. Formulario
  RHF/Zod con NIT módulo 11, razón social, nombre comercial, dirección, teléfono, correo y sitio
  HTTP/HTTPS; grilla proporcional, hints, vista previa, estados de carga/error y borrador de texto.
  Control de versión impide sobrescribir una edición concurrente. Todo guardado se audita.
- GET/PATCH /api/empresa protegidos por sesión, cambio obligatorio, RBAC y CSRF. GET /estado
  permite consultar requisitos sin entregar empresa/logo al empleado. El antiguo CRUD conserva
  consultas y orienta las escrituras hacia la pantalla nueva, evitando identidades divergentes.
- Logos PNG/JPG/SVG de hasta 2 MB: validación de MIME, firma real y decodificación; límite de píxeles
  y tiempo, conversión a PNG de hasta 1000×1000, sin metadatos. SVG se analiza como XML: formas/texto,
  sin scripts, DTD, estilos, eventos, referencias externas ni atributos con escapes CSS.
  BLOB en Oracle, sin URL ni carpeta pública; la bitácora guarda huella, nunca binarios.
  Quitar logo exige confirmación. Docker incorpora fuentes/configuración para SVG con texto.
- Los tres generadores anteriores ahora usan exclusivamente shared/pdf/documento: boletas,
  planilla horizontal, solicitudes/cartas/certificados, constancias de salario, prestaciones y
  finiquitos. Encabezado y pie en todas las páginas, paginación y margen superior que crece con
  razón social/dirección extensas. Sin empresa completa la API bloquea PDF y la pantalla explica
  cómo configurarla. Avisos y botones de aprobación orientan sobre requisitos de firma faltantes.
- La firma procede de nombres/apellidos del expediente y del puesto activo de quien aprueba,
  también cuando actúa ADMIN. Se conserva como snapshot con usuario y fecha, dentro de la misma
  transacción; cambios posteriores del puesto no alteran firmas ya guardadas.
- Usuarios añade Vincular ficha de firmante para ADMIN: búsqueda de expediente, motivo, borrador,
  confirmación y auditoría; exige cuenta RH/ADMIN y ficha activas, sin reemplazar vínculos existentes.
  Al faltar nombre/cargo se bloquea la aprobación y se explica cómo completar/vincular la ficha.
- Retirado el campo y variable anteriores de firma del código y seeds activos. V023 versiona las
  plantillas previas conservando sus originales y convierte su variable histórica a firmante_nombre;
  firmante_cargo también está disponible. El bloque de firma se añade siempre desde el generador.
- Reemisión explícita para solicitudes históricas sin membrete: conserva el PDF original inactivo,
  genera una nueva versión firmada por quien reemite y exige vista previa/entrega otra vez. Historial
  identifica REEMISION sin ampliar las transiciones ordinarias; avisos de reentrega distinguen versión.
- Utilidad credencialesTemporalesPdf acepta una o varias credenciales, membrete e instrucciones de
  primer ingreso. Solo trabaja en memoria: no almacena contraseñas, archivos ni tokens; integración
  de entrega única y alta automática reservada para V1-7, como se solicitó.
- Actualizados navegación, hints y recorridos de empresa/nómina/prestaciones/solicitudes/usuarios;
  README, CATALOGOS, FRONTEND, ERD y manifiesto de filtros. verify:empresa se integra a verify:all.

### Validación realizada

- Lint, TypeScript strict (backend, frontend y E2E), builds y Prettier sin errores.
- 445 unitarias aprobadas: 244 backend y 201 frontend. Nuevas: PDF con/sin logo, membrete en cada
  página, texto real de firma/fecha, bloqueo sin nombre/cargo/empresa, credenciales en memoria,
  PNG/JPG/SVG reales, archivos falsos, tamaño excedido, SVG activo/externo/DTD, datos/NIT/contacto,
  preview, formulario/API con versión y limpieza del borrador al guardar.
- Seis pruebas Oracle/Supertest de empresa aprobadas: migración de identidad y plantillas con datos
  previos, preservación de versiones, permisos/CSRF, logo privado/normalizado, edición concurrente,
  datos inválidos, perfil/vínculo y snapshot de firma, rollback real de auditoría y retirada del logo.
- Dieciocho pruebas Oracle de solicitudes aprobadas, incluidas aprobación concurrente única,
  identidad y fecha persistidas, bloqueo sin ficha, PDF inmutable, entrega propia, rollback y
  reemisión de histórico conservando original y publicación de la versión nueva.
- Regresión Oracle: 72 casos de seguridad/catálogos/empleados/novedades/vacaciones/nómina y
  diez de prestaciones, finiquitos y constancias. Fórmulas e importes conservados.
- db:verify desde cero V000–V023 aprobado: 59 tablas, objetos válidos, seeds repetibles,
  identities, restricciones, FKs/índices y transacciones. Esquemas desechables eliminados.
- Diecinueve E2E cubiertos con API/Oracle reales: 18 aprobaron en la regresión y la matriz completa
  pasó al adaptar empresa a su formulario específico. Repetición de matriz + V1-5: dos aprobados,
  incluida axe A/AA, móvil, hints/tours, borrador/restauración, logo SVG, bloqueo de datos/logo para
  EMPLEADO y generación/entrega/descarga de una constancia con imagen real incrustada.
- PDFs renderizados e inspeccionados: membrete con/sin logo, razón social/dirección extensas,
  boleta, planilla horizontal, solicitud real, salario y finiquito. Sin solapamientos ni cortes de
  firma. Artefactos de QA en tmp/pdfs, ignorados por Git; no se entregan como datos de producción.
- Entorno local reconstruido con Node 20.20.2, V023 aplicada, cero objetos inválidos y dos empleados
  conservados. verify:infra aprobado para API/Oracle/nginx/rutas/assets/worker PDF. Conversión SVG
  y PDF con firma probados en memoria dentro del contenedor, sin escrituras de datos de prueba.

### Decisiones y supuestos

- Se mantiene CONFIGURACION_EMPRESA como identidad fiscal referenciada por IGSS, ampliada mediante
  tabla nueva; no se duplica la razón social/NIT. El logo usa BLOB transaccional como los documentos
  existentes, sin requerir volumen ni directorios de subida. El SHA-256 permite auditar reemplazos.
- Logo, nombre comercial y web son opcionales; razón social, NIT, dirección, teléfono y correo son
  obligatorios para PDF. Sin logo se emite membrete textual. No se inventan datos al migrar históricos.
- La firma es un bloque de identificación, sin agregar una imagen o firma electrónica. ADMIN usa
  igualmente su expediente/puesto al aprobar. No se permite escribir manualmente quién firma.
- Los archivos de solicitudes y salario guardan la identidad al emitir. Boletas/prestaciones
  consultan la empresa vigente al descargarse, conservando cálculos e identidad de aprobación.
  Las firmas históricas recuperables se migran desde aprobador/fecha y ficha/puesto existentes;
  si no son verificables se explica que deben completarse y revisarse, sin inventar un firmante.
- El dato antiguo de firma se conserva únicamente en el esquema/documentos históricos para no
  perder información; no se consulta, edita ni usa en nuevas plantillas o generación.
- Reemisión es una acción documental motivada en historial/bitácora, no un cambio del flujo normal.
  El archivo anterior conserva contenido y huella, y el nuevo requiere entrega explícita.
- Ajustadas fixtures existentes a empresa completa y ficha firmante. Sus expedientes exclusivos de
  prueba tienen ingreso posterior a los periodos ensayados para no alterar cálculos; quedan excluidos
  del build de producción. Se mantiene la cobertura financiera/RBAC previa.
- Incidencias resueltas: Supertest requirió puertos fuera del sandbox; la reemisión necesitó su tipo
  explícito en el CHECK de historial; E2E debía cerrar sesión antes de alternar roles y tratar empresa
  como formulario específico. Poppler usó caché temporal de fuentes. Docker liberó 1.512 GB de caché
  de compilación sin uso de más de 24 h; contenedores, imágenes, volúmenes y datos se conservaron.

### Pendientes

- Operación: RH/ADMIN debe completar los datos reales de empresa y cargar su logo, si lo utiliza.
  ADMIN debe vincular las cuentas aprobadoras a sus fichas reales; RH completa nombres y puestos.
- Los documentos históricos sin membrete se reemiten desde su detalle. Las aprobaciones históricas
  sin identidad verificable requieren completar la ficha y revisión administrativa antes de emitir.
- A7–A12 permanecen reservadas para sus fases; V1-7 conectará la utilidad de credenciales.

### Cómo probar

1. `docker compose up --build`; abrir https://localhost:8443/login como RH/ADMIN.
2. Configuración → Configuración de empresa: revisar datos migrados, completar NIT/contacto,
   cargar PNG/JPG/SVG hasta 2 MB, comprobar vista previa y guardar. Probar NIT incorrecto,
   archivo falso, tamaño excesivo, SVG con recursos externos y guardado concurrente.
3. Escribir, esperar Borrador guardado, recargar y Continuar; seleccionar el archivo otra vez.
   Guardar elimina el borrador. Quitar logo pide confirmación y se aplica al guardar.
4. ADMIN: Usuarios → Vincular ficha de firmante, elegir expediente real sin cuenta y confirmar
   con motivo. RH sin ficha/puesto no puede aprobar; una ficha completa habilita la firma.
5. Descargar boletas/planilla, prestaciones/finiquito y constancia de salario. Aprobar una solicitud,
   revisar su PDF, entregar y descargar como empleado. Revisar encabezado/pie en cada página y
   nombre/cargo/fecha. Cambiar puesto después no modifica el documento aprobado.
6. En un documento histórico usar Reemitir, revisar la nueva versión y entregar; el original queda
   conservado. Ayuda de cada página explica requisitos, firma, logo y borradores.
7. `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:empresa`; `npm run verify:solicitudes`;
   `npm run verify:prestaciones`; `npm run verify:security`; `npm run test:e2e`;
   `npm run verify:infra`.

## FASE V1-6 — Horarios por bloques y rangos

Estado: completada el 15/10/2026. Rama `v1`, alcance A7 solicitado.

### Hecho

- Releídos AGENTS.md con adendo y progreso v1. V000–V023 intactas; no se adelantaron A8–A12.
- V024 crea HORARIO_BLOQUES/HORARIO_BLOQUE_DIAS con identities ALWAYS, auditoría, CHECK,
  UNIQUE bloque/día e índices. Agrupa los días v0 con entrada/salida/descanso/cruce idénticos;
  conserva todos sus minutos exactos, incluso horarios inactivos, y la jornada histórica.
  HORARIO_DIAS queda como archivo; asignaciones, códigos y snapshots no se modifican.
- Catálogo de horarios con ConstructorHorario reutilizable: varios bloques, atajos Lun–Vie,
  Lun–Sáb, Lun–Dom, Fin de semana y Personalizado, chips accesibles y duplicación de patrones.
  Entrada/salida usan 48 opciones de 30 en 30 minutos; descanso 30/60 y cruce explícito.
  Ninguna hora nueva se escribe como texto libre. Código automático existente de V1-3.
- Cálculos compartidos de horas efectivas por bloque/día, semana, jornada y descansos.
  La API deriva jornada y valida límites diarios acumulados/semanales vigentes en Oracle;
  V024 añade límites semanales iniciales 44/42/36, conservando parámetros diarios existentes.
  Rechaza solapes del mismo día, día siguiente y domingo→lunes, días repetidos y bloques vacíos.
- Patrones asignados siguen siendo inmutables. Duplicar crea un alta con código propio;
  Empleados permite elegirla con fecha efectiva. Metadatos históricos conservan tiempos/jornada.
- CrearHorarioModal incorpora el mismo formulario desde nuevo/edición de empleado, con ayuda
  propia. Guardar selecciona el ID real y refresca opciones sin enviar ni perder el expediente.
- RHF/borrador de horarios versión 4, clave separada de duplicación, recuperación explícita,
  descarte confirmado y limpieza tras éxito. JSON inválido no rompe el constructor.
  Hints, resumen de errores, estados de carga/error y recorridos actualizados, incluido empleado
  y horas extra; opciones/horas y límites se consultan en API real.
- `diasLaboralesRango` centraliza calendario por asignación vigente, descansos y feriados;
  vacaciones usa esa función y conserva el alias anterior para regresiones. Días de varios
  bloques se deduplican. Nómina/IGSS leen las horas efectivas sumadas del nuevo modelo.
- `jornadasEmpleado` y `horasDiariasEnFecha` se comparten entre vista previa/alta/detalle de
  horas extra y planilla. El valor hora deja de depender de la etiqueta manual de jornada.
  Divisor mensual/recargo permanecen parametrizados; dinero se calcula con Decimal.
- README, CATALOGOS, FRONTEND, ERD y manifiesto de filtros actualizados. verify:horarios se
  incorpora a verify:all. Se retiró el editor anterior que configuraba días con hora libre.

### Validación realizada

- Lint, TypeScript strict (backend/frontend/E2E), builds y formato aprobados.
  459 unitarias: 254 backend y 205 frontend. Diez casos backend nuevos cubren cálculo,
  clasificación, límites variables, bloques acumulados, solapes nocturnos, integridad del rango,
  descansos entre semana, sábado, feriado y horas extra del patrón. Cuatro casos frontend cubren
  desplegables cerrados/chips/teclado, errores/nocturno, restauración/limpieza y duplicado asignado.
- Conservados los resultados de vacaciones existentes; del 1 al 15/11/2026 Lun–Vie son 10 días;
  Lun–Sáb son 12 y con feriado laboral dentro del rango son 11. Regresión de cambios de vigencia
  y huecos sigue vigente. Horas extra con 4 horas diarias y salario Q3,000: 2 horas = Q75.00.
- Seis pruebas Oracle/Supertest de horarios aprobadas: migración exacta/idempotencia, código,
  jornada derivada, CSRF/acceso, validación de minutos/límites/solapes, parámetros vigentes,
  sábado/descanso/filtros, calendario real, preview de horas extra, patrón asignado y duplicación.
  Un trigger de fallo verifica rollback de entidad, bloques, días y reserva de código/auditoría.
- Regresión Oracle de seguridad/catálogos/empleados/novedades/vacaciones/nómina: 72 casos;
  prestaciones/finiquitos/constancias: diez. db:verify V000–V024 desde cero aprobado: 61 tablas,
  objetos válidos, seeds repetibles, auditoría, FKs/índices y restricciones. Esquemas retirados.
- Veinte E2E cubiertos con API/Oracle reales: 19 pasaron en la regresión completa; tras corregir
  el rol ARIA de la lista de errores, matriz completa + V1-6 pasaron nuevamente (dos casos).
  Incluye alta/borrador/duplicado, modal desde empleado conservando datos/selección, ayuda,
  axe A/AA, teclado, 390 px y ausencia de desbordamiento del documento y del modal.
- Capturas del constructor en escritorio y móvil inspeccionadas en tmp/pdfs/horarios-*.png,
  ignoradas por Git. Se reutilizan los tokens extraídos del mockup.
- Docker reconstruido con Node 20.20.2, V024 aplicada y verify:infra aprobado. Antes/después:
  dos empleados, un horario y dos asignaciones; huella SHA-256 de distribución idéntica.
  Cero objetos inválidos. Volumen y credenciales conservados; sin datos de prueba en aplicación.

### Decisiones y supuestos

- Un turno nocturno pertenece al día de entrada para vacaciones y horas diarias, como en v0;
  el solape sí comprueba su ocupación en el día siguiente y la transición de semana.
- La clasificación diurna/nocturna/mixta sigue las franjas 06:00–18:00 y su complemento de A7.
  El descanso no tiene hora de inicio: se resta del total y no divide la ocupación del bloque.
- En horas extra durante un descanso se usa el promedio de horas diarias de los días laborables
  del patrón vigente. No se inventa una jornada nominal si falta asignación: la API lo bloquea.
- Un histórico puede conservar valores fuera de los nuevos pasos sin redondearlos. Editar solo
  metadatos los conserva; nuevos patrones/duplicados requieren horas 30 en 30 y descanso 30/60.
- Fixtures HTTP cambian de `dias` a `bloques`; su viernes usa ahora descanso de 30 minutos.
  La expectativa antigua de cambiar monto al seleccionar MIXTA se actualizó: con el mismo horario
  de 8 horas se mantiene Q62.50. Las pruebas financieras de 7/6 horas conservan importes usando
  patrones efectivos de esa duración, y se añadió duración de 4 horas en unitarias/Oracle.
- Se evitó exigir CREATE VIEW: la distribución es SQL estático compartido entre repositories,
  con binds, usando los privilegios actuales del usuario de aplicación.
- Incidencias resueltas: DISTINCT ordena alias seleccionados en Oracle; la ayuda E2E se acota
  al diálogo activo y espera su apertura. La lista de errores mantiene UL/LI dentro de ALERT.
  Docker se quedó sin disco durante regresiones; se liberaron 489.1 MB exclusivamente de caché
  de compilación sin uso de más de 24 h y se repitieron las suites afectadas en secuencia.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de V1-6.
- RH valida/ajusta límites operativos por vigencia antes del uso real, como en fases previas.
  A8–A12 quedan reservadas para sus fases; no se cambió periodicidad ni acumulación de vacaciones.

### Cómo probar

1. `docker compose up --build`; ingresar como RH/ADMIN a Organización → Horarios.
2. Crear: agregar bloque Lun–Vie 08:00–17:00/60; agregar Sábado 08:00–12:30/30.
   Comprobar 8/4 horas por bloque, 44 semanales, jornada diurna y descanso Domingo.
3. Probar chips Personalizado, nocturno 22:00–05:00/60 con cruce; solape con el día siguiente
   y domingo→lunes. Exceder límites muestra explicación y el servidor también lo rechaza.
4. Esperar Borrador guardado, cancelar/reabrir y Continuar; guardar elimina el borrador.
   Duplicar un horario, revisar nombre/rangos y comprobar código nuevo. Asignados no se editan.
5. En Empleados nuevo/edición usar Crear horario personalizado; guardar selecciona el horario
   conservando el expediente. Asignar con la fecha efectiva solicitada y probar vacaciones con
   descansos entre semana/sábado/feriado. Vista previa de horas extra usa su duración efectiva.
6. Repetir Ayuda en catálogo/modal/empleado/horas extra; probar teclado y móvil.
7. `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:horarios`; `npm run verify:security`;
   `npm run verify:prestaciones`; `npm run test:e2e -- --grep 'FASE V1-6'`;
   `npm run verify:infra`. Las suites Oracle usan esquemas temporales y conviene correrlas en secuencia.
