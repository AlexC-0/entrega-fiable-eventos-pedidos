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
