# Recepción y entrega fiable de eventos de pedidos

Proyecto 03 de CHAMBA DIARIA: `entrega-fiable-eventos-pedidos`.

**Estado: Encargo 02 evaluado con PostgreSQL real; producto sin implementar.**
La prueba técnica verifica transacciones, reservas, recuperación, historial y
Retry-After. La adopción de pg-boss sigue pendiente por el límite de retención
de trabajos pendientes. No hay API pública, autenticación ni receptor de negocio.

Repositorio creado y publicado manualmente por Alex:
[AlexC-0/entrega-fiable-eventos-pedidos](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos).
Rama `main`; HEAD, origin/main y consulta remota coincidían en
`34b953a31f013462258be9e6be419a4698f831f3` al iniciar este encargo.
El estado previo sin Git se conserva como histórico en STATUS.

## Entorno utilizado

Ruta: `C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos`.
Node 24.13.0, npm 11.21.2 mediante npx, TypeScript 7.0.2,
pg-boss 12.38.2, pg 8.23.1 y PostgreSQL portátil 18.7.
Un único paquete raíz privado, lockfile único y ESM/NodeNext estricto.
El experimento usa node:test y está separado de `src`.

Docker fue la primera opción, pero su motor falló con `WSL update required`.
Alex autorizó continuar sin Docker. Se cerró Docker Desktop normalmente y se
preparó una instancia portátil exclusiva, sin actualizar WSL, cambiar
virtualización, instalar servicios Windows ni reutilizar proyectos anteriores.

## Preparación y reproducción — Windows

Desde esta carpeta:

~~~powershell
npx --yes --package=npm@11.21.2 npm ci
npx --yes --package=npm@11.21.2 npm run db:portable -- up
npx --yes --package=npm@11.21.2 npm run typecheck
npx --yes --package=npm@11.21.2 npm run build
npx --yes --package=npm@11.21.2 npm run test:guards
npx --yes --package=npm@11.21.2 npm run test:queue
~~~

`up` descarga PostgreSQL 18.7-1 Windows x64 desde EDB y verifica el SHA-256
fijado en el script antes de extraer/ejecutar. En una carpeta nueva prepara el
cluster exclusivo y genera credenciales privadas. Si ya existe, conserva datos,
roles y contraseñas; un conflicto se rechaza, no se reinicializa.
Escucha solo en `127.0.0.1:55434` con SCRAM.
La base es `entrega_fiable_eventos_pedidos_test`; `p03_preparacion` prepara
cluster/base/rol y `p03_prueba` ejecuta las pruebas sin superusuario,
CREATEDB ni CREATEROLE. Tiene CREATE únicamente en la base de pruebas para
crear los esquemas efímeros del experimento.

Archivos privados: `.local/portable-postgres/credentials.json`, datos y logs
dentro de ese directorio, y `.env` con TEST_DATABASE_URL. No compartirlos.
`.env.example` mantiene variables de producto vacías y explica la variable de
prueba; no copiarlo sobre el .env generado.
No hay instalación global ni modificación del PATH.

Al terminar, incluso si una comprobación falla:

~~~powershell
npx --yes --package=npm@11.21.2 npm run db:portable -- stop
npx --yes --package=npm@11.21.2 npm run db:portable -- status
~~~

`stop` conserva datos y credenciales. No borres .local ni ejecutes initdb
manualmente sobre la instancia preparada.

## Qué comprueba el experimento

Nueve casos reales y un control de configuración. Dos ejecuciones completas
sin omisiones; el detalle y sus límites están en [tests/README](tests/README.md)
y [STATUS](docs/STATUS.md).
Los casos usan esquemas nuevos propios, un consumidor hijo que se termina
abruptamente y HTTP local efímero. No prueban la futura V1 completa.
La retención corta del caso F2 provoca un resultado negativo esperado:
el trabajo pendiente desaparece aunque deleteAfterSeconds sea cero.

La suite exige TEST_DATABASE_URL, consulta current_database antes de escribir
o limpiar y rechaza otra base o un rol superusuario. Sin PostgreSQL falla.
Los esquemas propios se eliminan tras cerrar recursos, también ante errores.
El módulo `src/index.ts` sigue sin comportamiento funcional.

## Alternativa Docker preparada, no ejecutada

`compose.experiment.yml` fija `postgres:18.7-bookworm`, nombre y volumen
exclusivos y puerto loopback. `npm run db:experiment -- up|stop|status` prepara
o administra solo esos recursos, mediante el contexto desktop-linux.
La imagen no se descargó ni el contenedor se creó en esta evaluación:
no se atribuyen los resultados al contenedor. Su preparación sigue sin verificar.

No ejecutar ambos entornos en el puerto 55434. La presencia de .env con otras
credenciales provoca rechazo. Cualquier cambio de entorno exige revisar esa
configuración privada, sin borrar datos ni sustituir contraseñas a ciegas.

## Documentación y publicación

- [Alcance funcional propuesto](docs/PROJECT_BRIEF.md).
- [Evaluación y decisión de cola pendiente](docs/DECISION-COLA.md).
- [Resultados y estado](docs/STATUS.md).
- [Instrucciones para Codex](AGENTS.md).

Se conserva .gitattributes creado por GitHub Desktop. node_modules, dist,
dist-experiment, .env y .local quedan fuera de Git.
Los cambios del Encargo 02 se dejan sin staging; Alex realiza el commit y el push
desde GitHub Desktop. No hay CI nueva, tags, releases ni despliegue.
