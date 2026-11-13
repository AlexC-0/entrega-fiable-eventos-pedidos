# Recepción y entrega fiable de eventos de pedidos

Proyecto 03 de CHAMBA DIARIA: `entrega-fiable-eventos-pedidos`.

**V1 técnicamente completada dentro del alcance local acordado. Encargo 07: cierre documental.**
API autenticada → evento persistido → trabajador HTTP → receptor idempotente →
preparación ficticia → entrega confirmada. Los reenvíos pueden repetirse;
la preparación de este receptor se deduplica dentro de su propia transacción.

Repositorio de [AlexC-0](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos).
Encargo 06 publicado en [5dc65b4](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/5dc65b41ba612493a3a96252f7718ad2a7d5bf3b) y [CI 43425880532: success](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/actions/runs/43425880532).
Evidencia facilitada por Alex y contrastada en este cierre con GitHub:
instalación reproducible, tipos, compilación y cuatro suites correctas.
Los cambios documentales del Encargo 07 quedan sin staging para el commit y push
manuales de Alex y la comprobación posterior de ese nuevo commit.

[Ficha de cierre y evidencias del proyecto](docs/FICHA-V1.md): alcance,
arquitectura, decisión de cola, demo, límites y descripción reutilizable.

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
# Para las pruebas de permisos de consulta:
npx --yes --package=npm@11.21.2 npm run db:query-tests
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

Las migraciones publicadas 001/002 permanecen intactas. La nueva 003 añade el
índice de listado (creado_en, evento_id). db:migrate concede a p03_api únicamente
SELECT de intento además de sus permisos previos.
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
POST /eventos, GET /eventos, GET /eventos/:eventoId,
GET /eventos/:eventoId/intentos, GET /salud y GET /listo.
Las credenciales de recepción, consulta y entrega son distintas.

## Consulta operativa

Con PostgreSQL y la API activos:

~~~powershell
npx --yes --package=npm@11.21.2 npm run events:query -- listar "estado=agotado&limite=20"
npx --yes --package=npm@11.21.2 npm run events:query -- evento UUID_DEL_EVENTO
npx --yes --package=npm@11.21.2 npm run events:query -- intentos UUID_DEL_EVENTO
~~~

[Guía operativa](docs/OPERACION.md): paginación, interpretación de diagnósticos,
respuesta perdida e inspección del efecto. El comando usa las variables privadas
sin imprimir tokens. La consulta no modifica estados ni reinicia presupuestos.

## Comprobación y parada

~~~powershell
npx --yes --package=npm@11.21.2 npm run test:core
npx --yes --package=npm@11.21.2 npm run test:http
npx --yes --package=npm@11.21.2 npm run test:delivery
npx --yes --package=npm@11.21.2 npm run test:operations
# Tras cerrar los procesos de aplicación:
npx --yes --package=npm@11.21.2 npm run db:portable -- stop
npx --yes --package=npm@11.21.2 npm run db:portable -- status
~~~

Las suites exigen PostgreSQL real y TEST_DATABASE_URL; test:operations exige además
TEST_API_DATABASE_URL, preparada por db:query-tests. No omiten casos sin base.
El nuevo rol p03_api_prueba carece de DDL; recibe tablas solo en esquemas de fixtures.
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

[CI](docs/CI.md) ejecutada con éxito sobre [5dc65b4](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/5dc65b41ba612493a3a96252f7718ad2a7d5bf3b) y [CI 43425880532: success](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/actions/runs/43425880532).
La [matriz de criterios](docs/CRITERIOS-V1.md) respalda el cierre técnico: 74 pruebas
locales históricas y 74 en esa ejecución remota, con fuentes diferenciadas.
Este encargo no repitió suites ni ejecutó la demostración.

Sin reintento manual, purga, frontend, nuevos destinos ni despliegue.
No se promete entrega universal exactamente una vez. Pendiente únicamente publicar
este cierre documental y comprobar su nuevo commit; el run anterior conserva su SHA.
