# Seeds

Ejecutar `npm run db:seed` después de `npm run db:migrate`, o `npm run db:setup` para ambos.
Compose ejecuta ambos automáticamente antes de iniciar la API.

- S001: roles, contratos, descuentos, ausencias, solicitudes, deducciones ISR y conceptos versionados.
- S002: parámetros con vigencia 01/01/2026 y tramos ISR de referencia.
- S003: feriados 2026; 12 nacionales y Virgen de la Asunción solo en GUATEMALA_CIUDAD.
- S004: plantillas base de constancia laboral, gestión ante IGSS y constancia INTECAP.
- S005: concepto ISR_DEVOLUCION no afecto, utilizado al liquidar retenciones anuales en exceso.

Archivos confiables, ordenados por prefijo Snnn; cada sentencia termina con `/` aislado.
MERGE únicamente inserta claves ausentes. No modificar estos archivos para cambiar datos operativos:
crear nuevas vigencias/versiones mediante servicios posteriores y auditoría.
El lote completo DML hace commit/rollback explícito desde `seeds.ts`.

El ADMIN se crea desde `ADMIN_USER`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` validados con Zod. Solo se
persiste argon2id (64 MiB, tres pasadas, un hilo) y se exige cambio inicial. La reejecución conserva
contraseña, correo, estado y cambio obligatorio existentes. Una colisión con otro rol falla sin promoverlo.
La cuenta inicial genera una entrada de bitácora sin secretos. CREADO_POR nulo identifica instalación.

No hay seeds ficticios de empleados, estructura, bancos o datos de la empresa. Los valores legales
son de referencia y deben validarse antes del uso real. Ver fuentes y supuestos en `docs/ERD.md`.

S006 carga 22 departamentos y 340 municipios oficiales del INE y propone coincidencias
únicas para localidades históricas. Repetible por código INE sin sobrescribir filas ni
confirmaciones de RH. Fuente, huella y reproducción en `db/data/ine/README.md`.
