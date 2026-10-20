import { Outlet } from 'react-router-dom';

/** Centra la página completa, incluidos encabezado, avisos y acciones del formulario. */
export function FormPageContainer() {
  return (
    <div className="form-page">
      <Outlet />
    </div>
  );
}
