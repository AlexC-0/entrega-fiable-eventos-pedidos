# Instrucciones para Codex — Proyecto 03

## Contexto y alcance vigente

Trabaja exclusivamente en `entrega-fiable-eventos-pedidos`.
No inspecciones, modifiques, copies ni integres los proyectos anteriores.
Antes de modificar, confirma ruta, raíz Git, rama, remotos y
`git status --short --branch`. Conserva cualquier trabajo posterior del usuario.
Lee README.md, docs/PROJECT_BRIEF.md, docs/DECISION-COLA.md y docs/STATUS.md.
Redacta principalmente en castellano. No hay sincronización automática con
ChatGPT navegador.

Los Encargos 01, 02 y 03 están publicados por Alex. Referencia verificada al iniciar
el Encargo 04: 1ef64e872453875811111fda8840bd63193ef5c3.
El producto utiliza exclusivamente cola propia PostgreSQL, sin purga automática y
con seis intentos totales como máximo. pg-boss queda como experimento histórico;
no ejecutar dos mecanismos sobre los mismos eventos ni repetir su evaluación.

El Encargo 04 abarca recepción HTTP autenticada, consulta individual, salud,
disponibilidad, configuración, base de desarrollo, migración explícita y pruebas
reales. Lee también docs/HTTP.md y docs/NUCLEO-COLA.md.
Conservar intacta la migración 001 publicada y reutilizar registrar().
Separar aplicación, arranque, validación/autenticación y persistencia.
No implementar trabajador ni envío externo, receptor de negocio, historial por
HTTP, listado/paginación, panel, reintento manual, prioridades, múltiples destinos,
purga, despliegue ni CI nueva. No avanzar al siguiente encargo.

POST /eventos aplica el contrato cerrado de docs/HTTP.md, máximo 64 KiB,
JSON UTF-8 sin compresión, sin coerción ni normalización. Autenticar antes del parser.
Esperar registrar() y su COMMIT antes de responder 202; duplicado 200 y conflicto 409.
Credenciales Bearer diferentes para recepción y consulta; sin valores predeterminados.
No registrar tokens, cabeceras Authorization, cuerpos o errores SQL originales.
Errores JSON seguros y estables; distinguir indisponibilidad 503 de fallo interno 500.
GET /salud no depende de la base; GET /listo comprueba la persistencia requerida.
Sin cookies, sesiones ni CORS permisivo. Escuchar únicamente en 127.0.0.1.

La base de desarrollo entrega_fiable_eventos_pedidos está separada de la de pruebas.
DATABASE_URL es del rol p03_api, ordinario y sin permisos de creación.
MIGRATION_DATABASE_URL pertenece al rol p03_migracion y solo sirve al comando
db:migrate. db:prepare conserva credenciales y crea únicamente recursos propios
ausentes. La API nunca crea bases, esquemas ni tablas al arrancar.

## Garantías del núcleo

Usa el mismo cliente y transacciones cortas para cambios conjuntos.
La reserva confirma contador, token, vencimiento e intento antes de cualquier envío.
PostgreSQL determina disponibilidad y vencimiento; no usar el reloj de Node.
Bloquea primero y comprueba después el vencimiento con un reloj fresco al finalizar.
Exige token e intento vigentes; una ejecución antigua nunca altera otra ni un terminal.
Recupera reservas vencidas de forma atómica e idempotente, con resultado desconocido,
reintento si queda presupuesto y agotado tras sexta reserva. Sin depender de finally.
No mantener transacciones abiertas durante operaciones externas.

Política inicial: reserva 30 s; seis intentos incluidos el primero; bases de
5/10/20/40/80 s más jitter de 0–20 %. Próxima fecha = máximo de backoff y fecha
mínima recibida. El análisis HTTP de Retry-After y timeout HTTP de 5 s quedan para
después. Las pruebas pueden reducir tiempos, sin cambiar estados ni presupuesto.
Conservar eventos, entregas e historial; ninguna limpieza automática del producto.
No modificar una migración publicada: añadir una versión posterior.

## Base y verificación

Un único paquete raíz privado y un único package-lock.json.
Node 24; npm 11.21.2 mediante `npx --yes --package=npm@11.21.2 npm`.
TypeScript estricto, ESM/NodeNext e imports internos .js.
pg y Express 5 son dependencias de ejecución; pg-boss permanece en devDependencies del experimento.
Instala solo dependencias usadas; comprueba engines/peers; no uses --force ni
--legacy-peer-deps. No cambies software ni configuración global.

Ante cambios de núcleo: instalación reproducible si cambian dependencias,
typecheck, build, test:core y test:http con PostgreSQL real. Una base ausente debe fallar,
nunca omitir casos. Distingue muerte real de procesos, vencimientos de fixtures
y pruebas temporales aceleradas. No atribuyas al receptor garantías no comprobadas.
En documentación revisa contenido, enlaces, cifras y diff --check.
Actualiza STATUS con comandos, resultados reales, límites y siguiente paso.

## Datos y entorno

Reutiliza PostgreSQL portátil 18.7 propio en .local y los scripts existentes,
en 127.0.0.1:55434, sin servicio Windows. No reinicialices el cluster ni cambies
credenciales, roles o datos existentes. Docker/WSL no es requisito para continuar.
No uses bases, roles, secretos, binarios privados ni scripts de otros proyectos.
No instales herramientas globales ni cierres procesos ajenos.

Exige TEST_DATABASE_URL y verifica current_database() =
entrega_fiable_eventos_pedidos_test antes de escribir o limpiar en pruebas.
Rol ordinario; esquemas nuevos exclusivos p03_core_ por fixture.
Cierra hijos, temporizadores y pools antes de eliminar solo el esquema creado por
esa ejecución. Los residuos desconocidos se informan; nunca se borran a ciegas.
Detén únicamente la instancia propia al finalizar, conservando datos y secretos.
No publiques contraseñas, tokens privados ni URLs con credenciales.
Mantén .env, .local, resultados y compilados fuera de Git.

## Git y entrega

Repositorio existente: AlexC-0/entrega-fiable-eventos-pedidos; rama principal main.
Alex realiza exclusivamente staging, commits y push desde GitHub Desktop.
Codex no ejecutará git init, add, commit, push, cambios de remoto, reescritura de
historial, tags, releases, publicación ni equivalentes por herramientas o API.
No crear otro repositorio, cambiar visibilidad ni desplegar.
Una petición genérica de terminar o publicar no modifica estas reglas.

Deja los cambios locales sin staging. Entrega ruta y estado Git inicial/final,
archivos cambiados, versiones, comprobaciones reales y sus números, decisiones,
limitaciones y siguiente paso concreto. Propón Summary y Description en castellano,
fieles al diff. No atribuyas resultados locales a commits previos ni a CI remota.
