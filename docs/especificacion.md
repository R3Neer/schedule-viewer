# Especificación — Schedule Viewer v4

Schedule Viewer es un visor declarativo de imágenes temporales.

La fuente es YAML y el build produce JSON normalizado. El mismo contrato v4 se usa en el editor y las copias de seguridad.

Las responsabilidades se separan así:

```text
periodo vigente
→ estado efectivo del calendario
→ presentación vertical u horizontal
→ unidad vertical o imagen horizontal fija
→ resolución y renderizado del asset
```

El runtime no presupone que el fin de semana sea inactivo ni que una semana sea un horario. Retrato y paisaje eligen presentaciones; el calendario decide si la fecha está activa.

La referencia normativa está en [`config-v4.md`](config-v4.md), la persistencia en [`local-config.md`](local-config.md) y la barrera de aceptación en [`qa.md`](qa.md).
