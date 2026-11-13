# Núcleo persistente — Encargo 03

El producto usa exclusivamente una cola propia PostgreSQL. Su interfaz TypeScript
se exporta desde [src/index.ts](../src/index.ts); no arranca procesos ni carga .env,
no envía HTTP y no importa pg-boss.

## Modelo y migraciones

La [migración 001](../src/persistence/migrations/001-core.ts) crea:

| Tabla | Responsabilidad |
| --- | --- |
| evento | UUID único, pedidoId único, contenido jsonb y fecha; trigger rechaza UPDATE/DELETE |
| entrega | Una fila por evento; estado, contador 0–6, próxima ejecución, token y vencimiento |
| intento | Una fila por evento/número 1–6; token único, inicio, vencimiento y resultado persistido |
| migracion | Versión, SHA-256 del SQL y fecha de aplicación |

Las claves foráneas y CHECK restringen estados, presupuesto y nulabilidad temporal.
Hay índices parciales para entregas disponibles y vencidas.
No existen purgas ni eliminación en cascada de negocio.
La inmutabilidad protege operaciones ordinarias de fila; no es una defensa contra
un administrador que altere triggers, haga TRUNCATE o borre el esquema.

[applyMigrations](../src/persistence/migrate.ts) es explícito: recibe un pool y un
esquema previamente creado por el llamador, cuyo nombre debe ser p03_ seguido de
1–55 caracteres ASCII minúsculos, dígitos o guion bajo.
No crea bases ni roles, no se ejecuta al construir PostgresQueue.
Serializa migradores con un bloqueo asesor transaccional, ejecuta DDL y registro
en la misma transacción, y rechaza versiones desconocidas o hashes alterados.
Tras publicar una migración, los cambios requieren una versión nueva.

Para reproducirla: build y test:core, siguiendo [README](../README.md).
Cada fixture crea un esquema exclusivo, aplica dos veces esta misma migración y
comprueba una única versión. El caso 01 añade llamadas concurrentes y rechazo
de un hash alterado. No se ha migrado ninguna base de negocio permanente.

## Operaciones

`new PostgresQueue(pool, schema)` usa la política inicial.
El pool pertenece al llamador y este debe cerrarlo al terminar.
Las operaciones abren transacciones con un mismo cliente, lo liberan al confirmar
o revertir y no aceptan callbacks de operaciones externas.

| Operación | Resultado y transición |
| --- | --- |
| registrar(evento) | COMMIT conjunto de evento y entrega pendiente; devuelve creado o duplicado |
| reservar() | Selecciona disponible, pasa a en_proceso, incrementa contador, genera token y registra intento; devuelve reserva o undefined |
| finalizar(reserva, resultado) | Devuelve true solo para token/número vigentes y no vencidos; resultado entregado, fallido_definitivo o reintentar |
| recuperarVencidas(limite) | Cierra intentos vencidos como desconocido y devuelve cantidad recuperada; límite predeterminado 50, admitido 1–100 |

Un reintento pasa a esperando_reintento si quedan reservas, o agotado tras la sexta.
Un resultado entregado deja el intento como confirmado; un fallo permanente,
como fallido_definitivo; un fallo recuperable, como reintentable, también cuando
el sexto consume el presupuesto. La recuperación conserva desconocido incluso
al marcar agotado. Desconocido nunca significa que no haya ocurrido un efecto remoto.

La recuperación es una primitiva que el futuro trabajador deberá invocar al arrancar
y periódicamente. No hay demonio en este encargo: mientras nadie la invoca, una
reserva vencida puede seguir visible como en_proceso, pero ya no puede finalizarse.
Una ejecución repetida no vuelve a consumir presupuesto ni cambia un terminal.

## Identidad y equivalencia

El núcleo recibe `{ eventoId, pedidoId, contenido }`.
eventoId es UUID; pedidoId es texto no vacío exacto, sin trim ni normalización.
contenido es un objeto JSON. Se rechazan valores no JSON, ciclos, números no finitos,
NUL y surrogates aislados; no se define aún un contrato de recepción HTTP.

Duplicado significa mismo UUID, mismo pedidoId y contenido igual según jsonb.
El orden de claves de objetos y los espacios de la serialización no importan.
El orden de arrays, campos adicionales, valores y tipos sí participan.
Los números llegan como números JavaScript serializados: 1 y 1.0 son equivalentes;
esto no garantiza conservar precisión de enteros arbitrariamente grandes.
No se normalizan textos Unicode ni se ignoran campos desconocidos.

El mismo UUID con otra identidad de pedido o contenido produce ConflictoEvento
(identidad_reutilizada). Otro UUID para el mismo pedido produce pedido_ya_confirmado,
aunque el contenido coincida. Las restricciones únicas resuelven las carreras.
No se elimina la identidad tras entregar o agotar, por lo que sigue deduplicando.

Esta equivalencia pertenece a la interfaz del núcleo; el futuro contrato HTTP debe
definir explícitamente estructura, límites, validación y traducción a esta interfaz.

## Bloqueo, reserva y ejecución antigua

El **bloqueo de fila** dura solo la transacción de selección o actualización:
evita que dos operaciones modifiquen esa fila a la vez.
FOR UPDATE SKIP LOCKED permite a otro consumidor tomar una fila diferente sin
esperar la ocupada. No implica orden garantizado ni equidad entre consumidores.
Véase [SELECT de PostgreSQL 18](https://www.postgresql.org/docs/18/sql-select.html).

La **reserva temporal** permanece guardada después del COMMIT y de liberar el bloqueo:
autoriza ese intento durante 30 segundos, sin mantener una conexión ocupada durante
el futuro envío. Cada reserva confirmada consume un intento, aunque el proceso
muera antes de enviar. No se renueva en este encargo.

La **protección frente a ejecución antigua** compara token aleatorio y número,
estado en_proceso y vencimiento. finalizar primero adquiere el bloqueo y después
lee clock_timestamp: si venció esperando ese bloqueo, rechaza el resultado.
Entrega e historial se actualizan juntos. Una respuesta antigua nunca confirma,
reprograma ni falla una reserva recuperada ni un terminal.

La validez se decide en la actualización protegida; el bloqueo impide una
recuperación contradictoria hasta el COMMIT, aunque este termine más tarde.
No se usa CURRENT_TIMESTAMP para vencer: representa el inicio de la transacción.
Véanse [funciones temporales](https://www.postgresql.org/docs/18/functions-datetime.html)
y [transacciones con el mismo cliente pg](https://node-postgres.com/features/transactions).

Esta protección afecta a nuestra base, no cancela un envío externo ya iniciado.
Un resultado incierto del COMMIT tampoco autoriza a inventar un rollback exitoso:
el emisor puede repetir su misma identidad y un trabajador debe recuperar desde
el estado persistido. El futuro receptor necesitará deduplicar su propio efecto.

## Tiempo y reintentos

PostgreSQL fija disponibilidad, inicio, vencimiento y finalización con reloj del
servidor. Se conserva precisión nativa al copiar las fechas al historial;
las fechas Date devueltas a Node no deciden vencimiento ni constituyen evidencia
de precisión submilisegundo.

Política inicial: reserva 30 s y seis intentos totales. Para n = 1…5:

`espera = 5000 ms × 2^(n−1) × (1 + random() × 0.2)`

Ventanas: 5–6, 10–12, 20–24, 40–48 y 80–96 segundos.
La fecha siguiente es el máximo de reloj PostgreSQL + espera y fechaMinima opcional.
Se calcula bajo el mismo bloqueo y transacción que el estado y el historial,
sin ventana intermedia disponible. La recuperación usa la misma fórmula.
El reloj del servidor debe mantenerse correctamente sincronizado; no se ha probado
tolerancia a saltos arbitrarios del reloj del sistema.

Se admite una fecha mínima absoluta ya calculada. No se analiza Retry-After,
no hay timeout HTTP implementado; los 5 segundos previstos corresponden al
siguiente trabajo de envío. Los parámetros no son métricas de rendimiento.

## Comprobación y límites

[Pruebas](../tests/core/queue.test.ts): PostgreSQL real, un worker del runner,
concurrencia explícita dentro de casos, sin mocks, skip ni reintentos del runner.
Perfil habitual 1,5 s de reserva y base 20 ms; hijos con reserva 1 s.
El caso 16 verifica fechas programadas con bases reales y reserva de 30 s;
adelanta disponibilidad con fixtures entre intentos, no espera los 155 s base.
El caso 17 espera realmente la fecha mínima reducida.
No se evalúa estadísticamente la distribución del jitter.

Casos 13/14 matan realmente procesos después del COMMIT de reserva; no ejecutan
finally para recuperar. Otros casos preparan vencimientos con SQL de fixture.
El trabajo de tres años se prepara como dato antiguo, no como una parada real.
Los esquemas se limpian después de cerrar hijos/pools y verificar current_database.
El rol ordinario de prueba tiene DDL en sus esquemas; falta diseño de permisos
mínimos para una futura ejecución permanente.

Costes asumidos: mantener migraciones, bloqueos, recuperación, política temporal,
índices, observabilidad futura y capacidad de almacenamiento sin purga.
No hay mediciones de carga, alta disponibilidad, caída de PostgreSQL, protocolo
HTTP, seguridad de endpoints, API de consulta ni idempotencia del receptor.
El próximo encargo será recepción HTTP autenticada, sin iniciarlo aquí.
