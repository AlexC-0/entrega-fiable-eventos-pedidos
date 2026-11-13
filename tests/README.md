# Pruebas del núcleo propio — Encargo 03

Código: [tests/core/queue.test.ts](core/queue.test.ts).
Reproducción desde la raíz con los comandos de [README](../README.md):
instalación, PostgreSQL portátil existente, typecheck, build y test:core.
No se ejecuta test:queue como parte de las pruebas del producto.

Veinte casos distintos con PostgreSQL real; un worker del runner, sin skip,
sin mocks ni reintentos automáticos. Concurrencia explícita dentro de los casos.
TEST_DATABASE_URL es obligatoria y una conexión ausente falla.
Antes de crear o limpiar se exige current_database exacta y rol ordinario.
Cada fixture crea un esquema p03_core_ aleatorio, aplica las migraciones de src
y cierra sus pools e hijos antes de borrar únicamente ese esquema.
El caso final detecta residuos; no elimina esquemas de otra ejecución a ciegas.

| Caso | Garantía comprobada |
| --- | --- |
| 01 | Migración repetible/concurrente, hash alterado rechazado e inmutabilidad de evento |
| 02 | Evento y entrega juntos tras COMMIT; error SQL revierte la aceptación entera |
| 03 | Equivalencia jsonb, orden de arrays y conflictos por identidad/pedido |
| 04 | Duplicados y conflictos concurrentes: una sola aceptación por identidad/pedido |
| 05 | Consumidores concurrentes: una reserva por entrega; entregas diferentes pueden reservarse |
| 06 | Error al registrar intento revierte contador, token y estado de reserva |
| 07 | Finalización vigente y conservación de terminal ante repetición |
| 08 | Ejecución antigua rechazada para confirmar, reprogramar y fallar otra reserva |
| 09 | Vencimiento rechaza resultados incluso antes de ejecutar recuperación |
| 10 | Finalización bloqueada realmente hasta vencer; se consulta reloj después de esperar |
| 11 | Dos recuperadores y finalización concurrentes: una recuperación; historial y backoff coherentes |
| 12 | Finalización vigente frente a recuperación sin vencimiento: entrega confirmada |
| 13 | Muerte real de hijo tras COMMIT de primera reserva; otra instancia recupera sin finally |
| 14 | Muerte real en sexta reserva: desconocido, agotado, seis intentos y ninguna séptima reserva |
| 15 | Error SQL del historial revierte tanto finalización como recuperación |
| 16 | Reserva de 30 s, cinco bases reales con jitter acotado y agotamiento en sexta |
| 17 | Fecha mínima futura respetada realmente; una fecha antigua no reduce el backoff |
| 18 | Fixture de trabajo antiguo conserva disponibilidad, identidad e historial |
| 19 | Fallo definitivo cierra en primer intento sin reintentar |
| 20 | Otra base real rechazada antes de escribir; cero esquemas propios residuales |

Perfil habitual: reserva 1,5 s y base de reintento 20 ms; hijos: reserva 1 s.
Los casos 13 y 14 terminan procesos reales con SIGKILL (terminación forzada en
Windows), después de comprobar que confirmaron la reserva, y esperan su salida.
El caso 10 espera el vencimiento real mientras otra transacción bloquea la fila.
Los casos 08, 09, 11 y 15 preparan vencimientos mediante SQL de fixture.
El caso 18 inserta fechas antiguas; no se mantiene el sistema apagado durante años.

El caso 16 comprueba fechas de PostgreSQL con política real 30 s y bases
5/10/20/40/80 s; adelanta disponibilidad entre reservas, por lo que no mide
esperas reales de esa duración. El caso 17 sí espera una fecha mínima de 300 ms.
No se demuestra distribución estadística del jitter ni rendimiento.

Resultados exactos de las ejecuciones en [STATUS](../docs/STATUS.md).
Las repeticiones no multiplican el número de casos distintos.
No hay HTTP ni efecto de negocio en estos casos; el experimento HTTP histórico
no acredita que el receptor futuro deduplique sus efectos.

---

## Histórico: pruebas de pg-boss del Encargo 02

Se conserva debajo el registro anterior. Para reproducirlo de forma explícita,
con build y PostgreSQL preparados: test:guards y test:queue, usando npm 11.21.2.
No se ha repetido en el Encargo 03. Sus expresiones sobre producto o migraciones
pendientes describen el estado de aquella evaluación.

# Prueba técnica de cola — Encargo 02

Código: [experiments/cola](../experiments/cola/queue.test.ts).
Ejecutar desde la raíz los comandos de [README](../README.md), con build previo.
`test:guards` no necesita base; `test:queue` exige PostgreSQL real y
TEST_DATABASE_URL. No hay mocks de la cola, skip, reintentos del runner ni
pruebas de producto. Un archivo de pruebas, concurrencia 1 y límite global 180 s.

| Caso | Evidencia que comprueba |
| --- | --- |
| A | Evento/trabajo juntos tras COMMIT; ambos revierten en ROLLBACK; cola inexistente provoca error sin evento huérfano |
| B | NOT NULL provocado al registrar intento revierte fetch; dos consumidores obtienen una sola reserva |
| C | Hijo terminado con SIGKILL tras COMMIT de primera y sexta reservas; supervisor vivo recupera; seis intentos, cuatro HTTP, dos desconocidos; conciliación idempotente tras reinicio y ningún séptimo envío |
| D | Tras expiración y nueva reserva, complete antiguo no afecta a cola ni dominio; tampoco sobrescribe la confirmación posterior |
| E | HTTP 503 y 429 reales; fail/findJobs/update con el mismo cliente transaccional; consumidor concurrente no reserva entre fail y update; envío posterior respeta Retry-After |
| F1 | Rol ordinario, ninguna transacción abierta de los participantes durante HTTP retenido, terminal conservado y borrado explícito de job sin perder historial propio |
| F2 | retentionSeconds=0 rechazado; pendiente con retención de un segundo eliminado por supervisión pese a deleteAfterSeconds=0; no se inventa resultado al faltar evidencia |
| G | Conexión real a postgres rechazada por current_database antes de escribir |
| H | Ningún esquema de experimento residual; solo lectura, no elimina residuos ajenos |
| Control | Variable ausente, URL inválida y base incorrecta rechazadas antes de conectar |

El éxito del caso F2 demuestra una limitación, no compatibilidad con retención
indefinida. Dos ejecuciones de nueve casos no son dieciocho pruebas distintas:
total de casos versionados = 10 contando el control.

## Modelo y permisos

Solo evento UUID, entrega con job/generación/estado e intento numerado.
Preparación del cluster con rol separado; la suite usa p03_prueba, ordinario.
Cada fixture confirma base/rol, crea dos esquemas aleatorios p03_app_/p03_cola_,
prepara tablas propias y ejecuta la instalación pública de pg-boss como propietario
de esos esquemas. El objeto de ejecución usa migrate:false/createSchema:false.

El rol de experimento mantiene permiso de CREATE en la base, necesario para los
fixtures; no es una auditoría completa de permisos mínimos para producción.
Las migraciones de negocio definitivas todavía no existen.

Se cierra instalador, consumidores, servidor HTTP, supervisores y pools antes
de borrar únicamente los esquemas identificados como creados por ese fixture.
Nunca se escribe SQL de aplicación en tablas internas de pg-boss.
No hay otra cola ni calendario paralelo; until solo observa o intenta consumir
trabajo disponible para coordinar la prueba.

## Tiempos y límites

Perfil acelerado: reserva de dos segundos (quince en HTTP), supervisión,
monitor y mantenimiento de un segundo. Timeout HTTP de cinco segundos.
RetryLimit=5: inicial + cinco reintentos. E usa retryDelay=1 con backoff nativo;
los otros casos usan cero para acotar duración. Retención habitual del fixture:
un día; F2 usa un segundo. Terminales: deleteAfterSeconds=0.

Retry-After probado solo como delta de dos segundos. No se implementan fechas
HTTP, validación exhaustiva de recibos, seguridad de endpoints ni toda la
clasificación V1. El servidor devuelve respuestas de laboratorio, sin efecto
de pedido ni deduplicación de negocio.

Las esperas nativas se registran en los diagnósticos. No se ha probado la
distribución estadística del jitter ni las esperas V1 de 5/10/20/40/80.
No se afirma haber simulado días de apagado: F2 provoca caducidad real corta.
Las pruebas observan seguridad local de reserva y estado; no prueban que un
efecto HTTP externo se ejecute universalmente exactamente una vez.

Además se ejecutaron dos controles negativos de CLI: sin variable y sin servidor
ambos terminaron con código 1 y mensaje explícito. No se suman como casos de suite.
