# Carga demo — fase 3

El cargador usa `data/*.json`, Oracle thin y los validadores/repositorios de nomina2.
No cambia migraciones ni lógica de la aplicación. La carga básica ya se ejecutó en la
instalación local: **32 empleados demo añadidos a los 3 existentes, 35 en total**.

## Requisitos y ejecución

Desde la raíz del monorepo, con Node 20.19+ de la rama 20 y las dependencias de desarrollo
instaladas mediante `npm ci`, configurar `.env` usando `.env.example`:

- `DB_USER` y `DB_PASSWORD`: usuario del esquema de aplicación, nunca SYS/SYSTEM.
- `DB_CONNECT_STRING`: por defecto `localhost:1521/XEPDB1`, la Oracle local de Docker.
- `SEED_DEFAULT_PASSWORD`: contraseña temporal de 10–128 caracteres con mayúscula,
  minúscula, número y símbolo. Es obligatoria para cargar, no para validar ni borrar.
  Usa comillas en `.env`, especialmente si contiene `#`. No se muestra en consola.
- `ADMIN_USER`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`: solo se usan al instalar los seeds
  oficiales en un esquema vacío. Una base existente debe tener un ADMIN activo.

En esta instalación se generó `SEED_DEFAULT_PASSWORD` en el `.env` privado existente,
con permisos 0600, sin cambiar las credenciales de Oracle o los ADMIN ni imprimirla.
Puede consultarse localmente en ese archivo para el primer inicio de los usuarios demo.

```sh
npm run seed:demo -- --dry-run
npm run seed:demo
```

El primer comando consulta y valida sin insertar, reservar códigos, incrementar contadores
ni crear usuarios. El segundo inserta todos los datos faltantes en una sola transacción DML:
un error revierte filas, reservas y auditoría de esa operación. Las identidades de Oracle
pueden dejar huecos tras un INSERT fallido; no se fuerzan ni se reinician.

La segunda ejecución conserva las filas existentes, las contraseñas y la bandera de cambio
obligatorio. Se rechaza un correo o identificación que pertenezca a un registro no creado
por este conjunto. Los catálogos compartidos se reutilizan por nombre normalizado y relación;
no se adoptan como propios ni se reactivan/modifican automáticamente.

Los nombres de usuario se generan igual que en la app: primer nombre, punto y primer apellido,
sin acentos y con sufijo numérico ante colisiones. Por ejemplo, `ana.hernandez` y
`patricia.ramirez` son las cuentas RH del conjunto en la instalación local. Deben cambiar su
contraseña al entrar. No se han iniciado sus sesiones ni eliminado esa obligación para probarlas.

El resumen muestra insertados, reutilizados, previstos o eliminados por tabla y los conteos
actuales, que también incluyen datos ajenos al demo. No incluye contraseñas, hashes o datos sensibles.

## Extras opcionales

```sh
npm run seed:demo -- --with-extras --dry-run
npm run seed:demo -- --with-extras
```

Añade los historiales salariales, parqueos, préstamo/anticipo, ausencias y comisiones del JSON.
La carga inicial de la instalación local **no incluyó extras**. Estos modos se probaron en
un esquema desechable, con una segunda ejecución que no cambia conteos ni credenciales.

- Las tarifas ficticias solo se crean si no hay historia operativa para ese vehículo; no se
  sustituyen vigencias existentes. Se usa una tarifa vigente única del destino cuando existe.
- La aprobación de parqueo llama a la función de negocio existente, crea solicitud, historial,
  suscripción y aviso interno al empleado. La suscripción empieza en el mes real de aprobación;
  el mes histórico del JSON no permite saltarse esa regla de la aplicación.
- Los historiales de tres empleados pueden ampliarse desde el conjunto básico únicamente si
  su fila salarial sigue intacta y pertenece al seed. Se conservan los periodos cerrados.
- Cuotas, días de ausencia, desglose mensual y comisiones usan las funciones/repositorios actuales.
  Los meses futuros, rangos cerrados y otras inconsistencias se rechazan con rollback.

## Reset exclusivo del demo

```sh
npm run seed:demo -- --reset-demo --dry-run
npm run seed:demo -- --reset-demo
```

`--reset-demo` **solo borra; no vuelve a cargar**. Puede seguirse por `npm run seed:demo`
para recrear el conjunto. No necesita contraseña temporal para borrar.

La propiedad de cada fila creada se registra en BITACORA_AUDITORIA con identificador del
conjunto, tabla, ID local y una huella de su contenido; no basta con el dominio del correo.
Se comprueban primero todas las filas y FK, incluyendo sus columnas compuestas. Solo después
se borran dependencias propias en el orden correcto, dentro de la misma transacción.

Si una fila fue editada, utilizada por registros ajenos, inició sesiones o participó en
operaciones que deban conservarse, el reset se cancela completo con una explicación. No elimina
auditoría, ADMIN, catálogos reutilizados, reservas ni contadores, ni adopta filas posteriores
solo porque referencien un empleado o solicitud demo. Los códigos no se reutilizan tras borrar.

## Esquema destino vacío

```sh
npm run seed:demo -- --apply-schema
```

Solo si el esquema está completamente vacío, instala las migraciones y los seeds oficiales
del proyecto antes de empezar la transacción del demo. No crea el usuario Oracle ni concede
privilegios; el esquema debe existir y poder ejecutar el DDL del proyecto.

Oracle confirma DDL de forma implícita y el runner registra sus propias confirmaciones:
esta preparación no se puede revertir junto con los datos. Por eso `--apply-schema` se rechaza
con `--dry-run` o `--reset-demo`. En una base con tablas no se ejecuta DDL desde este flag:
se exige que las migraciones, checksums, columnas, objetos y restricciones ya sean compatibles.
Un esquema parcial se corrige por el procedimiento normal de migraciones, fuera del seed.

## Comprobaciones y límites

```sh
npm run lint
npm run typecheck
npm test
npm run test:seed-demo
```

`test:seed-demo` crea un esquema Oracle N2SEC aleatorio en el contenedor local, ejecuta las
pruebas de instalación/carga, idempotencia, rollback deliberado, extras y protección de reset,
y lo elimina al terminar. Nunca dirige esas pruebas destructivas a NOMINA2.
Requiere Docker disponible y la base local saludable. Los datos operativos no se reinician.

Los teléfonos de centro siguen como referencia JSON: el esquema no tiene columna donde
guardarlos. Los catálogos de ubicaciones son los oficiales ya instalados. El mínimo ficticio
de Q4,000 se crea solo si no existe configuración del mínimo y no afecta un cierre;
la configuración del destino tiene prioridad y un salario insuficiente bloquea la carga.
Se revalidan fechas y contratos contra el día real, además de la referencia del dataset.

La fase 4 (exportación SQL y ejecutable remoto) y la fase 5 (verificador independiente)
siguen pendientes de confirmación. Las pruebas de esta fase validan el cargador y no pagan
nóminas, generan documentos ni modifican la interfaz. En la aplicación basta con recargar
Personal → Empleados; los empleados nuevos ya tienen salario, horario, usuario y contacto.
