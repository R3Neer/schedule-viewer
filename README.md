# UCM Scheduler

Horario personal de Samuel para el curso 2026–2027 de Ingeniería Informática (UCM).

La interfaz mantiene **un único `<img>` visible**. La selección temporal decide qué contenido toca mostrar y una capa de renderizado decide si ese contenido es el horario generado o una imagen configurada (GIF/PNG/JPEG/WebP/SVG/AVIF, etc.). En móvil, el horario normal se genera como SVG adaptado al viewport; en escritorio/tablet se conservan los WebP prerenderizados como ruta principal y el SVG como fallback.

## Comportamiento

- Móvil estrecho en vertical: vista del día.
- Horizontal o pantalla ancha: vista semanal.
- Festivos, fines de semana, días no lectivos y vacaciones en vertical: `Sin clases hoy`.
- Vacaciones en horizontal: `Vacaciones`, salvo cuando el calendario indique que ya debe mostrarse el siguiente cuatrimestre.
- Funciona offline después de una primera apertura con conexión mediante Service Worker.
- Zona horaria: `Europe/Madrid`.

## Fuente de verdad

`config/schedules.json` contiene:

- calendario académico, cuatrimestres y vacaciones;
- asignaturas y sesiones;
- aulas y grupos;
- festivos y días no lectivos;
- rutas de assets;
- overrides opcionales de contenido visual.

Los WebP se generan de forma reproducible con `tools/render_assets.py`. La configuración `content` es opcional: si no existe, el comportamiento y el aspecto del horario son los actuales.

La especificación del contenido configurable está en [`docs/content-config.md`](docs/content-config.md).

## Desarrollo local

```bash
python -m pip install -r requirements.txt
npm install
python tools/validate_config.py
npm test
python tools/build.py --out dist
npm run test:e2e
```

Los E2E levantan `dist/` y abren la web en Chromium. Comprueban renderizado real, cambio vertical/horizontal, contenido GIF/PNG y recarga offline. Si la página no llega a mostrar una imagen válida, el test falla.

Para probar manualmente una fecha concreta puede utilizarse `?date=YYYY-MM-DD`, por ejemplo:

```text
http://localhost:4173/?date=2027-02-03
```

La fecha manual no aparece como control en la interfaz; existe únicamente para pruebas y previsualización.

## GitHub Pages

El workflow `.github/workflows/pages.yml` valida, prueba, construye `dist/`, abre la web con Playwright y solo después despliega el mismo artefacto que pasó los tests.

En un repositorio nuevo GitHub puede exigir una activación inicial en:

`Settings → Pages → Source → GitHub Actions`

Después, cualquier cambio en `main` vuelve a desplegar automáticamente.

## Actualizar un curso futuro

1. Añadir el curso y sus términos a `config/schedules.json`.
2. Definir asignaturas, sesiones y calendario académico.
3. Mantener las rutas de los assets generados.
4. Añadir opcionalmente contenido personalizado en `content` y sus ficheros bajo `assets/`.
5. Ejecutar validador, tests y build.
6. Hacer push. GitHub Actions repite esas comprobaciones antes de desplegar.

No debería ser necesario modificar la lógica de la app para añadir otro formato de imagen compatible con `<img>`.

## Fuentes oficiales 2026–2027

Las URLs de cada asignatura están guardadas junto a sus datos en `config/schedules.json` para poder verificar cambios. El calendario general procede de la Facultad de Informática UCM.
