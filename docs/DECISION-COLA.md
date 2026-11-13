# Decisión de cola — propuesta pendiente

Fecha de consulta: 13 de noviembre de 2026.
**Recomendación provisional: evaluar primero pg-boss 12.38.2 sobre PostgreSQL 18.**
No está instalado ni aprobado como mecanismo definitivo. La elección depende
de una prueba ejecutable de atomicidad, interrupciones, historial y Retry-After.
No se propone infraestructura adicional ni implementar dos colas.

## Compatibilidad y fuentes

El registro npm consultado con `npm view` declara pg-boss 12.38.2, Node
>=22.12.0 y peer `@opentelemetry/api ^1.9.0`; no devolvió
peerDependenciesMeta. Su README publicado indica PostgreSQL >=13.
Node 24.13.0 satisface engines; PostgreSQL 18 es candidato dentro de ese rango,
pero no se ha ejecutado esa combinación. El peer deberá revisarse al autorizar
la instalación; no se ha añadido a esta base ni se promete un árbol sin avisos.
Referencia de versión: [registro npm de pg-boss](https://www.npmjs.com/package/pg-boss/v/12.38.2).

Las páginas consultadas muestran 12.38.2, pero son documentación viva:
la prueba deberá fijar versión y contrastar su API/tipos reales.

## Lo documentado

| Aspecto | Evidencia oficial y alcance |
| --- | --- |
| Atomicidad | send, insert, fetch y complete aceptan un adaptador db de una transacción existente. Un rollback revierte también el trabajo. [Adapters](https://pgboss.io/api/adapters). |
| Reserva | PostgreSQL usa SKIP LOCKED para distribuir trabajos; pueden ejecutarse más de una vez tras fallos. [Introducción](https://pgboss.io/introduction). |
| Reintentos | retryLimit cuenta reintentos: cinco permiten hasta seis ejecuciones incluyendo la inicial. retryDelay/retryBackoff incorporan espera y jitter; no equivalen automáticamente a la política HTTP del proyecto. [Queues](https://pgboss.io/api/queues). |
| Expiración | expireInSeconds limita el tiempo activo; heartbeat detecta pérdida de actividad. Ambos pueden provocar fallo/reintento. El handler antiguo puede continuar. [Queues](https://pgboss.io/api/queues). |
| Supervisión | supervise habilita mantenimiento y monitorización; la recuperación requiere supervisión operativa, no ocurre mientras todos los procesos están apagados. Los intervalos añaden demora. [Constructor](https://pgboss.io/api/constructor). |
| Ejecución antigua | Las operaciones que reciben id y retryCount del trabajo se condicionan al intento reservado; solo id puede afectar al intento actual. [Jobs](https://pgboss.io/api/jobs). |
| Historial | La cola conserva metadatos de trabajo, no el historial de negocio requerido. La retención puede eliminar registros pendientes o terminales. [Jobs](https://pgboss.io/api/jobs). |
| HTTP | Un worker transaccional engloba su handler en una transacción; no sirve para envolver nuestra espera HTTP. [Workers](https://pgboss.io/api/workers). |

Un timeout HTTP de cinco segundos y la expiración de reserva son relojes distintos.
El segundo necesita margen para trabajo de base de datos y cierre, y debe medirse.
La exclusión de reservas no garantiza un único efecto HTTP externo.

## Diseño candidato que exige prueba

Las siguientes son propuestas de integración propias, no garantías de pg-boss.

**Entrada atómica.** Adquirir un único cliente PostgreSQL, abrir transacción,
resolver unicidad de eventoId/pedidoId y guardar evento; pasar a send un adaptador
executeSql que use exactamente ese cliente, nunca pool.query. Confirmar solo si
existe el trabajo esperado y el COMMIT tuvo éxito; después responder 202.
Un fallo al encolar revierte el evento. Si la respuesta se pierde, el emisor puede
repetir la misma identidad. El adaptador directo evita introducir un ORM.

**Reserva e historial.** Evaluar fetch con db dentro de una transacción corta que
también registre la reserva en una tabla propia de intentos y actualice la
generación de la entrega. Si cualquiera falla, rollback de ambos. Al confirmar,
esa reserva consume presupuesto aunque el proceso muera antes de enviar.
Cada reserva permite como máximo un envío: ninguna biblioteca HTTP añadirá
reintentos ocultos. Guardar eventoId, id de trabajo, retryCount, número de intento,
generación, marcas temporales y resultado seguro; no credenciales ni payloads
privados. Una ejecución de supervisión o conciliación no cuenta como envío.

**Un solo planificador.** pg-boss sería dueño de disponibilidad y recuperación,
con retryLimit=5 como punto de partida. El dominio clasifica el resultado y
conserva el presupuesto, pero no añade otro bucle que vuelva a encolar los mismos
eventos. Para errores reintentables se propone cerrar el intento y llevar el
trabajo a retry mediante su API en una transacción corta. Retry-After requiere
demostrar una transición atómica que respete la fecha mínima y el backoff:
no basta cambiar startAfter después de liberar la transacción, por la carrera
con otro trabajador. Tampoco basta dormir dentro del handler.

Jobs documenta update para trabajos todavía no activos; no demuestra por sí
solo toda la secuencia fail + ajuste de espera, su adaptador transaccional y
el bloqueo frente a fetch. Ese es un criterio de aceptación de la prueba.
Si no puede resolverse con API pública y sin carreras, no se aprobará esta
integración ni se sustituirá en silencio por SQL contra tablas internas.
La fórmula de jitter nativa también debe medirse frente a las bases propuestas;
no se afirma que activar retryBackoff reproduzca exactamente 5/10/20/40/80.

**Finalización y protección.** Tras HTTP, una transacción corta compara la
generación propia y la reserva vigente, guarda resultado y finaliza el trabajo
usando el objeto con retryCount. Si la operación de cola no afecta al intento
esperado, rollback de los cambios de dominio. Una generación propia aislada
no basta si la cola ya ha invalidado la reserva; hay que comprobar ambas.
Para un fallo definitivo se propone cerrar el trabajo como procesado junto al
estado propio fallido_definitivo: completed de cola no significaría entregado.
La API consultable usa siempre el estado propio. Probar carreras con expiración,
otra reserva, conciliación y respuestas tardías.

**Agotamiento sin handler.** Una conciliación idempotente al arrancar y durante
la supervisión debe observar el estado persistido de cola y reservas propias.
Marca interrumpidas como desconocidas y proyecta agotado cuando la cola haya
consumido su última ejecución, incluso si murió en la sexta reserva.
Solo concilia; no reenvía ni decide un calendario paralelo. Debe usar la misma
protección de generación, preservar terminales ya confirmados y recuperarse
si ella misma se interrumpe. No basta un callback en memoria o un finally.

**Conservación.** Eventos, estados e intentos viven en tablas propias,
sin borrado en cascada desde la cola. No se purgan en V1. Los trabajos sin
conciliar deben permanecer hasta consolidar su estado; retenciones finitas
por defecto no prueban esta garantía durante una parada prolongada.
Evaluar retención terminal desactivada y tratamiento explícito de pendientes;
si puede desaparecer evidencia antes de conciliar, el diseño no pasa.
Una futura eliminación de trabajos ya consolidados no debe borrar el historial.
Ausencia de un job no equivale a entrega ni permite inventar un agotamiento.

El receptor necesita su propia deduplicación transaccional del efecto ficticio.
Incluso con todos estos controles, un proceso antiguo puede haber enviado;
la confirmación del efecto externo no comparte transacción con nuestra base.

## Esquemas, migraciones y permisos

pg-boss instala objetos en un esquema dedicado (por defecto pgboss).
La [guía de instalación](https://pgboss.io/install) describe CREATE y alternativas
para generar/revisar SQL. Propuesta: esquema exclusivo p03_cola separado de
p03_app, misma base para la atomicidad de entrada; migraciones explícitas
versionadas para negocio y planes de la versión fijada para la cola.

Un rol propietario realiza DDL; los roles ordinarios de ejecución reciben solo
CONNECT, USAGE, operaciones de tablas/secuencias y funciones necesarias según
los planes revisados. No se afirma que esa lista genérica sea suficiente:
probar permisos de reserva, supervisión, mantenimiento y creación de colas.
Preparar colas en migración, no al recibir eventos.
En ejecución, evaluar migrate:false y createSchema:false; las opciones están
descritas en [Constructor](https://pgboss.io/api/constructor).
No conceder superusuario ni DDL global para evitar diagnosticar un fallo.

## Comparación con cola propia

| Opción | Ventaja | Coste o condición |
| --- | --- | --- |
| pg-boss | Aporta reserva, recuperación y planificación mantenidas por una biblioteca. | Integrar historial, presupuesto, retención y Retry-After sin carreras; fijar API y migraciones. |
| Cola propia PostgreSQL | Control directo de reserva, nextAttemptAt, generación e historial en transacciones propias. | Diseñar y mantener arrendamientos, recuperación, concurrencia, backoff, índices y operaciones. |

[SELECT de PostgreSQL 18](https://www.postgresql.org/docs/18/sql-select.html)
explica que SKIP LOCKED evita esperar filas bloqueadas y ofrece una vista
inconsistente adecuada para consumidores de una cola. No proporciona por sí
solo recuperación, reintentos ni deduplicación externa.

Primero demostrar pg-boss. Si sus APIs públicas obligan a un segundo planificador
o no permiten conservar el contrato, presentar la evidencia y decidir con Alex
si una cola propia más pequeña es preferible. No construir ambas.

## Próxima comprobación técnica delimitada

Requiere otro encargo: instalar temporalmente las dependencias elegidas y preparar
PostgreSQL 18 exclusivo del Proyecto 03, sin usar instalaciones privadas de otros
proyectos. Base propuesta de pruebas: entrega_fiable_eventos_pedidos_test.
Exigir TEST_DATABASE_URL y current_database() antes de preparar o limpiar.
Cada ejecución crea esquemas propios de negocio/cola y cierra todos los recursos
antes de eliminarlos; ausencia de base debe fallar, no omitir casos.

La prueba debe demostrar, con evidencia persistida:

1. COMMIT/ROLLBACK conjunto de evento y trabajo; duplicados y conflictos concurrentes.
2. Reserva e intento atómicos, fallo antes/después del COMMIT y antes de HTTP.
3. Recuperación tras matar el proceso, incluida sexta reserva y resultado desconocido.
4. Nunca séptimo envío; distinción verificable entre reservas y solicitudes observadas.
5. Timeout, 429 con Retry-After y backoff/jitter sin dos programadores de reintentos.
6. Recibos válidos, inválidos, 2xx sin recibo, 4xx definitivos y redirecciones sin seguir.
7. Ejecución antigua incapaz de sobrescribir otra, incluso tras expiración.
8. Historial íntegro después de mantenimiento/eliminación controlada de jobs
   ya consolidados; conservación durante parada y reanudación de conciliación.
9. Permisos ordinarios, migraciones repetibles y ninguna transacción abierta
   mientras el receptor retrasa su respuesta.

Esta sesión solo consultó fuentes y comprobó la base TypeScript: **ninguna de
estas pruebas de cola se ha ejecutado**. Se accedió a las fuentes requeridas.
Dos rutas inicialmente supuestas, /guide/database-install y /backends, fallaron;
se resolvieron con los enlaces oficiales /install y /database-backends.
