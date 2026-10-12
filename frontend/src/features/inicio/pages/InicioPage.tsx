import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { iconos } from '../../../components/ui/icons';
import { navegacion, nombreRol } from '../../../components/layout/navegacion';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaInicio } from '../help/pasos';
export function InicioPage() {
  const navigate = useNavigate();
  const { usuario } = useSession();
  usePageHelp(ayudaInicio, usuario?.rol);
  if (!usuario) return null;
  const titulo =
    usuario.rol === 'EMPLEADO'
      ? 'Mis gestiones'
      : usuario.rol === 'RH'
        ? 'Recursos Humanos'
        : 'Administración';
  const principales =
    usuario.rol === 'ADMIN'
      ? ['Catálogos', 'Usuarios', 'Bitácora']
      : usuario.rol === 'RH'
        ? ['Catálogos', 'Empleados', 'Novedades', 'Planilla']
        : null;
  const accesos = navegacion[usuario.rol].filter(
    (a) => a.icono !== 'inicio' && (!principales || principales.includes(a.titulo)),
  );
  return (
    <>
      <h1>{titulo}</h1>
      <Breadcrumbs items={[{ titulo: 'Nómina' }, { titulo }]} />
      <div className="banda-informativa">
        <iconos.informacion aria-hidden="true" />
        <span>
          Bienvenido, {usuario.usuario} · {nombreRol[usuario.rol]}
        </span>
      </div>
      <section data-tour="contenido" className="accesos-grid" aria-label="Accesos de mi rol">
        {accesos.map((a) => {
          const Icono = iconos[a.icono];
          return (
            <Card key={a.titulo} className="acceso-tarjeta">
              <Icono aria-hidden="true" className="acceso-icono" />
              <h2>{a.titulo}</h2>
              <p>{a.descripcion}</p>
              <Button
                icono="siguiente"
                disabled={!a.ruta}
                onClick={() => {
                  if (a.ruta) navigate(a.ruta);
                }}
                motivoDeshabilitado="Este módulo se habilitará en una próxima fase."
              >
                {a.ruta ? 'Abrir' : 'Próximamente'}
              </Button>
            </Card>
          );
        })}
      </section>
      {usuario.rol === 'ADMIN' && (
        <p className="mt-8">
          <Link className="enlace-icono" to="/salud">
            <iconos.salud size={18} aria-hidden="true" />
            Consultar estado del sistema
          </Link>
        </p>
      )}
    </>
  );
}
