#!/bin/bash
set -Eeuo pipefail
healthcheck.sh
# Oracle puede abrir XEPDB1 antes de terminar el alta APP_USER del primer arranque.
[[ "${APP_USER:-}" =~ ^[A-Za-z][A-Za-z0-9_]{0,29}$ ]] || exit 1
estado=$(sqlplus -s / as sysdba <<SQL
WHENEVER SQLERROR EXIT FAILURE
SET HEADING OFF FEEDBACK OFF PAGESIZE 0
ALTER SESSION SET CONTAINER = XEPDB1;
SELECT 'READY' FROM DBA_USERS U
WHERE U.USERNAME=UPPER('${APP_USER}') AND U.ACCOUNT_STATUS='OPEN'
AND (SELECT COUNT(*) FROM DBA_ROLE_PRIVS R WHERE R.GRANTEE=U.USERNAME AND R.GRANTED_ROLE IN ('CONNECT','RESOURCE'))=2;
EXIT;
SQL
)
[[ "$(echo "$estado" | tr -d '[:space:]')" == 'READY' ]]
