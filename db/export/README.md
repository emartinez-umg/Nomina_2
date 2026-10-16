# Base de datos compartible de nomina2

Exportación del esquema real de **Oracle 21c XE / XEPDB1**, contrastada con las
migraciones V000–V030 e importada en un esquema nuevo. El informe exacto de objetos,
restricciones, catálogos, diferencias y SHA-256 está en [verificacion.json](verificacion.json).
El DDL procede de `DBMS_METADATA`, no de una concatenación de migraciones.

## Archivo único para compartir

**`nomina2_completo.sql` contiene toda la instalación en un solo archivo**: esquema,
catálogos, ADMIN genérico, historial de migraciones y verificación. Se puede copiar o enviar
ese archivo directamente; no contiene instrucciones `@@` ni necesita los otros SQL.

Conectar con el usuario de aplicación de un esquema vacío en XEPDB1 y ejecutar el archivo
completo como script. En SQLPlus/SQLcl, desde la carpeta que contiene el archivo:

```sql
@nomina2_completo.sql
```

También se puede abrir en SQL Developer y usar **Ejecutar script**. El encabezado incluye
instrucciones y las credenciales del ADMIN inicial. La instalación comprueba primero que
el usuario no sea SYS/SYSTEM y que su esquema esté vacío. Las sentencias SQL terminan en
`;` y los bloques PL/SQL conservan su `/` final.

## Requisitos

- Docker con capacidad para Oracle XE: arquitectura amd64 (emulación en Apple Silicon),
  aproximadamente 2 GB de RAM para Oracle y espacio para su volumen persistente.
- Imagen `gvenzl/oracle-xe:21-slim` y acceso a SQLPlus incluido en ella, o SQLcl/SQLPlus local.
- Destino: usuario de aplicación dedicado y **esquema vacío** en XEPDB1.
- Para regenerar: este repositorio, Node.js 20.19 o posterior de la rama 20,
  `npm ci` y el servicio `nomina2-db` saludable de Docker Compose. La API no necesita estar encendida.

## Crear un contenedor nuevo e importar

Desde la raíz del repositorio, reemplazar las dos contraseñas de ejemplo del contenedor
por claves propias. Son credenciales Oracle; son distintas de la cuenta ADMIN de la aplicación.
El nombre, puerto y volumen siguientes son independientes del entorno original.

```sh
docker run -d --name nomina2-compartida --platform linux/amd64 \
  -p 127.0.0.1:1522:1521 \
  -e ORACLE_PASSWORD='CambiaEstaClaveOracle1!' \
  -e APP_USER=nomina2 \
  -e APP_USER_PASSWORD='CambiaEstaClaveAplicacion1!' \
  -e TZ=America/Guatemala \
  -v nomina2-compartida-oradata:/opt/oracle/oradata \
  gvenzl/oracle-xe:21-slim
docker logs -f nomina2-compartida
```

Esperar el mensaje `DATABASE IS READY TO USE!` y salir de los logs con Ctrl+C.
La imagen crea el usuario `APP_USER` en XEPDB1. Para otro servidor, el bloque
comentado al inicio de `01_esquema.sql` permite crearlo con un administrador;
ajustar nombre y clave, ejecutarlo conectado a XEPDB1 y después conectar como ese usuario.
El DDL no contiene tablespaces físicos, propietarios ni rutas de la máquina de origen.

```sh
docker cp db/export nomina2-compartida:/tmp/nomina2-export
docker exec -i nomina2-compartida bash -c '
  export NLS_LANG=.AL32UTF8
  sqlplus -s -L /nolog <<SQL
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
CONNECT "$APP_USER"/"$APP_USER_PASSWORD"@//localhost:1521/XEPDB1
@/tmp/nomina2-export/00_instalar_todo.sql
EXIT SUCCESS
SQL
'
```

Alternativa local: SQLPlus o SQLcl solicita la contraseña Oracle interactivamente.
Ejecutar una de estas opciones desde la raíz del repositorio:

```sh
sqlplus -L nomina2@//localhost:1522/XEPDB1 @db/export/00_instalar_todo.sql
# SQLcl:
sql -L nomina2@//localhost:1522/XEPDB1 @db/export/00_instalar_todo.sql
```

## Orden de los archivos

| Archivo                | Contenido                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `nomina2_completo.sql` | Instalación autónoma completa; archivo recomendado para compartir.                         |
| `00_instalar_todo.sql` | Ejecuta los cinco archivos siguientes con rutas relativas `@@`.                            |
| `01_esquema.sql`       | Objetos completos, columnas identity, PK/UNIQUE/CHECK, índices, FK, comentarios y PL/SQL.  |
| `02_catalogos.sql`     | MERGE aditivos de los catálogos permitidos y sus reservas de códigos.                      |
| `03_admin_inicial.sql` | Únicamente el ADMIN genérico, sin sobrescribir cuentas existentes.                         |
| `04_versiones.sql`     | Historial técnico/checksums para que la API reconozca V000–V030.                           |
| `05_verificar.sql`     | Verifica conteos, objetos válidos, constraints, catálogos, ADMIN y tablas privadas vacías. |

`01_esquema.sql` requiere un esquema vacío y no se debe repetir sobre una instalación existente.
Los MERGE de `02`, `03` y `04` se pueden repetir: no actualizan datos ni restablecen contraseñas.
Si el DDL falla, Oracle ya habrá confirmado sentencias anteriores: corregir la causa y utilizar
otro esquema vacío. `WHENEVER SQLERROR` detiene el proceso ante errores.

Las FK se crean después de todas las tablas/claves para resolver ciclos de auditoría.
Las secuencias internas de identity y los índices LOB/PK/UNIQUE se crean con sus objetos,
sin duplicarlos. Sus nombres internos Oracle pueden variar; no son identificadores de negocio.
Las identities comienzan en 1; no se comparten contadores de empleados o transacciones.
En esta versión no existen vistas, funciones ni procedimientos independientes; las funciones
de códigos están incluidas en el paquete `N2_CODIGOS` y su cuerpo.
Durante `02`, únicamente en el destino, se deshabilitan y restauran los triggers de códigos
de los catálogos importados para preservar sus códigos. Se reconstruyen sus reservas y se
verifica que la siguiente inserción genere ID/código sin colisiones.

## ADMIN inicial

- Usuario: **`admin.inicial`**.
- Contraseña temporal de ejemplo: **`Nomina2!Temporal2026`**.
- Correo reservado, sin destinatario real: `admin@example.invalid`.
- Hash argon2id sintético generado desde esa contraseña pública; nunca se copia un hash de la fuente.
- `CAMBIO_OBLIGATORIO=1`: el primer inicio exige cambiar la contraseña antes de usar el sistema.

Para conectar la API a esta base, configurar `DB_USER`, `DB_PASSWORD` y
`DB_CONNECT_STRING` para el destino. Configurar además `ADMIN_USER=admin.inicial`,
`ADMIN_EMAIL=admin@example.invalid` y `ADMIN_PASSWORD` con la temporal anterior al primer arranque,
de modo que el seed habitual reconozca la cuenta instalada. Después de cambiarla,
el seed no la restablece. Desde otro contenedor, el host de conexión es el nombre
del servicio/contenedor en su red Docker; el puerto interno es 1521.

Completar la empresa, su logo opcional, estructura organizativa, horarios y fichas reales
en el entorno receptor antes de operar. Las aprobaciones documentales requieren una ficha
y puesto del firmante. Esta exportación no proporciona una empresa ni un empleado ficticios.
Los parámetros, tramos y feriados son la configuración exportada con su vigencia;
el equipo receptor debe validar su uso y mantener los calendarios posteriores.

## Verificación y privacidad

La instalación ejecuta automáticamente `05_verificar.sql`. Se puede repetir inmediatamente
después de importar con `@db/export/05_verificar.sql`; comprueba una instalación inicial,
por lo que sus conteos exactos ya no aplican después de registrar datos o cambiar la contraseña.

Consultas de operación:

```sql
SELECT OBJECT_TYPE, COUNT(*) FROM USER_OBJECTS GROUP BY OBJECT_TYPE ORDER BY OBJECT_TYPE;
SELECT OBJECT_NAME, OBJECT_TYPE FROM USER_OBJECTS WHERE STATUS <> 'VALID';
SELECT CONSTRAINT_NAME FROM USER_CONSTRAINTS
 WHERE STATUS <> 'ENABLED' OR VALIDATED <> 'VALIDATED';
SELECT COUNT(*) FROM DEPARTAMENTOS_GT; -- 22
SELECT COUNT(*) FROM MUNICIPIOS_GT;    -- 340
SELECT VERSION, ESTADO FROM VERSION_ESQUEMA ORDER BY VERSION;
SELECT USUARIO, CAMBIO_OBLIGATORIO FROM USUARIOS;
```

La exportación conserva estructura, pero **cero filas** de empleados/contactos/salarios,
sesiones/tokens, auditoría, notificaciones, cargas, solicitudes, pagos, documentos/PDF,
firmas o configuración/identidad de empresa y logo. Los borradores del navegador no se leen.
No se copian IDs ni autores/fechas de auditoría de los catálogos; sus motivos se reemplazan
por una descripción de instalación. Se conservan vigencias y contenido parametrizado de plantillas.
Se incluye también `TIPOS_DEDUCCION_ISR`, necesario para los catálogos fiscales.

El exportador verifica patrones de DPI, correos, rutas locales, tokens y hashes completos,
además de comparar en memoria contra datos privados de usuarios/empleados de la fuente.
La única excepción de credencial es el hash del ADMIN sintético; el CHECK de la tabla
USUARIOS conserva la firma literal `$argon2id$%` exigida por el esquema original.
Los datos privados usados para esta comparación nunca se escriben en archivos ni logs.

## Regenerar con un comando

```sh
npm run db:export
```

Lee credenciales del entorno interno de `nomina2-db`, obtiene DDL y catálogos por SQLPlus,
reconstruye las migraciones en un esquema aleatorio y realiza una segunda importación limpia.
Esta importación ejecuta `nomina2_completo.sql` dentro del contenedor, sin dependencias de archivos.
Compara definiciones, columnas, constraints, comentarios, estado de triggers y conteos;
repite los MERGE y valida hash/cambio obligatorio e inserción identity/código con rollback.
Solo publica archivos después de superar esas verificaciones. El esquema operativo es de solo
lectura durante todo el proceso. Los dos esquemas `N2EXP_*` propios se eliminan al finalizar.
No usa ni exporta la contraseña ADMIN del `.env`.

El informe y las secciones generadas de `docs/PROGRESO_V1.md` y `docs/ERD.md` se actualizan
en la misma ejecución. Cualquier divergencia frente a migraciones queda identificada en el informe
y en el progreso; una divergencia entre fuente e importación detiene la entrega.
El total de 73 tablas incluye las 68 del manifiesto funcional, las tres tablas de códigos
y las dos tablas técnicas VERSION_ESQUEMA/PRUEBA_INFRAESTRUCTURA; no hay tablas inesperadas.
Pruebas del exportador: `npm run test:export`; calidad del proyecto: `npm run lint && npm test`.

## Resumen de tablas

| Área                     | Tablas                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seguridad                | ROLES, USUARIOS, SESIONES, BITACORA_AUDITORIA.                                                                                                                                                                                  |
| Organización             | DEPARTAMENTOS, PUESTOS, JEFATURAS, CENTROS_TRABAJO, BANCOS, TIPOS_CONTRATO.                                                                                                                                                     |
| Ubicación y personal     | DEPARTAMENTOS_GT, MUNICIPIOS_GT, PARENTESCOS, EMPLEADOS, EMPLEADO_CONTACTOS_EMERGENCIA, HISTORIAL_SALARIAL.                                                                                                                     |
| Jornadas y calendario    | HORARIOS, HORARIO_DIAS, HORARIO_BLOQUES, HORARIO_BLOQUE_DIAS, EMPLEADO_HORARIO, FERIADOS.                                                                                                                                       |
| Fiscal y conceptos       | PARAMETROS_LEGALES, TRAMOS_ISR, TIPOS_DEDUCCION_ISR, ISR_DEDUCCIONES_EMPLEADO, ISR_APERTURAS, ISR_PROYECCIONES, CONCEPTOS_NOMINA.                                                                                               |
| Descuentos y novedades   | TIPOS_DESCUENTO, DESCUENTOS_EMPLEADO, DESCUENTOS_CUOTAS, DESCUENTOS_APLICACIONES, PRESTAMOS, COMISIONES, HORAS_EXTRA, TIPOS_AUSENCIA, AUSENCIAS, NOVEDADES_MENSUALES, NOVEDADES_ORIGEN, PARQUEO_TARIFAS, PARQUEO_SUSCRIPCIONES. |
| Nómina y prestaciones    | PERIODOS_NOMINA, NOMINA_EMPLEADO, NOMINA_DETALLE, NOMINA_PARAMETROS, PAGOS_NOMINA, BOLETAS_PAGO, PRESTACIONES, PRESTACION_DETALLE.                                                                                              |
| Vacaciones               | VACACIONES_SOLICITUDES, VACACIONES_MOVIMIENTOS.                                                                                                                                                                                 |
| Solicitudes y documentos | TIPOS_SOLICITUD, SOLICITUDES, SOLICITUD_HISTORIAL, PLANTILLAS_DOCUMENTO, DOCUMENTOS_GENERADOS, CONSTANCIAS_SALARIO_PDF, FIRMAS_DOCUMENTO.                                                                                       |
| Empresa                  | CONFIGURACION_EMPRESA, IDENTIDAD_EMPRESA.                                                                                                                                                                                       |
| Comunicación             | ANUNCIOS, ANUNCIO_DESTINATARIOS, EVENTOS, EVENTO_DESTINATARIOS, NOTIFICACIONES.                                                                                                                                                 |
| Cargas e infraestructura | CARGAS_MASIVAS, CARGA_MASIVA_FILAS, CONFIG_CODIGOS, REGISTRO_CODIGOS, SECUENCIAS_CODIGOS, VERSION_ESQUEMA, PRUEBA_INFRAESTRUCTURA.                                                                                              |

El diagrama completo de tablas y FK está en [docs/ERD.md](../../docs/ERD.md).
