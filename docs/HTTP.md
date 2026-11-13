# Consulta operativa — Encargo 06

Se conserva el contrato de recepción y consulta individual descrito más abajo.
Los dos endpoints nuevos exigen CONSULTA_TOKEN: 401 ausente/desconocido,
403 token de recepción, autenticación antes de validar, Cache-Control: no-store.
No recuperan reservas ni cambian estados o contadores.

## Historial

GET /eventos/:eventoId/intentos devuelve eventoId e intentos ordenados por numero
ascendente, hasta seis y sin paginación. UUID inválido: 422/identificador_invalido;
inexistente: 404/evento_no_encontrado; existente sin intentos: 200 y lista vacía.

~~~json
{
  "eventoId": "d473c6c2-194a-4fb4-a881-41fb18246a26",
  "intentos": [
    {
      "numero": 1,
      "iniciadoEn": "2026-11-13T10:00:00.000Z",
      "venceEn": "2026-11-13T10:00:30.000Z",
      "finalizadoEn": null,
      "resultado": "reservado",
      "codigoHttp": null,
      "categoria": null,
      "retryAfter": null
    }
  ]
}
~~~

Fechas UTC; finalizadoEn null mientras no cierre. Resultado persistido:
reservado, desconocido, reintentable, confirmado o fallido_definitivo.
codigoHttp solo observado, nunca supuesto. categoria y retryAfter pueden ser null
en registros históricos/reservados o cuando no corresponden.
retryAfter es una categoría (ausente, invalido, no_representable, segundos o fecha),
no la cabecera ni su valor original. Diagnósticos en [ENTREGA](ENTREGA.md).
No aparecen reserva_token, contenido, credenciales o errores internos.

## Listado

GET /eventos?estado=...&limite=...&cursor=... devuelve
items y siguienteCursor, null si la petición no encuentra otra página.
Cada item contiene eventoId, pedidoId, estado, intentos, creadoEn,
actualizadoEn, proximaEjecucion, reservaHasta y finalizadoEn.

| Parámetro | Contrato |
| --- | --- |
| estado | Opcional: pendiente, en_proceso, esperando_reintento, entregado, fallido_definitivo o agotado |
| limite | Entero decimal canónico 1–100; predeterminado 20. Sin ceros iniciales, signo, espacios o exponentes |
| cursor | Opaco, base64url canónico sin relleno, máximo 512 caracteres, versión y estructura validadas; conservar exactamente |
| Consulta completa | Máximo 2048 caracteres; rechaza campos desconocidos, repetidos incluso codificados, valores vacíos, escapes/UTF-8 inválidos |

Consulta inválida: 422/consulta_invalida con mensaje seguro constante.
El cursor conserva el filtro (incluida su ausencia); otro estado o quitarlo
produce 422. Se permite cambiar limite. El cursor no es una credencial ni una
firma de integridad; siempre se exige el token de consulta. No editarlo.

Orden ascendente estable por (evento.creado_en, evento.evento_id). Se pide una
fila adicional para decidir siguienteCursor, sin contar un total global.
El timestamp UTC del cursor se obtiene en PostgreSQL como texto con seis decimales
y se compara como timestamptz. No pasa por Date al construir o aplicar la frontera.
creadoEn del listado también conserva seis decimales; las otras fechas y la
consulta individual conservan su serialización ISO a milisegundos.

SQL parametrizado para valores y cursor; los únicos fragmentos condicionales son
constantes del código. [003](../src/persistence/migrations/003-list-index.ts)
añade índice B-tree de creado_en/evento_id, para recorrer por clave sin ordenar
todos los eventos. No se atribuye una mejora de rendimiento medida ni un índice
especializado por estado: puede recorrer filas que no coincidan con ese filtro.

Cada petición lee el estado actual. No existe snapshot global: una inserción con
clave posterior puede aparecer y un cambio de estado puede sacar un evento del
filtro. Un COMMIT tardío con clave anterior al cursor requiere empezar otra consulta
para localizarlo. Sin búsqueda libre, filtros adicionales ni mecanismo de snapshots.

## Preparación y permisos vigentes

Catálogo del emisor 001/002/003; migraciones publicadas intactas.
db:migrate aplica/verifica el catálogo y añade solo SELECT de intento a p03_api.
Se reutiliza el mismo procedimiento de permisos en pruebas con un rol API restringido.
No se conceden UPDATE de entrega, INSERT/UPDATE de intento, DDL o superusuario.
/listo exige ahora también leer las columnas necesarias del historial: falta de
SELECT devuelve 503/persistencia_no_preparada. No concede permisos al arrancar.

Ejemplos seguros y procedimientos: [OPERACION](OPERACION.md).
La documentación siguiente conserva el contexto de los Encargos 04/05; las
referencias a una migración o a dos se sustituyen por el catálogo vigente indicado arriba.

---

# Continuidad de la API — Encargo 05

El contrato de recepción/consulta se conserva. /listo valida ahora el catálogo
vigente de migraciones 001 y 002. El trabajador y receptor independientes están
implementados según [ENTREGA](ENTREGA.md); los apartados de preparación y límites
del Encargo 04 que siguen conservan el contexto de esa entrega.

---

# Recepción y consulta HTTP — Encargo 04

La aplicación se crea en [app.ts](../src/http/app.ts); el arranque y cierre están
en [runtime.ts](../src/server/runtime.ts) y [main.ts](../src/server/main.ts).
La validación, autenticación y consultas están separadas.
Se reutiliza PostgresQueue.registrar(), sin reimplementar la aceptación.

## Identidad, formato y contrato

POST /eventos admite únicamente JSON UTF-8, cuerpo máximo de 65.536 bytes,
Content-Type application/json, opcionalmente charset=utf-8 (también entre comillas).
No se admiten otros parámetros, formatos ni cuerpos comprimidos. Content-Encoding
puede estar ausente o ser identity. La autenticación ocurre antes del parser.

~~~json
{
  "eventoId": "d473c6c2-194a-4fb4-a881-41fb18246a26",
  "tipo": "pedido.confirmado",
  "version": 1,
  "ocurridoEn": "2026-11-13T10:00:00.000Z",
  "datos": {
    "pedidoId": "PED-DEMO-001",
    "lineas": [
      { "sku": "ART-DEMO-001", "cantidad": 2 }
    ]
  }
}
~~~

Todos los campos son obligatorios. No se admiten propiedades desconocidas en ningún
nivel. El objeto raíz, datos y cada línea deben ser objetos JSON, no arrays o null.

- eventoId: UUID de 36 caracteres, guiones y hexadecimal en minúsculas.
- tipo: exactamente pedido.confirmado; version: exactamente el número 1.
- ocurridoEn: fecha real UTC YYYY-MM-DDTHH:mm:ss.sssZ. Se contrasta calendario y
  representación exacta, sin aceptar normalizaciones como 31 de abril o 24:00.
- pedidoId y sku: 1–100 caracteres ASCII, primer carácter alfanumérico;
  después letras, dígitos, punto, guion o guion bajo.
- lineas: 1–100 elementos, sku únicos con comparación exacta sensible a mayúsculas.
- cantidad: número entero entre 1 y 1.000.000.
- Sin coerción, trim ni cambios de los valores recibidos.

Estos límites definen el contrato, no rendimiento medido.
La entrada del núcleo usa eventoId, datos.pedidoId y como contenido el sobre
completo validado. Se conserva igualdad jsonb: el orden de claves no importa;
el orden de líneas sí. No se omiten campos del contenido para deduplicar.
Reutilizar UUID con otro contenido/pedido o confirmar el mismo pedido con otro UUID
produce conflicto; se conserva la identidad tras todas las transiciones del núcleo.

## Credenciales

Authorization: Bearer seguido del token correspondiente:

| Operación | Variable privada |
| --- | --- |
| POST /eventos | RECEPCION_TOKEN |
| GET /eventos/:eventoId | CONSULTA_TOKEN |
| GET /salud y GET /listo | Sin autenticación, respuesta mínima |

Ausente o desconocida: 401 y WWW-Authenticate: Bearer.
Token reconocido de la otra operación: 403.
Los tokens se comparan mediante hashes SHA-256 de longitud fija y timingSafeEqual.
No se aceptan múltiples cabeceras Authorization.
No hay credenciales predeterminadas, cookies, sesiones ni CORS permisivo.
Todas las respuestas de aplicación incluyen Cache-Control: no-store.

El arranque exige tokens distintos, entre 32 y 256 caracteres del alfabeto Bearer
admitido (con hasta dos signos = finales). db:prepare genera 32 bytes aleatorios
criptográficos codificados en hexadecimal si faltan. Conserva los valores existentes;
si son inválidos o iguales, rechaza la configuración en vez de sustituirlos.

No se registran cabeceras, URLs, cuerpos, mensajes SQL originales ni stacks.
Los logs de error HTTP contienen únicamente categoría, código estable y estado.
El arranque informa solo la URL loopback sin credenciales.

## Aceptación y consulta

202 después de que registrar() haya completado el COMMIT de evento y entrega:

~~~json
{
  "eventoId": "d473c6c2-194a-4fb4-a881-41fb18246a26",
  "resultado": "creado",
  "consulta": "/eventos/d473c6c2-194a-4fb4-a881-41fb18246a26"
}
~~~

También se incluye Location con esa ruta relativa.
La repetición equivalente devuelve 200 y resultado duplicado, sin otra entrega.

GET /eventos/:eventoId devuelve eventoId, pedidoId, estado, intentos, creadoEn,
actualizadoEn, proximaEjecucion, reservaHasta y finalizadoEn.
Fechas ISO UTC o null cuando no corresponden. No devuelve contenido completo,
token de reserva ni configuración de conexión.
UUID inválido: 422; válido inexistente: 404. Autenticación previa a validarlo.

**202 significa aceptación persistida**, no entrega al destinatario.
**Pendiente** significa que existe trabajo guardado y aún no se ha reservado.
**Entregado** exige un envío y confirmación válida del receptor, implementados
en el [Encargo 05](ENTREGA.md). La pérdida de la respuesta tras COMMIT se resuelve
repitiendo la misma identidad, no inventando otra confirmación.

## Salud, disponibilidad y errores

GET /salud responde 200 con {"estado":"vivo"}, sin usar PostgreSQL.
GET /listo responde 200 con {"estado":"listo"} si la base esperada, rol ordinario,
migración/hash, tablas consultables y permisos INSERT requeridos están disponibles.
Una base inaccesible o esquema aún no preparado devuelve 503.
No realiza DDL ni crea datos. Es una comprobación puntual, no promete que una
solicitud posterior no pueda sufrir un fallo.

Errores de aplicación con forma consistente:

~~~json
{"error":{"codigo":"contrato_invalido","mensaje":"El evento no cumple el contrato pedido.confirmado v1."}}
~~~

| HTTP | Código estable | Situación |
| --- | --- | --- |
| 400 | json_invalido | JSON mal formado, tamaño declarado incoherente o petición abortada |
| 401 | no_autenticado | Credencial ausente/desconocida |
| 403 | sin_permiso | Credencial reconocida para otra operación |
| 404 | evento_no_encontrado / ruta_no_encontrada | Evento o ruta inexistente |
| 409 | evento_en_conflicto | Identidad o pedido incompatibles con un registro previo |
| 413 | cuerpo_demasiado_grande | Más de 64 KiB, incluso con transferencia segmentada |
| 415 | formato_no_admitido | Content-Type, charset, bytes UTF-8 o compresión no admitidos |
| 422 | contrato_invalido / identificador_invalido | Entrada o parámetro fuera del contrato |
| 503 | persistencia_no_disponible | Conexión/red, cierre de PostgreSQL, saturación o timeout conocido |
| 503 | persistencia_no_preparada | /listo detecta base/rol/esquema/migración/permisos requeridos incorrectos |
| 500 | error_interno | Error inesperado, incluido SQL de integridad o fallo diferido de COMMIT |

El parser puede aceptar JSON válido fuera del contrato, como null; la validación
lo convierte en 422. No se transforman todos los errores en 503.
Ni un error de inserción ni un fallo durante COMMIT producen 202.
No se exponen detalles internos en errores.
Los errores del protocolo HTTP que Node rechace antes de Express quedan fuera
del formato de aplicación.

## Desarrollo, migración y ejecución

[README](../README.md) contiene los comandos PowerShell completos.

| Variable | Uso |
| --- | --- |
| DATABASE_URL | API, base entrega_fiable_eventos_pedidos y rol p03_api |
| MIGRATION_DATABASE_URL | Migrador explícito, rol p03_migracion |
| TEST_DATABASE_URL | Suites, base entrega_fiable_eventos_pedidos_test |
| RECEPCION_TOKEN / CONSULTA_TOKEN | Permisos Bearer separados |
| PORT | Puerto HTTP 1–65535; predeterminado 3003 |

El proceso API solo admite la base propia de desarrollo en 127.0.0.1:55434,
usuario p03_api y esquema fijo p03_app. Rechaza una URL de pruebas.
Escucha siempre en 127.0.0.1, sin variable para habilitar exposición pública.
Carga .env únicamente el comando backend; importar módulos no lo carga.

db:prepare verifica current_database y data_directory del cluster propio antes
de preparar los recursos nuevos. Usa las credenciales administrativas existentes
sin alterarlas; crea p03_migracion y p03_api y una base de desarrollo separada.
Guarda sus nuevas contraseñas privadas en .local/portable-postgres/development.json.
No reinicializa cluster, no cambia p03_prueba ni p03_preparacion y no toca datos de pruebas.
Una colisión con recursos ajenos o configuración privada distinta se rechaza.

db:migrate comprueba URLs exactas, base, rol y propiedad del esquema.
Aplica/verifica la migración 001 publicada **sin modificar su SQL**.
No fue necesaria otra versión de esquema. Concede al rol API USAGE del esquema,
SELECT sobre evento/entrega/migracion e INSERT sobre evento/entrega.
La API no es propietaria, no tiene superusuario, CREATEDB, CREATEROLE ni CREATE
en la base, public o p03_app. Tampoco necesita UPDATE/DELETE ni operar intentos.

El servidor mantiene límites de conexión/consulta y cierra HTTP antes del pool
al recibir SIGINT/SIGTERM. Deja hasta seis segundos para solicitudes abiertas antes
de cerrar conexiones HTTP restantes. No contiene trabajador ni temporizador de cola.

## Evidencia y límites

[Suite HTTP](../tests/http/http.test.ts): 22 casos sobre PostgreSQL real.
Prueba un COMMIT bloqueado mediante trigger diferido antes de emitir 202;
otro trigger falla durante COMMIT y verifica rollback sin aceptación.
Se prueba reinicio real de un proceso hijo HTTP sobre el mismo esquema.
No se usan mocks para acreditar la aceptación.

La demostración con rol p03_api verifica preparación, permisos, 202, consulta
pendiente, reinicio y 200 duplicado. El evento ficticio se conserva en desarrollo.
Las pruebas usan credenciales efímeras, esquemas nuevos y rol de pruebas propio;
cierran hijos, HTTP y pools antes de limpiar únicamente el esquema creado.
Sin base fallan explícitamente, sin skip. Resultados en [STATUS](STATUS.md).

No hay trabajador, destinatario, historial de intentos por HTTP, listado/paginación,
purga, reintento manual, frontend, TLS/despliegue o CI nueva.
No se afirma idempotencia del efecto remoto ni entrega exactamente una vez.
Próximo encargo: trabajador HTTP y receptor idempotente.

Referencias contrastadas: [API Express 5](https://expressjs.com/en/5x/api/),
[parser JSON y opciones de límite/inflate](https://expressjs.com/en/resources/middleware/body-parser/).
Las versiones efectivamente instaladas están fijadas en package.json y el lockfile.
