# Recepción y entrega fiable de eventos de pedidos

Proyecto 03 de CHAMBA DIARIA: `entrega-fiable-eventos-pedidos`.

**Encargo 03: núcleo persistente de cola propia en PostgreSQL implementado.**
Registra eventos y entregas de forma atómica, reserva trabajo con historial,
rechaza resultados antiguos y recupera intentos interrumpidos. Se conserva todo
sin purga por antigüedad y con un máximo de seis reservas por entrega.
No hay todavía API HTTP, autenticación, trabajador continuo ni receptor de negocio.

Repositorio publicado manualmente por Alex:
[AlexC-0/entrega-fiable-eventos-pedidos](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos).
El Encargo 02 está publicado en
[ca1740b](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/ca1740b0c515354250f54abf7213c91fff5a7b9a).
Al iniciar este encargo, main estaba limpia y HEAD, origin/main y consulta remota
coincidían con ese commit. Los cambios actuales quedan sin staging para Alex.

## Entorno

Ruta: `C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos`.
Node 24.13.0, npm 11.21.2 mediante npx, TypeScript 7.0.2,
pg 8.23.1 y PostgreSQL portátil 18.7.
Un paquete raíz privado, lockfile único, ESM/NodeNext estricto y node:test.
pg-boss 12.38.2 se conserva como dependencia de desarrollo exclusivamente para
reproducir el experimento histórico; el producto no lo importa ni lo ejecuta.

Docker fue la primera opción del Encargo 02, pero falló por WSL.
Alex autorizó PostgreSQL portátil propio. Se reutiliza la instancia existente;
no se actualiza WSL ni se modifica software global.

## Preparación y comprobación — Windows

Desde esta carpeta:

~~~powershell
npx --yes --package=npm@11.21.2 npm ci
npx --yes --package=npm@11.21.2 npm run db:portable -- up
npx --yes --package=npm@11.21.2 npm run typecheck
npx --yes --package=npm@11.21.2 npm run build
npx --yes --package=npm@11.21.2 npm run test:core
~~~

`up` conserva el cluster, roles y contraseñas ya existentes. Si no existen,
el script original descarga PostgreSQL 18.7-1 Windows x64 de EDB y verifica su
SHA-256 antes de prepararlos. Un conflicto se rechaza, no se reinicializa.
Escucha solo en `127.0.0.1:55434` con SCRAM.
Base exacta: `entrega_fiable_eventos_pedidos_test`.
`p03_preparacion` prepara la instancia; `p03_prueba` ejecuta con NOSUPERUSER,
NOCREATEDB y NOCREATEROLE, y CREATE en esta base para esquemas efímeros propios.

Archivos privados: `.local/portable-postgres/credentials.json`, datos y logs
bajo ese directorio, y `.env` con TEST_DATABASE_URL. No compartirlos ni copiar
.env.example sobre el .env generado. No se modifica PATH ni se instala un servicio.

Al terminar, incluso si una comprobación falla:

~~~powershell
npx --yes --package=npm@11.21.2 npm run db:portable -- stop
npx --yes --package=npm@11.21.2 npm run db:portable -- status
~~~

`stop` conserva los datos. No borres .local ni ejecutes initdb sobre la instancia.
Estos comandos verifican una biblioteca de persistencia: no hay servidor que abrir
en el navegador ni esquema de negocio permanente preparado por este encargo.

## Qué se ha probado

Veinte casos con PostgreSQL real: transacciones, duplicados y conflictos concurrentes,
reservas excluyentes, resultados tardíos, recuperación, muerte real de hijos en
primera y sexta reservas, backoff, fecha mínima, trabajo antiguo e historial.
Detalle, perfiles de tiempo y resultados en [tests/README](tests/README.md)
y [STATUS](docs/STATUS.md).

La suite exige TEST_DATABASE_URL, consulta current_database y comprueba rol ordinario
antes de preparar o limpiar. Crea esquemas p03_core_ exclusivos y los elimina tras
cerrar sus recursos. Sin PostgreSQL falla, sin omitir casos.
Los fixtures antiguos no equivalen a una parada real de años.
No se ha demostrado todavía la idempotencia del efecto en un receptor.

## Experimento histórico y alternativa Docker

El Encargo 02 evaluó pg-boss y demostró el límite de retención de pendientes.
Se preservan código y resultados en experiments/cola y en la
[decisión de cola](docs/DECISION-COLA.md). No se repite esa evaluación ni forma
parte de test:core. Reproducción histórica explícita: después de build,
`npm run test:guards` y `npm run test:queue`, usando el npm fijado arriba.
Sus datos aislados nunca se comparten con los eventos del producto.

compose.experiment.yml y scripts/database-experiment.mjs siguen como alternativa
Docker preparada, sin verificar ni ejecutar en este encargo. No ejecutar ambos
entornos sobre el puerto 55434 ni sustituir credenciales para cambiar de entorno.

## Documentación y siguiente paso

- [Alcance vigente y propuesta HTTP futura](docs/PROJECT_BRIEF.md).
- [Decisión de cola propia e histórico](docs/DECISION-COLA.md).
- [Operaciones, migraciones y garantías del núcleo](docs/NUCLEO-COLA.md).
- [Resultados y estado](docs/STATUS.md).
- [Instrucciones para Codex](AGENTS.md).

Siguiente encargo: recepción HTTP autenticada sobre este núcleo.
No se inicia automáticamente. Se conserva .gitattributes; node_modules, dist,
dist-experiment, dist-tests, .env y .local quedan fuera de Git.
Alex realiza commit y push desde GitHub Desktop. Sin CI nueva, tags ni despliegue.
