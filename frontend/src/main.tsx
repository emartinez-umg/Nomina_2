import './app/preloadRecovery';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './app/providers';
import { router } from './app/router';
import 'driver.js/dist/driver.css';
import './styles/index.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No se encontró el contenedor de la aplicación.');

ReactDOM.createRoot(raiz).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>,
);
