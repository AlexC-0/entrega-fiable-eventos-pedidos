# Consulta y diagnóstico operativo — Encargo 06

Esta guía consulta evidencia existente. No recupera reservas ni cambia estados.
[Contrato HTTP](HTTP.md), [entrega](ENTREGA.md) y [criterios V1](CRITERIOS-V1.md).

## Preparar y consultar

Tras compilar, con PostgreSQL activo, ejecutar explícitamente db:migrate para
aplicar 003 y el SELECT de intento del rol API. Arrancar la API con npm start.
No hace falta arrancar el trabajador para leer; mientras esté detenido no recuperará reservas.

Desde la raíz del proyecto, estos comandos cargan .env sin imprimir sus valores.
Exigen CONSULTA_TOKEN y solo conectan a la API loopback; no siguen redirecciones.

~~~powershell
npx --yes --package=npm@11.21.2 npm run events:query -- listar
npx --yes --package=npm@11.21.2 npm run events:query -- listar "estado=pendiente&limite=20"
npx --yes --package=npm@11.21.2 npm run events:query -- listar "estado=esperando_reintento&limite=20"
npx --yes --package=npm@11.21.2 npm run events:query -- listar "estado=agotado&limite=20"
npx --yes --package=npm@11.21.2 npm run events:query -- listar "estado=fallido_definitivo&limite=20"
npx --yes --package=npm@11.21.2 npm run events:query -- evento UUID_DEL_EVENTO
npx --yes --package=npm@11.21.2 npm run events:query -- intentos UUID_DEL_EVENTO
~~~

Para seguir, copiar siguienteCursor exactamente, mantener el mismo filtro y
añadir cursor a la consulta entre comillas. null significa que esa petición no
vio otra página. Se puede cambiar limite, pero no estado. No construir o editar
el cursor. Para cambiar el filtro, comenzar otra consulta sin cursor.

~~~powershell
$cursor = 'VALOR_DE_SIGUIENTECURSOR'
npx --yes --package=npm@11.21.2 npm run events:query -- listar "estado=agotado&limite=20&cursor=$cursor"
~~~

Las páginas no forman una instantánea global. Un evento puede cambiar de estado
antes de llegar a su página; una nueva inserción posterior al cursor puede aparecer.
Una transacción que confirma tarde una clave anterior al cursor no aparece al
continuar: volver a consultar desde el inicio para actualizar la vista.

## Leer el historial

| Resultado persistido | Interpretación |
| --- | --- |
| reservado | Hay una reserva registrada sin finalización persistida. Puede existir un envío o efecto aún no confirmado localmente. |
| desconocido | Se recuperó una reserva vencida. No acredita ausencia de efecto remoto. |
| reintentable | El intento no confirmó entrega. Puede quedar presupuesto; el sexto deja agotado. |
| confirmado | Llegó un recibo válido aplicado o ya_aplicado y se confirmó el estado local. |
| fallido_definitivo | El intento cerró por una respuesta que V1 no reintenta automáticamente. |

codigoHttp null significa que no se observó un código o que el registro histórico
no lo conserva; nunca sustituirlo por un 200 supuesto. categoria/retryAfter null
son legítimos en intentos reservados, históricos o sin ese diagnóstico.

| Evidencia | Comprobación operativa |
| --- | --- |
| conexion, normalmente sin código | Revisar que el receptor propio está arrancado, su puerto y la configuración privada del destino. Una conexión interrumpida también puede ocurrir después del efecto. |
| timeout | La confirmación no llegó completa en cinco segundos. Consultar el efecto antes de atribuir ausencia de preparación. |
| 401/403 + http_definitivo | Revisar ENTREGA_TOKEN en ambos procesos sin mostrarlo. Corregir la configuración no reactiva un terminal. |
| recibo_invalido, respuesta_excesiva o respuesta_interrumpida | Revisar el protocolo: 200, dos campos exactos, mismo UUID, resultado válido y cuerpo hasta 8 KiB. |
| 429 + http_reintentable | Revisar retryAfter y proximaEjecucion. La espera mínima válida se conserva. |
| 5xx + http_reintentable | Destinatario respondió con error temporal; observar próximo intento y presupuesto. |
| desconocido + reserva_vencida | Consultar el receptor: hubo interrupción y no se conoce el efecto a partir de este resultado. |
| recibo_ya_aplicado | El receptor reconoció una identidad ya procesada; no creó otra preparación. |

Inspección local del receptor, con su credencial privada y base separada:

~~~powershell
npx --yes --package=npm@11.21.2 npm run receiver:inspect -- UUID_DEL_EVENTO
~~~

Se esperan cero o una preparación por identidad. La prueba de respuesta perdida
muestra dos intentos HTTP y una preparación: la primera transacción confirmó,
su respuesta se perdió y el segundo envío devolvió ya_aplicado.

## Límites de actuación

Un agotado consumió las seis reservas; puede no haber seis envíos observados si
hubo interrupciones antes de enviar. Recuperar el destinatario no lo reactiva.
Un fallido_definitivo tampoco se reactiva al corregir credenciales o protocolo.
Repetir POST /eventos con la misma identidad y contenido reconoce el duplicado;
no reinicia el contador ni el presupuesto.

Conservar UUID, estado, historial, fechas y la inspección del receptor para revisar
la incidencia. No cambiar eventoId para eludir deduplicación, editar SQL de negocio
ni reiniciar contadores. V1 no incluye reintento manual o reconciliación que cambie
terminales. Cualquier decisión de ese tipo requiere un encargo posterior.

Las consultas no garantizan disponibilidad futura ni orden de entrega. No hay
frontend, panel, purga o nuevos destinos. V1 está técnicamente completada dentro
de este alcance; evidencia y límites en la [ficha de cierre](FICHA-V1.md).
