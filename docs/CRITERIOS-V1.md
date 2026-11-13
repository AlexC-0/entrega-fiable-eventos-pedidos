# Matriz de aceptación técnica V1 — completada dentro de alcance

Encargo 07. Matriz contrastada con la implementación y los casos existentes, sin
discrepancia material identificada ni ampliación de producto. Base de cierre:
[5dc65b4](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/commit/5dc65b41ba612493a3a96252f7718ad2a7d5bf3b) y [CI 43425880532: success](https://github.com/AlexC-0/entrega-fiable-eventos-pedidos/actions/runs/43425880532).

Fuentes: L = resultados locales históricos del Encargo 06 en STATUS;
R = job 131887043716 y logs del run indicado, comprobados por Codex tras recibir
la evidencia de Alex. L y R contienen 20 + 22 + 21 + 11 = 74 casos cada uno;
no se suman como 148 casos distintos. D = contraste documental de este encargo,
sin nuevas ejecuciones de suites. Las comprobaciones funcionales de la tabla
proceden de L/R; D comprueba su correspondencia con código/pruebas.
Las referencias a casos corresponden al [catálogo de pruebas](../tests/README.md).
Resultados y recursos en [STATUS](STATUS.md).

| Requisito | Implementación o prueba | Comprobación realizada | Pendiente o limitación |
| --- | --- | --- | --- |
| Persistir antes de aceptar | registrar; core 02; HTTP 14–15 | PostgreSQL real, COMMIT bloqueado/fallido, sin 202 anticipado | Confirmado en R sobre 5dc65b4; futuras versiones requieren su propia evidencia |
| Autenticación separada | Bearer recepción/consulta/entrega; HTTP 08, operaciones 01 | 401/403 y autenticación previa a validar | Solo loopback; sin TLS/despliegue |
| Duplicados y conflictos | Recepción jsonb, receptor transaccional; HTTP 03–05, entrega 15 | Concurrencia e identidades/pedidos incompatibles | Sin garantía universal exactamente una vez |
| Indisponibilidad | HTTP 16; entrega 02/07 | Conexión rechazada y timeout real de 5 s | Sin simulación de apagón prolongado |
| Recuperación | core 13–14; entrega 04–06/15 | Procesos terminados realmente; reserva/efecto y reinicio receptor | Mientras no hay trabajador no hay recuperación activa |
| Respuesta perdida | entrega 03; operaciones 04 | Dos POST, una preparación, ya_aplicado, historial HTTP | Efecto único circunscrito al receptor de demostración |
| Presupuesto y política temporal | core 16–17; entrega 08–11 | Seis intentos, sin séptimo; backoff, jitter y Retry-After | Sin reactivación manual de terminales |
| Consulta individual e intentos | EventStore; HTTP 02/12, operaciones 02–05 | Fechas, orden, null y resultados persistidos; sin mutaciones | Máximo seis intentos; sin cuerpos ni tokens |
| Listado y paginación | list-query, EventStore.list, 003; operaciones 05–08 | Todos los estados, límites, cursor ligado al filtro, empates/microsegundos | Sin snapshot global ni total; sin benchmark de carga |
| Permisos y migraciones | grantApiPermissions; operaciones 09–10; entrega 17 | Roles ordinarios, SELECT adicional, /listo, datos conservados al migrar | Índice puede requerir ventana de migración en bases grandes |
| Secretos | Selecciones explícitas, logs seguros; HTTP 20, operaciones 01/03/09 | Respuestas sin tokens; revisión de archivos publicables | No constituye una auditoría exhaustiva |
| Instalación reproducible | npm ci 11.21.2 y lockfile raíz | L: instalación y lockfile intacto; R: instalación reproducible, tipos y build success | Sin nueva instalación en D |
| CI con PostgreSQL real | workflow y SQL efímero de [CI](CI.md) | R: completed/success, 74/74; preparación y suites con PostgreSQL real | El futuro commit documental requiere comprobación propia |
| Operación documentada | [Guía operativa](OPERACION.md), events:query | CLI sobre API y rol p03_api reales, sin alterar demos | Revisión técnica acotada; no acredita experiencia de explotación en producción |

La matriz respalda V1 técnicamente completada en el alcance acordado sobre 5dc65b4.
Los límites de cada fila permanecen vigentes; no se declara producción auditada,
rendimiento medido o disponibilidad universal. [Ficha de cierre](FICHA-V1.md).

Pendiente: Alex publica estos documentos y se comprueba el estado remoto del nuevo
commit. La selección de otro proyecto tendrá lugar después en ChatGPT.
