-- Ejecutar conectado al usuario de aplicación de un esquema VACÍO en XEPDB1.
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF SQLBLANKLINES ON
@@01_esquema.sql
@@02_catalogos.sql
@@03_admin_inicial.sql
@@04_versiones.sql
@@05_verificar.sql
