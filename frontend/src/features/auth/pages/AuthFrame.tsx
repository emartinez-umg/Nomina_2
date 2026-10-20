import type { ReactNode } from 'react';
import { HelpButton } from '../../../components/help/HelpProvider';
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth-pagina">
      <div className="auth-marca" data-tour="marca">
        <svg
          className="auth-curva"
          viewBox="0 0 750 850"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            className="fill-marca"
            d="M0 0H737C775 150 721 250 748 520C790 787 516 885 271 841C153 834 65 808 0 774Z"
          />
          <path
            className="fill-fondo"
            d="M0 0H711C728 138 684 235 710 489C752 724 544 816 317 810C172 813 64 789 0 750Z"
          />
        </svg>
        <img src="/logo-mockup.png" alt="Emblema del sistema" />
        <h1>Nómina</h1>
        <p>Gestión de personal y nómina</p>
      </div>
      <header className="auth-ayuda">
        <HelpButton />
      </header>
      <main className="auth-contenedor">
        <div className="auth-panel">{children}</div>
      </main>
    </div>
  );
}
