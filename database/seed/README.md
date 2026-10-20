# Datos demo de nomina2

Fuente única: los siete JSON de [data](data/). El cargador y el exportador generan los códigos
con los triggers `N2_CODIGOS` del destino y resuelven las FK por nombres normalizados, códigos INE,
contratos y roles. No copian IDs. Se conserva el ADMIN existente; se crean dos usuarios RH y
30 EMPLEADO, con contraseña temporal y cambio obligatorio. No se crean jefaturas.

El conjunto incluye cinco departamentos, 30 puestos, diez centros, siete horarios, cinco bancos
y 32 empleados. Si hay catálogos compatibles, se reutilizan. Los totales de una instalación
con datos anteriores pueden ser mayores. Los teléfonos de centros solo son referencia JSON:
el esquema actual no tiene columna para guardarlos. Q4,000 es una referencia ficticia autorizada;
no representa el mínimo legal. Si el mínimo configurado es superior a un salario demo, la carga falla.

## Preparación

Usar Node 20.19–20.x y las dependencias del monorepo (`npm ci`). Configurar el `.env` privado
conforme a `.env.example`. Nunca agregar `.env` ni el SQL generado a Git.

| Variable                                                     | Uso                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `DB_USER`, `DB_PASSWORD`                                     | Usuario del esquema Oracle local, previamente creado                      |
| `DB_CONNECT_STRING`                                          | Local: por defecto `localhost:1521/XEPDB1`                                |
| `SEED_DEFAULT_PASSWORD`                                      | Clave temporal: 10–128 caracteres, mayúscula, minúscula, número y símbolo |
| `DEST_DB_USER`, `DEST_DB_PASSWORD`, `DEST_DB_CONNECT_STRING` | Destino remoto; las tres son obligatorias, sin recurrir a `DB_*`          |
| `ADMIN_USER`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`                | Solo instalación inicial con `--apply-schema` en un esquema vacío         |

Las contraseñas se obtienen del entorno; no se pasan como argumentos del comando ni se imprimen.
El cargador preserva la clave y la bandera de cambio de usuarios ya creados. Recuperar una clave
perdida mediante el restablecimiento de la app.

## Base local en Docker

Con Oracle disponible y el esquema actualizado:

```sh
npm run seed:demo -- --dry-run
npm run seed:demo
```

El modo thin no requiere Instant Client. Una sola transacción confirma empleados, usuarios,
salarios, horarios y propiedad en bitácora al finalizar; cualquier fallo revierte el DML completo.
`--dry-run` abre una transacción de solo lectura, sin reservar códigos.

## Otra instancia u otro esquema

Configurar las tres variables `DEST_DB_*` en el `.env` privado. Para otra instancia cambiar el
host/puerto/servicio de `DEST_DB_CONNECT_STRING`; para otro esquema de la misma instancia cambiar
`DEST_DB_USER` y `DEST_DB_PASSWORD`, manteniendo el servicio de la PDB.

```sh
npm run seed:remote -- --dry-run
npm run seed:remote
npm run seed:remote -- --with-extras --dry-run
npm run seed:remote -- --with-extras
```

Para mantener un archivo privado separado, por ejemplo `.env.destino`, también se admite:

```sh
node --env-file=.env.destino scripts/seed-remote.js --dry-run
node --env-file=.env.destino scripts/seed-remote.js
```

Las variables del proceso prevalecen sobre `.env`. Una configuración remota incompleta se rechaza
antes de conectar. El preflight exige las migraciones y checksums del proyecto, catálogos INE
completos, ADMIN activo, objetos válidos y restricciones habilitadas/validadas.

## Esquema vacío y banderas

`seed:demo` y `seed:remote` comparten estas opciones:

| Bandera          | Comportamiento                                                                |
| ---------------- | ----------------------------------------------------------------------------- |
| `--dry-run`      | Valida sin insertar, actualizar, borrar ni reservar códigos                   |
| `--with-extras`  | Añade los extras de los JSON, de forma idempotente                            |
| `--reset-demo`   | Solo borra el conjunto; no lo recarga                                         |
| `--apply-schema` | Instala las migraciones y seeds oficiales únicamente si el esquema está vacío |

Un DBA debe haber creado el usuario/esquema y sus privilegios. El cargador no crea usuarios Oracle
ni concede permisos. Ejemplo con destino vacío y `ADMIN_*` configurado:

```sh
npm run seed:remote -- --apply-schema
```

El DDL Oracle confirma por separado y no se puede revertir con la carga. Por eso `--apply-schema`
no se combina con `--dry-run` ni `--reset-demo`. Sobre un esquema con tablas no ejecuta DDL;
si está incompleto o desactualizado, se detiene. El SQL exportado requiere el esquema ya instalado.

## SQL autónomo para compartir

La generación no conecta a Oracle. Lee los mismos JSON y usa `hashearContrasena` de la app:

```sh
npm run seed:export-sql
# O bien, incluir también los extras:
npm run seed:export-sql -- --with-extras
```

Resultado: `database/seed/seed_demo.sql`, con permisos `0600`, reemplazo mediante archivo temporal
y exclusión de Git. Contiene hashes Argon2id individuales de `SEED_DEFAULT_PASSWORD`; no contiene
esa contraseña en texto plano ni credenciales Oracle. Tratarlo como archivo privado. Volver a
generarlo crea nuevas sales para posibles altas; ejecutarlo sobre usuarios ya cargados conserva
sus hashes y cambio obligatorio. No usar `git add -f` con este archivo.

Conectar como usuario del esquema de aplicación, con migraciones y catálogos oficiales instalados.
Usar una sesión sin cambios pendientes y desactivar autocommit. El archivo contiene un único bloque
PL/SQL con commit final y rollback en su manejador de errores; no crea tablas, procedimientos
permanentes ni objetos auxiliares, y no deshabilita triggers. Los caracteres `&` se codifican para
evitar sustituciones de SQLPlus. No necesita archivos adicionales al trasladarlo.

SQLPlus o SQLcl: conectar con usuario/servicio y escribir la contraseña cuando el cliente la pida;
después ejecutar:

```sql
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET SERVEROUTPUT ON
@database/seed/seed_demo.sql
```

DBeaver: abrir el archivo con la conexión del esquema destino, habilitar la salida DBMS Output,
desactivar autocommit y ejecutar el script completo (`Alt+X`) usando `/` como delimitador del bloque
PL/SQL. También se puede seleccionar desde `DECLARE` hasta `END;` y ejecutar esa sentencia completa,
sin la línea `/`. El reporte imprime los totales por tabla. No ejecutar el cuerpo línea por línea.

El SQL es aditivo e idempotente, resuelve las FK en el destino y registra propiedad compatible con
Node. Una colisión con un empleado ajeno se rechaza aunque su correo use el dominio demo.
Para validación previa, instalación de esquema o reset usar `seed:remote`; el exportador solo
acepta `--with-extras`. No genera un SQL que borre datos ni un DDL.

## Extras y reset seguro

Extras: tres historiales salariales, tres parqueos (carro/moto), un préstamo, un anticipo,
una incapacidad, una ausencia sin goce y cuatro comisiones de Ventas. Las tarifas y el mínimo
existentes se conservan. Se rechazan periodos cerrados, ausencias solapadas o fechas ya inaplicables.
El parqueo empieza en el mes real de aprobación conforme a la app; el mes del JSON es una referencia.
Las fechas del dataset corresponden al 20/10/2026; si vencen contratos o fechas de préstamos,
actualizar primero la fuente JSON y volver a validar.

```sh
npm run seed:remote -- --reset-demo --dry-run
npm run seed:remote -- --reset-demo
```

El reset también reconoce filas cargadas por el SQL. Verifica huellas y todas las FK antes de borrar,
en orden inverso de dependencias. Ante una edición, sesión, movimiento o referencia ajena se cancela
completo. No basta el dominio del correo para borrar. Conserva catálogos reutilizados, ADMIN,
bitácora y reservas de códigos. Los correlativos pueden tener huecos: no se rebajan contadores.

## Pruebas y alcance

```sh
npm run test:seed-demo
npm run test:seed-export
npm run lint
npm run typecheck
npm test
```

Las suites Oracle crean y eliminan un esquema aleatorio `N2SEC_*` mediante el contenedor local.
No ejecutan reset ni fallos deliberados sobre la base operativa. La suite de exportación ejecuta
el archivo con SQLPlus real y comprueba interoperabilidad SQL/Node, contraseñas, idempotencia y rollback.
La ejecución desde la interfaz de DBeaver no está automatizada. El verificador independiente de
aceptación corresponde a la fase 5.
