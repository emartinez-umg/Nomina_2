import assert from 'node:assert/strict';
import { request } from 'node:https';
const httpsWeb = `https://127.0.0.1:${process.env.WEB_HTTPS_PORT || 8443}`;
// Únicamente el certificado autofirmado del loopback de desarrollo.
async function local(url) {
  return new Promise((resolve, reject) => {
    const r = request(url, { rejectUnauthorized: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve(
          new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers }),
        ),
      );
    });
    r.on('error', reject);
    r.end();
  });
}
const obtener = (url) => (url.startsWith(httpsWeb) ? local(url) : fetch(url));

const api = `http://127.0.0.1:${process.env.API_PORT || 3000}`;
const web = `http://127.0.0.1:${process.env.WEB_PORT || 8080}`;

for (const origen of [api, web]) {
  const respuesta = await fetch(`${origen}/api/salud`, { signal: AbortSignal.timeout(15000) });
  assert.equal(respuesta.status, 200, `Salud no disponible en ${origen}`);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.ok, true);
  assert.equal(cuerpo.data.estado, 'OK');
  assert.equal(cuerpo.data.baseDatos, 'CONECTADA');
  assert.equal(cuerpo.data.modo, 'thin');
  console.log(`OK: API y Oracle conectados desde ${origen}`);
}

const pagina = await obtener(`${httpsWeb}/salud`);
assert.equal(pagina.status, 200);
const html = await pagina.text();
assert.match(html, /<div id="root"><\/div>/);
const asset = /src="(\/assets\/[^\"]+\.js)"/.exec(html)?.[1];
assert.ok(asset, 'No se encontró el bundle de React');
const bundle = await obtener(`${httpsWeb}${asset}`);
assert.equal(bundle.status, 200);
assert.match(bundle.headers.get('content-type') || '', /javascript/);
console.log('OK: nginx sirve React, assets y rutas de React Router');

const codigo = await bundle.text();
const moduloSolicitudes = /assets\/SolicitudesPage-[\w-]+\.js/.exec(codigo)?.[0];
assert.ok(moduloSolicitudes, 'No se encontró el módulo de solicitudes');
const solicitudes = await obtener(`${httpsWeb}/${moduloSolicitudes}`);
assert.equal(solicitudes.status, 200);
const worker = /\/assets\/pdf\.worker\.min-[\w-]+\.mjs/.exec(await solicitudes.text())?.[0];
assert.ok(worker, 'No se encontró el worker del visor PDF');
const visor = await obtener(`${httpsWeb}${worker}`);
assert.equal(visor.status, 200);
assert.match(visor.headers.get('content-type') || '', /javascript/);
console.log('OK: visor PDF y worker ES disponibles con MIME JavaScript');
