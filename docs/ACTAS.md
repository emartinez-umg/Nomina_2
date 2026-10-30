# Actas administrativas y amonestaciones (C8)

RH y ADMIN gestionan **Personal → Actas administrativas**. El empleado consulta **Mis gestiones → Mis actas**. Un jefe conserva únicamente el acceso a sus propias actas como empleado: los permisos de equipo no autorizan ninguna acta ajena.

## Flujo de trabajo

1. Nueva acta: elegir departamento y empleado, revisar antecedentes de los últimos doce meses, tipo, fecha y lugar del hecho, descripción, norma, medida, testigos y descargos. La fecha debe estar entre el ingreso y hoy de Guatemala; descripción de 30 a 4,000 caracteres. Guardar crea un borrador del servidor y asigna el código permanente `ACT_<AÑO>_<####>` usando N2_CODIGOS, bloqueo del contador y UNIQUE.
2. Adjuntar evidencias mientras permanece en Borrador. Se admiten hasta 19 evidencias y un escaneo de firma; PDF, PNG o JPG verificados por contenido. Carga binaria con progreso y límite vigente EXPEDIENTE_MAX_MB, igual que R3-11. Los archivos no entran en borradores del navegador.
3. Revisar y confirmar **Emitir acta**. Revalida fecha, tipo y días. Requiere empresa completa y ficha del emisor con nombre completo y puesto activo. Genera un PDF membretado con plantilla versionada, línea **Recibí conforme** y nombre/cargo del emisor. Guarda bytes, SHA-256, plantilla y emisor/fecha; notifica al empleado. El contenido queda bloqueado.
4. Ver PDF, descargar o **Imprimir PDF**. La impresión dibuja todas las páginas del PDF original con PDF.js, sin ejecutar contenido, y abre el diálogo de impresión. Si el navegador bloquea la ventana, permite descargar. Cada petición del documento queda auditada antes de entregar bytes.
5. **Adjuntar firma** exige archivo y confirmación; carga y transición a Firmada son atómicas. **Se negó a firmar** exige identificar testigos presentes, conservados en el historial. Solo parten de Emitida.
6. **Anular acta** exige motivo y confirmación desde Emitida, Firmada o Se negó a firmar. Conserva documento, adjuntos e historial y notifica al empleado. No hay ruta de eliminación física, ni retorno a Borrador.

Las acciones llevan versión: una escritura o confirmación obsoleta recibe 409 y debe actualizarse. Los listados, búsqueda por código/nombre, filtros y exportación CSV se resuelven en Oracle. La ficha tiene pestaña **Actas**; Inicio RH alerta por actas Emitidas pendientes de firma, dentro del límite general de 50 alertas.

## Suspensión y nómina

El tipo marcado como suspensión exige días enteros de 1 al parámetro vigente **ACTAS_MAX_DIAS_SUSPENSION** (inicialmente 8). Es una política inicial por validar con RH, no una determinación automática de la procedencia de una medida. Se advierte siempre y se bloquea superar el máximo.

Al emitir se ofrece una casilla independiente para registrar la ausencia sin goce y una fecha de inicio, desde el hecho. El fin se calcula con días calendario inclusivos. Se reutiliza el servicio de Novedades en la misma conexión/transacción: valida empleado activo, relación laboral, salario de cada día, traslapes con ausencias/vacaciones y periodos abiertos; crea la ausencia aprobada y sus novedades mensuales para el descuento. Si cualquiera de esos pasos, la notificación o la auditoría falla, se revierte toda la emisión.

Anular un acta **conserva su ausencia y los pagos existentes**. El detalle explica el vínculo y permite revisar la ausencia en Novedades. Su eventual anulación se hace con el flujo autorizado de ese módulo; una novedad aplicada o un pago confirmado no se modifica automáticamente.

## Plantilla, seguridad y respaldo

**Editar plantilla** conserva todas las variables disponibles y exige motivo/confirmación. Usa PLANTILLAS_DOCUMENTO con código ACTA_ADMINISTRATIVA, sin tipo de solicitud, y el motor compartido de sustitución/PDF. La consulta de plantillas de solicitudes excluye esta categoría. Cambiarla inserta una versión; no altera PDFs anteriores. La línea de recepción y el bloque del emisor se añaden fuera del texto editable.

Los adjuntos usan el mismo almacén privado R3-11: clave aleatoria, permisos 0700/0600, control de hash/tamaño, rechazo de rutas y symlinks, y conservación ante commit incierto. ACTA_ADJUNTOS guarda metadatos; los PDF generados viven en Oracle. Respalda Oracle y el volumen de expedientes en el mismo corte, siguiendo el [README](../README.md#expediente-digital-r3-11). No se necesita otro volumen ni variable de entorno.

Sesión, cambio obligatorio, CSRF y rol preceden a cualquier carga. Propiedad se resuelve desde EMPLEADOS.ID_USUARIO en cada lectura/descarga. El empleado solo ve actas que hayan sido emitidas, incluidas firmadas, negativas y anuladas como antecedentes; nunca borradores. No se devuelven claves ni rutas del volumen. Lecturas, exportaciones, cargas, estados y cambios quedan auditados; el contenido del acta y de errores inesperados no se escribe en logs HTTP/Pino. nginx omite access log y buffering de disco en `/api/actas` y sus subrutas.

Los borradores locales versionados guardan texto por usuario/registro y usan las reglas comunes de cancelar, conservar/descartar, limpieza al guardar/logout y purga de usuarios ajenos. Se excluyen archivos y confirmaciones; la información queda en el dispositivo del usuario.

`db:export` excluye ACTAS_ADMINISTRATIVAS, ACTA_HISTORIAL y ACTA_ADJUNTOS; solo incluye DDL, tipos y plantillas compartibles. No es un respaldo privado. Las aserciones del exportador impiden incluir INSERT/MERGE de esas tablas.

## API y pruebas

Prefijo `/api/actas`; metadatos JSON y query estrictos con Zod compartido entre servidor y formulario.

| Método y ruta                                                      | Acceso y función                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| GET `/` y `/exportar`                                              | Listado paginado y CSV completo; empleado solo propio emitido                |
| GET `/reglas`                                                      | RH/ADMIN: tipos, límite de días/archivo, hoy y código previo                 |
| GET `/antecedentes/:id?pagina=…`                                   | RH/ADMIN: actas por fecha del hecho de los últimos 12 meses e ingreso        |
| GET `/:id`                                                         | Detalle, adjuntos e historial; control de propiedad/emisión                  |
| POST `/`, PATCH `/:id`                                             | Crear/editar borrador; empleado fijo y versión vigente                       |
| POST `/:id/estado`                                                 | EMITIR, NEGATIVA o ANULAR con versión y confirmado; condiciones según acción |
| POST `/:id/adjuntos?clase=EVIDENCIA\|FIRMA&version=…&confirmado=1` | Binario, X-Nombre-Archivo URI encoded; firma cambia estado                   |
| GET `/:id/pdf`, `/adjuntos/:id`                                    | Bytes privados; `vista=1` registra visualización                             |
| GET/PATCH `/plantilla`                                             | RH/ADMIN; versión, motivo y confirmación para cambiar                        |

- `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
- `npm run db:verify`: esquema desde cero, seeds e integridad. V043 es aditiva.
- Imagen de pruebas según README; `npm run verify:actas -- --docker`: flujo real de estados, firma concurrente, suspensión/nómina, permisos, PDF y rollback ante fallo de auditoría.
- `npm run test:e2e -- --production actas.spec.ts`: RH registra/emite/imprime/firma; consulta propia móvil, permisos, ayuda, ficha y accesibilidad con nginx/API/Oracle reales.
