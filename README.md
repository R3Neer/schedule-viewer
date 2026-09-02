# UCM Scheduler

Horario personal de Samuel para el curso 2026–2027 de Ingeniería Informática (UCM).

La web no dibuja el horario en tiempo de ejecución: selecciona **una única imagen prerenderizada** según fecha y formato de pantalla.

## Comportamiento

- Móvil estrecho en vertical: vista del día.
- Horizontal o pantalla ancha: vista semanal.
- Festivos, fines de semana, días no lectivos y vacaciones en vertical: `Sin clases hoy`.
- Fuera de un cuatrimestre en horizontal: muestra el próximo horario semanal si ya existe en configuración; si no existe, `Vacaciones`.
- Zona horaria: `Europe/Madrid`.

## Fuente de verdad

`config/schedules.json` contiene:

- cursos académicos;
- cuatrimestres;
- asignaturas y sesiones;
- aulas y grupos;
- festivos y festividades académicas;
- periodos no lectivos;
- rutas de assets.

Los WebP se generan de forma reproducible a partir de ese fichero con `tools/render_assets.py`. Así se mantiene exactamente el mismo patrón visual entre los cinco días de cada cuatrimestre.

## Desarrollo local

```bash
python -m pip install -r requirements.txt
npm test
python tools/build.py --out dist
python -m http.server 8000 -d dist
```

Abrir `http://localhost:8000/`.

Para probar una fecha concreta puede utilizarse `?date=YYYY-MM-DD`, por ejemplo:

```text
http://localhost:8000/?date=2027-02-03
```

La fecha manual no aparece como control en la interfaz; existe únicamente para pruebas y previsualización.

## GitHub Pages

El workflow `.github/workflows/pages.yml` prueba, construye y despliega `dist/`.

En un repositorio nuevo GitHub puede exigir una activación inicial en:

`Settings → Pages → Source → GitHub Actions`

Después, cualquier cambio en `main` vuelve a desplegar automáticamente.

## Actualizar un curso futuro

1. Añadir el curso y sus términos a `config/schedules.json`.
2. Definir asignaturas, sesiones, excepciones y periodos no lectivos.
3. Añadir las rutas de los nuevos assets.
4. Ejecutar `python tools/build.py --out dist` para comprobarlos localmente.
5. Hacer push. GitHub Actions regenera todas las imágenes y despliega.

No debería ser necesario modificar la lógica de la app.

## Fuentes oficiales 2026–2027

Las URLs de cada asignatura están guardadas junto a sus datos en `config/schedules.json` para poder verificar cambios. El calendario general procede de la Facultad de Informática UCM.
