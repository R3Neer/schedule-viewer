# Especificación — Schedule Viewer

## 1. Objetivo

Aplicación web estática, ligera y offline-first para mostrar contenido visual según fecha, calendario y orientación de pantalla.

La instancia incluida actualmente representa el horario 2026–2027 de Ingeniería Informática de la UCM, pero la lógica de ejecución no debe depender de UCM.

La aplicación mantiene un único elemento `<img>` visible. La selección temporal decide **qué contenido corresponde** y una capa independiente decide **cómo representarlo**.

## 2. Selección temporal

La fuente de verdad es `config/schedules.json`.

La lógica debe poder resolver:

- curso académico y cuatrimestre activo;
- día de la semana;
- fines de semana;
- festivos;
- días no lectivos;
- vacaciones;
- transición y previsualización del siguiente cuatrimestre;
- orientación diaria o semanal.

En móvil estrecho vertical se muestra normalmente el contenido diario. En horizontal, tablet o escritorio se muestra normalmente el contenido semanal.

## 3. Modelo de contenido

La salida de la selección temporal se normaliza como un `ContentDescriptor`.

### `generated-schedule`

Representa el horario generado por la propia aplicación.

- En móvil se genera como SVG adaptado al viewport.
- En escritorio/tablet se utiliza el WebP prerenderizado como ruta principal y SVG como fallback.

### `image`

Representa contenido visual externo al renderer de horario:

```json
{
  "type": "image",
  "src": "assets/custom/wednesday.gif",
  "alt": "GIF del miércoles",
  "fit": "contain"
}
```

El navegador recibe directamente el `src`. Por tanto GIF, PNG, JPEG, WebP, SVG, AVIF y otros formatos admitidos por `<img>` no requieren lógica específica por extensión.

La configuración también admite una cadena como forma abreviada de `image`.

La especificación completa del formato está en `docs/content-config.md`.

## 4. Separación de responsabilidades

```text
fecha + orientación
       ↓
schedule-core.js
       ↓
ContentDescriptor
       ↓
content-renderer.js
   ┌───────────────┐
   │               │
generated       image
schedule        content
   │               │
  SVG        GIF/PNG/...
   └───────┬───────┘
           ↓
         <img>
```

`schedule-core.js` no debe conocer detalles de DOM ni decodificación de imágenes.

`content-renderer.js` no decide calendarios ni festivos: recibe una selección ya resuelta y produce la fuente visual que debe usar el `<img>`.

`app.js` coordina viewport, selección, renderizado, errores y cambios de orientación.

## 5. Calendario

Cada curso académico contiene una sección `calendar` independiente de los datos visuales del horario.

Debe admitir:

- fechas de cada cuatrimestre;
- festivos;
- días no lectivos;
- periodos de vacaciones;
- promoción configurable del siguiente cuatrimestre durante un periodo intermedio.

Un festivo puntual afecta a la vista diaria, pero no elimina la estructura semanal del cuatrimestre.

## 6. Assets generados

Los horarios tradicionales siguen manteniendo assets prerenderizados reproducibles:

- 1 WebP semanal por cuatrimestre;
- 5 WebP diarios por cuatrimestre;
- estados visuales globales cuando proceda.

`tools/render_assets.py` genera estos archivos desde `config/schedules.json`.

Los assets personalizados declarados mediante `ContentDescriptor image` no necesitan pasar por ese renderer.

## 7. Offline

`service-worker.js` precachea en la primera carga con conexión:

- HTML, CSS y JavaScript del runtime;
- `config/schedules.json`;
- WebP generados;
- imágenes personalizadas locales declaradas en la configuración.

Las navegaciones y el JSON usan estrategia network-first con fallback a caché. Los recursos estáticos y visuales usan cache-first.

Las imágenes `data:` o `blob:` no se precachean. Los recursos remotos de otro origen tampoco forman parte del precache automático.

El namespace de caché debe versionarse para permitir sustituir cachés antiguas al activar una nueva versión.

## 8. Interfaz

La interfaz debe seguir siendo deliberadamente mínima:

- cero navegación permanente necesaria para consultar el horario;
- vertical = día;
- horizontal = semana;
- cambio de orientación sin recarga;
- ausencia de scroll innecesario en móvil;
- una única imagen visible.

El objetivo es optimizar una consulta de pocos segundos, no convertir la aplicación en otro gestor universitario completo.

## 9. Estructura principal

```text
/
├── index.html
├── styles.css
├── app.js
├── schedule-core.js
├── content-renderer.js
├── service-worker.js
├── package.json
├── requirements.txt
├── config/
│   └── schedules.json
├── tools/
│   ├── build.py
│   ├── render_assets.py
│   └── validate_config.py
├── tests/
│   ├── schedule-core.test.mjs
│   ├── content-renderer.test.mjs
│   ├── service-worker.test.mjs
│   ├── validate_content_config.py
│   └── e2e/
│       └── app.spec.mjs
├── docs/
└── .github/workflows/pages.yml
```

`dist/` se genera durante el build y no se versiona.

## 10. Validación

`tools/validate_config.py` debe rechazar, entre otros casos:

- fechas u horas inválidas;
- rangos de calendario invertidos o solapados;
- referencias de asignaturas inexistentes;
- sesiones solapadas;
- `ContentDescriptor` con tipo desconocido;
- `image` sin `src`;
- valores `fit` no admitidos;
- configuraciones de contenido diario con días desconocidos.

Los tests negativos del validador comprueban además que configuraciones deliberadamente erróneas den rojo.

## 11. CI y E2E

GitHub Actions no debe desplegar únicamente porque el JavaScript compile.

El pipeline debe:

1. validar configuración;
2. ejecutar tests de contratos y selección;
3. construir `dist/`;
4. abrir ese mismo `dist/` en Chromium mediante Playwright;
5. comprobar renderizado real, orientación, contenido personalizado y offline;
6. subir a Pages únicamente el artefacto que haya superado todos los pasos anteriores.

Un fallo visual, una imagen que no llegue a cargar o una regresión offline deben detener el despliegue.

## 12. Extensión

Para añadir otra universidad o curso debería bastar con sustituir o ampliar configuración y assets, sin introducir lógica específica de la institución en el runtime.

La UCM es la configuración de referencia actual, no la identidad arquitectónica de la aplicación.
