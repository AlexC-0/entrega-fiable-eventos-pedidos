# Ficha de cierre V1 — entrega-fiable-eventos-pedidos

Proyecto personal de CHAMBA DIARIA. V1 técnicamente completada para el alcance
local acordado sobre [5dc65b4](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/5dc65b41ba612493a3a96252f7718ad2a7d5bf3b), con
[CI 43425880532 success](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/actions/runs/43425880532). El Encargo 07 consolida documentos;
su publicación manual y la comprobación del nuevo commit siguen pendientes.

## Problema y solución

Recibir una confirmación ficticia de pedido, conservarla antes de aceptar y
entregarla por HTTP aunque haya errores o interrupciones, manteniendo evidencia
de lo ocurrido. API con Bearer separado para recepción/consulta, duplicados y
conflictos, estado individual, listado paginado por estado e historial de intentos.
Un trabajador independiente aplica reintentos limitados y un receptor de demostración
registra una preparación ficticia sin duplicar ese efecto.
[Alcance](PROJECT_BRIEF.md) y [contrato HTTP](HTTP.md).

## Arquitectura y tecnologías

~~~mermaid
flowchart LR
  C[Cliente] --> A[API autenticada]
  A --> E[(PostgreSQL emisor: evento, entrega e intento)]
  E <--> T[Trabajador independiente]
  T -->|HTTP: misma identidad| R[Receptor autenticado]
  R --> D[(PostgreSQL receptor: procesado y preparación)]
  R -->|Recibo después de COMMIT| T
~~~

La instancia local se comparte, pero las bases y transacciones del emisor y
receptor son independientes. Roles de ejecución ordinarios, migradores explícitos
y base de pruebas con esquemas efímeros. SQL parametrizado con pg; no hay ORM.
Node 24.13.0, TypeScript 7.0.2 ESM/NodeNext, Express 5.3.0, pg 8.23.1,
PostgreSQL 18.7 y npm 11.21.2; versiones de la implementación verificada.
GitHub Actions ejecuta PostgreSQL real en Linux; desarrollo usa PostgreSQL portátil.
[Garantías de entrega](ENTREGA.md), [núcleo](NUCLEO-COLA.md) y [CI](CI.md).

## Decisión de cola

Se evaluó pg-boss 12.38.2 antes de adoptar la cola propia. Las opciones públicas
probadas no satisfacían la conservación indefinida de pendientes sin purga;
el backoff/jitter probado tampoco coincidía con la política requerida.
La decisión conserva esos requisitos y asume mantener bloqueos, reservas,
recuperación, migraciones y almacenamiento creciente. No es un rechazo general
de pg-boss ni una comparación de rendimiento.
[Decisión y evaluación histórica](DECISION-COLA.md) y
[experimento ejecutable conservado](../experiments/cola/queue.test.ts).
pg-boss permanece solo como dependencia de desarrollo histórica, fuera del producto.

## Evidencias verificables

| Garantía | Evidencia existente |
| --- | --- |
| Persistencia antes de aceptar | Transacción de evento/entrega; core 02 y HTTP 14–15 verifican COMMIT y rollback, sin 202 anticipado |
| Deduplicación y conflictos | HTTP 03–05 y entrega 15; identidad/contenido y preparación del receptor en su propia transacción |
| Recuperación | core 13–14 y entrega 04–06: muerte real del trabajador, vencimiento y rechazo de resultados antiguos |
| Reintentos limitados | Seis reservas, bases 5/10/20/40/80 s + jitter 0–20 %, Retry-After, timeout total 5 s; core 16–17 y entrega 07–11 |
| Respuesta perdida | entrega 03 y operaciones 04: dos envíos, una preparación, ya_aplicado y entrega confirmada |
| Historial y consulta | operaciones 02–09: resultados persistidos, null legítimos, paginación precisa y lecturas sin mutación |

Enlaces a [pruebas y casos](../tests/README.md) y a la
[matriz completa de aceptación](CRITERIOS-V1.md).
El primer envío puede confirmar la preparación y perder su respuesta.
El reenvío conserva el eventoId; el receptor consulta su identidad persistida y
devuelve ya_aplicado. Puede repetirse el envío sin repetir este efecto.
No se promete entrega universal exactamente una vez; desconocido no significa
que el efecto remoto no sucedió.

## Demostración breve reproducible

Precondición: instalación, compilación y preparación/migraciones explícitas del
[README](../README.md) completadas; ningún proceso API/receptor/trabajador ya abierto.
Estos comandos existentes son instrucciones de reproducción, no ejecuciones nuevas
del cierre documental:

~~~powershell
npx --yes --package=npm@11.21.2 npm run db:portable -- up
npx --yes --package=npm@11.21.2 npm run demo:delivery
npx --yes --package=npm@11.21.2 npm run receiver:inspect
npx --yes --package=npm@11.21.2 npm run db:portable -- stop
~~~

Resultado esperado: 202/creado si la identidad aún no existía o 200/duplicado si
ya se usó; estado entregado, repetición 200/duplicado y una preparación.
La demo cierra sus tres procesos; el último comando detiene la base propia.
Con una identidad ya entregada puede no haber nuevos envíos. No borra datos para
repetir la demo. La opción --nuevo del README crea otro pedido ficticio, no reactiva
terminales ni sirve para eludir deduplicación. Consultas e interpretación en
[OPERACION](OPERACION.md).

## Fuentes y límites del cierre

- Local: STATUS, registro histórico del Encargo 06, 20 núcleo + 22 HTTP +
  21 entrega + 11 operaciones = 74 pruebas correctas. No se repitieron aquí.
- Remota: run y SHA enlazados arriba, facilitados por Alex; Codex comprobó metadatos,
  job 131887043716 y logs en el Encargo 07: las mismas cuatro suites, 74/74,
  cero fallos/omitidos/cancelados, instalación/tipos/build success.
- Revisión actual: coherencia documental, correspondencia con código/pruebas,
  enlaces, cifras y diff. No es una nueva auditoría completa.

Datos ficticios, loopback, un emisor lógico y destino fijo. Sin carga medida,
alta disponibilidad, redes externas/TLS, despliegue real, auditoría exhaustiva
o prueba de apagones prolongados. Sin frontend/panel, purga, reintento manual,
nuevos destinos ni ampliación de negocio. Sin orden de entrega garantizado ni
snapshot global entre páginas. Agotados y fallos definitivos no se reactivan;
repetir POST no reinicia su presupuesto. Las futuras versiones requieren evidencia propia.

## Participación y material reutilizable

Alex condujo el proyecto mediante encargos, fijó requisitos y límites, delegó
decisiones técnicas y realizó la publicación manual con GitHub Desktop.
Codex asistió en análisis, evaluación técnica, implementación, pruebas y documentación.
Este repositorio acredita el trabajo y las comprobaciones descritas; no demuestra
por sí solo autoría manual de todo el código, dominio individual de competencias
ni experiencia profesional o de explotación en producción.

Competencias ilustradas por artefactos: diseño de contratos HTTP y autenticación,
modelado SQL y transacciones, concurrencia y recuperación, idempotencia,
pruebas de integración con fallos reales, paginación por clave y CI reproducible.
Para atribuirlas personalmente, Alex deberá poder explicar y reproducir las decisiones.

Descripción breve reutilizable (borrador, sin publicar):

> Proyecto personal de backend en Node.js, TypeScript y PostgreSQL, desarrollado
> con asistencia de Codex. Recepción autenticada y entrega HTTP recuperable de
> eventos, con cola propia, reintentos limitados, receptor idempotente e historial
> operativo. Incluye pruebas con PostgreSQL real y CI verificable; alcance local
> con datos ficticios.

Puntos para preparar una entrevista:

- Por qué un COMMIT local no confirma el efecto remoto; explicar la respuesta perdida.
- Cómo se protege una finalización con token, intento y vencimiento tras el bloqueo.
- Qué diferencia hay entre reserva consumida, envío observado y resultado desconocido.
- Qué requisito hizo descartar las opciones de pg-boss evaluadas y qué coste se asume.
- Por qué el cursor conserva microsegundos y no garantiza snapshot entre páginas.
- Cómo se separan permisos, datos de prueba y evidencia de un commit concreto.

No se modifican ni publican CV, LinkedIn o portfolio. Próximo paso: Alex publica
el cierre y se comprueba su estado remoto. El siguiente proyecto se investigará
y seleccionará después en ChatGPT, conforme a CHAMBA DIARIA.
