import assert from 'node:assert/strict';

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

const pagina = await fetch(`${web}/salud`);
assert.equal(pagina.status, 200);
const html = await pagina.text();
assert.match(html, /<div id="root"><\/div>/);
const asset = /src="(\/assets\/[^\"]+\.js)"/.exec(html)?.[1];
assert.ok(asset, 'No se encontró el bundle de React');
const bundle = await fetch(`${web}${asset}`);
assert.equal(bundle.status, 200);
assert.match(bundle.headers.get('content-type') || '', /javascript/);
console.log('OK: nginx sirve React, assets y rutas de React Router');
