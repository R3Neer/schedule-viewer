# Configuración del calendario académico

Desde la versión 2 de `config/schedules.json`, el calendario académico está separado de los datos del horario.

## Estructura

Dentro de cada curso académico existe un bloque `calendar`:

```json
{
  "calendar": {
    "sources": {},
    "terms": [],
    "holidays": [],
    "nonTeachingDays": [],
    "vacations": []
  }
}
```

### `calendar.terms`

Define únicamente las fechas lectivas de cada cuatrimestre. El campo `termId` enlaza estas fechas con el horario del mismo `id`.

```json
{"termId":"q1","start":"2026-09-07","end":"2026-12-11"}
```

### `calendar.holidays`

Festivos civiles o locales de un solo día. En móvil vertical muestran `Sin clases hoy`. En horizontal se mantiene la vista semanal del cuatrimestre.

### `calendar.nonTeachingDays`

Días académicos sin docencia que no son necesariamente festivos civiles, por ejemplo San Alberto Magno o Santo Tomás de Aquino.

### `calendar.vacations`

Periodos continuados sin docencia. Tienen precedencia sobre el cuatrimestre activo también en horizontal.

```json
{
  "id": "winter-interterm",
  "kind": "interterm",
  "label": "Periodo no lectivo entre cuatrimestres",
  "start": "2026-12-12",
  "end": "2027-01-24",
  "nextTermId": "q2",
  "showNextTermFrom": "2027-01-18"
}
```

Mientras la fecha esté dentro del periodo se muestra `Vacaciones` en horizontal. Si existen `nextTermId` y `showNextTermFrom`, a partir de esa fecha se muestra el horario semanal del siguiente cuatrimestre.

Para saltar a un curso académico distinto en el futuro se puede añadir `nextAcademicYearId`.

## Datos del horario

Los bloques `terms` que están al mismo nivel que `calendar` contienen únicamente la información del horario:

- nombre y subtítulo;
- assets;
- asignaturas;
- grupos y aulas;
- sesiones semanales.

Las fechas de inicio y fin **no deben aparecer ahí**.

## Validación

`python tools/validate_config.py` comprueba que:

- todos los términos de calendario tengan un horario correspondiente y viceversa;
- las fechas sean válidas y no estén invertidas;
- los cuatrimestres no se solapen;
- `showNextTermFrom` caiga dentro del periodo correspondiente;
- los términos referenciados existan;
- los assets diarios estén completos;
- las sesiones sean válidas y no se solapen.

La intención es que, en futuros cursos o universidades, modificar el calendario consista en cambiar datos JSON y no lógica JavaScript.
