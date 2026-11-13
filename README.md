# Recepción y entrega fiable de eventos de pedidos

Proyecto 03 de CHAMBA DIARIA. Nombre técnico: `entrega-fiable-eventos-pedidos`.

**Estado: base mínima comprobada; producto sin implementar.** El objetivo futuro
es persistir eventos de pedidos antes de aceptarlos y gestionar su entrega HTTP
con recuperación e historial. El contrato detallado y la cola son propuestas
pendientes de revisión; este trabajo no los da por aprobados.

## Preparación local

Ruta preparada: `C:\Users\kaosk\source\repos\entrega-fiable-eventos-pedidos`.
Un único paquete npm privado, Node.js 24 y TypeScript estricto con ESM/NodeNext.
Comprobado con Node 24.13.0, npm 11.21.2 y TypeScript 7.0.2.
Se conserva Node instalado, dentro de una rama LTS; no se afirma que su parche
sea el más reciente. npm se ejecuta con npx, sin actualizar npm global.

Desde esta carpeta, en PowerShell:

~~~powershell
npx --yes --package=npm@11.21.2 npm ci
npx --yes --package=npm@11.21.2 npm run typecheck
npx --yes --package=npm@11.21.2 npm run build
~~~

`src/index.ts` es un módulo sin efectos para comprobar el compilador.
El build genera `dist/index.js`, excluido de Git. No hay servidor, comando
de arranque funcional, endpoints ni pruebas automatizadas todavía.
`.env.example` contiene solo nombres previstos y valores vacíos; esta base
no carga variables de entorno ni necesita PostgreSQL.

## Documentación

- [Alcance funcional propuesto](docs/PROJECT_BRIEF.md).
- [Evaluación de cola pendiente](docs/DECISION-COLA.md).
- [Estado, versiones, comprobaciones y siguiente paso](docs/STATUS.md).
- [Instrucciones para Codex](AGENTS.md).
- [Pruebas por desarrollar](tests/README.md).

No se incluyen Express, pg-boss, un driver de base de datos, ORM, receptor,
trabajador ni infraestructura. Los proyectos anteriores son independientes.

## GitHub Desktop y nomenclatura

La carpeta está preparada **sin inicializar Git**. No tiene rama, commits ni
remoto; Codex no ha creado ni consultado un repositorio remoto de este proyecto.
Según el encargo de Alex, tampoco existe aún el remoto.

Alex creará el repositorio local desde GitHub Desktop usando esta misma carpeta,
evitando otra carpeta anidada con el mismo nombre. Nombre del repositorio:
`entrega-fiable-eventos-pedidos`. Rama principal prevista: `main`.
La creación del remoto y la elección de su visibilidad corresponden a Alex.

Descripción sugerida del repositorio:

> Proyecto 03 de CHAMBA DIARIA: recepción y entrega fiable de eventos de pedidos. Base inicial en Node.js y TypeScript; diseño de persistencia, recuperación e historial pendiente.

Antes del primer commit, revisar que solo se incluyen los 12 archivos de la base
enumerados en STATUS y que quedan fuera `node_modules`, `dist` y archivos privados.
Summary y Description fieles al trabajo realizado están en STATUS.
Staging, commits, publicación y push son exclusivamente manuales por Alex.
