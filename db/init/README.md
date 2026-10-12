# Inicialización de Oracle

La imagen crea el usuario de aplicación con `APP_USER` y `APP_USER_PASSWORD` en XEPDB1.
Este directorio queda reservado para configuración administrativa de primera inicialización.
Las migraciones del esquema se ejecutan desde la API, con el usuario de aplicación.
Los scripts de esta carpeta solo se ejecutarían al crear un volumen nuevo.
