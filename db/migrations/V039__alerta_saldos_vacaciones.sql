-- Umbral operativo versionado; los saldos y el kardex permanecen intactos.
INSERT INTO PARAMETROS_LEGALES (NOMBRE,CLAVE_INTERNA,VALOR,UNIDAD,VIGENTE_DESDE,FUNDAMENTO,MOTIVO)
SELECT 'Alerta de días disponibles de vacaciones','VACACIONES_ALERTA_DIAS',15,'DIAS',DATE '1900-01-01','AGENTS.md v1.2 C5','Umbral inicial para planificar el descanso de los empleados'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA='VACACIONES_ALERTA_DIAS');
/
