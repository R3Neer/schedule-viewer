# QA — UCM Scheduler

## Validación automática

Ejecutada antes del push:

```text
validate-config: OK
schedule-core: 10 casos OK
assets-webp: OK
```

`tools/validate_config.py` comprueba fechas, horas, referencias de asignaturas, cinco días por cuatrimestre y solapamientos.

## Casos de selección cubiertos

| Fecha | Formato | Resultado esperado |
|---|---|---|
| 2026-09-02 | vertical estrecho | Sin clases hoy |
| 2026-09-02 | horizontal/ancho | Próxima semana: Q1 |
| 2026-09-09 | vertical estrecho | Miércoles Q1 |
| 2026-09-12 | vertical estrecho | Sin clases hoy |
| 2026-09-12 | horizontal/ancho | Semana Q1 |
| 2026-10-12 | vertical estrecho | Sin clases hoy por festivo |
| 2027-01-10 | horizontal/ancho | Próxima semana: Q2 |
| 2027-02-03 | vertical estrecho | Miércoles Q2 |
| 2027-03-22 | vertical estrecho | Sin clases hoy por periodo no lectivo |
| 2027-07-10 | horizontal/ancho | Vacaciones |

## Pruebas visuales en navegador headless

Se renderizaron y revisaron capturas con el CSS real y los WebP generados para:

- escritorio `1440 × 900`, Q1 semanal;
- móvil vertical `390 × 844`, Q1 miércoles;
- móvil vertical `390 × 844`, Q2 jueves;
- móvil vertical `390 × 844`, estado Sin clases hoy;
- móvil horizontal `844 × 390`, Q1 semanal;
- escritorio `1440 × 900`, estado Vacaciones.

Ajuste derivado de estas pruebas: en móvil horizontal la semana usa todo el ancho y admite un scroll vertical corto, en lugar de reducirse hasta perder legibilidad.

## Patrón diario

Todos los días generados tienen `1080 × 2160 px`. Dentro de cada cuatrimestre comparten exactamente:

- misma escala horaria;
- mismas filas;
- misma cabecera;
- mismos márgenes;
- misma geometría de los bloques.

Los huecos no se eliminan ni se compactan.

## Carga de imágenes

`index.html` contiene un único elemento `<img>`. `app.js` resuelve primero fecha y formato y solo entonces asigna el `src` del asset seleccionado. No se insertan imágenes alternativas ocultas en el DOM.
