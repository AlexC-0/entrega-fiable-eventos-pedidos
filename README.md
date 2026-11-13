# Recepción y entrega fiable de eventos de pedidos

Proyecto 03 de CHAMBA DIARIA: `entrega-fiable-eventos-pedidos`.

**Encargo 04: recepción HTTP autenticada y consulta individual implementadas.**
Se puede aceptar un pedido ficticio, conservarlo y consultar su estado.
Las entregas permanecen **pendientes**, sin trabajador ni envío al destinatario.

El [repositorio](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos) está
publicado por Alex. El Encargo 03 se publicó en
[1ef64e8](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/1ef64e872453875811111fda8840bd63193ef5c3);
HEAD, origin/main y consulta remota coincidían al iniciar este trabajo con main limpia.
Los cambios de este encargo quedan sin staging para el commit y push manuales de Alex.

## Preparación — PowerShell

Desde `C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos`:

~~~powershell
npx --yes --package=npm@11.21.2 npm ci
npx --yes --package=npm@11.21.2 npm run db:portable -- up
npx --yes --package=npm@11.21.2 npm run db:prepare
npx --yes --package=npm@11.21.2 npm run typecheck
npx --yes --package=npm@11.21.2 npm run build
npx --yes --package=npm@11.21.2 npm run db:migrate
npx --yes --package=npm@11.21.2 npm start
~~~

La API escucha en `http://127.0.0.1:3003`; PORT permite otro puerto libre.
Arrancar la API no crea esquemas, tablas ni bases. La migración es explícita.
Importar sus módulos no abre puertos. Ctrl+C cierra servidor y pool.

Se reutiliza PostgreSQL portátil 18.7 en `127.0.0.1:55434`.
No se reinicializa el cluster ni se modifica Docker/WSL.
db:prepare crea la base de desarrollo y dos roles nuevos ordinarios, conservando
los recursos anteriores. Completa solo valores ausentes de .env; no imprime secretos.
Repetir preparación/migración conserva credenciales y datos.

| Recurso | Uso |
| --- | --- |
| entrega_fiable_eventos_pedidos | Desarrollo, esquema permanente p03_app |
| entrega_fiable_eventos_pedidos_test | Pruebas, esquemas efímeros propios |
| p03_migracion | Propietario de desarrollo y preparación explícita del esquema |
| p03_api | Recepción/consulta, SELECT e INSERT necesarios; sin permisos de creación |
| p03_prueba | Rol existente para fixtures aislados en la base de pruebas |

Variables privadas: DATABASE_URL, MIGRATION_DATABASE_URL, TEST_DATABASE_URL,
RECEPCION_TOKEN y CONSULTA_TOKEN. La plantilla [.env.example](.env.example)
no contiene valores utilizables. No copiarla sobre .env.
Credenciales y datos siguen dentro de .local; no compartirlos ni borrar el cluster.

## Demostración reproducible

Con la API funcionando, abre otra terminal PowerShell en esta carpeta:

~~~powershell
Invoke-RestMethod http://127.0.0.1:3003/salud
Invoke-RestMethod http://127.0.0.1:3003/listo
npx --yes --package=npm@11.21.2 npm run demo
~~~

El script usa las credenciales privadas sin mostrarlas y guarda un pedido ficticio
en .local/demo-evento.json. Primera ejecución: 202/creado; posteriores:
200/duplicado para la misma identidad. Consulta estado pendiente e intentos 0.
Se puede cerrar y arrancar la API, y repetir la demostración sin borrar datos.
El evento ficticio queda persistido; no se envía a ningún destinatario.

## Operaciones HTTP

| Operación | Credencial | Comportamiento |
| --- | --- | --- |
| POST /eventos | RECEPCION_TOKEN | 202 tras COMMIT; 200 duplicado; 409 conflicto |
| GET /eventos/:eventoId | CONSULTA_TOKEN | Estado individual y fechas; 404 inexistente |
| GET /salud | Sin credencial | Proceso vivo; no consulta PostgreSQL |
| GET /listo | Sin credencial | Persistencia, esquema/migración y permisos disponibles |

[Contrato completo, errores y permisos](docs/HTTP.md).
Sin cookies, sesiones, CORS permisivo, frontend ni exposición pública.

## Comprobación y parada

~~~powershell
npx --yes --package=npm@11.21.2 npm run test:core
npx --yes --package=npm@11.21.2 npm run test:http
~~~

Build previo obligatorio. Las suites exigen TEST_DATABASE_URL y PostgreSQL real,
verifican current_database antes de preparar/limpiar y fallan si no está disponible.
20 casos de núcleo y 22 HTTP: transacciones, contratos, permisos, COMMIT bloqueado,
errores SQL, caída de conexión y reinicio real del proceso API.
Detalle en [tests/README](tests/README.md) y [STATUS](docs/STATUS.md).

Al terminar la API con Ctrl+C:

~~~powershell
npx --yes --package=npm@11.21.2 npm run db:portable -- stop
npx --yes --package=npm@11.21.2 npm run db:portable -- status
~~~

Se conservan datos y secretos. La entrega de este encargo deja la API y PostgreSQL
detenidos, y la base de desarrollo preparada con un evento ficticio pendiente.

## Base técnica y continuidad

Node 24.13.0, npm 11.21.2, TypeScript 7.0.2, Express 5.3.0,
@types/express 5.0.6, pg 8.23.1 y PostgreSQL 18.7.
Paquete privado único y lockfile único.
El núcleo utiliza exclusivamente cola propia PostgreSQL.
pg-boss 12.38.2 permanece como devDependency del experimento histórico;
test:queue y test:guards permiten reproducirlo explícitamente, sin datos compartidos
con el producto. No se ejecutó esa evaluación en este encargo.

- [Alcance vigente](docs/PROJECT_BRIEF.md).
- [Decisión de cola e histórico](docs/DECISION-COLA.md).
- [Núcleo persistente](docs/NUCLEO-COLA.md).
- [Contrato HTTP](docs/HTTP.md).
- [Estado y resultados](docs/STATUS.md).
- [Instrucciones para Codex](AGENTS.md).

Siguiente encargo: trabajador HTTP y receptor idempotente. No se inicia aquí.
Sin purga, reintento manual, listado, historial por HTTP, despliegue ni CI nueva.
