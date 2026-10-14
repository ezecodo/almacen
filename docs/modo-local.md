# Modo local: la sala sigue cuando se cae internet

Estado (2026-10-14): **etapas 0 y 1 hechas; etapa 2 (subir al volver) escrita y probada en el Mac**, pendiente de desplegar y de probar en la Box de Eze.

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
- **Etapa 1 — la Box sirve la sala** — en curso desde el 2026-10-13. Se prueba sobre la instalación `sensi` (no opera en ningún restaurante todavía) con la Box `OIDO-13FAEE`. Cinco pasos:
  1. *Preparar la Box* — **hecho el 2026-10-13** en la `OIDO-13FAEE` (Debian 13, Node y Postgres de `apt`). Es una Pi de **2 GB** (1844 MB, no 4 como creía Eze): con `printer-server`, Postgres y la API corriendo usa ~350 MB.
  - **Probado en la Box real ese día**: con el acceso de la Box al servidor cortado (`ip route add blackhole`), Eze abrió `http://192.168.1.24:8080/sala` en el teléfono, comandó y **salió el ticket**. Ojo: la Box está en dos redes (cable `10.0.1.x` hacia la impresora y WiFi `192.168.1.x`); los móviles llegan por la del WiFi.
  2. *Copia hacia abajo* — **hecho el lado del servidor y el código de la Box, probado solo en el Mac** (dos procesos y dos bases). `src/replica.ts`: `armarReplica` (un restaurante, solo sala: carta, alérgenos, salón, personal de sala, impresoras y rutas, turno abierto y comandas sin cerrar) y `aplicarReplica` (reemplaza todo en una transacción). `POST /api/pi/replica { codigo, token, huella? }`, pública, se valida con el secreto de la Pi igual que el latido; con la misma huella no reenvía nada. Lado Box: `src/local.ts`, se activa con `MODO_LOCAL=1`, pide la copia cada 15 s y lee a quién pedírsela de `enlace.json`, que deja escrito el `printer-server` al recibir su config. Con Sensi: 72 KB, se arma en ~0,1 s y se carga en menos.
     - Los PIN viajan tal cual (con el nombre `clave`, porque el filtro global borra toda clave `pin`). Se descartó mandarlos como huella: con 4 cifras se prueban las 10.000 combinaciones en nada, no protege. La protección es que la base de la Box solo escuche en la propia Box.
     - Lo que la Box crea se numera desde 1.000.000.000 para no chocar con números de la nube.
     - Desde el 2026-10-14 la copia se pide cada **5 s** (antes 15) y ya no borra lo creado en la Box: ver etapa 2.
  3. *La Box sirve la sala* — **escrito y probado solo en el Mac** (2026-10-13). Con `MODO_LOCAL=1`: solo responden las rutas de `RUTAS_LOCAL` (`permisos.ts`; el resto da 403 con `codigo: 'modo_local'` — no un 5xx, que la app tomaría por "sin conexión"); `servirWeb` (`local.ts`) sirve el build de la web sin Nginx; `/api/instalacion` devuelve `local: true` y la sala muestra una franja ámbar fija "Modo local · sin internet" (`SinConexion.tsx`). No arranca MQTT ni la sincronización con HQ. En `http` la app no registra service worker ni se puede instalar.
  4. *Imprimir directo* — **escrito y probado solo en el Mac**. `publicarTicket` (`mqtt.ts`) en modo local entrega el ticket por HTTP al `printer-server` de la misma Pi (`127.0.0.1:9101/trabajo`, `_servidor_local` en `main.py`; solo escucha en la propia Pi), que lo encola igual que uno llegado por MQTT. Prueba hecha: con la "nube" apagada, entrar con PIN, abrir mesa, añadir plato y Oído → llega el ticket `cmd-1000000001-r1` con su destino de cocina.
  - **Instalación en la Box**: `bash deploy/box.sh` desde el Mac (compila aquí, copia a `~/oidoops` de la Box, y allí crea base, `.env` y el servicio `oidoops-local` en el puerto 8080). Sin estrenar.
  - Con la sala en modo local (`useSalaEnModoLocal` en `lib/instalacion.ts`) se ocultan el 💼, "Cobrar mesa", mermas e invitaciones (el ▼ de cada plato), y en el panel de perfil las propinas, Producción, Checklists y Wiki (2026-10-14).
  5. *Llegar a la Box desde el teléfono*. **Eze decidió el 2026-10-13 que todo pase dentro de la PWA instalada** (sin abrir otra dirección ni volver a poner el PIN): la Box necesita un nombre nuestro con certificado (`<codigo>.box.oidoops…` apuntando a su IP dentro del local) y la app, al detectar el corte, cambia a hablarle a ese nombre. El punto delicado es que el teléfono resuelva ese nombre sin internet (depende del router del local). El salto a `http://<ip>:8080/sala` queda de respaldo.
     - **Escrito y probado solo en el Mac (2026-10-13)**, sin certificado (todo por HTTP en local): apagando la "nube", la misma pantalla de sala pasó sola a modo local, abrió mesa, comandó y llegó el ticket; al volver la nube, volvió sola.
     - *Nube*: `POST /empleados/auth` devuelve además `local: { url, token }` si el local tiene Box. `url` = `https://<código sin OIDO->.box.<dominio de la suite>:8443` (`urlDeBox`, sale de `FRONTEND_URL`; `BOX_URL` lo pisa para pruebas). `token` es un pase firmado con una clave derivada del secreto de la Pi (`claveSesionLocal`): la clave de sesiones de la nube no viaja a la Box.
     - *Box*: firma y valida sesiones con esa misma clave (la lee de `enlace.json` al arrancar; si el enlace cambia, el proceso se cierra y systemd lo arranca de nuevo), acepta llamadas del origen de su instalación (CORS + cabecera de Private Network Access) y, si tiene `~/oidoops/cert/{fullchain,privkey}.pem`, atiende también por HTTPS en el 8443 (`servirHttps`).
     - *Web*: `lib/conexion.ts` decide el destino. Con tres fallos seguidos de la nube pregunta a la Box (`/api/instalacion` debe decir `local: true`); si contesta, `baseApi()` pasa a ser la Box y la sesión usa `tokenLocal`. Vuelve a la nube tras dos respuestas seguidas. Con internet saluda a la Box cada 4 min (el teléfono recuerda su nombre, y Chrome pide el permiso de red local antes y no en pleno corte). Quien entra con PIN ya en modo local solo tiene pase de la Box: al volver la nube tendrá que entrar otra vez.
     - **Probado en la Box y el teléfono de Eze (Android, Chrome) el 2026-10-13**: con el modo local puesto a mano, la app de siempre comandó contra `https://13faee.box.oidoops.ezeangeloni.xyz:8443` y salió el ticket; al quitarlo volvió a la nube. El certificado se pidió con `certbot` como usuario `eze` en el VPS (`~/box-certs`, reto DNS con un registro TXT puesto a mano en IONOS; caduca el 2027-01-11 y **no se renueva solo**) y se copió a `~/oidoops/cert` de la Box.
     - *Modo local a mano*: `/sala/mesas?corte=1` (y `?corte=0`), o dentro de la app instalada mantener apretado ~1 s el nombre del restaurante en el panel de perfil. Ese dispositivo deja de hablar con la nube y trabaja contra la Box; la franja dice "activado a mano". Sirve para probar y para la demo.
     - *Respaldo*: al saludar a la Box la app guarda su dirección numérica (la Box devuelve en `/api/instalacion` la IP por la que le entró la llamada); si un día no encuentra el nombre, la pantalla "Sin conexión" ofrece "Pasar a modo local" → `http://<ip>:8080/sala`.
     - **Sin probar**: un corte de internet de verdad (router sin salida). La duda es si el teléfono encuentra el nombre de la Box sin internet; depende de que lo recuerde o de que el router lo resuelva.
     - Gotcha visto: un nombre nuevo bajo `*.oidoops` consultado antes de existir su registro devuelve la IP del servidor (comodín, TTL 1 h) y esa respuesta se queda guardada en el servidor de nombres del teléfono hasta que caduca.
     - **Falta**: certificado y registro DNS de cada Box (hoy un registro A hecho a mano para `13faee.box.oidoops…` → `192.168.1.24`), automatizarlos desde HQ, y probarlo en un teléfono real con internet cortado de verdad.
- **Etapa 2 — volver** — **escrita y probada en el Mac el 2026-10-14** (sin desplegar). Regla acordada con Eze: *la Box siempre tiene el turno; si se corta sigue; al volver suma lo nuevo y nunca borra lo que no conocía*.
  - **Qué sube** (`loQueFaltaSubir` en `replica.ts`): la Box compara su base con la **última copia aplicada** (guardada también en disco, `copia-sala.json`, así sobrevive a un reinicio en pleno corte) y sube solo lo que cambió, **campo por campo**: comandas e items nuevos, campos cambiados de los existentes, e items que estaban en la copia y ya no (plato quitado, cambio de mesa). Un plato que la nube tenía y la Box no llegó a ver (impreso segundos antes del corte) no se toca.
  - **Números**: cada restaurante numera en la Box desde `1.000.000.000 + restaurantId × 1.000.000`, y la subida guarda las filas en la nube **con el mismo número** (la secuencia de la nube no se mueve). Por eso repetir una subida no duplica nada y un teléfono que sigue con la mesa abierta no la pierde.
  - **En la nube** (`POST /api/pi/subida`, pública, secreto de la Pi; `aplicarSubida`): solo comandas de ese restaurante y sin cobrar, solo campos de sala (la Box no cobra), y avisa a la sala por SSE.
  - **Orden en la Box** (`sincronizar` en `local.ts`, cada 5 s): subir lo pendiente → pedir la copia → cargarla solo si mientras tanto no se comandó nada más. Las escrituras esperan mientras se carga una copia (<1 s), así ninguna se cruza.
  - **Cierre de turno**: la nube anota cuándo terminó de sincronizar cada Box (`boxSinSincronizar` en `routes/red.ts`, en memoria). Si una Box que se usaba lleva más de 30 s sin sincronizar, `PATCH /turnos/:id/cerrar` responde 409 `box_sin_sincronizar` y la sala y el feed ofrecen "Cerrar igual" (`forzar: true`): una Box apagada no debe bloquear el cierre. La Box se limpia sola: la copia solo trae el turno abierto y lo sin cobrar.
  - **Probado en el Mac** (nube y Box falsas, `prueba-subida.mjs` en el scratchpad de la sesión): comanda en la nube → la Box la copia → se añade un plato en la nube y se corta → en la Box se quita un plato pendiente, se añade y comanda otro y se abre una mesa nueva (salen los tickets) → se reinicia la Box sin nube → vuelve la nube: la mesa vieja queda con lo de antes, lo impreso justo antes del corte y lo nuevo, sin el plato quitado; la mesa nueva entra con su número. Repetir la misma subida dos veces no duplica. El cierre de turno con la Box apagada da el aviso.
  - **Descartado por ahora** (2026-10-14, para mantenerlo simple): la regla "la Box solo acepta comandas sin internet o con modo local a mano". Con el salto automático la app solo le habla a la Box cuando la nube no contesta; el riesgo queda en casos raros (abrir la sala de la Box por su dirección numérica con internet). En el modo local a mano lo comandado sube a los 5 s; si otro teléfono toca la misma mesa en la nube a la vez, gana el último en escribir cada campo.
  - **Límite conocido**: si en modo local se quita un plato que la Box nunca vio, no puede borrarlo (no lo conoce); y lo que la nube cambie en una mesa durante el corte (un móvil con datos sin "Red del local") se mezcla campo a campo con lo de la Box.
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
