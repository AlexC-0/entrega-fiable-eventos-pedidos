# Estado actual — Encargo 06

13 de noviembre de 2026. Consulta operativa implementada y verificada localmente.
CI preparada y revisada; pendiente de publicación manual y ejecución remota.
**V1 no está cerrada.** [Matriz de criterios](CRITERIOS-V1.md).

## Repositorio y continuidad

Ruta: C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos.
Inicio limpio en main...origin/main. HEAD, origin/main y git ls-remote coinciden:
[f9a427adff420d26775cd1dab47f6a09cc7099e2](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/f9a427adff420d26775cd1dab47f6a09cc7099e2),
«feat: añadir trabajador HTTP y receptor idempotente».
Se registra la publicación del Encargo 05 por Alex. No se restauraron commits
ni se descartaron cambios. Origin sigue siendo el repositorio exclusivo de AlexC-0.

Final: misma rama y HEAD; todos los cambios locales sin staging.
Codex no hizo staging, commit, push, cambios de remoto, tags, releases o despliegue.
La primera consulta de Git remota desde el entorno restringido falló por credenciales
Schannel; la consulta de solo lectura con permiso ampliado confirmó la referencia.
No se inspeccionaron ni modificaron los proyectos anteriores.

Los resultados siguientes son de este árbol local, no del commit f9a427a ni de CI.

## Cambios y versiones

- GET /eventos/:eventoId/intentos: historial ascendente, hasta seis, campos explícitos,
  null legítimos, 404 inexistente y 422 UUID inválido. Mantiene resultados persistidos.
- GET /eventos: filtro opcional por los seis estados, limite 20 por defecto y 1–100,
  cursor opaco máximo 512 caracteres ligado al filtro; consulta total hasta 2048.
- Frontera por creado_en y evento_id ascendente, con los seis decimales de PostgreSQL
  preservados como texto. Sin total ni snapshot global; consultas sin escrituras.
- Migración 003: índice evento_listado(creado_en, evento_id). 001/002 intactas.
- EventStore y /listo usan catálogo vigente y comprueban lectura del historial.
- grantApiPermissions compartido entre db:migrate y fixture del rol API.
- Nuevo comando events:query y guía de operación, CI y matriz de criterios.
- Workflow push main/pull_request, PostgreSQL real y cuatro suites secuenciales.

Versiones: Node 24.13.0, npm efectivo 11.21.2 mediante npx, TypeScript 7.0.2,
Express 5.3.0, pg 8.23.1, PostgreSQL portátil 18.7. Sin nuevas dependencias
ni cambios de package-lock.json. pg-boss 12.38.2 permanece histórico y no se ejecutó.
actionlint 1.7.12 se descargó y verificó solo en .local; sin instalación global.

Archivos de implementación: src/http/app.ts y list-query.ts; src/persistence/
event-store.ts, catalog.ts, list-page.ts, api-permissions.ts y migrations/003-list-index.ts.
Preparación: scripts/database-development.mjs, database-query-tests.mjs,
query-events.mjs y ci-database.sql, package.json y .env.example.
Pruebas: tests/operations/operations.test.ts, tests/tsconfig.json y tests/README.md.
CI: .github/workflows/ci.yml.
Documentación: AGENTS, README, PROJECT_BRIEF, HTTP, ENTREGA, OPERACION,
CRITERIOS-V1, CI y STATUS. El histórico completo anterior de STATUS se conserva debajo.

## Migraciones y permisos

Se aplicó 003 sobre p03_app existente y se repitió db:migrate correctamente.
El índice sirve al orden por clave; no hay benchmark ni promesa de coste constante
para el filtro por estado. No se modificaron migraciones publicadas.

p03_api añade únicamente SELECT de intento. Se comprobó por conexión real:
sin superusuario, CREATEDB/CREATEROLE, CREATE en base/esquema, INSERT de intento
o UPDATE de entrega. La API compilada y events:query funcionaron con ese rol.
No se cambiaron permisos del trabajador o receptor.

db:query-tests prepara p03_api_prueba, rol ordinario con CONNECT en la base _test.
Sus credenciales nuevas están en .local/portable-postgres/query-tests.json y
TEST_API_DATABASE_URL privada. Los fixtures conceden tablas solo en su esquema;
no tiene DDL ni permisos sobre negocio de desarrollo. Su preparación es repetible.

Se compararon filas de evento/entrega/intento y preparaciones antes/después de
migrar y consultar: las dos identidades existentes y sus efectos se conservan.
Repetir preparadores/migrador mantuvo hashes de .env y archivos privados.
No se reinicializó el cluster ni se sustituyeron credenciales anteriores.

## Comprobaciones locales reales

Prefijo npm: npx --yes --package=npm@11.21.2 npm.

| Comprobación | Resultado |
| --- | --- |
| npm ci | 103 paquetes instalados, 104 auditados, 0 vulnerabilidades informadas; lockfile intacto |
| run typecheck / run build | Correctos, también tras el ajuste final del error de configuración de pruebas |
| run test:core | 20/20; 13,527 s |
| run test:http | 22/22; 12,027 s |
| run test:delivery | 21/21; 34,457 s |
| run test:operations, regresión completa | 11/11; 6,938 s |
| run test:operations, revisión final | 11/11; 6,887 s |
| node --check de scripts nuevos | Correcto |
| actionlint 1.7.12 | Código 0 tras corregir claves de puerto en expresiones |
| Migración 002 → 003 y repetición | Datos/diagnósticos conservados; índice existente y ready correcto |
| /listo sin SELECT de intento | 503; tras concesión explícita, 200 |
| API y events:query con p03_api real | Listado de dos páginas, evento e historial correctos; sin alterar datos |
| TEST_DATABASE_URL / TEST_API_DATABASE_URL ausentes | Código 1 explícito; ninguna omisión |
| TEST_API_DATABASE_URL inválida | Error seguro sin imprimir el valor recibido |
| PostgreSQL detenido | Código 1 explícito antes de ejecutar casos, sin omisiones |
| Revisión final | diff --check correcto; 26 archivos sin staging, 90 enlaces locales válidos, histórico y 001/002/lockfile intactos; sin secretos detectados |
| Residuos tras suites y comprobaciones | Cero esquemas de fixture y cero conexiones de aplicación |
| db:portable stop / status | Instancia propia detenida, datos conservados |
| Procesos y puertos finales | Sin procesos propios ni listeners en 3003/3004/55434 |

**74 casos distintos**, cero fallos/omitidos/cancelados en las suites finales.
La primera ejecución operativa pasó 11/11 en 7,714 s. Las repeticiones no se suman.
[Catálogo de pruebas](../tests/README.md). Se corrigieron durante implementación
un error de edición y un tipo de UUID antes de las ejecuciones correctas.
Una consulta privada de verificación usó inicialmente el nombre incorrecto de una
columna del receptor; se corrigió antes de migrar/verificar, sin cambiar datos.

El caso operativo 04 consulta por HTTP los dos intentos del caso de respuesta perdida:
primer resultado reintentable/conexion con codigoHttp null; segundo confirmado/
recibo_ya_aplicado con 200. El receptor conserva una preparación y el emisor entregado.
Las pruebas existentes vuelven a matar realmente trabajadores y reiniciar receptor;
los fixtures de estados/fechas del listado no se presentan como interrupciones reales.

El recorrido paginado usa 23 filas estables, varias con timestamp idéntico y otras
separadas por microsegundos dentro de un milisegundo. Páginas de 1, 7 y 20 sin
omisiones/repeticiones; todos los filtros comprobados. La inserción y cambios entre
páginas verifican la vista actual y no una instantánea global.

## CI y cierre pendiente

[CI](CI.md) documenta imagen postgres:18.7-bookworm, acciones oficiales verificadas
y fijadas por SHA, Node/npm, healthcheck, roles ordinarios y SQL efímero.
Se comprobó configuración con actionlint; no se ejecutó el runner ni su SQL de
preparación localmente. Sin Docker/WSL, secretos personales o permisos de escritura.
Sin shellcheck/pyflakes locales: comandos y SQL revisados manualmente.

Pendientes concretos: Alex revisa los cambios y publica manualmente; después se
comprueba el run remoto del commit exacto y se revisa la matriz para aceptar V1.
No hay bloqueo de implementación local. CI no se declara verde y V1 no se cierra.

API, receptor, trabajador e instancia PostgreSQL propios detenidos. Se conservan
dos eventos entregados, dos preparaciones (una por pedido), historial y credenciales.
Sin purga, reintento manual, frontend, nuevos destinos o despliegue.
Agotados/fallos definitivos no se reactivan; repetir POST tampoco reinicia presupuesto.
No se promete entrega universal exactamente una vez. Límites en [OPERACION](OPERACION.md).

## Publicación manual sugerida

Summary:

~~~text
feat: añadir consultas operativas y preparar CI con PostgreSQL
~~~

Description:

~~~text
Añadir listado de eventos por estado con paginación por clave y cursor preciso a microsegundos.
Exponer historial autenticado de intentos con resultados y diagnósticos persistidos, sin datos internos.
Incorporar migración 003 y conceder únicamente SELECT de intento al rol API.
Añadir consulta local segura, guía operativa y matriz de criterios V1 pendientes de cierre.
Preparar GitHub Actions con PostgreSQL 18.7, roles ordinarios y suites secuenciales.
Verificar instalación reproducible, tipos, compilación y 74 pruebas locales con PostgreSQL/HTTP reales.
Revisar workflow con actionlint; dejar su ejecución remota pendiente de publicación manual.
Conservar datos y credenciales con los procesos propios detenidos.
~~~

---

# Estado del Proyecto 03

## Encargo 05 — trabajador HTTP y receptor idempotente completados

13 de noviembre de 2026. Recorrido local verificado desde recepción autenticada
hasta preparación ficticia y entrega confirmada. La cola sigue siendo propia.
El receptor deduplica su efecto en su propia transacción; no se promete entrega
universal exactamente una vez.

### Repositorio y publicación anterior

Ruta exclusiva: C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos.
Inicio limpio en main...origin/main. HEAD, origin/main y consulta remota
git ls-remote origin refs/heads/main coincidían en
[522ca4113bcb4a738481a3d117e0490b3950d4bd](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/522ca4113bcb4a738481a3d117e0490b3950d4bd),
«feat: añadir recepción HTTP autenticada y consulta de eventos».
El Encargo 04 está publicado por Alex. No se restauró ni descartó trabajo posterior.

Origin permanece https://github.com/AlexC-0/entrega-fiable-eventos-pedidos.git.
Final: main y mismo HEAD; cambios locales sin staging, commit y push pendientes
de Alex desde GitHub Desktop. No se ejecutó publicación, reescritura, tags,
releases, despliegue ni CI nueva. No se inspeccionaron proyectos anteriores.

Los resultados siguientes pertenecen a los cambios locales de este encargo,
no al commit 522ca41 ni a una ejecución remota.

### Cambios y versiones

Sin dependencias añadidas o actualizadas; package-lock.json intacto.
Node 24.13.0, npm efectivo 11.21.2 mediante npx, TypeScript 7.0.2,
Express 5.3.0, @types/express 5.0.6, pg 8.23.1 y PostgreSQL portátil 18.7.
pg-boss 12.38.2 sigue exclusivamente como devDependency histórica.
No se repitió npm ci porque no cambiaron dependencias ni lockfile.

- src/worker: configuración cerrada, permisos/disponibilidad, HTTP de una sola
  petición con timeout/lectura acotados, clasificación, Retry-After y bucle secuencial.
- src/receiver: migración propia, persistencia transaccional, aplicación autenticada
  y arranque independiente.
- src/persistence: catálogo común, verificación compartida con /listo y migración
  002 de diagnósticos. Se conserva la 001 publicada.
- src/queue: diagnósticos en la misma transición protegida de estado/intento.
- src/http/body.ts: parser de contrato compartido entre API y receptor.
- src/server/listen.ts y shutdown.ts: escucha/cierre compartidos, sin arranque al importar.
- scripts/database-delivery.mjs: preparación y migración explícitas de nuevos recursos.
- scripts/demo-delivery.mjs e inspect-receiver.mjs: recorrido completo y consulta local.
- tests/delivery: 21 casos PostgreSQL/HTTP reales, fixtures y procesos hijos.
- Scripts npm, .env.example, AGENTS, README, PROJECT_BRIEF, HTTP, NUCLEO-COLA,
  DECISION-COLA, tests/README y docs/ENTREGA.md actualizados.
- Las pruebas del núcleo adoptan la longitud del catálogo, sin fijar una versión única.

Se conservan scripts/database-portable.mjs, scripts/database-development.mjs,
scripts/demo.mjs (demostración original), experiments/cola y .gitattributes.
No se repitió la evaluación histórica de pg-boss.

### Migraciones y recursos preparados

Emisor: entrega_fiable_eventos_pedidos, esquema p03_app.
Migraciones vigentes 001 y 002, verificadas por el mismo catálogo en migrador
y EventStore.ready()/GET /listo. 002 añade codigo_http, categoria y retry_after
a intento; reutiliza las fechas existentes. Datos previos conservados.

Receptor: nueva base entrega_fiable_eventos_pedidos_receptor, esquema p03_receptor,
catálogo propio versión 1, tablas procesado y preparacion.
No comparte tablas ni transacción con el emisor.
Pruebas: entrega_fiable_eventos_pedidos_test, esquemas distintos por participante.

Nuevos roles:
p03_trabajador, p03_receptor y p03_receptor_migracion.
El preparador conserva credenciales anteriores y genera las nuevas únicamente
si faltan, en .local/portable-postgres/delivery.json y .env privados.
ENTREGA_TOKEN es distinto de recepción/consulta y no se imprime.

Se conectó realmente como API, trabajador y receptor para comprobar:
sin superusuario, CREATEDB, CREATEROLE o CREATE en base/public/esquema.
p03_api no obtuvo UPDATE de entrega ni INSERT de intento.
El trabajador no tiene INSERT de evento; el receptor no tiene UPDATE/DELETE
de preparación. La demostración funciona con esos roles ordinarios.
Repetir preparación y migración conservó los hashes de .env y delivery.json.
No hubo initdb, cambios Docker/WSL ni sustitución de credenciales existentes.

### Garantías implementadas

Una reserva confirmada permite una petición; no hay retries del cliente HTTP.
Un envío simultáneo por proceso, recuperación al inicio de cada ciclo y espera
cancelable de 500 ms sin trabajo/error. Dos procesos pueden compartir cola.
Reserva 30 s; seis intentos totales; bases 5/10/20/40/80 s más jitter 0–20 %.

Solo HTTP 200 y recibo cerrado del mismo eventoId con aplicado/ya_aplicado confirma.
Timeout total 5 s incluida lectura; máximo 8 KiB de cuerpo; destino fijo loopback,
sin credenciales/query/fragmento ni redirecciones.
429 admite segundos y fecha HTTP; referencia relativa PostgreSQL, sin recortar
demoras válidas. Valores inválidos/no representables usan backoff y categoría segura.

La finalización protege también los diagnósticos con token/número/vencimiento.
Fallo de persistencia tras respuesta deja incertidumbre sin reenvío inmediato.
La recuperación marca desconocido/reserva_vencida, sin inventar código HTTP.

El receptor confirma identidad/contenido y preparación ficticia en una sola
transacción, antes de responder. Conflictos devuelven 409 sin alterar lo previo.
Se conserva deduplicación tras reiniciar realmente el proceso.

### Comprobaciones reales

Prefijo npm: npx --yes --package=npm@11.21.2 npm.

| Comprobación | Resultado |
| --- | --- |
| run typecheck y run build | Correctos, incluida revisión final |
| node --check de los tres scripts nuevos | Correctos |
| run test:core | 20/20; cero fallos/omitidos/cancelados; 13,301 s |
| run test:http | 22/22; cero fallos/omitidos/cancelados; 10,060 s |
| run test:delivery, revisión final | 21/21; cero fallos/omitidos/cancelados; 32,357 s |
| Migración desde 001 con evento/intento existentes | Datos conservados; /listo HTTP pasa de 503 a 200 |
| db:delivery:prepare / migrate repetidos | Correctos; secretos conservados |
| Roles reales API/trabajador/receptor | Ordinarios, sin DDL ni permisos adicionales indebidos |
| demo:delivery, evento previamente aceptado | 200 duplicado, entregado, un intento y una preparación |
| demo:delivery -- --nuevo | 202 creado; después entregado y 200 duplicado; una preparación |
| receiver:inspect | Una preparación para la identidad original |
| Entrega sin TEST_DATABASE_URL | Código 1 y error explícito, sin omitir casos |
| Entrega con PostgreSQL detenido | Código 1 y error explícito, sin omitir casos |
| Residuos después de las suites | Cero esquemas de fixtures y conexiones de aplicación |
| db:portable stop / status | Instancia propia detenida; datos conservados |
| Procesos y puertos al finalizar | Cero procesos propios; sin listeners en 3003/3004/55434 |
| Revisión final del diff y documentación | diff --check correcto; 43 archivos cambiados, 64 enlaces locales válidos, staging vacío; histórico, 001 y lockfile intactos |

Total **63 casos distintos**: 20 + 22 + 21. No se suman repeticiones o variantes.
La suite de entrega pasó inicialmente en 29,178 s y tras la regresión en 29,915 s;
la revisión final incorporó reinicio real del proceso receptor y /listo HTTP
sobre la actualización de 001. No se consideran pruebas independientes adicionales.

El timeout de 5 s se provocó reteniendo el cuerpo tras enviar cabeceras 200:
el caso final duró 5,459 s incluyendo fixture y limpieza.
Se respetaron realmente los Retry-After de segundos y fecha.
Se probaron 408, 429, 503, otros 4xx, redirecciones, recibos inválidos,
tipos incorrectos, cuerpos excesivos y respuestas truncadas.
Se agotaron seis envíos 503 sin un séptimo.

### Evidencia de respuesta perdida e interrupciones

Caso 03, revisión final:

1. El receptor real confirmó procesado y preparacion.
2. El wrapper del fixture destruyó la conexión antes de enviar el recibo.
3. El emisor conservó el evento y programó otro intento.
4. El segundo POST recibió 200/ya_aplicado.
5. Resultado: **dos POST observados, una preparación, dos intentos persistidos
   y entrega en entregado**. Categorías locales conexion y recibo_ya_aplicado.

El primer código HTTP quedó ausente: no se observaron cabeceras antes del corte.
No se atribuye un 200 al intento cuya respuesta se perdió.

Casos 04/05: hijos trabajadores terminados realmente con SIGKILL después de
reservar y después del efecto remoto antes de finalizar. Recuperación desde
PostgreSQL, primer intento desconocido/código null y una sola preparación.
El caso 06 provoca error SQL al finalizar después del efecto; estado e historial
revierten, y un ciclo inmediato no vuelve a enviar la reserva vigente.

El caso 14 ejecuta dos procesos trabajadores. El 15 cierra un proceso receptor
e inicia otro sobre el mismo esquema. El 20 comprueba cierre ordenado con intento
activo sin reservar el siguiente. No existen endpoints públicos de fallos.
Los vencimientos adelantados de 06/18 y terminales de variantes de 09 son
fixtures SQL explícitos, no muertes de proceso ni paradas de días.
[Catálogo detallado](../tests/README.md).

### Demostración y recursos finales

La API, receptor, trabajador y PostgreSQL propios están detenidos.
Permanecen dos eventos ficticios en estado entregado y dos preparaciones, una por
pedido. Se conservan identidades, intentos y credenciales; no se borró el evento
de la demostración anterior. El archivo .local/demo-evento.json sigue siendo el
original. --nuevo crea otra identidad y otro archivo privado de demo.

La demostración inicia tres procesos reales, los cierra por IPC privado y espera
su salida correcta. Ctrl+C también solicita cierre en ejecución manual.
El cierre del CLI está acotado a 20 s; un agotamiento fuerza salida con código 1
y deja la recuperación al estado persistido. Esa salida de emergencia no se
presenta como un apagado ordenado probado bajo todas las averías de PostgreSQL.

[README](../README.md) contiene comandos de base, preparación, migración,
arranque manual, demostración, inspección y parada.
[ENTREGA](ENTREGA.md) documenta protocolo, Retry-After, diagnósticos y permisos.

Sin bloqueos pendientes para este encargo.
No se prueban rendimiento, alta disponibilidad, redes externas, TLS o apagones
prolongados. Sin listado/paginación, historial por HTTP, reintento manual, purga,
frontend, despliegue ni CI nueva. No se afirma entrega universal exactamente una vez.
Próximo paso recomendado: revisión operativa y aceptación del recorrido local,
incluyendo procedimientos ante agotamiento, mediante un nuevo encargo.

### Publicación manual sugerida

Summary:

~~~text
feat: añadir trabajador HTTP y receptor idempotente
~~~

Description:

~~~text
Implementar trabajador independiente con una petición por reserva, timeout total de 5 s y recibos limitados a 8 KiB.
Clasificar respuestas y Retry-After conservando seis intentos y la política temporal existente.
Añadir receptor autenticado con deduplicación y preparación ficticia en una transacción propia.
Incorporar migración 002 y diagnósticos protegidos junto al estado y al historial, sin modificar 001.
Preparar base y roles separados; ejecutar los procesos ordinarios sin DDL y conservar los permisos de la API.
Añadir demostración completa, consulta local de preparaciones y cierre acotado de procesos.
Verificar 20 pruebas de núcleo, 22 HTTP y 21 de entrega con PostgreSQL/HTTP reales.
Demostrar respuesta perdida: dos envíos, una preparación y entrega confirmada.
Actualizar documentación y conservar datos y secretos con los recursos detenidos.
~~~

Staging, commit y push quedan exclusivamente para Alex desde GitHub Desktop.

---

## Histórico del Encargo 04

Se conserva el registro anterior. Las referencias a trabajador futuro, datos
pendientes, preparación del entorno o publicación por hacer describen aquella entrega.

# Estado del Proyecto 03

## Encargo 04 — recepción HTTP autenticada y consulta individual completadas

13 de noviembre de 2026. Se implementó la recepción y consulta sobre el núcleo
PostgreSQL existente. No hay envío externo ni trabajador: las entregas aceptadas
permanecen pendientes. La selección de cola no se reabrió; pg-boss sigue histórico.

### Repositorio y continuidad

Ruta exclusiva: C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos.
Inicio: main...origin/main limpio, sin cambios locales.
HEAD, origin/main y git ls-remote origin refs/heads/main coincidían en
[1ef64e872453875811111fda8840bd63193ef5c3](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/1ef64e872453875811111fda8840bd63193ef5c3),
«feat: implementar núcleo de cola propia en PostgreSQL».
El Encargo 03 está publicado por Alex. Origin sigue siendo
https://github.com/AlexC-0/entrega-fiable-eventos-pedidos.git.

Final: misma rama, HEAD y remoto; cambios locales sin staging.
No se ejecutaron staging, commit, push, cambios de remotos, tags, publicación o
despliegue. No se inspeccionaron ni modificaron proyectos anteriores.
Los resultados de este apartado corresponden al árbol local del Encargo 04,
no se atribuyen al commit previo ni a una CI remota.

### Cambios y versiones

Añadidas dependencias exactas Express 5.3.0 y @types/express 5.0.6.
Express declara Node >=18; se usa Node 24.13.0.
npm efectivo 11.21.2 mediante npx; npm global 11.6.2 conservado.
TypeScript 7.0.2, pg 8.23.1, @types/pg 8.23.1, @types/node 24.19.2
y PostgreSQL portátil 18.7 se conservan.
pg-boss 12.38.2 queda exclusivamente como devDependency del experimento.
Un package.json privado y un lockfile raíz, sin force/legacy-peer-deps.

Archivos nuevos:

- src/http/app.ts, auth.ts, validation.ts y errors.ts: aplicación, contrato,
  autenticación por permiso y errores JSON seguros.
- src/persistence/event-store.ts y errors.ts: consulta individual y comprobación
  de persistencia; las excepciones persistentes no dependen de Express.
- src/server/config.ts, runtime.ts y main.ts: configuración, arranque loopback y
  cierre de HTTP/pool. Importar main no inicia nada.
- scripts/database-development.mjs: preparación de desarrollo y migración explícita.
- scripts/demo.mjs: demostración reutilizando evento ficticio y sin mostrar secretos.
- tests/http/support.ts, server-child.ts y http.test.ts: pruebas HTTP/SQL reales.
- docs/HTTP.md: contrato, permisos, configuración, respuestas y límites.

Actualizados: package.json, package-lock.json, tests/tsconfig.json, .env.example,
AGENTS.md, README.md, docs/PROJECT_BRIEF.md, docs/STATUS.md, docs/DECISION-COLA.md,
docs/NUCLEO-COLA.md y tests/README.md.

Sin cambios en src/queue, migración 001 publicada, transacciones/migrador del núcleo,
scripts portátiles/Docker existentes, experiments/cola ni .gitattributes.
Los registros previos de STATUS, DECISION-COLA, NUCLEO-COLA y tests/README
se conservan como históricos.

### Operaciones y garantías

| Operación | Resultado |
| --- | --- |
| POST /eventos | RECEPCION_TOKEN; 202 creado tras registrar()/COMMIT; 200 duplicado; 409 conflicto |
| GET /eventos/:eventoId | CONSULTA_TOKEN; identificadores, estado, contador y fechas; 404 inexistente |
| GET /salud | 200 vivo; independiente de PostgreSQL |
| GET /listo | 200 listo si la persistencia requerida está preparada; 503 ante indisponibilidad o esquema no preparado |

Validación cerrada del sobre, UUID canónico minúsculo, calendario UTC real,
identificadores ASCII 1–100, 1–100 líneas/SKU únicos y cantidad 1–1.000.000.
Máximo 64 KiB, JSON UTF-8, sin compresión, coerción ni trim.
Autenticación anterior al parser, Bearer distintos, 401 desconocido y 403 sin permiso.
No hay cookies, sesiones ni CORS permisivo; respuestas no-store.

El contenido persistido es el sobre validado completo, usando registrar() existente.
Se conserva igualdad jsonb: claves de objeto reordenadas no cambian equivalencia;
reordenar líneas sí. Consulta sin cuerpo completo, token de reserva o conexión.
Los errores tienen código estable/mensaje seguro. Los fallos SQL inesperados son
500, no 503 indiscriminadamente. No se emiten errores originales ni stacks a logs.

202 acredita aceptación persistida. Pendiente conserva trabajo aún no reservado.
Confirmar entrega exigirá trabajador y recibo válido del receptor en otro encargo.

### Preparación y recursos

Se reutilizó el cluster portátil propio, sin initdb ni cambios Docker/WSL.
Puerto PostgreSQL 127.0.0.1:55434.
Base de desarrollo creada explícitamente: entrega_fiable_eventos_pedidos.
La base entrega_fiable_eventos_pedidos_test y sus roles/credenciales se conservaron.

Nuevos roles ordinarios:

- p03_migracion: propietario de desarrollo/esquema p03_app y migrador explícito.
- p03_api: USAGE del esquema, SELECT de evento/entrega/migracion e INSERT de
  evento/entrega; sin superusuario, CREATEDB, CREATEROLE ni CREATE en base/public/p03_app.

Se verificaron esos privilegios conectando realmente como p03_api.
db:prepare genera contraseñas/tokens criptográficos ausentes en archivos privados.
db:migrate aplica/verifica la migración 001 sin alterar su SQL; no se necesitó
otra migración. La API no ejecuta DDL al arrancar.
Preparación y migración repetidas conservaron SHA-256 de .env y development.json.
Las credenciales previas no se sustituyeron.

Demostración real en desarrollo con rol restringido:
primero 202/creado, GET pendiente/intentos 0; después de cerrar y reiniciar API,
200/duplicado del mismo evento, todavía pendiente/intentos 0.
Un evento y una entrega ficticios permanecen para repetir npm run demo.
.local/demo-evento.json conserva su identidad, sin incluir credenciales.

### Comandos y resultados reales

Prefijo npm: npx --yes --package=npm@11.21.2 npm.

| Comprobación | Resultado |
| --- | --- |
| view express / @types/express | Versiones y engines/dependencias contrastados antes de instalar |
| install --save-exact / --save-dev --save-exact | Express/tipos añadidos con lockfile único |
| ci | 103 paquetes reinstalados, 104 auditados; cero vulnerabilidades informadas |
| SHA-256 de package-lock antes/después de ci | Idéntico |
| ls --depth=0 | Dependencias fijadas, sin conflictos informados |
| run typecheck y run build | Correctos, incluida revisión final |
| node --check de preparador de desarrollo y demo | Correctos |
| Importar dist/server/main.js | Proceso finaliza sin abrir servidor |
| db:prepare y db:migrate repetidos | Correctos; credenciales y .env conservados |
| Demostración HTTP en desarrollo, antes/después de reiniciar | 202/200; pendiente; cero intentos |
| run test:core | 20/20, cero fallos/cancelados/omitidos; 13,550 s |
| run test:http inicial | 22/22; cero fallos/cancelados/omitidos; 9,897 s |
| run test:http tras ci | 22/22; cero fallos/cancelados/omitidos; 10,496 s |
| run test:http revisión final | 22/22; cero fallos/cancelados/omitidos; 10,478 s |
| Control HTTP sin TEST_DATABASE_URL | Código 1, error explícito, sin omisiones |
| Control HTTP con PostgreSQL detenido | Código 1, error explícito, sin omisiones |
| Residuos tras suites | Cero esquemas de fixtures; cero conexiones HTTP residuales |
| db:portable stop / status | Instancia propia detenida y datos conservados |
| Procesos/puertos finales | Cero procesos propios restantes; sin listeners en 3003/55434 |
| git diff --check y revisión de archivos nuevos | Correctos, sin espacios finales ni marcadores de conflicto |
| Enlaces, UTF-8 e histórico | 48 enlaces locales válidos; codificación correcta; registros previos íntegros |
| Secretos y exclusiones | Sin coincidencias con credenciales locales en archivos publicables; .env/.local/compilados ignorados |
| Estado Git final | 26 archivos cambiados, staging vacío, main y HEAD 1ef64e8 conservados |

Total: **42 casos distintos**, 20 de núcleo y 22 HTTP. No se suman repeticiones ni
variantes de contrato como casos independientes. La última ejecución HTTP siguió
a la separación de errores persistentes/HTTP y al control de salida temprana del
hijo de pruebas. No se repitió pg-boss ni se modificó su experimento.

La suite HTTP usa PostgreSQL real, esquema nuevo por fixture, servidor real y
credenciales aleatorias. Consulta current_database antes de preparar o limpiar.
El caso 14 retiene realmente COMMIT con un trigger diferido: no aparece respuesta
202 ni evento visible hasta liberarlo. El caso 15 falla durante COMMIT y deja
cero filas. El 13 provoca error SQL al crear la entrega y también revierte todo.
El 16 provoca una conexión real rechazada a un puerto local sin PostgreSQL.
El 17 cierra e inicia procesos hijos HTTP sobre el mismo esquema y comprueba
persistencia. El 22 comprueba ausencia de esquemas y conexiones residuales.
Detalles y catálogo completo en [tests/README](../tests/README.md).

### Estado final, límites y próximo paso

API y PostgreSQL detenidos. Se conservan la base de desarrollo, esquema, roles,
un evento ficticio pendiente, archivos privados y datos del cluster.
No queda trabajador, servidor HTTP ni proceso hijo de prueba activo.
Comandos de preparación, migración, arranque, demostración y parada en
[README](../README.md); contrato y errores en [HTTP](HTTP.md).

Sin bloqueos pendientes para este alcance.
No hay trabajador/envío externo, receptor, historial por HTTP, listado/paginación,
reintento manual, purga, panel, frontend, TLS/despliegue ni CI nueva.
No se ha demostrado idempotencia del efecto en el receptor ni rendimiento bajo carga.
No se usó navegador: la comprobación de la API fue por HTTP real.
Próximo encargo: trabajador HTTP y receptor idempotente. No se inicia aquí.

### Publicación manual sugerida

Summary:

~~~text
feat: añadir recepción HTTP autenticada y consulta de eventos
~~~

Description:

~~~text
Añadir Express 5 con recepción y consulta individual mediante credenciales Bearer separadas.
Validar el contrato cerrado de pedido.confirmado, JSON UTF-8 y límite de 64 KiB.
Reutilizar el núcleo PostgreSQL y responder 202 únicamente tras COMMIT; reconocer duplicados y conflictos.
Incorporar salud, disponibilidad y errores JSON seguros sin filtrar secretos.
Preparar desarrollo separado con rol API sin DDL y migración explícita, conservando la migración 001.
Añadir demostración reproducible y pruebas HTTP con PostgreSQL real, fallos SQL y reinicio de API.
Verificar 20 pruebas de núcleo y 22 HTTP, instalación reproducible, tipos y compilación.
Actualizar documentación y dejar los recursos detenidos con datos conservados.
~~~

Alex realiza exclusivamente staging, commit y push desde GitHub Desktop.

---

## Histórico del Encargo 03

Se conserva el registro anterior. Sus frases sobre recepción HTTP futura,
publicación pendiente o ausencia de base de desarrollo describen aquella entrega.

# Estado del Proyecto 03

## Encargo 03 — núcleo persistente implementado y verificado

13 de noviembre de 2026. Alex delegó la decisión y autorizó cola mínima propia
PostgreSQL: conservar eventos, entregas e historial sin purga automática y mantener
seis intentos totales. pg-boss queda exclusivamente como experimento histórico.
No se repite su evaluación ni se ejecuta sobre datos del producto.

### Repositorio y publicación anterior

Ruta: C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos.
Rama main; origin: https://github.com/AlexC-0/entrega-fiable-eventos-pedidos.git.
Inicio limpio: main...origin/main, sin cambios pendientes.
HEAD y origin/main coincidían con
[ca1740b0c515354250f54abf7213c91fff5a7b9a](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/ca1740b0c515354250f54abf7213c91fff5a7b9a),
«test: evaluar pg-boss con PostgreSQL real».
git ls-remote origin refs/heads/main confirmó ese mismo SHA en este encargo:
el Encargo 02 ya está publicado por Alex. No se restauró ni reescribió nada.

El cierre local mantiene main y ese HEAD. Cambios del Encargo 03 sin staging;
commit y push pendientes de Alex desde GitHub Desktop.
Los resultados siguientes corresponden al árbol local actual, no al commit
ca1740b ni a CI remota. El histórico inferior conserva el estado de cada entrega.

### Implementación y archivos

- src/persistence: transacciones, migraciones con versión/hash/bloqueo asesor y
  migración 001 de evento, entrega e intento.
- src/queue: tipos, validación JSON/identidades y PostgresQueue.
- src/index.ts: exportaciones del núcleo, sin arranque ni HTTP.
- tests/core: suite PostgreSQL, fixtures y consumidor hijo para interrupciones reales.
- tests/tsconfig.json: compilación de las pruebas y el núcleo en dist-tests.
- package.json/package-lock.json: pg pasa a dependencia de ejecución; test:core
  y comprobaciones TypeScript ampliadas, sin versiones de paquetes cambiadas.
- tsconfig.json/.gitignore: tipos Node y exclusión de dist-tests.
- AGENTS, README, PROJECT_BRIEF, DECISION-COLA, STATUS y tests/README actualizados;
  docs/NUCLEO-COLA.md documenta operaciones, migraciones, decisiones y límites.

Se conservan sin cambios experiments/cola, scripts de PostgreSQL y Docker,
compose.experiment.yml, .env.example y .gitattributes.
No se inspeccionaron ni modificaron proyectos anteriores.

### Decisiones y garantías

Evento y entrega confirman o revierten juntos. UUID y pedidoId únicos resuelven
duplicados/conflictos incluso con concurrencia; jsonb ignora orden de claves,
conserva orden de arrays e incluye campos adicionales.
La reserva confirma contador, token, vencimiento e intento en una transacción.
FOR UPDATE SKIP LOCKED evita compartir una reserva y permite distribuir otras filas.

Finalizar primero adquiere el bloqueo y después consulta reloj PostgreSQL:
rechaza token/número antiguos y vencimientos, incluso si venció durante la espera.
Entrega e historial cambian atómicamente. La recuperación guarda desconocido,
reprograma con presupuesto o agota la sexta; repetirla no altera terminales.

Política inicial comprobada: reserva 30 s; bases 5/10/20/40/80 s con jitter 0–20 %;
fecha siguiente = máximo entre backoff y fecha mínima suministrada.
El timeout HTTP futuro de 5 s y análisis de Retry-After no se implementaron.
No existe bucle continuo: el futuro trabajador invocará las primitivas persistentes.
Detalles y costes de mantenimiento en [NUCLEO-COLA](NUCLEO-COLA.md) y
[DECISION-COLA](DECISION-COLA.md).

### Entorno y comprobaciones reales

Node 24.13.0; npm efectivo 11.21.2 mediante npx (global 11.6.2 conservado);
TypeScript 7.0.2; pg 8.23.1; @types/pg 8.23.1; @types/node 24.19.2.
pg-boss 12.38.2 se conserva en devDependencies; peer @opentelemetry/api 1.10.0
sin dependencia directa artificial. Git 2.56.1.windows.1.
PostgreSQL portátil 18.7 existente, 127.0.0.1:55434, SCRAM,
base entrega_fiable_eventos_pedidos_test y rol ordinario p03_prueba.

Prefijo npm utilizado: npx --yes --package=npm@11.21.2 npm.

| Comprobación | Resultado |
| --- | --- |
| db:portable up sobre instalación existente | Reutilizada sin initdb ni sustitución de credenciales |
| install --save-prod --save-exact pg@8.23.1 | Dependencia de ejecución; sin incorporar otra versión o motor |
| ci | 29 paquetes reinstalados, 30 auditados; cero vulnerabilidades informadas |
| SHA-256 de package-lock antes/después de ci | Idéntico |
| ls --depth=0 | Versiones fijadas, sin conflictos informados |
| run typecheck | Correcto: núcleo, experimento conservado y nuevas pruebas |
| run build | Correcto: dist, dist-experiment y dist-tests |
| run test:core, primera ejecución | 20/20; 0 fallos, cancelados u omitidos; 14,068 s |
| run test:core, segunda ejecución tras ci | 20/20; 0 fallos, cancelados u omitidos; 13,808 s |
| Control CLI sin TEST_DATABASE_URL | Código 1 y error explícito, sin omitir casos |
| Control CLI con PostgreSQL detenido | Código 1 y error explícito, sin omitir casos |
| Revisión de residuos tras las suites | 0 esquemas p03_core_ y 0 conexiones p03_core_ |
| db:portable stop / status | Instancia propia detenida; datos conservados |
| git diff --check | Correcto; revisión adicional de espacios/conflictos en los archivos nuevos |
| Revisión de entrega | 22 archivos cambiados; 32 enlaces locales válidos; UTF-8 correcto |
| Histórico, secretos y exclusiones | Histórico íntegro; sin coincidencias con secretos locales en archivos publicables; privados/compilados ignorados |
| Estado final de recursos | 0 procesos PostgreSQL/hijos propios y 0 listeners en 55434 |
| Estado final Git | main...origin/main; HEAD ca1740b sin cambiar; staging vacío |

Veinte casos distintos, no cuarenta. La segunda ejecución añadió comprobaciones
explícitas del intervalo de reserva de 30 s y del backoff de recuperación dentro
de los mismos casos; no cambió el núcleo. Los controles CLI adicionales no se
cuentan como casos de suite. El catálogo completo está en [tests/README](../tests/README.md).

Reservas de 1,5 s y base 20 ms en el perfil habitual; hijos con reserva de 1 s.
Los casos 13/14 terminaron hijos reales después del COMMIT de primera/sexta
reserva, esperaron su salida y recuperaron desde PostgreSQL sin finally.
El caso 10 esperó realmente un bloqueo hasta vencer. Los otros vencimientos
se prepararon con fixtures explícitos; no se presentan como muertes de procesos.

El caso 16 comprobó fechas programadas con bases reales y adelantó disponibilidad
mediante fixture entre reservas, sin esperar los intervalos completos.
Backoff programado observado, milisegundos:

- Primera ejecución: 5211,676 / 11424,042 / 22804,328 / 45746,440 / 93124,408.
- Segunda ejecución: 5082,292 / 10918,736 / 23055,883 / 44737,706 / 94959,649.

Son muestras dentro de sus ventanas, no evaluación estadística de jitter.
El caso 17 esperó realmente una fecha mínima de 300 ms.
El trabajo de tres años del caso 18 es un fixture; no acredita una parada de años.
Cada fixture comprobó current_database/rol antes de escribir y limpiar; se cerraron
pools e hijos antes de borrar únicamente los esquemas creados por esa prueba.

### Recursos, límites y siguiente paso

La instancia propia está detenida. Datos, binarios, credenciales y .env privados
permanecen en .local y en la raíz según el preparador existente, fuera de Git.
Sin servidores HTTP ni consumidores permanentes. No se cambió Docker/WSL.
No se creó un esquema de negocio permanente: solo esquemas de prueba ya limpiados.
Los comandos reproducibles de arranque, migración mediante fixtures, pruebas y
parada están en [README](../README.md).

Sin bloqueos pendientes para este encargo. No hay API/autenticación HTTP,
receptor, trabajador continuo, consultas HTTP, purga, reintento manual, prioridades,
múltiples destinos ni garantía de orden. No se demuestra idempotencia del efecto
en el receptor, entrega universal exactamente una vez, carga, alta disponibilidad
ni tolerancia a saltos arbitrarios del reloj. Los permisos de prueba incluyen DDL
propio; no equivalen a permisos mínimos de producción.
No se ejecutó HTTP/navegador: este núcleo no tiene interfaz.
Sin CI nueva ni resultados remotos, tags, releases o despliegue.

Siguiente encargo: recepción HTTP autenticada sobre este núcleo. No se inicia aquí.

### Publicación manual sugerida

Summary:

~~~text
feat: implementar núcleo de cola propia en PostgreSQL
~~~

Description:

~~~text
Añadir migraciones versionadas para eventos inmutables, entregas e intentos.
Registrar eventos y reservar trabajo de forma atómica, con deduplicación y conflictos concurrentes.
Proteger finalizaciones mediante token, número de intento y vencimiento con reloj PostgreSQL.
Recuperar reservas interrumpidas conservando el historial y un máximo de seis intentos.
Aplicar backoff de 5/10/20/40/80 s con jitter de 0–20 % y fecha mínima de reintento.
Mantener pg-boss como experimento histórico y documentar la decisión y sus límites.
Verificar 20 pruebas con PostgreSQL real en dos ejecuciones, incluida muerte de procesos.
Comprobar instalación reproducible, tipos y compilación; detener la instancia propia conservando datos.
~~~

Alex revisará, hará staging, commit y push desde GitHub Desktop.

---

## Histórico del Encargo 02

El registro siguiente conserva resultados y estado de aquella entrega. Las frases
sobre publicación pendiente, producto sin implementar o decisión sin aprobar
describen ese momento; quedan actualizadas por el Encargo 03 anterior.

# Estado del Proyecto 03

## Encargo 02 — evaluación técnica completada, 13 de noviembre de 2026

La evaluación se completó con PostgreSQL real. El producto sigue sin implementar
y pg-boss **no se adopta todavía**: hay una condición pendiente sobre la retención
finita de trabajos en cola. El resultado negativo de F2 forma parte de la evidencia.

### Repositorio y alcance

Ruta exclusiva: C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos.
Inicio limpio en main, HEAD y origin/main:
34b953a31f013462258be9e6be419a4698f831f3 — Initial commit.
Origin: https://github.com/AlexC-0/entrega-fiable-eventos-pedidos.git.
git ls-remote origin refs/heads/main confirmó el mismo SHA remoto en esta sesión.
El primer intento bajo sandbox falló por schannel/SEC_E_NO_CREDENTIALS; se repitió
la lectura autorizada sin cambiar Git, remotos ni credenciales.

Alex creó y publicó el repositorio desde GitHub Desktop tras el Encargo 01.
Inventario inicial: 13 archivos versionados, incluido .gitattributes creado
por Desktop. Se conserva ese archivo sin cambios. El registro sin Git de la
entrega original queda abajo como histórico, no como estado actual.

Se amplía AGENTS únicamente para la prueba acotada. src/index.ts,
PROJECT_BRIEF y la configuración TypeScript del producto se conservan.
No se implementa API pública, autenticación, receptor de negocio, trabajador
definitivo, otra cola ni CI. No se inspeccionan ni modifican proyectos anteriores.

### Entorno real y resolución del bloqueo

| Elemento | Versión o resultado utilizado |
| --- | --- |
| Node.js | 24.13.0 |
| npm efectivo | 11.21.2 mediante npx; npm global 11.6.2 conservado |
| Git | 2.56.1.windows.1 |
| TypeScript | 7.0.2 |
| pg-boss / pg | 12.38.2 / 8.23.1 |
| @types/node / @types/pg | 24.19.2 / 8.23.1 |
| Peer resuelto automáticamente | @opentelemetry/api 1.10.0; no dependencia directa artificial |
| PostgreSQL usado | 18.7 portátil Windows x64, distribución EDB 18.7-1 |
| Docker CLI | 29.9.3; no fue el entorno de las pruebas |

Se intentó iniciar Docker Desktop normalmente. El motor devolvió
Docker Desktop is unable to start y el log identificó:
engine linux/wsl failed to start: checking preconditions: WSL update required.
wsl --status informó que no podía iniciar el servicio y wsl --version no fue
reconocido. No se actualizaron WSL, virtualización ni servicios del sistema.

Alex autorizó continuar sin Docker. Se cerró Docker Desktop mediante
docker desktop stop --timeout 15 y se descargó una copia nueva de PostgreSQL
dentro de .local/portable-postgres del Proyecto 03, sin instalación global.

[ZIP oficial EDB](https://get.enterprisedb.com/postgresql/postgresql-18.7-1-windows-x64-binaries.zip)
y [SHA-256 publicado](https://get.enterprisedb.com/postgresql/postgresql-18.7-1-windows-x64-binaries.zip.sha256)
consultados por HTTPS; hash comprobado antes de extraer:
ead0bbc27fb678fa24dcf86b738981323042abd073c744103bf7f3aed23f9a33.
El script fija versión y hash. No se reutilizaron binarios ni datos anteriores.

Puerto 55434 libre antes de preparar; escucha solo en 127.0.0.1, SCRAM.
Cluster nuevo creado una sola vez. Preparación con p03_preparacion y ejecución
con p03_prueba (NOSUPERUSER, NOCREATEDB, NOCREATEROLE).
Base exacta entrega_fiable_eventos_pedidos_test, comprobada con
current_database antes de escribir/limpiar esquemas.
El preparador usa la base postgres del cluster propio solo para crear base/rol;
verifica antes current_database y data_directory.

### Dependencias y archivos

Añadidas como devDependencies del experimento, fijadas exactamente:
pg-boss, pg, @types/pg y @types/node. Sin Express, ORM ni otro runner.
npm ls comprobó peers; pg-native y binarios TypeScript de otros sistemas son
opcionales, no conflictos que se hayan ocultado. Sin force/legacy-peer-deps.

Archivos nuevos:
- compose.experiment.yml: alternativa inicial Docker, preparada pero no ejecutada.
- scripts/database-experiment.mjs y scripts/database-portable.mjs.
- experiments/cola/tsconfig.json.
- experiments/cola/support.ts y consumer.ts.
- experiments/cola/queue.test.ts y guards.test.ts.

Archivos actualizados:
- .env.example y .gitignore.
- package.json y package-lock.json.
- AGENTS.md y README.md.
- docs/DECISION-COLA.md y docs/STATUS.md.
- tests/README.md.

Compilación separada en dist-experiment, excluida de Git.
El HTTP de laboratorio y el consumidor hijo solo forman parte del experimento.

### Comandos y resultados

Prefijo de npm: npx --yes --package=npm@11.21.2 npm.
La caché temporal p03-npm-cache se configuró solo para los procesos de esta sesión.

| Comando | Resultado real |
| --- | --- |
| view / pack / inspección de interfaces | Versión, engines, peer y API pública revisados antes de construir la prueba |
| install --save-dev --save-exact ... | 27 paquetes añadidos; 30 auditados; cero vulnerabilidades informadas |
| ci | 29 paquetes reinstalados; 30 auditados; cero vulnerabilidades informadas |
| SHA-256 de package-lock antes/después de ci | Idéntico |
| run typecheck | Producto y experimento correctos |
| run build | Producto y experimento correctos |
| node --check de los dos preparadores | Correctos |
| run test:guards | 1/1 correcto |
| run test:queue — primera ejecución | 9/9, 0 fallos, 0 omitidos; 22,77 s |
| run test:queue — segunda ejecución | 9/9, 0 fallos, 0 omitidos; 22,27 s |
| db:portable up sobre instancia ya preparada | Correcto; conserva cluster, roles y credenciales |
| db:portable stop / status | Detenida, datos conservados |

La segunda ejecución incluyó además la comprobación de rechazo de
retentionSeconds=0 en F2. Total: diez casos distintos versionados; no se suman
repeticiones como casos nuevos. Las cifras pertenecen a los cambios locales
sin commit de este encargo, no al Initial commit ni a una CI remota.

### Tabla de pruebas y evidencia

| Caso | Resultado | Evidencia real |
| --- | --- | --- |
| A | Correcto | COMMIT conserva evento y job; ROLLBACK provocado y cola inexistente no dejan eventos huérfanos |
| B | Correcto | Error SQL 23502 en intento revierte reserva; dos consumidores concurrentes obtienen una sola reserva |
| C | Correcto | Procesos hijos terminados con SIGKILL tras primera y sexta reservas; supervisor recupera; seis intentos, cuatro HTTP, dos desconocidos; agotado tras reinicio, sin séptimo envío |
| D | Correcto | Finalización antigua rechazada antes y después del resultado posterior; cola y generación propia conservadas |
| E | Correcto | HTTP 503 y 429; fail/findJobs/update atómicos, consumidor intercalado sin reserva y tercer envío posterior a Retry-After |
| F1 | Correcto | Rol ordinario; cero transacciones abiertas durante HTTP retenido; historial sobrevive a deleteJob |
| F2 | Limitación demostrada | Retención pendiente de un segundo elimina job sin conciliar pese a deleteAfterSeconds=0; cero rechazado por API |
| G | Correcto | Conexión real a otra base, postgres, rechazada antes de escribir |
| H | Correcto | Cero esquemas de experimento residuales tras cada suite |
| Control de configuración | Correcto | Rechaza variable vacía, URL inválida y nombre de base distinto |

No hay simulación de PostgreSQL ni mocks de pg-boss. El servidor HTTP es
deliberadamente ficticio: produce respuestas reales de laboratorio, no prepara
pedidos. Se provocan realmente errores SQL, ROLLBACK, expiración, borrado por
retención y muerte de procesos; no se sustituye SIGKILL por una excepción del handler.

Dos controles CLI adicionales: sin TEST_DATABASE_URL y con un puerto sin servidor,
código 1 y mensaje explícito en ambos. No se cuentan como nuevas pruebas de suite.

### Tiempos, límites y conclusión

Perfil acelerado: expiración de reserva 2 s (15 s en HTTP), supervisión/monitor/
mantenimiento 1 s; timeout HTTP 5 s. RetryLimit=5, seis reservas en total.
El caso E usa retryDelay=1 y jitter/backoff nativo. Retardo nativo inicial
observado: 1815 y 1410 ms; intervalos HTTP: 1825/2343 y 1445/2864 ms.
Retry-After probado como delta de 2 s. No se probó el perfil V1 5/10/20/40/80,
fechas HTTP, toda la clasificación de errores ni la distribución del jitter.

Compatible con atomicidad, reserva, recuperación y protección probadas.
Condicionado a aceptar la política nativa y una retención finita con límite
operativo de inactividad/conciliación.
Incompatible, en las opciones públicas evaluadas con supervisión normal, con
retener indefinidamente todos los pendientes sin purga automática.
Docker y su imagen postgres:18.7-bookworm no se ejecutaron.
No se demuestra una parada de días mediante estas pruebas cortas.

La conciliación no crea un segundo planificador: solo proyecta un fallo terminal
de cola en estado propio y conserva desconocido. Si falta el job, rechaza la
conciliación; no inventa una entrega ni encola otro trabajo.
No hay transacciones abiertas esperando HTTP ni SQL de escritura de aplicación
contra tablas internas. El rol ordinario conserva permiso CREATE en la base de
pruebas para fixtures: no es auditoría de permisos mínimos de producción.

Próximo paso recomendado: decidir explícitamente la política de retención y
el backoff antes de adoptar pg-boss o iniciar producto. No se adopta otra cola
automáticamente. La explicación y fuentes están en
[DECISION-COLA](DECISION-COLA.md).

### Recursos al terminar

PostgreSQL propio detenido y sin listener en 55434. Docker Desktop cerrado;
ningún proceso Docker detectado en la comprobación final.
Consumidores hijos, HTTP, supervisores y pools cerrados; esquemas propios
eliminados. Se conservan en .local el ZIP verificado, binarios, cluster,
credenciales y log, y .env privado. No se borran datos para repetir la suite.

Arranque y parada: run db:portable -- up / stop / status, con el prefijo npm.
La preparación Docker queda como alternativa sin verificar; no usarla a la vez
ni reemplazar .env privado sin revisar el cambio de entorno.

### Git y publicación manual

HEAD, rama main y origin conservados. Cambios locales sin staging; Codex no
ejecutó init, add, commit, push, cambios de remoto ni publicación por API.
La publicación del Encargo 02 queda pendiente de Alex en GitHub Desktop.

Summary:

~~~text
test: evaluar pg-boss con PostgreSQL real
~~~

Description:

~~~text
Añade un experimento aislado de pg-boss con transacciones, reservas,
recuperación tras muerte de proceso, protección de resultados e HTTP 503/429.

Prepara PostgreSQL 18.7 portátil exclusivo tras el bloqueo de Docker/WSL.
Verifica tipos, build, instalación reproducible y diez casos distintos,
con dos ejecuciones de la suite PostgreSQL sin residuos.

Demuestra el límite de retención de trabajos pendientes y deja la adopción
de pg-boss pendiente de decidir esa política. Actualiza documentación,
publicación inicial e instrucciones sin implementar la API de producto.
~~~

Revisión final: 21 archivos publicables, UTF-8 válido, 15 enlaces locales
existentes y cero coincidencias con las credenciales privadas propias.
git diff --check correcto para archivos versionados; los ocho nuevos también
comprobados con diff --no-index --check. Los avisos LF/CRLF son de formato;
se conservó .gitattributes y no se cambió configuración Git.
git check-ignore confirmó .env, .local, node_modules, dist y dist-experiment.
Verificados cero procesos Node/PostgreSQL propios restantes.

Estado final: nueve archivos modificados y ocho nuevos, todos sin staging.
HEAD 34b953a y origin conservados; no hay resultados remotos del Encargo 02.

---

## Histórico conservado — Encargo 01

Este bloque describe la entrega anterior a la creación del repositorio.
Sus pendientes de creación/publicación quedaron resueltos por Alex, según
la comprobación del Encargo 02.

## Base inicial — 13 de noviembre de 2026

Encargo: inspeccionar entorno, crear base mínima y evaluar la cola sin
implementarla. La definición funcional y pg-boss siguen como propuestas.

### Ruta y Git

Inicio: el workspace de la sesión era
C:\Users\kaosk\source\repos\gestion-solicitudes-aprobaciones.
Se comprobó su raíz, rama main limpia y origin correspondiente al Proyecto 02;
se leyó su documentación de contexto. No se modificó ni se copió implementación.
No se inspeccionó el Proyecto 01.

Destino: C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos.
No existía. Se comprobaron las rutas AGENTS.md de sus antecesores, sin encontrar
archivos, y que C:\Users\kaosk\source\repos no pertenece a otro repositorio.
Se creó la carpeta independiente, previa autorización técnica del sandbox para
escribir fuera del workspace inicial. No hubo rechazo de revisión automática.

Proyecto 03 sin Git: no hay rama, HEAD, staging, commits ni remoto configurado.
No se ejecutó git init ni se creó un repositorio remoto. La ausencia del remoto
procede del encargo de Alex, no de una consulta independiente a GitHub.
Alex debe crear el repositorio en esta carpeta desde GitHub Desktop.

### Entorno comprobado

| Herramienta | Resultado real |
| --- | --- |
| Node.js | v24.13.0, instalado en Program Files; sin cambios |
| npm global | 11.6.2; sin cambios |
| npm usado para instalar y verificar | 11.21.2, ejecutado mediante npx |
| Git | 2.56.1.windows.1 |
| TypeScript | 7.0.2 instalado; tsc --version confirmado |
| PostgreSQL local | psql, postgres y pg_ctl no encontrados en PATH; directorio habitual Program Files/PostgreSQL ausente |
| Docker CLI | 29.9.3, build 5457199 |
| Motor Docker | docker info no pudo conectar con docker_engine; configuración del cliente inaccesible desde sandbox |

Estas comprobaciones no prueban que PostgreSQL no exista en ninguna otra ruta
ni que Docker esté averiado. No se buscaron binarios dentro de otros proyectos.
No se arrancó Docker ni PostgreSQL. Para una fase posterior quedan las opciones
de una instalación propia del Proyecto 03 o un contenedor exclusivo si se
autoriza y verifica el motor; no se seleccionó ni preparó ninguna.

Consultas de npm: TypeScript 7.0.2 requiere Node >=16.20.0; npm 11.21.2 requiere
^20.17.0 o >=22.9.0. npm latest devolvió 12.2.2, que exige ^22.22.2, ^24.15.0
o >=26.0.0 y no es compatible con el Node local. Se eligió npm 11.21.2.
Node 24 sigue en una [rama LTS](https://nodejs.org/en/about/previous-releases);
no se actualizó el parche instalado. Configuración
[NodeNext](https://www.typescriptlang.org/tsconfig/module.html) con target ES2024.

La primera consulta npm falló con EPERM al escribir en la caché global fuera
del sandbox. Se repitió usando npm_config_cache en TEMP/p03-npm-cache solo para
los procesos de esta sesión, sin editar configuración global. Queda caché de
herramientas en esa carpeta temporal; no forma parte de los archivos a publicar.

### Archivos creados

Doce archivos previstos para revisión manual:

- package.json y package-lock.json.
- tsconfig.json.
- .gitignore y .env.example.
- src/index.ts.
- tests/README.md.
- README.md y AGENTS.md.
- docs/PROJECT_BRIEF.md.
- docs/DECISION-COLA.md.
- docs/STATUS.md.

Se generaron además node_modules y dist, excluidos mediante .gitignore.
Un único paquete raíz privado; una única dependencia directa de desarrollo,
typescript 7.0.2. Su paquete opcional para Windows x64 se instala localmente;
el lockfile incluye las variantes opcionales de otras plataformas.
No hay dependencias de ejecución, ORM, Express, pg, pg-boss ni peers artificiales.
No hay secretos en .env.example; no se creó .env.

### Comprobaciones ejecutadas

Desde la carpeta del Proyecto 03, todas las operaciones de instalación y scripts
usaron el prefijo npx --yes --package=npm@11.21.2 npm.

| Comando tras el prefijo | Resultado |
| --- | --- |
| --version | 11.21.2 |
| install --ignore-scripts | Correcto; genera lockfile; dos paquetes instalados, tres auditados, cero vulnerabilidades informadas |
| ci | Correcto; dos paquetes instalados, tres auditados, cero vulnerabilidades informadas |
| run typecheck | Correcto, código 0 |
| run build | Correcto, código 0; genera dist/index.js |
| exec -- tsc --version | Version 7.0.2 |

Hash SHA-256 del lockfile idéntico antes y después de npm ci.
node dist/index.js terminó con código 0 y sin salida: solo comprueba que el
módulo vacío compilado carga, no acredita comportamiento del producto.

**Pruebas funcionales: cero.** No hay suite ni script test ficticio.
Sin comprobaciones HTTP, navegador, integración PostgreSQL o CI; no hay
aplicación que arrancar. No se iniciaron servidores ni procesos persistentes.

### Cola, decisiones pendientes y próximo paso

Recomendación condicionada: pg-boss 12.38.2 con PostgreSQL 18, según
[DECISION-COLA](DECISION-COLA.md). Se consultaron las tres fuentes solicitadas y
documentación adicional oficial. No se instaló ni ejecutó la cola.

Pendientes: aprobación del contrato, definición de equivalencia, jitter y
Retry-After; disponibilidad de PostgreSQL exclusivo; instalación y revisión del
peer de pg-boss; atomicidad de reserva/historial; protección contra ejecuciones
antiguas; agotamiento sin handler y retención hasta conciliación.

La base mínima no queda bloqueada. La compatibilidad de la integración real
permanece sin demostrar. El siguiente paso técnico propuesto es un encargo
acotado para ejecutar la prueba descrita en DECISION-COLA, antes de adoptar la
cola o implementar recepción y trabajador. Esta sesión no lo inicia.

### Publicación manual sugerida

Nombre: entrega-fiable-eventos-pedidos.
Rama prevista: main. Alex crea el repositorio local y remoto, revisa archivos
y realiza staging, commit y push mediante GitHub Desktop.

Summary:

~~~text
chore: preparar la base inicial del Proyecto 03
~~~

Description:

~~~text
Prepara un paquete privado Node.js y TypeScript con lockfile, ESM/NodeNext,
comprobación de tipos y compilación.

Documenta el alcance propuesto de recepción y entrega de eventos, las
reglas de trabajo y la evaluación provisional de pg-boss frente a una
cola propia PostgreSQL.

Verifica instalación reproducible, conservación del lockfile, tipos y
build. No implementa recepción, trabajador, reintentos ni receptor.
Deja pendiente la prueba técnica de cola con PostgreSQL real.
~~~

La descripción del repositorio sugerida figura en [README](../README.md).
No se crean tags, releases ni despliegues.

### Revisión documental final

Revisados los 12 archivos previstos para publicar: UTF-8 válido y nueve enlaces
locales existentes. git -c core.autocrlf=false diff --no-index --check contra
un archivo vacío, por archivo, no informó incidencias. Se usó --no-index porque
Proyecto 03 no tiene repositorio; no se presenta como un diff contra un commit.
El ajuste core.autocrlf solo se aplicó a ese comando, tras un aviso LF/CRLF;
no se editó configuración Git.

Revisadas exclusiones de node_modules, dist y archivos privados.
.env.example conserva valores vacíos; .env y .git ausentes.
No se afirma haber ejecutado una auditoría exhaustiva de secretos.

Comprobación final de Proyecto 02 desde su propio workspace: main...origin/main
limpio y git diff --check sin errores, remoto conservado. Un intento previo
desde el directorio hermano fue rechazado por dubious ownership del usuario
sandbox; se resolvió ejecutando la lectura desde el workspace original,
sin cambiar safe.directory global.

Proyecto 03 termina con carpeta y base local preparadas, sin Git ni publicación.
La revisión y creación del repositorio, staging, commit y push quedan a Alex.
