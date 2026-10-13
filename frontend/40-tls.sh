#!/bin/sh
set -eu
# Clave local generada por instalación, nunca incluida en la imagen o el repositorio.
if [ ! -s /etc/nginx/tls/localhost.key ] || [ ! -s /etc/nginx/tls/localhost.crt ]; then
  umask 077
  mkdir -p /etc/nginx/tls
  openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 365 \
    -keyout /etc/nginx/tls/localhost.key -out /etc/nginx/tls/localhost.crt \
    -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' 2>/dev/null
fi
