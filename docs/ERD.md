# Esquema técnico — FASE 0

Solo hay infraestructura. El modelo de nómina se definirá en una fase posterior.
Ambas tablas pertenecen al usuario dedicado de aplicación en XEPDB1 y no tienen relación entre sí.

```mermaid
erDiagram
    VERSION_ESQUEMA {
        NUMBER ID_VERSION_ESQUEMA PK "Identity"
        NUMBER VERSION UK "0 para V000"
        VARCHAR2 ARCHIVO
        CHAR CHECKSUM "SHA-256"
        VARCHAR2 ESTADO "APLICANDO, APLICADA, FALLIDA"
        TIMESTAMP FECHA_CREACION
        TIMESTAMP FECHA_APLICACION
    }
    PRUEBA_INFRAESTRUCTURA {
        NUMBER ID_PRUEBA_INFRAESTRUCTURA PK "Identity"
        VARCHAR2 DESCRIPCION UK
        VARCHAR2 CREADO_POR
        DATE FECHA_CREACION
        VARCHAR2 MODIFICADO_POR
        DATE FECHA_MODIFICACION
        NUMBER ACTIVO "0 o 1"
    }
```

`VERSION_ESQUEMA` es metadata técnica administrada por el runner. Sus fechas incluyen zona horaria
y no usa eliminación lógica: el historial es permanente. La tabla de prueba sigue las convenciones
de auditoría del proyecto, con `CREADO_POR` como usuario Oracle durante esta fase sin autenticación.
