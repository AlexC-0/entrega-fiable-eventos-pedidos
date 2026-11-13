# Proyecto 03 — Alcance vigente

El Encargo 05 completó el recorrido local: recepción autenticada, persistencia,
trabajador HTTP y receptor idempotente con preparación ficticia en base separada.
Se conservan el [contrato HTTP](HTTP.md), la cola propia y seis intentos totales.
La política, diagnósticos, permisos y demostración están en [ENTREGA](ENTREGA.md).
Los reenvíos son posibles; este receptor deduplica su efecto transaccionalmente.
No se promete entrega universal exactamente una vez.

El Encargo 06 incorporó listado paginado por estado, historial HTTP de intentos,
[operación](OPERACION.md), [matriz V1](CRITERIOS-V1.md) y [CI](CI.md).
El Encargo 07 registra V1 técnicamente completada sobre [5dc65b4](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/5dc65b41ba612493a3a96252f7718ad2a7d5bf3b) y [CI 43425880532: success](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/actions/runs/43425880532).
Las pruebas y límites se consolidan en la [ficha de cierre](FICHA-V1.md).
El cierre documental queda pendiente de publicación manual y comprobación de su
nuevo commit; no se atribuye a ese futuro commit la ejecución anterior.

## Objetivo y límites

Persistir eventos antes de confirmar su aceptación y entregar por HTTP mediante
un trabajador recuperable, con reintentos limitados y un historial consultable.
Entorno local, datos ficticios, un emisor lógico y un destino fijo.
V1 sin orden garantizado, reintento manual ni purga automática.
No se promete entrega universal exactamente una vez.

## Recepción e identidad

Un evento `pedido.confirmado`, versión 1, con `eventoId` UUID, `ocurridoEn`
UTC y `datos` con `pedidoId` y líneas de `sku`/`cantidad`.
Una confirmación por pedido en V1.

- Mismo eventoId y contenido equivalente: duplicado reconocido sin nuevo trabajo.
- Mismo eventoId con contenido distinto: conflicto.
- Nuevo eventoId para un pedido ya confirmado: conflicto.
- Evento y trabajo pendiente en la misma transacción, confirmada antes del HTTP 202.
- Consulta individual autenticada de estado, contador y fechas; historial HTTP de hasta seis intentos.
- Credenciales diferentes de recepción, consulta y entrega, en variables de entorno.

Contrato concretado en [HTTP](HTTP.md): JSON UTF-8 hasta 64 KiB, propiedades cerradas,
UUID canónico minúsculo, fecha UTC real, identificadores ASCII de 1–100 caracteres,
1–100 líneas con SKU únicos y cantidad entera 1–1.000.000. Sin coerción ni trim.
200 para duplicado, 202 tras COMMIT y 409 para conflicto. Bearer diferentes para
recepción/consulta. GET individual no expone tokens ni cuerpo completo.
El núcleo compara el sobre completo mediante jsonb; no importa el orden de claves,
sí el de líneas. No se eliminan identidades, entregas ni historial por antigüedad.
Listado por clave ascendente (creado_en, evento_id), filtro opcional por estado,
límite 20 por defecto y 1–100; cursor opaco ligado al filtro y preciso a microsegundos.
Consultas solo de lectura, sin total ni snapshot global entre páginas.

## Receptor y confirmación implementados

El receptor confirma en una única transacción su registro de deduplicación
y la preparación ficticia del pedido. Confirma con HTTP 200 y un recibo del mismo
evento cuyo resultado sea `aplicado` o `ya_aplicado`.
Los demás resultados no acreditan entrega. La pérdida de una respuesta no demuestra
que el efecto remoto no sucediera; se reenvía la misma identidad para deduplicar.

## Estados e intentos

Estados implementados en el núcleo: `pendiente`, `en_proceso`, `esperando_reintento`,
`entregado`, `fallido_definitivo` y `agotado`.
Los intentos interrumpidos conservan resultado `desconocido`, sin inventar
un código HTTP ni afirmar que el receptor no aplicó el evento.

Registrar cada intento antes de enviar. Una reserva interrumpida consume
presupuesto. Máximo de seis intentos, incluido el inicial, y timeout HTTP inicial
de cinco segundos, incluida la lectura del recibo. Reserva inicial del núcleo: 30 s.
Bases aprobadas: 5, 10, 20, 40 y 80 segundos, con jitter entre 0 y 20 %.
El núcleo acepta una fecha mínima absoluta y toma el máximo con el backoff.
El trabajador analiza Retry-After en 429 como segundos o fecha HTTP, sin recortar esperas válidas.

| Resultado observado | Tratamiento implementado |
| --- | --- |
| HTTP 200 con recibo válido del mismo evento | Entregado |
| Error de conexión, timeout, 408, 429 o 5xx | Reintentar dentro del presupuesto |
| Recibo inválido o 2xx sin confirmación válida | Resultado incierto; reintentos limitados |
| Otros 4xx o redirecciones | Fallo definitivo para automatización V1 |
| Presupuesto consumido sin confirmación | Agotado |

No seguir redirecciones. Recuperar reservas tras terminar abruptamente el
trabajador e impedir que ejecuciones antiguas sobrescriban resultados posteriores.
No mantener transacciones abiertas durante la espera HTTP.
Separar ejecución de cola, reserva de intento y envío HTTP realmente observado.

## Continuidad de encargos

Encargo 01: base y propuesta. Encargo 02: experimento pg-boss publicado, conservado
como histórico. Encargo 03: migraciones y núcleo propio con pruebas PostgreSQL.
La decisión, sus motivos y costes están en [DECISION-COLA](DECISION-COLA.md).
Encargo 04: recepción HTTP autenticada, consulta individual y entorno de desarrollo
separado con migración explícita.
Encargo 05: trabajador independiente y receptor idempotente, migración 002 y
pruebas de recuperación, red y efecto único; publicado en f9a427a.
Encargo 06: consultas, operación y CI; publicado en 5dc65b4, con run 43425880532 success.
Encargo 07: cierre técnico documentado y evidencias, sin ampliar el producto.
Siguiente paso: Alex publica este cierre y se comprueba el estado remoto.
El siguiente proyecto se investigará y seleccionará después en ChatGPT.
