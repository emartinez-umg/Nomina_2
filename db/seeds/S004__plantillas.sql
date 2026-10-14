-- Instalación aditiva: no sobrescribe ajustes existentes.

MERGE INTO PLANTILLAS_DOCUMENTO destino
USING (SELECT (SELECT ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'CONSTANCIA_LABORAL') ID_TIPO_SOLICITUD, 'CONSTANCIA_LABORAL' CODIGO, 1 VERSION, 'Constancia laboral' NOMBRE, 'CONSTANCIA LABORAL
{{empresa}}, NIT {{nit_empresa}}, hace constar que {{nombre}}, DPI {{dpi}}, labora desde {{fecha_ingreso}} como {{puesto}} en {{departamento}}, con salario base mensual de {{salario}}.
Se extiende en {{fecha_emision}}.
{{representante}}
{{direccion_empresa}}' CONTENIDO, '["nombre", "dpi", "nit", "puesto", "departamento", "fecha_ingreso", "salario", "afiliacion_igss", "empresa", "nit_empresa", "direccion_empresa", "representante", "fecha_emision"]' VARIABLES_PERMITIDAS, DATE '2026-01-01' VIGENTE_DESDE FROM DUAL) origen
ON (destino.CODIGO = origen.CODIGO AND destino.VERSION = origen.VERSION)
WHEN NOT MATCHED THEN INSERT (ID_TIPO_SOLICITUD, CODIGO, VERSION, NOMBRE, CONTENIDO, VARIABLES_PERMITIDAS, VIGENTE_DESDE)
VALUES (origen.ID_TIPO_SOLICITUD, origen.CODIGO, origen.VERSION, origen.NOMBRE, origen.CONTENIDO, origen.VARIABLES_PERMITIDAS, origen.VIGENTE_DESDE);
/

MERGE INTO PLANTILLAS_DOCUMENTO destino
USING (SELECT (SELECT ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'CERTIFICADO_IGSS') ID_TIPO_SOLICITUD, 'CERTIFICADO_IGSS' CODIGO, 1 VERSION, 'Certificado de relación laboral para gestión ante IGSS' NOMBRE, 'CERTIFICADO PARA GESTIÓN ANTE IGSS
{{empresa}}, NIT {{nit_empresa}}, certifica la relación laboral de {{nombre}}, DPI {{dpi}}, afiliación IGSS {{afiliacion_igss}}, desde {{fecha_ingreso}}, puesto {{puesto}}.
Emitido el {{fecha_emision}} por {{representante}}.
Este documento empresarial no sustituye los formularios oficiales del IGSS.' CONTENIDO, '["nombre", "dpi", "nit", "puesto", "departamento", "fecha_ingreso", "salario", "afiliacion_igss", "empresa", "nit_empresa", "direccion_empresa", "representante", "fecha_emision"]' VARIABLES_PERMITIDAS, DATE '2026-01-01' VIGENTE_DESDE FROM DUAL) origen
ON (destino.CODIGO = origen.CODIGO AND destino.VERSION = origen.VERSION)
WHEN NOT MATCHED THEN INSERT (ID_TIPO_SOLICITUD, CODIGO, VERSION, NOMBRE, CONTENIDO, VARIABLES_PERMITIDAS, VIGENTE_DESDE)
VALUES (origen.ID_TIPO_SOLICITUD, origen.CODIGO, origen.VERSION, origen.NOMBRE, origen.CONTENIDO, origen.VARIABLES_PERMITIDAS, origen.VIGENTE_DESDE);
/

MERGE INTO PLANTILLAS_DOCUMENTO destino
USING (SELECT (SELECT ID_TIPO_SOLICITUD FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO) = 'CONSTANCIA_INTECAP') ID_TIPO_SOLICITUD, 'CONSTANCIA_INTECAP' CODIGO, 1 VERSION, 'Constancia para gestión ante INTECAP' NOMBRE, 'CONSTANCIA PARA INTECAP
{{empresa}}, NIT {{nit_empresa}}, hace constar que {{nombre}}, DPI {{dpi}}, labora en el puesto {{puesto}} desde {{fecha_ingreso}}.
Se extiende a solicitud de la persona interesada para sus gestiones ante INTECAP el {{fecha_emision}}.
{{representante}}' CONTENIDO, '["nombre", "dpi", "nit", "puesto", "departamento", "fecha_ingreso", "salario", "afiliacion_igss", "empresa", "nit_empresa", "direccion_empresa", "representante", "fecha_emision"]' VARIABLES_PERMITIDAS, DATE '2026-01-01' VIGENTE_DESDE FROM DUAL) origen
ON (destino.CODIGO = origen.CODIGO AND destino.VERSION = origen.VERSION)
WHEN NOT MATCHED THEN INSERT (ID_TIPO_SOLICITUD, CODIGO, VERSION, NOMBRE, CONTENIDO, VARIABLES_PERMITIDAS, VIGENTE_DESDE)
VALUES (origen.ID_TIPO_SOLICITUD, origen.CODIGO, origen.VERSION, origen.NOMBRE, origen.CONTENIDO, origen.VARIABLES_PERMITIDAS, origen.VIGENTE_DESDE);
/
