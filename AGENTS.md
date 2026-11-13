# Instrucciones para Codex — Proyecto 03

## Contexto y alcance vigente

Trabaja exclusivamente en `entrega-fiable-eventos-pedidos`.
No inspecciones, modifiques, copies ni integres los proyectos anteriores.
Antes de modificar, confirma ruta, raíz Git, rama, remotos y
`git status --short --branch`. Conserva cualquier trabajo posterior del usuario.
Lee README.md, docs/PROJECT_BRIEF.md, docs/DECISION-COLA.md y docs/STATUS.md.
Redacta principalmente en castellano. No hay sincronización automática con
ChatGPT navegador.

Los Encargos 01–05 están publicados por Alex. Referencia verificada al iniciar
el Encargo 06: f9a427adff420d26775cd1dab47f6a09cc7099e2.
El producto utiliza exclusivamente cola propia PostgreSQL, sin purga y con seis
intentos como máximo. pg-boss es histórico y no comparte eventos con el producto.

El Encargo 06 autoriza listado paginado con filtro por estado, historial de intentos,
guía operativa, matriz de criterios V1 y preparación de CI con PostgreSQL real.
Lee también docs/HTTP.md, docs/NUCLEO-COLA.md y docs/ENTREGA.md.
Conservar recepción, cola propia, trabajador y receptor; migraciones 001/002 publicadas.
Usar catálogo común y permisos explícitos: API solo añade SELECT de intento.
El cursor conserva microsegundos y filtro; consultas sin mutaciones ni snapshots globales.
No implementar reintento manual, purga, frontend, nuevos destinos ni despliegue.
CI preparada no equivale a ejecución remota. V1 no se declara cerrada.
No avanzar automáticamente al siguiente encargo.

Un envío simultáneo por trabajador y exactamente una petición por reserva.
Destino fijo configurado: HTTP en 127.0.0.1, puerto y ruta /eventos; sin destinos
del evento, credenciales en URL, query, fragmento ni redirecciones.
Timeout total 5 s incluida lectura; cuerpo de respuesta hasta 8 KiB.
Solo 200 con recibo cerrado del mismo eventoId y aplicado/ya_aplicado confirma.
Recuperar vencimientos al arrancar y periódicamente; sin bucles solapados o retries ocultos.
Una excepción de persistencia después del envío conserva incertidumbre y no permite
reenviar dentro de esa reserva. Cierre acotado, sin nuevas reservas al detener.
No prometer entrega universal exactamente una vez.

Retry-After en 429: segundos no negativos o fecha HTTP válida; segundos referidos
al reloj PostgreSQL. No recortar una demora válida ni reducir el backoff.
Guardar únicamente código HTTP observado y categorías seguras. Los diagnósticos
se confirman junto al estado/intento bajo la misma protección de token/vencimiento.
Una reserva recuperada queda desconocida sin inventar código HTTP.

Receptor en entrega_fiable_eventos_pedidos_receptor, separado del emisor.
Identidad/contenido y preparación ficticia se confirman en su propia transacción;
responder después del COMMIT. Duplicados equivalentes no crean otra preparación.
Reutilizar validación del contrato; sin endpoints públicos de fallos o control.
Credenciales RECEPCION_TOKEN, CONSULTA_TOKEN y ENTREGA_TOKEN distintas y privadas.
No registrar tokens, Authorization, cuerpos completos, errores SQL originales o URLs privadas.

API, trabajador y receptor usan roles ordinarios diferentes, sin DDL.
No ampliar p03_api para que opere la cola. Migradores y preparadores son explícitos;
no crear bases/esquemas/tablas al arrancar servicios. Conservar datos y secretos.
Las pruebas usan esquemas separados de emisor/receptor en la base _test y
credenciales HTTP efímeras. Distinguir muerte real de procesos, fallos de red
provocados y estados temporales de fixtures. La demo de desarrollo conserva sus pedidos.

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
mínima recibida. El trabajador implementa Retry-After y timeout HTTP total de 5 s. Las pruebas pueden reducir tiempos, sin cambiar estados ni presupuesto.
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
typecheck, build, test:core, test:http, test:delivery y test:operations con PostgreSQL real. Una base ausente debe fallar,
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
Rol ordinario; esquemas nuevos exclusivos p03_core_, p03_rec_ o p03_ops_ por fixture.
TEST_API_DATABASE_URL usa p03_api_prueba sin DDL, preparado explícitamente.
CI usa contenedor PostgreSQL 18 y credenciales desechables; no requiere Docker local.
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
