-- Copia histórica exclusiva de RRHH; las respuestas del empleado no seleccionan esta columna.
ALTER TABLE VACACIONES_SOLICITUDES ADD (COLISIONES_APROBACION CLOB)
/
ALTER TABLE VACACIONES_SOLICITUDES ADD CONSTRAINT CK_VAC_COLISIONES_JSON CHECK (COLISIONES_APROBACION IS JSON)
/
-- La consulta global reutiliza IX_VAC_TABLERO (V035): actividad, estado, fin, inicio, empleado.
-- Empleado/rango para las búsquedas del equipo.
CREATE INDEX IX_VAC_EQUIPO_RANGO ON VACACIONES_SOLICITUDES (ID_EMPLEADO, ACTIVO, ESTADO, FECHA_FIN, FECHA_INICIO)
/
