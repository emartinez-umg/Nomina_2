-- R3-9: rangos mensuales generales y consultas por vendedor/equipo.
-- Se conserva el libro mensual (incluida la migración de orígenes v0) sin cambios de datos.
CREATE INDEX IX_NOV_COM_MES ON NOVEDADES_MENSUALES(TIPO,ACTIVO,AUTORIZACION,MES,ID_EMPLEADO,ESTADO,MONTO);
/
CREATE INDEX IX_NOV_COM_EMP_MES ON NOVEDADES_MENSUALES(ID_EMPLEADO,TIPO,ACTIVO,AUTORIZACION,MES,ESTADO,MONTO);
/
