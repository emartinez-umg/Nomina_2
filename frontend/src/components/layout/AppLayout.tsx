import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useSession } from '../../app/session';
import { cerrarSesion } from '../../features/auth/api/auth';
import { Button } from '../ui/Button';
import { NotificationBell } from '../ui/NotificationBell';
import { Tooltip } from '../ui/Tooltip';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../ui/Toast';
import { iconos } from '../ui/icons';
import { HelpButton, HelpOffer } from '../help/HelpProvider';
import { limpiarTexto } from '../../lib/validadores';
import { navegacion, nombreRol } from './navegacion';
export function AppLayout() {
  const { usuario, establecer } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [panel, setPanel] = useState<'usuario' | 'notificaciones' | null>(null);
  const barra = useRef<HTMLElement>(null);
  const logout = useMutation({
    mutationFn: cerrarSesion,
    onSuccess: () => establecer(null),
    onError: (e) => toast(e.message, 'peligro'),
  });
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      if (!barra.current?.contains(e.target as Node)) setPanel(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null);
        setMenu(false);
      }
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  if (!usuario) return null;
  const accesos = navegacion[usuario.rol];
  const resultados = accesos.filter((a) => a.titulo.toLowerCase().includes(buscar.toLowerCase()));
  const Buscar = iconos.buscar;
  return (
    <div className="app-shell">
      {menu && (
        <button
          type="button"
          className="sidebar-fondo"
          aria-label="Cerrar menú de navegación"
          onClick={() => setMenu(false)}
        >
          <iconos.cancelar aria-hidden="true" />
        </button>
      )}
      <aside
        className={`sidebar ${menu ? 'sidebar-abierto' : ''}`}
        data-tour="sidebar"
        aria-label="Menú principal"
      >
        <div className="sidebar-logo">
          <img src="/logo-mockup.png" alt="Nómina" />
        </div>
        <nav aria-label="Secciones del sistema">
          <ul>
            {accesos.map((a) => {
              const Icono = iconos[a.icono];
              return (
                <li key={a.titulo}>
                  {a.ruta ? (
                    <NavLink
                      to={a.ruta}
                      end
                      onClick={() => setMenu(false)}
                      className={({ isActive }) => `nav-item ${isActive ? 'nav-activo' : ''}`}
                    >
                      <Icono size={23} aria-hidden="true" />
                      {a.titulo}
                    </NavLink>
                  ) : (
                    <Tooltip texto="Disponible en una próxima fase.">
                      <button type="button" className="nav-item" disabled>
                        <Icono size={23} aria-hidden="true" />
                        {a.titulo}
                      </button>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="sidebar-salir" data-tour="cerrar-sesion">
          <Button
            icono="salir"
            variante="texto"
            cargando={logout.isPending}
            onClick={() => logout.mutate()}
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <div className="app-cuerpo">
        <header className="barra-superior" ref={barra}>
          <Button
            icono="menu"
            variante="texto"
            soloIcono
            aria-label="Abrir menú de navegación"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            className="menu-movil"
          />
          <div className="buscador-global" data-tour="buscador">
            <Buscar size={18} aria-hidden="true" />
            <input
              aria-label="Buscar sección"
              value={buscar}
              maxLength={80}
              placeholder="Buscar sección…"
              onChange={(e) => setBuscar(limpiarTexto(e.target.value))}
            />
            {buscar && (
              <div className="buscador-resultados" aria-label="Resultados de búsqueda">
                {resultados.length ? (
                  resultados.map((a) => (
                    <Button
                      key={a.titulo}
                      icono={a.icono}
                      variante="texto"
                      disabled={!a.ruta}
                      motivoDeshabilitado={!a.ruta ? 'Disponible en una próxima fase.' : undefined}
                      onClick={() => {
                        if (a.ruta) navigate(a.ruta);
                        setBuscar('');
                      }}
                    >
                      {a.titulo}
                    </Button>
                  ))
                ) : (
                  <p>No hay secciones con ese nombre.</p>
                )}
                <Button icono="cancelar" variante="texto" onClick={() => setBuscar('')}>
                  Limpiar búsqueda
                </Button>
              </div>
            )}
          </div>
          <div className="barra-acciones">
            <div className="panel-ancla" data-tour="notificaciones">
              <NotificationBell
                abierto={panel === 'notificaciones'}
                onClick={() => setPanel((v) => (v === 'notificaciones' ? null : 'notificaciones'))}
              />
              {panel === 'notificaciones' && (
                <section
                  className="panel-flotante"
                  id="panel-notificaciones"
                  aria-label="Notificaciones"
                >
                  <EmptyState
                    icono="notificaciones"
                    titulo="Notificaciones"
                    descripcion="Las notificaciones estarán disponibles al integrar las solicitudes y los avisos del sistema."
                  />
                </section>
              )}
            </div>
            <div data-tour="ayuda-global">
              <HelpButton />
            </div>
            <div className="panel-ancla" data-tour="usuario-menu">
              <button
                type="button"
                className="usuario-boton"
                aria-expanded={panel === 'usuario'}
                aria-controls="panel-usuario"
                onClick={() => setPanel((v) => (v === 'usuario' ? null : 'usuario'))}
              >
                <span className="avatar" aria-hidden="true">
                  {usuario.usuario.slice(0, 2).toUpperCase()}
                </span>
                <span className="usuario-texto">
                  <strong>{usuario.usuario}</strong>
                  <small>{nombreRol[usuario.rol]}</small>
                </span>
                <iconos.desplegar size={17} aria-hidden="true" />
              </button>
              {panel === 'usuario' && (
                <section className="panel-flotante" id="panel-usuario" aria-label="Mi cuenta">
                  <strong>{usuario.usuario}</strong>
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
        <main id="contenido-principal" className="app-contenido">
          <Outlet />
        </main>
        <HelpOffer />
      </div>
    </div>
  );
}
