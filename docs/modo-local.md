# Modo local: la sala sigue cuando se cae internet

Estado: **decisiones tomadas y etapa 0 hecha (2026-10-13).** Lo siguiente es la etapa 1.

## 1. Por qué ahora

Se pausó dos veces (2026-09-16 y 2026-09-21) porque en Sensi el internet no se cortó en dos años. Eze lo retoma el 2026-10-13 por otra razón: **la competencia lo anuncia** ("si se cae internet, sigue funcionando") y es un argumento de venta. Es raro que pase, pero el día que pasa marca la diferencia. Por tanto es una función de producto para cualquier cliente con Oído Box, no un arreglo para un local.

## 2. Alcance acordado: comandar sin cobrar

Durante el corte:

- **Sí**: entrar con PIN, ver el mapa, abrir mesas, comandar, marcha pasa, imprimir en cocina y barra, imprimir la cuenta, marcar "mesa libre", abrir el cajón.
- **No**: registrar cobros, abrir o cerrar turno, mermas, invitaciones, reservas, checklists, wiki, inventario, y todo `/admin` y `/pulso`.

El cliente paga igual: en efectivo, o con tarjeta si el datáfono tiene SIM propia (si va por el WiFi del local, no cobra tarjeta con o sin OidoOps). La mesa queda **pendiente de cobro**, que es un estado que ya existe (`liberada`), y el encargado registra el cobro cuando vuelve internet.

Queda fuera a propósito cobrar sin conexión: toca la caja, el cierre de turno y la cadena de Veri\*factu (un único orden de facturas), y es donde está casi todo el riesgo.

## 3. Cómo está hoy (punto de partida)

- La app es una PWA servida por HTTPS desde la instalación del cliente (`<codigo>.oidoops…`). El service worker ya guarda el "cascarón" de la app, pero todo dato sale de la API en la nube.
- La Box (`~/Desktop/dev/printer-server`, Python) recibe trabajos de impresión por MQTT, los guarda en una cola SQLite (`cola.py`) y los imprime por TCP 9100. Tiene un portal web local para configurar el WiFi (`portal.py`). No tiene carta, mesas ni empleados.
- Si la Box pierde conexión un rato, los tickets esperan en el broker y salen al volver (qos 1, sesión persistente). **Eso ya funciona** y cubre el corte más frecuente: el WiFi del local falla y los móviles siguen con datos.
- Todos los identificadores son números correlativos de Postgres.
- Existe "Red del local" (`Restaurant.restringirPorRed`): la sala solo se opera desde la red que la Box anuncia.

## 4. Los tres problemas de fondo

**4.1 El navegador no deja llamar a la Box desde la app en la nube.** Una página HTTPS no puede hacer peticiones a `http://10.x.x.x` ni a `http://oido.local` (contenido mixto). Un interceptor que "redirige a la IP local" no funciona. Y un nombre con certificado válido para la Box necesita DNS, que tampoco responde sin internet.

Salida acordada: **la Box sirve la app de sala ella misma, por HTTP, dentro de la red del local.** Navegar de una página HTTPS a una HTTP sí está permitido. Cuando la app detecta que la nube no responde, muestra el aviso unos segundos y **salta sola** a `http://<ip de la Box>/sala` (la app conoce esa IP porque la Box la manda en su latido y se guarda en el dispositivo); el botón "Pasar a modo local" queda de respaldo. La Box además imprime sola un ticket con un QR a esa dirección cuando detecta el corte, por si un móvil no la tenía guardada.

Coste: no es invisible. Se vuelve a pedir el PIN (para el navegador la Box es otra dirección) y lo que estuviera a medias sin comandar en ese móvil se pierde. A cambio no depende de certificados ni de DNS. **Sin probar**: si Chrome en los SUNMI y Android del personal avisa al abrir una dirección sin candado; si molesta, se vuelve al botón.

**4.2 No es una cola de tickets, es una copia de la sala.** Para comandar hacen falta la carta, las mesas y planos, los empleados de sala con su PIN, las rutas de impresión y **las comandas abiertas en el momento del corte**. La Box tiene que mantener esa copia al día mientras hay internet (cada 1-2 minutos durante el turno, y al instante lo que cambia en las comandas).

**4.3 Dos sitios escribiendo a la vez.** Si la Box está en modo local y un móvil con datos sigue escribiendo en la nube, al volver hay dos versiones de la misma mesa. Regla acordada: **el modo local exige "Red del local" activada.** El caso real: se cae la fibra, el WiFi sigue encendido y un móvil personal se pasa solo al 4G sin avisar; ese camarero seguiría comandando en la nube (sin que salga ningún ticket) mientras otro lo hace en la Box. Con la regla, ese rechazo de la nube es además la señal para mandar el móvil al modo local. Así, sin internet en el local nadie puede operar la sala en la nube (un móvil con datos está "fuera del local": solo consulta), y durante el corte la única que escribe es la Box. Al volver, lo de la Box manda para ese restaurante y ese intervalo.

## 5. Piezas

1. **Identificador estable**: columna `uuid` en `Comanda` y `ComandaItem` (se conservan los números). La subida al volver se hace por `uuid`, así repetirla no duplica nada.
2. **Copia hacia abajo** (nube → Box): la instalación publica para su Box lo necesario de sala. Los PIN viajan y se guardan cifrados o como huella, no en claro.
3. **API local en la Box** con las rutas de sala del alcance (sección 2) e impresión directa, sin pasar por MQTT.
4. **Detección y cambio**: la app decide "sin internet" tras varios fallos seguidos, no al primero. La Box decide lo mismo por su latido.
5. **Subida al volver** (Box → nube): un lote con las comandas creadas o cambiadas, marcadas `origenLocal` para verlas en el panel. Mientras sube, la sala en la nube muestra "sincronizando" y no deja operar ese restaurante.
6. **Vuelta**: la Box avisa a los dispositivos en modo local y los devuelve a la dirección normal.
7. **Limpieza en la Box**: borrar lo ya subido pasados unos días.
8. **Visibilidad**: HQ y el panel del cliente muestran "en modo local desde las 21:14" y, después, cuántas comandas se subieron.

## 6. Decisiones (Eze, 2026-10-13)

1. **Cambio a modo local: automático con aviso**, botón de respaldo (sección 4.1).
2. **En la Box corre el mismo código de la API (Node + Postgres) en modo reducido**: la app de sala funciona sin cambios y la lógica de comandas existe una sola vez. Descartada la API mínima en Python + SQLite (duplicaba la lógica). La Box de Eze es una Pi de **4 GB**, no de 2: de memoria va sobrada.
3. **El modo local exige "Red del local" activada** (sección 4.3).
4. **Datáfono de Sensi: WiFi y además SIM.** Si cae la fibra sigue cobrando con tarjeta, así que se puede prometer "sin internet sigues comandando y cobrando"; el cobro se apunta en OidoOps al volver.
5. **Hardware, sin decidir**: una microSD sufre con escrituras continuas. Medirlo en la etapa 1 y valorar disco USB para las Box que lleven modo local.

## 7. Etapas

- **Etapa 0 — avisar bien** — **hecha el 2026-10-13**:
  - *Sala*: `lib/conexion.ts` + `components/SinConexion.tsx` (envuelve `/sala*` en `main.tsx`). Todas las llamadas de `api.ts` pasan por `pedir()`, que anota si el servidor contestó; con la sala abierta y en primer plano se pregunta además a `/api/instalacion` cada 10 s (cada 3 s si hay dudas). Tres intentos seguidos sin respuesta (también 502-504) → pantalla "Sin conexión" que tapa la app **sin desmontarla**; al volver se quita sola y se vuelve a pedir todo. Será el punto de partida del salto a la Box.
  - *HQ* (`oido-talent`): tabla `PiCorte`; `pis.ts` anota cada vez que una Box pasa a desconectada y cuándo vuelve, y el panel muestra "N cortes en 30 días" por Box. Un corte de menos de ~45 s no se ve (es lo que tarda el canal en darla por caída).
  - *Box* (`printer-server`): al publicar las impresoras manda `encendida_seg`; con eso HQ pone el motivo del corte: `internet` (seguía encendida) o `apagada` (se reinició o no tenía luz). Una Box sin este cambio registra cortes igual, sin motivo.
  - Hallazgo: la caché de `/api` del service worker (`vite.config.ts`, `urlPattern: /^\/api\/…/`) **no llega a aplicarse nunca**: workbox compara la expresión con la dirección completa y el `^` no casa. Hoy ninguna respuesta de la API se guarda. Se deja así a propósito (servir comandas viejas sería peor); no "arreglarlo" sin pensarlo.
- **Etapa 1 — la Box sirve la sala**: copia hacia abajo, API local, comandar e imprimir.
- **Etapa 2 — volver**: subida por lotes, pendientes de cobro, bloqueo mientras sincroniza.
- **Etapa 3 — pulir**: ticket con QR, avisos en HQ, limpieza.

## 8. Casos a probar antes de producción

- Corte a mitad de una comanda sin enviar; corte con la cuenta impresa y sin cobrar.
- Internet que va y viene cada pocos segundos (no entrar y salir de modo local sin parar).
- La subida se corta a medias y se repite: no duplica.
- Un camarero sigue en modo local cuando ya volvió internet.
- Móvil con datos durante el corte: solo consulta.
- Cambio de carta o de PIN en el panel durante el corte.
- La Box se reinicia en pleno corte: no pierde las comandas.
- Corte que cruza el cierre de turno, o que dura más de un día.
- Dos móviles sobre la misma mesa en modo local.
- La Box cambia de IP dentro de la red.
- Solo la Box sin internet y los móviles con conexión (ya cubierto hoy: comprobar que no entra en modo local por error).
