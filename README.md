# Recepción y entrega fiable de eventos de pedidos

Proyecto 03 de CHAMBA DIARIA: `entrega-fiable-eventos-pedidos`.

**Encargo 05: recorrido completo local implementado.**
API autenticada → evento persistido → trabajador HTTP → receptor idempotente →
preparación ficticia → entrega confirmada. Los reenvíos pueden repetirse;
la preparación de este receptor se deduplica dentro de su propia transacción.

Repositorio de [AlexC-0](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos).
Encargo 04 publicado en
[522ca41](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/522ca4113bcb4a738481a3d117e0490b3950d4bd).
Inicio limpio en main, HEAD/origin/main/remoto coincidentes.
Los cambios actuales quedan sin staging para el commit y push manuales de Alex.

## Preparación en PowerShell

Desde `C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos`:

~~~powershell
npx --yes --package=npm@11.21.2 npm ci
npx --yes --package=npm@11.21.2 npm run db:portable -- up
npx --yes --package=npm@11.21.2 npm run db:prepare
npx --yes --package=npm@11.21.2 npm run typecheck
npx --yes --package=npm@11.21.2 npm run build
npx --yes --package=npm@11.21.2 npm run db:migrate
npx --yes --package=npm@11.21.2 npm run db:delivery:prepare
npx --yes --package=npm@11.21.2 npm run db:delivery:migrate
~~~

Se reutiliza PostgreSQL portátil 18.7 en 127.0.0.1:55434.
Los preparadores conservan datos/secretos existentes y generan solo los ausentes.
El arranque de los procesos no crea esquemas ni tablas.
No copiar .env.example sobre .env ni borrar .local para repetir una prueba.
No se cambia Docker/WSL ni se instala un servicio.

| Base propia | Uso |
| --- | --- |
| entrega_fiable_eventos_pedidos | Emisor: eventos, cola e intentos |
| entrega_fiable_eventos_pedidos_receptor | Receptor: deduplicación y preparación ficticia |
| entrega_fiable_eventos_pedidos_test | Pruebas: esquemas exclusivos y efímeros de ambos participantes |

La migración 001 del emisor permanece intacta; la 002 añade diagnósticos.
El receptor tiene su catálogo independiente. Los roles ordinarios p03_api,
p03_trabajador y p03_receptor no tienen DDL; los migradores son separados.
[Configuración, permisos y migraciones](docs/ENTREGA.md).

## Demostración completa

Con la base activa y **sin tener ya abiertos API, receptor o trabajador**:

~~~powershell
npx --yes --package=npm@11.21.2 npm run demo:delivery
npx --yes --package=npm@11.21.2 npm run receiver:inspect
~~~

La demostración inicia los tres procesos propios, acepta el evento ficticio,
espera entregado, comprueba una preparación, repite el POST sin duplicación
y cierra ordenadamente esos tres procesos. PostgreSQL sigue activo.
No cierra procesos ajenos si un puerto está ocupado.
Reutiliza .local/demo-evento.json; si ya estaba aceptado, devuelve 200/duplicado.

Para otro escenario con otra identidad, sin borrar ni modificar los pedidos anteriores:

~~~powershell
npx --yes --package=npm@11.21.2 npm run demo:delivery -- --nuevo
npx --yes --package=npm@11.21.2 npm run receiver:inspect -- UUID_MOSTRADO
~~~

La nueva identidad se conserva en un archivo .local/demo-entrega-UUID.json.
La salida muestra identificador, aceptación, repetición, estado, intentos y
cantidad de preparaciones; nunca tokens.

## Ejecución manual

En tres terminales, después de preparar y migrar:

~~~powershell
# Terminal 1
npx --yes --package=npm@11.21.2 npm start
# Terminal 2
npx --yes --package=npm@11.21.2 npm run receiver
# Terminal 3
npx --yes --package=npm@11.21.2 npm run worker
~~~

API: 127.0.0.1:3003. Receptor: 127.0.0.1:3004.
Destino fijo configurado: http://127.0.0.1:3004/eventos.
Un envío simultáneo por trabajador; pueden ejecutarse dos procesos sobre la cola.
Ctrl+C solicita cierre; el intento activo tiene una ventana acotada y no se
inician nuevas reservas. La recuperación abrupta depende de PostgreSQL.

Se conserva `npm run demo`, la demostración de recepción original.
Muestra el estado actual; con trabajador activo puede observar entregado.
[Contrato HTTP de entrada y consulta](docs/HTTP.md):
POST /eventos, GET /eventos/:eventoId, GET /salud y GET /listo.
Las credenciales de recepción, consulta y entrega son distintas.

## Comprobación y parada

~~~powershell
npx --yes --package=npm@11.21.2 npm run test:core
npx --yes --package=npm@11.21.2 npm run test:http
npx --yes --package=npm@11.21.2 npm run test:delivery
# Tras cerrar los procesos de aplicación:
npx --yes --package=npm@11.21.2 npm run db:portable -- stop
npx --yes --package=npm@11.21.2 npm run db:portable -- status
~~~

Las suites exigen PostgreSQL real y TEST_DATABASE_URL; no omiten casos sin base.
Verifican current_database antes de escribir/limpiar y solo eliminan sus esquemas.
[Catálogo de pruebas](tests/README.md) y [resultados reales](docs/STATUS.md).

## Alcance y continuidad

Sin nuevas dependencias: Node 24.13.0, npm 11.21.2, TypeScript 7.0.2,
Express 5.3.0, pg 8.23.1 y PostgreSQL 18.7.
pg-boss 12.38.2 permanece exclusivamente como experimento histórico.
No se ejecuta sobre eventos del producto.

- [Alcance](docs/PROJECT_BRIEF.md).
- [Decisión de cola](docs/DECISION-COLA.md).
- [Núcleo persistente](docs/NUCLEO-COLA.md).
- [Trabajador, receptor y garantías](docs/ENTREGA.md).
- [Instrucciones para Codex](AGENTS.md).

Sin listado/paginación, historial por HTTP, reintento manual, purga, frontend,
despliegue ni CI nueva. No se promete entrega universal exactamente una vez.
Próximo paso recomendado: revisión operativa y aceptación del recorrido local,
incluidos los procedimientos ante agotamiento. Requiere otro encargo.
