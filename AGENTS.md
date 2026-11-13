# Instrucciones para Codex — Proyecto 03

## Contexto y alcance vigente

Trabaja exclusivamente en `entrega-fiable-eventos-pedidos`.
No inspecciones, modifiques, copies ni integres los proyectos anteriores.
Antes de modificar, confirma ruta, instrucciones aplicables y estado de carpeta.
Si existe Git, comprueba raíz, `git status --short --branch`, rama y remotos.
Conserva cualquier cambio posterior del usuario.

Lee README.md, docs/PROJECT_BRIEF.md, docs/DECISION-COLA.md y docs/STATUS.md.
Redacta principalmente en castellano. No hay sincronización automática con
ChatGPT navegador.

El encargo inicial autoriza inspección, base mínima Node.js/TypeScript/npm y
evaluación documental de cola. Esa base ya está preparada. El contrato funcional
es una propuesta técnica, no una implementación ni una decisión aprobada.
No avances automáticamente a la siguiente fase.

Sin otro encargo, no implementes recepción, consultas, trabajador, reintentos,
receptor, autenticación, migraciones ni infraestructura. No instales Express,
pg-boss, ORM o dependencias funcionales para anticipar decisiones pendientes.
No construyas dos mecanismos de cola.

## Base y verificación

Un único paquete raíz privado y un único package-lock.json.
Node 24; npm 11.21.2 mediante `npx --yes --package=npm@11.21.2 npm`.
TypeScript estricto, ESM/NodeNext e imports internos .js al añadir módulos.
Instala solo dependencias usadas y comprueba engines/peers; no uses --force ni
--legacy-peer-deps. No cambies software o configuración global.

Comprueba ci sin cambio de lockfile, typecheck y build cuando cambie la base.
No crees pruebas de relleno ni cuentes estos comandos como casos funcionales.
En cambios documentales revisa contenido, enlaces y espacios; si hay Git, diff
y diff --check. Actualiza STATUS con resultados reales y límites.

## Datos y entorno futuro

No uses bases, roles, secretos, binarios privados o scripts de otros proyectos.
PostgreSQL para Proyecto 03 está pendiente: cualquier preparación de servicios
requiere un encargo explícito. No arranques Docker o servidores por iniciativa.
No instales herramientas globales, reinicialices clusters ni cierres procesos ajenos.

Cuando se autorice integración, exige TEST_DATABASE_URL y comprueba
current_database() = entrega_fiable_eventos_pedidos_test antes de escribir.
Roles ordinarios y esquemas nuevos exclusivos por ejecución, incluido el esquema
de cola; elimina solo los creados por esa ejecución, después de cerrar HTTP,
trabajador, supervisión, temporizadores y pools. Nunca limpies desarrollo.
No publiques tokens, contraseñas, cuerpos privados ni URLs con credenciales.
Mantén .env y resultados locales fuera de Git.

## Git y entrega

Alex realiza personalmente la creación del repositorio con GitHub Desktop,
staging, commits y push. Codex no ejecutará git init, add, commit, push,
configuración de remotos, reescritura de historial, tags, releases, publicación
ni equivalentes por API. No crees el remoto ni cambies su visibilidad.
Una petición genérica de terminar, guardar o publicar no modifica estas reglas.

Nombre técnico previsto: entrega-fiable-eventos-pedidos; rama principal: main.
Deja los cambios sin staging. Entrega ruta, estado inicial/final, versiones,
archivos cambiados, comprobaciones reales, límites y siguiente paso concreto.
Propón Summary y Description en castellano que describan únicamente el diff.
