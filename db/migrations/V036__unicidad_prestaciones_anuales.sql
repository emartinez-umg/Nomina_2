-- C1.5: el mes identifica el ciclo legal, aunque el desembolso ocurra después.
-- Refuerza la identidad anual incluso si cambia el mes de pago configurado.
-- Conserva todas las filas; las reversiones permiten una nueva versión del pago.
CREATE UNIQUE INDEX UQ_PAGO_PRESTACION_ANIO ON PAGOS_NOMINA(
 CASE WHEN ESTADO='PAGADO' AND TIPO_PAGO IN ('BONO_14','AGUINALDO') THEN ID_EMPLEADO END,
 CASE WHEN ESTADO='PAGADO' AND TIPO_PAGO IN ('BONO_14','AGUINALDO') THEN TIPO_PAGO END,
 CASE WHEN ESTADO='PAGADO' AND TIPO_PAGO IN ('BONO_14','AGUINALDO') THEN TRUNC(MES,'YYYY') END
);
/
