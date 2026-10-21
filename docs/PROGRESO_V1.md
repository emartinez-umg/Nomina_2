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

## FASE V1-7 — Alta y edición automatizadas de empleados

Estado: completada el 15/10/2026. Rama `v1`, alcance A8.

### Hecho

- Leídos AGENTS.md completo con adendo y progreso v1. Inicio con árbol limpio; V000–V024 intactas.
- V025 agrega residencia INE, zona, vivienda y DIRECCION_ANTERIOR sin asignar ubicaciones ficticias.
  Conserva SEXO_ANTERIOR; antiguos O quedan pendientes de revisión, sin reinterpretarlos como M/F.
  PARENTESCOS contiene las doce opciones A8, identity ALWAYS, auditoría e índices de FK/filtros.
  Contactos conservan PARENTESCO_ANTERIOR; el siguiente guardado exige una opción válida del catálogo.
- REQUIERE_FECHA_FIN es la bandera operativa de contrato. REQUIERE_FIN queda como alias sincronizado
  para seeds/herramientas anteriores. Obra determinada requiere fin en nuevas escrituras; los datos
  históricos permanecen íntegros. FK compuesta impide cruzar municipio/departamento, CHECK valida zona/casa.
- Alta y edición reutilizan CampoCodigo, UbicacionSelect, ZonaSelect, NitField y ConstructorHorario.
  Código automático por departamento y de solo lectura; no cambia al editar. Residencia reemplaza texto
  libre; edición muestra dirección previa como referencia. Guatemala/Guatemala predeterminados solo en alta.
  Cambio de departamento laboral limpia puesto/jefatura. Sexo solo Masculino/Femenino; parentesco buscable
  desde API real. Fecha de ingreso comienza en hoy de Guatemala, conservando las reglas previas.
- Contrato con plazo exige fin posterior al ingreso; indefinido bloquea/vacía el campo con explicación.
  Cambiar el tipo ajusta automáticamente el formulario. Frontend/backend aplican NIT módulo 11/K y el
  mensaje solicitado. Selección de horario o creación inline conserva el expediente y selecciona el ID real.
- Guardar crea empleado, contacto, usuario EMPLEADO, salario, horario y auditoría en una transacción.
  Eliminada la generación opcional de acceso. Usuario nombre.apellido con sufijos seguros, contraseña
  aleatoria de 24 caracteres, hash argon2id y cambio obligatorio. Fallar usuario revierte también código.
- PDF de credenciales membretado con la utilidad de V1-5, generado antes del commit y devuelto únicamente
  en la respuesta de alta/importación/restablecimiento. No se archivan PDF, contraseña ni token de descarga.
  Respuestas privadas no-store. Credenciales/PDF permanecen solo en estado de React fuera de Query/RHF/drafts.
  Modal exige copiar/descargar y marcar confirmación para cerrar; Escape/Cerrar la respetan. PDF descargable
  una sola vez; un lote genera un único PDF de una página por empleado. Cierre descarta el estado en memoria.
- RH/ADMIN puede restablecer una cuenta EMPLEADO activa desde la ficha, con motivo/revisión/confirmación.
  Revoca sesiones, invalida la anterior y exige primer cambio. Cuentas RH/ADMIN se administran en Usuarios;
  no se amplían sus permisos. Cada nueva temporal tiene su entrega privada y PDF.
- CSV nuevo de 30 columnas sin código/usuario/bandera de generación, con residencia validada, sexo M/F,
  parentesco de catálogo y horario por código. Vista previa, revalidación al confirmar, propiedad, modalidades
  todo o nada/solo válidas y reporte sin secretos conservados. No se puede repetir una carga importada.
- Borrador de empleado versión 7, sección/restauración y limpieza al éxito. Borrador de motivo de reset
  sin secretos. Hints/recorridos de alta, edición, carga, ficha, restablecimiento y credenciales actualizados.
  Ayuda de modales usa proveedor propio. Se reutilizan los tokens visuales del mockup.
- README, EMPLEADOS, FRONTEND, CATALOGOS, ERD y manifiesto de filtros actualizados; verify:empleados
  prueba migración con datos anteriores y se incorpora a verify:all. El portal mantiene su contrato de
  contacto v0: DIRECCION derivada permite compatibilidad documental; no se cambió su flujo en esta fase.

### Validación realizada

- Node 20.20.2: lint, TypeScript strict de backend/frontend/E2E, builds y Prettier aprobados.
- 481 unitarias aprobadas: 267 backend y 214 frontend. Casos NIT válidos/inválidos/K, sexo, casa/zona,
  fin posterior, contratos condicionales, hoy predeterminado, máscara K, cierre confirmado y PDF único.
- Dos pruebas Oracle de migración aprobadas: conserva dirección/sexo/parentesco/código, catálogo de doce,
  contratos sincronizados, seeds repetibles e idempotencia. db:verify V000–V025 aprobado: 62 tablas,
  identities, CHECK, UNIQUE, auditoría, FKs indexadas y cero objetos inválidos.
- Regresión Oracle con Node 20 de seguridad/catálogos/empleados/novedades/vacaciones/nómina: 76 aprobadas.
  Incluye alta con K, controles de ubicación/contrato/parentesco, fallo de usuario y restablecimiento
  RH/ADMIN con sesiones revocadas. Añadido caso de lote de dos empleados/PDF de dos páginas y ausencia
  de contraseñas en filas/auditoría, aprobado. Regresión de solicitudes: 18 aprobadas; prestaciones,
  finiquitos y constancias: diez. Esquemas temporales retirados al terminar.
- 21 E2E aprobados con Node 20 y API/Oracle reales (2.7 minutos): alta, contrato condicional, edición con código inmutable,
  entrega única y restablecimiento. Incluye recorrido, teclado, 390 px y axe A/AA sin infracciones.
  Captura de formulario móvil inspeccionada en tmp/pdfs/empleado-v1-7-movil.png (ignorada por Git).
  La regresión completa incluye importación de dos filas/un solo PDF, matriz de páginas/roles,
  borradores, móvil, ayuda, horarios, firma/membrete, documentos y cálculo/cierre de nómina.
- Docker local reconstruido con Node 20 y V025 aplicada: antes/después dos empleados, cuatro usuarios
  y dos asignaciones; doce parentescos y cero objetos inválidos. Volumen y credenciales conservados.
  verify:infra aprobado para API/Oracle/nginx, rutas/assets de React y worker PDF.

### Decisiones y supuestos

- La entrega única se implementa en la respuesta original y memoria del navegador, sin endpoint para
  recuperar secretos ni almacenamiento temporal del servidor. Ante pérdida/red/recarga se restablece una
  temporal nueva, auditada. La configuración real de empresa es requisito antes del alta/importación
  para asegurar el PDF membretado; si falta, toda la transacción queda sin cambios.
- DIRECCION se deriva de casa/zona/municipio/departamento para consumidores existentes, manteniendo
  DIRECCION_ANTERIOR intacta. Históricos sin ubicación o con sexo/parentesco fuera del catálogo requieren
  revisión humana al editar. No se inventan domicilios, sexos ni vínculos de usuario históricos.
- Actualizadas fixtures a usuario automático y dirección estructurada, M/F y parentesco de catálogo.
  En CSV usan el código real del horario. Conteos de migraciones reflejan V025 sin editar SQL anteriores.
  La fixture de firma reactiva únicamente su ficha sintética tras el aislamiento de nómina; fórmulas
  y expectativas financieras/RBAC permanecen intactas. El permiso de portapapeles se concede al navegador
  E2E para probar la copia; si el usuario lo bloquea, el modal orienta hacia descargar PDF.
- Oracle agotó el disco durante pruebas. Se liberaron 2.912 GB exclusivamente de caché Docker no utilizada;
  contenedores, imágenes, volúmenes y datos conservados. Los dos esquemas desechables de estas ejecuciones
  cuya limpieza falló se identificaron por nombre/fecha y se retiraron. Pruebas Oracle posteriores en secuencia.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de V1-7. A9–A12 reservadas para sus fases.
- Operación: completar empresa real para el membrete; revisar residencia/sexo/parentesco históricos
  al editar. Cargas validadas con la cabecera v0 deben descargarse/prepararse de nuevo con la plantilla v1.

### Cómo probar

1. `docker compose up --build`; ingresar como RH/ADMIN, completar Configuración → Empresa.
2. Personal → Empleados → Nuevo: revisar hoy, ubicación predeterminada, código al elegir departamento,
   NIT 6-K/válido e inválido, sexo M/F, parentesco, contrato con plazo/indefinido y horario inline.
3. Guardar: copiar o descargar el PDF, comprobar única descarga y cierre bloqueado sin confirmación.
   Primer login exige cambio. Editar conserva código, valida residencia/contrato y pide motivo.
4. Ficha → Restablecer contraseña: motivo, revisión y confirmación; entrega nueva temporal, revoca
   sesiones y exige primer cambio. EMPLEADO no accede a estas operaciones.
5. Carga masiva: descargar plantilla nueva de 30 columnas, usar IDs/código de horario reales, validar,
   corregir errores, importar una vez y guardar el único PDF del lote; reporte no contiene contraseñas.
6. `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:empleados`; `npm run verify:security`;
   `npm run verify:solicitudes`; `npm run verify:prestaciones`; `npm run test:e2e`.

## FASE V1-8 — Vacaciones deterministas y solicitables enteros

Estado: completada el 15/10/2026. Rama v1, alcance A9.

### Hecho

- Leídos AGENTS.md con adendo y PROGRESO_V1.md. Inicio con árbol limpio; V000–V025 intactas.
- Servicio puro calcula acumulado por meses completos desde contratación y tasa mensual en Oracle
  (referencia 1.25), tomados/aprobados netos de reversos, previas/ajustes, disponible decimal y
  solicitables floor(disponible). Cinco meses = 6.25 y seis solicitables; egreso limita el corte.
  Consultar/listar/valorar finiquito deja de materializar meses o auditar acumulaciones.
- V026 conserva solicitudes, aprobadores, débitos, aperturas y snapshots v0; compensa diferencias
  históricas mediante un AJUSTE MIGRACION_V1_8 para mantener el disponible al corte. Agrega
  cancelador/fecha/motivo sin sobrescribir aprobación y habilita su transición en el historial.
- Portal de vacaciones, Inicio y RRHH muestran los cuatro saldos. Actualización al abrir/enfocar,
  cada minuto y tras operaciones. Kardex conserva respaldo histórico y movimientos explícitos.
  Ver solicitud/Aprobar/Rechazar/Cancelar consultan nuevamente saldo y calendario.
- Rango reutiliza diasLaboralesRango V1-6, asignaciones vigentes, descansos y feriados. Admite
  descansos en los extremos; 1–15/11/2026 Lun–Vie = diez días. Enviar requiere días laborales
  positivos ≤ solicitables. Semáforo/mensaje/tooltip y aprobación bloqueada en rojo.
- Aprobar revalida calendario, saldo, traslapes, fechas, relación activa y periodos cerrados;
  conserva solicitante/rango/días/aprobador/fecha y registra débito único, historial, aviso y auditoría.
  Rechazar exige motivo y no descuenta.
- Propietario/RH/ADMIN puede cancelar APROBADA antes del día de inicio, con motivo y confirmación.
  Devuelve exactamente el débito original mediante REVERSO CANCELACION:id, aunque cambie el
  calendario. Conserva aprobación; guarda cancelación, historial, aviso y auditoría en transacción.
  Concurrencia/repetición no duplican devolución. Un periodo cerrado bloquea la cancelación.
- GET detalle y POST cancelar con Zod estricto, propiedad/RBAC/CSRF. Frontend bloquea confirmación
  durante carga/error/refresco/envío; motivos con borradores. Hints/ayuda por rol actualizados
  (vacaciones-v1-8 y tableros-v1-8), incluyendo cancelación y decimales, fechas visibles dd/mm/aaaa.
- README, VACACIONES, FRONTEND y ERD actualizados. verify:vacaciones se incorpora a verify:all;
  conteos de migraciones de regresiones reflejan V026 sin editar SQL anteriores.

### Decisiones y supuestos

- A9 define acumulado como meses × tasa: se usa VACACIONES_ACUMULACION_MENSUAL vigente al corte,
  sin hardcodear 1.25 ni sumar snapshots mensuales v0. Se actualiza a propósito la prueba v0 que
  exigía materializar meses y sumar tasas históricas. Documentos y periodos cerrados siguen intactos.
- Una apertura certificada se expresa como diferencia en previas/ajustes respecto al acumulado de
  su fecha, manteniendo exactamente su disponible más meses posteriores. Un crédito certificado
  puede mostrar previas/ajustes negativos. Si v0 no tenía tasas históricas ni apertura, no existía
  un disponible verificable que preservar; ahora A9 lo obtiene con la tasa del corte.
- Se permiten extremos no laborales para soportar rangos naturales como 1–15/11/2026; se rechaza
  un rango sin trabajo. Feriados parciales siguen excluyendo el día entero como en v0.
- Cancelar solo antes del día de inicio (inicio > hoy de Guatemala); se devuelve el débito guardado,
  nunca un recálculo del calendario. Rechazadas/canceladas dejan de bloquear rangos.
- Las consultas conservan los locks existentes compartidos con catálogos/periodos para consistencia.
  No se cambia nómina, prestaciones A12 ni novedades A10.

### Validación realizada

- Lint, TypeScript strict (backend/frontend/E2E), builds y Prettier aprobados.
- Unitarias con Node 20.20.2: 486 aprobadas (271 backend y 215 frontend); casos nuevos de cinco meses, piso/fracción,
  meses incompletos/bisiestos, reversos, cancelación y rango obligatorio.
- Oracle: migración de snapshots/débito/aprobación y apertura certificada, dos pruebas aprobadas.
  db:verify V000–V026 desde cero: 62 tablas, restricciones/identities/FKs/índices, semillas repetibles
  y cero objetos inválidos. Esquemas temporales retirados.
- Regresión Oracle/Supertest: 79 aprobadas, con propiedad/CSRF, saldo insuficiente/traslapes,
  revalidación de feriados al aprobar, devolución original, concurrencia y rollback de cancelación.
- Veintidós E2E con API/Oracle reales aprobados (2.6 min), incluyendo matriz de páginas/roles,
  ayuda, hints, teclado, 390 px y axe A/AA sin infracciones. El nuevo flujo prueba 10 días con
  seis solicitables bloqueados, solicitud/aprobación de seis, saldo 0.25/0 solicitables, devolución
  a 6.25/seis y conservación de aprobador/cancelador. Dos casos de vacaciones repetidos tras
  mejorar la captura, ambos aprobados. Imagen móvil inspeccionada en tmp/pdfs/vacaciones-v1-8-movil.png.
  Un selector de prueba ambiguo se acotó a texto exacto; no alteró la funcionalidad.
- Regresión Oracle de prestaciones/finiquitos: diez aprobadas, incluido el saldo compartido.
- Docker reconstruido con Node 20 y V026 aplicada. Antes/después dos empleados y cero solicitudes
  de vacaciones; huella de solicitudes idéntica, volumen/credenciales conservados y cero objetos
  inválidos. verify:infra aprobado para Oracle/API/nginx/React/rutas/assets/worker PDF.
- Supertest requirió puertos locales fuera del sandbox. db:verify pasó con Node 24 local; el runner
  tsImport de tsx presenta una resolución de módulo incompatible con Node 20 en este host.
  Las suites Oracle/Supertest y E2E usan Node 20.20.2.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de V1-8. A10–A12 permanecen reservadas.

### Cómo probar

1. docker compose up --build; entrar como EMPLEADO a Vacaciones y como RH/ADMIN a Vacaciones.
2. Comprobar acumulados/tomados/disponibles/solicitables; con cinco meses deben ser 6.25 y seis.
   Revisar kardex, Inicio y detalle. La fracción permanece tras consumir días completos.
3. Seleccionar 1–15/11/2026 con Lun–Vie: diez días sin feriados laborales; si solo hay seis
   solicitables, Enviar queda bloqueado con explicación. Reducir rango a seis y solicitar.
4. RH abre Aprobar: comprobar saldo/calendario actuales en verde. Cargar previas o cambiar un
   feriado antes de aprobar debe revalidar y bloquear o ajustar días. Rechazar exige motivo.
5. Aprobar, revisar débito/identidad/fecha; antes del inicio cancelar con motivo. Confirmar devuelve
   exactamente el débito y conserva la aprobación. Repetir o cancelar el día de inicio se bloquea.
6. npm run lint; npm run typecheck; npm test; npm run build; npm run format:check;
   npm run db:verify; npm run verify:vacaciones; npm run verify:security;
   npm run verify:prestaciones; npm run test:e2e -- --grep 'vacaciones|FASE V1-8';
   npm run verify:infra. Oracle en esquemas temporales, en secuencia.

## FASE V1-9 — Novedades mensuales antes del pago

Estado: completada el 15/10/2026. Rama v1, alcance A10.

### Hecho

- Libro NOVEDADES_MENSUALES con horas extra por mes/medias horas, comisiones y consumo manuales,
  ausencias desglosadas y cargos de parqueo. Pendiente/Aplicada, referencia al pago y bloqueos
  por aplicación/cierre. Validación Zod, SQL con binds, Decimal, RBAC/propiedad y auditoría.
- Horas extra valoradas con salario y duración diaria promedio del horario vigente al corte mensual;
  divisor 30, recargo vigente y tope mensual parametrizable con advertencia/confirmación.
- Ausencias sin goce exponen salario / 30 por día, desglose por mes y referencia de aplicación;
  conservan autorizaciones, adjuntos privados, rangos y traslapes de v0. Con goce no descuenta.
- Tarifas Carro/Moto con vigencias, comparación anterior/nueva, motivo y auditoría. Solicitud
  exige vehículo y placa opcional; aprobación crea suscripción mensual desde ese mes, sin prorrateo.
  Mi parqueo permite solicitar baja propia y notifica a RH/ADMIN; RH da de baja/suspende al cierre.
- V027 conserva tablas/migraciones previas, orígenes diarios, importes y pagos históricos. Migra
  parqueo sin inventar vehículo/tarifa; conserva la cuota anterior como referencia. Los cobros
  previos quedan aplicados y no se duplican; los acuerdos migrados salen de la fuente v0.
  Incluye el caso de parqueo cancelado antes de su fecha futura. Registros originales consultables.
- Novedades pendientes resume por empleado/departamento, con retroactivas, alertas, filtros,
  orden, paginación y CSV. Parqueo y cargas manuales tienen consulta/CSV protegidos por rol.
  Hints, ayudas v1-9, borradores y controles de teclado/móvil; tablas desplazables con foco accesible.
- Primitivas prepararNovedadesParaPago/materializarParqueo/aplicarNovedades disponibles para V1-10,
  sin endpoint de cobro manual. README, NOVEDADES y ERD actualizados; verify:novedades en verify:all.
- Regresión detectó que V026 había retirado la transición REEMISION documental de V023.
  V027 la restaura junto con CANCELADA; ninguna migración anterior se modifica.
- V028 conserva referencias repetidas válidas de comisiones v0 y protege cargas v1 por
  clase/empleado/mes. El runner puede aplicar esa reparación ante la restricción concreta de V027
  y repetir íntegro el bloque fallido, con checksum conocido, sin modificar SQL anterior ni fuentes.
  Ambas versiones solo se completan al terminar; otros errores siguen deteniendo el arranque.

### Decisiones y supuestos

- En horarios con duraciones distintas se usa el promedio diario del patrón al último día del mes,
  limitado por hoy/egreso. No se inventa jornada nominal si falta horario/salario vigente.
- Las líneas de ausencia se redondean por mes y el total visible suma esas líneas; los originales
  y snapshots consumidos se conservan. Una ausencia parcialmente aplicada queda protegida entera.
- Tope de advertencia 40 horas es referencia operativa en Oracle, editable por RH; no límite legal
  hardcodeado. Tarifas reales no se siembran. El vehículo histórico desconocido exige revisión humana.
- Baja/suspensión conserva el cargo del mes, incluso si ya se aplicó; los meses siguientes cesan.
  No modifica el cargo aplicado. Un mes cerrado bloquea la gestión; reingreso requiere alta nueva.
- Préstamos/acuerdos y consumo v0 conservan historial; conversión de cuotas y consumo automático
  en anticipo/pago mensual corresponden a V1-10. No se implementa A11/A12 en esta fase.
- Pruebas v0 adaptadas intencionalmente a captura mensual y parqueo por suscripción; se conserva
  cobertura financiera, permisos, rollback, historia documental y cierre. Conteos incluyen V027–V028.
  La prueba de códigos distingue el parámetro previo de las nuevas semillas sin código anterior.
- La revisión automática rechazó modificar V027 después de su aplicación local por riesgo de
  checksum y desincronización. No se ejecutó esa edición; se resolvió mediante V028 y la reparación
  explícita descrita en NOVEDADES.md. V000–V027 conservan sus archivos/checksums registrados.

### Validación realizada

- Node 20.20.2: 517 unitarias aprobadas (295 backend, 222 frontend); lint, TypeScript strict,
  builds y formato aprobados. Build genera aviso de tamaño de chunk, sin errores.
- Oracle/Supertest: seguridad/catálogos/empleados/novedades/vacaciones/nómina 79 aprobadas;
  novedades 14, migración empleados dos, vacaciones dos, horarios seis, empresa seis, ubicaciones
  seis y códigos nueve con Node 20. Casos de parqueo futuro anulado, tarifa futura, referencias
  v0 repetidas, reintento del bloque, aplicaciones atómicas y metadatos de cierre aprobados.
  Solicitudes 18, prestaciones diez y comunicación 16 aprobadas; total 168 Oracle/Supertest.
  Esquemas temporales eliminados. El tablero ADMIN comprueba la versión 28 actual.
- 23 E2E aprobados con Node 20 y API/Oracle reales (2.7 min): incluye captura de horas/comisión/tienda,
  tarifas, solicitud con vehículo, aprobación desde UI mostrando Q150 de prueba, baja del empleado
  y resolución RH, matriz completa de páginas/roles, ayuda, teclado, 390 px y axe A/AA sin infracciones.
  Captura tmp/pdfs/novedades-v1-9-movil.png inspeccionada, ignorada por Git. Esquema temporal eliminado.
- db:verify V000–V028 desde cero aprobado: 66 tablas, restricciones/identities/FKs/índices,
  semillas repetibles y cero objetos inválidos. Se conserva el control de checksum y de versiones
  fallidas. Tres pruebas unitarias comprueban reparación precisa, fallos ajenos y reparación fallida.
- Docker reconstruido con Node 20 y V027–V028 aplicadas. Antes/después dos empleados, cuatro usuarios,
  dos salarios, una solicitud y cero registros de horas/comisiones/ausencias/descuentos/pagos;
  conteos y huellas de los originales idénticos, volumen/credenciales conservados, cero objetos inválidos.
  Las suscripciones exponen bloqueo de gestión del mes actual independientemente del mes consultado;
  no se impide una baja tras cobrar el mes. Selector mensual probado también desde filtro vacío.
- verify:infra aprobado para API/Oracle/nginx, rutas SPA, assets y worker PDF. Revisión de secretos,
  formato y git diff --check aprobados. Supertest requiere puertos locales fuera del sandbox;
  db:verify usa Node 24 del host por la incompatibilidad tsImport ya documentada. Suites Oracle,
  unitarias y E2E usan Node 20.20.2; suites Oracle ejecutadas en secuencia.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación V1-9. Consumo en anticipo/pago mensual y
  boletas nuevas quedan para V1-10; A12 sigue reservada.
- Operación: RRHH configura tarifas reales Carro/Moto, revisa el tope de advertencia y completa
  vehículos históricos antes de pagar. No se inventan importes ni vehículos para los registros v0.

### Cómo probar

1. docker compose up --build aplica V027–V028 sin reemplazar volumen ni credenciales.
2. RH/ADMIN: Configuración → Tarifas de parqueo; configurar Carro y Moto reales con motivo/vigencia.
3. Novedades: cargar horas enteras/medias por mes, revisar cálculo/tope; comisiones y tienda manuales
   con referencia. Revisar ausencias sin goce/con goce, desglose, traslapes, filtros y CSV.
4. EMPLEADO solicita parqueo con vehículo; RH aprueba. Mi parqueo → Solicitar baja; RH resuelve
   baja/suspensión. El mes se cobra completo, los siguientes cesan; revisar migrados sin vehículo.
5. Revisar Novedades pendientes por empleado/departamento, retroactivas, alertas y ayuda.
6. npm run lint; npm run typecheck; npm test; npm run build; npm run format:check;
   npm run db:verify; npm run verify:novedades; npm run verify:solicitudes;
   npm run verify:horarios; npm run verify:security; npm run verify:prestaciones;
   npm run test:e2e; npm run verify:infra. Oracle en esquemas temporales y en secuencia.

## FASE V1-10 — Motor mensual, simulación y pago

Estado: completada el 15/10/2026. Rama v1, alcance A11.

### Hecho

- Leídos AGENTS.md/adendo y progreso v1; inicio limpio. V000–V028 intactas. V029 agrega
  MOTOR, identidad UNIQUE empleado/mes/tipo y PDF BLOB/SHA-256, conservando resultados históricos.
- Motor A11 con Decimal/half-up único: SB por contrato y vigencias, AUS/BI, COM/HE mensuales y
  retroactivas. Anticipo sin descuentos, BI completa ajustada por AUS; Pago descuenta el anticipo
  real y concentra IGSS, ISR, parqueo, tienda y cuotas. HE revalorada con horario/recargo vigentes.
- Tasas, BI, divisor, porcentaje de anticipo, deducción personal/topes y tramos provienen de Oracle.
  Vigencias del Anticipo al día 15 y del Pago al último día; IGSS sobre toda la base mensual.
  Proyección ISR mensual con renta/IGSS/retención efectivamente pagados; diciembre/egreso ajusta
  saldo/devolución. Aguinaldo/Bono 14 conservan exenciones existentes sin adelantar A12.
- Simular pago para empleado/departamento/todos, mes y Anticipo/Pago. Prestaciones futuras visibles
  deshabilitadas. Consulta sin escrituras, tabla/totales/alertas, preview PDF «SIMULACIÓN» y checklist
  con contadores por empleado de HE, comisiones, consumos, ausencias, retroactivas y alertas.
- Confirmación de novedades y diálogo final obligatorios; servidor revalida fuentes/pagos con hash.
  UNIQUE y locks impiden doble pago/concurrencia; el neto negativo bloquea solo a ese empleado.
  Lote habilitado guarda resultado, parámetros, proyección, novedades, cuotas, firma, PDF, aviso y
  auditoría en transacción; fallar cualquiera revierte todo. No realiza transferencias bancarias.
- Boletas archivadas e inmutables, individuales/ZIP por objetivo con carpetas de departamento.
  Boletas masivas de Planilla usa ZIP para v1; históricos v0 conservan PDF. Portal/campana/Inicio
  publican desde confirmar pago. Boleta de anticipo titulada «Anticipo quincenal»; pago contiene
  todas las categorías A11 y cantidades de HE/ausencias, devengado, anticipo, deducciones y neto.
- ADMIN revierte con motivo antes del cierre y en orden inverso de dependencias. Devuelve exactamente
  cuotas/saldos/novedades, retira la boleta del portal, notifica y conserva cálculo/PDF/auditoría.
  Volver a pagar genera versión individual nueva, sin ocultar pagos de otros empleados.
- Revisar/aprobar/cerrar exige completar periodo y resolver pendientes; cerrar no cobra de nuevo.
  Reabrir v1 conserva pagos para reversión explícita. Cierre del anticipo permite capturar novedades
  del pago; aplicadas protegidas. IGSS usa solo devengado mensual; historial filtra tipo de pago.
  Fuente de prestaciones excluye anticipo para mantener compatibilidad de promedios, sin A12.
- Hints, ayudas v1-10, navegación, confirmaciones/borrador de reversión y controles de doble envío.
  README, NOMINA_V1, ERD y manifiesto de filtros actualizados; verify:pagos incorporado a verify:all.

### Decisiones y supuestos

- Cuotas v0 pasan a mensuales **sin duplicar/dividir el importe ni cambiar número de cuotas, capital
  o saldo**. V029 conserva vencimientos/fin anteriores. Solo pendientes/parciales se reprograman al
  último día de meses sucesivos desde el mes más antiguo pendiente; cobradas intactas. Nuevos planes
  mensuales conservan centavos/residuo final. MONTO_QUINCENA sigue como nombre interno compatible;
  la UI/CSV lo presentan como cuota mensual. No se editan migraciones previas.
- BI aplica literalmente A11: completa salvo reducción por AUS, incluso con contrato parcial; SB sí
  se prorratea. AUS usa el SB ya prorrateado según la notación A11; la captura A10 conserva su
  referencia nominal y el pago aplica/archiva el importe recalculado. Retroactivas usan su mes de origen. Mes completo, incluso febrero, reconoce salario mensual completo.
- Se puede pagar el mes sin anticipo registrado (resta cero); después no se agrega anticipo.
  Las novedades aplicadas al anticipo integran DEV/IGSS del pago, sin aplicarlas dos veces.
  Retroactivas pendientes se consumen en el pago actual sin modificar boletas/cierres originales.
- Periodos con resultados v0 mantienen su motor. Los abiertos sin resultados y nuevas altas operativas
  son V1. No se mezclan motores en un periodo: completar el histórico y empezar un mes entero nuevo;
  si falta historia anual, usar apertura certificada. El pago mensual cuenta para ISR aunque falte
  cerrar administrativamente el periodo; dependencias posteriores impiden reversión fuera de orden.
- Cerrar exige completar todos los empleados del periodo, aunque se paguen por objetivos separados.
  Los bloqueados no impiden pagar a los habilitados; sí deben resolverse antes del cierre total.
- Actualizadas intencionalmente fechas esperadas de amortización a fin mensual. Fixtures de regresión
  histórica v0 declaran su motor y vencimientos quincenales originales: se mantiene su cobertura
  financiera/RBAC/rollback. Conteos de versiones incluyen V029; prueba de reparación V027/V028
  acota esas versiones. El E2E de cálculo v0 se actualiza al flujo operativo A11.
- Oracle ORA-01466 apareció al leer inmediatamente después del DDL (granularidad temporal del motor).
  Lecturas consistentes de nómina reintentan hasta dos veces con pausa de un segundo; pagos/escrituras
  jamás se reintentan automáticamente. Tres unitarias cubren límite, selección del error y resultado.

### Validación realizada

- Node 20.20.2: 548 unitarias aprobadas (322 backend, 226 frontend), incluidos 24 casos del motor
  A11 con esperados independientes y tres del reintento de lectura. Lint, TypeScript strict
  backend/frontend/E2E, builds, formato, revisión de secretos y git diff --check aprobados.
- Oracle con Node 20.20.2: doce casos nuevos de migración, ausencia de escrituras, RBAC/CSRF,
  preview, cambios de fuentes, doble pago concurrente, bloqueo individual, publicación/propiedad,
  ZIP, PDF inmutable, reversión/dependencias, rollback por fallo real de auditoría, cierre,
  IGSS sin doble anticipo, continuidad fiscal, última cuota y retroactivas. Esquemas retirados.
- Regresiones Oracle Node 20: seguridad/catálogos/empleados/novedades/vacaciones/v0 79;
  prestaciones diez; comunicación/tableros 16 y novedades 14, aprobadas. Datos de aplicación no usados.
- db:verify V000–V029 desde cero aprobado: 68 tablas, identities, CHECK, UNIQUE/FKs indexadas,
  semillas repetibles, cero objetos inválidos y esquema temporal retirado.
- 24 E2E aprobados con Node 20 y API/Oracle reales (2.8 min): simular, confirmar, ZIP, portal,
  cierre, pago por departamento, reversión ADMIN y nuevo pago individual. Dos casos A11 repetidos
  al retirar la instrumentación, ambos aprobados. Matriz por rol, ayuda, hints, teclado, 390 px y
  axe A/AA sin infracciones. La fixture previa de matriz deja una ausencia pendiente en febrero;
  la prueba de reversión selecciona al empleado habilitado, conservando ese bloqueo correcto.
  Se descartaron bloqueos/fugas Oracle mediante estadísticas del pool y sesiones; diagnóstico retirado.
- PDFs de simulación/anticipo y pago firmados renderizados e inspeccionados: membrete, cantidad
  de HE/ausencias, totales, firma y pie sin cortes. Captura móvil inspeccionada. Artefactos QA
  en tmp/pdfs, ignorados por Git; no se incorporan datos ficticios a pantallas ni aplicación.
- Docker API/web reconstruidos con Node 20 y V029 aplicada. Antes/después: dos empleados, cuatro
  usuarios, dos salarios, una solicitud y cero novedades/préstamos/descuentos/pagos. Conteos y
  huellas de registros originales idénticos, cero objetos inválidos y cero pagos de prueba.
  Contenedor/volumen Oracle y credenciales conservados. verify:infra aprobado para API/Oracle,
  nginx, rutas/assets React y worker PDF. db:verify usa Node 24 del host por la incompatibilidad
  tsImport documentada en V1-8; unitarias, suites Oracle, builds y E2E usan Node 20.20.2.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación V1-10. A12, Bono 14 y Aguinaldo automáticos
  permanecen reservados para V1-11. Operación: RH valida vigencias reales, completa empresa/firmante
  y resuelve alertas o historia fiscal antes de confirmar pagos.

### Cómo probar

1. docker compose up --build; ingresar como RH/ADMIN → Nómina → Simular pago.
2. Elegir Anticipo/mes/empleado o departamento; simular, abrir preview, revisar checklist y confirmar.
   Q10,000 sin extras: Q5,250 anticipo. Cargar COM/HE después y simular Pago: IGSS incluye todas.
3. Pago Q10,000 sin extras: DEV Q10,250; IGSS Q483; ISR Q288.35 con año completo de referencia;
   después de anticipo, Q4,228.65. Neto mensual Q9,478.65. Revisar boleta individual/ZIP y portal.
4. Un neto negativo bloquea solo su fila. Repetir el mismo pago se bloquea; cambiar fuentes exige
   simular nuevamente. Probar parqueo/tienda, cuota final, AUS, ingreso parcial y retroactivas.
5. ADMIN → Planilla → Revertir con motivo, antes del cierre; verificar saldos/novedades y volver
   a simular/pagar. Pago depende de Anticipo; revertir primero Pago. Revisar/aprobar/cerrar no cobra
   nuevamente. Exportar IGSS del mes cerrado y filtrar historial por tipo.
6. npm run lint; npm run typecheck; npm test; npm run build; npm run format:check;
   npm run db:verify; npm run verify:pagos; npm run verify:security; npm run verify:prestaciones;
   npm run verify:novedades; npm run verify:comunicacion; npm run test:e2e; npm run verify:infra.

## FASE V1-11 — Prestaciones automáticas integradas

Estado: completada el 15/10/2026. Rama v1, alcance A12.

### Hecho

- Leídos AGENTS.md/adendo y progreso v1 completo. Inicio limpio; V000–V029 conservan sus archivos.
  V030 amplía tipos de PAGOS_NOMINA, vincula PRESTACIONES a su boleta con FK/UNIQUE e incorpora
  PRESTACIONES_DIAS_ANIO; S007 repetible conserva valores existentes. No transforma pagos previos.
- Bono 14 y Aguinaldo automáticos desde contratación hasta cierre/egreso dentro del ciclo; promedio
  mensual con aumentos, comisiones y HE, menos ausencias afectas. Proporción por días reales / 365
  parametrizable, máximo 100 %: exactamente un año y año bisiesto pagan promedio completo.
- Fuentes mensuales A12 independientes de apertura fiscal/pagos previos: contrato, salarios,
  horario, novedades y banderas reales. Usa devengado archivado del pago mensual cuando existe;
  excluye anticipo y retroactivas de otros meses, incorpora cargas posteriores sin duplicarlas.
  Historia v0 conserva motor/snapshots cerrados; datos faltantes o pendientes bloquean con motivo.
- Simular pago habilita Bono 14/julio y Aguinaldo/diciembre para empleado/departamento/todos:
  desglose, totales/alertas, contadores de fuentes del ciclo, preview SIMULACIÓN, casilla y diálogo.
  Prestaciones comparte ese formulario y precalcula la prestación disponible al entrar.
- Confirmar revalida hash; registra cálculo/detalle/exención, pago UNIQUE empleado/mes/tipo,
  firma, PDF BLOB/SHA-256, aviso y auditoría en una transacción. No aplica novedades/cuotas del
  salario. Boletas propias inmediatas, descarga individual y ZIP por departamento; PDF inmutable
  también desde historial de Prestaciones. No transfiere dinero a bancos.
- Exención limitada por salario/parámetro/consumo previo del mismo tipo/año. Excedente entra
  al ISR mensual desde PRESTACION_DETALLE, una sola vez. Las boletas anuales no duplican salario,
  ISR acumulado, IGSS ni constancias. No representan días salariales ni generan proyección mensual.
- Reversión ADMIN motivada antes del cierre anula la prestación vinculada, conserva su documento
  y permite nueva versión. Pagos mensuales posteriores/del mismo mes y finiquitos dependientes
  impiden revertir fuera de orden. Conteos de empleados deduplican boletas dentro del periodo.
- Finiquito automático al elegir empleado/corte/causa; hoy de Guatemala por defecto. Desglose:
  promedio de seis meses × años/fracción, vacaciones pendientes decimales × salario / 30 y
  aguinaldo/Bono 14 proporcionales; resta pagos del ciclo. Preview PDF antes de confirmar.
  Cambiar selección retira cálculo/confirmación y descarta respuestas antiguas. Confirmar baja
  conserva la transacción existente de liquidación, kardex, revocación de acceso y auditoría.
- Hints y recorridos v1-11 en Prestaciones, Simular pago, Planilla y ficha de empleado. Ayuda
  permanece al cambiar pestañas; tabla de desglose desplazable recibe foco con teclado en móvil.
  README, PRESTACIONES y ERD actualizados. No se agregan datos ficticios a la aplicación.

### Decisiones y supuestos

- A12 reemplaza intencionalmente la fracción por meses de v0: enero–junio 2026 son 181/365.
  Q3,000 constantes dan Q1,487.67; tres meses Q3,000, tres Q5,000 y Q1,800 de comisiones dan
  promedio Q4,300 y Bono 14 Q2,132.33. Actualizadas esas expectativas, preservando las demás reglas.
- El promedio normaliza meses completos y parciales según cantidades salariales/divisor mensual;
  la proporcionalidad anual usa días calendario inclusivos. No se prorratea dos veces el salario.
  Una comisión mensual se atribuye al cierre del mes o corte de baja; no se divide por días.
- La indemnización conserva años/fracción por aniversarios y ventana móvil de seis meses de v0.
  Se implementa literalmente promedio × tiempo, sin añadir alícuotas no solicitadas en A12.
  Los parámetros históricos sin vigencia deben completarse: no se presume una tasa pasada.
- Las boletas anuales comparten el periodo del 1–15 del mes de pago, con identidad de pago separada.
  Si contiene anticipos, el cierre exige completar sus pagos salariales. Si contiene únicamente
  prestaciones anuales, puede revisarse/cerrarse sin forzar anticipos; novedades de salario se
  resuelven en el pago mensual. La fecha informativa usa el parámetro; la quincena conserva su rango.
- Los endpoints históricos de cálculo/aprobación/pago siguen disponibles para regularización de
  registros anteriores; las pantallas anuales nuevas usan A11. Fuentes usadas protegen sus pagos.
  Los ciclos anteriores impagos se regularizan antes del finiquito, conservando el control previo.
- Se contrastaron fuentes oficiales de MINTRAB/Congreso y art. 70 del Decreto 10-2012; enlaces en
  PRESTACIONES.md. El alcance matemático sigue la fórmula explícita del proyecto y las vigencias
  configuradas, incluyendo comisiones/HE según A12.

### Validación realizada

- Node 20.20.2: 554 unitarias aprobadas (328 backend, 226 frontend), lint, TypeScript strict
  backend/frontend/E2E y builds. Casos de menos de un año, exacto, bisiesto, aumento, comisiones,
  HE revalorada, baja parcial, indemnización fraccionaria, vacaciones 6.25, banderas y pendientes.
- Oracle/Node 20: quince pagos, incluidos tres escenarios A12 con fuentes reales sin nómina previa,
  objetivos individual/departamento/todos, ausencia de escrituras al simular, fuentes cambiadas,
  concurrencia única, rollback real de auditoría de prestación, publicación/propiedad, ZIP,
  inmutabilidad de PDF, reversión/nueva versión y revisión de periodo sin anticipo obligatorio.
  Diez regresiones de prestaciones/finiquitos/constancias y 79 de seguridad/empleados/vacaciones/
  nómina aprobadas; esquemas retirados.
- 26 E2E con API/Oracle reales aprobados (3.1 min): regresión completa, matriz por rol, ayuda,
  hints, teclado, móvil 390 px y axe A/AA. Nuevos casos: precálculo, Bono 14 confirmado/boleta/
  repetición bloqueada, finiquito automático, cambio de causa, preview PDF y baja confirmada.
  El primer caso móvil encontró una tabla sin foco; corregida y los dos escenarios A12 aprobados.
- Boleta de Bono 14, Aguinaldo completo con aumento y las dos páginas del finiquito renderizadas
  e inspeccionadas: membrete, fórmulas, exento/gravado, totales, firma y pie sin solapamientos.
  Artefactos QA locales ignorados en tmp/pdfs; Fontconfig usa caché temporal escribible.
- V000–V030 y seeds desde cero: 68 tablas, identidades, CHECK/UNIQUE, FKs indexadas, integridad y
  rollback verificados. Una limpieza de esquema excedió 60 s: se comprobó su identidad/fecha y
  ausencia de sesiones, se retiró el esquema exclusivo de esa prueba y se amplió a 120 s el plazo
  administrativo del verificador; la repetición final completó verificación y limpieza. No se
  alteraron datos ni usuarios de aplicación.
- Docker API/web reconstruidos con Node 20 y V030 aplicada. Antes/después: dos empleados, cuatro
  usuarios, dos salarios/dos horarios asignados, una solicitud y cero novedades/préstamos/
  descuentos/cuotas/pagos/prestaciones. Conteos y huellas de doce tablas originales idénticos.
  Volumen y credenciales conservados; verify:infra aprobado para API/Oracle/nginx/React/worker PDF.
- db:verify usa Node 24 del host por tsImport, como en fases previas. Unitarias, suites Oracle,
  TypeScript, lint, builds y E2E usan Node 20. Revisión de secretos y git diff --check aprobados.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de V1-11. Operación: RH revisa historia
  salarial, vigencias/banderas, ciclos anteriores y empresa/firmante reales antes de confirmar.

### Cómo probar

1. docker compose up --build. RH/ADMIN → Prestaciones: revisar precálculo; elegir Bono 14/julio
   o Aguinaldo/diciembre, año/objetivo. Simular no escribe. Revisar promedio/días/exención/alertas.
2. Completar fuentes, marcar verificación y confirmar. Descargar PDF individual y ZIP; consultar
   boleta en portal propio e historial de Prestaciones. Repetir se bloquea; editar fuente exige
   simular de nuevo. ADMIN puede revertir con motivo antes del cierre y dependencias resueltas.
3. Empleados → ficha → Liquidar y dar de baja: revisar cálculo automático y hoy; cambiar corte/
   causa recalcula. Revisar vacaciones decimales y proporcionales, abrir PDF SIMULACIÓN, cancelar
   o confirmar con motivo. Confirmar registra baja y revoca acceso; pago desde historial.
4. npm run lint; npm run typecheck; npm test; npm run build; npm run format:check;
   npm run db:verify; npm run verify:pagos; npm run verify:prestaciones; npm run verify:security;
   npm run test:e2e; npm run verify:infra. Suites Oracle/E2E en esquemas temporales y en secuencia.

## FASE V1-12 — Auditoría y aceptación de cierre

Estado: completada el 15/10/2026. Rama `v1`.

### Hecho

- Leídos AGENTS.md/adendo y progreso v1 completo; inicio limpio. Migraciones V000–V030 intactas.
- Matriz Playwright ampliada a consumo en tienda (listado/alta/detalle/edición), pendientes,
  parqueo RH/empleado y tarifas. Recorre todos los pasos de ayuda, incluidos menú horizontal,
  buscador, sesión/campana y formularios de catálogos. Verifica hints, iconos, teclado, ausencia
  de desbordamiento y axe A/AA; portal a 390 px. Reporte por rol/ruta/pasos en tmp/auditoria-ui-v1.json.
- Corregida pérdida de foco al cerrar ayuda durante la animación de driver.js, encontrada al
  avanzar hasta el último paso. Ampliadas ayudas de campos de catálogos que repetían solo el hint.
  Ayuda compartida incluye selectores nativos, campos bloqueados y solo lectura; los numéricos
  ya no reciben instrucciones de fecha. Versión v1-12 ofrece nuevamente los recorridos actualizados.
- Corregido contraste transitorio al alternar los botones de Prestaciones; sus colores cambian
  sin interpolación. Se añade orientación de las tres gestiones y se actualiza su ayuda v1-12.
- Nuevas aserciones E2E de endpoints v1 anónimos/RBAC, parqueo mensual de Q150 efectivamente
  descontado/boleta y Aguinaldo proporcional confirmado con propiedad de PDF. Conservados los
  escenarios de credenciales copiar/PDF, horarios, vacaciones 6.25/6, novedades, anticipo/pago
  por departamento, Bono 14, reversión y finiquito. Login y salud se auditan también fuera del layout.
- verify:migration reconstruye una copia desechable desde `v0.0` con servicios/migraciones/seeds
  originales y datos de regresión. Aplica V021–V030; compara conteos de las 55 tablas anteriores,
  todas las PK/columnas originales, hashes de credenciales, documentos/adjuntos BLOB, snapshots,
  prestaciones, vacaciones y saldos/cuotas. Verifica constraints/objetos e idempotencia. Reporte
  sin datos personales en tmp/migracion-v0-v1.json; copia/esquema se retiran al terminar.
- db:verify usa `node --import tsx` con imports ESM de TypeScript, corrigiendo la incompatibilidad
  Node 20 del runner previo; ya no requiere Node 24. verify:migration incorporado a verify:all.
- verify:clean retira también sus imágenes de proyecto temporal y audita ayuda/axe del login y
  cambio obligatorio, además de comprobar que las contraseñas no aparecen en localStorage.
- README corregido a V030, con actualización v0, regresión y operación v1. DECISIONES consolida
  A2–A12, fórmulas/archivos históricos, supuestos, límites y mejoras futuras.

### Decisiones y supuestos

- El bloqueo de meses futuros se conserva. El E2E de Aguinaldo usa historia exclusiva de 2025
  (Q5,000 × 183/365 = Q2,506.85), anterior a los pagos de 2026. No se adelanta el reloj ni se
  añaden vigencias ficticias a la aplicación: salarios/conceptos/parámetros pertenecen solo al
  esquema N2E2E. El ejemplo de Bono 14 de enero–junio conserva 181/365 y Q2,479.45.
- El E2E de parqueo completa mediante la API los pagos reales de su fixture de febrero a
  septiembre y retira la ausencia pendiente exclusiva de la matriz. El intento de apertura
  posterior al cierre se rechazó correctamente; no se relaja el control de historia fiscal.
- Siete suites Oracle conservaban cantidades de migraciones anteriores a V029/V030. Se actualizan
  sus esperados a V030 sin reducir aserciones de negocio, conservación, permisos ni rollback.
- Los días numéricos del calendario son celdas seleccionables; los botones de acciones/navegación
  tienen iconos. No se agregan iconos dentro de cada fecha.
- No se proporcionó un respaldo externo de empresa v0: la prueba utiliza una copia reproducible
  de la etiqueta v0.0 y datos históricos de regresión, nunca el esquema operativo. El despliegue
  debe complementar esta cobertura con restauración/ensayo de su respaldo real.
- La primera instalación aislada falló por espacio del disco Docker. Se retiraron caché sin uso,
  imágenes de aceptación finalizadas e imágenes antiguas de pruebas de nomina2 sin contenedores.
  Contenedores/volúmenes/credenciales operativos y otros proyectos conservados. El arranque repetido pasó.

### Validación realizada

- Node 20.20.2: lint, TypeScript strict (backend/frontend/E2E), builds y formato aprobados;
  554 unitarias (328 backend, 226 frontend). La última repetición cubre la ayuda y contraste finales.
- Doce suites Oracle/Supertest, 183 casos aprobados: empleados 2, pagos 15, novedades 14,
  vacaciones 2, horarios 6, empresa 6, ubicaciones 6, códigos 9, seguridad/regresión 79,
  prestaciones 10, solicitudes 18 y comunicación/tableros 16. Todos los esquemas retirados.
- db:verify V000–V030 desde cero aprobado: 68 tablas de negocio y objetos/constraints válidos,
  FK/índices, identities y seeds repetibles. Migración v0: 55 tablas previas, 157 registros originales
  conservados; 167 después, por adición de un concepto, seis parámetros y tres versiones de plantillas.
  PK, valores anteriores, documentos/adjuntos, snapshots, préstamos/cuotas, saldos y hashes íntegros;
  segunda migración/seeds sin cambios. Copia y esquema desechables retirados.
- 29 E2E aprobados con Chromium/API/Oracle reales: 28 en regresión completa (5 min), incluido
  parqueo con descuento/boleta, y subpantallas por ADMIN/RH repetidas tras corregir su contraste.
  Matriz: 128 vistas (ADMIN 57, RH 55, EMPLEADO 8 escritorio + 8 móvil), 1,804 pasos de ayuda,
  más modales/formularios. Axe A/AA sin infracciones en las vistas verificadas. La nueva selección
  de Prestaciones se comprueba también en el recorrido de sus subpantallas.
- Inspeccionadas capturas de portal/boletas/simulación móvil y navegación de escritorio: sin
  desbordamiento del documento; tablas con desplazamiento interno. Skeletons y vacíos orientativos
  visibles. Reportes/capturas locales en tmp y playwright-report, ignorados por Git.
- Auditoría de seguridad: RBAC/CSRF y propiedad en endpoints/documentos v1, cambio obligatorio,
  logo privado y normalizado, rollback, ausencia de contraseñas en filas/auditoría y borradores.
  Logs sin cuerpos/binds y con errores depurados. npm audit --omit=dev: cero vulnerabilidades.
- verify:infra aprobado. Instalación aislada final con docker compose up --build, Oracle/volúmenes
  nuevos, migraciones/seeds, TLS, primer login/cambio, ayuda/axe y secretos fuera de localStorage.
  Contenedores, volúmenes, imágenes y credenciales exclusivos de aceptación retirados. Frontend
  local actualizado conservando API, Oracle, volumen y credenciales; sin fixtures en la aplicación.
- Ejecutadas todas las etapas de verify:all; tras encontrar fixtures/expectativas obsoletas y el
  contraste, se repitieron las etapas afectadas. Migraciones históricas intactas, revisión de
  secretos y git diff --check aprobados. El aviso no bloqueante de tamaño de chunk Vite se conserva.

### Pendientes

- Ningún pendiente técnico de V1-12. Commit de cierre en la rama v1; mejoras futuras en DECISIONES.
- Operación: RH revisa datos/empresa/firmantes/vigencias/tarifas e historia real; backups, TLS y
  calendarios posteriores conforme a README/DECISIONES. Sin integraciones bancarias/SAT/IGSS externas.

### Cómo probar

1. Copiar/configurar .env.example; `docker compose up --build -d --wait --wait-timeout 900`.
2. Con Node 20, npm ci, Oracle saludable y Chromium instalado: `npm run verify:all`.
3. Migración independiente: `npm run verify:migration` (requiere etiqueta Git v0.0).
4. Revisar tmp/migracion-v0-v1.json, tmp/auditoria-ui-v1.json y playwright-report; son artefactos
   locales ignorados. El esquema operativo no recibe fixtures ni cambios de credenciales.

## Exportación compartible de Oracle — tarea independiente

Estado: completada el 15/10/2026. Rama `v1`; sin cambios de lógica ni migraciones.

### Hecho y decisiones

- Leídos AGENTS.md/adendo y PROGRESO_V1.md completos. Inicio limpio en `v1`.
- `npm run db:export` consulta el contenedor Oracle por SQLPlus/DBMS_METADATA, exporta DDL
  portable y catálogos de una lista explícita y contrasta con migraciones reconstruidas.
  Importa en un segundo esquema vacío; solo los esquemas aleatorios propios reciben escrituras.
- `db/export/00_instalar_todo.sql` coordina esquema, catálogos MERGE, ADMIN sintético,
  historial técnico V000–V030 y verificación de instalación. README explica Docker/SQLPlus/SQLcl.
- Se conservan identidades, constraints, índices, PL/SQL, comentarios y códigos de catálogos.
  Las FK se difieren para resolver ciclos; secuencias identity e índices internos no se duplican.
  Las reservas se reconstruyen únicamente para catálogos, sin contadores transaccionales originales.
- La lista de datos excluye empleados/salarios, usuarios reales, sesiones/tokens, auditoría,
  notificaciones, empresa/logo, documentos/firmas/PDF y registros de operación. Se eliminan
  autores/fechas/motivos originales de catálogos; las vigencias de negocio sí se conservan.
- ADMIN de ejemplo `admin.inicial`, correo reservado y contraseña pública documentada;
  hash argon2id exclusivo de la exportación, cambio obligatorio y MERGE que nunca lo restablece.
  No se consulta ni reutiliza ADMIN_PASSWORD del entorno. La auditoría solo permite ese hash.
- Diagrama completo generado desde las FK reales; se preserva la documentación histórica del ERD.

### Supuestos

- Se exportan los catálogos solicitados y TIPOS_DEDUCCION_ISR por su función fiscal. Organización,
  bancos, empresa, tarifas de parqueo y fichas se completan en destino; no se inventan datos.
- Un nombre oficial del INE que coincide con una dirección histórica no es un dato privado del
  catálogo público: la comparación de direcciones exceptúa esa coincidencia exacta. No se copian
  filas de empleados. Cualquier otro dato privado/patrón encontrado bloquea la entrega.
- Los nombres SYS_C/columnas internas y contadores identity se normalizan al comparar esquemas;
  Oracle también reordena constraints al recrear tablas: se ordenan solo las restricciones,
  conservando orden de columnas y contenido exacto de literales. Las reglas, columnas, tipos,
  índices, estados y código PL/SQL deben coincidir.
- Las 73 tablas reales son las 68 del manifiesto funcional más CONFIG_CODIGOS,
  SECUENCIAS_CODIGOS, REGISTRO_CODIGOS, VERSION_ESQUEMA y PRUEBA_INFRAESTRUCTURA.
  El conteo histórico de 68 no incluía estas cinco; no representa divergencia con migraciones.

### Validación y pendientes

- Lint y TypeScript strict aprobados. Node 20.20.2: 328 pruebas backend y 226 frontend aprobadas.
  Supertest necesitó permisos de puertos locales tras EPERM del sandbox, sin cambios en las pruebas.
- Seis pruebas del exportador aprobadas: escaping, dependencias/ciclos, detección de cambios
  reales, orden de constraints/literales, CLOB JSON y rechazo de datos privados/rutas de macOS,
  Linux y Windows. Integradas en `npm test` y scripts incluidos en lint; 560 pruebas en total.
- Verificación Oracle completada: original, V000–V030 reconstruidas y nueva instalación con
  idénticos objetos/columnas/reglas. `00_instalar_todo.sql` ejecutado realmente dentro del
  contenedor; 15 catálogos y reservas repetidos sin cambios, hash/cambio obligatorio válidos,
  siguiente inserción identity/código con rollback y tablas privadas vacías. Informe adjunto.
- La serialización contempla CLOB JSON, UTF-8, comillas, saltos de línea y límites de SQLPlus.
  Los literales multilineales usan CHR para evitar interpretar contenido como comandos.
  Se comprueba el cierre de cada respuesta de Oracle, incluso cuando no devuelve filas.
- Las secciones generadas pasan Prettier automáticamente. Todos los esquemas y carpetas de
  pruebas exclusivos se retiran; no se cambia ninguna credencial ni dato del esquema operativo.
- Comprobación final: cero esquemas N2EXP restantes; esquema operativo con 31 migraciones
  aplicadas y cero objetos inválidos. Los seis SHA-256 de los scripts entregados coinciden con
  el informe; auditoría final de scripts y README sin datos privados ni rutas locales.
- Sin pendientes técnicos. El receptor completa organización/empresa/firmantes y revisa vigencias
  y calendarios para su operación, conforme al README de la exportación.

### Cómo probar

1. Oracle saludable y dependencias instaladas: `npm run db:export`.
2. Seguir `db/export/README.md` en un contenedor/esquema nuevo; ejecutar `00_instalar_todo.sql`.
3. Revisar `db/export/verificacion.json`, `05_verificar.sql` y el ERD.
4. `npm run lint`; `npm test`; `npm run typecheck`; `npm run format:check`.

<!-- EXPORTACION_VERIFICACION_INICIO -->

### Comprobación automática de la exportación (V000–V030)

- Objetos originales/importados: INDEX 763/763, LOB 22/22, PACKAGE 1/1, PACKAGE BODY 1/1, SEQUENCE 73/73, TABLE 73/73, TRIGGER 82/82.
- Restricciones originales/importadas: {"C":943,"P":73,"R":249,"U":93}; 73 identities.
- Diferencias frente a migraciones reconstruidas: 0. Ninguna.
- Diferencias de la importación: 0. MERGE repetidos, ADMIN sintético argon2id/cambio obligatorio,
  tablas privadas vacías e inserción identity/código verificados. Ningún dato operativo modificado.
- Auditoría: cero hashes/correos/DPI reales, tokens o rutas locales; un hash sintético público permitido.
- Informe reproducible: db/export/verificacion.json. Los esquemas exclusivos N2EXP se eliminan al terminar.

<!-- EXPORTACION_VERIFICACION_FIN -->

## Entrega de la exportación en un único SQL

Estado: completada el 16/10/2026. Rama `v1`; esquema y lógica de aplicación conservados.

- El usuario confirmó que no pudo descargar el archivo anterior. Se entrega
  `db/export/nomina2_completo.sql` (524,573 bytes), con una copia verificada en Descargas.
- Contiene esquema, catálogos, ADMIN inicial, historial y verificación, sin referencias `@@`.
  `npm run db:export` lo regenera y prueba como instalador autónomo. Se preserva la alternativa
  por archivos; SQL termina en punto y coma y PL/SQL conserva el separador `/`.
- Añadida comprobación inicial de esquema vacío y de usuario de aplicación. README actualizado;
  no se eliminan objetos existentes ni se modifican migraciones o lógica de negocio.
- Instalación real en esquema Oracle temporal: 73 tablas, 763 índices, 73 secuencias identity,
  82 triggers y paquete/cuerpo; cero diferencias respecto al original y las migraciones.
  Catálogos repetibles, ADMIN, privacidad y siguiente identity/código aprobados. Temporales retirados.
- 561 pruebas aprobadas (328 backend, 226 frontend y siete de exportación), lint y formato.
  SHA-256 de la copia en Descargas idéntico al registrado en `verificacion.json`.
- Cómo usar: compartir únicamente `nomina2_completo.sql`; conectar con un usuario de aplicación
  de un esquema vacío en XEPDB1 y ejecutarlo completo como script. Sin pendientes técnicos.

## Ronda 2

### FASE R2-1 — Login, módulos de producción y borradores

Estado: completada el 19/10/2026. Rama `v1.1`, ya existente y descendiente de `v1`.
Al iniciar, únicamente AGENTS.md tenía cambios del usuario (adendo v1.1); se conservan.
Alcance limitado a B1, sin migraciones ni cambios de cálculo de nómina.

#### Reproducción y causas raíz

- **Login:** con cookie de sesión vencida, `/auth/sesion` devuelve 401 sin retirarla. El primer
  `/auth/csrf` intenta autenticar esa cookie, la retira y responde 401 antes de que se envíen las
  credenciales. El cliente perdía la intención `notificarSesion: false` del login al obtener CSRF,
  propagando el aviso «Inicia sesión para continuar.» al formulario. Además, el catch de la consulta
  inicial podía marcar expirada una sesión nueva por un resultado 401 cancelado, y el guard no
  distinguía la llegada directa al login de una redirección desde una ruta protegida.
  Regresión nueva del cliente: primer GET CSRF 401, segundo 200 y un solo POST login; falló antes.
- **Anuncios/Eventos:** reproducido contra el nginx original de `https://localhost:8443`:
  `/assets/inexistente.js` respondía **200, Content-Type text/html**, con el index y sin Cache-Control.
  La ubicación genérica de SPA incluía también los JS; solo `.mjs` tenía un 404 explícito. Un hash
  anterior después de sustituir la imagen reproducía así el error MIME comunicado. No se disponía
  del hash exacto del navegador original. Se verifican el chunk actual de ComunicacionPage y el
  grafo completo del manifiesto, además de simular en Playwright un módulo perdido entre visitas.
  El Dockerfile ya excluía dist del contexto: no se encontró mezcla de chunks en ese paso.
- **Borradores:** después de descartar, el hook levantaba la supresión en un microtask. Un cambio
  posterior de paso o un valor derivado programaba nuevamente el autoguardado; el desmontaje además
  vaciaba ese debounce y recreaba la clave eliminada. Los valores iniciales tenían referencias
  compartidas, y Cancelar solo cerraba, conservando incondicionalmente. Regresión nueva reproduce
  edición → descarte → valor derivado/paso → debounce/desmontaje/reapertura; falló antes del arreglo.
- Verificación previa: **561 pruebas aprobadas** (328 backend, 226 frontend, siete exportador) con
  Node 20.20.2; tres logins Playwright/API/Oracle anteriores aprobados. La primera corrida de Supertest
  encontró EPERM del sandbox; la repetición autorizada pasó sin cambiar las pruebas.

#### Correcciones y decisiones

- Solo el GET CSRF previo al login puede repetirse una vez después de que el servidor retire las
  cookies vencidas; el POST de credenciales nunca se repite. Se mantiene CSRF y los errores reales.
  Se propaga el contexto de aviso, se ignoran respuestas canceladas y 401 de generaciones anteriores;
  sin una sesión establecida un evento global no anuncia una expiración. El guard aporta el motivo
  de redirección y el login exitoso reemplaza la ruta sin conservar ese estado.
- nginx separa `/assets/` con 404 real de texto y `nosniff`; index/rutas HTML usan no-store y los
  assets con hash exitosos un año/immutable, conservando cabeceras de seguridad. Imagen con raíz
  limpia, Vite emptyOutDir y manifiesto; el build verifica archivos y dependencias del grafo.
- `vite:preloadError` registra en sessionStorage una recarga única por versión del bundle. Si el
  fallo persiste, React Router muestra «Algo salió mal», Reintentar y Recargar. Reintentar reinicia
  el cargador lazy de la ruta; sin almacenamiento disponible se evita la recarga automática.
- Descartar cancela el debounce antes del reset, copia los valores iniciales y suprime autoguardados
  posteriores hasta otra edición real. Guardar correctamente también limpia y cancela. Cancelar,
  Cerrar y Escape en modales usan un alcance compartido por ventana: permiten conservar y salir
  (vaciando inmediatamente el debounce) o descartar y salir; sin datos salen directamente. Los
  formularios de empleado/novedades integran el mismo flujo de salida. No se bloquea la navegación
  general, conforme a A3. Hints y ayuda de login/borradores actualizados.
- La conservación y el descarte siguen excluyendo contraseñas, tokens y archivos. Las pruebas E2E
  usan API/Oracle reales en un esquema desechable; los datos operativos y credenciales se conservan.
  El modo `--production` prueba el build real en nginx/Docker por TLS, separado del servicio local.
- Se actualizan a propósito los E2E anteriores que cancelaban esperando conservar: ahora eligen
  «Conservar borrador y salir»; se preservan sus restantes aserciones.

#### Validación y pendientes

- Node 20.20.2: **574 pruebas aprobadas** (328 backend, 239 frontend, siete exportador), incluyendo
  las regresiones nuevas de guard/401/CSRF, consulta cancelada, recarga controlada, error de ruta,
  debounce/descarte/valores derivados, nueva edición y decisiones de salida antes del debounce.
  Se comprueban también la limpieza tras éxito, el caso de escribir y borrar todo, y las reglas A3.
- Lint, TypeScript strict, builds backend/frontend y Prettier aprobados; auditoría de secretos sin
  hallazgos. Se conserva el aviso previo de tamaño de chunk Vite, sin errores de compilación.
- **29 E2E anteriores aprobados** en una corrida completa (5.1 min), con Oracle/API reales, matriz
  de rutas/roles, todos los recorridos, hints, axe A/AA, teclado, móvil y flujos de negocio previos.
  La primera corrida encontró una carrera del helper opcional de ayuda: la oferta desaparecía
  entre comprobarla y pulsar. Se tolera únicamente que ya no esté visible; se mantienen todas las
  comprobaciones del recorrido. Un caso de catálogo pasó aislado y en la repetición completa;
  la falta de historia fiscal era consecuencia de los casos seriales omitidos, no un cambio de reglas.
- **10 E2E Docker de R2-1 aprobados**: seis logins (tres roles × cookie ausente/vencida) observando
  avisos transitorios; descarte/reapertura/conservación/éxito; assets 404 sin HTML y cabeceras;
  integridad/MIME/caché del grafo del manifiesto; todas las rutas lazy; pérdida de ComunicacionPage,
  una sola recarga automática, fallo persistente amigable y recuperación manual. Repetición final
  sobre el código de entrega: **10/10 aprobados (31.1 s)**, con limpieza del entorno de pruebas.
- Frontend local reconstruido y saludable en https://localhost:8443. Comprobación real del asset
  ausente: 404 text/plain, no-store, nosniff y cabeceras de seguridad conservadas. verify:infra
  aprobado para API/Oracle, rutas SPA, bundles y worker PDF. Solo se recrea el servicio web;
  API, Oracle, TLS, volumen, datos y credenciales se conservan. Sin migraciones modificadas.
- Los esquemas, contenedores e imágenes exclusivos de las pruebas se retiran al terminar.
- Sin pendientes técnicos de R2-1. B2–B7 permanecen fuera de esta fase.

#### Supuestos y límites de la verificación

- El modo E2E de producción usa el frontend compilado y nginx reales en Docker, con el mismo
  Dockerfile/configuración del servicio local. Solo cambia el upstream hacia la API E2E existente
  (Express real en el host, sin interceptar respuestas) y Oracle usa un esquema temporal dedicado.
- No se conoce el hash antiguo concreto que tenía la pestaña del usuario: se reproduce el recurso
  ausente y se inyecta un fallo de transporte del chunk actual para probar ambas recuperaciones.
- El autoguardado por navegación general de A3 se conserva. La nueva elección se aplica al botón
  Cancelar y al cierre de ventanas; no se añade un bloqueador global de navegación.

#### Cómo probar

1. `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. Oracle saludable y Chromium instalado: `npm run test:e2e -- --production ronda2.spec.ts`.
3. Regresión anterior: `npm run test:e2e -- cierre.spec.ts`.
4. `docker compose up --build -d nomina2-web`; entrar por https://localhost:8443 con cada rol.
   Abrir Anuncios/Eventos; pedir `/assets/inexistente.js` debe devolver 404 de texto, nunca HTML.
5. Escribir en un formulario; descartar/reabrir no debe ofrecer borrador. Cancelar permite conservar
   y recuperar o descartar definitivamente; guardar con éxito elimina. Probar también Cerrar/Escape.

### FASE R2-2 — Estructura visual compartida

Estado: completada el 19/10/2026. Rama `v1.1`; alcance B2.
El cambio previo del usuario en AGENTS.md se conserva sin incorporarlo al commit de esta fase.

#### Reproducción y causas raíz

- La barra usaba la superficie blanca y los controles asumían texto oscuro. Inspeccionado el PDF
  de MOCKUP: el azul ya extraído vive en `tokens.colores.marca` (#1d395e); `primario` representa
  las acciones verdes. Se reutiliza marca, sin crear colores ni cambiar la paleta de acciones.
- El renderer trataba todos los grupos como desplegables y la configuración llamaba Resumen a
  su único destino inicial. No había una ruta independiente de Resumen que migrar.
- La sesión solo publicaba el usuario técnico; los saludos de RH/ADMIN lo mostraban literalmente.
  Los listados concatenaban todos los nombres o mostraban las cuentas de solicitantes/aprobadores.
- HelpProvider ofrecía la bienvenida al registrar cada página y guardaba una bandera de visita.
  Nuevas regresiones fallaron antes del arreglo: Inicio no era enlace directo y abrir la ayuda
  escribía esa bandera. Las notificaciones solo tenían consultas y marcado de lectura.

#### Correcciones y decisiones

- Barra azul por token, texto/íconos claros, estados activo/hover/foco y paneles claros con acentos
  azules. El encabezado público de salud también usa marca. Logo sobre superficie clara y foco
  visible en los activadores y en el tooltip de la campana; navegación móvil mantiene acordeones.
- Configuración única declara Inicio directo por los tres roles; menú y Ctrl/⌘ K muestran Inicio.
  Se conserva teclado (incluidos Espacio y flechas), ruta activa e historial por usuario.
- Sesión entrega nombreMostrado desde el primer nombre y primer apellido de la ficha; sin ficha,
  separa la cuenta por puntos y capitaliza. Saludo, menú/avatar, sesiones, listados/selectores,
  historial de actores y simulación usan nombres de presentación. Ficha, firma completa,
  snapshots y documentos conservan sus datos completos. El acceso técnico queda en Usuarios
  y en la entrega/reporte de credenciales. La ficha explica el estado del acceso sin mostrarlo.
- La búsqueda de empleados conserva nombres completos y acepta también la etiqueta abreviada
  visible, incluido su código. Una regresión Oracle comprueba buscar por segundo nombre y por
  etiqueta completa; no se alteran filtros de departamento, permisos ni cálculos.
- Retirados HelpOffer, su contexto/estado/CSS, todas sus inclusiones y helpers E2E que la omitían.
  Se purgan únicamente las claves antiguas nomina2:ayuda:*; no se guardan banderas nuevas.
  Los recorridos empiezan exclusivamente desde Ayuda de página/ventana y siguen reiniciables.
- DELETE /api/notificaciones/:id y DELETE /api/notificaciones (confirmado: true), validados con
  Zod, sesión/cambio obligatorio y CSRF. El propietario procede de la sesión incluso para ADMIN;
  ajena o retirada devuelve 404. Borrado lógico ACTIVO=0 conserva referencias y deduplicación.
  Auditoría y borrado comparten transacción; borrado masivo incluye más de los 30 avisos visibles.
- Papelera individual con tooltip, confirmación para Borrar todas, prevención de doble envío,
  toasts/error/reintento y actualización del contador/cache de la cuenta tras éxito. Marcar como
  leída se conserva. Panel desplazable en escritorio/móvil y confirmación accesible compartida.
- Ayuda del layout e hints de los nuevos accesos/acciones actualizados; FRONTEND documenta el
  contrato. Las pruebas previas de Resumen, ofertas y encabezado completo cambian intencionalmente
  a B2; se agrega la comprobación de nombres completos en la ficha real para evitar perder datos.

#### Supuestos y límites

- El primer apellido es la primera palabra de APELLIDOS, conforme a la petición; no se infieren
  apellidos compuestos. La grafía y los acentos de la ficha se conservan. Sin ficha se capitaliza
  cada parte de la cuenta, manteniendo sufijos numéricos.
- El reporte de carga masiva mantiene su columna de cuenta como parte técnica de la entrega de
  accesos; las contraseñas temporales siguen disponibles solo una vez y nunca se persisten.
- Borrado lógico significa retirar los avisos de la cuenta, no eliminar solicitudes, publicaciones,
  documentos ni historia auditada. Una publicación nueva/versionada puede generar un aviso nuevo.
- Sin migraciones, cambios de fórmulas de nómina ni implementación de B3–B7.

#### Validación y pendientes

- Node 20.20.2: 585 pruebas aprobadas (329 backend, 249 frontend, siete exportador), lint,
  TypeScript strict, builds y formato. Se conserva el aviso previo de tamaño de chunk de Vite.
- Oracle/Supertest: 20 casos de solicitudes y 16 de comunicación/tableros aprobados. Incluyen
  nombre real frente a cuenta, fallback sin ficha, firma completa, búsqueda por nombres/etiqueta,
  borrado por ADMIN/RH/EMPLEADO, intento ajeno/anónimo, CSRF, payload/ID inválidos, confirmación,
  más de 30 avisos, lectura, contador, repetición, auditoría y rollback individual/masivo.
- 43 escenarios E2E verificados con API/Oracle reales: los 28 flujos anteriores y la matriz
  repetida en producción (128 vistas: ADMIN 57, RH 55, EMPLEADO 8 escritorio + 8 móvil;
  1,805 pasos de ayuda), más los 14 de Ronda 2 sobre nginx/Docker/TLS. Axe A/AA sin infracciones
  en las vistas recorridas, menús de los tres roles, panel de avisos y confirmación de borrado.
- La nueva auditoría móvil ADMIN encontró dos tablas desplazables sin foco (sesiones/bitácora).
  Ambos contenedores ahora son regiones etiquetadas y reciben foco con Tab. Repetición final
  de Ronda 2 sobre el build de entrega: 14/14 aprobados (37.9 s), incluidos los cuatro casos B2.
- Incidencias de verificación resueltas: expectativa anterior de nombre completo actualizada,
  búsqueda por etiqueta visible conservada junto a nombres completos y ficha sintética RH
  identificada correctamente. La edición de HelpProvider durante una corrida con Vite produjo
  errores de contexto por recarga en caliente; sin editar fuentes, la matriz íntegra sobre el
  build de producción pasó sin errores de consola/red. No se suprimen esas comprobaciones.
- Capturas de barra en los tres roles/escritorio/móvil y de notificaciones inspeccionadas;
  artefactos locales en tmp/pdfs y reportes ignorados por Git. Esquemas, contenedores e imágenes
  exclusivos de las pruebas retirados. Sin fixtures en el esquema operativo.
- API y frontend locales reconstruidos y saludables en https://localhost:8443; verify:infra
  aprobado para Oracle/API/nginx, rutas/assets y visor/worker PDF. Solo se recrearon API/web;
  Oracle, volumen, configuración y credenciales conservados. Sin migraciones modificadas.
- Revisión de secretos y git diff --check aprobados. Lint adicional del verificador de arranque
  aprobado; este ya verifica que no aparezca ayuda automática. Sin pendientes técnicos de R2-2.

#### Cómo probar

1. `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. Oracle saludable: `npm run verify:solicitudes`; `npm run verify:comunicacion`.
3. `npm run test:e2e -- cierre.spec.ts`; `npm run test:e2e -- --production ronda2.spec.ts`.
4. `docker compose up --build -d nomina2-api nomina2-web`; entrar con los tres roles y revisar
   barra, Inicio, Ctrl/⌘ K, nombre, Ayuda manual y campana. Borrar una; cancelar/confirmar Borrar
   todas; verificar contador y que otro destinatario conserva sus propios avisos.

### FASE R2-3 — Campos proporcionales al contenido

Estado: completada el 19/10/2026. Rama `v1.1`, alcance B3.
Se conserva fuera del commit el cambio previo del usuario en AGENTS.md.

#### Reproducción y causas raíz

- La grilla asignaba columnas mediante tres tamaños (`ancho`) e imponía otros anchos en páginas
  y metadatos. El límite de caracteres no intervenía en el tamaño. En Nuevo empleado, la prueba
  Playwright falló antes del arreglo: Cuenta bancaria (34 caracteres) y Nombres (100) medían
  ambos **658 px** a 1440 px de viewport. Tampoco había un tope cómodo del formulario.
- Los contenedores de selectores paginados conservaban espacio según hints/acciones, aunque el
  control fuera corto. Se corrige también esa causa para permitir varios campos cortos por fila.

#### Correcciones y decisiones

- `tamanoCampo.ts` es la única escala: texto de 10/20/30/50/100 caracteres se representa con
  12/20/30/44/56 caracteres visuales, más el espacio del control; textos largos con tope de 60.
  Código/zona 12, DPI/NIT 18, teléfono 14, fecha/monto 16, correo/contraseña 36; números según
  límite y selectores según etiquetas o longitud explícita, con mínimo de 20. Mes incluye año.
- `tamano` opcional admite caracteres o corto/medio/ancho/completo; todos los controles comparten
  el mismo cálculo en Field, incluido código automático. Textarea ocupa el espacio disponible
  hasta 640 px; ningún campo supera ese tope. En móvil se permite todo el ancho disponible.
- `FormGrid` conserva las doce columnas para secciones y añade flujo interno con ajuste de filas.
  Grupo limitado a 64 rem y formulario a 72 rem. Una sola caja dimensiona etiqueta, control,
  hint y error; se conserva el teclado, foco, saneamiento, máscaras y validación de cada tipo.
- Retirados `ancho` y columnas por campo de empleados, catálogos/parámetros, novedades, préstamos,
  parqueo/tarifas, solicitudes/plantillas/Mis datos, vacaciones, prestaciones, simulación/planilla,
  fiscal/IGSS, anuncios/eventos, horarios, empresa, usuarios, bitácora y autenticación.
  Los detalles de consulta conservan su grilla; no determinan tamaños de formularios.
- Carga/error/paginación de selectores usan `complemento`, dentro de la caja compartida. Ubicación
  reutiliza FormGrid y zona aplica el tipo específico. Fechas/horas y bloques de horario conservan
  sus agrupaciones. No hay cálculos de píxeles ni anchos por entidad en las páginas.
- Hints compartidos explican la longitud máxima cuando falta. Los recorridos de todos los campos
  explican tamaño, límite y adaptación móvil; las secciones sin caja conservan su objetivo visible.
  Contrato y uso documentados en FRONTEND.md.

#### Supuestos y límites

- No se adjuntó captura de referencia. Se utilizan la escala B3 y los tokens visuales existentes.
- El ancho representa contenido esperado, sin limitar la longitud válida a lo que cabe a la vista.
  Los selectores mantienen el límite previo de búsqueda; las etiquetas largas pueden desplazarse
  dentro del control y se leen completas en las opciones. La escala usa caracteres tipográficos.
- Se reemplaza intencionalmente la prop `ancho` por `tamano`; los módulos no fuerzan tamaños.
  Sin migraciones, cambios de API, reglas de nómina ni implementación de B4–B7.
- Las suites E2E se ejecutan en esquemas separados: Cierre usa Vite y Ronda 2 usa nginx/TLS.
  El intento de combinarlas en producción encontró URLs antiguas fijadas a 5178 y dependencias
  entre fixtures (el finiquito retira al empleado usado luego por Ronda 2). No son fallos de
  tamaños; se conserva el arnés y se documentan los comandos independientes de esta fase.

#### Validación y pendientes

- Node 20.20.2: lint, TypeScript strict, builds y **614 pruebas** aprobadas (329 backend,
  278 frontend, siete del exportador). Se conserva el aviso previo de tamaño de chunk Vite.
  Casos de ancho 10/20/30/50/100, formatos, topes, override, valores inválidos, propagación
  desde componentes, selectores con nombres largos, hints y ayuda en contenedores sin caja.
- La regresión visual que falló antes ya pasa: longitudes 20/34/100 distintas y tope de escritorio;
  campos cortos comparten fila y los contenedores con acciones no reservan espacio sobrante.
  Calendarios a 1024 px y móvil a 390 px sin desbordamiento. Capturas locales inspeccionadas
  en tmp/pdfs/r2-3-empleado-*.png, ignoradas por Git.
- 29 E2E anteriores aprobados con API/Oracle reales (5.1 min). Incluyen 128 vistas (ADMIN 57,
  RH 55, EMPLEADO 16), 1,806 pasos de ayuda, formularios de los trece catálogos, axe A/AA,
  teclado, portal móvil, flujos de negocio y comprobación de controles/hints/errores dentro de
  su caja y campos de hasta 640 px. Ninguno ocupa todo el viewport de escritorio.
- 15 E2E de Ronda 2 aprobados sobre el build final nginx/TLS (56.1 s), con regresiones B1/B2
  y nuevo caso B3. Los esquemas/contenedores/imágenes de esas pruebas se retiraron al terminar.
- Frontend local reconstruido; verify:infra aprobado para API/Oracle, rutas SPA, assets y visor
  PDF. API, Oracle, volumen y credenciales conservados; ningún dato de prueba en la aplicación.
- Matriz completa repetida sobre el build final nginx/TLS: 128 vistas y 1,805 pasos de ayuda,
  aprobada (6.5 min, con preparación). Axe A/AA, topes y alineación de controles/hints/errores
  sin fallos. Esquema, contenedor e imagen exclusivos retirados al terminar.
- Formato, revisión de secretos y git diff --check aprobados. Sin pendientes técnicos de R2-3;
  B4–B7 permanecen reservadas para sus fases.

#### Cómo probar

1. `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. Oracle saludable y Chromium instalado: `npm run test:e2e -- cierre.spec.ts`;
   `npm run test:e2e -- --production ronda2.spec.ts`. Solo B3: `npm run test:e2e -- --production ronda2.spec.ts --grep R2-3`.
3. `docker compose up --build -d nomina2-web`; entrar a https://localhost:8443 y revisar
   Nuevo empleado, catálogos, novedades, empresa y publicaciones. Comparar datos cortos/nombres,
   abrir selectores y ayuda, provocar errores y repetir en móvil. No guardar datos de prueba.

### FASE R2-4 — Reglas comunes de catálogos

Estado: completada el 19/10/2026. Rama `v1.1`; alcance B4.
El cambio previo del usuario en AGENTS.md se conserva fuera del commit.

#### Reproducción y causas raíz

- El CRUD existente validaba Nombre como texto libre: una regresión de una sola letra falló
  antes del arreglo. No había nombre normalizado ni defensa común contra duplicados por nombre.
  La detección de uso solo entregaba un booleano; faltaban su columna y una acción común de historial.
- Inventario: trece definiciones previas (empresa ya tiene pantalla propia y tramos no tiene nombre),
  más parentescos, conceptos, tipos de solicitud y deducciones ISR en Oracle sin CRUD compartido.
  No existen tablas de países, zonas, motivos de baja ni tipos de día/ingreso en esta versión.
- Un UNIQUE exacto antiguo puede impedir recortar al más antiguo: `Padre` anterior a `Padre`
  produce ORA-00001 al intentar conservar su nombre canónico. La regresión comprueba ese fallo
  antes de migrar y verifica que la preparación nueva conserva al antiguo y renombra al otro.

#### Hecho y decisiones

- `shared/catalogos/nombre.ts` es el único validador, importado también por frontend: NFC, recorte,
  espacios colapsados antes de validar, mínimo dos caracteres y una letra, longitud por catálogo y
  puntuación explícita B4. API, servicio y formulario lo usan al crear/editar. El campo compartido
  bloquea escritura/pegado inválidos, normaliza al salir y muestra hints y errores contextuales.
- V031 agrega NOMBRE_NORMALIZADO e índices UNIQUE en catálogos con nombre; los triggers lo mantienen
  también ante SQL directo. El servicio comprueba equivalencias sin acentos/mayúsculas/espacios
  bajo el bloqueo transaccional común y traduce también el UNIQUE: 409 DUPLICADO, campos.nombre,
  nombre existente y metadatos de su ID/estado. Se conservan nombres visibles con acentos.
- Un duplicado inactivo ofrece Reactivar: consulta el registro real y abre la confirmación común
  con motivo. Reactiva ese ID y conserva su código/datos; no genera otra fila ni aplica el alta
  escrita. Éxito limpia el borrador y refresca catálogos/selectores; errores conservan entradas.
- Migración ordenada por FECHA_CREACION/PK: conserva al más antiguo, elige sufijos `(duplicado N)`
  libres incluso si ya existe `(duplicado 2)`, inactiva los restantes y guarda originales/nuevos
  en CATALOGOS_NOMBRES_CORREGIDOS. No elimina filas ni modifica PK/FK/códigos.
- V031 ya se había aplicado localmente al detectar la colisión del UNIQUE exacto. Se conserva su
  archivo/checksum y se añade V032: retira los tres UNIQUE exactos redundantes de parentescos y
  geografía, conservando índices de búsqueda. El runner la anticipa solo para el checksum conocido
  de V031 antes de su DDL y completa ambas al terminar; otros fallos siguen requiriendo revisión.
  Sobre V031 aplicada, V032 se ejecuta normalmente. Cuatro unitarias prueban orden, checksum,
  aplicación posterior y fallo de preparación. V000–V030 permanecen intactas.
- La verificación genérica de uso descubre FK en Oracle y cuenta filas por tabla, sin duplicar una
  fila con varias FK ni ignorar referencias inactivas/históricas. Añade los vínculos sin FK existentes:
  parentesco por texto de contacto y parámetro de tope por clave interna de deducción ISR. Solo excluye
  bloques/días propios del horario, que forman parte del patrón y se retiran junto a él.
- DELETE lógico/físico se bloquea con REGISTRO_EN_USO, conteo y sugerencia de inactivar. Tabla y CSV
  muestran En uso; la papelera se deshabilita con tooltip. Inactivar advierte del conteo y conserva
  referencias. Las selecciones nuevas ofrecen activos; editar mantiene su referencia inactiva,
  incluido parentesco, y no permite asignarla a un registro nuevo.
- B4 cambia a propósito el estado de versiones legales utilizadas: se permite inactivar/reactivar
  con motivo y confirmación sin cambiar valores/documentos cerrados. Activar revalida traslapes;
  editar valores y eliminar versiones cerradas conserva sus protecciones. Regresión previa ajustada.
- Se reutiliza un solo servicio/formulario/tabla con metadatos, incluyendo los cuatro catálogos
  Oracle adicionales. Conceptos conserva versiones y banderas. Códigos semánticos anteriores se
  mantienen; altas nuevas usan el generador transaccional. Parentescos usado no permite renombrar
  porque su vínculo histórico aún es texto. Flujos de tipos de solicitud usados se conservan.
- `CatalogoAcciones` unifica Ver, Editar, Desactivar/Activar, Historial y Eliminar. Historial por
  entidad/ID entrega los últimos 100 cambios a RH/ADMIN, sin ampliar la bitácora global ni exponer IP.
  Confirmaciones e historial tienen ayuda declarativa propia y manual. Hints/recorridos, navegación,
  Dockerfile del validador compartido, CATALOGOS, ERD y README actualizados.

#### Supuestos y alcance

- No se inventan tablas ni datos para los ejemplos B4 ausentes. La zona domiciliaria sigue siendo
  el selector numérico ya existente; los ingresos se configuran mediante conceptos. Al añadir un
  catálogo a futuro debe registrarse en los metadatos comunes y en su migración de nombres.
- Parámetros/conceptos representan identidades con versiones: el UNIQUE físico incluye vigencia
  y el servicio permite el mismo nombre solo para versiones de la misma identidad. Crear otra alta
  equivalente sigue siendo DUPLICADO, aunque su vigencia sea distinta. Municipios oficiales son
  únicos por departamento, preservando homónimos INE. Roles y geografía siguen de solo lectura.
- El conteo es de referencias, no de empleados distintos: puede incluir puestos, jefaturas,
  asignaciones y movimientos históricos. Se indica «registro(s) de empleados u otras tablas».
- No se cambian fórmulas de nómina ni se adelantan B5–B7. La exportación SQL histórica V030 conserva
  su entrega original; una nueva exportación se genera con el comando existente si se necesita.

#### Validación

- Validador y esquemas: vacíos/espacios, una letra, números/símbolos, acentos/ñ/ü/NFD, caracteres
  permitidos/prohibidos y longitud después del recorte; cobertura de todas las definiciones en UI.
- Oracle/Supertest: ocho casos nuevos aprobados con V031/V032, incluyendo colisiones preexistentes
  en departamentos/parentescos, sufijos ocupados, antigüedad, reejecución, paridad TS/Oracle, UNIQUE,
  edición inválida, duplicados en todos los CRUD, versiones, altas concurrentes, reactivación,
  historial, referencias sin FK, eliminación bloqueada y conservación de referencia inactiva.
- Regresiones anteriores adaptadas intencionalmente: colisiones de código usan nombres distintos
  con las mismas abreviaturas; fixtures de departamentos/feriados ya no repiten nombre; el actor
  salarial refleja el nombre de la ficha firmante creada por la prueba (regla B2). Se mantienen
  las aserciones financieras, permisos y rollback. Conteos de migraciones reflejan V032.
- Matriz de pantallas/roles, ayuda/hints, teclado, móvil y axe A/AA aprobada sobre nginx/TLS;
  incluye los cuatro CRUD añadidos. Colisiones de códigos del navegador también aprobadas.
- Supertest necesitó puertos locales fuera del sandbox. Pruebas simultáneas agotaron el disco de
  Docker (ORA-01658); se liberaron 1.671 GB únicamente de caché de compilación sin uso >24 horas.
  Las suites afectadas se repiten en secuencia. Contenedores, volúmenes y credenciales conservados.

#### Resultado final y reporte de migración

- Node 20.20.2: **642 pruebas aprobadas** (353 backend, 282 frontend, siete exportador), lint,
  TypeScript strict, builds y Prettier. Se conserva el aviso previo de tamaño de chunk Vite.
  Auditoría de secretos y diff --check aprobados, incluidos los archivos nuevos preparados para commit.
- Ocho casos Oracle nuevos, 79 de seguridad/regresión y nueve de códigos aprobados. V000–V032
  desde cero, UNIQUE, CHECK, identidades, FKs/índices y semillas repetibles aprobados. V032 conserva
  también el índice de ID_DEPARTAMENTO_GT que cubría el UNIQUE compuesto antiguo de municipios.
- Matriz de producción: **136 vistas y 1,911 pasos de ayuda** aprobados, más el caso previo de
  colisiones de códigos. Ronda 2: quince regresiones aprobadas; el nuevo caso R2-4 pasó en su
  repetición final (5.8 s, 21.4 s con preparación), con API/Oracle reales, reactivación, uso,
  ayuda de confirmación/historial y axe A/AA. Las primeras comprobaciones del recorrido usaban
  el título inicial equivocado y un selector de Siguiente inexistente/ambiguo con la paginación;
  se corrige el E2E para recorrer el paso común y pulsar el botón real del recorrido. No se
  suprimen comprobaciones ni se cambia la funcionalidad para satisfacer esa expectativa.
- Capturas de escritorio/móvil inspeccionadas en tmp/pdfs/r2-4-catalogos-*.png. En móvil la tabla
  conserva desplazamiento interno; sin desbordamiento del documento. Artefactos de pruebas ignorados.
- API/web locales saludables en https://localhost:8443, V031/V032 aplicadas y verify:infra aprobado
  para Oracle/API/nginx, SPA/assets y visor/worker PDF. Oracle, volumen y credenciales conservados.
  Conteos antes/después idénticos: tres empleados, cinco usuarios, tres salarios, tres asignaciones,
  dos solicitudes, un descuento y cero pagos/nóminas/préstamos. Cero objetos inválidos.
- **Reporte real:** PUESTOS, ID 41: `DESARROLLADOR` → `DESARROLLADOR (duplicado 2)`; ID 42:
  `DESARROLLADOR` → `DESARROLLADOR (duplicado 3)`. Ambos inactivos; el más antiguo conserva el nombre.
  No hubo otras correcciones. Los originales permanecen en CATALOGOS_NOMBRES_CORREGIDOS y sus
  referencias existentes se conservan. RH puede revisar estos puestos desde el filtro Inactivo.
- Esquemas/contenedores/imágenes exclusivos de las pruebas retirados. Sin datos de prueba en la
  aplicación. Sin pendientes técnicos de R2-4; B5–B7 permanecen reservadas a sus fases.

#### Cómo probar

1. Node 20: `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. Oracle saludable: `npm run verify:catalogos`; `npm run verify:security`; `npm run db:verify`.
3. `npm run test:e2e -- --production ronda2.spec.ts`; matriz: `npm run test:e2e -- --production cierre.spec.ts --grep 'todas las páginas|vista previa, colisiones'`.
4. `docker compose up --build -d nomina2-api nomina2-web`; entrar como RH/ADMIN. Crear/editar
   nombres inválidos y equivalentes; inactivar y usar Reactivar; comprobar En uso, tooltip,
   confirmación, historial, ayuda y selectores nuevos/existentes.
5. Consultar CATALOGOS_NOMBRES_CORREGIDOS para revisar cada nombre corregido al migrar.

### FASE R2-5 — Casos específicos de catálogos y regresión de QA

Estado: completada el 19/10/2026. Rama `v1.1`; alcance B4.
El cambio previo del usuario en AGENTS.md se conserva fuera del commit.

#### Reproducción y causas raíz

- R2-4 ya centralizó nombres, duplicados, uso y acciones. El inventario real no tenía tablas ni
  metadatos de zonas, países o motivos de baja; las nuevas pruebas fallaron antes del arreglo
  por su ausencia. No había campos postales/ISO a los que aplicar formatos ni esas pantallas.
- La lista de catálogos de frontend era una fixture estática. Ahora una prueba contrasta esa lista
  íntegra con los metadatos del servidor; los E2E contrastan también la respuesta real de la API.
  Agregar un catálogo sin recorrerlo o actualizar su fixture hace fallar la regresión.

#### Hecho y decisiones

- V033 crea MOTIVOS_BAJA, ZONAS y PAISES sin datos inventados: identity ALWAYS, auditoría/FK con
  índices, estado, código interno automático permanente, nombre normalizado UNIQUE y campos propios.
  Usa el generador transaccional existente y añade sus entidades a la vista previa. V000–V032 intactas.
- Los tres usan routes/controller/service/repository, formulario, tabla, confirmaciones e historial
  comunes. Disponibles para RH/ADMIN en Organización, buscador y selector de catálogos. Motivos de
  baja tiene las cinco acciones. Etiqueta uniforme Inactivar/Activar; se conservan los nombres
  técnicos de las acciones de auditoría. Las expectativas anteriores se ajustan solo a esa etiqueta.
- `shared/catalogos/formatos.ts` comparte validadores y saneamiento. Código postal: texto con cinco
  dígitos, teclado numérico, bloqueo al escribir/pegar y ceros iniciales preservados. ISO: dos letras
  ASCII A–Z, mayúsculas automáticas y UNIQUE entre países. API valida al crear/editar; Oracle agrega
  CHECK y UNIQUE. Errores de ISO repetido se mapean a su campo. Búsqueda/filtros/CSV incluyen ambos.
- Se reutilizan recorte de nombres/textos, detección de duplicados sin acentos/mayúsculas/espacios
  y bloqueo de eliminación por referencias. No se duplican validadores ni formularios por entidad.
  Ayuda declarativa y hints actualizados, con explicaciones específicas de postal/ISO y descarte.
- Fixture de QA compartida, excluida del build de API; matrices backend y frontend recorren todos
  los catálogos con nombre. Playwright recorre los 19 CRUD editables: acciones con ícono, rechazo
  de nombres en alta/edición y descarte antes del debounce, con recarga y ausencia en localStorage.
- Actualizados CATALOGOS, ERD, README y manifiesto de índices. No cambia el cálculo de nómina.

#### Supuestos y alcance

- Los tres catálogos solicitados se incorporan como catálogos independientes vacíos porque no
  existían en esta copia. No se infieren países, códigos postales ni vínculos desde direcciones
  o motivos de egreso históricos. La zona domiciliaria 1–25 y MOTIVO_EGRESO conservan sus datos.
- Límites nuevos de nombre: zonas 30, motivos de baja 50 y países 100 caracteres; permiten verificar
  las tres escalas B3 con formularios reales. El ISO valida formato alfa-2, no un padrón externo.
- Empresa tiene su editor específico; tramos ISR no tiene nombre. Roles y geografía INE son de
  consulta. Los casos de nombres se aplican a los 18 catálogos editables que tienen ese campo.
  Tipos de día/ingreso continúan representados mediante horarios/conceptos, conforme a R2-4.
- Sin implementación de B5–B7 ni cambios en fichas o formularios de empleado.

#### Tabla de aceptación automatizada

| Caso QA                                           | Backend / Oracle                                  | Navegador real                                                   |
| ------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Cuatro nombres de símbolos y dos numéricos        | Rechazo al crear y editar en los 18 catálogos     | Bloqueo/saneamiento, error de campo y ningún envío               |
| Nombre con solo espacios                          | Vacío requerido en todos los catálogos con nombre | Vacío y guardado bloqueado                                       |
| Ingeniería / ingenieria / INGENIERÍA con espacios | 409 DUPLICADO y campos.nombre                     | Matriz por catálogo contra API real                              |
| Gerente con espacios                              | Alta devuelve Gerente                             | Verifica valor persistido por catálogo                           |
| Edición con caracteres especiales                 | 400 y conservación del registro                   | Error y ningún PATCH                                             |
| Postal nohio y formatos de longitud incorrecta    | Rechazo en POST/PATCH y CHECK Oracle              | Teclado, letras bloqueadas, cinco dígitos y error                |
| ISO *** y formatos distintos de dos letras        | Rechazo en POST/PATCH, CHECK y UNIQUE             | Símbolos bloqueados, mayúsculas y error                          |
| Eliminar registro usado por un empleado           | Siete catálogos: borrado lógico/físico bloqueado  | Cuatro vínculos: mensaje de API y papelera deshabilitada         |
| Acciones uniformes                                | Componente único e historial existente            | Lista completa, íconos; unitarias verifican callbacks y estados  |
| Anchos de campos 30 / 50 / 100                    | Metadatos contrastados con la fixture             | Tres anchos crecientes en escritorio, móvil sin desbordamiento   |
| Descartar borrador a medias                       | Reutiliza la corrección B1                        | 19 formularios, antes del debounce, recarga y localStorage vacío |

#### Validación y pendientes

- 685 pruebas aprobadas: 374 backend, 304 frontend y siete del exportador. Once casos Oracle de
  catálogos aprobados, incluida toda la matriz y referencias de empleado. Migraciones desde cero
  V000–V033, restricciones, identities, FKs/índices y semillas repetibles verificadas.
- Primera ejecución E2E: 17 casos aprobados; se corrigen los filtros de año/paginación del ensayo
  y un selector ambiguo entre error del campo y resumen. La repetición completa pasó 20/20 con
  nginx/TLS, API/Oracle reales, ayuda y axe A/AA. No se relajaron validaciones de la aplicación.
- ISO se valida antes de convertir a mayúsculas: ß y la i sin punto no pueden convertirse en
  códigos aparentemente válidos. La regresión nueva falló antes del arreglo; backend/frontend
  y API Oracle comprueban ahora esos casos además de los símbolos pedidos por QA.
- El build encontró imports de pruebas fuera del contexto Docker; la fixture compartida se movió
  a shared/catalogos, sin dependencias del servidor, y se comprobó el inventario desde backend.
  Los imports E2E usan extensión ESM explícita. Build de producción aprobado.
- Capturas de escritorio/móvil inspeccionadas en tmp/pdfs/r2-5-*.png; artefactos ignorados por Git.
  Los entornos exclusivos de pruebas retiran sus esquemas, contenedores e imágenes al terminar.
- Expectativas antiguas de integración ajustadas sin relajar producción: el inventario de seguridad
  ya no fija 17 catálogos; duplicar horarios envía solo campos de escritura, sin usos/metadatos.
  Un cargo vacío ahora se rechaza en Oracle por la regla R2-4 antes del servicio de firma. La
  fixture de vacaciones fija la fecha del ajuste migrado al corte del ensayo (15/10/2026), evitando
  depender del día real de ejecución. Se conservan las expectativas de saldos, firmas y rollback.
- Entrega final: **36/36 E2E** aprobados (1.3 min), con los 20 casos QA nuevos y las 16 regresiones
  de Ronda 2, sobre nginx/TLS y los hints definitivos. Axe A/AA, teclado, ayuda, formatos, anchos,
  descarte, login, assets, barra, avisos, reactivación e historial sin fallos.
- Diez suites Oracle/Supertest: **151 casos aprobados** (catálogos 11, seguridad 79, códigos 9,
  horarios 6, ubicaciones 6, empresa 6, empleados 2, vacaciones 2, novedades 14 y comunicación 16).
  Todas se ejecutaron en secuencia y sus esquemas desechables se retiraron.
- Lint, TypeScript strict, builds, Prettier, auditoría de secretos y diff --check aprobados.
  Se conserva el aviso previo de tamaño de chunk Vite. Sin dependencias nuevas.
- API/web locales reconstruidas y saludables en https://localhost:8443. V033 aplicada, cero objetos
  inválidos; verify:infra aprobado para Oracle/API/nginx, SPA/assets y visor/worker PDF. Once tablas
  operativas con conteos idénticos antes/después: tres empleados, cinco usuarios, tres salarios y
  tres asignaciones; dos solicitudes, dos descuentos, un préstamo y un documento; cero pagos/nóminas.
  Oracle, volumen y credenciales conservados. Nuevos catálogos vacíos, sin fixtures en la aplicación.
- Sin pendientes técnicos de R2-5. RH carga datos reales en los catálogos nuevos; B5–B7 continúan
  reservadas para sus fases. AGENTS.md previo del usuario permanece fuera del commit.

#### Cómo probar

1. Node 20: `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. Oracle saludable: `npm run verify:catalogos`; `npm run db:verify`; `npm run verify:security`;
   `npm run verify:codigos`. Las suites Oracle se ejecutan en secuencia, en esquemas desechables.
3. `npm run test:e2e -- --production catalogos-qa.spec.ts`; regresión: `npm run test:e2e -- --production ronda2.spec.ts`.
4. `docker compose up --build -d nomina2-api nomina2-web`; abrir Organización → Motivos de baja,
   Zonas o Países como RH/ADMIN. Revisar acciones, formatos, nombres, anchos, ayuda y descarte.

### FASE R2-6 — Asistente de alta y edición de empleados

Estado: completada el 19/10/2026. Rama `v1.1`; alcance B5.
Se conserva el cambio previo del usuario en AGENTS.md fuera del commit.

#### Reproducción y causa raíz

- El formulario renderizaba cinco secciones simultáneas, salario/contacto eran obligatorios y el
  alta siempre insertaba ambas filas. No existía una navegación con validación por paso ni resumen.
- Regresión contrastada contra HEAD anterior, sin modificar el checkout: rechazaba alta sin los
  pasos opcionales, Dirección ampliada y NIT con verificador incorrecto. Los tres casos son ahora
  válidos con la política desactivada. Se conservan pruebas que verifican el rechazo al activarla.
- NUMERO_CASA estaba limitado a 20 caracteres ASCII con guiones; DIRECCION ya contenía el texto
  compuesto de residencia. Renombrar directamente habría colisionado con ese nombre existente.

#### Hecho y decisiones

- Alta y edición comparten cuatro pasos con iconos, estados completo/error/opcional, validación
  por paso y navegación Anterior/Siguiente/a visitados. Guardar se habilita con personales/laborales
  válidos; valida también los opcionales y abre revisión antes de enviar. Los campos mantienen
  máscaras, hints, anchos B3, relaciones de catálogo, contrato y creación de horario inline.
- Paso 3 es un grupo de salario/banco/cuenta/tipo; paso 4 es nombre/parentesco/teléfono. Cada uno
  se completa entero o se omite entero. API, CSV y frontend comparten las reglas. El resumen
  explica exclusión de planilla, falta de cuenta de depósito y falta de contacto de emergencia.
- Sin salario no se crea una vigencia ficticia ni monto cero; sin contacto no se crea una fila vacía.
  Al retirar un contacto se inactiva para conservarlo. El salario inicial se puede completar en
  edición si no existe historial; las modificaciones de uno existente siguen en Cambiar salario.
  No se permite introducir una vigencia inicial dentro de periodos cerrados: usar la ficha con
  una fecha posterior al cierre. Se mantiene la transacción con usuario, horario y auditoría.
- Perfil incompleto y su lista de faltantes se derivan de salario vigente, banco y contacto activo,
  sin bandera redundante que pueda desincronizarse. Se muestran en lista, ficha y exportación.
  Sin salario se excluye de simulación antes de preparar novedades, con alerta y totales solo de
  elegibles. Confirmación y cierre conservan la exclusión, sin bloquear a los empleados calculables.
  El dashboard de RH alerta y enlaza a la ficha. Alta/edición/salario invalidan también el tablero.
- V034 conserva la dirección compuesta como DIRECCION_COMPLETA, renombra NUMERO_CASA a DIRECCION
  y amplía a 100 caracteres, sin copiar ni perder los valores; DIRECCION_ANTERIOR queda intacta.
  CHECK y validador compartido aceptan letras con acentos/ñ, números, espacios y `. , # - / °`,
  con al menos una letra o número. Se normaliza NFC. Formulario, ficha, CSV e importación usan
  direccion. Portal/documentos conservan el contrato de dirección completa anterior.
- NIT admite 5–12 dígitos, K final y guion opcionales. Se canonicaliza con guion/mayúsculas para
  que las dos escrituras colisionen en el mismo UNIQUE. Se conserva módulo 11 bajo la identidad
  de sistema VALIDAR_DIGITO_NIT (V034: 0 por defecto; 1 activa; unidad CANTIDAD). Solo ADMIN puede
  modificarla, activarla o eliminarla; RH tiene acciones deshabilitadas con explicación. Cambios
  con motivo, revisión y auditoría. Esta política no altera importes ni documentos cerrados.
  Empresa/NIT patronal conservan validación fiscal previa. La autogestión aplica la política al
  solicitar y al aprobar datos críticos; evita eludir la validación mediante otra entrada.
- Borrador v8 conserva valores de todos los pasos, paso actual y visitados; descarte devuelve al
  inicio y limpieza exitosa no lo recrea. Se mantienen usuario automático, copia, PDF membretado,
  entrega única de credenciales y confirmación de su resguardo, fuera de RHF/borradores/logs.
- Ayuda manual por paso, revisión, ficha, carga, dashboard, simulación y parámetros actualizada.
  Documentados uso, CSV, migración y límites en EMPLEADOS, FRONTEND, ERD y README.

#### Validación y cierre

- Node 20.20.2: 728 pruebas aprobadas (405 backend, 316 frontend, siete del exportador).
  Lint, TypeScript strict, builds, Prettier y auditoría de secretos aprobados; se conserva el aviso
  previo del tamaño de chunk Vite, sin dependencias nuevas.
- Oracle: tres pruebas de migración con preservación de ambas direcciones, ampliación, CHECK,
  parámetro y reejecución; V000–V034 desde cero, restricciones/índices y seeds repetibles aprobados.
  Seguridad/Supertest 81 casos; solicitudes 20; pagos 16, incluido objetivo mixto con perfil sin
  salario y dashboard. Los esquemas son desechables y se retiran al terminar.
- Primer ensayo de V034 detectó MOTIVO obligatorio del parámetro: corregido antes de aplicarla
  sobre la base de la aplicación. La regresión salarial conserva 422 cuando el inicio afectaría
  un periodo cerrado, y el salario existente no se cambia mediante PATCH del expediente.
- El caso nuevo de navegador pasó con API/Oracle reales: alta mínima, grupos parciales rechazados,
  navegación/estados, borrador entre pasos, Dirección saneada, credenciales/PDF, perfil en lista,
  ficha/dashboard y completar opcionales en edición. Ayuda de cuatro pasos y axe A/AA móvil pasan.
- La primera regresión completa descubrió fixtures previas dependientes del entorno/orden: dos
  contextos fijaban el puerto de desarrollo al ejecutarse bajo nginx/TLS; una prueba usaba Ajeno
  después de su liquidación/baja; la prueba de calendarios buscaba ingreso en el paso personal.
  Se usa baseURL del entorno, un destinatario exclusivo que ingresa hoy (no altera pagos de enero)
  y navegación real del asistente. Bancos de las fixtures salariales se completan conforme a B5.
  El código se comprueba en el paso laboral. El calendario compartido ajusta su margen al
  viewport: la nueva distribución exponía un desbordamiento de 6.6 px, cubierto por el E2E R2-3.
  No se relajan permisos, fórmulas, restricciones ni aserciones de negocio para corregir esos casos.
- La política NIT conserva validación 0/1 y edición ADMIN también después de cierres: se distingue
  de los parámetros financieros en API, calendario y validación del formulario. Regresión específica
  comprueba que los demás parámetros conservan el bloqueo de vigencias cerradas. El salario inicial
  rechazado por cierre se mapea a salarioBase y explica cómo completarlo desde la ficha.
- **Regresión completa: 66/66 E2E aprobados (5.7 min)** con nginx/TLS, API y Oracle reales;
  incluye 142 vistas y 1,900 pasos de ayuda, carga masiva, credenciales, pago/cierre, documentos,
  RBAC, borradores, catálogos y rondas anteriores. Cuatro regresiones concretas de asistente,
  alta/edición, CSV y calendario también pasaron. Capturas de escritorio y móvil inspeccionadas
  en tmp/pdfs/r2-6-asistente-*.png; artefactos de prueba ignorados por Git.
- Repetición final: 81 casos de seguridad y 16 de pagos, incluida exclusión con horas extra
  pendientes sin salario, y 20 de solicitudes aprobados; los esquemas exclusivos se retiran.
  npm test final: 728 pruebas. Lint, strict, builds, Prettier, secretos y diff --check aprobados.
- API/web reconstruidas y saludables en https://localhost:8443; V034 aplicada, verificación de
  infraestructura aprobada (Oracle/API/nginx, SPA/assets y visor/worker PDF). Cero objetos inválidos
  y VALIDAR_DIGITO_NIT=0. Once tablas conservan sus conteos antes/después: tres empleados, cinco
  usuarios, tres salarios, tres asignaciones y tres contactos; dos solicitudes, dos descuentos,
  un préstamo y un documento; cero pagos y nóminas. Oracle, volumen y credenciales conservados.
- Sin pendientes técnicos de R2-6. B6–B7 siguen reservadas a sus fases. AGENTS.md previo queda
  fuera del commit; no se modificó ninguna migración V000–V033.

#### Cómo probar

1. Node 20: `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. Oracle: `npm run verify:empleados`; `npm run verify:pagos`; `npm run db:verify`;
   `npm run verify:security`; `npm run verify:solicitudes` (en secuencia).
3. `npm run test:e2e -- --production`; caso específico: `--production asistente-empleado.spec.ts`.
4. `docker compose up --build -d nomina2-api nomina2-web`; Personal → Nuevo empleado. Completar
   solo los dos primeros pasos, guardar, revisar omisiones y entregar credenciales. Ver perfil y
   alerta; editar para completar opcionales. Comenzar un grupo a medias debe impedir guardarlo.
5. Descargar la plantilla CSV nueva (direccion). Como ADMIN, Parámetros legales → Validar dígito
   NIT: probar 0/1 con motivo y confirmación. RH solo puede consultar ese parámetro.

### FASE R2-7 — Selección departamento → empleado

Estado: completada el 19/10/2026. Rama `v1.1`; alcance B6.
El cambio previo del usuario en AGENTS.md se conserva fuera del commit.

#### Reproducción y causa raíz

- Los selectores de empleados consultaban opciones generales de Novedades/Catálogos sin
  recibir el departamento. Prestaciones y Planilla permitían combinar filtros incompatibles.
  Simular pago alternaba empleado/departamento en el mismo campo, sin una cascada individual.
- El E2E nuevo ejecutado con el SimuladorPago anterior a esta fase falla al buscar el selector
  Departamento con objetivo Un empleado. El archivo actual se restaura automáticamente y
  el esquema exclusivo de ese ensayo se elimina. Las pruebas del componente cubren también
  el caso anterior de selección ajena que permanecía al cambiar departamento.

#### Hecho y decisiones

- Un único SelectorEmpleado con búsqueda remota, debounce, paginación, código/nombre,
  departamento visible sin filtro y estados claros de carga, vacío, error y reintento.
  Cambiar departamento limpia solo una selección ajena; elegir el mismo o quitarlo conserva
  la persona. También valida selecciones procedentes de borradores/enlaces. Las consultas
  anteriores se cancelan; la clave contiene departamento, búsqueda y selección, y cada página
  se consulta con su propio parámetro.
- GET /api/empleados/selector mantiene routes/controller/service/repository, Zod estricto,
  SQL con binds, filtro por departamento/estado y páginas acotadas. Exclusivo de RH/ADMIN
  autenticados que completaron el cambio de contraseña. Respuesta mínima sin salarios ni
  identificadores fiscales. Resolver seleccionado por separado evita perderlo por paginación
  o búsqueda y evita que un OR omita el departamento. Incluso una selección histórica conserva
  ese límite. No se necesitan migraciones ni cambios de las fórmulas o reglas de pago.
- Prestaciones: cascada en Bono 14/Aguinaldo mediante su simulador compartido, finiquito,
  constancias e historial. Simular pago agrega departamento opcional al objetivo individual;
  cambiarlo invalida la revisión anterior. Planilla conecta sus filtros. Jefaturas conecta
  responsable/departamento tanto en alta/edición como en filtros, caso adicional del inventario.
- Novedades (comisiones, horas extra, ausencias, descuentos, préstamos y consumo), vacaciones,
  solicitudes, fiscal/IGSS y vinculación de usuarios delegan al selector común. Donde no existe
  selector de departamento, siguen buscando todos con su departamento visible. Las altas
  ofrecen activos; historia/constancias/simulaciones permiten consultar suspendidos/egresados.
  Jefaturas conserva la referencia inactiva anterior en edición sin ofrecer otras inactivas
  como nuevas asignaciones. Se preservan los borradores y sus valores de formulario.
- SelectField admite filtrado remoto: no descarta una coincidencia por segundo nombre/apellido
  que no está en la etiqueta abreviada B2. Restablece la búsqueda remota al elegir/cerrar/Escape.
  Hints comunes y paso declarativo compartido incorporados a todas las ayudas afectadas.
  Contrato e inventario documentados en FRONTEND.md.

#### Supuestos y alcance

- Departamento significa el departamento laboral actual del expediente. Los filtros históricos
  de planilla conservan además sus criterios de snapshot; sus hints explican esta diferencia.
- Parqueo tiene búsqueda textual de suscripciones y Pendientes departamento/búsqueda textual;
  no contienen otro selector de empleado. Los trámites de parqueo identifican al empleado
  desde la solicitud autenticada. Se revisaron ambos flujos sin introducir filtros de negocio
  ni selección de empleados ajenos en el portal. No se adelanta B7.

#### Validación y pendientes

- Node 20.20.2: 741 pruebas aprobadas (411 backend, 323 frontend y siete del exportador).
  Siete casos del selector cubren filtrado/limpieza, conservación al quitar departamento,
  borradores incompatibles, búsqueda/paginación, históricos y fallo/reintento. Lint, TypeScript
  strict, builds, Prettier, secretos y diff --check aprobados; aviso previo de chunk Vite vigente.
- Oracle/Supertest: 82 casos aprobados, incluida la prueba nueva con dos departamentos, búsqueda
  por segundo nombre sin acentos, paginación sin repetidos, estados, selección fuera de página,
  selección ajena/inactiva, referencia histórica, contrato mínimo sin datos fiscales y permisos
  anónimo/EMPLEADO/RH temporal/RH/ADMIN. El esquema exclusivo se elimina al terminar.
- Caso nuevo E2E aprobado con nginx/TLS y API/Oracle reales: Bono 14, Aguinaldo, finiquito,
  constancias, historial, simulación, Planilla y Jefaturas; búsqueda/global, cambio/limpieza,
  vacío, ayuda, móvil y axe A/AA. Captura móvil inspeccionada en tmp/pdfs/r2-7-cascada-movil.png.
- El ensayo corrige su navegación a Historial antes de abrir Filtros y la captura de una respuesta
  cancelada al limpiar al empleado. Sus departamentos usan CC/CV para conservar las reservas
  VC/VNT/VC2 de la regresión anterior. La prueba de novedades consulta el selector nuevo y busca
  por código; verifica la etiqueta con departamento. Se conservan sus aserciones financieras.
- API/web locales reconstruidas y saludables en https://localhost:8443; verify:infra aprobado
  para Oracle/API/nginx, SPA/assets y visor/worker PDF. Once conteos operativos idénticos antes
  y después (tres empleados, cinco usuarios, dos solicitudes y cero pagos/nóminas, entre otros).
  Oracle, volumen y credenciales conservados; migraciones V000–V034 intactas.
- Regresión final completa: **67/67 E2E aprobados (6.1 min)** con nginx/TLS, API y Oracle reales.
  Incluye la matriz de páginas/roles, ayudas, hints, teclado, móvil y axe A/AA; novedades/parqueo,
  cálculos/pagos/cierres, documentos, borradores, credenciales y las fases anteriores. Las pruebas
  mantienen sus validaciones de códigos, importes, permisos y propiedad. Esquemas, contenedores e
  imágenes exclusivos retirados al terminar. Sin fixtures en la aplicación local.
- Sin pendientes técnicos de R2-7. B7 permanece reservada. El cambio previo de AGENTS.md queda
  fuera del commit de esta fase.

#### Cómo probar

1. Node 20: `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. Oracle saludable: `npm run verify:security` comprueba endpoint, filtros, selección y permisos.
3. `npm run test:e2e -- --production cascada-empleados.spec.ts`; regresión completa: `npm run test:e2e -- --production`.
4. RH/ADMIN → Prestaciones → Bono 14/Aguinaldo → Un empleado: elegir departamento, buscar por
   código/nombre, seleccionar y cambiar a otro departamento. Repetir en Finiquito, Constancias,
   historial, Simular pago, filtros de Planilla y responsable de Jefaturas. Quitar departamento
   debe mostrar todas las opciones con su departamento; uno vacío debe explicar cómo continuar.

### FASE R2-8 — Capa de datos del dashboard de RRHH

Estado: completada en código y pruebas el 20/10/2026. Rama `v1.1`; alcance B7 de backend, esquema y pruebas.
El cambio previo del usuario en AGENTS.md se conserva fuera del commit.

#### Reproducción y causa raíz

- El router solo exponía `/:rol`; no había agregaciones filtrables para los cuatro recuadros,
  categoría estadística de ausencia ni consulta de vacaciones en curso/próximas. La regresión
  nueva ejecutada con el router de HEAD falla: obtiene 404 en lugar del 403 del endpoint protegido.
  Se restaura inmediatamente el archivo actual. El tablero previo además publicaba edad como anios.
- Los resultados V1 contienen el devengado mensual completo en Pago; sumar Anticipo y Pago habría
  duplicado ingresos. Los tipos y estados existentes ya conservan días aprobados y snapshots;
  se reutilizan esas fuentes sin reabrir cálculos, períodos ni documentos.

#### Hecho y decisiones

- V035 agrega CATEGORIA_INASISTENCIA obligatoria con CHECK, índice y derivación compatible con
  seeds/clientes anteriores. Migra por EFECTO e identifica la clave histórica INJUSTIFICADA.
  Crea «Inasistencia sin justificación», efecto SIN_GOCE y código automático. Conserva PK, códigos,
  ausencias, efectos e importes previos, incluidos tipos inactivos. V000–V034 intactas.
- CRUD común: categoría editable, filtro/orden/CSV, hint y color derivado. IGSS verde, con goce
  amarillo, sin goce naranja y sin justificar rojo. Se conserva al omitirla durante edición.
  Corregir categoría reclasifica estadísticas y se audita; no cambia el efecto salarial ni pagos.
  Solo se actualiza la fixture de contrato del frontend; no se implementan pantallas de esta fase.
- Cuatro GET en /api/tableros/rh: remuneraciones, inasistencias, vacaciones y celebraciones.
  Routes/controller/service/repository, listas blancas y Zod estricto, SQL con binds, respuestas
  uniformes, no-store y corte READ ONLY con reloj de Guatemala. RBAC RH/ADMIN en router y servicio;
  EMPLEADO recibe 403 antes de adquirir conexión, también con datos de remuneración disponibles.
- Top cinco de remuneraciones por empleado/departamento y mes, cuatro métricas, posición/valor
  y todos los importes GTQ. Solo pagos V1 confirmados mensuales y versiones vigentes V0 cerradas;
  excluye anticipos, prestaciones, reversiones y borradores. Agrupa por departamento del snapshot.
  Salario base suma líneas devengadas/prorrateadas; total resta ausencia salarial en V1. Sin pagos
  devuelve vacío. Los importes se agregan en NUMBER y serializan con Decimal/half-up.
- Inasistencias aprobadas y activas, aplicadas o pendientes de pago; recorte por mes, trimestre o
  año y departamento actual del expediente. Distribuye fracciones históricas proporcionalmente
  entre periodos. Top cinco con cuatro series, colores, días y leyenda global de todos los empleados,
  incluso fuera del top. Pendientes/rechazadas no cuentan. Empates ordenados por ID.
- Vacaciones aprobadas/tomadas en curso y próximas 30/60/90 días, con ID/código/nombre del empleado,
  rango completo y días laborales aprobados. Paginación independiente por lista; totales y contador
  independientes de página. Ausentes hoy deduplica personas y verifica bloques, asignación vigente,
  descansos y feriados nacionales/locales. No hace consultas por empleado ni recorta días al mes.
- Celebraciones desde hoy hasta hoy + 30 inclusive; marca esHoy, muestra años solo en aniversarios
  y excluye fecha de nacimiento/edad. 29/02 se conmemora 28/02 en año común y 29/02 en bisiesto;
  28/02 se conserva. El endpoint antiguo mantiene su contrato numérico con anios=0 en cumpleaños,
  sin publicar edad ni romper el parser del dashboard actual. Interfaz y tours nuevos quedan para R2-9.
- Índices compuestos de pagos/ausencias/vacaciones y funcionales de mes/día de cumpleaños/aniversarios.
  Filtros por rango sin funciones sobre las fechas; agregación antes del top y calendario de 31 fechas.
  Planes reales de Oracle con DBMS_XPLAN en tmp/dashboard-rh-planes.json, sin datos personales.
  El calendario usa CAST AS DATE explícito: EXPLAIN con binds infería mal el tipo de EXTRACT,
  aunque la ejecución con los valores ligados ya era correcta.
- Contrato, filtros, políticas y límites en DASHBOARD_RH.md; CATALOGOS, ERD, README, manifiesto de
  filtros y verify:all actualizados. Nuevo comando verify:tableros con esquema desechable.

#### Supuestos y alcance

- Remuneraciones muestra lo efectivamente confirmado, con departamento histórico. No proyecta
  salarios ni novedades impagas. Inasistencias usa clasificación y departamento actuales sin
  recalcular nómina histórica. Cambiar categoría tiene efecto estadístico retrospectivo.
- Días de ausencia son calendario conforme a su captura existente; vacaciones conserva el cómputo
  laboral aprobado. Estar dentro de un rango de vacaciones durante descanso/feriado no suma una
  ausencia laboral hoy. Un 29 de febrero se conmemora el 28 en años comunes, como el criterio previo.
- El reloj inyectable se usa solo desde las pruebas del servicio; la API no permite cambiar hoy en
  vacaciones/celebraciones. No se agregan dependencias, datos sintéticos de aplicación ni UI nueva.
- Las fixtures antiguas fijaban cantidades de migraciones hasta V033/V034. Se reemplaza ese número
  por el total real pendiente desde el corte original; se preservan todas sus aserciones de negocio,
  conservación, permisos y rollback. Versión del tablero ADMIN y db:verify se actualizan a V035.

#### Validación y pendientes

- Node 20.20.2: **749 pruebas aprobadas** (419 backend, 323 frontend y siete del exportador).
  Lint, TypeScript strict, builds y Prettier aprobados; aviso previo de tamaño de chunk Vite vigente.
  Sin dependencias nuevas. La regresión de rutas falla con HEAD anterior y pasa con la implementación.
- **166 casos Oracle/Supertest aprobados** en once suites secuenciales: dashboard 11, seguridad 82,
  catálogos 11, comunicación/tableros 16, empleados 3, horarios 6, códigos 9, empresa 6,
  ubicaciones 6, vacaciones 2 y novedades 14. Incluyen RBAC, 29/02, fin de año, rangos que cruzan mes,
  fracciones históricas, paginación, feriados, V0/V1, versiones y reversión. Esquemas retirados.
- V000–V035 desde cero, segunda ejecución, seeds repetibles, CHECK/UNIQUE/FK, identidades, índices,
  objetos válidos, integridad y rollback aprobados con db:verify; sin cambios de reglas financieras.
- Planes revisados con 12,000 ausencias y 1,200 vacaciones históricas, además de las fixtures de
  siete empleados, pagos y quincenas V0. Ejecución final: remuneraciones **3.03 ms**, inasistencias
  **3.76 ms**, vacaciones **1.07 ms** y celebraciones **1.40 ms**. Pagos, ausencias y vacaciones
  usan IX_PAGO_TABLERO, IX_AUS_TABLERO e IX_VAC_TABLERO. Con siete empleados, celebraciones elige
  el índice existente de estado; el calendario materializado contiene solo 31 fechas. El plan
  salarial une primero conjuntos filtrados y acota detalles por resultado; el join cartesiano
  que eligió Oracle para esa dimensión pequeña aplica después sus FK, sin multiplicar importes.
  Reporte reproducible en tmp/dashboard-rh-planes.json; estos tiempos no son un SLA de producción.
- La prueba previa de códigos exigía CODIGO_ANTERIOR a toda fila; se distingue únicamente el nuevo
  tipo B7, que se crea después de renumerar la v0 y por definición no tiene código anterior.
  Los originales siguen exigiendo su referencia y el código automático nuevo se prueba aparte.
- Imagen Docker de la API construida con éxito. verify:infra confirma Oracle/API/nginx, SPA/assets
  y visor/worker PDF saludables. Trece conteos operativos idénticos antes/después; V034 y cero
  objetos inválidos conservados. No hay fixtures de estas suites en la aplicación.
- **Despliegue local pendiente:** la revisión automática rechazó reiniciar la API y aplicar V035
  sobre Oracle operativo por faltar autorización explícita y comprobación de respaldo/rollback.
  La API operativa continúa en V034; el código y la migración están listos para revisión y commit.
  Después de autorizar se prepara/verifica el respaldo y se actualiza únicamente la API.
- Sin pendientes de implementación de R2-8. Dashboard visual y recorridos nuevos corresponden a
  la fase siguiente. AGENTS.md previo del usuario permanece fuera del commit.

#### Cómo probar

1. Node 20: `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. Oracle saludable: `npm run verify:tableros`; `npm run verify:catalogos`; `npm run verify:comunicacion`;
   `npm run db:verify`; `npm run verify:security` (en secuencia, esquemas temporales).
3. Actualizar API con `docker compose up --build -d nomina2-api`; el arranque aplica V035 y seeds.
4. Como RH/ADMIN consultar GET /api/tableros/rh/{remuneraciones,inasistencias,vacaciones,celebraciones}
   con los filtros documentados en DASHBOARD_RH.md; EMPLEADO debe recibir 403 en las cuatro.
5. Revisar tmp/dashboard-rh-planes.json tras verify:tableros. Sus tiempos describen ese ensayo local,
   no un SLA para cualquier volumen. La implementación visual y sus recorridos siguen reservados.

### FASE R2-9 — Primera vista del dashboard de RRHH

Estado: completada y validada el 20/10/2026. Rama `v1.1`, alcance B7 de interfaz.
El cambio previo del usuario en AGENTS.md permanece fuera del commit.

#### Reproducción y causa raíz

- `/rh` comenzaba con indicadores y usaba únicamente el endpoint antiguo. No consumía las
  agregaciones R2-8 ni ofrecía sus alternancias. La prueba nueva de primera vista falla al
  ejecutarla con InicioPage de HEAD anterior y pasa con la implementación. El archivo se
  restaura inmediatamente tras ese ensayo; registro en tmp de la prueba anterior y posterior.
- Ausencias y Planilla no leían los filtros del enlace al montar; Vacaciones imponía pendientes.
  Se conectan esos filtros para que las barras y las personas abran resultados útiles reales,
  conservando validación y autorización en la API.
- La matriz E2E completa detecta contraste transitorio insuficiente durante el fade de entrada.
  Se elimina la animación de opacidad de tarjetas/paneles y se anima solo su posición: el texto
  mantiene siempre su contraste. Se agrega una regresión de componente para ambas transiciones;
  no se añaden esperas ni se omiten reglas de axe para esconder el problema.

#### Hecho y decisiones

- Saludo «Hola, Nombre Apellido», fecha local y cuatro recuadros antes de los indicadores,
  accesos, evolución, distribución y alertas existentes, incluidas las de perfiles sin salario.
  ADMIN conserva su dashboard administrativo; EMPLEADO su portal. Sin cambios de negocio.
- Top cinco con empleado/departamento, las cuatro métricas y mes/año. Posición, monto GTQ
  exacto y barras horizontales relativas al máximo; se consumen pagos confirmados conforme
  al contrato R2-8. Cada fila abre el historial de Planilla por mes y persona/departamento.
- Inasistencias por empleado/departamento y mes/trimestre/año actuales, barras apiladas,
  desglose de cuatro cantidades con cursor o foco y Escape. IGSS verde, con goce amarillo,
  sin goce naranja y sin justificar rojo; leyenda global con días, siglas y tramas. Cada fila
  abre ausencias aprobadas del rango y empleado/departamento actual, con filtros aplicados.
- Vacaciones En curso/Próximas a 30/60/90 días, línea de tiempo, fechas/días laborales, contador
  de personas ausentes hoy y paginación de cinco por lista. Cambiar pestaña/plazo vuelve a la
  primera página. El contador conserva los criterios laborales y feriados de la API.
  Cada persona abre sus solicitudes con rango y todos los estados, incluidas aprobadas/tomadas.
- Cumpleaños/aniversarios de hoy y 30 días siguientes, marca «¡Hoy!» y animación sutil acotada.
  Solo aniversarios muestra años. Enlaces a ficha, listas desplazables sin truncar y pestañas
  con flechas/Inicio/Fin, selección y panel etiquetados. No se publica edad ni nacimiento.
- Consultas Zod/TanStack Query independientes, claves por filtro, AbortSignal, actualización
  cada minuto en pestaña activa y botón común Actualizar. Skeletons, vacíos con acceso útil,
  fallo aislado/reintento y último corte con «Actualizado hace X» actualizado por reloj local.
  Una actualización fallida conserva el resultado anterior con una explicación explícita.
- Framer Motion para entrada escalonada, crecimiento de barras, conteos y cambio de pestañas;
  movimiento reducido desactiva también las animaciones de las gráficas anteriores Recharts.
  Las cadenas monetarias exactas permanecen accesibles; Number solo interpola/escala lo visual.
  Se agrega framer-motion (tres paquetes transitivos/directos en total); auditoría npm: cero vulnerabilidades.
- Tarjetas, sombra, tipografía y azul/verde derivados de la página 6 del mockup y tokens existentes;
  colores estadísticos fijos en tokens. Cuadrícula 2×2 y una columna a 800 px o menos. Iconos
  centralizados; hints y tours de dashboard, novedades, Planilla y Vacaciones actualizados.
- Filtros entrantes con lista blanca y formatos válidos; chips/exportación/orden siguen usando
  la consulta real. Novedades muestra departamento actual y reutiliza la cascada de empleados.
  Se ajusta la expectativa del saludo en la prueba de login RH por el cambio B7 solicitado;
  sus aserciones de sesión, redirección y permisos se conservan.
- La regresión R2-2 comprueba ahora «Hola» en el h1 RH, conservando Bienvenido para los otros
  roles. El manifiesto de Vite incluye el CSS de la página: la prueba de nginx valida text/css
  para ese recurso y JavaScript para los chunks, manteniendo 200, caché inmutable y 404 reales.

#### Supuestos y alcance

- Inasistencias usa el periodo que contiene hoy, con sus límites visibles; remuneraciones
  permite elegir mes/año. Las preferencias son filtros de consulta y no borradores de formularios.
- No se modifican backend, migraciones V000–V035, cálculos, snapshots ni datos operativos.
  Las fixtures de ejemplo viven exclusivamente en un esquema N2E2E validado y desechable.
  Los errores iniciales de fixture (NIT sin guion y agregado SQL con subconsulta) se corrigen
  en la prueba, sin relajar CHECK ni modificar reglas de la aplicación.
- Continúa pendiente el despliegue operativo de V035 documentado en R2-8 y de las imágenes
  API/web nuevas. Esta fase comprueba el despliegue completo en nginx/TLS y Oracle temporales;
  no aplica migraciones ni reemplaza servicios del entorno operativo.

#### Validación y pendientes

- Node 20.20.2: **760 pruebas aprobadas**: 419 backend, 334 frontend (once nuevas del dashboard)
  más siete del exportador. Las nuevas cubren primera vista/alertas, cuatro cargas, alternancias,
  periodos/mes, enlaces, paginación, teclado, privacidad de cumpleaños, movimiento reducido,
  vacíos, error/reintento, antigüedad y lista blanca. La regresión falla con InicioPage anterior.
- Los dos E2E nuevos pasan con API/Oracle reales y nginx/TLS: datos de remuneración de ejemplo,
  cuatro categorías, vacaciones y celebraciones; filtros realmente aplicados en los destinos,
  ayuda, escritorio/móvil, movimiento reducido y axe WCAG A/AA. Capturas inspeccionadas en
  tmp/pdfs/r2-9-dashboard-{escritorio,movil}.png. Datos y esquema temporales eliminados al terminar.
- Lint, TypeScript strict, build y exportador aprobados. Aviso previo de chunk Vite >500 kB
  permanece. Al ejecutar compilaciones y todas las suites en paralelo, un caso previo de acciones
  de catálogos supera sus 5 s; se repite su archivo aislado: 36/36 aprobados, sin cambiar tiempos
  ni aserciones. Las otras 333 pruebas frontend ya habían aprobado en ese ensayo.
  Confirmación final con dos workers: 419/419 backend, 334/334 frontend y 7/7 exportador aprobados.
- **69/69 E2E aprobados (6.2 min)** con nginx/TLS y API/Oracle reales. Incluye la matriz completa
  de páginas por rol, ayudas, hints, teclado, móvil y axe A/AA; los dos casos del dashboard,
  cálculos/pagos/cierres, documentos, códigos, borradores, catálogos y novedades. La matriz que
  detectó el contraste transitorio pasa sin omitir reglas ni esperar artificialmente a la animación.
  Datos, esquema, contenedor e imagen exclusivos de pruebas retirados al terminar.
- Lint, TypeScript strict, build, Prettier, secretos y diff --check aprobados. Sin pendientes de
  implementación de R2-9; se conserva únicamente el despliegue operativo pendiente descrito arriba.

#### Cómo probar

1. Node 20: `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run format:check`.
2. `npm run test:e2e -- --production dashboard-rh.spec.ts`; regresión: `npm run test:e2e -- --production`.
3. Con API actualizada a V035 y web nueva, entrar como RH en `/rh`: saludo y cuatro recuadros
   primero; alternar empleado/departamento, métricas, mes, periodos, vacaciones y celebraciones.
4. Seguir cada barra/persona y revisar chips/resultados filtrados. Probar Ayuda, teclado,
   reintento sin conexión, viewport 390 px y preferencia de movimiento reducido del dispositivo.

### FASE R2-10 — Cierre de la ronda

Estado: completada y validada el 20/10/2026. Rama `v1.1`.
El cambio previo del usuario en AGENTS.md se conserva fuera del commit.

#### Reproducción y causas raíz

- El modo E2E de producción compilaba nginx en Docker pero ejecutaba la API desde TypeScript
  en el host. Ahora ambos servicios se ejecutan con sus Dockerfile y entrypoints originales;
  la preparación del esquema temporal termina y cierra su pool antes de arrancar la API.
- verify:migration seguía exigiendo diez migraciones y anunciando V030. Consulta ahora los SQL
  versionados para comprobar todas las pendientes hasta V035 y admite el corte Git v1/V030.
  Los códigos semánticos que no se renumeran se comparan en su columna original, y los contadores
  solo pueden avanzar por la cantidad exacta de nuevas reservas de su entidad.
- La nueva regresión de contraste falla antes del arreglo con **4.2183:1** en SG sobre naranja.
  Axe no resolvía ese texto sobre background-image. Las cuatro siglas se colocan sobre blanco
  sólido dentro de sus muestras; se conservan colores, tramas, bordes y etiquetas originales.
  La comprobación numérica exige 4.5:1 y se conserva axe WCAG A/AA.
- La regresión completa encontró Siguiente habilitado al editar mientras todavía se consultaba
  el contrato. El paso 2 se detenía y mostraba un error transitorio. La reproducción determinista
  retiene la consulta real: antes del arreglo falla porque Siguiente sigue habilitado. Ahora
  Siguiente/Guardar y el envío implícito esperan la regla resuelta, con estado y tooltip; un fallo
  ofrece Reintentar regla. No se amplían tiempos ni se simulan datos para ocultar la carrera.
- La ayuda del horario inline todavía decía que Cancelar conservaba siempre. Se corrige a las
  dos decisiones reales de salida. Ayuda e hints del asistente explican también la espera/reintento,
  y la del dashboard describe las siglas sobre fondo sólido. Los recorridos siguen solo manuales.

#### Hecho y decisiones

- `test:e2e -- --production` construye API/web, usa la red nomina2_default y servicios temporales
  en 3018/8448, con NODE_ENV=production, TLS, cookies Secure, API y Oracle reales. Fixtures fuera
  de las imágenes; contraseñas por entorno, sin argumentos Docker. Limpieza de ambas imágenes,
  contenedores y esquema al terminar. El modo Vite se mantiene para desarrollo.
- verify:all incorpora esa modalidad, la migración desde v1 y lint de los verificadores nuevos.
  La matriz de páginas/ventanas comprueba ausencia de Conoce esta página y de driver antes del clic,
  y ausencia de banderas persistidas. Se amplía la matriz HTTP a las cuatro agregaciones y selector,
  incluido el rechazo del dashboard RH antiguo para EMPLEADO.
- Auditoría de seguridad en routers/services/repositories: cuatro agregaciones RH/ADMIN, SQL con
  binds y no-store; selector mínimo sin salario/DPI/NIT/banco, filtro departamental en ambas consultas;
  notificaciones ligadas siempre al usuario de sesión, también ADMIN, con CSRF y auditoría transaccional.
  La boleta propia del portal conserva su acceso; no se exponen salarios del equipo a EMPLEADO.
- verify:migration:v1 reconstruye el corte v1 con su código, migraciones y seeds, agrega historia,
  pago/boleta BLOB, novedad pendiente, ambas direcciones y duplicados con sufijo ocupado/UNIQUE exacto.
  Incluye un empleado vinculado a un departamento duplicado. Compara todas las columnas/PK previas,
  hashes, importes, snapshots, documentos y referencias; exige constraints validadas, objetos válidos
  e idempotencia de migraciones y seeds. No se modifica ninguna migración histórica V000–V035.
- Resultado v1: **72 tablas previas y 746 filas originales conservadas**; 780 filas después en esas
  tablas por las nuevas reservas/configuraciones. Tres duplicados sintéticos corregidos: departamentos
  « ingenieria migrada » → «ingenieria migrada (duplicado 3)» y «INGENIERÍA MIGRADA» →
  «INGENIERÍA MIGRADA (duplicado 4)»; parentesco «Parentesco migrado» → «Parentesco migrado (duplicado 2)».
  Los tres quedan inactivos, conservan PK/código y archivan el original. Ganan los más antiguos y
  el sufijo 2 ya ocupado no se reutiliza. Las FK del empleado/puesto permanecen idénticas.
- Regresión v0: **55 tablas y 157 filas originales conservadas**, 169 después; hasta V035,
  restricciones, idempotencia y bytes documentales aprobados. Informes locales sin secretos en
  tmp/migracion-v0-v1.json y tmp/migracion-v1-v1.1.json; copias/esquemas retirados.
- verify:clean contrasta además la versión de la API con el último SQL versionado, cero objetos
  inválidos y cero migraciones pendientes; guarda tmp/aceptacion-limpia.json. README y DECISIONES
  documentan la aceptación, las transformaciones permitidas, la seguridad y los límites operativos.

#### Supuestos y límites

- No se proporcionó un respaldo externo v1. Se ensaya una copia reproducible del corte Git con
  datos históricos de regresión; desplegar requiere complementar con el respaldo real de empresa.
- Los datos de prueba viven exclusivamente en esquemas/proyectos desechables. No se migró ni
  reinició la instalación operativa V034: su actualización a V035 sigue siendo el despliegue
  documentado en R2-8/R2-9. Esta fase verifica el paquete final en instalaciones aisladas.
- Docker tenía el disco al 100 %. Se liberaron 3.513 GB de caché regenerable sin uso y 996.1 MB
  de imágenes sin etiqueta/sin contenedores; se conservaron imágenes etiquetadas, volúmenes y datos.
- Un ensayo redundante de Oracle vacío simultáneo a otras suites agotó la capacidad de los 8 GB
  de Docker: provocó tiempos de espera de pruebas/limpieza. Se interrumpieron esos procesos propios,
  se retiraron sus contenedores/volúmenes y el único esquema parcial sin sesiones, y se continúa
  en secuencia. La primera instalación limpia y primera regresión 69/69 ya habían pasado.
- Los avisos previos de tamaño de chunk Vite permanecen; no se cambia el límite para ocultarlos.

#### Validación y pendientes

- Regresión final con ambas correcciones e imágenes reales API/nginx: **69/69 E2E aprobados (6.4 min)**.
  Matriz de **142 vistas y 1,960 pasos de ayuda** (ADMIN 64, RH 62, EMPLEADO 16), más ventanas.
  Cubre login sin avisos, lazy/MIME/caché/recuperación, barra azul/Inicio, avisos propios, borradores,
  asistente mínimo/completo, catálogos, cascada, cuatro recuadros, documentos y pagos/cierre.
- Node 20.20.2: 760 pruebas aprobadas (419 backend, 334 frontend y siete del exportador), lint,
  TypeScript strict, build, Prettier y secretos. Controles afectados por el asistente repetidos
  sobre el código de entrega; 334/334 frontend aprobadas de nuevo. Contraste numérico, ayuda
  solo manual, hints, teclado, anchos y axe A/AA pasan sin omitir reglas ni relajar aserciones.
- **212/212 Oracle/Supertest** aprobados en catorce suites: seguridad 82, solicitudes 20, dashboard 11,
  catálogos 11, empleados 3, pagos 16, novedades 14, vacaciones 2, horarios 6, empresa 6, ubicaciones 6,
  códigos 9, prestaciones 10 y comunicación 16. Se repitió empleados tras la falta de recursos;
  3/3 aprobadas sin cambiar tiempos ni aserciones. Todos sus esquemas desechables retirados.
  db:verify desde cero V000–V035, restricciones, índices y seeds repetibles aprobado.
- **Instalación limpia final aprobada** con el código de entrega: Compose completo desde volúmenes
  nuevos, V035, Oracle thin, cero objetos inválidos/migraciones pendientes, login, cambio obligatorio,
  cookie Secure/Strict, administración, ayuda manual y axe A/AA. Contenedores, imágenes, credenciales,
  red y volúmenes exclusivos retirados al terminar. verify:infra aprobado para la instalación
  conservada: Oracle/API/nginx, rutas SPA/assets y visor/worker PDF.
- Capturas finales de asistente, catálogos y dashboard en escritorio/móvil inspeccionadas:
  campos cortos comparten fila, etiquetas/hints/errores alineados, sin desbordamiento y leyenda legible.
  Artefactos locales en tmp/pdfs y playwright-report, ignorados por Git.
- Lint, TypeScript strict, build, Prettier, secretos y diff --check aprobados. Sin pendientes técnicos
  de R2-10. El despliegue operativo a V035 y el ensayo del respaldo real siguen como tareas de
  operación explícitas; no se sustituyen por fixtures ni por la reconstrucción del corte Git.
  AGENTS.md previo del usuario permanece fuera del commit de cierre.

#### Cómo probar

1. Configurar .env desde .env.example; `docker compose up --build -d --wait --wait-timeout 900`.
2. Node 20, npm ci y Chromium: `npm run verify:all` (secuencial; Oracle de trabajo saludable).
3. Solo navegador Docker: `npm run test:e2e -- --production`; migración v1: `npm run verify:migration:v1`.
4. Instalación vacía: `npm run verify:clean`; informes locales en tmp y playwright-report.
5. Revisar Ayuda manual, asistentes, decisiones de borrador, catálogos inválidos/duplicados/en uso,
   notificaciones propias, cascada y alternancias del dashboard en escritorio y móvil.

### Ajuste visual — Centrado compartido de páginas de formulario

Estado: completado y validado el 20/10/2026 en `v1.1`.

#### Causa y corrección

- `app-contenido` ocupaba todo el ancho con padding, mientras `form:has(.form-grid)` solo
  limitaba el formulario a 72 rem, sin márgenes automáticos. Los títulos y pestañas quedaban
  fuera de ese límite. La regresión con Préstamos nuevos falla antes del arreglo a 1920 px:
  **712 px de diferencia entre los márgenes izquierdo y derecho** de la tarjeta.
- Nuevo `FormPageContainer` con `Outlet`, aplicado por grupos de rutas sin cambiar URLs ni
  permisos: las seis novedades en alta/edición, empleado nuevo/edición, carga masiva, empresa,
  tarifas de parqueo, simulación de pago y Mis datos. El bloque incluye encabezado, pestañas,
  borrador, código, tarjetas y acciones, también durante carga o error.
- `.form-page`: ancho 100 %, máximo 75 rem (1200 px), márgenes horizontales automáticos y
  padding de 24 px en escritorio / 16 px bajo 768 px. El padding sustituye al del contenido
  solo en esas páginas. La barra superior mantiene su ancho completo y estilos originales.
- `CampoCodigo` reserva 18 caracteres visuales como mínimo y crece con el código recibido;
  conserva la propiedad `tamano` explícita. Se mantiene visible el prefijo/año/correlativo
  completo, sin modificar sus valores, API, hints ni readonly. Las acciones compartidas de
  novedades permiten saltar de fila en móvil.

#### Supuestos y alcance

- Los formularios de catálogos, usuarios, comunicaciones, solicitudes y operaciones contextuales
  ya se muestran en diálogos centrados mediante `.modal`; no requieren estrechar sus listados.
  Se mantiene la proporción de campos y el tope interno de FormGrid.
- Se respeta la instrucción de conservar textos, hints, colores, tipografía, orden y validaciones.
  Los objetivos y recorridos de ayuda existentes siguen asociados a sus controles; las seis
  ediciones comprueban que la ayuda abre y cierra. Sin cambios de backend ni migraciones.
- Las pruebas usan API/Oracle reales con un esquema N2E2E desechable. No se reemplazan los
  servicios operativos ni se modifican sus datos. El despliegue de este ajuste queda a elección
  del usuario mediante la reconstrucción del servicio web; se completó por su solicitud posterior
  de reiniciar, registrada al final de este documento.

#### Validación

- 760 pruebas existentes aprobadas (419 backend, 334 frontend y siete del exportador), lint,
  TypeScript strict y build con Node 20.20.2. Permanece el aviso previo de chunk Vite >500 kB.
- Nueva regresión de Playwright: centrado y alineación, código legible, barra sin estrechar,
  campos/botones dentro del viewport y ausencia de scroll horizontal. Matriz de 19 vistas
  en 1920, 2560, 1366, 768 y 390 px; incluye las seis altas y las seis ediciones de novedades.
  Capturas de Préstamos en escritorio/móvil inspeccionadas en tmp/pdfs/formulario-centrado-*.
- **17 E2E existentes y cuatro nuevos aprobados** en producción con imágenes API/nginx, TLS
  y Oracle reales: primero se verificaron las suites Ronda 2/asistente; el ensayo final de
  las cuatro regresiones nuevas pasó completo (30.5 s, incluido arranque). Las 95 combinaciones
  mantienen márgenes iguales con tolerancia de 2 px; se verifica el ancho del código contra
  su texto real. Se retiraron los esquemas, contenedores e imágenes exclusivos de pruebas.
- Lint, TypeScript, build, Prettier, revisión de secretos y diff --check aprobados. Sin pendientes
  de implementación del centrado. El despliegue posterior está completado; se conserva únicamente
  la incidencia previa de correo descrita en este registro.
- Mis datos verifica restauración del borrador y error de correo; Comisiones comprueba validación,
  guardado real con confirmación y limpieza del borrador. En el primer ensayo se corrigió un selector de
  la prueba: la etiqueta existente es Correo electrónico; no se cambió texto de la aplicación.
- Pendiente ajeno al centrado: el `pattern` HTML de EmailField ya contiene dobles barras
  literales en JSX. En Mis datos (formulario con validación nativa) el navegador bloquea un
  correo válido antes de confirmar; se observó con contacto.layout@example.test. Se conserva
  por la instrucción expresa de no cambiar validaciones. No se omiten restricciones ni se
  fuerza el envío para esconderlo; el envío solicitado se verifica en el formulario de comisión.

#### Cómo probar

1. Node 20: `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`.
2. Oracle saludable: `npm run test:e2e -- --production formularios-layout.spec.ts ronda2.spec.ts asistente-empleado.spec.ts`.
3. Para cargarlo en la instalación local: `docker compose up --build -d --no-deps nomina2-web`.
4. Revisar altas/ediciones con los cinco anchos indicados; título, pestañas, aviso y tarjeta deben
   compartir alineación, y Código debe verse completo. Probar Ayuda, borrador, validación y envío.

## Despliegue operativo posterior al cierre de Ronda 2

Estado: completado el 20/10/2026, por solicitud explícita de reiniciar y cargar los ajustes.

- API y web reconstruidas y recreadas; Oracle y los volúmenes de datos/TLS conservados. La API
  aplicó V035 sobre V034 y los tres servicios quedaron saludables. No se modificaron credenciales.
- Antes de actualizar se detuvieron API/web y se exportó el esquema operativo con Data Pump y
  SCN consistente. La restauración en un esquema exclusivo conservó exactamente **77 tablas y
  916 filas**, todas sus columnas/bytes y cero objetos inválidos. El esquema de ensayo se retiró.
- Copia privada con permisos restrictivos en tmp/respaldos; el puntero local
  tmp/respaldo-reinicio-actual.json indica su carpeta. Dump, hashes y reportes están ignorados por
  Git. Imágenes anteriores conservadas como nomina2-respaldo-api/web:r2-10-v034-20261020.
- Tras aplicar V035 se compararon las **72 tablas operativas sin transformaciones previstas** con
  las huellas anteriores: idénticas. Se separaron VERSION_ESQUEMA, SESIONES, TIPOS_AUSENCIA y las
  dos tablas de reservas/contadores por sus cambios esperados. Categorías completas, cero objetos
  inválidos y cero migraciones pendientes. Informe privado en despliegue-verificado.json del respaldo.
- verify:infra aprobado: API/Oracle, nginx, rutas SPA/assets y visor/worker PDF. Aplicación recargada
  y visible en https://localhost:8443/login, sin avisos de ayuda automáticos. Permanece abierta para
  que el usuario pruebe con sus credenciales habituales.
- Resueltos el despliegue operativo V035 y el ensayo del respaldo real que figuraban pendientes
  en R2-8/R2-9/R2-10. Las verificaciones nuevas fueron de despliegue/conservación; no hubo cambios
  de código de aplicación ni migraciones adicionales.

### Reinicio y despliegue del centrado de formularios

Completado el 20/10/2026 por solicitud del usuario, para cargar la corrección de formularios.

- Imágenes API/web reconstruidas; los tres servicios se detuvieron y se levantaron de nuevo con
  Compose. Oracle, API y web saludables. Volúmenes Oracle/TLS y credenciales conservados.
- `npm run verify:infra` aprobado: Oracle thin, API, HTTP/HTTPS, rutas React, assets y worker PDF.
  Se comprobó el CSS de centrado dentro de nginx y se solicitó abrir https://localhost:8443/login
  en el panel de Codex para probar con las credenciales habituales. Sin cambios de esquema ni
  lógica de aplicación.

### Verificación de la pestaña existente en Safari

- El usuario reportó que seguía alineado a la izquierda después del despliegue. Se reprodujo
  en su pestaña de Safari: Consumo en tienda conservaba la aplicación anterior ya cargada.
  La comprobación previa del servidor no había recargado esa pestaña del usuario.
- Al recargar Safari con Cmd+R, el mismo formulario quedó centrado. Se abrió después Nuevo
  empleado y se confirmó título, aviso, pasos y tarjeta dentro del bloque centrado. El borrador
  existente sigue disponible para Continuar; no se restauró, descartó ni envió ningún dato.
- Evidencia local en tmp/pdfs/empleado-centrado-safari.jpg. Sin cambios de código adicionales:
  las pruebas anteriores validaban el build nuevo; esta comprobación cubre la pestaña operativa
  que todavía ejecutaba la versión anterior al reinicio.

## Datos demo — FASE 2: fuente única JSON

Estado: completada el 20/10/2026 en `v1.1`. Se detiene antes de implementar el cargador de fase 3.

### Contexto y decisiones autorizadas

- Fase 1 realizada sin escrituras: migraciones V000–V035 y diccionario real contrastados mediante
  transacciones de solo lectura. 36 migraciones APLICADA, cero objetos inválidos, catálogos INE
  22/340, un banco, tres empleados y dos ADMIN existentes. No había SALARIO_MINIMO_MENSUAL
  ni tarifas de parqueo. Diagnóstico temporal en /private/tmp/nomina2-diagnostico-demo-fase1.md.
- El usuario aprobó el plan y autorizó inventar el mínimo de referencia, usar los códigos del
  generador, prescindir de jerarquías y añadir cinco bancos guatemaltecos con teléfonos ficticios.
  Se acepta la propuesta de 24 indefinidos + 8 temporales y se conservan los ADMIN existentes.
- No hay cambios de esquema, migraciones, lógica de negocio ni pantallas; tampoco se cargan
  filas en Oracle durante esta fase. La ERS original sigue sin localizarse; la certificación
  exacta de RF-01/02/05/06/13/18/21 permanece pendiente, con la discrepancia RF-21 ya señalada.

### Hecho

- Fuente única en database/seed/data: departamentos.json (5), puestos.json (30), centros.json
  (10), horarios.json (7), empleados.json (32), bancos.json (5) y configuracion.json. Los dos
  últimos amplían los cinco archivos originales por la solicitud de bancos y para centralizar
  versión, fecha, parámetros de referencia, fuentes y claves de catálogos existentes.
- Seis puestos por departamento; 7/6/6/7/6 empleados en TI/RH/FC/OL/VSA. Todos los puestos
  cubiertos; Soporte Técnico y Auxiliar de Bodega tienen dos personas. 15 mujeres y 17 hombres;
  los 32 con salario, banco/cuenta/tipo, contacto, ubicación INE y horario. 2 RH y 30 EMPLEADO.
- Referencia temporal 20/10/2026, America/Guatemala. Tres empleados con menos de un año,
  cuatro con más de diez y seis cumpleaños/seis aniversarios en los próximos 30 días, incluido hoy.
  Ocho contratos temporales con fin futuro y 24 indefinidos sin fin. Salarios mensuales entre
  Q4,200.00 y Q28,000.00, total Q332,000.00, dentro de ±10% de la referencia de cada puesto.
- Claves de catálogos calculadas con generarCodigoGenerico/resolverCodigoGenerico, sin códigos
  físicos forzados. Se detectaron colisiones de centros y se resolvieron con la misma función:
  Sede Central SC, Sucursal Cobán SCRS y Sucursal Chiquimula SC2. Las claves solo enlazan JSON;
  los triggers asignarán los códigos definitivos de cada destino durante la futura carga.
- Siete horarios con bloques y descansos válidos: cuatro variantes diurnas administrativas,
  mixto, nocturno que cruza medianoche y bodega L–S. Jornadas y límites diarios/semanales
  comprobados con analizarHorario. La mayoría de empleados son diurnos; todos los horarios,
  centros y bancos tienen al menos una asignación.
- Banco Industrial, Banco de Desarrollo Rural, Banco G&T Continental, Banco de América Central
  y Banco Agromercantil de Guatemala, contrastados con el listado oficial de Banco de Guatemala
  https://banguat.gob.gt/page/bancos-nacionales el 20/10/2026. Solo cuentas y datos personales
  ficticios. Industrial se reutilizará cuando exista: cinco bancos demo no significa duplicar
  los existentes ni insertar necesariamente cinco filas nuevas.
- Extras declarados en empleados.json, para consumir solo con --with-extras en fases posteriores:
  tres historiales salariales, tres parqueos (dos carros/una moto), préstamo Q1,200/6 cuotas,
  anticipo Q300/1 cuota, incapacidad IGSS, permiso sin goce y cuatro comisiones de septiembre
  exclusivamente de Ventas. Referencias únicas y fechas compatibles con el ingreso.
- DATASET.md documenta los archivos, referencias, conteos, semántica de códigos, diferencias
  del esquema, supuestos, fechas, extras y límites. No se crean todavía seed-demo.js,
  seed-remote.js, seed_demo.sql, verify-seed.js ni comandos npm de fases futuras.

### Supuestos y límites

- Mínimo **ficticio demo Q4,000.00**, autorizado por el usuario, desde 01/01/2014 para cubrir
  la historia de ingresos. No es una afirmación legal. Está solo en configuracion.json;
  todavía no existe en Oracle. La futura carga lo creará únicamente si falta configuración
  aplicable y no provoca solapamientos, conservando cualquier vigencia real del destino.
  Ante un mínimo configurado mayor que algún salario, deberá reportar conflicto y revertir.
- Se retira el requerimiento anterior de jerarquía/jefe obligatorio: jefatura es null en los
  32 empleados y no se crearán JEFATURAS. La futura verificación respetará esta instrucción.
- CENTROS_TRABAJO no tiene TELEFONO: los diez valores inventados se guardan únicamente como
  telefonoReferencia del JSON y no se cargarán ni ocultarán en otra columna. Teléfonos de
  empleados/contactos sí corresponden a campos reales y se validan con ocho dígitos.
- Salario y banco se completan juntos para respetar el grupo opcional exigido por el backend.
  PUESTOS tiene rangos; el salario efectivo se cargará en HISTORIAL_SALARIAL, sin columnas nuevas.
  Para el conjunto básico se supone salario actual desde el ingreso; --with-extras usa las
  vigencias detalladas de tres personas. No se inventan pagos previos ni vacaciones tomadas.
- Tarifas de parqueo demo Q200 carro/Q75 moto desde septiembre, solo con --with-extras y sin
  reemplazar tarifas operativas. La carga validará vigencias, solicitud/aprobación/suscripción
  y reglas actuales; no insertará descuentos manuales para evitar el flujo de parqueo.
- No hay contraseñas, hashes, tokens ni IDs Oracle en los JSON. Los usuarios y códigos se
  generarán al cargar. SEED_DEFAULT_PASSWORD se configurará por entorno en fase 3, con hash
  y cambio obligatorio existentes; no se modifican credenciales ni .env en esta fase.

### Validación

- Validación de los siete JSON con funciones/esquemas reales del proyecto: entradaSchema de
  catálogos, crearEmpleadoSchema, erroresFechas, nitValido, zonaValida, analizarHorario,
  schemas de novedades, tarifaSchema, placaSchema, baseNombreUsuario y el generador de códigos.
  Claves resueltas a identificadores transitorios en memoria solo para validar Zod, sin persistir
  esos valores y sin sustituir la resolución real por claves naturales que corresponde a fase 3.
- Comprobados conteos, relaciones, 30 puestos cubiertos, duplicados de DPI/NIT/IGSS/correo/cuenta,
  NIT módulo 11, ubicación oficial, sexo M/F, contratos, fechas, antigüedad, cumpleaños/aniversarios,
  todos los centros/horarios/bancos usados, grupo salarial y límites ±10% con decimal.js.
  Extras contrastados con catálogos semánticos de S001, incluyendo PERMISO_SIN_GOCE e
  INCAPACIDAD_IGSS, estados, referencias y periodos. Informe en tmp/dataset-demo-fase2-validacion.json.
- Node 20.20.2: lint aprobado y **760 pruebas existentes aprobadas** (419 backend, 334 frontend,
  siete del exportador). Supertest necesitó permisos para escuchar en localhost fuera del sandbox;
  el primer intento restringido produjo listen EPERM y se repitió solo backend/exportador.
  Frontend ya había aprobado y no se repitió. Sin cambios en las pruebas de aplicación.
- El primer contenedor de pruebas no incluía eslint-plugin-react-hooks con el montaje usado;
  se utilizó el runtime nativo Node 20.20.2 ya disponible en la caché local. El contenedor temporal
  se retiró automáticamente, sin red ni Oracle. No se instalaron paquetes ni se modificaron imágenes.
- Prettier de JSON/documentación, revisión de secretos y diff --check aprobados. El validador
  ad hoc y los informes quedan en tmp, ignorados por Git; no se adelanta el verificador de fase 5.

### Cómo revisar y siguientes fases

1. Abrir database/seed/DATASET.md y los siete archivos en database/seed/data. Revisar distribución,
   importes, bancos y supuestos. En esta fase no se necesita ni se escribe la base de datos.
2. Con Node 20: npm run lint; npm test; npm run verify:secrets. Los Supertest requieren permitir
   el servidor HTTP temporal de localhost. Comprobar formato de los JSON con Prettier.
3. En este entorno, repetir la validación de datos con node --import tsx tmp/validar-dataset-demo-fase2.mjs.
   Es una herramienta temporal de esta revisión; la verificación reproducible versionada será fase 5.
4. Esperar confirmación antes de fase 3: cargador thin, preflight, entorno, transacción, idempotencia,
   dry-run y reset seguro. Fase 4: exportación SQL/remota y documentación operativa. Fase 5: verificación
   sobre Oracle y app, doble carga, rollback/reset, login y simulación. No ejecutadas todavía.

## Datos demo — FASE 3: cargador y carga local

Estado: completada el 20/10/2026 en `v1.1`. El usuario indicó que aún no veía los registros;
se completó el cargador y se ejecutó la carga básica local. Las fases 4 y 5 no se adelantan.

### Resultado y alcance

- `npm run seed:demo` disponible mediante scripts/seed-demo.js, entrada JavaScript que reutiliza
  los módulos TypeScript strict de backend/src/shared/db/demo. Sin dependencias nuevas, cambios
  de migraciones ni modificaciones de la lógica de negocio o la interfaz.
- Carga local confirmada: **32 empleados demo añadidos y 3 anteriores conservados, 35 en total**.
  Conteos finales: 8 departamentos, 34 puestos, 13 centros, 8 horarios y 5 bancos; las diferencias
  respecto al conjunto corresponden a registros previos. 37 usuarios en total, sin crear otro ADMIN.
- Los 32 demo tienen salario, banco/cuenta/tipo, horario, contacto y usuario; todos los expedientes
  se muestran completos desde el mismo repositorio que usa el CRUD. Sin jefaturas, por la decisión
  del usuario. La cuenta inicial o datos de los empleados anteriores no se alteraron.
- Se creó la referencia ficticia SALARIO_MINIMO_MENSUAL Q4,000, ausente antes de la carga, con
  fundamento y motivo demo del JSON. Se reutilizaron Recursos Humanos y Banco Industrial;
  se insertaron los otros cuatro bancos. Los códigos/contadores fueron asignados por N2_CODIGOS.
- Extras desactivados en la carga operativa inicial. Permanecen disponibles con --with-extras;
  sus escrituras se probaron exclusivamente en esquemas desechables.

### Implementación y decisiones

- CLI con DB_USER/DB_PASSWORD/DB_CONNECT_STRING, validación Zod de la contraseña y conexión thin.
  Default de conexión localhost:1521/XEPDB1; errores claros y sin SQL, stack, contraseña o hash.
  `.env.example` documenta SEED_DEFAULT_PASSWORD sin valor. En el `.env` privado local se generó
  una contraseña aleatoria conforme a la política existente, con comillas y permisos 0600;
  no se imprimió ni se incorporó a Git. No se cambió DB_PASSWORD ni ninguna clave ADMIN.
- Reutiliza entradaSchema, crearEmpleadoSchema, fechas/NIT/zona, límites/analizador de horarios,
  generarNombreUsuario, hashearContrasena, repositorios de catálogos/empleados/usuarios y auditoría.
  Las FK se resuelven por nombre normalizado, código INE y claves semánticas, nunca por IDs fijos.
  SQL y binds quedan en los repositorios; el CLI y los servicios controlan la transacción.
- Preflight exige migraciones/checksums V000–V035, columnas y tablas necesarias, objetos válidos,
  constraints habilitadas/validadas, catálogo INE 22/340 y ADMIN activo. Rechaza registros inactivos
  o colisiones incompatibles; no adopta un empleado ajeno aunque tenga correo @demo-nomina.test.
- Una conexión y un commit al terminar el DML; fallo revierte también usuarios, vigencias,
  auditoría y reservas de códigos. Bloqueos de los catálogos existentes serializan los escritores.
  Se conservan contraseñas/cambio obligatorio y cambios posteriores de registros ya cargados.
- --dry-run usa SET TRANSACTION READ ONLY: valida/previsualiza sin INSERT ni reservas, con IDs
  transitorios exclusivamente en memoria. Incluye previsión de las seis nuevas vigencias salariales
  cuando se inspecciona --with-extras sobre el conjunto básico. No simula con INSERT+rollback.
- --apply-schema solo instala DDL/seeds oficiales si USER_TABLES está vacío. Exige el esquema
  previamente creado y ADMIN_* por entorno; no crea usuarios Oracle ni concede privilegios.
  La etapa de migraciones confirma por separado y no puede revertirse con el DML del demo.
  Se rechaza la combinación con --dry-run o --reset-demo. No hace DDL sobre una base con tablas.
- Propiedad de filas mediante eventos SEED_DEMO_CREAR/ACTUALIZAR/BORRAR en BITACORA_AUDITORIA:
  conjunto, clave, tabla, ID local y SHA-256 del contenido, sin exponer datos sensibles. No basta
  el dominio del correo ni una relación con un padre demo para apropiarse de una fila posterior.
- --reset-demo es una operación exclusiva de borrado; no recarga automáticamente. Antes de
  borrar verifica huellas, bloquea las filas y recorre todas las FK, incluyendo las compuestas;
  cancela completo ante una edición o dependencia ajena. Ordena hijos antes de padres sin
  deshabilitar constraints. Conserva ADMIN, catálogos reutilizados, bitácora, reservas/contadores.
- Los extras reutilizan amortizar, guardarMensual, desglosarAusencia, aprobarParqueo y repositorios
  de tarifas/solicitudes/historial/notificaciones. No hay descuentos de parqueo manuales.
  Las suscripciones comienzan en el mes real de aprobación; mesInicio anterior del JSON es solo
  referencia y se informa en el resumen. Tarifas operativas e historia modificada se conservan.
- El reset no elimina usuarios ya usados si sus sesiones/auditoría u otras referencias deben
  conservarse. Tampoco adopta cuotas, avisos o movimientos nuevos ajenos al cargar otra vez.
  No puede garantizar correlativos sin huecos tras fallos porque Oracle no revierte identidades;
  nunca se fuerzan PK, se rebajan contadores o se reutilizan códigos reservados.
- README y database/seed/CARGA.md explican entorno, banderas, seguridad y límites. DATASET.md
  actualizado para distinguir el JSON de la carga ya ejecutada. `test:seed-demo` integra una suite
  Oracle nueva en el runner existente de esquemas temporales, sin crear el verificador de fase 5.

### Validación y comprobación operativa

- Node 20.20.2: **765 pruebas existentes y nuevas aprobadas** (424 backend, 334 frontend y siete
  del exportador). Cinco pruebas unitarias nuevas cubren datos, referencias, mapeo y combinaciones
  de banderas. Lint, TypeScript strict, build backend, formato y revisión de secretos aprobados.
- **Siete pruebas Oracle aprobadas** en un esquema N2SEC exclusivo: CLI --apply-schema desde vacío,
  32 usuarios con argon2id verificable y cambio obligatorio; CRUD con filtros y simulación de 32
  registros sin pagar; dry-run y doble carga sin cambios de credenciales/contadores; rollback
  deliberado en el segundo empleado; extras repetibles; reset con huellas, referencias ajenas,
  claves compuestas y registros testigo; bloqueo de un expediente editado. El mensaje de fallo
  deliberado de regresión es esperado y se verifica su rollback; no corresponde a la carga local.
- Regresión adicional: aviso externo añadido a una solicitud demo, seguido de --with-extras.
  No se registra como propio y bloquea el reset hasta retirarlo en el esquema de pruebas.
  Los esquemas temporales se eliminan en finally por el runner existente. No se ejecutó el reset
  contra la instalación operativa ni se modificaron las tablas/columnas de NOMINA2.
- Previo a la escritura local se ejecutó --dry-run. Tras la carga, segunda ejecución local con
  **cero nuevas inserciones**: mismos conteos, hash de credenciales/bandera inicial, contadores
  y datos de los tres empleados anteriores. No se hicieron pagos ni se cerró/reabrió un periodo.
- Lectura operativa usando los repositorios de la aplicación: listado total 35, 32 demo con
  perfil completo, vacaciones calculables para los 32 y cuentas RH ana.hernandez/patricia.ramirez.
  La simulación de PAGO de octubre devuelve 35 registros sin pagar. El ANTICIPO de ese mes conserva
  un cálculo v0 previo que la regla actual impide simular: se preservó y se verificó el pago del
  mes disponible, sin cambiar ese estado. No es un error causado por los datos demo.
- Informes ignorados por Git en tmp: seed-demo-carga-local.json, seed-demo-segunda-carga.json,
  seed-demo-comprobacion-app.json y registros de lint/tipos/pruebas. Sin credenciales en consola.
  La validación no inicia sesión de los usuarios operativos demo ni les quita el cambio obligatorio.

### Cómo usar y pendientes

1. Recargar Personal → Empleados en la aplicación: hay 35 registros, incluidos los 32 nuevos.
   Probar los filtros por departamento/puesto y abrir una ficha con salario, banco y horario.
2. Node 20 y entorno configurado: npm run seed:demo -- --dry-run; npm run seed:demo. La clave
   temporal está en SEED_DEFAULT_PASSWORD del `.env` privado; cada nuevo usuario la cambia al entrar.
3. Extras opcionales: npm run seed:demo -- --with-extras --dry-run; luego --with-extras si se desea.
   Reset solo con --reset-demo; inspeccionarlo primero con --reset-demo --dry-run. No usarlo sobre
   registros que ya tienen historia operativa que se deba conservar.
4. npm run test:seed-demo prueba en un esquema aleatorio y lo elimina. npm run lint, npm run
   typecheck, npm test y npm run build -w backend validan código. Nunca usar el esquema operativo
   para provocar el fallo deliberado ni probar el reset.
5. Esperar confirmación antes de fase 4: exportador SQL y seed-remote.js. Fase 5: verificador
   independiente de aceptación. Sigue pendiente la ERS original para certificar la numeración
   RF; no bloquea la carga del conjunto aprobado. Sin pendientes de implementación de fase 3.

## Datos demo — FASE 4: SQL autónomo y carga remota

Estado: completada el 20/10/2026 en `v1.1`, tras la confirmación «continua». La fase 5 permanece
pendiente de confirmación. No se cambió el esquema, la lógica de negocio, la interfaz ni la carga
operativa de 35 empleados que quedó en la fase 3.

### Hecho y decisiones

- `npm run seed:remote` mediante scripts/seed-remote.js. Reutiliza ejecutarCli y el mismo servicio
  transaccional thin del cargador local, con las cuatro banderas existentes. DEST_DB_USER,
  DEST_DB_PASSWORD y DEST_DB_CONNECT_STRING son obligatorias antes de conectar; nunca recurre
  a DB_* ni al host local cuando falta una variable remota. `.env.example` incluye las tres vacías.
- `npm run seed:export-sql` genera database/seed/seed_demo.sql sin conexión Oracle. Acepta
  --with-extras; utiliza exclusivamente los JSON aprobados, los validadores, baseNombreUsuario,
  hashearContrasena y amortizar existentes. Las edades y límites de jornada se consultan en la
  base destino al ejecutar el SQL; no se duplican parámetros legales en el exportador sin conexión.
- El SQL contiene un único bloque PL/SQL, sin objetos permanentes auxiliares ni cambios al esquema.
  INSERT dinámico con lista de tablas/PK permitidas, columnas contrastadas con el diccionario y
  valores enlazados por DBMS_SQL. Resuelve nombres normalizados, ubicaciones INE, tipos y roles
  en el destino; los triggers existentes asignan códigos y contadores. No copia identidades.
- Preflight de migraciones/checksums, objetos válidos, constraints habilitadas/validadas, INE 22/340
  y ADMIN activo. Conserva catálogos compatibles y configuración real; rechaza empleados ajenos,
  referencias incompatibles, mínimo insuficiente, periodos cerrados y ausencias solapadas.
  Una transacción DML y un commit final; el manejador revierte completo ante un fallo.
- Idempotencia y propiedad interoperables entre SQL y Node: reconstruye eventos de bitácora y
  registra huellas SHA-256 del JSON de cada fila. Se comprobaron contra huella() de Node; el reset
  existente reconoce las filas SQL sin cambiar su algoritmo ni modificar la bitácora inmutable.
  No se reescriben credenciales, banderas, datos editados ni códigos al repetir la carga.
- Supuesto aplicado: exportación privada con hashes Argon2id individuales generados desde
  SEED_DEFAULT_PASSWORD. Oracle no incorpora el hasher de la app; el archivo autónomo lleva esos
  hashes y ninguna contraseña en texto plano ni credencial de conexión. Se excluye de Git,
  se escribe con permisos 0600 y reemplazo mediante archivo temporal. Su fuente versionada
  es exportar.ts + exportar.runtime.sql y los JSON. No forzar la incorporación del SQL privado.
- El archivo no incluye comandos exclusivos de SQLPlus. Se codifican ampersands con CHR(38),
  se evitan líneas vacías internas y se limitan literales/líneas para SQLPlus. README documenta
  DBMS Output, manejo de errores en el cliente y ejecución del bloque completo en DBeaver.
- Extras SQL: historial salarial, parqueo por solicitud aprobada/suscripción, préstamos/cuotas,
  ausencias y novedades mensuales. No se crean descuentos manuales de parqueo. Se conserva
  el comienzo en el mes real de aprobación, como en Node. Las ausencias del JSON aprobado están
  dentro de un mes; el exportador rechaza otro rango hasta desglosarlo explícitamente.
- database/seed/README.md explica entorno, base local, otra instancia, otro esquema, instalación
  vacía, SQL autónomo, privacidad, extras y reset. README raíz enlaza la guía. La exportación básica
  privada quedó generada en la ruta solicitada; no se ejecutó contra la base operativa.

### Pruebas y comprobaciones

- Node 20.20.2: **768 pruebas del monorepo aprobadas** (427 backend, 334 frontend y siete del
  exportador anterior). Tres pruebas nuevas: escape compatible con SQLPlus, generación privada
  sin DDL/contraseña y con 32 hashes distintos verificables, y rechazo de contraseña inválida.
- **Seis pruebas Oracle nuevas aprobadas** con SQLPlus real: destino incompleto sin fallback;
  instalación y carga en otro esquema con IDs/códigos ya desplazados; 32 cuentas autenticables;
  igualdad de valores de empleados, ubicación, puesto, banco, contacto y horario frente a Node;
  doble carga SQL/Node sin cambiar conteos, credenciales o contadores; ampliación de extras;
  reset remoto de filas SQL y rollback ante fallo deliberado; carga SQL sobre datos Node y
  comparación de salarios, cuotas, comisiones, ausencias y suscripciones tras recargar desde cero.
- La suite final se ejecutó también con NLS_NUMERIC_CHARACTERS=',.' y pasó. Compara huellas de
  dominio sin imprimir DPI, cuentas ni hashes de contraseña. Prueba la instalación --apply-schema
  usando DEST_DB_* con DB_* deliberadamente apuntando a un destino inválido.
- **Siete regresiones Oracle del cargador local aprobadas** tras refactorizar su entrada: todas
  las banderas, transacción, idempotencia, referencias ajenas y huellas. El mensaje de fallo
  deliberado es esperado; se comprueba que no queden filas ni reservas de esa transacción.
- Ambos runners crearon esquemas aleatorios N2SEC_* y los eliminaron en finally. No se probaron
  borrados ni fallos sobre NOMINA2. No hay cambios en migraciones ni JSON del conjunto aprobado.
- Lint, TypeScript strict, build backend, formato de archivos editados y diff --check aprobados.
  SQL privado ignorado por Git, modo 0600 y sin valores de SEED_DEFAULT_PASSWORD, DB_PASSWORD,
  ADMIN_PASSWORD o DEST_DB_PASSWORD en texto plano. Registros de comprobación ignorados en tmp.
- La ejecución del SQL desde la interfaz de DBeaver no fue automatizada; se validó el bloque
  con Oracle 21c XE y SQLPlus. No se recibió una conexión a otra instancia externa y no se escribió
  en ninguna. La carga remota se probó en otro esquema de la instancia Docker local.

### Cómo usar y pendientes

1. Node 20 y .env privado configurado: npm run seed:export-sql. Trasladar el SQL privado y ejecutar
   como bloque completo en una conexión al esquema de aplicación instalado; ver la guía.
2. Configurar las tres DEST_DB_*: npm run seed:remote -- --dry-run; npm run seed:remote.
   Las banderas --with-extras, --reset-demo y --apply-schema conservan sus reglas de fase 3.
3. Reproducir con npm run test:seed-export y npm run test:seed-demo; ambos usan esquemas desechables.
4. Esperar confirmación antes de fase 5: scripts/verify-seed.js y verificación independiente de
   aceptación. No se implementó ese script en esta fase. La ERS original sigue pendiente para
   certificar la correspondencia exacta de los RF; no bloquea los datos y cargadores aprobados.

## Datos demo — FASE 5: verificación y aceptación por API

Estado: completada el 20/10/2026 en `v1.1`, tras la confirmación «continua». Cierra las cinco
fases solicitadas. No hay cambios de esquema, migraciones, lógica de negocio ni pantallas.

### Hecho y decisiones

- scripts/verify-seed.js y `npm run verify:seed`, con módulos TypeScript strict independientes
  para consultas, reporte y CLI. Conexión thin con DB__; --remote exige las tres DEST_DB__
  y nunca recurre a la conexión local. Reporte JSON en español y salida 1 ante errores.
- Revisión normal en una transacción de solo lectura: cobertura por claves naturales, catálogos
  activos, 30 puestos cubiertos, expedientes completos, perfiles/usuarios vinculados, unicidad
  global de DPI/NIT/IGSS/usuario/correo, DPI de 13 dígitos, ubicaciones y zonas oficiales,
  referencias coherentes, vigencia única de salario/horario, contratos y fechas válidos, mínimo
  configurado, límites de jornada, códigos reservados y contadores suficientes por departamento.
  Reutiliza esquemas, validadores y cálculos de vacaciones existentes, sin escribir desde ellos.
- Distingue encontrados del conjunto y total de instalación: los datos anteriores no provocan
  falsos errores de conteo. Comprueba los hashes Argon2id contra SEED_DEFAULT_PASSWORD cuando
  la cuenta conserva cambio obligatorio; admite cuentas que ya cambiaron su contraseña sin
  restablecerlas. Los errores solo muestran categorías y claves persona-xxx, nunca identificadores
  fiscales, cuentas, correos, contraseñas, hashes ni cuerpos de respuestas de autenticación.
- Se respeta la corrección del usuario: **sin jefaturas**. Se comprueba ID_JEFATURA vacío y los
  ciclos de jefe inmediato se marcan NO_APLICA. No se inventó una columna de jefe inmediato ni
  se reintrodujo la jerarquía de la petición inicial.
- --check-idempotency invoca dos veces cargarDemo con la conexión real y una barrera que permite
  SELECT/bloqueos y rechaza DML, DDL, PL/SQL y confirmaciones antes de llegar a Oracle. Compara
  conteos, filas, credenciales, reservas y contadores en cada pasada; termina con rollback.
  Si la integridad falla, no invoca el cargador ni repara registros. Sin bandera, la prueba queda
  explícitamente NO_EJECUTADA; sin clave de entorno también se informa el cotejo temporal omitido.
- --with-extras exige también los extras por empleado, incluidas aperturas fiscales con año,
  fecha de corte y propiedad del seed correctos. README raíz, CARGA.md, DATASET.md y la guía
  principal explican los comandos, estados, alcance y escenarios de nómina.

### Hallazgo y corrección de datos fiscales

- La prueba nueva exigió resultados calculados para los 32, además de recibir sus filas. Detectó
  la dependencia existente de continuidad fiscal del Pago mensual. Precisión sobre fase 3:
  «PAGO devuelve 35 registros» acreditaba el listado; no aseguraba un resultado calculado para
  todos. El Anticipo básico sí calcula los 32. No se relajó la validación del motor.
- Para completar el escenario opcional se añadieron **31 aperturas fiscales FICTICIAS**, con
  corte 30/09/2026, a extras.aperturaFiscal de los JSON existentes. El alta de octubre no requiere
  apertura anterior. Renta/IGSS/ISR se derivaron mediante calcularPago, las vigencias salariales
  del JSON y parámetros/conceptos/tramos locales en una transacción de solo lectura; se excluyeron
  novedades pendientes. No se hardcodearon tasas en el cargador ni se certificaron importes reales.
- Carga únicamente con --with-extras: tabla ISR_APERTURAS ya existente, fiscalSchema y repositorio
  guardarFiscal actuales; propiedad auditada y misma transacción/reset/idempotencia que los demás
  demo. Toda apertura lleva motivo «APERTURA FISCAL FICTICIA» y fecha/base de estimación. Rechaza
  aperturas ajenas, registros posteriores a aprobación/cierre y fechas incoherentes, sin reemplazos.
  SQL autónomo y cargador remoto leen exactamente los mismos importes JSON y preservan esa política.
- Se comprobó por comparación estructural que los 32 expedientes originales no cambiaron al
  excluir únicamente el nuevo campo opcional. No se añadieron empleados/roles ni se modificaron
  salarios, bancos, ubicaciones, contratos o el resto de los datos aprobados.
- La instalación operativa conserva la carga básica: **35 empleados (32 demo y 3 anteriores)**.
  No se cargaron allí aperturas ficticias, extras, sesiones de prueba ni cambios de contraseña.
  Para el Pago mensual completo de los demo se puede elegir conscientemente --with-extras;
  el Anticipo de octubre operativo conserva un periodo v0 previo que el sistema bloquea, tal como
  se documentó en fase 3. No se cambió ese periodo ni se confirmaron/revirtieron pagos.

### Validación

- **772 pruebas de monorepo aprobadas**: 431 backend, 334 frontend y siete del exportador anterior.
  Cuatro pruebas nuevas cubren banderas, delegación de lecturas a la conexión real, rechazo de
  escrituras/transacciones y acumulación de errores del reporte con claves lógicas.
- **Seis pruebas Oracle/API nuevas aprobadas**: diagnóstico de solo lectura sin secretos;
  conteos con datos ajenos; doble invocación protegida y destino remoto sin fallback; detección
  de edad, salario y horario incorrectos sin repararlos; extras incompletos y apertura ajena
  rechazada con rollback completo; Anticipo básico de 32; RH/empleado con login CSRF real,
  cambio obligatorio y permisos; listado/filtros, dashboard y cumpleaños/aniversarios, vacaciones
  y Pago mensual con 32 resultados no negativos. No se efectuó ningún pago. Tras cambiar dos
  claves de prueba, el verificador conserva ambas y su idempotencia sigue pasando.
- Reejecutadas **siete regresiones Oracle del seed** y **seis del exportador SQLPlus/remoto** con
  las aperturas nuevas: en total, **19 pruebas Oracle aprobadas**. El exportador compara también
  renta/IGSS/ISR/corte entre SQL y Node, sobre identidades desplazadas y con separador decimal NLS
  distinto. Se mantienen reset protegido, rollback deliberado y cuentas autenticables.
- Todos los esquemas N2SEC_* se eliminaron en finally. Los errores deliberados de pruebas son
  esperados y no corresponden a la instalación operativa. Solo hubo lecturas sobre NOMINA2.
- Verificación local final con --check-idempotency: integridad OK, cero DML en dos invocaciones,
  mismos datos/credenciales/contadores y 32 cuentas aún temporales. Totales locales conservados:
  ocho departamentos, 34 puestos, 13 centros, ocho horarios, cinco bancos, 35 empleados y 37 usuarios.
  El conjunto encontrado es 5/30/10/7/5/32, respectivamente; no se confunde con los totales.
- Lint, TypeScript strict, build backend, formato, revisión de secretos y diff --check aprobados.
  Informes y generador ad hoc de acumulados quedan en tmp, ignorados por Git. El SQL privado se
  regeneró desde la fuente actual; mantiene permisos 0600, exclusión de Git y ausencia de claves
  de entorno en texto plano. No se imprimieron credenciales.

### Cómo usar y límites de la comprobación

1. npm run verify:seed -- --check-idempotency. Para JSON sin cabeceras npm: npm run --silent
   verify:seed -- --check-idempotency > tmp/verificacion-demo.json.
2. Para otra conexión: npm run verify:seed -- --remote --check-idempotency, con DEST_DB_*.
3. En un entorno de demostración donde se deseen también aperturas ficticias y novedades:
   npm run seed:demo -- --with-extras --dry-run; npm run seed:demo -- --with-extras;
   npm run verify:seed -- --with-extras --check-idempotency. Remoto usa seed:remote.
4. npm run test:seed-verify, test:seed-demo y test:seed-export reproducen las suites en esquemas
   desechables. La aceptación nueva ejercita API y Oracle reales; no automatizó el navegador ni
   DBeaver, ni confirmó boletas/pagos en producción. Frontend conserva sus pruebas existentes.
5. La ERS original sigue sin estar disponible para certificar la numeración RF; se documenta
   ese límite sin inventar correspondencias. No quedan fases de implementación solicitadas.
