"""Reproduce el catálogo JSON desde el XLSX oficial versionado, sin dependencias."""

import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

raiz = Path(__file__).resolve().parent.parent
destino = raiz / "db/data/ubicaciones-gt.json"
datos = json.loads(destino.read_text())
original = raiz / "db/data/ine" / datos["fuente"]["archivo"]
assert hashlib.sha256(original.read_bytes()).hexdigest() == datos["fuente"]["sha256"]
ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
departamentos, municipios = {}, {}
with ZipFile(original) as archivo:
    cadenas = ET.fromstring(archivo.read("xl/sharedStrings.xml"))
    textos = ["".join(s.itertext()) for s in cadenas.findall("x:si", ns)]
    hoja = ET.fromstring(archivo.read("xl/worksheets/sheet1.xml"))
    for fila in hoja.findall("x:sheetData/x:row", ns):
        if int(fila.attrib["r"]) < 7:
            continue
        valores = {}
        for celda in fila.findall("x:c", ns):
            columna = "".join(c for c in celda.attrib["r"] if c.isalpha())
            valor = celda.find("x:v", ns)
            if valor is not None:
                valores[columna] = textos[int(valor.text)] if celda.get("t") == "s" else valor.text
        if not valores.get("A", "").isdigit() or not valores.get("C", "").isdigit():
            continue
        dep, mun = valores["A"].zfill(2), valores["C"].zfill(4)
        departamento = {"codigo": dep, "nombre": valores["B"]}
        municipio = {"codigo": mun, "codigoDepartamento": dep, "nombre": valores["D"]}
        assert dep not in departamentos or departamentos[dep] == departamento
        assert mun not in municipios or municipios[mun] == municipio
        assert mun[:2] == dep
        departamentos[dep], municipios[mun] = departamento, municipio
assert len(departamentos) == 22 and len(municipios) == 340
datos["departamentos"] = [departamentos[c] for c in sorted(departamentos)]
datos["municipios"] = [municipios[c] for c in sorted(municipios)]
destino.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n")
print("22 departamentos y 340 municipios extraídos sin modificar nombres.")
