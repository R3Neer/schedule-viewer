# ContentDescriptor: contenido visual configurable

La aplicación separa la selección temporal (qué toca mostrar) del renderizado (cómo se muestra). El comportamiento actual no cambia: si no hay ninguna configuración `content`, los horarios se generan como SVG en móvil y usan los WebP prerenderizados en escritorio/tablet.

## Tipos soportados

### `generated-schedule`

Mantiene el horario generado por la aplicación. Normalmente no hace falta declararlo porque es el valor por defecto.

```json
{
  "type": "generated-schedule"
}
```

### `image`

Muestra directamente un recurso en el único `<img>` de la aplicación.

```json
{
  "type": "image",
  "src": "assets/custom/miercoles.gif",
  "alt": "GIF del miércoles",
  "fit": "contain"
}
```

También se admite la forma abreviada:

```json
"assets/custom/miercoles.gif"
```

`fit` acepta `contain`, `cover`, `fill`, `none` y `scale-down`. Si se omite, usa `contain`.

El navegador decide el formato a partir del recurso. La aplicación no contiene lógica específica para GIF/PNG/JPEG/WebP/SVG/AVIF; todos pasan por el mismo renderer de imágenes. Un GIF o WebP animado conserva su animación.

## Personalizar un día

Dentro de un término se puede añadir `content.days` sin modificar `assets`, `subjects` ni `sessions`:

```json
{
  "id": "q1",
  "content": {
    "days": {
      "monday": {
        "type": "image",
        "src": "assets/custom/lunes.gif",
        "alt": "Imagen del lunes"
      },
      "wednesday": "assets/custom/miercoles.png"
    }
  }
}
```

Los días no mencionados siguen mostrando el horario generado exactamente como antes.

## Personalizar la vista semanal

```json
{
  "content": {
    "week": {
      "type": "image",
      "src": "assets/custom/semana.avif",
      "alt": "Vista semanal personalizada"
    }
  }
}
```

## Personalizar estados sin clase o vacaciones

A nivel raíz:

```json
{
  "content": {
    "states": {
      "noClassToday": {
        "type": "image",
        "src": "assets/custom/no-class.gif",
        "alt": "Hoy no hay clase"
      },
      "vacations": "assets/custom/vacaciones.svg"
    }
  }
}
```

## Assets locales y build

Los archivos personalizados se pueden guardar bajo `assets/` (por ejemplo `assets/custom/`). El build copia los assets proporcionados por el usuario al `dist` antes de generar los WebP del horario. El validador falla si un `src` local configurado no existe.

El Service Worker descubre las imágenes configuradas mediante `content` y las precachea, además de los assets tradicionales del horario. Las URL `data:` y `blob:` no necesitan precaché; los recursos remotos no se precachean para no convertir el modo offline en una lotería de CORS.

## Compatibilidad

`assets.week` y `assets.days` siguen siendo obligatorios por ahora porque son los fallbacks de escritorio y alimentan el generador existente. `content` es una capa opcional de override. Esto permite introducir imágenes personalizadas sin migrar ni romper la configuración actual.
