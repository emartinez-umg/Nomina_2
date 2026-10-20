-- Conservar la dirección compuesta y renombrar/ampliar el detalle sin copiar ni perder valores.
ALTER TABLE EMPLEADOS RENAME COLUMN DIRECCION TO DIRECCION_COMPLETA;
/
ALTER TABLE EMPLEADOS MODIFY DIRECCION_COMPLETA NULL;
/
ALTER TABLE EMPLEADOS DROP CONSTRAINT CK_EMPLEADOS_CASA;
/
ALTER TABLE EMPLEADOS RENAME COLUMN NUMERO_CASA TO DIRECCION;
/
ALTER TABLE EMPLEADOS MODIFY DIRECCION VARCHAR2(100 CHAR);
/
ALTER TABLE EMPLEADOS ADD CONSTRAINT CK_EMPLEADOS_DIRECCION CHECK (
 DIRECCION IS NULL OR (REGEXP_LIKE(DIRECCION,'^[[:alpha:][:digit:] .,#/°-]+$') AND REGEXP_LIKE(DIRECCION,'[[:alnum:]]'))
);
/
-- El salario vive en HISTORIAL_SALARIAL: no insertar una vigencia ficticia ni duplicar su estado.
-- Identidad de sistema versionada; solo ADMIN puede modificarla desde Parámetros legales.
INSERT INTO PARAMETROS_LEGALES (NOMBRE,CLAVE_INTERNA,VALOR,UNIDAD,VIGENTE_DESDE,FUNDAMENTO,MOTIVO)
VALUES ('Validar dígito NIT','VALIDAR_DIGITO_NIT',0,'CANTIDAD',DATE '2000-01-01','0 desactiva y 1 activa módulo 11 del NIT del empleado. Solo ADMIN.','Configuración inicial R2-6: verificación desactivada');
/
