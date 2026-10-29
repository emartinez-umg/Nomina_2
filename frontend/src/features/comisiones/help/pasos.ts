import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaComisiones: DefinicionAyuda = {
  id: 'estadisticas-comisiones-r3-10',
  pasos: [
    {
      elemento: 'com-filtros',
      titulo: 'Elige el rango y los vendedores',
      descripcion:
        'Desde y Hasta incluyen ambos meses; el máximo son 60 y no se permiten meses futuros. Los años disponibles tienen registros o son el actual. Usa Este mes, Últimos 3, 6 o 12 meses, Este año o Año anterior para aplicar un rango. Departamento limita los vendedores seleccionables; al cambiar fechas, estado o departamento se limpia la selección para evitar personas incompatibles. Abre Vendedores y marca varias personas; sin selección incluye todas. Aplicar filtros actualiza las cifras y la URL; Limpiar vuelve al mes actual. Pendiente significa que la comisión autorizada aún no fue consumida en nómina; Aplicada ya se incluyó en un pago. La comparación usa igual número de meses inmediatamente anteriores con los mismos filtros. No se guardan borradores de estos filtros.',
    },
    {
      elemento: 'com-alcance',
      titulo: 'Comprueba el alcance',
      roles: ['EMPLEADO'],
      descripcion:
        'Equipo indica todas las personas activas de las jefaturas para las que tienes VER_COMISIONES_EQUIPO y sus descendientes activas, antes de filtrar; excluye al propio jefe. Años, opciones, gráficas, detalle y descargas respetan ese alcance. El servidor vuelve a verificar permisos en cada consulta; un permiso retirado impide nuevas lecturas.',
    },
    {
      elemento: 'com-alcance',
      titulo: 'Historia de comisiones de la empresa',
      roles: ['RH', 'ADMIN'],
      descripcion:
        'Se consulta el libro mensual de comisiones autorizadas, incluidas fichas históricas inactivas. El mes es el de origen, aunque la comisión se pague más adelante. No se suman otra vez respaldos v0 ni se confunden estas cifras con las remuneraciones de pagos confirmados de Inicio. Sin registros revisa el rango, el estado y la autorización; RH puede usar Cargar comisiones.',
    },
    {
      elemento: 'com-indicadores',
      titulo: 'Lee los indicadores y la comparación',
      descripcion:
        'Total suma las comisiones del rango. Promedio mensual divide entre todos sus meses, incluidos ceros. Mejor mes toma el primero si hay empate. Vendedores cuenta personas con registro válido, aunque su puesto no sea Vendedor. La flecha y el texto expresan aumento, disminución o sin cambio; con base anterior cero se informa Sin base de comparación. La preferencia del dispositivo de movimiento reducido desactiva conteos y transiciones.',
    },
    {
      elemento: 'com-tendencia',
      titulo: 'Tendencia y cifras accesibles',
      descripcion:
        'La línea continua muestra el total mensual y la discontinua el periodo anterior alineado, cuando lo activaste. Mostrar por vendedor añade hasta cinco personas de la página actual, numeradas y con trazos distintos. La matriz ofrece sus cifras exactas. Abre Ver datos: Tendencia mensual para leer la alternativa tabular y los meses anteriores equivalentes. Los meses sin comisiones aparecen en cero.',
    },
    {
      elemento: 'com-ranking',
      titulo: 'Ranking e historial personal',
      descripcion:
        'Las barras muestran las diez primeras filas de la página según el orden elegido. Ver datos: ranking y reparto contiene montos, porcentajes y variaciones de todos los vendedores de la página; sus encabezados permiten ordenar y los botones paginan en servidor. Pulsa un nombre aquí o en la matriz para abrir la evolución individual, mejor y peor mes, promedio y comisiones originales. El promedio del equipo usa los vendedores del rango filtrado, incluidos sus meses vacíos.',
    },
    {
      elemento: 'com-reparto',
      titulo: 'Reparto sin depender del color',
      descripcion:
        'El círculo muestra las cinco primeras filas y agrupa las demás en Resto de vendedores, conservando el total global. Los números y nombres de la leyenda identifican cada porción. Ver datos: reparto por vendedor ofrece una tabla propia con nombres, montos y participación exacta; los porcentajes redondeados pueden sumar 99.99 o 100.01.',
    },
    {
      elemento: 'com-matriz',
      titulo: 'Matriz y mapa de calor',
      descripcion:
        'Cada columna es un mes. La intensidad, el borde y la tipografía se acompañan siempre del monto exacto: no necesitas distinguir colores. Desplaza horizontalmente la tabla con teclado o tacto. Ordena por vendedor, total o promedio y pagina; los totales inferiores incluyen todas las páginas y todos los meses filtrados. Pulsa un vendedor para consultar el detalle, sin abrir su expediente.',
    },
    {
      elemento: 'com-detalle',
      titulo: 'Compara al vendedor con el equipo',
      descripcion:
        'El detalle conserva el rango, departamento, vendedores y estado aplicados. La serie muestra su monto y el promedio mensual por vendedor del conjunto, con su denominador. Mejor y peor mes incluyen ceros. Ver datos: Evolución del vendedor ofrece la alternativa accesible; la tabla de comisiones individuales pagina registros por mes de origen, con descripción y estado. Cerrar detalle vuelve al análisis general.',
    },
    {
      elemento: 'com-exportar',
      titulo: 'Descarga el conjunto completo',
      descripcion:
        'CSV y Excel incluyen la matriz de todos los vendedores y meses filtrados, totales, promedio, participación y comparación, con el estado, corte y alcance. La descarga no se limita a la página visible. Se vuelve a validar la autorización en el servidor al exportar. Si falla, conserva los filtros y reintenta.',
    },
  ],
};
