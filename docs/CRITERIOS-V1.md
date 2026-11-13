# Matriz de revisión V1 — pendiente de cierre

Encargo 06. Evidencia local sobre cambios sin publicar; no acredita CI remota.
Las referencias a casos corresponden al [catálogo de pruebas](../tests/README.md).
Resultados y recursos en [STATUS](STATUS.md).

| Requisito | Implementación o prueba | Comprobación realizada | Pendiente o limitación |
| --- | --- | --- | --- |
| Persistir antes de aceptar | registrar; core 02; HTTP 14–15 | PostgreSQL real, COMMIT bloqueado/fallido, sin 202 anticipado | Revalidar CI del commit publicado |
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
| Instalación reproducible | npm ci 11.21.2 y lockfile raíz | Instalación local correcta, lockfile intacto, tipos/build correctos | Repetir automáticamente en Linux mediante CI |
| CI con PostgreSQL real | workflow y SQL efímero de [CI](CI.md) | actionlint correcto; imagen y acciones verificadas | Publicación manual y ejecución remota pendientes |
| Operación documentada | [Guía operativa](OPERACION.md), events:query | CLI sobre API y rol p03_api reales, sin alterar demos | Alex debe revisar y aceptar procedimientos/límites |

Para cerrar V1 faltan: publicación manual de Alex, comprobar el resultado remoto
del workflow sobre ese commit exacto y revisar esta matriz con sus límites.
Un resultado local de 74 pruebas no sustituye esa comprobación ni declara V1 cerrada.
