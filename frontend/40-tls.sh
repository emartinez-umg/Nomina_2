#!/bin/sh
set -eu
# Certificado de servidor local: no puede actuar como autoridad certificadora.
if [ ! -s /etc/nginx/tls/localhost.key ] || [ ! -s /etc/nginx/tls/localhost.crt ] ||
  ! openssl x509 -in /etc/nginx/tls/localhost.crt -noout -ext basicConstraints 2>/dev/null | grep -q 'CA:FALSE'; then
  umask 077
  mkdir -p /etc/nginx/tls
  if [ ! -s /etc/nginx/tls/localhost.key ]; then
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
      -out /etc/nginx/tls/localhost.key 2>/dev/null
  fi
  openssl req -x509 -new -key /etc/nginx/tls/localhost.key -sha256 -days 365 \
    -out /etc/nginx/tls/localhost.crt.tmp -subj '/CN=localhost' \
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
    -addext 'basicConstraints=critical,CA:FALSE' \
    -addext 'keyUsage=critical,digitalSignature,keyEncipherment' \
    -addext 'extendedKeyUsage=serverAuth' 2>/dev/null
  mv /etc/nginx/tls/localhost.crt.tmp /etc/nginx/tls/localhost.crt
fi
