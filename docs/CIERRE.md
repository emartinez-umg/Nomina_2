# Cierre y auditoría de nomina2 — FASE 12

## Alcance y reproducción

La referencia visual es `MOCKUP/mockup.pdf`: sidebar azul, acciones verdes, fondo gris, superficies
blancas, campos proporcionales y tokens existentes. Las páginas específicas de nómina se derivan
del mismo lenguaje visual. No se incorporan cifras o personas ilustrativas a la aplicación.

`npm run verify:all` reúne calidad, migraciones, integración Oracle, Playwright, infraestructura y
arranque con volúmenes vacíos. Ver README para requisitos y comandos individuales. Chromium usa
cookies/CSRF reales y la API consulta un esquema Oracle desechable. La instalación de aceptación
usa otro proyecto Docker y claves aleatorias; nunca reutiliza el volumen de trabajo.

## Resultado verificado el 13/10/2026

- 324 unitarias (206 backend + 118 frontend), también en Node 20; 114 Oracle/Supertest y 10 E2E aprobadas.
- Lint, TypeScript strict, formato, builds, esquema vacío/índices y escaneo Git sin errores; npm audit: cero vulnerabilidades.
- 111 visitas de la matriz por rol/viewport y 26 formularios de catálogos; ayuda, hints, axe y móvil.
- Instalación Compose con volúmenes nuevos: migraciones/seeds, HTTPS, primer login/cambio obligatorio,
  cookie Secure y sesión tras recarga. Composición habitual saludable y datos conservados.

## Matriz de pantallas y ayuda

| Familia               | Roles                               | Contextos revisados                                                                                                                                                                  |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Autenticación y salud | Público / los tres roles            | Login, errores, cambio obligatorio, reintento de salud.                                                                                                                              |
| Inicio                | ADMIN, RH, EMPLEADO                 | Indicadores, gráficas/alternativa textual, alertas, accesos, anuncios/eventos.                                                                                                       |
| Usuarios y bitácora   | ADMIN                               | Filtros, páginas/orden, CSV, alta, cambios de acceso, clave de una entrega, comparación auditada.                                                                                    |
| Catálogos             | ADMIN, RH                           | Índice y 13 catálogos: empresa, bancos, centros, departamentos, puestos, jefaturas, horarios, feriados, tipos y reglas legales; formularios, detalles, versiones, baja/confirmación. |
| Empleados             | ADMIN, RH                           | Listado, alta/edición, ficha/seis pestañas, salario, baja/finiquito, carga CSV y credenciales.                                                                                       |
| Novedades             | ADMIN, RH                           | Cinco tipos: descuentos, préstamos, comisiones, horas extra y ausencias; listados, altas/edición, detalle, adjunto, cálculo y confirmación.                                          |
| Nómina                | ADMIN, RH                           | Periodos, flujo, totales/alertas, filtros/historial, conceptos, exportaciones, apertura/deducciones y formato IGSS.                                                                  |
| Prestaciones          | ADMIN, RH                           | Cálculo anual, finiquito, constancia, historial/detalle, aprobación, pago/anulación.                                                                                                 |
| Vacaciones            | ADMIN, RH, EMPLEADO                 | Saldo/kardex, calendario, selección/revisión/envío, bandeja, semáforo, resolución, historia certificada.                                                                             |
| Solicitudes y datos   | ADMIN, RH, EMPLEADO según operación | Tarjetas, bandejas, solicitud, resolución, PDF, entrega, plantillas/versiones, contacto y datos críticos.                                                                            |
| Comunicación          | ADMIN, RH, EMPLEADO según operación | Anuncios/eventos propios o gestión, filtros, calendario, audiencias, edición, detalle y baja.                                                                                        |
| Navegación compartida | Los tres roles                      | Búsqueda de sección, menú móvil, campana, cuenta/salida y ayuda reiniciable.                                                                                                         |

Las definiciones por módulo/rol se conservan en `features/*/help/`. El proveedor añade explicación
de formato, selección, pegado, obligatoriedad y corrección para cada campo visible. Escapa el texto
antes de entregarlo a Driver (que interpreta HTML). En ventanas usa elementos DOM del diálogo
superior, evitando resaltar campos del fondo con el mismo selector. Cada ventana tiene ayuda propia.
La bienvenida se integra en el contenido y permite descartarla; no tapa acciones. Al cerrar el
recorrido se restituye el foco y la posición de lectura desde donde se abrió.

## UI, accesibilidad y validación

Los componentes Field y Button concentran etiquetas, hints, tooltip de información, controles
accesibles e iconos. Se corrigió el nombre accesible que concatenaba “obligatorio”; el atributo
required comunica esa condición. El menú oscuro tiene foco blanco y existe enlace para saltar al
contenido. Los calendarios conservan sus celdas numéricas y controles nativos de navegación.

Playwright comprueba hints, apertura/reinicio de ayuda, ancho de página y reglas axe WCAG A/AA.
El portal se comprueba a 390 × 844, incluido menú con Escape, boletas, solicitudes, calendario y datos.
Mis solicitudes ofrece filtros propios por tipo/estado/fechas; buscar empleados corresponde a ADMIN/RH.
Los estados móviles de solicitudes reutilizan skeletons y vacío con icono y acción sugerida.
Las pruebas Vitest cubren Tab/flechas/Enter de selectores, máscaras, pegado, formularios, estados
vacío/error/carga y doble envío. Los errores HTTP se presentan en español y se asignan por lista
blanca a campos; no se interpretan como HTML. Las capturas de revisión quedan ignoradas en `tmp`.

| Regla de fecha                                 | Frontend                               | Backend / integración                                           |
| ---------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Nacimiento real, no futuro, edad parametrizada | CampoEmpleado y validadores            | empleados.schemas/service; Oracle seguridad.                    |
| Ingreso desde edad mínima, hasta hoy + 30 días | Calendario y Zod                       | Reglas obtenidas de Oracle y revalidación al guardar.           |
| Egreso/fin de contrato desde ingreso           | Límites y formulario                   | Empleados/prestaciones y protección de cierres.                 |
| Fin ≥ inicio y sin traslapes                   | Calendarios, vista previa y errores    | Ausencias/vacaciones con bloqueo transaccional.                 |
| Vacaciones laborales, no pasadas               | Calendario real de empleado y feriados | Revalidación al solicitar/aprobar, saldo actual y débito único. |
| Salario/parámetros fuera de cierres            | Límites efectivos y advertencia        | Historial, vigencias y bloqueos de PERIODOS_NOMINA.             |
| Evento futuro, horas válidas, fin coherente    | Zod, calendario y saneo de hora        | Reloj de Oracle en Guatemala y control de versión.              |
| Quincenas exactas sin solapamiento             | Fecha del intervalo                    | Límites del servidor y UNIQUE/CHECK de Oracle.                  |

DPI, NIT con verificador, teléfono, correo, nombres, moneda, referencias y horas usan saneo mientras
se escribe/pega y validación del servidor. Se completaron los tipos de contacto en empresa/formato
IGSS; los teléfonos enmascarados se normalizan antes de enviar. Los porcentajes no se trasladaron a
constantes: continúan en parámetros con vigencia.

La auditoría de empresa detectó una colisión previa entre dirección postal y dirección de orden.
Los filtros postales ahora usan `direccionTexto`; `direccion` sigue limitado a asc/desc. La prueba
unitaria y el recorrido HTTP/UI de empresa cubren el caso, también aplicable a centros de trabajo.

## Seguridad

| Superficie                                                         | Control                                                                                                                                             |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salud / CSRF previo / login                                        | Excepciones públicas mínimas; login exige CSRF, rate limit y bloqueo persistente.                                                                   |
| API de negocio                                                     | Guard global de sesión, rol válido, cambio obligatorio y CSRF de todas las escrituras.                                                              |
| Usuarios, bitácora, reapertura                                     | Exclusivamente ADMIN; último administrador protegido.                                                                                               |
| Expedientes, catálogos, novedades, prestaciones, gestión de nómina | ADMIN/RH; actor revalidado dentro de la transacción.                                                                                                |
| Boletas, solicitudes, vacaciones, notificaciones, comunicaciones   | Propiedad/audiencia obtenida desde sesión y Oracle; filtros manipulados no amplían acceso.                                                          |
| Datos propios / nuevas solicitudes                                 | EMPLEADO; cambios críticos pasan por aprobación.                                                                                                    |
| PDFs y respaldos                                                   | Descarga autenticada, propietario, estado y hash; sin publicación de archivos privados.                                                             |
| Logs / auditoría                                                   | Sin cuerpos, binds, tokens, contraseñas o datos bancarios. Logs usan plantilla de ruta, incluso si se envía DPI en una URL desconocida.             |
| Git                                                                | `.env` ignorado, revisión de historial de archivos privados y escaneo de firmas de secretos. Credenciales de fixtures solo en esquemas desechables. |

Las suites Oracle prueban además concurrencia, revocación, reapertura, rechazo de identificadores
ajenos y rollback provocado de auditoría. HTTPS local mantiene Secure; el certificado de localhost
se genera en la instalación. Producción requiere dominio/certificado válido y proxies confiables
configurados explícitamente. La revisión de secretos es una comprobación de patrones y archivos,
complementada con revisión de cambios; no reemplaza un servicio externo de detección de secretos.

## Consultas e índices

Se revisaron consultas de listados, propiedad, notificaciones, audiencias y tableros. Los tableros
agrupan en Oracle y reutilizan snapshots/versiones vigentes; no se añadió una consulta por cada
empleado. Los listados usan límites en servidor y valores enlazados. Exportaciones conservan topes.

Usuarios ahora genera únicamente los predicados requeridos y ordena por una columna de lista
blanca, evitando numerosos CASE y OR con binds nulos. V020 incorpora índice compuesto de rol/estado/
cambio obligatorio/usuario y los campos de empresa recién habilitados. `db:verify` comprueba los
índices reales de todas las FK y filtros de `db/filtros.json`, junto con objetos válidos.

Playwright registra tres mediciones de seis endpoints en `tmp/rendimiento.json`, sin respuestas ni
datos privados. Es una comprobación de latencia local con fixtures pequeños, no una prueba de carga.
La búsqueda parcial mediante INSTR puede recorrer filas aunque haya B-tree: Oracle Text o búsqueda
por prefijo y planes con estadísticas/volumen real quedan como mejora según crecimiento. No se
presume rendimiento de producción a partir de estos fixtures.

El build fuerza NODE_ENV=production para que el .env compartido de desarrollo no incorpore React
de desarrollo. El bundle principal queda por debajo de 400 kB sin comprimir; PDF.js, gráficas y
módulos pesados conservan sus chunks separados. No se ocultaron advertencias elevando el límite.

## Operación y mejoras futuras

- Validación operativa/legal por RH, calendarios de otros años y datos empresariales reales.
- Certificado público y renovación, respaldo/restauración probado, monitoreo y capacidad de disco.
- Contador de rate limit y clave CSRF previa compartidos al escalar a varias API; proxies exclusivos.
- Medición con volumen/concurrencia reales, Oracle Text si se justifica y pruebas Firefox/WebKit.
- Integraciones externas, firma electrónica y antimalware de adjuntos, si se solicitan.

Estas mejoras no alteran el alcance del cierre. Los límites y supuestos de nómina/prestaciones
permanecen documentados en las guías correspondientes y DECISIONES.md.
