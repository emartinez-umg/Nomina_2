DECLARE
  TYPE mapa_num IS TABLE OF NUMBER INDEX BY VARCHAR2(300);
  TYPE mapa_texto IS TABLE OF VARCHAR2(4000) INDEX BY VARCHAR2(300);
  v_ids mapa_num;
  v_nuevas mapa_num;
  v_propias mapa_num;
  v_pk mapa_texto;
  v_tablas mapa_texto;
  v_claves mapa_texto;
  v_huellas mapa_texto;
  v_acciones mapa_texto;
  v_actor NUMBER;
  v_rol NUMBER;
  v_n NUMBER;
  v_clave VARCHAR2(300);
  v_tabla VARCHAR2(128);
  v_hash VARCHAR2(64);
  v_json VARCHAR2(4000);
  v_contexto VARCHAR2(300):='preflight';
  v_municipio VARCHAR2(200);
  v_departamento VARCHAR2(200);
  v_conjunto CONSTANT VARCHAR2(60):='nomina2-demo-v1';

  PROCEDURE exigir(p_ok BOOLEAN,p_mensaje VARCHAR2) IS
  BEGIN
    IF p_ok IS NULL OR NOT p_ok THEN RAISE_APPLICATION_ERROR(-20090,p_mensaje); END IF;
  END;
  FUNCTION cantidad(p_sql VARCHAR2) RETURN NUMBER IS
    n NUMBER;
  BEGIN EXECUTE IMMEDIATE p_sql INTO n; RETURN n; END;
  FUNCTION parametro(p_clave VARCHAR2) RETURN NUMBER IS
    n NUMBER;
  BEGIN
    SELECT VALOR INTO n FROM PARAMETROS_LEGALES WHERE CLAVE_INTERNA=p_clave AND ACTIVO=1
      AND (p_clave NOT LIKE 'JORNADA_%' OR UNIDAD='HORAS')
      AND VIGENTE_DESDE<=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE))
      AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)));
    RETURN n;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE_APPLICATION_ERROR(-20090,'Falta una vigencia única del parámetro '||p_clave);
  END;
  FUNCTION huella(p_tabla VARCHAR2,p_id NUMBER) RETURN VARCHAR2 IS
    h VARCHAR2(64);
  BEGIN
    exigir(v_pk.EXISTS(p_tabla),'Tabla fuera de la lista permitida.');
    EXECUTE IMMEDIATE 'SELECT LOWER(RAWTOHEX(STANDARD_HASH(JSON_OBJECT(T.* RETURNING VARCHAR2(4000)),''SHA256''))) FROM '||p_tabla||' T WHERE '||v_pk(p_tabla)||'=:id' INTO h USING p_id;
    RETURN h;
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN NULL;
  END;
  FUNCTION propia(p_tabla VARCHAR2,p_clave VARCHAR2) RETURN BOOLEAN IS
  BEGIN RETURN v_propias.EXISTS(p_tabla||':'||p_clave); END;
  PROCEDURE ubicacion(p_dep VARCHAR2,p_mun VARCHAR2) IS
  BEGIN
    SELECT M.ID_MUNICIPIO_GT,D.ID_DEPARTAMENTO_GT,M.NOMBRE,D.NOMBRE
      INTO v_ids('municipio-gt'),v_ids('departamento-gt'),v_municipio,v_departamento
      FROM MUNICIPIOS_GT M JOIN DEPARTAMENTOS_GT D ON D.ID_DEPARTAMENTO_GT=M.ID_DEPARTAMENTO_GT
      WHERE M.CODIGO_INE=p_mun AND D.CODIGO_INE=p_dep AND M.ACTIVO=1 AND D.ACTIVO=1;
  EXCEPTION WHEN NO_DATA_FOUND THEN RAISE_APPLICATION_ERROR(-20090,'Falta una ubicación activa del catálogo INE.');
  END;
  PROCEDURE contrato(p_clave VARCHAR2,p_nombre VARCHAR2,p_fin NUMBER) IS
    fin NUMBER;
  BEGIN
    SELECT ID_TIPO_CONTRATO,REQUIERE_FECHA_FIN INTO v_ids('contrato'),fin FROM TIPOS_CONTRATO
      WHERE (CODIGO_ANTERIOR=p_clave OR NOMBRE_NORMALIZADO=N2_NOMBRE_NORMALIZADO(p_nombre)) AND ACTIVO=1;
    exigir(fin=p_fin,'El contrato del destino requiere otra regla de fecha fin.');
  END;

  PROCEDURE guardar(p_tabla VARCHAR2,p_pk VARCHAR2,p_clave VARCHAR2,p_datos CLOB,p_natural VARCHAR2 DEFAULT NULL,p_padre VARCHAR2 DEFAULT NULL) IS
    j JSON_OBJECT_T:=JSON_OBJECT_T.parse(p_datos);
    campos JSON_KEY_LIST;
    elemento JSON_ELEMENT_T;
    objeto JSON_OBJECT_T;
    k VARCHAR2(300):=p_tabla||':'||p_clave;
    col VARCHAR2(128);
    tipo VARCHAR2(128);
    columnas VARCHAR2(4000);
    valores VARCHAR2(4000);
    texto VARCHAR2(4000);
    numero NUMBER;
    identificador NUMBER;
    existente NUMBER;
    activo NUMBER;
    padre NUMBER;
    municipal NUMBER;
    c INTEGER;
    n INTEGER;
    fecha DATE;
    base VARCHAR2(100);
    sufijo NUMBER;
  BEGIN
    v_contexto:=k;
    exigir(v_pk.EXISTS(p_tabla) AND v_pk(p_tabla)=p_pk,'Tabla o clave primaria no permitida.');
    IF p_padre IS NOT NULL AND NOT v_nuevas.EXISTS(p_padre) THEN RETURN; END IF;
    IF p_natural IS NOT NULL THEN
      exigir(p_natural IN ('NOMBRE','CORREO'),'Clave natural no permitida.');
      texto:=j.get_string(p_natural);
      IF p_natural='NOMBRE' THEN
        EXECUTE IMMEDIATE 'SELECT MAX('||p_pk||'),MAX(ACTIVO) FROM '||p_tabla||' WHERE NOMBRE_NORMALIZADO=N2_NOMBRE_NORMALIZADO(:nombre)' INTO existente,activo USING texto;
      ELSE
        SELECT MAX(ID_EMPLEADO),MAX(ACTIVO) INTO existente,activo FROM EMPLEADOS WHERE CORREO=texto;
      END IF;
      IF existente IS NOT NULL THEN
        IF p_natural='CORREO' THEN
          exigir(propia(p_tabla,p_clave) AND v_propias(k)=existente,'El correo existe sin propiedad demo; se conservaron los datos ajenos.');
          SELECT ID_USUARIO INTO numero FROM EMPLEADOS WHERE ID_EMPLEADO=existente;
          exigir(propia('USUARIOS',p_clave) AND numero=v_propias('USUARIOS:'||p_clave),'El vínculo de usuario fue cambiado.');
        ELSE
          exigir(activo=1,'Un catálogo del conjunto existe inactivo.');
          IF p_tabla='PUESTOS' THEN
            objeto:=j.get_object('ID_DEPARTAMENTO');
            SELECT ID_DEPARTAMENTO INTO padre FROM PUESTOS WHERE ID_PUESTO=existente;
            exigir(padre=v_ids(objeto.get_string('ref')),'El puesto existe en otro departamento.');
          ELSIF p_tabla='CENTROS_TRABAJO' THEN
            SELECT ID_DEPARTAMENTO_GT,ID_MUNICIPIO_GT INTO padre,municipal FROM CENTROS_TRABAJO WHERE ID_CENTRO_TRABAJO=existente;
            exigir(padre=v_ids('departamento-gt') AND municipal=v_ids('municipio-gt'),'El centro existe en otra ubicación.');
          END IF;
        END IF;
        v_ids(k):=existente; RETURN;
      END IF;
    END IF;
    IF propia(p_tabla,p_clave) THEN
      exigir(huella(p_tabla,v_propias(k)) IS NOT NULL,'Falta una fila demo; revisa la historia parcial.');
      v_ids(k):=v_propias(k); RETURN;
    END IF;
    j.put('CREADO_POR',v_actor);
    campos:=j.get_keys;
    c:=DBMS_SQL.OPEN_CURSOR;
    FOR i IN 1..campos.COUNT LOOP
      col:=DBMS_ASSERT.SIMPLE_SQL_NAME(campos(i));
      SELECT DATA_TYPE INTO tipo FROM USER_TAB_COLS WHERE TABLE_NAME=p_tabla AND COLUMN_NAME=col AND VIRTUAL_COLUMN='NO' AND IDENTITY_COLUMN='NO' AND HIDDEN_COLUMN='NO';
      IF i>1 THEN columnas:=columnas||',';valores:=valores||','; END IF;
      columnas:=columnas||col; valores:=valores||':b'||i;
    END LOOP;
    DBMS_SQL.PARSE(c,'INSERT INTO '||p_tabla||'('||columnas||') VALUES('||valores||') RETURNING '||p_pk||' INTO :resultado',DBMS_SQL.NATIVE);
    FOR i IN 1..campos.COUNT LOOP
      col:=campos(i); elemento:=j.get(col); texto:=NULL; numero:=NULL; fecha:=NULL;
      SELECT DATA_TYPE INTO tipo FROM USER_TAB_COLUMNS WHERE TABLE_NAME=p_tabla AND COLUMN_NAME=col;
      IF elemento.is_object THEN
        objeto:=TREAT(elemento AS JSON_OBJECT_T);
        IF objeto.has('ref') THEN numero:=v_ids(objeto.get_string('ref'));
        ELSIF objeto.has('fecha') THEN fecha:=TO_DATE(objeto.get_string('fecha'),'YYYY-MM-DD');
        ELSIF objeto.has('mesActual') THEN fecha:=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE),'MM');
        ELSIF objeto.has('localidad') THEN texto:=CASE WHEN v_municipio='Guatemala' THEN 'GUATEMALA_CIUDAD' ELSE REPLACE(TRANSLATE(UPPER(v_municipio),'ÁÉÍÓÚÜÑ','AEIOUUN'),' ','_') END;
        ELSIF objeto.has('direccion') THEN texto:=objeto.get_string('direccion')||CASE WHEN objeto.get_number('zona') IS NOT NULL THEN ', zona '||objeto.get_number('zona') END||', '||v_municipio||', '||v_departamento;
        ELSIF objeto.has('usuario') THEN
          base:=objeto.get_string('usuario'); texto:=base;sufijo:=2;
          LOOP SELECT COUNT(*) INTO n FROM USUARIOS WHERE USUARIO=texto; EXIT WHEN n=0;texto:=base||sufijo;sufijo:=sufijo+1;END LOOP;
        ELSIF objeto.has('rol') THEN texto:=objeto.get_string('rol');SELECT ID_ROL INTO numero FROM ROLES WHERE CODIGO=texto AND ACTIVO=1;
        ELSIF objeto.has('tipoDescuento') THEN texto:=objeto.get_string('tipoDescuento');SELECT ID_TIPO_DESCUENTO INTO numero FROM TIPOS_DESCUENTO WHERE NVL(CODIGO_ANTERIOR,CODIGO)=texto AND ACTIVO=1;
        ELSIF objeto.has('tipoAusencia') THEN texto:=objeto.get_string('tipoAusencia');SELECT ID_TIPO_AUSENCIA INTO numero FROM TIPOS_AUSENCIA WHERE NVL(CODIGO_ANTERIOR,CODIGO)=texto AND ACTIVO=1;
        ELSIF objeto.has('tipoSolicitud') THEN texto:=objeto.get_string('tipoSolicitud');SELECT ID_TIPO_SOLICITUD INTO numero FROM TIPOS_SOLICITUD WHERE NVL(CODIGO_ANTERIOR,CODIGO)=texto AND ACTIVO=1;
        ELSIF objeto.has('comision') THEN texto:='COMISION:'||v_ids(objeto.get_string('empleado'))||':'||objeto.get_string('mes')||':'||objeto.get_string('comision');
        ELSIF objeto.has('mensajeSolicitud') THEN texto:='Solicitud '||v_ids(objeto.get_string('mensajeSolicitud'))||': aprobada.';
        ELSIF objeto.has('eventoSolicitud') THEN texto:='SOLICITUD:'||v_ids(objeto.get_string('eventoSolicitud'))||':APROBADA';
        ELSIF objeto.has('ausencia') THEN
          identificador:=v_ids(objeto.get_string('ausencia'));
          SELECT CASE WHEN T.EFECTO='SIN_GOCE' THEN ROUND(SUM(H.SALARIO_BASE/30),2) ELSE 0 END INTO numero
            FROM AUSENCIAS A JOIN TIPOS_AUSENCIA T ON T.ID_TIPO_AUSENCIA=A.ID_TIPO_AUSENCIA
            JOIN HISTORIAL_SALARIAL H ON H.ID_EMPLEADO=A.ID_EMPLEADO AND H.ACTIVO=1
            JOIN (SELECT LEVEL-1 DIA FROM DUAL CONNECT BY LEVEL<=366) D ON A.FECHA_INICIO+D.DIA<=A.FECHA_FIN
              AND H.VIGENTE_DESDE<=A.FECHA_INICIO+D.DIA AND (H.VIGENTE_HASTA IS NULL OR H.VIGENTE_HASTA>=A.FECHA_INICIO+D.DIA)
            WHERE A.ID_AUSENCIA=identificador GROUP BY T.EFECTO;
        ELSE exigir(FALSE,'Referencia JSON no reconocida.'); END IF;
      ELSIF NOT elemento.is_null THEN
        IF tipo='NUMBER' THEN numero:=TO_NUMBER(j.get_string(col),'9999999999D999999','NLS_NUMERIC_CHARACTERS=''.,'''); ELSE texto:=j.get_string(col); END IF;
      END IF;
      IF tipo='NUMBER' THEN DBMS_SQL.BIND_VARIABLE(c,':b'||i,numero);
      ELSIF tipo='DATE' THEN DBMS_SQL.BIND_VARIABLE(c,':b'||i,fecha);
      ELSE DBMS_SQL.BIND_VARIABLE(c,':b'||i,texto); END IF;
    END LOOP;
    DBMS_SQL.BIND_VARIABLE(c,':resultado',identificador);
    n:=DBMS_SQL.EXECUTE(c);DBMS_SQL.VARIABLE_VALUE(c,':resultado',identificador);DBMS_SQL.CLOSE_CURSOR(c);
    v_ids(k):=identificador;v_nuevas(k):=identificador;v_tablas(k):=p_tabla;v_claves(k):=p_clave;v_acciones(k):='SEED_DEMO_CREAR';
  EXCEPTION WHEN OTHERS THEN IF c IS NOT NULL AND DBMS_SQL.IS_OPEN(c) THEN DBMS_SQL.CLOSE_CURSOR(c); END IF;RAISE;
  END;

  PROCEDURE validar_horario(p_id NUMBER,p_bloques CLOB) IS
    a JSON_ARRAY_T:=JSON_ARRAY_T.parse(p_bloques);
    b JSON_OBJECT_T;
    dias JSON_ARRAY_T;
    n NUMBER;
    esperado NUMBER:=0;
    entrada NUMBER; salida NUMBER;cruza NUMBER; descanso NUMBER;dia NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM HORARIO_BLOQUES WHERE ID_HORARIO=p_id;
    exigir(n=a.get_size,'El horario existe con otros bloques.');
    FOR i IN 0..a.get_size-1 LOOP
      b:=TREAT(a.get(i) AS JSON_OBJECT_T);dias:=b.get_array('dias');
      entrada:=TO_NUMBER(SUBSTR(b.get_string('entrada'),1,2))*60+TO_NUMBER(SUBSTR(b.get_string('entrada'),4,2));
      salida:=TO_NUMBER(SUBSTR(b.get_string('salida'),1,2))*60+TO_NUMBER(SUBSTR(b.get_string('salida'),4,2));
      cruza:=CASE WHEN b.get_boolean('cruzaMedianoche') THEN 1 ELSE 0 END;descanso:=b.get_number('minutosDescanso');
      FOR j IN 0..dias.get_size-1 LOOP
        dia:=dias.get_number(j);
        SELECT COUNT(*) INTO n FROM HORARIO_BLOQUES H JOIN HORARIO_BLOQUE_DIAS D ON D.ID_HORARIO_BLOQUE=H.ID_HORARIO_BLOQUE
          WHERE H.ID_HORARIO=p_id AND H.MINUTO_ENTRADA=entrada AND H.MINUTO_SALIDA=salida AND H.CRUZA_MEDIANOCHE=cruza AND H.MINUTOS_DESCANSO=descanso AND D.DIA_SEMANA=dia;
        exigir(n=1,'El horario existe con otros días u horas.'); esperado:=esperado+1;
      END LOOP;
    END LOOP;
    SELECT COUNT(*) INTO n FROM HORARIO_BLOQUES H JOIN HORARIO_BLOQUE_DIAS D ON D.ID_HORARIO_BLOQUE=H.ID_HORARIO_BLOQUE WHERE H.ID_HORARIO=p_id;
    exigir(n=esperado,'El horario tiene días adicionales.');
  END;
  PROCEDURE validar_parqueo(p_empleado NUMBER,p_vehiculo VARCHAR2) IS
    n NUMBER;
    hoy DATE:=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE));
  BEGIN
    SELECT COUNT(*) INTO n FROM EMPLEADOS WHERE ID_EMPLEADO=p_empleado AND ACTIVO=1 AND ESTADO='ACTIVO' AND FECHA_INGRESO<=hoy AND (FECHA_EGRESO IS NULL OR FECHA_EGRESO>=hoy);
    exigir(n=1,'El parqueo requiere una relación laboral activa.');
    SELECT COUNT(*) INTO n FROM PARQUEO_SUSCRIPCIONES WHERE ID_EMPLEADO=p_empleado AND ACTIVO=1 AND (MES_FIN IS NULL OR MES_FIN>=TRUNC(hoy,'MM'));
    exigir(n=0,'El empleado ya tiene parqueo durante este mes.');
    SELECT COUNT(*) INTO n FROM PARQUEO_TARIFAS WHERE VEHICULO=p_vehiculo AND ACTIVO=1 AND VIGENTE_DESDE<=TRUNC(hoy,'MM') AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=TRUNC(hoy,'MM'));
    exigir(n=1,'Configura una tarifa mensual vigente única para el vehículo.');
  END;
  PROCEDURE ampliar_salario(p_empleado NUMBER,p_historia CLOB) IS
    a JSON_ARRAY_T:=JSON_ARRAY_T.parse(p_historia);
    b JSON_OBJECT_T;
    j JSON_OBJECT_T;
    identificador NUMBER;
    k VARCHAR2(300);
    desde DATE;
    numero NUMBER;
    existe BOOLEAN:=FALSE;
  BEGIN
    SELECT ID_HISTORIAL_SALARIAL INTO identificador FROM HISTORIAL_SALARIAL WHERE ID_EMPLEADO=p_empleado AND ACTIVO=1;
    k:=v_ids.FIRST;
    WHILE k IS NOT NULL LOOP
      IF v_tablas.EXISTS(k) AND v_tablas(k)='HISTORIAL_SALARIAL' AND v_ids(k)=identificador THEN existe:=TRUE;EXIT;END IF;
      k:=v_ids.NEXT(k);
    END LOOP;
    exigir(existe,'El historial no pertenece al conjunto demo.');
    IF NOT v_nuevas.EXISTS(k) THEN
      exigir(huella('HISTORIAL_SALARIAL',identificador)=v_huellas(k),'El historial fue modificado; se conservó.');
      v_nuevas(k):=identificador;v_acciones(k):='SEED_DEMO_ACTUALIZAR';
    END IF;
    b:=TREAT(a.get(0) AS JSON_OBJECT_T);
    numero:=TO_NUMBER(b.get_string('salarioBase'),'9999999999D99','NLS_NUMERIC_CHARACTERS=''.,''');
    UPDATE HISTORIAL_SALARIAL SET SALARIO_BASE=numero,MODIFICADO_POR=v_actor WHERE ID_HISTORIAL_SALARIAL=identificador;
    FOR i IN 1..a.get_size-1 LOOP
      b:=TREAT(a.get(i) AS JSON_OBJECT_T);desde:=TO_DATE(b.get_string('vigenteDesde'),'YYYY-MM-DD');
      exigir(desde<=TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Guatemala' AS DATE)),'La vigencia salarial es futura.');
      UPDATE HISTORIAL_SALARIAL SET VIGENTE_HASTA=desde-1,MODIFICADO_POR=v_actor WHERE ID_EMPLEADO=p_empleado AND ACTIVO=1 AND VIGENTE_HASTA IS NULL;
      j:=JSON_OBJECT_T();j.put('ID_EMPLEADO',p_empleado);j.put('SALARIO_BASE',b.get_string('salarioBase'));
      j.put('VIGENTE_DESDE',JSON_OBJECT_T.parse('{"fecha":"'||b.get_string('vigenteDesde')||'"}'));j.put('MOTIVO',b.get_string('motivo'));
      guardar('HISTORIAL_SALARIAL','ID_HISTORIAL_SALARIAL','historia:'||p_empleado||':'||i,j.to_clob);
    END LOOP;
  END;
BEGIN
  -- TABLAS_PERMITIDAS
  exigir(USER NOT IN ('SYS','SYSTEM'),'Conecta con el usuario del esquema de aplicación.');
  -- PREFLIGHT
  SELECT COUNT(*) INTO v_n FROM USER_OBJECTS WHERE STATUS<>'VALID';exigir(v_n=0,'Hay objetos Oracle inválidos.');
  SELECT COUNT(*) INTO v_n FROM USER_CONSTRAINTS WHERE STATUS<>'ENABLED' OR VALIDATED<>'VALIDATED';exigir(v_n=0,'Hay restricciones deshabilitadas o sin validar.');
  SELECT COUNT(*) INTO v_n FROM DEPARTAMENTOS_GT;exigir(v_n=22,'Falta el catálogo oficial de 22 departamentos.');
  SELECT COUNT(*) INTO v_n FROM MUNICIPIOS_GT;exigir(v_n=340,'Falta el catálogo oficial de 340 municipios.');
  SELECT ID_ROL INTO v_rol FROM ROLES WHERE CODIGO='ADMIN' AND ACTIVO=1 FOR UPDATE;
  SELECT MIN(ID_USUARIO) INTO v_actor FROM USUARIOS WHERE ID_ROL=v_rol AND ACTIVO=1;exigir(v_actor IS NOT NULL,'Falta un ADMIN activo.');
  v_ids('actor'):=v_actor;
  LOCK TABLE PERIODOS_NOMINA IN SHARE MODE;
  -- Reconstruye propiedad desde la bitácora; un dominio de correo nunca acredita propiedad.
  FOR e IN (SELECT ENTIDAD,ID_ENTIDAD,ACCION,JSON_VALUE(VALORES_NUEVOS,'$.clave') CLAVE,JSON_VALUE(VALORES_NUEVOS,'$.huella') HUELLA
    FROM BITACORA_AUDITORIA WHERE ACCION IN ('SEED_DEMO_CREAR','SEED_DEMO_ACTUALIZAR','SEED_DEMO_BORRAR') AND JSON_VALUE(VALORES_NUEVOS,'$.conjunto')=v_conjunto ORDER BY ID_BITACORA_AUDITORIA) LOOP
    v_clave:=e.ENTIDAD||':'||e.CLAVE;
    IF e.ACCION='SEED_DEMO_BORRAR' THEN v_propias.DELETE(v_clave);v_ids.DELETE(v_clave);v_tablas.DELETE(v_clave);v_claves.DELETE(v_clave);v_huellas.DELETE(v_clave);
    ELSE v_propias(v_clave):=e.ID_ENTIDAD;v_ids(v_clave):=e.ID_ENTIDAD;v_tablas(v_clave):=e.ENTIDAD;v_claves(v_clave):=e.CLAVE;v_huellas(v_clave):=e.HUELLA;END IF;
  END LOOP;
  -- INSTRUCCIONES
  v_clave:=v_nuevas.FIRST;
  WHILE v_clave IS NOT NULL LOOP
    v_tabla:=v_tablas(v_clave);v_hash:=huella(v_tabla,v_nuevas(v_clave));exigir(v_hash IS NOT NULL,'No se pudo registrar una fila del conjunto.');
    SELECT JSON_OBJECT('conjunto' VALUE v_conjunto,'clave' VALUE v_claves(v_clave),'huella' VALUE v_hash) INTO v_json FROM DUAL;
    INSERT INTO BITACORA_AUDITORIA(ID_USUARIO,ID_ROL,ROL_CODIGO,ACCION,ENTIDAD,ID_ENTIDAD,VALORES_NUEVOS,MOTIVO,IP,CREADO_POR)
      VALUES(v_actor,v_rol,'ADMIN',v_acciones(v_clave),v_tabla,v_nuevas(v_clave),v_json,'Registro de propiedad del conjunto demo, sin datos sensibles.','127.0.0.1',v_actor);
    v_clave:=v_nuevas.NEXT(v_clave);
  END LOOP;
  v_tabla:=v_pk.FIRST;
  WHILE v_tabla IS NOT NULL LOOP
    v_n:=cantidad('SELECT COUNT(*) FROM '||v_tabla);DBMS_OUTPUT.PUT_LINE(v_tabla||': '||v_n||' filas totales');v_tabla:=v_pk.NEXT(v_tabla);
  END LOOP;
  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Carga demo terminada. Los códigos fueron asignados por los triggers del sistema.');
EXCEPTION WHEN OTHERS THEN
  ROLLBACK;
  IF SQLCODE=-20090 THEN RAISE;END IF;
  RAISE_APPLICATION_ERROR(-20091,'Carga demo revertida. Código Oracle '||SQLCODE||' en '||v_contexto||'. Revisa esquema, unicidad y vigencias.');
END;
/
