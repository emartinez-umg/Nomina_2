-- Credencial SINTÉTICA, pública y exclusiva de esta instalación. No procede de la fuente.
-- Usuario: admin.inicial / contraseña temporal: Nomina2!Temporal2026
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF SQLBLANKLINES ON
DECLARE
  N NUMBER;
BEGIN
  SELECT COUNT(*) INTO N FROM USUARIOS U JOIN ROLES R ON R.ID_ROL=U.ID_ROL
  WHERE U.USUARIO='admin.inicial' AND (R.CODIGO<>'ADMIN' OR U.CORREO<>'admin@example.invalid');
  IF N>0 THEN RAISE_APPLICATION_ERROR(-20090,'El usuario inicial ya existe con otra identidad; no se modificarán sus permisos.'); END IF;
END;
/
MERGE INTO USUARIOS D
USING (SELECT ID_ROL FROM ROLES WHERE CODIGO='ADMIN') O
ON (D.USUARIO='admin.inicial')
WHEN NOT MATCHED THEN INSERT (ID_ROL,USUARIO,CORREO,CONTRASENA_HASH,CAMBIO_OBLIGATORIO)
VALUES (O.ID_ROL,'admin.inicial','admin@example.invalid','$argon2id$v=19$m=65536,t=3,p=1$EwyKpSe671kspxLsXYnI6g$44JhgBJvhNZ1qaCaDBxpU0i7fFPrVBvayWADAYSwDpg',1);
COMMIT;
