# Trabajador HTTP y receptor idempotente — Encargo 05

El trabajador y el receptor son procesos independientes de la API.
Usan exclusivamente PostgreSQL propio; pg-boss no participa.
No comparten transacción ni tablas. En desarrollo tienen bases diferentes;
en pruebas usan esquemas diferentes dentro de la base _test.

## Reserva, envío y finalización

El trabajador comprueba configuración, base, catálogo de migraciones y permisos.
Su bucle secuencial recupera vencimientos al inicio de cada ciclo, reserva como
máximo una entrega, realiza una única petición HTTP y finaliza mediante el núcleo.
Si no encuentra trabajo o falla persistencia, espera 500 ms de forma cancelable.
No hay bucles superpuestos ni reintentos internos del cliente HTTP.

Se conservan reserva de 30 s, máximo seis intentos totales y bases
5/10/20/40/80 s con jitter 0–20 %. No hay purga ni orden garantizado.
Dos procesos pueden trabajar en la misma cola gracias a FOR UPDATE SKIP LOCKED.
No se mantiene una transacción ni un bloqueo de fila durante el envío.

El destino se configura, nunca procede del evento. Solo se admite
http://127.0.0.1:PUERTO/eventos, con puerto 1–65535.
Se rechazan hostnames, destinos externos, HTTPS en esta demo local, userinfo,
query, fragmento y rutas diferentes. El cliente node:http no sigue redirecciones.
Envía el sobre completo almacenado, application/json y Bearer ENTREGA_TOKEN.
jsonb puede reordenar claves; se conservan valores y orden de líneas.

El timeout total de 5 s comienza al crear la petición e incluye la lectura del
recibo. El cuerpo de respuesta está limitado a 8 KiB: al superar el límite,
vencer el tiempo o detectar un corte se destruyen petición/respuesta y se libera
el temporizador. No se guardan cuerpos, cabeceras completas ni errores originales.

Solo HTTP 200 con JSON objeto cerrado de dos campos confirma entrega:

~~~json
{"eventoId":"d473c6c2-194a-4fb4-a881-41fb18246a26","resultado":"aplicado"}
~~~

eventoId debe coincidir; resultado debe ser exactamente aplicado o ya_aplicado.
Otro 2xx, propiedades adicionales, resultado de otro tipo, UUID diferente,
JSON inválido o recibo truncado no acreditan entrega.

## Clasificación y Retry-After

| Observación | Transición | Categoría persistida |
| --- | --- | --- |
| 200 y recibo válido | entregado | recibo_aplicado / recibo_ya_aplicado |
| Conexión rechazada antes de cabeceras | reintentar | conexion |
| Timeout total | reintentar | timeout |
| Respuesta interrumpida o excesiva | reintentar | respuesta_interrumpida / respuesta_excesiva |
| 2xx sin recibo válido | reintentar | recibo_invalido |
| 408, 429 o 5xx | reintentar | http_reintentable |
| Otros 4xx | fallido_definitivo | http_definitivo |
| 3xx | fallido_definitivo, sin seguir Location | redireccion |
| Reserva vencida recuperada | reintentar o agotado | reserva_vencida; resultado desconocido |

Si se observó un 3xx/4xx definitivo, ese código prevalece aunque su cuerpo no
pueda leerse por completo. Un código HTTP solo se guarda si se observaron cabeceras.
No se copia contenido remoto a categorías o logs.

Para 429 se admite Retry-After como segundos enteros no negativos o fecha HTTP.
Se reconocen IMF-fixdate, RFC 850 y asctime, con comprobación de calendario/día
de semana. Los segundos relativos toman clock_timestamp de PostgreSQL, redondeado
hacia arriba al milisegundo al construir Date para no adelantar la espera.
La conversión usa BigInt y rechaza fechas fuera del rango representable de Date;
no recorta un valor válido. Las fechas absolutas ya tienen precisión de segundos.

La próxima ejecución es el máximo entre backoff y fecha mínima, calculado por
el núcleo dentro de la transición protegida. Una fecha pasada no reduce backoff.
Ausente, inválido o no representable utiliza backoff y deja una categoría
ausente/invalido/no_representable en retry_after; un valor aceptado deja segundos
o fecha. No se almacena la cabecera.

Referencias contrastadas: [Retry-After, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)
y [cliente HTTP de Node](https://nodejs.org/api/http.html#httprequesturl-options-callback).
Las garantías concretas se verifican con el Node 24 instalado.

## Diagnósticos y protección temporal

La [migración 002](../src/persistence/migrations/002-diagnostics.ts) añade a intento:
codigo_http, categoria y retry_after, con CHECK de valores permitidos.
Reutiliza reservado_en, vence_en y finalizado_en; no necesita otro reloj de aplicación.
Los registros anteriores se conservan con nuevos campos null.

finalizar compara estado, token, número y vencimiento después de adquirir bloqueo.
Estado, resultado del intento y diagnósticos confirman en la misma transacción.
Una ejecución antigua no puede modificar tampoco codigo_http o categoria.
La recuperación marca desconocido/reserva_vencida y deja codigo_http null.

Si el receptor confirmó pero falla la finalización local, la transacción local
revierte. El trabajador registra solo una categoría segura de incertidumbre:
no marca entregado ni vuelve a enviar dentro de la misma reserva.
La reserva pendiente de cierre vencerá; una recuperación posterior consumirá
otro intento y podrá recibir ya_aplicado.

Mientras todos los trabajadores estén detenidos no hay recuperación automática
en ejecución. Al reiniciar se usa exclusivamente el estado persistido.
Un cierre normal espera el intento activo y detiene nuevas reservas.
Los CLI admiten SIGINT/SIGTERM y un mensaje de cierre por IPC privado del padre
para la demo en Windows; no hay endpoints de control. El cierre tiene límite de
20 s y, si se agota, termina el proceso con código 1 dejando la recuperación a la
persistencia. La demo espera el cierre y no mata procesos ajenos.

## Receptor y efecto ficticio

[ReceiverStore](../src/receiver/store.ts) usa una transacción propia:
inserta procesado con eventoId/pedidoId únicos y contenido jsonb; inserta
preparacion con eventoId/pedidoId únicos; confirma y después devuelve aplicado.
Mismo UUID/pedido/contenido devuelve ya_aplicado sin nueva preparación.
Contenido diferente o otra identidad para el pedido devuelve 409.

Comparte la validación y el parser del contrato HTTP de entrada.
POST /eventos del receptor exige ENTREGA_TOKEN. GET /salud es mínimo.
No tiene listado, panel, historial por HTTP ni endpoints de fallo.

La deduplicación vive en PostgreSQL, no en memoria del servidor.
Matar un trabajador después del efecto o perder la respuesta puede causar dos
envíos, pero la segunda transacción reconoce el evento y no prepara otra vez.
Esta es una garantía del efecto ficticio de este receptor, no una promesa universal
de exactamente una vez para servicios externos.

## Catálogos, roles y configuración

La migración 001 publicada del emisor no cambia.
[queueMigrations](../src/persistence/catalog.ts) reúne 001 y 002.
El migrador y EventStore.ready()/GET /listo usan ese mismo catálogo y sus hashes,
sin mantener otra cuenta fija de versiones.
El [catálogo del receptor](../src/receiver/migrations.ts) contiene su propia versión 1.
El proceso nunca migra al arrancar.

| Rol | Base y permisos |
| --- | --- |
| p03_api | Emisor; permisos previos de recepción/consulta sin ampliarlos |
| p03_migracion | Propietario/migrador del emisor |
| p03_trabajador | Emisor; SELECT de evento/entrega/intento/migracion, UPDATE de entrega/intento, INSERT de intento |
| p03_receptor | Base receptor; SELECT de procesado/preparacion/migracion, INSERT de procesado/preparacion |
| p03_receptor_migracion | Propietario/migrador de base y esquema receptor |

Los procesos ordinarios no tienen superusuario, CREATEDB, CREATEROLE ni CREATE
en base, public o su esquema. No se concede UPDATE/DELETE al receptor ni inserción
de eventos al trabajador. No se alteran credenciales o asignaciones existentes.

Nuevas variables privadas:

- WORKER_DATABASE_URL.
- RECEPTOR_DATABASE_URL.
- RECEPTOR_MIGRATION_DATABASE_URL.
- ENTREGA_TOKEN, distinto de RECEPCION_TOKEN y CONSULTA_TOKEN.
- DESTINO_URL, loopback/ruta fija/puerto.
- RECEPTOR_PORT opcional, por defecto 3004.

db:delivery:prepare verifica el cluster propio, crea solo recursos ausentes y
completa .env sin sustituir valores. Las nuevas contraseñas quedan en
.local/portable-postgres/delivery.json, fuera de Git.
db:delivery:migrate aplica ambos catálogos y concede solo permisos necesarios.
La preparación y migración pueden repetirse sin reinicializar ni borrar datos.
[README](../README.md) contiene la secuencia PowerShell y la demostración.

## Pruebas y alcance

test:delivery usa PostgreSQL y HTTP reales, con esquemas nuevos de emisor/receptor
en entrega_fiable_eventos_pedidos_test. Nunca limpia desarrollo.
Cierra procesos, HTTP, temporizadores y pools antes de borrar solo esos esquemas.

Se distingue entre:
- SIGKILL real del hijo trabajador tras reserva y tras efecto remoto.
- Corte real de conexión antes de responder, después del COMMIT del receptor.
- Timeout real de 5 s durante lectura, no solo configuración de AbortSignal.
- Fixtures que adelantan vencimiento para probar rollback y resultados antiguos.
- Perfil reducido para reservas y backoff, conservando seis intentos.
- Reinicio real del proceso receptor y demostración con CLI y roles restringidos.

No se han probado apagones prolongados, caída del sistema PostgreSQL completo,
carga, alta disponibilidad, TLS o redes externas. Sin reintento manual, purga,
listado/paginación, historial por HTTP, frontend, despliegue ni CI nueva.
[STATUS](STATUS.md) registra resultados y límites; no se atribuyen a un commit
anterior ni a una ejecución remota de CI.
