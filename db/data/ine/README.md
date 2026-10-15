# Fuente oficial de ubicaciones de Guatemala

Instituto Nacional de Estadística (INE), **Lugares poblados de la República de Guatemala.
Censo 2018**, recurso publicado el 25/03/2024, consultado el 14/10/2026.

- [Ficha del recurso en DATOS INE](https://datos.ine.gob.gt/dataset/censo-2018-lugares-poblados/resource/053dfa99-b3f9-4b1f-a99f-fc933ef00da4).
- [Descarga original XLSX](https://datos.ine.gob.gt/dataset/78019333-d80b-45e8-b694-fb3b8d65e19e/resource/053dfa99-b3f9-4b1f-a99f-fc933ef00da4/download/centroides-de-lugares-poblados-de-la-republica-de-guatemala.-censo-2018.xlsx).
- Original íntegro: `lugares-poblados-censo-2018.xlsx`.
- SHA-256: `b8ea8fea33e6d606e102e8d96ed692deacec660c028ffcf673f84459bcafe14e`.

La hoja A_3 contiene los códigos y nombres de departamento (A/B) y municipio (C/D)
desde la fila 7. Se extraen pares únicos, sin utilizar nombres de lugares poblados,
coordenadas ni inferir municipios. Los códigos se rellenan con ceros a 2/4 posiciones;
los nombres se conservan literalmente. El resultado es `db/data/ubicaciones-gt.json`:
22 departamentos y 340 municipios con sus relaciones, incluida la capital 01/0101.

Reproducir sin red desde la raíz:

```sh
python3 scripts/extraer-ubicaciones-ine.py
node scripts/generar-seed-ubicaciones.mjs
npm run verify:ubicaciones
```

El extractor usa solo la biblioteca estándar de Python y rechaza una huella cambiada,
pares contradictorios o conteos distintos. El seed S006 hace MERGE por código INE sin
sobrescribir filas existentes; las identidades Oracle no son los códigos oficiales.
La aplicación consulta la API, nunca este JSON directamente.

Se descartó el Manual del Supervisor del Censo 2018 como fuente de códigos porque
su tabla S17 tiene inconsistencias en los códigos de municipios de Guatemala. La
boleta ENEIC publicada en 2025 también presenta erratas en nombres. No se combinaron
ni corrigieron nombres por intuición: el catálogo procede únicamente del XLSX anterior.
