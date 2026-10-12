import { createBrowserRouter, Navigate } from 'react-router-dom';
import { SaludPage } from '../features/salud/pages/SaludPage';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/salud" replace /> },
  { path: '/salud', element: <SaludPage /> },
  { path: '*', element: <Navigate to="/salud" replace /> },
]);
