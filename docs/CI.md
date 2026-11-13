# CI preparada — pendiente de ejecución remota

[Workflow](../.github/workflows/ci.yml) para push a main y pull_request.
Ubuntu 24.04, Node 24.13.0 y npm 11.21.2 explícito mediante npx, igual que local.
permissions: contents: read; timeout 15 minutos; sin despliegue ni escritura remota.

## Servicio y permisos

Servicio postgres:18.7-bookworm, versión concreta listada en el
[catálogo oficial de imágenes](https://github.com/docker-library/official-images/blob/master/library/postgres).
Healthcheck pg_isready antes de los pasos y puerto dinámico del servicio.
Se usa el cliente psql del runner, no su servidor PostgreSQL local.

[scripts/ci-database.sql](../scripts/ci-database.sql) es exclusivamente para el
contenedor efímero. El superusuario crea la base entrega_fiable_eventos_pedidos_test,
p03_prueba y p03_api_prueba, revoca acceso público y concede:

- p03_prueba: CONNECT y CREATE en esa base, para sus esquemas efímeros.
- p03_api_prueba: CONNECT; el fixture propietario concede el mismo conjunto
  limitado de tablas que usa la API y elimina solo su esquema al terminar.

Ambos roles son ordinarios, sin CREATEDB/CREATEROLE. Las suites no usan superusuario.
Las contraseñas visibles de CI son exclusivas del contenedor desechable, no secretos
personales ni valores de .env. La variable administrativa existe solo en preparación.
No ejecutar este SQL sobre desarrollo.

No se necesitan .env, .local, PostgreSQL portátil Windows ni credenciales de desarrollo.
La ausencia de TEST_DATABASE_URL, TEST_API_DATABASE_URL o PostgreSQL provoca fallo.
Las suites verifican current_database antes de escribir o limpiar.

## Pasos y revisión

npm ci y git diff --exit-code -- package-lock.json; typecheck; build; test:core,
test:http, test:delivery y test:operations, secuencialmente. Sin skip,
continue-on-error ni reintentos generales. El experimento histórico pg-boss no se ejecuta.

Acciones oficiales fijadas a los SHA obtenidos de sus referencias v7:

| Acción | SHA verificado |
| --- | --- |
| actions/checkout | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node | 949feb2413d6458794dcd2491c4babbbce0c15c1 |

checkout no conserva credenciales y setup-node desactiva caché automática.
Se consultaron los manifiestos oficiales de
[checkout](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml)
y [setup-node](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/action.yml),
la [guía de servicios PostgreSQL](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
y el [inventario Ubuntu 24.04](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md).

Revisión estática local con actionlint 1.7.12, binario privado en .local descargado
de su [publicación oficial](https://github.com/rhysd/actionlint/releases/tag/v1.7.12)
y SHA-256 del archivo verificado:
6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9.
Sin instalación global. No hay shellcheck/pyflakes locales; se desactivaron esas
integraciones y se revisaron manualmente los comandos y SQL. actionlint final: código 0.
La primera revisión detectó índices numéricos en ports; se corrigieron a claves de texto.

**Preparada y revisada, no ejecutada remotamente.** No se instaló ni reparó Docker/WSL.
El SQL del contenedor se revisó, no se ejecutó contra la base de desarrollo.
Tras el commit y push manuales de Alex, comprobar el run y el SHA exacto antes de
atribuir resultados a CI o plantear el cierre de V1.
