# Decisiones — FASE 0

## Infraestructura y aplicación

- npm workspaces mantiene un solo lockfile; Node.js 20 en las imágenes y `.nvmrc`.
- Oracle XE 21c en `gvenzl/oracle-xe:21-slim`, volumen persistente, plataforma amd64,
  healthcheck y usuario dedicado creados por la imagen. No se sustituye XE por Oracle Free.
- Express 5 propaga promesas rechazadas al middleware central. Zod valida configuración y query.
- node-oracledb 6.10 usa thin por defecto y se comprueba el modo al crear el pool. No se llama
  `initOracleClient`. Referencia: [documentación del driver](https://node-oracledb.readthedocs.io/en/latest/user_guide/connection_handling.html).
- HTTP arranca después de comprobar Oracle. El entrypoint de Docker aplica migraciones antes
  del servidor y conserva SIGTERM mediante `exec`; el pool tiene cierre ordenado y timeouts.
- nginx sirve el build React, resuelve la API con DNS de Docker y aplica fallback para React Router.
  En desarrollo Vite usa proxy. Esto permite `/api` relativo y evita exponer credenciales al navegador.
- React 18, Router 7, TanStack Query, Tailwind 4, lucide-react y driver.js se usan en la página técnica.
  No se construyen formularios, sesiones, RBAC, nómina, calendarios, gráficas ni PDFs de negocio.
- Vitest 4 mantiene compatibilidad con Node 20; Vitest 5 requiere Node 22. Se seleccionan versiones
  corregidas de Router y Tailwind después de revisar la auditoría inicial.

## Migraciones

- Orden numérico, checksum SHA-256 y registro persistente en `VERSION_ESQUEMA`.
- Las migraciones SQL son archivos confiables versionados; los valores del historial usan binds.
- Delimitador SQL*Plus `/` aislado por sentencia, sin dividir por `;` para preservar PL/SQL y literales.
- Una migración DDL puede dejar objetos confirmados antes de fallar. El estado previo `APLICANDO`
  y el estado `FALLIDA` impiden reintentos automáticos sobre un esquema parcialmente modificado.
- Un runner a la vez. Se rechazan versiones retroactivas, duplicadas y archivos aplicados modificados.
- Sin seeds de negocio ni credenciales ADMIN de aplicación en esta fase.

## Tokens del mockup

Fuente: `docs/MOCKUP/mockup.pdf`, páginas de inicio de sesión inspeccionadas visualmente.
La página de salud no aparece en el PDF y se deriva de su paleta y controles.

| Token              | Valor                                 | Criterio                       |
| ------------------ | ------------------------------------- | ------------------------------ |
| Marca              | `#1f3a60`                             | Azul oscuro de títulos         |
| Primario           | `#2b622a`                             | Verde de acciones              |
| Acento             | `#2e245b`                             | Morado del símbolo             |
| Fondo / superficie | `#f5f5f5` / `#ffffff`                 | Fondos claros                  |
| Texto / secundario | `#1a1a1a` / `#5f5f5f`                 | Texto principal y secundario   |
| Borde              | `#d1d1d1`                             | Separadores suaves             |
| Radios             | 16 px / 12 px / píldora               | Tarjetas / controles / botones |
| Sombra             | 0 8 px 24 px, negro 12 %              | Elevación de tarjetas          |
| Espaciado          | Base 4 px; campo 16 px, sección 32 px | Ritmo aproximado del PDF       |
| Tipografía         | Trebuchet MS, Arial, sans-serif       | Aproximación de sistema        |

El PDF exporta el nombre de fuente como `unknown`; no se puede asegurar una familia exacta.
Paleta y medidas son aproximaciones visuales documentadas, ajustadas para texto legible.
Todos los valores se concentran en `frontend/src/styles/tokens/index.ts` y Tailwind los consume.

## FASE 1 — Base de datos completa

- 53 tablas de negocio en V001–V012; V000 se conserva sin cambiar su checksum. La documentación
  de FASE 0 anterior es histórica y se complementa con estas decisiones.
- Auditoría común mediante IDs FK a USUARIOS; NULL representa instalación/proceso del sistema.
  Fecha de creación y triggers de modificación usan explícitamente America/Guatemala.
- BITACORA_AUDITORIA es inmutable; las correcciones crean nuevos eventos. Los servicios posteriores
  escribirán cambios depurados dentro de la misma transacción de negocio.
- Salario y horario provienen de historiales con vigencia; no se duplican en EMPLEADOS. La nómina
  versiona cálculos y conserva banderas, parámetros, datos del empleado y proyección ISR.
- Se añaden bancos, centros de trabajo, configuración de empresa, deducciones ISR, aplicaciones de
  descuento, detalle de prestación y filas de importación para cubrir los flujos sin campos libres.
- FKs compuestos impiden mezclar departamento/puesto, empleados, salarios, periodos y documentos.
  UNIQUE condicionales evitan colisiones indeseadas de claves compuestas con NULL en Oracle.
- La lista blanca inicial de filtros vive en db/filtros.json; db:verify inspecciona índices reales
  de cada campo y de la totalidad de columnas de cada FK.
- Seeds aditivos con MERGE, una transacción y binds para credenciales; no sobrescriben ediciones ni
  restablecen contraseñas. El usuario ADMIN existente con otro rol causa rollback sin elevación.
- argon2 se fija a la rama 0.44 para Node 20. La rama 0.45
  [dejó de soportar Node 20](https://github.com/ranisalt/node-argon2/releases/tag/v0.45.0).
- El calendario 2026 guarda descanso efectivo 29/06 y conmemoración 30/06, dos medios días desde
  las 12:00 y el feriado capitalino separado por localidad. Las fuentes oficiales están en ERD.md.
- Validaciones que consultan otras filas, fechas actuales y permisos se implementarán en servicios
  de fases posteriores, con bloqueos/transacciones. La fase 1 no agrega autenticación ni cálculos.
- Prueba de aceptación reproducible con esquema N2TEST_* aislado: verifica DDL, seeds, índices,
  restricciones y rollback; se elimina al finalizar y conserva el esquema de aplicación.
