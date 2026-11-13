# Proyecto 03 — Alcance vigente y propuesta futura

El Encargo 03 autoriza y concreta el núcleo de cola propia PostgreSQL, tras la
decisión delegada por Alex. Persistencia, identidad, estados, seis intentos,
conservación sin purga y política temporal están implementados y probados según
[NUCLEO-COLA](NUCLEO-COLA.md) y [STATUS](STATUS.md).
El resto del contrato HTTP y del receptor sigue siendo propuesta para futuros
encargos; documentarlo no autoriza implementarlo ahora.

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
- Consultas autenticadas de eventos, estado e intentos.
- Credenciales diferentes de recepción, consulta y entrega, en variables de entorno.

Pendiente concretar validaciones HTTP, tamaños, respuesta a duplicados, paginación,
contrato de errores y rutas. El núcleo ya compara contenido con igualdad jsonb:
ignora orden de claves de objetos, conserva orden de arrays e incluye campos extra.
La adaptación al contrato HTTP se decidirá expresamente. La identidad se conserva
junto a la entrega y el historial, sin eliminación por antigüedad.

## Receptor y confirmación

El receptor debe confirmar en una única transacción su registro de deduplicación
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
de cinco segundos, aún sin implementar HTTP. Reserva inicial del núcleo: 30 s.
Bases aprobadas: 5, 10, 20, 40 y 80 segundos, con jitter entre 0 y 20 %.
El núcleo acepta una fecha mínima absoluta y toma el máximo con el backoff.
Analizar Retry-After en HTTP 429 y definir fechas/límites corresponde a otra fase.

| Resultado observado | Tratamiento propuesto |
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
No hay aún recepción HTTP, autenticación, consultas HTTP, receptor ni trabajador
continuo. El siguiente encargo será recepción HTTP autenticada sobre este núcleo.
