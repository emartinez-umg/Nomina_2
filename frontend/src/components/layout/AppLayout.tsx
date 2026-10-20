import { nombreUsuario } from '../../lib/nombre';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useSession } from '../../app/session';
import { cerrarSesion } from '../../features/auth/api/auth';
import { Button } from '../ui/Button';
import { Notificaciones } from '../../features/vacaciones/pages/Notificaciones';
import { useToast } from '../ui/Toast';
import { iconos } from '../ui/icons';
import { HelpButton } from '../help/HelpProvider';
import { nombreRol, opcionesNavegacion } from './navigation.config';
import { guardarReciente, leerRecientes } from './navigation.history';
import { NavigationMenu } from './NavigationMenu';
import { CommandPalette } from './CommandPalette';

export function AppLayout() {
  const { usuario, establecer } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [buscar, setBuscar] = useState(false);
  const [panel, setPanel] = useState<'usuario' | 'notificaciones' | null>(null);
  const barra = useRef<HTMLElement>(null);
  const opciones = useMemo(() => (usuario ? opcionesNavegacion(usuario.rol) : []), [usuario]);
  const logout = useMutation({
    mutationFn: cerrarSesion,
    onSuccess: () => establecer(null),
    onError: (e) => toast(e.message, 'peligro'),
  });
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      if (!barra.current?.contains(e.target as Node)) setPanel(null);
    };
    const teclado = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.repeat) {
        // No se apilan ventanas sobre formularios o confirmaciones en curso.
        if (document.querySelector('dialog[open]') && !buscar) return;
        e.preventDefault();
        setBuscar((actual) => !actual);
        setPanel(null);
      }
      if (e.key === 'Escape') setPanel(null);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', teclado);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', teclado);
    };
  }, [buscar]);
  if (!usuario) return null;
  const nombre = nombreUsuario(usuario);
  const recordar = (id: string) => {
    guardarReciente(usuario.idUsuario, id, opciones);
  };
  return (
    <div className="app-shell">
      <a className="saltar-contenido" href="#contenido-principal">
        Saltar al contenido principal
      </a>
      <div className="app-cuerpo">
        <header className="barra-superior" ref={barra}>
          <Link to={opciones[0]!.ruta} className="marca-navegacion" aria-label="Nómina · Inicio">
            <img src="/logo-mockup.png" alt="" />
            <strong>Nómina</strong>
          </Link>
          <NavigationMenu
            key={`${usuario.idUsuario}:${usuario.rol}`}
            rol={usuario.rol}
            onElegir={recordar}
          />
          <div className="barra-acciones">
            <div data-tour="buscador">
              <Button
                icono="buscar"
                variante="secundario"
                className="buscar-activador"
                aria-label="Buscar sección o acción"
                aria-keyshortcuts="Control+k Meta+k"
                aria-haspopup="dialog"
                aria-expanded={buscar}
                title="Buscar una sección o acción con Ctrl+K o ⌘+K"
                onClick={() => {
                  setBuscar(true);
                  setPanel(null);
                }}
              >
                <span>Buscar</span>
                <kbd>Ctrl / ⌘ K</kbd>
              </Button>
            </div>
            <div className="panel-ancla" data-tour="notificaciones">
              <Notificaciones
                abierto={panel === 'notificaciones'}
                onClick={() => setPanel((v) => (v === 'notificaciones' ? null : 'notificaciones'))}
              />
            </div>
            <div data-tour="ayuda-global">
              <HelpButton />
            </div>
            <div className="panel-ancla" data-tour="usuario-menu">
              <button
                type="button"
                className="usuario-boton"
                title={`Mi cuenta: ${nombre} · ${nombreRol[usuario.rol]}`}
                aria-label={`Mi cuenta: ${nombre} · ${nombreRol[usuario.rol]}`}
                aria-expanded={panel === 'usuario'}
                aria-controls="panel-usuario"
                onClick={() => setPanel((v) => (v === 'usuario' ? null : 'usuario'))}
              >
                <span className="avatar" aria-hidden="true">
                  {nombre
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                <span className="usuario-texto">
                  <strong>{nombre}</strong>
                  <small>{nombreRol[usuario.rol]}</small>
                </span>
                <iconos.desplegar size={17} aria-hidden="true" />
              </button>
              {panel === 'usuario' && (
                <section className="panel-flotante" id="panel-usuario" aria-label="Mi cuenta">
                  <strong>{nombre}</strong>
                  <p>{usuario.correo}</p>
                  <p>{nombreRol[usuario.rol]}</p>
                  <Button
                    icono="salir"
                    variante="texto"
                    cargando={logout.isPending}
                    onClick={() => logout.mutate()}
                  >
                    Cerrar sesión
                  </Button>
                </section>
              )}
            </div>
          </div>
        </header>
        <main id="contenido-principal" tabIndex={-1} className="app-contenido">
          <Outlet />
        </main>
      </div>
      {buscar && (
        <CommandPalette
          key={`${usuario.idUsuario}:${usuario.rol}`}
          opciones={opciones}
          recientes={leerRecientes(usuario.idUsuario, opciones)}
          onCerrar={() => setBuscar(false)}
          onElegir={(opcion) => {
            recordar(opcion.id);
            setBuscar(false);
            navigate(opcion.ruta);
          }}
        />
      )}
    </div>
  );
}
