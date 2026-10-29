# Expediente digital — R3-11 / C7

V042 es aditiva; no modifica registros previos ni PDFs generados. El expediente es un
módulo independiente (`expedientes`) y reutiliza sesión, CSRF, RBAC y bitácora del ERP.
Los bytes se guardan en `shared/archivos`, fuera de rutas públicas y de Oracle.

## Acceso y trazabilidad

- RH/ADMIN administran todos los expedientes, incluso antecedentes de empleados egresados.
- EMPLEADO consulta los suyos según `EMPLEADOS.ID_USUARIO`, obtenido de Oracle en cada
  petición. `/mio` resuelve su ficha sin aceptar un ID del navegador. Un jefe sigue siendo
  EMPLEADO: los tres permisos de equipo **no** dan acceso a documentos de terceros.
- Consulta de metadatos, visualización, descarga, carga, configuración y baja se auditan.
  El servicio confirma la auditoría **antes** de devolver los bytes; si falla, no entrega
  el archivo. El registro representa una entrega autorizada por el servidor, no certifica
  que el cliente haya terminado de recibirla. No se audita el contenido ni el nombre original.
- Nunca se devuelven claves del volumen ni rutas. Los logs conservan plantillas de ruta,
  sin cuerpo, nombre del archivo, query, binds ni errores de Oracle completos.
- Las versiones dadas de baja no se pueden visualizar ni descargar, tampoco por RH/ADMIN.
  Se conserva su historial con motivo/actor/fecha. No hay eliminación física en esta fase.

## Archivos y transacciones

- Carga binaria autenticada (XHR para informar progreso), sin base64 ni multipart temporal.
  Primero verifica sesión, CSRF, rol, ficha y parámetros; después aplica el límite al stream.
  No acepta codificación comprimida. nginx usa `proxy_request_buffering off` para este módulo.
- PDF/JPEG/PNG deben concordar entre extensión, Content-Type y firma/delimitadores del
  contenedor; PDF exige encabezado y EOF, PNG firma/IHDR/IEND, JPEG SOI/marcador/EOI.
  No se ejecutan documentos, no se decodifican imágenes y no hay OCR, extracción ni análisis
  semántico en el servidor. La comprobación de formato no es un antivirus ni garantiza que
  un PDF externo sea inocuo. La previsualización usa canvas PDF.js sin eval ni ejecución
  de JavaScript del PDF; no se insertan adjuntos como HTML/iframe/object en la aplicación.
- Nombres de 32 bytes aleatorios (hexadecimal de 64 caracteres + `.bin`), creación exclusiva,
  directorio 0700 y archivos 0600. Se rechazan rutas públicas conocidas, enlaces simbólicos
  del directorio/archivo, nombres originales con rutas y referencias que no coincidan con
  el patrón estricto. Los servicios aceptan únicamente ID de BD, nunca una ruta del cliente.
- SHA-256 se calcula sobre los bytes originales al guardar y se comprueba al leer junto al
  tamaño. Descarga con `private, no-store`, `nosniff`, `Content-Disposition: attachment` y
  CSP restrictiva. La vista previa obtiene los bytes mediante la misma ruta protegida.
- Bloqueo de la fila del empleado serializa cargas/reemplazos/bajas y lecturas. Restricciones
  UNIQUE garantizan versión única y una versión actual activa por empleado/tipo. Reemplazar
  exige el ID de la versión actual; un intento concurrente obsoleto recibe 409.
- Los archivos se sincronizan antes del commit; un rollback confirmado retira el archivo
  recién creado. Si el resultado del commit es incierto o Oracle no responde, se conservan
  los bytes para conciliación: nunca se borra un archivo que pudiera estar confirmado.
  Tras una caída, sistemas compara las claves del volumen con `CLAVE_ARCHIVO` en un respaldo
  coherente. No hay limpieza automática ni borrado físico de antecedentes.

## Completitud, vencimiento y configuración

- Un archivo actual por tipo; varios títulos pueden reunirse en un PDF. Reemplazar conserva
  cada versión, inclusive las dadas de baja. Historial se filtra por tipo y pagina en Oracle.
- Iniciales obligatorios: DPI, antecedentes penales, antecedentes policiacos y contrato
  firmado. Los tres primeros requieren vencimiento. Son valores operativos iniciales que
  RH ajusta en **Configurar tipo** con confirmación, motivo y auditoría.
- `Expediente X de Y` cuenta **tipos obligatorios** con archivo actual activo, no vencido
  y con fecha cuando el catálogo la exige. Vencer hoy todavía cuenta; una fecha anterior
  a hoy no. Los opcionales no alteran X/Y. La regla se aplica en ficha, listado y CSV.
- Se permite cargar antecedentes vencidos para preservar historia; la interfaz advierte
  que no completarán el expediente. No se inventa una fecha ni duración de validez legal.
- `EXPEDIENTE_MAX_MB`: 10 MiB por defecto, entero 1–50, unidad Cantidad. El techo de 50 MiB
  limita recursos de la infraestructura; nginx coincide con él. Bajar el parámetro limita
  nuevas cargas, sin bloquear la consulta de archivos históricos más grandes.
- `EXPEDIENTE_AVISO_DIAS`: 30 por defecto, entero 0–365, unidad Días. Se consultan vigencias
  en cada operación. Parámetros legales conserva confirmación, motivo y auditoría existentes.
- Dashboard RH muestra documentos actuales vencidos o con vencimiento hasta hoy + aviso,
  de empleados activos; Revisar abre la pestaña Documentos. Comparte el límite de 50 alertas
  del tablero, ordenadas por fecha, con las alertas previas. Los jefes no reciben estas alertas.
- En Mis datos el empleado abre **Consultar mi expediente**. No puede cargar, configurar ni
  dar de baja. Los bytes de vista previa viven solo en memoria y las URL blob se revocan.
  Borradores de carga guardan únicamente vencimiento; nunca archivos, nombres ni contenido.
  Motivos usan el hook existente por registro; el hint prohíbe copiar contenido personal.
  Las confirmaciones críticas siempre se vuelven a pedir.

## Contrato HTTP

Todas las rutas bajo `/api/expedientes` requieren sesión y cambio de contraseña completado.

| Método/ruta                                                    | Uso                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET `/mio`                                                     | ID propio, solo EMPLEADO                                                             |
| GET `/empleados/:id?pagina=1&tipo=…`                           | Tipos, indicadores, actuales e historial de 20 versiones                             |
| POST `/empleados/:id?tipo=…&anterior=…&vencimiento=aaaa-mm-dd` | Carga RH/ADMIN; cuerpo binario, `X-Nombre-Archivo` URI encoded y Content-Type exacto |
| GET `/documentos/:id`                                          | Bytes con auditoría de descarga                                                      |
| GET `/documentos/:id?vista=1`                                  | Mismos bytes y controles, auditoría de visualización                                 |
| POST `/documentos/:id/baja`                                    | `{ motivo, confirmado: true }`, solo RH/ADMIN                                        |
| PATCH `/tipos/:id`                                             | `{ obligatorio, requiereVencimiento, motivo, confirmado: true }`, RH/ADMIN           |

Las query y cuerpos de metadatos son Zod estricto con campos escalares; nunca aceptan listas
ni estructuras de documentos del cliente. Filtros/CSV de empleados: `expedienteIncompleto=1`.
Errores 400/413/415/409 explican formato, tamaño, compresión o versión obsoleta. Propiedad ajena
siempre devuelve 403, incluso en un documento dado de baja; no revela su contenido ni estado.

## Operación y pruebas

Ver [README](../README.md#expediente-digital-r3-11) para volumen, respaldo cifrado y restauración.
`db:export` exporta solo estructura y configuración compartible: no metadatos, hashes, nombres,
versiones ni bytes del expediente; una aserción impide INSERT/MERGE de EXPEDIENTE_DOCUMENTOS.

- `npm run verify:expedientes -- --docker`: Oracle/Supertest con Node 20 en esquema desechable.
- `npm run test:e2e -- --production expediente.spec.ts`: nginx/API/TLS/Oracle reales, dos roles,
  PDF e imágenes, historial/baja, filtro, ayuda, accesibilidad y móvil.
- `npm test`, lint, typecheck, build, format y db:verify complementan la aceptación.

### Dependencias revisadas el 29/10/2026

Se actualizaron dentro de sus rangos compatibles body-parser 2.4.0 y qs 6.17.1.
El aviso previo [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
afecta la acumulación de errores al validar colecciones grandes en Zod. Migrar todo el ERP
a Zod 4.6.6+ requiere una fase de compatibilidad; no se cambia su versión mayor aquí.
El expediente no admite colecciones en sus entradas, valida metadatos escalares y limita
el stream binario antes de validarlo. Los JSON del ERP mantienen sus límites de tamaño previos.
