# Pruebas operativas — Encargo 06

Resultados actuales: **74 casos distintos correctos** (20 núcleo + 22 HTTP +
21 entrega + 11 operaciones), sin omitidos ni cancelados. [STATUS](../docs/STATUS.md).
Se conserva el catálogo histórico completo más abajo; sus cifras describen cada encargo.

test:operations exige TEST_DATABASE_URL y TEST_API_DATABASE_URL, PostgreSQL real,
base entrega_fiable_eventos_pedidos_test y rol API p03_api_prueba.
db:query-tests prepara ese rol ordinario local sin DDL. Los fixtures propietarios
le conceden solo los permisos de API sobre su esquema; al eliminarlo desaparecen
esas concesiones. CI prepara el mismo rol de forma desechable.

| Caso | Evidencia observable |
| --- | --- |
| 01 | Autenticación 401/403 previa a validar, ambos endpoints y no-store |
| 02 | 404, UUID inválido 422, historial vacío y lista explícita de campos sin contenido |
| 03 | Reservado, recuperación desconocida, reintento 429 y confirmado; orden, fechas, null y ausencia de tokens |
| 04 | Corte HTTP después de COMMIT remoto: historial de dos intentos y una preparación |
| 05 | Todos los estados, agotamiento de seis y fallo definitivo; GET no recupera una reserva vencida ni altera filas |
| 06 | Límites y errores seguros: consultas repetidas/desconocidas, codificación, longitud y estructura del cursor |
| 07 | 23 filas, empates y microsegundos dentro del mismo milisegundo; páginas de 1/7/20, filtro ligado y sin omisiones |
| 08 | Inserción y cambio de estado entre páginas; nueva consulta para COMMIT tardío anterior al cursor |
| 09 | Conexión real del rol API restringido, DDL/UPDATE rechazados, /listo 503 al revocar SELECT de intento |
| 10 | Actualizar 002 a 003 preserva filas y diagnósticos históricos null; migración repetible e índice existente |
| 11 | Sin esquemas o conexiones residuales de consultas |

La regresión completa también vuelve a ejecutar los procesos realmente terminados,
el timeout de cinco segundos y el reinicio real del receptor de test:delivery.
Operaciones 03/05/08/10 usan estados o datos temporales explícitos del fixture;
no se presentan como muertes de procesos. El caso 04 sí corta una conexión HTTP real.
El caso 08 representa un COMMIT tardío mediante inserción con clave anterior;
no simula una transacción de larga duración. Nunca se limpia desarrollo.

---

# Verificación vigente — Encargo 05

Suites: test:core (20), test:http (22), test:delivery (21): **63 casos distintos**.
Sin dependencias añadidas ni repetición del experimento pg-boss.
Comandos y demostración en [README](../README.md); resultados en [STATUS](../docs/STATUS.md).

## Entrega y receptor

[delivery/delivery.test.ts](delivery/delivery.test.ts) usa PostgreSQL y HTTP reales,
esquemas propios separados y un runner sin reintentos ni omisiones.
Exige TEST_DATABASE_URL y comprueba current_database antes de preparar/limpiar.
No borra desarrollo. Cierra hijos, conexiones, servidores y temporizadores antes
de eliminar solo los esquemas del fixture.

| Caso | Garantía comprobada |
| --- | --- |
| 01 | POST autenticado, pendiente, trabajador, preparación y entregado |
| 02 | Conexión rechazada y entrega posterior al arrancar receptor en ese puerto |
| 03 | Corte después del COMMIT remoto: 2 POST, 1 preparación, ya_aplicado, entregado |
| 04 | SIGKILL real tras reservar, antes de enviar; recuperación persistida |
| 05 | SIGKILL real tras efecto remoto, antes de finalizar localmente; un solo efecto |
| 06 | Error SQL al finalizar revierte estado/diagnóstico, sin reenvío inmediato |
| 07 | Timeout real de 5 s durante lectura del recibo |
| 08 | 429 con segundos y fecha; esperas reales sin adelantar próxima reserva |
| 09 | Cabeceras ausentes/inválidas/no representables/pasadas y categorías seguras |
| 10 | Seis 503, agotado y ningún séptimo envío |
| 11 | 408 reintentable, otros 4xx definitivos, 3xx sin seguir Location |
| 12 | Recibos cerrados, tipos, UUID y otros 2xx: sin falsa confirmación |
| 13 | Respuesta mayor de 8 KiB o truncada: lectura cancelada, sin entrega |
| 14 | Dos procesos trabajadores concurrentes sin compartir reserva |
| 15 | Receptor concurrente, conflictos y reinicio real de proceso conservan un efecto |
| 16 | Fallo diferido de COMMIT del receptor revierte identidad y preparación |
| 17 | Actualización desde 001 con datos/intento; /listo pasa de 503 a 200 |
| 18 | Ejecución antigua no sobrescribe diagnósticos posteriores |
| 19 | Destino local cerrado y credencial de entrega diferente |
| 20 | Cierre ordenado espera intento activo y evita otra reserva |
| 21 | Cero esquemas y conexiones residuales; hijos cerrados por los fixtures |

Perfil habitual: reserva 1,5 s, base 20 ms; hijos trabajadores: reserva 1 s y
timeout 500 ms. Se conservan seis intentos y mismas transiciones.
El caso 07 usa el timeout real 5 s con reserva inicial 30 s y backoff normal.
El caso 08 espera segundos/fechas de Retry-After, sin adelantar disponibilidad.
Los casos 06/18 adelantan vencimiento por SQL de fixture; el 09 prepara terminales
para aislar variantes. No equivalen a procesos muertos ni a una parada prolongada.
Los casos 04/05 sí terminan procesos con SIGKILL y esperan su salida.
El caso 15 termina normalmente un proceso receptor e inicia otro sobre el mismo esquema.

El corte de 03 se inyecta en el wrapper de respuesta del fixture, después de
ReceiverStore.apply(). Se usa el contrato y la transacción reales del receptor.
Los puntos de pausa/muerte de 04/05 solo están conectados desde el proceso de pruebas.
No hay endpoints de fallos ni modos de fallo configurables en el CLI del producto.

Los roles sin DDL se verifican además conectando a los recursos de desarrollo
y ejecutando demo:delivery con los tres CLI reales. No se atribuye al rol propietario
de fixtures el mínimo de permisos de los procesos de desarrollo.
No se han probado cargas, redes externas o tolerancia a apagones prolongados.

---

## Histórico del Encargo 04

Se conserva íntegro el registro anterior. El catálogo de núcleo/API sigue vigente;
sus referencias a un trabajador futuro corresponden a aquella entrega.

# Verificación vigente — recepción HTTP y núcleo PostgreSQL

El Encargo 04 conserva test:core (20 casos) y añade test:http (22 casos).
Usar npm 11.21.2 y seguir [README](../README.md): ci, PostgreSQL propio,
typecheck, build, test:core y test:http. No repetir test:queue para esta entrega.
Las suites fallan explícitamente sin TEST_DATABASE_URL o sin PostgreSQL real.

## Casos HTTP

Código: [http/http.test.ts](http/http.test.ts).
Servidor HTTP real sobre 127.0.0.1 y puerto efímero, Express compilado y núcleo real.
Credenciales aleatorias por ejecución; fixtures y guardas compartidos con el núcleo.
Cada caso con persistencia crea un esquema propio en la base _test, aplica la
migración publicada y cierra HTTP, hijos y pools antes de eliminar solo ese esquema.
No se borra desarrollo ni se alteran credenciales de la API de desarrollo.

| Caso | Evidencia |
| --- | --- |
| 01 | Salud y disponibilidad mínimas; sin caché, cookies, cabecera Express o CORS permisivo |
| 02 | 202, sobre completo persistido, una entrega pendiente e intento cero; consulta sin tokens |
| 03 | Duplicado equivalente con claves reordenadas: 200, sin filas nuevas |
| 04 | Seis solicitudes concurrentes: una creación y cinco duplicados |
| 05 | Conflictos por contenido, UUID/pedido y orden de líneas |
| 06 | Entradas inválidas, campos desconocidos y límites rechazados sin persistir |
| 07 | Límites inclusivos válidos y calendario real, sin normalización de fechas |
| 08 | Autenticación antes del parser y permisos separados, 401/403 |
| 09 | JSON mal formado 400 frente a valor fuera de contrato 422 |
| 10 | Content-Type, charset, compresión y bytes UTF-8 |
| 11 | 64 KiB inclusive; exceso con Content-Length y transferencia segmentada |
| 12 | Consulta inexistente, UUID inválido y ruta desconocida |
| 13 | Error SQL al crear entrega: rollback, 500 y ninguna falsa aceptación |
| 14 | Trigger diferido bloquea COMMIT real: no hay 202 mientras espera |
| 15 | Error durante COMMIT diferido: 500 y ausencia de evento/entrega |
| 16 | Puerto PostgreSQL inaccesible: salud 200, listo/POST/GET 503 |
| 17 | Reinicio real de proceso HTTP: conserva pendiente y deduplicación |
| 18 | Cierre repetido libera servidor y pool; puerto deja de aceptar conexiones |
| 19 | Arrancar sin esquema no hace DDL; listo indica 503 |
| 20 | Respuestas y logs no filtran tokens/cuerpo, ni aunque SQL incluya un token |
| 21 | Configuración exige tokens distintos y rechaza URL de pruebas |
| 22 | Cero esquemas y conexiones HTTP residuales |

El caso 14 usa un bloqueo asesor y un trigger DEFERRABLE INITIALLY DEFERRED
sobre la entrega del fixture. La consulta externa no ve el evento y HTTP no responde
hasta liberar el COMMIT. No es un mock de registrar().
El caso 17 cierra e inicia procesos hijos reales; en este encargo se prueba reinicio
ordenado de la API. Las muertes abruptas del trabajador siguen en test:core.
El caso 16 provoca conexión rechazada a un puerto local libre; no detiene el cluster
compartido durante la suite.

Las variantes de un caso y las repeticiones no se cuentan como casos independientes:
42 casos distintos entre núcleo y HTTP. Sin HTTP a destinatarios ni efecto de negocio.
No se prueban carga, TLS, despliegue o idempotencia remota.
Resultados de la ejecución y demostración con rol restringido en [STATUS](../docs/STATUS.md).

---

## Registro del Encargo 03 y su catálogo de núcleo

Se conserva debajo el registro anterior. Sus afirmaciones sobre ausencia de HTTP
describen el alcance de aquella entrega; el catálogo de test:core sigue vigente.

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
