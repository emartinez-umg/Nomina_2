import { useEffect, useRef, useState } from 'react';
import { Command } from 'cmdk';
import type { OpcionNavegacion } from './navigation.config';
import { puntuarBusqueda } from './navigation.search';
import { Modal } from '../ui/Modal';
import { iconos } from '../ui/icons';

export function CommandPalette({
  opciones,
  recientes,
  onElegir,
  onCerrar,
}: {
  opciones: OpcionNavegacion[];
  recientes: string[];
  onElegir: (opcion: OpcionNavegacion) => void;
  onCerrar: () => void;
}) {
  const [consulta, setConsulta] = useState('');
  const entrada = useRef<HTMLInputElement>(null);
  // El diálogo captura primero el activador; después se enfoca la búsqueda para poder restaurarlo.
  useEffect(() => {
    entrada.current?.focus();
  }, []);
  const ultimos = consulta.trim()
    ? []
    : recientes
        .map((id) => opciones.find((opcion) => opcion.id === id))
        .filter((opcion): opcion is OpcionNavegacion => !!opcion);
  const disponibles = opciones.filter((opcion) => !ultimos.includes(opcion));
  const grupos = [
    { titulo: 'Recientes', items: ultimos },
    { titulo: 'Acciones rápidas', items: disponibles.filter((opcion) => opcion.rapida) },
    ...[...new Set(opciones.map((opcion) => opcion.grupo))].map((titulo) => ({
      titulo,
      items: disponibles.filter((opcion) => !opcion.rapida && opcion.grupo === titulo),
    })),
  ];
  return (
    <Modal abierto titulo="Buscar en el sistema" onCerrar={onCerrar}>
      <Command label="Secciones y acciones permitidas" loop filter={puntuarBusqueda}>
        <div className="paleta-entrada">
          <iconos.buscar size={21} aria-hidden="true" />
          <Command.Input
            ref={entrada}
            aria-label="Buscar sección o acción"
            aria-describedby="paleta-hint"
            placeholder="Escribe una sección o acción…"
            maxLength={80}
            inputMode="search"
            value={consulta}
            onValueChange={setConsulta}
          />
        </div>
        <p id="paleta-hint" className="paleta-hint">
          Busca por nombre o sinónimo, como boleta, agenda o constancia.
        </p>
        <Command.List className="paleta-lista" aria-label="Resultados de navegación">
          <Command.Empty className="paleta-vacia">
            No encontramos opciones. Prueba otra palabra.
          </Command.Empty>
          {grupos
            .filter((grupo) => grupo.items.length)
            .map((grupo) => (
              <Command.Group key={grupo.titulo} heading={grupo.titulo}>
                {grupo.items.map((opcion) => {
                  const Icono = iconos[opcion.icono];
                  return (
                    <Command.Item
                      key={opcion.id}
                      value={opcion.id}
                      keywords={[opcion.titulo, opcion.grupo, ...opcion.palabras]}
                      className="paleta-opcion"
                      onSelect={() => onElegir(opcion)}
                    >
                      <Icono size={21} aria-hidden="true" />
                      <span>
                        <strong>{opcion.titulo}</strong>
                        <small>{opcion.descripcion}</small>
                      </span>
                      <span className="paleta-grupo">{opcion.grupo}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
        </Command.List>
        <p className="paleta-hint">↑ ↓ para elegir · Enter para abrir · Esc para cerrar</p>
      </Command>
    </Modal>
  );
}
