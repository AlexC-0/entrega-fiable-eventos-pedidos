# Estado del Proyecto 03

## Base inicial — 13 de noviembre de 2026

Encargo: inspeccionar entorno, crear base mínima y evaluar la cola sin
implementarla. La definición funcional y pg-boss siguen como propuestas.

### Ruta y Git

Inicio: el workspace de la sesión era
C:\Users\kaosk\source\repos\gestion-solicitudes-aprobaciones.
Se comprobó su raíz, rama main limpia y origin correspondiente al Proyecto 02;
se leyó su documentación de contexto. No se modificó ni se copió implementación.
No se inspeccionó el Proyecto 01.

Destino: C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos.
No existía. Se comprobaron las rutas AGENTS.md de sus antecesores, sin encontrar
archivos, y que C:\Users\kaosk\source\repos no pertenece a otro repositorio.
Se creó la carpeta independiente, previa autorización técnica del sandbox para
escribir fuera del workspace inicial. No hubo rechazo de revisión automática.

Proyecto 03 sin Git: no hay rama, HEAD, staging, commits ni remoto configurado.
No se ejecutó git init ni se creó un repositorio remoto. La ausencia del remoto
procede del encargo de Alex, no de una consulta independiente a GitHub.
Alex debe crear el repositorio en esta carpeta desde GitHub Desktop.

### Entorno comprobado

| Herramienta | Resultado real |
| --- | --- |
| Node.js | v24.13.0, instalado en Program Files; sin cambios |
| npm global | 11.6.2; sin cambios |
| npm usado para instalar y verificar | 11.21.2, ejecutado mediante npx |
| Git | 2.56.1.windows.1 |
| TypeScript | 7.0.2 instalado; tsc --version confirmado |
| PostgreSQL local | psql, postgres y pg_ctl no encontrados en PATH; directorio habitual Program Files/PostgreSQL ausente |
| Docker CLI | 29.9.3, build 5457199 |
| Motor Docker | docker info no pudo conectar con docker_engine; configuración del cliente inaccesible desde sandbox |

Estas comprobaciones no prueban que PostgreSQL no exista en ninguna otra ruta
ni que Docker esté averiado. No se buscaron binarios dentro de otros proyectos.
No se arrancó Docker ni PostgreSQL. Para una fase posterior quedan las opciones
de una instalación propia del Proyecto 03 o un contenedor exclusivo si se
autoriza y verifica el motor; no se seleccionó ni preparó ninguna.

Consultas de npm: TypeScript 7.0.2 requiere Node >=16.20.0; npm 11.21.2 requiere
^20.17.0 o >=22.9.0. npm latest devolvió 12.2.2, que exige ^22.22.2, ^24.15.0
o >=26.0.0 y no es compatible con el Node local. Se eligió npm 11.21.2.
Node 24 sigue en una [rama LTS](https://nodejs.org/en/about/previous-releases);
no se actualizó el parche instalado. Configuración
[NodeNext](https://www.typescriptlang.org/tsconfig/module.html) con target ES2024.

La primera consulta npm falló con EPERM al escribir en la caché global fuera
del sandbox. Se repitió usando npm_config_cache en TEMP/p03-npm-cache solo para
los procesos de esta sesión, sin editar configuración global. Queda caché de
herramientas en esa carpeta temporal; no forma parte de los archivos a publicar.

### Archivos creados

Doce archivos previstos para revisión manual:

- package.json y package-lock.json.
- tsconfig.json.
- .gitignore y .env.example.
- src/index.ts.
- tests/README.md.
- README.md y AGENTS.md.
- docs/PROJECT_BRIEF.md.
- docs/DECISION-COLA.md.
- docs/STATUS.md.

Se generaron además node_modules y dist, excluidos mediante .gitignore.
Un único paquete raíz privado; una única dependencia directa de desarrollo,
typescript 7.0.2. Su paquete opcional para Windows x64 se instala localmente;
el lockfile incluye las variantes opcionales de otras plataformas.
No hay dependencias de ejecución, ORM, Express, pg, pg-boss ni peers artificiales.
No hay secretos en .env.example; no se creó .env.

### Comprobaciones ejecutadas

Desde la carpeta del Proyecto 03, todas las operaciones de instalación y scripts
usaron el prefijo npx --yes --package=npm@11.21.2 npm.

| Comando tras el prefijo | Resultado |
| --- | --- |
| --version | 11.21.2 |
| install --ignore-scripts | Correcto; genera lockfile; dos paquetes instalados, tres auditados, cero vulnerabilidades informadas |
| ci | Correcto; dos paquetes instalados, tres auditados, cero vulnerabilidades informadas |
| run typecheck | Correcto, código 0 |
| run build | Correcto, código 0; genera dist/index.js |
| exec -- tsc --version | Version 7.0.2 |

Hash SHA-256 del lockfile idéntico antes y después de npm ci.
node dist/index.js terminó con código 0 y sin salida: solo comprueba que el
módulo vacío compilado carga, no acredita comportamiento del producto.

**Pruebas funcionales: cero.** No hay suite ni script test ficticio.
Sin comprobaciones HTTP, navegador, integración PostgreSQL o CI; no hay
aplicación que arrancar. No se iniciaron servidores ni procesos persistentes.

### Cola, decisiones pendientes y próximo paso

Recomendación condicionada: pg-boss 12.38.2 con PostgreSQL 18, según
[DECISION-COLA](DECISION-COLA.md). Se consultaron las tres fuentes solicitadas y
documentación adicional oficial. No se instaló ni ejecutó la cola.

Pendientes: aprobación del contrato, definición de equivalencia, jitter y
Retry-After; disponibilidad de PostgreSQL exclusivo; instalación y revisión del
peer de pg-boss; atomicidad de reserva/historial; protección contra ejecuciones
antiguas; agotamiento sin handler y retención hasta conciliación.

La base mínima no queda bloqueada. La compatibilidad de la integración real
permanece sin demostrar. El siguiente paso técnico propuesto es un encargo
acotado para ejecutar la prueba descrita en DECISION-COLA, antes de adoptar la
cola o implementar recepción y trabajador. Esta sesión no lo inicia.

### Publicación manual sugerida

Nombre: entrega-fiable-eventos-pedidos.
Rama prevista: main. Alex crea el repositorio local y remoto, revisa archivos
y realiza staging, commit y push mediante GitHub Desktop.

Summary:

~~~text
chore: preparar la base inicial del Proyecto 03
~~~

Description:

~~~text
Prepara un paquete privado Node.js y TypeScript con lockfile, ESM/NodeNext,
comprobación de tipos y compilación.

Documenta el alcance propuesto de recepción y entrega de eventos, las
reglas de trabajo y la evaluación provisional de pg-boss frente a una
cola propia PostgreSQL.

Verifica instalación reproducible, conservación del lockfile, tipos y
build. No implementa recepción, trabajador, reintentos ni receptor.
Deja pendiente la prueba técnica de cola con PostgreSQL real.
~~~

La descripción del repositorio sugerida figura en [README](../README.md).
No se crean tags, releases ni despliegues.

### Revisión documental final

Revisados los 12 archivos previstos para publicar: UTF-8 válido y nueve enlaces
locales existentes. git -c core.autocrlf=false diff --no-index --check contra
un archivo vacío, por archivo, no informó incidencias. Se usó --no-index porque
Proyecto 03 no tiene repositorio; no se presenta como un diff contra un commit.
El ajuste core.autocrlf solo se aplicó a ese comando, tras un aviso LF/CRLF;
no se editó configuración Git.

Revisadas exclusiones de node_modules, dist y archivos privados.
.env.example conserva valores vacíos; .env y .git ausentes.
No se afirma haber ejecutado una auditoría exhaustiva de secretos.

Comprobación final de Proyecto 02 desde su propio workspace: main...origin/main
limpio y git diff --check sin errores, remoto conservado. Un intento previo
desde el directorio hermano fue rechazado por dubious ownership del usuario
sandbox; se resolvió ejecutando la lectura desde el workspace original,
sin cambiar safe.directory global.

Proyecto 03 termina con carpeta y base local preparadas, sin Git ni publicación.
La revisión y creación del repositorio, staging, commit y push quedan a Alex.
