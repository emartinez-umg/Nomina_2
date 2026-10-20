# AGENTS.md — Sistema de Nómina "nomina2"

> Este archivo es el contexto permanente del proyecto. Léelo completo al iniciar cada sesión, junto con `docs/PROGRESO.md`.

## 1. Rol y objetivo

Eres un ingeniero de software senior (full-stack Node.js/React, Oracle). Construyes **nomina2**: el módulo de Nómina de un ERP para una empresa guatemalteca. Es un proyecto universitario (Análisis de Sistemas, UMG) pero se construye con calidad de producción.

El sistema tiene tres roles (admin, rh, empleado), cálculo de nómina quincenal conforme a la legislación guatemalteca, portal de autogestión para el empleado y una interfaz guiada que evita que el usuario cometa errores.

El diseño visual está en `docs/MOCKUP/` (PDF y/o PNG). **Es la fuente de verdad visual.**

## 2. Reglas de trabajo (importante: ahorro de tokens)

- Se trabaja **por fases**. Implementa únicamente la fase que se te pida. No adelantes trabajo de fases futuras.
- Al iniciar: lee este archivo y `docs/PROGRESO.md`. No releas todo el repositorio; abre solo los archivos que necesites.
- Si falta información, decide con criterio razonable, regístralo en `docs/PROGRESO.md` bajo "Supuestos" y continúa. Solo detente ante un bloqueo real.
- Al terminar cada fase: ejecuta lint y pruebas, actualiza `docs/PROGRESO.md` (hecho, decisiones, supuestos, pendientes, cómo probar) y haz commit (`feat: ...`, `fix: ...`, descripción en español).
- Tu respuesta final es **corta** (máximo 15 líneas): resumen, cómo ejecutar/probar, pendientes. No pegues código en el chat.
- No dejes `TODO` sin registrarlo en `docs/PROGRESO.md`. No uses datos falsos (mock) en pantallas: todo consume la API real.
- Si una fase queda interrumpida, la siguiente sesión continúa desde lo que indique `docs/PROGRESO.md`.

## 3. Stack (obligatorio)

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 LTS + **TypeScript (strict)** + Express |
| Acceso a BD | `node-oracledb` (modo thin, sin Instant Client), SQL con binds (nunca concatenar) |
| Validación | Zod (esquemas compartidos cuando sea posible) |
| Frontend | React 18 + Vite + TypeScript, React Router, TanStack Query, React Hook Form + Zod |
| Estilos | Tailwind CSS con tokens extraídos del mockup |
| Íconos | `lucide-react` |
| Tour de ayuda | `driver.js` |
| Calendarios | `react-day-picker` (selección de rangos) |
| Gráficas | `recharts` |
| PDF | `pdfmake` o `pdfkit` (en el backend) |
| Dinero | `decimal.js` (nunca `float`) |
| Seguridad | `helmet`, `express-rate-limit`, `argon2`, `cookie-parser`, protección CSRF |
| Logs | `pino` |
| Pruebas | Vitest (back y front), Supertest, Playwright (e2e mínimos al final) |
| Calidad | ESLint + Prettier, TypeScript strict |
| BD | **Oracle 21c XE** en Docker (`gvenzl/oracle-xe:21-slim` o equivalente) |
| Infra | Docker Compose |

## 4. Estructura del monorepo

```
nomina2/
├─ docker-compose.yml        # name: nomina2
├─ .env.example
├─ AGENTS.md
├─ README.md
├─ docs/                     # PROGRESO.md, ERD.md, DECISIONES.md, MOCKUP/
├─ db/                       # migrations/ (V001__*.sql), seeds/, init/
├─ backend/
│  └─ src/
│     ├─ config/
│     ├─ modules/<modulo>/   # routes, controller, service, repository, schemas, types
│     ├─ shared/             # middleware, errors, utils, db, pdf
│     ├─ app.ts
│     └─ server.ts
└─ frontend/
   └─ src/
      ├─ app/                # providers, router, guards
      ├─ components/         # ui/, forms/, layout/, help/
      ├─ features/<modulo>/  # pages, api, hooks, help/ (pasos del tour)
      ├─ lib/  hooks/  styles/
```

## 5. Arquitectura del backend

- Capas estrictas: **routes → controller → service → repository**. Controllers delgados; la lógica de negocio vive en services; solo los repositories tocan SQL.
- Transacciones en los services que modifican varias tablas (commit/rollback explícito).
- Validación de entrada con Zod en cada endpoint. **El servidor nunca confía en el cliente.**
- Respuesta uniforme: `{ ok, data, meta? , error?: { codigo, mensaje, campos? } }`. Los mensajes de error son claros y en español. Nunca se exponen stack traces.
- Errores tipados (`ErrorNegocio`, `ErrorValidacion`, `ErrorNoAutorizado`, `ErrorNoEncontrado`, `ErrorConflicto`) y un único middleware de manejo de errores.
- Listados: paginación en servidor, ordenamiento y **filtros por query params con lista blanca de campos**. Cada CRUD permite filtrar por todos los campos relevantes.
- Dinero: `NUMBER(12,2)` en BD, `decimal.js` en código, redondeo half-up a 2 decimales (regla única en `shared/utils/dinero.ts`).
- Fechas: tipo `DATE` en BD, zona horaria `America/Guatemala`, formato visible `dd/mm/aaaa`.
- Configuración por variables de entorno (`.env`), validadas al arrancar.

## 6. Seguridad

- **Sesión**: cookie `httpOnly`, `Secure` en producción, `SameSite=Strict`; la sesión vive en el servidor (tabla `SESIONES`); expira por inactividad (30 min, parametrizable). Protección CSRF con token en header.
- Contraseñas con `argon2id`. Política: mínimo 10 caracteres, mayúscula, minúscula, número y símbolo. Bloqueo de 15 min tras 5 intentos fallidos. Rate limit en login.
- Contraseña temporal aleatoria al crear usuario; **cambio obligatorio en el primer inicio de sesión** (el resto del sistema queda inaccesible hasta cambiarla).
- Usuario generado como `nombre.apellido` (minúsculas, sin acentos ni espacios); si ya existe, agrega sufijo numérico (`nombre.apellido2`).
- RBAC en middleware por rol **y** por recurso: el empleado solo accede a datos propios (validar propiedad en backend; jamás confiar en un id enviado por el cliente).
- Datos sensibles (DPI, NIT, cuenta bancaria) enmascarados en listados y fuera de los logs. Nunca registrar contraseñas ni tokens.
- Validaciones duplicadas: frontend (para guiar) **y** backend (para proteger).

## 7. Roles y permisos

| Rol | Alcance |
|---|---|
| **ADMIN** (sistemas) | Acceso total. Corrige o elimina datos (eliminación lógica por defecto; física solo con confirmación y motivo). Gestiona usuarios y roles, restablece contraseñas, edita parámetros del sistema, consulta la bitácora, puede reabrir un periodo cerrado (con motivo). Toda acción queda auditada. |
| **RH** | Gestiona todo lo relativo a nómina y personal: empleados, puestos, jefaturas, horarios, salarios, descuentos, préstamos, comisiones, ausencias, vacaciones, solicitudes, anuncios, eventos, planilla y reportes. No gestiona roles, no elimina físicamente y no accede a la bitácora global. No puede crear usuarios ADMIN. |
| **EMPLEADO** | Solo el portal "Mis gestiones" con sus propios datos. |

## 8. Reglas de UI/UX (obligatorias)

**Fidelidad al mockup.** Antes de construir pantallas, extrae del mockup los tokens (colores, tipografías, radios, sombras, espaciados) a `frontend/src/styles/tokens` y a la configuración de Tailwind. Si una pantalla no aparece en el mockup, derívala con el mismo lenguaje visual.

**Íconos.** *Todos* los botones llevan ícono (`lucide-react`) junto al texto. Los botones solo-ícono llevan tooltip y `aria-label`. Mantén un único mapa de íconos (`components/ui/icons.ts`): crear=`Plus`, editar=`Pencil`, eliminar=`Trash2`, guardar=`Save`, cancelar=`X`, buscar=`Search`, filtrar=`Filter`, exportar=`Download`, ver=`Eye`, aprobar=`CheckCircle2`, rechazar=`XCircle`, imprimir=`Printer`, ayuda=`HelpCircle`, etc.

**Formularios guiados.**
- El ancho de cada campo es proporcional al dato (DPI, teléfono y fechas: cortos; nombres: medianos; dirección y observaciones: anchos). Prohibido que todos los campos tengan el mismo tamaño. Usa una grilla de 12 columnas.
- Cada campo tiene: etiqueta, marca de obligatorio, **hint** (placeholder con el formato esperado + ícono ⓘ con tooltip que explica qué es el dato y cómo ingresarlo), máscara, `maxLength`, `inputMode` y `pattern`.
- Crea componentes reutilizables: `TextField`, `NumberField`, `MoneyField` (Q, 2 decimales), `DateField`, `DpiField`, `NitField`, `PhoneField`, `EmailField`, `SelectField` (con búsqueda), `TextAreaField`, `CurrencyField`, `FileField`.
- **Cada campo solo acepta el tipo de dato que pide**: bloquea caracteres inválidos mientras se escribe y sanea lo que se pega. No basta con validar al enviar.
- Formatos: DPI de 13 dígitos (`#### ##### ####`), NIT con dígito verificador, teléfono de 8 dígitos, correo válido, moneda `Q 1,234.56`, fecha `dd/mm/aaaa`.

**Errores claros.** Validación en vivo (al salir del campo) y resumen al enviar. Mensaje junto al campo que explique qué pasó y cómo corregirlo, por ejemplo: *"La fecha de nacimiento no puede ser futura. Ingresa una fecha anterior a hoy."* Los errores del backend (400/409/422) se mapean al campo correspondiente.

**Fechas coherentes** (el selector deshabilita las fechas inválidas y además se valida):
- Nacimiento: no futura; edad entre 18 y 75 años (parametrizable).
- Ingreso: no anterior a los 18 años del empleado; no más de 30 días en el futuro.
- Egreso: no anterior a la fecha de ingreso.
- Rangos (vacaciones, ausencias, incapacidades): fin ≥ inicio; sin traslape con otros registros del mismo empleado.
- Vacaciones: inicio no pasado; solo días laborales del empleado.
- Cambios de salario y parámetros: fecha efectiva no dentro de un periodo cerrado.
- Eventos: fecha y hora futuras al crearlos; fin ≥ inicio.
- Periodos de nómina: no se pueden solapar.

**Prevención de errores.** Deshabilita acciones inválidas con un tooltip que explique el motivo. Confirma acciones destructivas o críticas. Evita envíos dobles. Muestra estados de carga (skeletons), vacíos (ícono + acción sugerida) y de error.

**Listados.** Paginación en servidor, búsqueda, filtros múltiples (colapsables) con chips de filtros activos, orden por columna, botón "limpiar filtros" y exportación a CSV/Excel.

**Otros.** Accesibilidad (contraste AA, foco visible, teclado, `aria-*`). Desktop-first pero usable en tablet y móvil (el portal del empleado debe ser muy cómodo en móvil). Campana de notificaciones con contador y toasts de retroalimentación. Interfaz y comentarios del código **en español**.

## 9. Ayuda: hints y recorrido guiado

- **Hints**: cortos y contextuales en cada campo (qué es, formato esperado, ejemplo).
- **Botón de ayuda** (`HelpCircle`) fijo en la barra superior de **todas** las páginas. Al presionarlo inicia un recorrido guiado (`driver.js`) de esa página: explica cada sección, filtro, botón y campo importante, qué ocurre al usarlo y errores comunes. Debe ser **mucho más detallado que los hints**.
- Los pasos se definen de forma declarativa por página en `features/<modulo>/help/` (marcados con atributos `data-tour`), con contenido distinto según el rol.
- Disponible siempre y reiniciable; se ofrece automáticamente la primera vez que el usuario entra a cada página.

## 10. Reglas de negocio (Guatemala)

> Todos los porcentajes y montos viven en BD con vigencia (`VIGENTE_DESDE`), **nunca hardcodeados**. Los valores iniciales son de referencia y el equipo debe validarlos con la legislación vigente. Cambiar un parámetro exige confirmación con advertencia (valor anterior vs nuevo), motivo obligatorio y registro en bitácora. Un cambio no afecta periodos ya cerrados.

**Periodicidad.** Quincenal: del 1 al 15 y del 16 al fin de mes. El salario base es mensual; quincena = base / 2. Prorrateo por ingreso/egreso y ausencias sin goce: valor día = base / 30.

**Conceptos y sus banderas.** Cada concepto de ingreso/descuento tiene banderas parametrizables: `afecta_igss`, `afecta_isr`, `afecta_prestaciones`.

**Ingresos.**
- Salario base, comisiones (carga manual por RRHH por quincena), horas extra y bonificación incentivo.
- Horas extra: recargo del 50 % (se pagan al 150 % del valor hora). Valor hora = salario mensual / 30 / horas de la jornada diaria (diurna 8, mixta 7, nocturna 6; parametrizable).
- Bonificación incentivo (Decreto 37-2001): Q250 mensuales (Q125 por quincena), proporcional a lo laborado; no forma parte del salario para IGSS ni indemnización.

**Deducciones de ley.**
- IGSS laboral: 4.83 % sobre lo afecto. Patronal (informativo, para reporte): IGSS 10.67 %, IRTRA 1 %, INTECAP 1 %.
- ISR en relación de dependencia (cálculo completo, tablas parametrizables):
  - Renta anual proyectada − deducción personal (Q48,000) − deducciones acreditadas (donaciones, seguros, IGSS, con tope parametrizable; RRHH puede registrarlas por empleado/año) = renta imponible.
  - Tramos: 5 % hasta Q300,000; 7 % sobre el excedente más Q15,000 (tabla `TRAMOS_ISR`).
  - Retención por periodo = (ISR anual − retenido acumulado) / periodos restantes; recálculo en el último periodo del año.
  - Aguinaldo y Bono 14 se tratan como exentos dentro del límite legal.

**Otros descuentos** (catálogo `TIPOS_DESCUENTO`): préstamo, anticipo, embargo, **parqueo**, **consumo en tienda**, otros. Modalidades: monto fijo por quincena, cuotas con saldo, o único. Se aplican automáticamente hasta liquidarse. El neto nunca puede ser negativo (bloquear y avisar). Parqueo: se activa al aprobarse la solicitud de parqueo. Consumo en tienda: RRHH registra el cargo y se descuenta en la(s) siguiente(s) quincena(s).

**Prestaciones.**
- Aguinaldo: 100 % del salario promedio de los últimos 12 meses (1 dic – 30 nov), proporcional si hay menos de 12 meses; pago hasta el 15 de diciembre.
- Bono 14: mismo cálculo con el periodo 1 jul – 30 jun; pago en la primera quincena de julio.
- Indemnización (despido injustificado): salario promedio de los últimos 6 meses × tiempo laborado (años y fracción), más vacaciones pendientes y aguinaldo/bono 14 proporcionales (finiquito).

**Vacaciones.**
- Se acumulan **1.25 días por mes** desde la fecha de contratación. Disponible = acumulado − vacaciones previas/tomadas (kardex `VACACIONES_MOVIMIENTOS`).
- Empleado: al entrar a su apartado ve cuántos días tiene disponibles. Selecciona un rango en un calendario que **solo cuenta días laborales según su horario** (no todos trabajan de lunes a viernes) y excluye feriados (`FERIADOS`).
- RRHH: ve días disponibles, cuántos días laborales tiene el rango solicitado y compara. Si disponibles ≥ solicitados se muestra en **verde**; si no, en **rojo** y **no permite autorizar** (validado también en backend). Al aprobar se descuenta del saldo.

**Cierre de periodo.** Flujo: calcular → revisar → aprobar → cerrar. Un periodo cerrado bloquea cualquier modificación. Solo ADMIN puede reabrirlo (con motivo, auditado).

**Ausencias, permisos e incapacidades.** Tipos con efecto configurable (con goce / sin goce / subsidio IGSS) que impactan el cálculo del periodo.

## 11. Solicitudes del empleado

Tipos: boleta de pago (consulta y descarga directa del historial), constancia laboral, certificado de IGSS, constancia de INTECAP, gafete, parqueo, vacaciones y actualización de datos.

- **Estados**: `En proceso` → `Aprobada` / `Rechazada` (con motivo obligatorio) → `Entregada`.
- **RRHH**: recibe notificación y gestiona una **bandeja** con filtros. Al aprobar un documento, el sistema usa una **plantilla** que rellena automáticamente los datos del empleado (variables `{{nombre}}`, `{{dpi}}`, `{{puesto}}`, `{{fecha_ingreso}}`, `{{salario}}`, etc.), genera el **PDF**, muestra vista previa y, al enviar, pasa a `Entregada` y notifica al empleado con enlace de descarga. Las plantillas son editables por RRHH (texto con variables insertables).
- Gafete: mismo flujo de estados y notificaciones, sin PDF.
- Parqueo aprobado: crea el descuento automático que se refleja en las boletas.
- **Actualización de datos del empleado**: datos de contacto (teléfono, dirección, correo, contacto de emergencia) editables directamente (auditado); datos críticos (nombre, DPI, NIT, estado civil) mediante solicitud que RRHH aprueba.

## 12. Notificaciones, anuncios y eventos

- Notificaciones internas (tabla `NOTIFICACIONES`, campana con contador, marcar como leída) para: nuevas solicitudes, cambios de estado, documentos entregados, anuncios y eventos.
- **Anuncios**: publicados por RRHH, con vigencia y destinatarios (todos, o por departamento/puesto/jefatura).
- **Eventos**: RRHH los crea desde una **vista de calendario** indicando fecha, hora y los grupos/puestos destinatarios. El empleado ve los suyos en su portal.

## 13. Dashboards

- **RRHH**: empleados activos, nómina del periodo (bruto/neto), costo patronal, solicitudes pendientes, vacaciones por aprobar, cumpleaños y aniversarios próximos, altas/bajas del mes, empleados por departamento, evolución de la nómina (últimos 6 periodos) y alertas (periodo sin cerrar, contratos por vencer).
- **Empleado** ("Mis gestiones"): tarjetas de acceso (boletas de pago, constancia laboral, certificado IGSS, constancia INTECAP, gafete, parqueo, vacaciones, actualizar mis datos), saldo de vacaciones, última boleta, **Anuncios** y **Eventos**.
- **Admin**: usuarios, sesiones recientes, bitácora reciente y estado del sistema.

## 14. Base de datos (Oracle 21c XE)

- Contenedor `nomina2-db` con volumen persistente y healthcheck. Usuario de aplicación dedicado (no usar SYS/SYSTEM desde la API). Migraciones numeradas `V001__descripcion.sql` con un runner propio (`npm run db:migrate`) y tabla `VERSION_ESQUEMA`. Seeds para catálogos y para el usuario ADMIN inicial (credenciales por variables de entorno, con cambio obligatorio).
- Convenciones: tablas y columnas en español, `MAYUSCULAS_CON_GUION_BAJO`; PK `ID_<ENTIDAD>` con `GENERATED ALWAYS AS IDENTITY`; FKs indexadas; columnas de auditoría (`CREADO_POR`, `FECHA_CREACION`, `MODIFICADO_POR`, `FECHA_MODIFICACION`); eliminación lógica (`ACTIVO`); `CHECK` y `UNIQUE` (DPI, NIT, afiliación IGSS, usuario, correo); índices en toda columna usada como filtro.
- Tablas sugeridas (ajústalas si hace falta y documenta el resultado en `docs/ERD.md` con Mermaid): `ROLES`, `USUARIOS`, `SESIONES`, `DEPARTAMENTOS`, `PUESTOS`, `JEFATURAS`, `TIPOS_CONTRATO`, `EMPLEADOS`, `EMPLEADO_CONTACTOS_EMERGENCIA`, `HORARIOS`, `HORARIO_DIAS`, `EMPLEADO_HORARIO`, `HISTORIAL_SALARIAL`, `FERIADOS`, `PARAMETROS_LEGALES`, `TRAMOS_ISR`, `ISR_DEDUCCIONES_EMPLEADO`, `CONCEPTOS_NOMINA`, `TIPOS_DESCUENTO`, `DESCUENTOS_EMPLEADO`, `DESCUENTOS_CUOTAS`, `PRESTAMOS`, `COMISIONES`, `HORAS_EXTRA`, `TIPOS_AUSENCIA`, `AUSENCIAS`, `VACACIONES_SOLICITUDES`, `VACACIONES_MOVIMIENTOS`, `PERIODOS_NOMINA`, `NOMINA_EMPLEADO`, `NOMINA_DETALLE`, `PRESTACIONES` (aguinaldo, bono 14, indemnización), `TIPOS_SOLICITUD`, `SOLICITUDES`, `SOLICITUD_HISTORIAL`, `PLANTILLAS_DOCUMENTO`, `DOCUMENTOS_GENERADOS`, `NOTIFICACIONES`, `ANUNCIOS`, `ANUNCIO_DESTINATARIOS`, `EVENTOS`, `EVENTO_DESTINATARIOS`, `CARGAS_MASIVAS`, `BITACORA_AUDITORIA`.
- **Bitácora de auditoría**: registra usuario, rol, acción, entidad, id, valores anteriores y nuevos (JSON), IP y fecha. Se escribe desde la capa de servicio dentro de la misma transacción. Nunca guarda contraseñas.
- Datos del empleado a cubrir: nombres y apellidos, DPI, NIT, afiliación IGSS, fecha de nacimiento, sexo, estado civil, dirección, teléfono, correo, contacto de emergencia, banco y cuenta, puesto, departamento, jefatura, tipo de contrato, fecha de ingreso/egreso, salario base, horario, estado.

## 15. Carga masiva de empleados

Opción "Carga masiva" en Empleados: descarga de **plantilla CSV de ejemplo**, subida del archivo, validación fila por fila con las mismas reglas que el formulario, **vista previa con errores por fila** antes de confirmar, importación transaccional (todo o nada, o solo las filas válidas a elección) y reporte descargable de resultados. Genera usuario y contraseña temporal por cada empleado importado.

## 16. Docker

`docker-compose.yml` con `name: nomina2` y los servicios `nomina2-db` (Oracle XE), `nomina2-api` (espera a que la BD esté saludable, aplica migraciones) y `nomina2-web` (nginx sirviendo el build de React). Un solo `.env`. Todo levanta con `docker compose up --build`. El README explica instalación, variables, migraciones, seeds y credenciales iniciales.

## 17. Calidad

- TypeScript strict, ESLint y Prettier sin errores.
- Pruebas unitarias obligatorias para: ISR, IGSS, horas extra, bonificación incentivo, vacaciones (acumulación y días laborales), aguinaldo, bono 14, indemnización, validadores (DPI, NIT, fechas) y RBAC. Pruebas de integración (Supertest) para endpoints críticos.
- Nombres de dominio en español (`empleado`, `planilla`, `calcularIsr`), términos técnicos genéricos en inglés (`controller`, `service`, `repository`). Comentarios en español, útiles y breves.
- Sin secretos en el repositorio. `.env.example` completo.

---

# ADENDO v1 — Cambios y mejoras sobre la versión 0

> Agrega este bloque **al final de `AGENTS.md`**. Donde contradiga a la versión 0, **este adendo manda**. Todo lo no mencionado aquí sigue igual.

## A1. Alcance y reglas de la v1

- La v0 está completa (fases 0 a 12). La v1 corrige y automatiza. El objetivo transversal: **automatizar al máximo y evitar que el usuario cometa errores**.
- Trabaja en la rama `v1` (la v0 queda etiquetada como `v0.0`).
- **No edites migraciones anteriores.** Todo cambio de esquema va en migraciones nuevas, con migración de los datos existentes (sin perder información).
- No rompas pruebas existentes. Si una regla cambia a propósito, actualiza la prueba y anótalo en `docs/PROGRESO_V1.md`.
- Cada pantalla que cambie debe actualizar su recorrido de ayuda (`driver.js`) y sus hints.
- Usa `docs/PROGRESO_V1.md` (no `PROGRESO.md`) como bitácora de la v1.

## A2. Navegación horizontal con búsqueda (Ctrl/⌘ + K)

- Reemplaza el menú lateral por una **barra superior horizontal** con **grupos por categoría que se despliegan hacia abajo** (panel con ícono, nombre y una línea de descripción por opción). Se abre con clic o con teclado (Enter/Espacio, flechas, Esc) y se cierra al hacer clic fuera.
- Lado derecho de la barra: botón de búsqueda (muestra el atajo), notificaciones, ayuda y menú de usuario.
- **Buscador tipo command palette** (`cmdk`): se abre con `Ctrl+K` / `⌘+K` y también con clic. Busca en todas las opciones del menú **permitidas al rol**, con tolerancia a errores de escritura, palabras clave y sinónimos (ej. "boleta" → Planilla/Boletas), muestra el grupo de cada resultado, recuerda las últimas 5 opciones usadas (por usuario) y ofrece **acciones rápidas** ("Nuevo empleado", "Simular pago", "Cargar comisión"…).
- Define el menú en un único archivo de configuración por rol (`navigation.config.ts`: grupos, ítems, ícono, ruta, palabras clave). El menú y el buscador leen de ahí.
- Grupos sugeridos para RH (ajusta a las rutas reales): **Inicio**, **Personal** (empleados, carga masiva), **Organización** (departamentos, puestos, jefaturas, horarios, centros de trabajo, feriados), **Novedades** (descuentos, préstamos, comisiones, horas extra, ausencias, parqueo, consumo en tienda), **Nómina** (simular pago, planilla, boletas, reporte IGSS, historial), **Prestaciones** (aguinaldo, bono 14, indemnización, constancias de salario), **Vacaciones**, **Solicitudes** (bandeja, plantillas), **Comunicación** (anuncios, eventos) y **Configuración** (parámetros legales, empresa). ADMIN añade Usuarios, Bitácora y Sistema. EMPLEADO: Inicio, Mis gestiones, Vacaciones, Anuncios y eventos, Mis datos.
- Responsive: en pantallas pequeñas la barra se convierte en un botón de menú con un panel de acordeones y el buscador sigue accesible. Resalta la ruta activa y mantén migas de pan.
- **No se toca la lógica de negocio**: solo layout, navegación y rutas.

## A3. Borradores de formularios (autoguardado en el navegador)

- Todos los formularios (nuevos y de edición) guardan automáticamente lo que el usuario lleva escrito en el **almacenamiento del navegador** (`localStorage`) mientras escribe (con *debounce* de ~500 ms). Hook reutilizable `useFormDraft(formKey, recordId?)` integrado con React Hook Form.
- Clave: `nomina2:borrador:{usuarioId}:{formKey}:{recordId|nuevo}` más una versión del esquema del formulario. Si la versión no coincide, descarta el borrador sin errores.
- Al volver al formulario aparece un aviso: *"Tienes un borrador guardado hace X minutos"* con botones **Continuar** y **Descartar borrador** (ambos con ícono; el descarte pide confirmación). Se muestra también el indicador "Borrador guardado".
- El borrador **se elimina** cuando: el usuario pulsa **Descartar**, se guarda con éxito el formulario o el usuario **cierra sesión** de forma explícita. Si inicia sesión otro usuario, purga los borradores ajenos.
- **Nunca** guardar en borrador: contraseñas, archivos adjuntos ni tokens. Conserva el paso actual en formularios por secciones. Maneja con elegancia el almacenamiento lleno o bloqueado.
- No muestres alertas de "cambios sin guardar" al navegar: el borrador ya los protege.

## A4. Códigos automáticos (en todos los formularios que pidan un código)

- Todo campo "código" es **de solo lectura y se genera solo**; el formulario muestra una vista previa en vivo ("Código: ING") y el servidor lo asigna definitivamente al guardar, de forma segura ante concurrencia (secuencias con bloqueo de fila; índice `UNIQUE`). **Un código nunca cambia** una vez asignado.
- **Algoritmo genérico** `generarCodigoGenerico(palabra, longitudMax = 3)`:
  1. Convertir a MAYÚSCULAS.
  2. Limpiar: quitar acentos y diéresis (Ñ→N, Ü→U) y todo carácter que no sea letra, número o espacio.
  3. Si tiene espacios (es compuesta): tomar la primera letra de cada palabra significativa (ignorar conectores: de, del, la, las, el, los, y, e, en, para, por, con, a). Si queda de menos de 2 caracteres, usar la opción A sobre la primera palabra significativa. Recortar a `longitudMax`.
  4. Si es una sola palabra: **Opción A** (por defecto): los primeros `longitudMax` caracteres.
  5. **Colisión**: si el código ya existe en la tabla, probar la **Opción B** (conservar la primera letra, quitar las demás vocales y recortar) y, si aún choca, agregar sufijo numérico (`ING2`, `ING3`…).
- Configuración por entidad en una tabla `CONFIG_CODIGOS` (entidad, prefijo, longitud máxima, patrón): departamentos 3, puestos 4, jefaturas 4, horarios 4, centros de trabajo 4, tipos (contrato, descuento, ausencia, solicitud) 3.
- **Empleado**: `EMP_<CODIGO_DEPTO>_<####>`, con contador **independiente por departamento** (`EMP_ING_0001`, `EMP_ING_0002`, `EMP_VEN_0001`). Si el empleado cambia de departamento, **su código no cambia**. Relleno de 4 dígitos que crece si hace falta.
- **Documentos y registros transaccionales** (solicitudes, préstamos, descuentos, eventos, anuncios…): `<PREFIJO>_<AÑO>_<####>`, por ejemplo `SOL_2026_0001`.
- Los registros existentes de la v0 se migran a la nueva numeración conservando el valor anterior en `CODIGO_ANTERIOR`.

## A5. Ubicaciones de Guatemala

- Tablas `DEPARTAMENTOS_GT` (22) y `MUNICIPIOS_GT` (340), cargadas desde una **fuente oficial (INE)** guardada como archivo de datos versionado en el repositorio, con una **prueba que verifica esos totales** y que cada municipio pertenece a un departamento. No inventes municipios; si no puedes obtener la fuente, deténte y regístralo en `docs/PROGRESO_V1.md`.
- Componente `UbicacionSelect` (departamento → municipio en cascada, con búsqueda). Valores por defecto: **departamento Guatemala, municipio Guatemala**.
- **Zona**: desplegable de 1 a 25 más la opción "No aplica"; es obligatoria solo cuando el municipio es Guatemala.
- **Dirección de empleado**: departamento, municipio, zona y un campo corto de **número de casa/vivienda** (alfanumérico con guion, con hint de formato). Reemplaza el campo único de dirección. Migración: conserva el texto anterior en `DIRECCION_ANTERIOR` y muéstralo como referencia en la edición.
- **Centros de trabajo**: el campo "localidad" pasa a ser el selector de departamento y municipio.

## A6. Configuración de empresa y PDFs membretados

- Pantalla **Configuración de empresa** (RH y ADMIN): razón social, nombre comercial, NIT, dirección, teléfono, correo, sitio web y **logo** (carga de imagen PNG/JPG/SVG, máximo 2 MB, con vista previa, validación de tipo y tamaño).
- **Todos los PDF** del sistema (boletas, constancias, certificados, cartas, planilla, constancias de salario, credenciales) llevan **membrete**: logo y datos de la empresa en el encabezado y pie de página. Un único módulo de PDF compartido (`shared/pdf`) aplica el membrete.
- **Firma**: en los documentos que requieren aprobación, el bloque de firma muestra el **nombre completo y el cargo del usuario de RRHH que aprobó el documento** (no el del representante legal). Elimina cualquier referencia al representante legal. Cada usuario RH tiene nombre completo y cargo (tomados de su ficha de empleado/puesto); si faltan, el sistema no permite aprobar y explica cómo completarlos. Guarda en el documento generado quién lo aprobó y cuándo.

## A7. Horarios personalizados

- Un horario es un conjunto de **bloques**. Cada bloque tiene: días (selección con chips y **atajos de rango**: "Lun–Vie", "Lun–Sáb", "Lun–Dom", "Fin de semana", "Personalizado"), **hora de entrada y de salida en desplegables de 30 en 30 minutos** (nunca texto libre) y **descanso en desplegable de 30 o 60 minutos**.
- El usuario puede **crear horarios personalizados**, con varios bloques (ej. Lun–Vie 8:00–17:00 y Sáb 8:00–12:00) y duplicar uno existente. No se configura día por día.
- Se calculan solos y se muestran: horas diarias por bloque (salida − entrada − descanso), horas semanales y **tipo de jornada** (diurna 6:00–18:00, nocturna 18:00–6:00, mixta si combina ambas). Valida los límites legales parametrizables (diurna 8 h/día y 44 h/semana, mixta 7 h/día y 42 h/semana, nocturna 6 h/día y 36 h/semana) con mensajes claros. No se permiten bloques solapados en un mismo día ni salida anterior a la entrada (se contempla jornada nocturna que cruza medianoche).
- Los días sin bloque son **días de descanso** del empleado. Esa información alimenta el cálculo de días laborales (vacaciones) y el valor de la hora extra.
- Desde el formulario de empleado se elige un horario del catálogo o se crea uno personalizado en un modal, sin salir del formulario.
- Migración de los horarios v0 a la nueva estructura sin cambiar su significado.

## A8. Formulario de empleado (nuevo y edición)

- **Código**: automático (A4); se ve la vista previa al elegir el departamento.
- **NIT**: validación con **dígito verificador (módulo 11)**: se toman los dígitos sin el verificador, se multiplican por factores que bajan desde (cantidad de dígitos + 1) hasta 2, se suman, y el verificador es `(11 − (suma mod 11)) mod 11`; si da 10 el verificador es `K`. El campo solo acepta dígitos y una `K` final, con máscara, y explica el error: *"El dígito verificador del NIT no coincide. Revisa el número."* Se valida también en el backend.
- **Dirección**: departamento, municipio, zona y número de casa (A5).
- **Fecha de ingreso**: por defecto **hoy** (sigue siendo editable dentro de las reglas de fechas existentes).
- **Fecha de fin de contrato**: depende del tipo de contrato. Cada tipo tiene la bandera `REQUIERE_FECHA_FIN`. Si es **tiempo indefinido**, el campo se **bloquea** (con tooltip que lo explica) y queda vacío; en los demás es obligatorio y posterior a la fecha de ingreso. Cambiar el tipo de contrato ajusta el campo automáticamente.
- **Sexo**: solo `Masculino` y `Femenino`.
- **Parentesco** (contacto de emergencia): desplegable con Madre, Padre, Hermano/a, Esposo/a, Hijo/a, Abuelo/a, Tío/a, Primo/a, Cuñado/a, Suegro/a, Pareja/conviviente y Otro.
- **Usuario y contraseña**: se crean **automáticamente al guardar el empleado**, en la misma transacción (si falla uno, no se crea ninguno). Usuario `nombre.apellido` (A4 de v0), contraseña temporal aleatoria, cambio obligatorio en el primer login. Se muestran **una sola vez** en un modal con **Copiar credenciales** y **Descargar PDF** (con membrete, el usuario, la contraseña temporal y las instrucciones de primer ingreso). El modal exige confirmar "ya copié o descargué las credenciales" antes de cerrarse. **No se guarda la contraseña en texto plano ni en logs**; si se pierde, RRHH/ADMIN restablece una nueva. **No hay botón de "generar usuario"**.
- **Carga masiva**: actualizada a las nuevas reglas (códigos y usuarios automáticos, ubicaciones validadas contra el catálogo, sexo M/F, parentesco del catálogo, horario por código), con plantilla CSV de ejemplo nueva y un **único PDF de credenciales** (una por empleado) descargable una sola vez.

## A9. Vacaciones (reglas v1)

- **Acumulación automática, sin intervención**: `acumulado = 1.25 × meses completos` desde la fecha de contratación hasta hoy (ej.: 5 meses completos = 6.25 días). Se calcula al consultar (determinista) y se descuenta con el kardex de consumos. `disponible = acumulado − días tomados/aprobados − vacaciones previas`. **Solo se pueden solicitar días completos**: `solicitables = floor(disponible)` (con 6.25 disponibles solo puede solicitar 6).
- El portal del empleado y la pantalla de RRHH muestran: acumulado, tomados, disponible (con decimales) y **solicitables (entero)**.
- **Empleado**: al elegir un rango en el calendario el sistema cuenta los días laborales según su horario (excluye descansos y feriados) y **solo permite enviar si esos días ≤ solicitables**, con un mensaje claro si no.
- **RRHH**: al abrir la solicitud el sistema calcula los **días laborales del rango según el horario del empleado**. Ejemplo de prueba obligatoria: del 1 al 15 de noviembre de 2026 con horario Lun–Vie = **10 días**. Compara con el disponible: verde si alcanza; rojo y botón de autorizar deshabilitado si no (también en el backend, que revalida al aprobar).
- **Al autorizar**: se conserva el registro de la solicitud del empleado (quién la pidió, rango, días laborales calculados, quién aprobó y cuándo) y se genera el movimiento en el kardex que **resta los días del saldo**. Una solicitud aprobada que aún no comenzó puede cancelarse y devuelve los días (queda registro).
- Una solicitud rechazada exige motivo y no descuenta nada.

## A10. Novedades (todas se cargan antes de calcular la nómina)

- **Horas extra**: se registran por **mes** (selector de mes y año, no fecha) y **cantidad de horas** (admite medias horas). El mes no puede ser futuro ni pertenecer a un periodo cerrado; hay un tope mensual parametrizable que genera advertencia. Valor: `horas × (salario mensual / 30 / horas de jornada diaria del horario) × 1.5`. Se reflejan en la boleta (cantidad de horas y monto).
- **Ausencias**: las **sin goce de sueldo restan** al pago (valor día = salario / 30) y aparecen en la boleta como línea propia ("Descuento por ausencias, N días"). Las con goce no restan.
- **Comisiones**: carga **manual** por empleado y mes, con descripción.
- **Consumo en tienda**: carga **manual** (mes, monto, referencia). Se descuenta en el pago del último día del mes.
- **Parqueo como suscripción**: RRHH configura dos **tarifas mensuales vigentes** en Configuración (**Carro** y **Moto**, con vigencia y auditoría). El empleado solicita parqueo indicando tipo de vehículo (y placa opcional); al **aprobarse se crea la suscripción activa** y el descuento se aplica **automáticamente cada mes en el pago del último día**, desde el mes de aprobación y sin prorrateo, hasta que se dé de baja. El empleado puede **solicitar la baja**; RRHH también puede suspender o dar de baja (efectiva al cierre del mes en curso).
- Toda novedad tiene estado `Pendiente` o `Aplicada` (a qué pago se aplicó) y no se puede editar una vez aplicada o si su periodo está cerrado.

## A11. Planilla v1: anticipo, pago y simulación (reemplaza el flujo quincenal de v0)

**Estructura.** Cada mes tiene dos pagos que se corresponden con los dos periodos quincenales ya existentes: **Anticipo** (día 15) y **Pago** (último día del mes: 28, 29, 30 o 31). La fecha de pago es informativa; el sistema no la mueve por fines de semana o feriados.

**Notación** (empleado, mes M):
```
SB    = salario base mensual (prorrateado por días de contrato en el mes: SB × días / 30, tope 30)
AUS   = días de ausencia sin goce × SB / 30
BI    = bonificación incentivo (parámetro, Q250) × (30 − días ausencia sin goce) / 30
COM   = comisiones del mes (manual)
HE    = horas extra × valor hora × 1.5
DEV   = SB − AUS + BI + COM + HE                   # devengado total del mes
AFECTO_IGSS = SB − AUS + COM + HE                  # la bonificación incentivo no es afecta
```
**Anticipo (día 15)** = `0.50 × SB + BI + COM_cargadas + HE_cargadas` (lo que esté cargado al momento de calcular). **No lleva descuentos**.

**Pago (último día)** = `DEV − anticipo ya pagado − IGSS − ISR − parqueo − consumo en tienda − préstamos/anticipos/embargos y otros descuentos`.
- IGSS laboral (4.83 % parametrizable) sobre `AFECTO_IGSS`.
- ISR: **se retiene una sola vez, en el pago del último día**, con el método de proyección anual de v0 (retención = (ISR anual − retenido acumulado) / meses restantes, recálculo en diciembre). Aguinaldo y Bono 14 exentos dentro del límite.
- Lo que se cargue después de calcular el anticipo (comisiones, horas extra) se paga en el pago del último día. Las novedades pendientes de meses anteriores se incluyen en el cálculo del mes actual y se etiquetan como retroactivas.
- Los descuentos de v0 con cuota quincenal pasan a **cuota mensual aplicada en el pago del último día** (migrar conservando el monto y número de cuotas, y documentarlo).
- Si el neto resultante es negativo: **bloquear** el pago de ese empleado con una alerta clara indicando qué ajustar.
- Ejemplo de prueba obligatoria: salario base Q10,000.00, sin extras → anticipo = Q5,250.00 (5,000 + bonificación 250); IGSS = Q483.00; neto del mes = 10,250 − 483 − ISR − otros descuentos. Calcula los valores esperados de las pruebas de forma independiente a la implementación.

**Boleta** (membretada): salario base, descuento por ausencias, bonificación incentivo, comisiones, horas extra (cantidad y monto), total devengado, anticipo (en el pago), IGSS, ISR, parqueo, consumo en tienda, préstamos y otros, neto a pagar. La boleta del anticipo se titula "Anticipo quincenal".

**Simular un pago.** Pantalla con selección de: **tipo de pago** (Anticipo, Pago del mes, Bono 14, Aguinaldo; la indemnización es individual), **mes**, y **objetivo**: un empleado, un departamento o todos. Flujo: **Simular** (calcula sin guardar, muestra la tabla con totales, alertas y vista previa de boleta marcada "SIMULACIÓN") → lista de verificación previa (cuántos empleados tienen horas extra, comisiones, consumos y ausencias cargados, novedades pendientes de meses anteriores, empleados con alertas) con casilla obligatoria "confirmo que las novedades del mes están completas" → **Confirmar y pagar** (transaccional, idempotente: `UNIQUE (empleado, mes, tipo de pago)`; no permite pagar dos veces). Al confirmar: guarda el cálculo, **genera las boletas PDF** de todos los empleados del objetivo (descarga individual y ZIP), marca las novedades como aplicadas y notifica a cada empleado. Reversión solo para ADMIN, con motivo y antes del cierre del periodo. El cierre del periodo de v0 se mantiene.

## A12. Prestaciones automáticas

Integradas a **Simular un pago** (A11) y también disponibles en sus pantallas:
- **Bono 14** (periodo 1 jul – 30 jun) y **Aguinaldo** (1 dic – 30 nov): el sistema los calcula **solo** a partir de la fecha de contratación. Con menos de 1 año en el periodo, **proporcional** (`promedio × días laborados en el periodo / 365`); con 1 año o más, **pago completo** (100 % del promedio mensual de los últimos 12 meses, incluyendo comisiones y horas extra). Exentos de ISR dentro del límite legal. El cálculo aparece **precalculado y listo para revisar** al llegar su fecha de pago (julio y diciembre).
- **Indemnización**: se calcula **automáticamente** al elegir el empleado, desde su fecha de contratación hasta la fecha de baja (por defecto hoy): promedio de los últimos 6 meses × tiempo laborado en años y fracción de año, más vacaciones pendientes (`días × salario / 30`) y aguinaldo y bono 14 proporcionales (finiquito). Muestra el desglose paso a paso y genera el documento PDF membretado.

---

# ADENDO v1.1 — Segunda ronda de correcciones sobre la v1

> Agrega este bloque **al final de `AGENTS.md`** (después del adendo v1). Donde contradiga a versiones anteriores, **este adendo manda**.

## B0. Alcance y reglas de la ronda

- Se trabaja sobre la v1 ya construida. Rama `v1.1` creada desde `v1`.
- **No edites migraciones anteriores**; los cambios de esquema van en migraciones nuevas que conserven los datos existentes.
- Cada fase corrige causas raíz, **no síntomas**: reproduce el problema, identifica la causa, corrígela y agrega una prueba de regresión que fallaba antes del arreglo.
- Bitácora: `docs/PROGRESO_V1.md`, sección "Ronda 2".
- No rompas pruebas existentes; si una regla cambia a propósito, actualiza la prueba y anótalo.
- Si el usuario adjuntó capturas de pantalla de referencia (por ejemplo para el tamaño de los campos), úsalas como guía visual.

## B1. Correcciones críticas

**Login.** Tras ingresar credenciales válidas y pulsar "Iniciar sesión" aparece el aviso "Inicia sesión para continuar." cuando no debería. Debe iniciar sesión y redirigir sin ningún aviso. Hipótesis a descartar: el manejador global de 401 mostrando un aviso por una verificación de sesión previa al login; el guard de rutas evaluándose antes de que la sesión se actualice; un mensaje "flash" que queda guardado en el estado de redirección; la obtención del token CSRF. El aviso solo debe mostrarse cuando un usuario **sin sesión** es redirigido desde una ruta protegida o cuando la sesión **realmente expiró**, nunca después de un login exitoso. No lo resuelvas ocultando el mensaje.

**Anuncios/Eventos (error de módulo).** En la pantalla de Anuncios/Eventos aparece: *"'text/html' is not a valid JavaScript MIME type for module script '…/assets/ComunicacionPage-….js'"* (servido en `https://localhost:8443`). Es el síntoma típico de que el servidor devolvió `index.html` (fallback de SPA) en lugar de un archivo JS que no existe (hash antiguo tras recompilar, o chunk faltante). Corrige la causa: revisa la configuración de nginx (`try_files` para `/assets/` debe responder 404 real con el tipo de contenido correcto, no `index.html`), cabeceras de caché (`index.html` sin caché; `/assets/*` con hash como inmutables), que el build de Docker no deje chunks viejos mezclados y que el chunk exista en el `dist`. Además: manejo de `vite:preloadError` (recarga única controlada para obtener la versión nueva) y un `errorElement`/ErrorBoundary de rutas con pantalla amigable ("Algo salió mal", botones Reintentar y Recargar), no la pantalla técnica de React Router.

**Borradores (descartar/cancelar).** Hoy, al pulsar "Descartar borrador" o cancelar a medias, el borrador reaparece al reabrir el formulario. Corrige:
- **Descartar borrador** elimina el borrador de forma definitiva y reinicia el formulario. Cancela cualquier guardado automático pendiente (el *debounce* no debe reescribirlo) y marca el formulario como descartado hasta que el usuario vuelva a escribir.
- **Cancelar**: si hay datos escritos, muestra un diálogo con dos opciones claras: **Conservar borrador y salir** / **Descartar y salir**. Sin datos, sale directamente.
- El resto de reglas A3 se mantiene (se elimina al guardar con éxito y al cerrar sesión).

## B2. Barra superior, inicio y notificaciones

- **Color**: la barra de menú horizontal es **azul**, usando el azul primario de la paleta del mockup (token del sistema de diseño, no un color nuevo). Texto e íconos claros con contraste AA. Estados hover, activo y foco coherentes; botón de búsqueda, notificaciones, ayuda y menú de usuario legibles sobre el azul. Los paneles desplegables pueden ser superficies claras con acentos azules, coherentes con el mockup.
- **Inicio**: es un **botón simple con ícono** que lleva al dashboard; **sin desplegable** y sin la opción "Resumen" (elimina esa ruta o redirígela). Actualiza `navigation.config.ts` y el buscador Ctrl/⌘ K.
- **Nombre mostrado**: en todo el sistema (saludo, menú de usuario, listados donde se muestre la persona) se muestra **"Nombre Apellido"** (primer nombre + primer apellido, tomados de la ficha del empleado) en lugar de `nombre.apellido`. Si no hay ficha, convierte el usuario separando por el punto y capitalizando cada parte. El nombre de usuario sigue mostrándose solo donde sea técnico (administración de usuarios, credenciales).
- **Recorrido de ayuda**: elimina por completo el aviso/botón "Conoce esta página" y cualquier oferta automática del recorrido en la primera visita (y su bandera persistida). El recorrido **solo** se inicia al pulsar el botón de ayuda.
- **Notificaciones**: agrega **borrar una** (ícono por notificación) y **borrar todas** (con confirmación). Es un borrado por usuario (no afecta a otros destinatarios), valida que la notificación pertenezca al usuario, y actualiza el contador de la campana. Conserva "marcar como leída".

## B3. Tamaño de los campos de formulario

Los campos no deben ocupar todo el ancho disponible: se ajustan al contenido esperado.
- Los componentes de formulario compartidos calculan su ancho **a partir de la longitud máxima** y el tipo de dato, con un prop `tamano` opcional para forzarlo. Referencia (en caracteres): código y zona ≈ 10–12; DPI y NIT ≈ 18; teléfono ≈ 14; fecha ≈ 16; monto ≈ 16; select corto ≈ 20; texto hasta 30 caracteres ≈ 30; correo ≈ 36; texto hasta 50 ≈ 44; dirección y nombres largos ≈ 56–60 (tope); `textarea` ancho completo con tope (~640 px).
- Un campo con límite de 30, uno de 50 y uno de 100 caracteres **nunca** se ven iguales.
- Los formularios usan un ancho máximo cómodo (no se estiran en pantallas grandes) y alinean etiquetas, hints y errores al ancho del campo. Varios campos cortos pueden compartir fila.
- Aplica el cambio a **todos** los formularios (empleados, catálogos, novedades, solicitudes, parámetros, etc.) y mantén responsive (en móvil los campos pueden ocupar el ancho completo).

## B4. Catálogos: validación, duplicados y consistencia

Aplica a **todos** los catálogos (departamentos, puestos, jefaturas, tipos de contrato, tipos de ausencia, motivos de baja, tipos de día, tipos de ingreso, tipos de descuento, conceptos, zonas, países, centros de trabajo, horarios, parentescos, etc.). Implementa una sola vez (validador y componente de CRUD genéricos) y reutilízala; la misma validación corre al **crear y al editar**, en frontend y backend.

**Nombres.** Validador compartido `validarNombreCatalogo`:
1. Recortar espacios al inicio y al final y colapsar espacios múltiples (el recorte se aplica antes de validar y se guarda recortado).
2. Un nombre de solo espacios es **vacío** (campo requerido).
3. Debe contener **al menos una letra** (rechaza nombres solo numéricos o solo símbolos como `123456` o `/*%$#&/@#^`) y mínimo 2 caracteres.
4. Caracteres permitidos: letras (con acentos, ñ, ü), dígitos, espacios y `. , - / & ( ) '`. Cualquier otro (`* % $ # @ ^ < > ! ? = + ~ | \ { } [ ]`, etc.) se **bloquea al escribir** y se rechaza en el servidor con un mensaje claro que lo explique.
5. Longitud máxima por catálogo, con ancho de campo según B3.

**Duplicados.** No se permiten nombres duplicados dentro de un catálogo, **sin distinguir mayúsculas/minúsculas ni acentos ni espacios sobrantes** ("Ingeniería", "ingenieria" y " INGENIERÍA " son el mismo nombre).
- Guarda un `NOMBRE_NORMALIZADO` (sin acentos, minúsculas, espacios colapsados) con índice `UNIQUE` por catálogo, además de la verificación en el servicio. Error HTTP 409 con código `DUPLICADO` mapeado al campo, con mensaje claro: *"Ya existe un departamento llamado «Ingeniería». Usa otro nombre o edita el existente."*
- Si el duplicado está **inactivo**, el mensaje lo indica y ofrece **Reactivar**.
- Migración: normaliza los datos existentes; si ya hay duplicados, **no falles**: conserva el más antiguo, renombra los demás con sufijo `(duplicado 2)`, márcalos inactivos y repórtalo en `docs/PROGRESO_V1.md`.

**Edición.** Editar un registro revalida con las mismas reglas (no se puede dejar el nombre en caracteres especiales).

**Eliminar.** Un registro **en uso** (por empleados u otras tablas) **no se puede eliminar**: el backend lo bloquea revisando todas las referencias y responde con mensaje claro (*"No se puede eliminar: lo usan N empleado(s). Puedes inactivarlo."*); el frontend deshabilita el botón con un tooltip explicativo y muestra una columna "En uso". Inactivar sí se permite (con advertencia si está en uso); un elemento inactivo no aparece en los selectores de formularios nuevos pero sigue visible en los registros existentes.

**Acciones por fila consistentes.** Todos los catálogos usan el mismo componente de acciones: Ver, Editar, Inactivar/Activar, Historial y Eliminar (cuando no está en uso), cada una con ícono. Hoy **Motivos de baja** solo muestra "Historial" y "Ver": debe tener las mismas acciones que los demás.

**Casos específicos.**
- **Zonas**: el código postal acepta **solo dígitos** (5 dígitos, formato guatemalteco), con teclado numérico y bloqueo de letras al escribir; mensaje claro.
- **Países**: el código ISO acepta **solo letras**, exactamente 2 (ISO 3166-1 alfa-2), convertidas a mayúsculas automáticamente; mensaje claro.
- **Tipos de contrato y demás**: los espacios al inicio o al final se recortan al guardar.

## B5. Empleado nuevo: asistente por pasos

El formulario único se divide en un **asistente de 4 pasos** (también para editar un empleado):
1. **Datos personales**: nombres, apellidos, DPI, NIT, fecha de nacimiento, sexo, estado civil, teléfono, correo y dirección (departamento, municipio, zona y **Dirección**).
2. **Datos laborales**: código (vista previa), departamento, puesto, jefatura, tipo de contrato, fechas, horario y centro de trabajo.
3. **Datos salariales y banco** — **opcional**.
4. **Contacto de emergencia** — **opcional**.

Comportamiento:
- Indicador de progreso (stepper con ícono por paso, estado completo / con errores / opcional), botones **Anterior** y **Siguiente** con íconos, y navegación directa a pasos ya visitados. Valida cada paso antes de avanzar; los errores se marcan en el paso correspondiente.
- **Guardar empleado** está disponible cuando los pasos 1 y 2 son válidos. Los pasos 3 y 4 pueden omitirse; si se llenan parcialmente, se exige completar el grupo (ej. si elige banco, falta el número de cuenta).
- Un empleado sin salario queda con la marca **"Perfil incompleto"** (con la lista de lo que falta, visible en el listado y la ficha). Mientras no tenga salario, la simulación de planilla lo **excluye con una alerta** (sin bloquear a los demás) y aparece en las alertas del dashboard.
- Antes de guardar, un resumen indica los datos opcionales omitidos y sus consecuencias.
- El borrador (B1) conserva el paso actual y los datos de todos los pasos.
- Se mantienen la creación automática de usuario, el modal de credenciales (copiar y PDF) y la carga masiva.

**Dirección.** Se renombra "Número de casa/vivienda" a **"Dirección"** (también en la plantilla CSV de carga masiva y en la ficha). Permite letras (con acentos y ñ), números y espacios, además de `. , # - / °` propios de una dirección; debe contener al menos una letra o un número. Máximo 100 caracteres. Migración: renombra la columna y amplía su longitud sin perder datos.

**NIT.** Se relaja la validación para datos de prueba: se acepta una secuencia de **5 a 12 dígitos** con una `K` final opcional (y guion opcional), **sin comprobar el dígito verificador**. Sigue siendo único. Conserva la validación módulo 11 en el código, controlada por un parámetro de sistema `VALIDAR_DIGITO_NIT` (por defecto **desactivado**, activable por ADMIN para producción). Actualiza hints y mensajes.

## B6. Cascada departamento → empleado

En **todo** formulario o filtro donde existan selectores de departamento y de empleado (prestaciones: aguinaldo, bono 14 e indemnización; simular pago; novedades como comisiones, horas extra, ausencias, descuentos, préstamos, consumo en tienda, parqueo; vacaciones; solicitudes y reportes) el selector de empleado se **filtra por el departamento elegido** y solo lista sus empleados. Reglas:
- Un único componente `SelectorEmpleado` con búsqueda, que acepta `departamentoId`, carga desde el servidor filtrando por departamento (y solo empleados activos cuando aplique) y muestra código y nombre.
- Al cambiar el departamento se limpia el empleado elegido si ya no pertenece a él. Sin departamento elegido, el selector lista todos (con búsqueda) mostrando el departamento de cada uno.
- Estado vacío claro si el departamento no tiene empleados. Revisa el repositorio buscando todos los lugares donde aplique.

## B7. Dashboard de RRHH (primera vista)

**Encabezado**: saludo "Hola, Nombre Apellido" y fecha. Debajo, **lo primero que se ve** es un tablero de **4 recuadros de estadísticas**, visualmente atractivos, con gráficas y animaciones, y con opciones para alternar los datos. El resto de indicadores del dashboard actual (nómina del periodo, solicitudes pendientes, alertas, etc.) pasan **debajo** de esa primera vista.

1. **Top 5 de remuneraciones**: alternar **Empleados / Departamentos** y la métrica **Salario base / Comisiones / Horas extra / Total devengado**, con selector de mes. Barras horizontales animadas con posición, nombre y monto.
2. **Top de inasistencias**: alternar **Empleados / Departamentos** y periodo (mes / trimestre / año). Barras apiladas por categoría, con estos colores fijos:
   - Inasistencias por enfermedad justificadas por **IGSS** → **verde**
   - Inasistencias justificadas **con goce** de sueldo → **amarillo**
   - Inasistencias justificadas **sin goce** de sueldo → **naranja**
   - Inasistencias **sin justificación** → **rojo**
   Leyenda con totales en días y desglose al pasar el cursor.
3. **Vacaciones**: pestañas **En curso** / **Próximas** (30, 60 o 90 días). Lista con línea de tiempo y chips de fechas y días; contador de personas ausentes hoy.
4. **Cumpleaños y aniversarios**: pestañas **Cumpleaños** / **Aniversarios** con los próximos 30 días (aniversario muestra los años cumplidos; no se muestra la edad). Resalta a quien cumple hoy.

Requisitos transversales:
- **Datos**: agrega a los tipos de ausencia el campo `CATEGORIA_INASISTENCIA` (`IGSS_JUSTIFICADA`, `JUSTIFICADA_CON_GOCE`, `JUSTIFICADA_SIN_GOCE`, `SIN_JUSTIFICAR`), editable en el catálogo, con migración que asigna la categoría a los tipos existentes según su efecto (subsidio IGSS, con goce, sin goce) y un tipo nuevo "Inasistencia sin justificación" (efecto sin goce para la nómina). Endpoints de agregación solo para RH y ADMIN, con filtros, índices adecuados y pruebas de autorización (los datos de salario son sensibles).
- **Animaciones**: `framer-motion` (o equivalente) para entrada escalonada, barras que crecen, números con conteo y transiciones entre pestañas; respetan `prefers-reduced-motion`. Esqueletos de carga, estados vacíos útiles y actualización de datos con indicador "Actualizado hace X".
- **Utilidad**: cada elemento enlaza a la pantalla correspondiente ya filtrada (ej. clic en un empleado de inasistencias abre sus ausencias).
- Mantén fidelidad con el mockup (paleta, tipografía, tarjetas) y funcionamiento responsive.
- Actualiza el recorrido de ayuda del dashboard.

## B8. Reglas anteriores que cambian

- A2 (v1): el buscador y el menú leen el nuevo `navigation.config.ts` con **Inicio sin desplegable** y barra azul.
- Sección 9 (v0): el recorrido guiado **ya no se ofrece automáticamente**; solo desde el botón de ayuda.
- A8 (v1): el NIT no exige dígito verificador por defecto; el formulario de empleado es un asistente de 4 pasos con los pasos 3 y 4 opcionales; "Número de casa" pasa a "Dirección".
- A3 (v1): "Descartar borrador" elimina de forma definitiva y "Cancelar" ofrece conservar o descartar.
