# Proyecto 03 — Alcance propuesto

Estado: **propuesta técnica pendiente de revisión**. Proyecto elegido por Alex:
«Recepción y entrega fiable de eventos de pedidos». Las reglas detalladas
siguientes no se presentan como aprobación expresa ni como producto existente.

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

Pendiente concretar validaciones, tamaños, equivalencia de contenido (incluido
orden de líneas y campos desconocidos), respuesta a duplicados, paginación,
contrato de errores y rutas. La deduplicación de negocio debe sobrevivir a la
eliminación de registros de cola.

## Receptor y confirmación

El receptor debe confirmar en una única transacción su registro de deduplicación
y la preparación ficticia del pedido. Confirma con HTTP 200 y un recibo del mismo
evento cuyo resultado sea `aplicado` o `ya_aplicado`.
Los demás resultados no acreditan entrega. La pérdida de una respuesta no demuestra
que el efecto remoto no sucediera; se reenvía la misma identidad para deduplicar.

## Estados e intentos

Estados propuestos: `pendiente`, `en_proceso`, `esperando_reintento`,
`entregado`, `fallido_definitivo` y `agotado`.
Los intentos interrumpidos conservan resultado `desconocido`, sin inventar
un código HTTP ni afirmar que el receptor no aplicó el evento.

Registrar cada intento antes de enviar. Una reserva interrumpida consume
presupuesto. Máximo de seis intentos, incluido el inicial, y timeout HTTP inicial
de cinco segundos. Esperas base propuestas: 5, 10, 20, 40 y 80 segundos con jitter.
Respetar Retry-After válido en 429; la distribución del jitter y el tratamiento
de fechas/límites de Retry-After requieren definición explícita.

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

## Encargo inicial y trabajo posterior

Este encargo solo prepara archivos base, documentación y evaluación de cola.
No hay recepción, persistencia, autenticación, consultas, receptor ni trabajador.
La decisión y la prueba técnica futura se delimitan en
[DECISION-COLA](DECISION-COLA.md); no quedan autorizadas por documentarlas.
