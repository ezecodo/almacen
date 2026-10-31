# Almacén App — Contexto para Claude Code

## Qué es este proyecto

Sistema de gestión integral para un grupo de restaurantes (cliente: Sensi Tapas, Barcelona).
Módulos activos:
1. **Almacén**: control de retiros de materia prima con pistola de código de barras + validación por QR
2. **Sala (TPV)**: sistema de comandas para camareros y encargados — mesas, menú, cocina, propinas, mermas, Google Reviews
3. **Inventario**: conteo periódico de stock, catálogo global + específico por restaurante, costes y registro de producción (premixes)
4. **Grupos**: gestión de menús cerrados para grupos (plantillas con cursos, precios por pax, restricciones alimentarias)
5. **Empleados**: ficha de personal con roles, horas contractuales, días libres y configuración para planning
6. **Staffing**: planificación semanal de turnos de empleados con auto-planning por IA
7. **Reservas** (OidoPerso, en desarrollo): sistema de reservas online por restaurante con formulario público
8. **Wiki**: base de conocimiento por restaurante (speeches, protocolos, conceptos) — el personal de sala consulta/escucha el speech, cargado desde el admin
9. **Checklists**: listas de apertura y cierre por sector (Barra 1, Sala 2, Paso…) — el personal las completa desde la app de sala, con histórico para el encargado
10. **Facturas**: el encargado fotografía la factura del proveedor al recibir el pedido (panel 💼 de `/sala`) y llega a la bandeja de `/admin/facturas` para directivos/contable

## Roadmap (acordado con Eze, pendiente de implementar)

1. **Restricción por red WiFi del restaurante** (para usar Handys del personal): allowlist de IPs públicas por restaurante en el servidor — tabla `RedAutorizada` + middleware Fastify sobre las rutas de sala (comandas/cobros). El PIN sigue siendo *quién sos*; la IP es *dónde estás*. Botón **"Autorizar esta red"** en el panel 💼 del encargado (guarda la IP pública actual con etiqueta + caducidad ~90 días; si el ISP rota la IP, el encargado re-autoriza en segundos). El admin/dashboard queda FUERA de la restricción (accesible desde cualquier lado). Nunca validar en el cliente — solo server-side vía `X-Forwarded-For` de Nginx.
2. **Kit de local (hardware llave en mano por restaurante)**: router propio con SSID dedicado (los PADs/Handys se conectan ahí → su IP pública es la autorizada del punto 1) + switch + **1 Raspberry Pi 4B (2GB, sin monitor)** + impresoras térmicas ESC/POS Ethernet (cocina y barra). La Pi: (a) servicio de impresión — conexión *saliente* al VPS (SSE/polling), imprime por TCP 9100, sin abrir puertos; (b) heartbeat al VPS que refresca automáticamente la IP autorizada (elimina el botón manual del punto 1). **Descartado el puesto fijo/kiosco (confirmado 2026-09-18)**: se cae la idea de una segunda Pi + monitor táctil en modo Chromium-kiosco para el encargado — en su lugar, el encargado usa su Handy/teléfono con la app igual que cualquier camarero (modo encargado 💼 ya existe en `/sala` vía rol `encargado` o `accesoEncargadoApp`, cero desarrollo nuevo). **A futuro (idea abierta, sin fecha)**: capaz haya una tablet como "puesto central" reemplazando el ordenador TPV actual, pero **sin Pi detrás** — sería un cliente WiFi más que consume el cloud directo (browser/PWA), igual que un Handy. Con esto, **1 Pi por local alcanza** (antes se había hablado de 2 Pi + 2 monitores, una por planta — superado). **Cajón de efectivo**: se conecta por RJ11 al puerto DK de la térmica (no a la Pi, no al router — el cajón no es un dispositivo de red); se abre con comando ESC/POS `ESC p` → al cobrar en efectivo desde el CobroSheet, el servicio de impresión imprime el ticket y abre el cajón; con tarjeta no se abre. La planta donde vive la Pi es irrelevante para el cajón (la Pi le habla a la impresora por red vía TCP 9100, no importa en qué piso esté la impresora, mientras esté en la misma LAN del local). **Confirmado con Eze (2026-09-16): en Sensi Tapas se cobra en efectivo en las dos plantas** → hacen falta **2 cajones, cada uno wireado por RJ11 a su propia impresora local** (una impresora con cajón por planta, en el punto físico donde se cobra de esa planta) — no alcanza con un cajón único abajo. **Botón "Abrir cajón" manual (confirmado 2026-09-16)**: además del cajón que se abre automático al cobrar en efectivo, el encargado necesita poder abrirlo **sin cobrar nada** — caso de uso real: pagar en efectivo a un proveedor (ej. el del pan) desde la caja. Se manda solo el comando `ESC p` a la impresora de esa planta, sin contenido de ticket (la impresora no imprime nada, solo dispara el pulso del cajón). Vive en el panel 💼 del encargado, independiente del flujo de `CobroSheet`. Gotcha hardware: Pi 4 usa micro-HDMI; comprar microSD nueva o boot USB; fuente USB-C 3A de calidad. Eze prototipa con Pi + 2 impresoras usadas (**Epson TM-T20II**, modelo (003) con USB + Ethernet integrados simultáneos — no hay que elegir interfaz, ambas funcionan a la vez). **Gotcha probado en Mac (2026-07-24)**: conectar la impresora por Ethernet directo a un hub USB-C (sin pasar por el router) crea un enlace aislado Mac↔impresora — la impresora cae en su IP fija de fábrica `192.168.192.168` (o auto-IP `169.254.x.x` si eso falla), y macOS trata esa ruta como *scoped* a la interfaz del hub: el ARP resuelve pero el tráfico real (ping/TCP) sigue fallando con "no route to host" incluso forzando la interfaz — no vale la pena pelearlo. Para el kit final, la impresora tiene que estar en la misma LAN que la Pi vía switch, igual que cualquier otro dispositivo. Para probar rápido sin acercar cable al router: iba por **USB directo** (cable USB-B de la impresora, sin el hub intermediando) — al reinstalarla eligiendo la interfaz USB en el instalador de Epson, macOS la reconoció sola (`system_profiler SPUSBDataType` la mostró como `TM-T20II`, `CLS:PRINTER`) y quedó andando por CUPS (`lp -d EPSON_TM_T20II`) sin más configuración.

**Estado del prototipo (2026-09-16)**: Eze ya tiene el hardware físico en mano para arrancar — **Raspberry Pi 4 B de 2GB RAM** (no 4GB; suficiente para prototipar solo el servicio de impresión, ver nota de RAM más abajo) con carcasa+ventilador, cable de corriente con interruptor, adaptador micro-HDMI, microSD SanDisk 32/64GB, más las 2 impresoras Epson TM-T20II usadas ya probadas por USB en Mac. Próximo paso acordado: (1) flashear la microSD con Raspberry Pi OS Lite (64-bit) vía Raspberry Pi Imager, con Wi-Fi y SSH preconfigurados desde la propia app; (2) primer arranque y ubicar la Pi en la red (`ssh <user>@raspberrypi.local` o IP); (3) script mínimo en Node que mande una trama ESC/POS de prueba por TCP al puerto 9100 de una de las Epson. Esto valida el punto (a) del kit — servicio de impresión — sin tocar todavía el punto (b) (kiosco Chromium, que si se prueba en esta misma Pi puede notar el límite de 2GB).

**Descartado explícitamente (2026-09-16)**: se evaluó y se **descartó por ahora** migrar a una arquitectura "Offline-First con sincronización eventual" completa (UUIDs generados en la Pi, cola de eventos/mutaciones en SQLite local, réplica local de mesas/carta/usuarios/ventas, reconciliación de stock al reconectar) sugerida en una consulta externa. Motivos: (1) es un salto de alcance grande respecto al diseño ya acordado arriba, que es más acotado (Pi = proxy de impresión + heartbeat + kiosco, todo contra el VPS, sin operar la sala sin internet); (2) la app hoy no tiene ninguna capa offline (todo pasa por Fastify+Prisma contra el Postgres del VPS) y agregarla implica resolver conflictos de sync, consistencia de stock y reconciliación de caja — trabajo serio no justificado todavía. Si el cliente pide explícitamente operación sin internet, retomar esta idea como su propio proyecto de diseño, no como parte del kit de impresión/kiosco.
3. **RBAC en dashboard** (ver memoria): encargado sin precios de coste, chef con costes, admin total.
4. **Monitoreo/alertas + Dockerizar el deploy** (idea 2026-07-13, sin definir alcance todavía): hoy nadie se entera si el VPS o la API se caen hasta que avisa el cliente — falta un chequeo de uptime con alerta al teléfono. Dockerizar el deploy (hoy es `git pull` + `pm2 restart` directo sobre el VPS) daría rollback rápido y un entorno reproducible; se evaluaría dejando la Postgres nativa fuera del contenedor (no tocar cómo vive hoy).
5. **VeriFactu** (⚠️ importante, obligatorio desde el **1 de enero de 2027**, sin diseñar todavía): sistema antifraude español (RD 1007/2023 + Ley Antifraude) — el software de facturación tiene que generar un registro por cada factura/ticket **encadenado por hash** (SHA-256, cada registro referencia el hash del anterior, tipo mini-blockchain — cualquier alteración/borrado rompe la cadena y se detecta), con **QR** impreso para verificación, y modalidad **VERI\*FACTU** (envío casi en tiempo real a la AEAT) o no-VERI\*FACTU (se guarda local con la misma cadena, disponible ante una inspección). Choca de frente con el flujo actual de "cuenta desactualizada" (hoy una comanda `facturada` se puede seguir editando — merma, invitación — y se reimprime; con VeriFactu una factura emitida no se edita, se corrige con una **rectificativa** nueva). **Mapa técnico y de impacto en la app (2026-10-08, con la documentación oficial de la AEAT ya leída): [`docs/verifactu.md`](docs/verifactu.md)** — incluye plazos vigentes (1-1-2027 sociedades, 1-7-2027 resto), formato exacto de la huella y del QR, qué choca con el flujo actual y las preguntas para la gestoría. Hay un monitor de demostración en `/admin/verifactu` (`VerifactuMatrixLedger.tsx`): huellas y verificación reales, facturas y envío simulados. Desde el 2026-10-09 se dibuja como árbol (grupo → restaurantes → tickets, con los hilos de la cadena única tejidos entre columnas) y con la identidad de la app (azul→verde, lluvia de caracteres con `OIDOOPS`) — detalle en la sección 8 de ese doc. **Pendiente clave antes de diseñar nada**: confirmar con la gestoría de la clienta si el ticket de OidoOps es la factura simplificada fiscal real del negocio, o si la contabilidad formal corre por otro software aparte (común en hostelería) — de eso depende si esto aplica a la app o no.
6. ~~Pool de reservas entre restaurantes~~ — **implementado 2026-09-14** en `/admin/reservas` y en `/sala` (panel 💼 → "📅 Reservas"), ver sección "Pool de reservas entre restaurantes" dentro de **Módulo: Reservas** más abajo. Pendiente: notificación proactiva al entrar algo al pool (hoy hay que tener la pestaña abierta).
7. **Preparar y activar una Oído Box**: procedimiento vigente, comando `oido` de pruebas y activación desde **HQ → Oído Box → Activar** (clave del canal, nombre DNS y certificado comodín sin entrar al VPS, hecho el 2026-10-15) en [`docs/instalar-box.md`](docs/instalar-box.md) (prueba de punta a punta pasada el 2026-10-14). **Modo local sin internet — solo Sala/TPV** — **retomado por Eze el 2026-10-13** (estado y diseño: [`docs/modo-local.md`](docs/modo-local.md) — **leerlo antes de tocar nada de esto**). Hecho ese día: etapa 0 (pantalla "Sin conexión" en sala, cortes de cada Box en HQ) y el prototipo de la etapa 1, probado en la Box y el teléfono de Eze: el mismo código corre dentro de la Box con `MODO_LOCAL=1` (`src/local.ts`, `src/replica.ts`, `RUTAS_LOCAL` en `permisos.ts`), guarda una copia de la sala de su local, sirve la sala e imprime sin pasar por el servidor; y la app instalada pasa sola de la nube a la Box (`apps/web/src/lib/conexion.ts`) por `https://<código>.box.<dominio>:8443`. Se instala en una Box con `bash deploy/box.sh` desde Terminal.app. **Hecho el 2026-10-14 (probado en el Mac, ver etapa 2 del doc)**: al volver internet la Box sube lo comandado (suma, nunca borra lo que no conocía; mismo número de comanda en la nube), la copia llega al instante (la Box deja abierta una línea con la nube, `POST /api/pi/eventos`), el cierre de turno avisa si la Box tiene algo sin subir, y en modo local se ocultan cobro, mermas, 💼 y los accesos del perfil. ⚠️ Una ruta nueva que la sala necesite sin internet hay que sumarla también a `RUTAS_LOCAL`, y una tabla nueva que la sala lea, a `replica.ts`. Razón nueva: la competencia anuncia que su app sigue funcionando sin internet y es argumento de venta — es función de producto para cualquier cliente con Oído Box, no un arreglo para Sensi. Alcance acordado: **comandar e imprimir sin cobrar** (el cobro se registra al volver internet; la mesa queda pendiente de cobro). Decidido: salto automático a la Box con aviso, mismo código Node+Postgres en la Box, exige "Red del local" (sección 6 de ese doc). Lo que sigue es la historia anterior: había quedado pausado explícitamente (2026-09-21), mismo día que se lo propuso. Idea original: Eze retoma la necesidad de que la sala siga funcionando si se corta el servicio de internet del restaurante (misma arquitectura "Offline-First" descartada el 2026-09-16 más arriba, ahora acotada solo a Sala/TPV). **Por qué se pausó**: hablando con Eze (2 años trabajando ahí de camarero) salió que el internet del restaurante **nunca se cortó** en ese tiempo — el problema real y frecuente históricamente era el sistema de comandas viejo ("BDP"), no la conectividad, y ese problema ya está resuelto de fondo por haber migrado a esta app. Construir todo el modo offline sería resolver un problema que en la práctica casi no ocurre. Queda documentado como posible red de seguridad a futuro, **sin prioridad** — no retomar sin que aparezca una razón concreta nueva (ej. el cliente reporta un corte real). Esqueleto de diseño que se llegó a esbozar (por si se retoma): réplica de solo-lectura de menú/empleados/mesas en la Pi con sync periódica (no live-mirror por SSE, evaluado como innecesariamente complejo) cada 1-2 min durante el turno; sin cobro offline (ni efectivo ni tarjeta — se prioriza simplicidad sobre completitud dado lo raro del escenario, y el datáfono de tarjeta depende de internet igual así que tampoco resolvería ese caso); Pi se reinicia a diario así que no hace falta persistencia de estado entre días.
   - **Detección de caída**: la app de sala intenta la API del VPS con timeout corto; si falla de forma sostenida, cambia su `apiBaseUrl` a un endpoint local del restaurante (la propia Pi, ej. `oido.local` o el hostname que tenga cada local — configurable por restaurante).
   - **Mini-API local en la Pi (modo degradado)**: un servicio liviano en la Pi (¿extensión de `printer-server`, o un proceso Fastify/Express aparte?) con: (a) réplica local de solo-lectura de menú + mesas (sincronizada desde el VPS mientras hay internet, cacheada en SQLite, refrescada cada X min); (b) endpoints mínimos compatibles — abrir mesa, agregar item, enviar comanda (se guarda en SQLite local con IDs temporales/UUID, no colisiona con IDs del VPS); (c) impresión directa in-process (la Pi ya tiene el `printer-server` ahí mismo, ni siquiera necesita MQTT para este camino).
   - **Cobro en modo local**: el punto más delicado (dinero). Primera idea: bancar el cobro también localmente (marcado como "pendiente de sync") y reconciliar al volver internet — pero ver el punto siguiente antes de asumir que hace falta.
   - **Límite natural a tener en cuenta**: si el datáfono de tarjeta del restaurante también depende de internet (lo más común), un corte real de internet ya impide cobrar con tarjeta de todas formas, más allá de lo que haga la app —achica el problema real a "seguir tomando y sirviendo pedidos con cobro en efectivo (o cobro a posteriori)" durante el corte, no "seguir facturando con tarjeta sin internet".
   - **Sync al reconectar**: la Pi sube al VPS las comandas/eventos generados en modo local (batch), marcadas con un flag tipo `origenOffline: true` para trazabilidad en el admin. Pendiente pensar colisiones (poco probable si todos los dispositivos de sala estaban igual en modo local, pero falta pensarlo si alguien tocó algo desde el admin en paralelo).
   - **Explícitamente fuera de esta v1** (para no repetir el error de scope-creep de la propuesta descartada): sincronización de stock/inventario, staffing, reservas, wiki, checklists — quedan inaccesibles durante el corte, no hace falta que funcionen offline.
   - Sin diseñar en detalle todavía — esto es el esqueleto del roadmap, falta la sesión de diseño dedicada (estructura de la mini-API, formato exacto de sync, UI de "modo local" para que camarero/encargado sepan que están offline).

8. **Informe de cierre de turno en PDF** (idea de Eze, 2026-10-08, sin empezar). Un "informe Z" generado al cerrar el turno. VeriFactu no lo exige; sirve de control para la dueña (qué se rectificó, por cuánto y quién), de resumen para la gestoría y de prueba legible ante una inspección. Hacerlo en dos pasos:
   - **Primero, con los datos que ya existen**: restaurante, encargado, apertura y cierre, ventas, efectivo/tarjeta, mermas, invitaciones y propinas. Útil aplique VeriFactu o no.
   - **Después, cuando exista el registro fiscal real**: lista de facturas numeradas del turno, rectificativas aparte (cuál corrige a cuál, motivo, quién), base e IVA, y bloque de integridad con la primera y la última huella del turno.
   - Diseño sobrio, de informe contable, no el estilo terminal del monitor. La API ya genera PDFs con `pdf-lib` (módulo Facturas).
   - Quedó preguntado y sin responder si arrancar ya con el primer paso o esperar a la gestoría.
9. **Pendientes al cierre de la sesión del 2026-10-09** (borrar de acá a medida que se hagan):
   - **Preguntar a la gestoría** si el ticket de OidoOps es la factura simplificada del restaurante, y si los cinco restaurantes facturan con el mismo NIF (el monitor dibuja una sola cadena para el grupo). Preguntas en `docs/verifactu.md`, sección 7. Plazo: 1-1-2027 para sociedades.
   - **Escandallos**: la pantalla está hecha pero vacía — faltan los gramajes del chef (¿Excel/papel?). Después, pasos 2 y 3 (ver **Módulo: Escandallos**).
   - **Alérgenos — confirmar con cocina**: la hoja del restaurante no marca pescado en TOST. ANCHOAS ni soja en TARTAR DE ATÙN. Se corrige en `/admin/alergenos`.
   - **Postres**: no existen en el menú; la hoja de alérgenos trae Cheesecake, Flan, Coconut y Brownie pero falta la carta con precios.
   - **Menús de grupo**: al quitar ZANAHORIAS de la carta, Standar, Premium y Deluxe quedaron con un vegetariano menos — decidir si va REMOLACHA.
   - **Quiz para camareros** sobre las fichas de la Wiki (vinos y comida) — idea de Eze, sin empezar.
   - **Pedidos a proveedores + recepción + cotejo con la factura** (idea de Eze, diseñada a medias el 2026-10-09, sin código): el dueño arma el pedido en `/admin` → se envía solo al proveedor → el encargado lo recibe en el panel 💼 marcando línea por línea → la foto de la factura queda pegada al pedido. Acordado arrancar por cotejo manual (nivel A) y dejar la lectura automática de la factura para después. **Falta saber**: quién provee los vinos y a qué coste, cómo piden hoy (mail/WhatsApp/teléfono) y quién hace los pedidos. Una factura vieja del proveedor de vinos resuelve casi todo.
   - **Monitor Veri\*factu** (`/admin/verifactu`): rediseñado como árbol con colores de marca, mermas y lluvia con OIDOOPS + viñeta. Eze lo vio en local y le gustó.
   - **Producción**: corregir las impresoras de Sensi Tapas (IPs inventadas) y vincular la Pi `OIDO-13FAEE` en `/admin/tickets`.
   - **Kit de impresión**: lo siguiente es el ticket de cobro con cajón. Resto de pendientes en `docs/kit-impresion.md`. La rama `kit-impresion` sigue sin mergear.
   - **`printer-server`**: Eze decidió dejarlo solo en local, sin repositorio en GitHub.
   - **Carpeta `-x/`** commiteada por accidente en este repo: sigue ahí, falta su OK para borrarla.
   - **Informe Z en PDF** (punto 8): sin empezar.
10. **Varios clientes de la suite: una instalación por cliente** (dirección acordada con Eze 2026-10-11, sin empezar; "hay que trabajarlo sí o sí"). Hoy la app es de un solo grupo: todo lo "global" (carta, alérgenos, wiki, proveedores, `EmpresaConfig`, PIN de admin) es de Sensi sin decirlo. Para un segundo cliente **no** se mete un `clienteId` en cada tabla; cada cliente tendrá su propia base de datos, proceso y dirección web con el mismo código. El identificador corto del cliente (`sensi`) ya existe en el back-office, que vive en **otro repo**: `~/Desktop/dev/oido-talent` → `/admin`, pestaña "Suite OidoOps" (clientes, locales y Pi de cada uno; registro a mano, no lee nada de esta app). Ese identificador dará nombre a la base, la dirección y el proceso. El alta se hará con un script corrido a mano, no con un botón del dashboard. **Hecho en la rama `multi-cliente` (2026-10-12, sin desplegar ni probar en el VPS)**: (a) los PIN de admin y pulso se validan en el servidor, así el código no lleva nada propio de un cliente; (b) carpeta `deploy/`: `comun.sh` (registro de instalaciones en `/root/oidoops/instalaciones`, una línea por cliente; se crea solo con Sensi apuntando a donde vive hoy: `/root/almacen`, `almacen-api`, 3001, `/var/www/almacen`), `actualizar.sh` (lo llama el workflow; recorre el registro haciendo por instalación los mismos pasos de siempre, y si una falla sigue con las demás; `actualizar.sh <codigo>` actualiza solo una) y `alta-cliente.sh <codigo> <dominio>` (a mano, como root: base y usuario `oidoops_<codigo>`, clon en `/root/oidoops/<codigo>`, `.env` con secretos y PIN nuevos, proceso `oidoops-<codigo>` desde el puerto 3101, sitio de Nginx y certbot; la base arranca vacía). **Decidido: una carpeta (clon) por cliente**, no una compartida — Sensi no se toca y cada cliente tiene la forma ya probada; se puede cambiar después sin tocar datos. **Direcciones (decidido por Eze 2026-10-12)**: `oidoops.ezeangeloni.xyz` es la **vidriera** (presentación del producto) y cada cliente vive en `<codigo>.oidoops.ezeangeloni.xyz` — Sensi pasa a `sensi.oidoops.ezeangeloni.xyz` y `almacen.ezeangeloni.xyz` se elimina (nadie más tiene esa dirección). Hace falta un comodín `*.oidoops` + `oidoops` en el DNS de IONOS. La vidriera **es el mismo build** servido sin API detrás: `GET /api/instalacion` (`{ ok: true }`, abierto a cualquier origen, sin datos) le dice al frontend si está en una instalación — `InicioPage` (`/`) manda a `/admin` (que pide el PIN) si la hay y muestra la `LandingPage` si no; el "Acceder" de la landing va a `/entrar` (`EntrarPage`), que pide el identificador del grupo, comprueba que existe (`lib/instalacion.ts`) y redirige a `https://<codigo>.<host de la vidriera>/admin`. La pantalla intermedia `/acceder` (botones Almacén / Panel / Mis propinas) se eliminó el 2026-10-12: el almacén es una herramienta aparte de la suite; `/retiro` y `/mis-propinas` siguen existiendo por dirección directa, sin enlace. Scripts: `deploy/vidriera.sh <dominio>` (una vez; sitio de Nginx con `/api` → 404, y `actualizar.sh` la refresca en cada deploy) y `deploy/mover-dominio.sh <codigo> <dominio>` (sitio nuevo + certificado, `FRONTEND_URL`, registro; solo con el certificado listo desactiva el sitio viejo). **Desplegado el 2026-10-12**: Sensi ya vive en `sensi.oidoops.ezeangeloni.xyz`, la vidriera en `oidoops.ezeangeloni.xyz` y el back-office en `hq.oidoops.ezeangeloni.xyz/admin`. **Alta desde el back-office (2026-10-12)**: el botón "Instalar su OidoOps" de HQ solo anota un pedido; lo ejecuta **el instalador**, `deploy/runner.sh`, que corre como root por cron cada minuto (lo deja puesto `deploy/instalar-runner.sh`, una vez), pregunta a HQ por `127.0.0.1:3100/api/interno/*` con un secreto compartido (`/root/oidoops/runner.env`; Nginx no publica `/api/interno`), corre `alta-cliente.sh <codigo> <codigo>.<dominio base>` y devuelve dirección y PIN (o el log si falla). Del pedido solo se usa el identificador, que el instalador vuelve a validar. Registro en `/root/oidoops/runner.log`. `deploy/baja-cliente.sh <codigo> --borrar-todo` elimina una instalación entera (también su base) o limpia un alta a medias; solo a mano. **Pi: HQ manda sobre de quién es cada una (2026-10-12)**: `PUT /tickets/pi` solo vincula una Pi si el back-office la tiene asignada a un local de ese cliente (`src/suite.ts` → `GET <HQ_URL>/api/interno/pis/:codigo` con `SUITE_TOKEN`; compara con `INSTALACION_CODIGO`). Esas tres variables las pone el deploy en el `.env` de cada instalación (`enlazar_instalacion` en `deploy/comun.sh`). Si HQ no responde, no se vincula (falla cerrado); sin `HQ_URL` (local) no se comprueba. Solo se mira al vincular: quitar la asignación en HQ no desvincula. **Sigue pendiente la capa de verdad**: un usuario MQTT por instalación y por Pi con ACL en Mosquitto (hoy hay un único usuario sin reglas, y está en la tarjeta de cada Pi). **Seguridad, primer cierre (2026-10-12)**: `GET /empleados` devolvía sin sesión toda la ficha de personal, PIN incluido. Ahora las rutas `/empleados*` (menos `/empleados/auth`) exigen sesión de admin; un hook `preSerialization` en `server.ts` quita cualquier clave `pin` de **todas** las respuestas salvo con sesión de admin (muchas rutas incluyen el empleado entero); `/empleados/auth` limita a 20 fallos por IP cada 10 min; los helpers de `api.ts` mandan siempre la sesión (`authHeaders()`); `AdminGuard` vuelve a pedir el PIN si el token caducó. **Etapa 1, toda la API exige sesión (mismo día)**: hook `onRequest` en `server.ts` — cualquier ruta `/api/*` pide un JWT válido (de empleado, de admin o de Pulso) salvo las de `RUTAS_PUBLICAS` (los tres logins, `/instalacion`, `GET /restaurantes`, las tres de reservas públicas, `GET /retiros/:id` y `POST /reviews/sync`). **Una ruta nueva nace cerrada**: si tiene que ser pública hay que añadirla a esa lista. `/pulso/auth` ahora devuelve token (`tipo: 'pulso'`, `sessionStorage['pulso_token']`). Los canales SSE reciben la sesión en la dirección (`conSesion()` en `api.ts`, porque `EventSource` no manda cabeceras). `tokenActual()` elige la sesión según la zona (`/admin`, `/pulso`, resto) y un 401 con sesión enviada la borra y vuelve al PIN. Almacén (`/retiro`) y `/mis-propinas` usan el token del PIN que acaban de pedir. **Etapa 2, cada sesión a lo suyo (mismo día)**: `apps/api/src/permisos.ts` lista qué puede llamar cada tipo de sesión y el mismo hook lo aplica — admin: todo; pulso: `RUTAS_PULSO`; sala: `RUTAS_SALA` (lo que de verdad llama `SalaMesasPage`, el almacén y mis-propinas), con `SOLO_ENCARGADO` (cobrar, abrir y cerrar turno) solo para encargados; **lo que no está en esas listas es de administración**. ⚠️ Al añadir una pantalla o llamada nueva en `/sala`, su ruta hay que sumarla a `RUTAS_SALA` o el camarero recibe 403 "No tienes permiso para esto". `GET /propinas/mis-turnos` solo devuelve las del propio empleado. Probado con una matriz de las 221 rutas × 5 identidades. **Red del local, "dónde estás" (2026-10-12, desplegado con el interruptor apagado en todos los locales)**: implementa el punto 1 del roadmap con la regla que fijó Eze — fuera del local el personal entra igual con su PIN pero **solo consulta** (wiki, carta, alérgenos, sus propinas; el encargado además reviews y reservas en lectura), y **operar** (mesas, comandas, cobros, turno, mermas, checklists) exige estar en la red del local. Piezas: `Restaurant.restringirPorRed` + `piSecreto` (nunca sale en una respuesta: lo quita el filtro global), tabla `RedLocal` (ip pública, origen `pi`|`manual`); `routes/red.ts` — `POST /pi/latido` (la Pi, cada minuto; pública, valida `piSecreto`; la red vale 7 días desde el último latido), `GET /red/estado`, `GET|PATCH /admin/red*` (**sin autorización manual**: Eze descartó el botón de emergencia del encargado el mismo día — la red la define solo la Pi; el plan B es apagar el interruptor del local desde `/admin/red`); la API le dice a la Pi a dónde latir con un mensaje MQTT retenido `pi/<codigo>/config` (al vincular y en cada conexión al broker); hook `preHandler` en `server.ts` + `CONSULTA_SALA`/`CONSULTA_ENCARGADO` en `permisos.ts`; el login de sala manda el `restaurantId` del dispositivo y la sesión queda atada a él (pedir datos de otro local → 403 si el local restringe). No se puede activar un local sin ninguna red vigente (409). Web: `/admin/red` (`RedPage`, grupo "Grupo") y pantalla "Estás fuera del local" en `SalaMesasPage` (`EncargadoPanel` con `soloConsulta`). **Pi**: el latido está escrito en `~/Desktop/dev/printer-server` (`_recibir_config`, `_loop_latido`) y **falta copiarlo a la `OIDO-13FAEE`** — hasta entonces ninguna red se aprende sola. **Sin ver en un navegador**: la pantalla de fuera del local y `/admin/red`. **No cubre**: acciones por id sobre comandas de otro local del mismo grupo; y el almacén (`/retiro`) entra sin restaurante. **Canal MQTT con usuario por Pi y por instalación (etapa 3, scripts listos 2026-10-12)**: `deploy/mqtt.sh` — `instalar` (una vez: usuarios `inst-<codigo>` y `hq` con su clave en cada `.env`, `acl_file /etc/mosquitto/acl` en `conf.d/production.conf`, reinicia Mosquitto y, si no arranca, restaura la copia), `pi OIDO-XXXXXX` (crea o renueva la credencial de una Pi y la muestra una vez; va en el `.env` de la Pi), `cerrar` (borra el usuario compartido de antes), `sincronizar` (lo llama `runner.sh` cada minuto: rehace las reglas con `GET /api/interno/pis-por-cliente` de HQ). Reglas: `pattern readwrite pi/%u/#` (cada Pi, cuyo usuario es su código, solo habla de sí misma); cada `inst-<codigo>` solo llega a las Pi asignadas en HQ a los locales de su cliente; `hq` solo lee `estado` e `impresoras`. Comprobado en un Mosquitto 2.0.11 de prueba. **Una Pi nueva necesita su credencial antes de poder conectar** (se crea con `mqtt.sh pi` al prepararla). `deploy/rotar-sync-secret.sh` cambia el secreto del cron de reviews. **Badges de Oído Talent desde Empleados (2026-10-12)**: decisión de Eze — un cliente de la suite no se registra en Talent; da el badge desde `/admin/empleados` (botón 🏅 Badge → `components/BadgeModal.tsx`). `POST /api/empleados/:id/badge` (solo admin) → `pedirBadge()` en `src/suite.ts` → `POST <HQ_URL>/api/interno/badges` con `SUITE_TOKEN`; el back-office lo firma a nombre del restaurante (lo crea en Talent como verificado "usa OidoOps" la primera vez) y le manda al empleado el correo con el enlace a su QR. BASIC = hizo bien su trabajo; GOLD = superó las expectativas y exige un BASIC previo de cualquier local. OidoOps no guarda nada del badge: la fuente es Talent (`oido-talent`). Los locales sin la suite siguen registrándose en Talent. **Datos de demostración**: `apps/api/prisma/seed-demo.ts` (`npx tsx prisma/seed-demo.ts --confirmar`, dentro de `apps/api` de la instalación) carga un grupo inventado de 3 restaurantes con carta, alérgenos, salón, personal (PIN desde 2100), wiki, checklists, dos turnos cerrados y uno abierto con mesas en marcha. Solo corre sobre una base sin restaurantes y se niega en la instalación `sensi`. **Sincronización con HQ (2026-10-12)**: `src/sync-hq.ts` — cada minuto (y al crear o renombrar un restaurante) la instalación manda sus restaurantes a `POST <HQ_URL>/api/interno/locales` y recibe qué Pi tiene asignada cada uno; aplica el cambio sola (vincula, mueve o desvincula, genera `piSecreto`, anuncia el latido). Consecuencias: los locales de cada cliente aparecen solos en el back-office, y **las Pi se asignan solo en HQ** — en una instalación enlazada `PUT /tickets/pi` responde 409 y `/admin/tickets` ya no muestra vincular/desvincular (`asignadaPorOido`). Mover la única Pi de un cliente a otro para una demo = cambiar la asignación en HQ y esperar un minuto. **Para que el cambio se vea en segundos y no en minutos**: HQ avisa a la instalación al tocar un local (`POST /api/suite/sincronizar`, pública, valida `SUITE_TOKEN`), la instalación reintenta cada 3 s mientras una Pi recién asignada no da noticias (`volverAPreguntar` se da de baja y vuelve a suscribirse: mqtt.js ignora una suscripción repetida), y el cron de root corre `deploy/mqtt.sh vigilar` (reglas del canal a ≤3 s de HQ; lo programa solo el deploy). Sin `HQ_URL` (local) todo sigue a mano. **Nombre comercial del aparato: "Oído Box"** (2026-10-12). En los textos visibles (panel del cliente, HQ) se dice "la Box" / "Oído Box"; en el código, los comandos y la documentación técnica sigue siendo "la Pi" (`piCodigo`, `pi/<codigo>/…`). No renombrar lo interno. **Restaurantes**: una instalación nueva arranca con la base vacía, así que el panel tiene `/admin/restaurantes` (`RestaurantesPage`, grupo "Grupo" del menú; `POST`/`PUT /api/admin/restaurantes`, con sesión de admin, sin borrado) y un aviso en el layout cuando no hay ninguno. **Antes de pasar a `main`**: el `.env` de la API en el VPS necesita `PULSO_PIN` (y `ADMIN_PIN`). **Pendiente antes del segundo cliente**: un usuario MQTT por instalación (hoy el alta copia las credenciales de Sensi: una instalación podría imprimir en la Pi de otra), el cron de reviews por instalación, y las credenciales de Google Sheets y `sync-db.sh`, que asumen una única instalación.

11. **Notificaciones push en el teléfono del encargado** (pedido de Eze 2026-10-21, sin empezar): que le llegue un aviso **con el teléfono bloqueado en el bolsillo**, como un WhatsApp. Lo hecho hasta ahora (vibración + aviso arriba al entrar una reserva web, ver **Aviso de reserva nueva** en Reservas) solo funciona con la app abierta en pantalla. Diseño acordado:
   - **Web Push** estándar: librería `web-push` en la API + un service worker propio que recibe el aviso con la app cerrada (hoy `vite-plugin-pwa` genera el SW solo; habrá que pasarlo a uno propio o sumarle el manejo de `push`/`notificationclick`). Al tocar la notificación se abre la app en la lista de reservas.
   - **Claves VAPID una sola vez por instalación** (no por teléfono): las genera el alta de cliente y van al `.env` (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`); para Sensi se generan una vez a mano/al desplegar. **Cada teléfono solo toca "Activar avisos" y acepta el permiso**; la app guarda su suscripción en el servidor (tabla tipo `PushSuscripcion`: empleado, restaurante, endpoint, claves; borrar las que el servicio de push da por caducadas). La ruta de suscribirse va en `RUTAS_SALA`.
   - **Pedir el permiso con un botón claro** (perfil o panel 💼), no al abrir la app: si el encargado lo rechaza, el teléfono no deja volver a preguntarlo y hay que activarlo a mano en ajustes.
   - **Android**: funciona (mejor con la app instalada); vibra/suena según los ajustes del teléfono. **iPhone**: solo con la app **añadida a la pantalla de inicio** (iOS 16.4+).
   - Primer aviso: **reserva nueva por la web**. Después, con el mismo sistema: algo que entra al pool, un alto, etc.
   - Sin internet (modo Box) no llegan. Para probarlo hace falta https → probar contra producción, no en local.

## Contexto de negocio

- Cliente: grupo de 5 restaurantes en Barcelona
- Interlocutora: Valentina, CEO de Sensi Tapas
- Precio acordado: 1.500€ setup + 120€/mes
- En producción en VPS Ubuntu + Nginx + PM2

## Stack

- **Frontend**: React + Vite + TailwindCSS + React Query (PWA, tablet-first)
- **Backend**: Fastify + Prisma + Zod + TypeScript
- **DB**: PostgreSQL 16
- **Infra**: Ubuntu VPS + Nginx + PM2
- **Tiempo real**: SSE (Server-Sent Events) via `apps/api/src/sse.ts` + `useRestaurantEvents` hook (por restaurante) + `useAdminEvents` hook (global)

## Estructura del proyecto

```
almacen_app/
├── apps/
│   ├── api/                  ← Fastify API (puerto 3001)
│   │   ├── src/
│   │   │   ├── server.ts     ← entry point
│   │   │   ├── sse.ts        ← broadcast SSE a clientes conectados
│   │   │   └── routes/
│   │   │       ├── comandas.ts
│   │   │       ├── salon.ts
│   │   │       ├── menu.ts
│   │   │       ├── mermas.ts
│   │   │       ├── propinas.ts
│   │   │       ├── reviews.ts
│   │   │       ├── retiros.ts
│   │   │       ├── productos.ts
│   │   │       ├── restaurantes.ts
│   │   │       ├── empleados.ts
│   │   │       ├── inventario.ts
│   │   │       ├── grupo-menu.ts   ← menús cerrados para grupos
│   │   │       ├── staffing.ts     ← planificación de personal
│   │   │       ├── events.ts       ← SSE por restaurante + global
│   │   │       ├── reservas.ts     ← sistema de reservas (OidoPerso)
│   │   │       ├── wiki.ts         ← base de conocimiento (speeches/protocolos)
│   │   │       ├── checklists.ts   ← checklists de apertura/cierre por sector
│   │   │       ├── alergenos.ts    ← catálogo editable de alérgenos
│   │   │       ├── escandallos.ts  ← recetas y coste de platos (requiere sesión de admin)
│   │   │       └── tickets.ts      ← config de tickets (empresa/local) + impresoras + rutas de impresión
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── .env
│   └── web/                  ← React app (puerto 5173)
│       └── src/
│           ├── pages/
│           │   ├── SalaMesasPage.tsx     ← vista camarero (tablet)
│           │   ├── MesasFeedPage.tsx     ← dashboard encargado (tiempo real)
│           │   ├── ComandasPage.tsx      ← admin comandas + mapa sala
│           │   ├── AdminPage.tsx         ← panel admin general
│           │   ├── TurnosPage.tsx        ← historial turnos + propinas
│           │   ├── TurnoDetallePage.tsx  ← detalle de un turno cerrado
│           │   ├── InventarioPage.tsx    ← inventario de sala
│           │   ├── EmpleadosPage.tsx     ← gestión de empleados
│           │   ├── GrupoMenuPage.tsx     ← menús cerrados para grupos
│           │   ├── StaffingPage.tsx      ← planificación semanal de turnos
│           │   ├── WikiPage.tsx          ← admin de la wiki (categorías + artículos)
│           │   ├── ChecklistsPage.tsx    ← admin checklists (sectores + ítems + registro)
│           │   ├── TicketsPage.tsx       ← admin de tickets (empresa/local, impresoras, rutas, preview)
│           │   ├── PulsoPage.tsx         ← /pulso: facturación en vivo por restaurante (dueño)
│           │   ├── ReservasAdminPage.tsx ← admin de reservas (OidoPerso)
│           │   ├── ReservaPublicaPage.tsx← formulario público /reservas/:slug
│           │   ├── ValidarPage.tsx       ← escaneo QR para validar retiros
│           │   ├── VerificarPage.tsx     ← vista pública de un retiro /verificar/:id
│           │   └── LogoLabPage.tsx       ← herramienta interna exploración logo
│           ├── components/
│           │   ├── AdminGuard.tsx        ← PIN gate del panel admin (lo valida el servidor, `ADMIN_PIN`)
│           │   ├── PulsoGuard.tsx        ← PIN gate de /pulso (lo valida el servidor, `PULSO_PIN`, independiente del admin)
│           │   └── tickets/
│           │       ├── TicketCobro.tsx   ← preview ticket de cobro (80mm)
│           │       └── TicketComanda.tsx ← preview comanda cocina/barra (80mm, agrupado por nivel)
│           ├── hooks/
│           │   ├── useRestaurantEvents.ts ← SSE por restaurante → invalida React Query cache
│           │   ├── useAdminEvents.ts      ← SSE global → invalida cache del admin
│           │   └── useScanner.ts          ← pistola de barcode
│           └── api.ts                     ← cliente HTTP centralizado
```

## Variables de entorno (apps/api/.env)

```
DATABASE_URL="postgresql://ezequielangeloni@localhost:5432/almacen_dev"
JWT_SECRET="dev-secret-local"
FRONTEND_URL="http://localhost:5173"
PORT=3001
ADMIN_PIN=xxxx   # PIN de /admin — lo valida el servidor (POST /admin/auth) y devuelve la sesión firmada
PULSO_PIN=xxxx   # PIN de /pulso — lo valida el servidor (POST /pulso/auth); independiente del de admin
```

**Los PIN ya no van en el build del frontend** (rama `multi-cliente`, 2026-10-11): `VITE_ADMIN_PIN` y `VITE_PULSO_PIN` dejaron de existir, `apps/web` no necesita `.env`. `AdminGuard` y `PulsoGuard` le preguntan al servidor, así el mismo build sirve para cualquier instalación y cambiar un PIN es editar el `.env` de la API + `pm2 restart` (sin reconstruir). Sin la variable en el servidor el login responde 503 y **no se puede entrar**: antes de desplegar esto, el `.env` de la API en el VPS tiene que tener las dos. 10 fallos seguidos bloquean esa puerta 10 minutos.

## Comandos útiles

```bash
cd apps/api && npm run dev      # API en desarrollo
cd apps/web && npm run dev      # Web en desarrollo
cd apps/api && npx prisma migrate dev --name nombre_migracion
cd apps/api && npx prisma studio
cd apps/api && npx tsx prisma/seed.ts
```

## Deploy

**GitHub Actions se encarga del deploy automático al VPS.**
Basta con hacer `git push` desde local — el workflow actualiza el VPS automáticamente (git pull + build frontend + `prisma db push --accept-data-loss` + restart PM2). No hay archivos de migración: el schema se sincroniza con `db push` tanto en local como en producción.

- VPS: Ubuntu `82.165.93.34`, directorio `/root/almacen`
- Proceso PM2: `almacen-api` (el frontend lo sirve Nginx como estáticos)
- Para ver estado en VPS: `pm2 status` / `pm2 logs --lines 50`

### Archivos secretos (NO van en git)

El archivo de credenciales de Google Sheets **no está en git** (cubierto por `.gitignore`: `apps/api/oidoops-*.json`). Debe subirse manualmente al VPS la primera vez, y cada vez que se renueve:

```bash
scp apps/api/oidoops-c9b6d1f8f3da.json root@82.165.93.34:/root/almacen/apps/api/
```

El archivo vive en `/root/almacen/apps/api/` en el servidor — solo accesible por el proceso Node, no expuesto públicamente por Nginx.

### Sincronizar DATOS local → prod (`sync-db.sh`)

El deploy (`git push`) sincroniza **schema** (tablas/modelos vía `prisma db push`) pero **NO los datos**. Para llevar los datos de la DB local al VPS existe **`./sync-db.sh`** (en la raíz del repo). Se corre desde el **Mac** (no desde el SSH; el script se conecta solo al VPS):

```bash
./sync-db.sh
```

Es un **replace total**: prod queda espejo exacto del local (mismos IDs, sin duplicados) — **lo que esté solo en prod se borra**. Por eso el orden correcto es: primero `git push` (que actualiza el schema en prod), y después `./sync-db.sh` (que carga los datos).

Cómo funciona (todo en una transacción en el VPS → si algo falla, rollback y prod queda intacto):
1. Backup previo de prod en `/root/almacen_prod_backup_FECHA.sql`.
2. `pm2 stop almacen-api` (un `trap` lo vuelve a levantar siempre, aunque falle).
3. Suelta todos los FKs → trunca todas las tablas (dinámico, menos `_prisma_migrations`) → carga `pg_dump --data-only` del local → recrea los FKs. Restaura `search_path` a `public` antes de recrear FKs (pg_dump lo deja vacío).

El script **está en `.gitignore`** (tiene credenciales de DB hardcodeadas) — vive solo en local, no viaja al repo. Si se clona el proyecto en otra máquina hay que recrearlo.

---

## Módulo: Sala (TPV)

### Estados de una Comanda

```
abierta → enviada → facturada → liberada → cerrada
```

- **abierta**: mesa con items pendientes de enviar a cocina
- `Comanda.enviadaAt DateTime?` — hora de la **primera** comandada a cocina (los re-envíos/marcha pasa no la pisan; los menús de grupo la fijan al generarse). Se muestra junto al nº de mesa en el header del `ComandaPanel` (🕐 ámbar; si aún no se comandó, "abierta HH:MM" en gris)
- **enviada**: todos los items tienen nivel asignado y fueron enviados
- **facturada**: camarero imprimió la cuenta (botón "Imprimir cuenta")
- **liberada**: camarero confirmó entrega de cuenta — mesa libre, pendiente de cobro por el encargado
- **cerrada**: encargado cobró (cash o tarjeta) — requiere `metodoPago`

### Lógica de items (ComandaItem)

Cada item tiene:
- `nivel`: orden de salida (1=primero, 2=segundo, etc.) — `null` si aún no enviado
- `ronda`: `0`=nunca enviado, `1`=comanda original, `2+`=marcha pasa (re-envíos)
- `tipo`: `'cocina'` | `'barra'`
- `autoGenerado`: `true` si fue añadido automáticamente al abrir la mesa (ej: ítem `autoPorPax`) — no va a cocina ni barra

Al enviar (`PATCH /comandas/:id/enviar`), se calcula `nextRonda = max(ronda existente) + 1` y se asignan nivel y ronda a los items pendientes.

### Flujo camarero (SalaMesasPage)

- Mapa SVG interactivo con los planos del salón
- PIN de autenticación por camarero
- Abrir mesa → añadir items del menú → OrdenarModal (asignar niveles de salida) → Enviar a cocina
- Puede re-enviar (marcha pasa), imprimir cuenta, registrar mermas, cambiar mesa, fusionar mesas
- **Swipe horizontal = progresión Pedido → Carta → Mapa**: en la vista Pedido lleva al primer nivel de la carta (el caso "miro la mesa y agrego algo"); en el primer nivel de la carta sale al mapa; más adentro de la carta sigue navegando niveles. Al salir al mapa con items sin comandar, alerta con dos acciones: **Descartar** (elimina los pendientes y sale) o **Comandar** (abre el orden de salida → Oído; si solo hay barra/auto, envía directo); tocar el fondo = quedarse (misma alerta para la ✕). Comandada exitosa → `CheckOverlay` (viñeta OidoOps) al volver al mapa.
- **Header** (rehecho 2026-10-21, `CabeceraVuelta`): **la misma cabecera en toda la vuelta del encargado** (mapa, cobros, reservas, plano de reservas) y también para el camarero en el mapa. Izquierda: viñeta OidoOps + primer nombre (w-16, abre el `PerfilPanel`). Centro: icono de línea del paso (los de `ICONO_PASO`, iguales a la barra de abajo) + título (salón, Cobros, Reservas…) + dato corto (restaurante, n por cobrar, reservas del día). Derecha: lo propio del paso (mesas en lista en el mapa, ‹ Hoy › en el plano, 📊 Panel en el TPV), el maletín de herramientas del encargado (abre el panel 💼 completo) y salir. **Sin botones de planta** (los reemplazan la barra de la vuelta y deslizar) y, en la vuelta, sin ✕ ni "← Volver": se navega deslizando o tocando los puntitos. El **reloj en vivo** flota sobre el mapa (píldora centrada en el margen superior, `pointer-events-none`); también está en el header del panel 💼 completo. NO hay botón de mapa, ni "+", ni ⚗️, ni toggle de tema en el header.
- **Mesa con la cuenta de los de antes sin cobrar y gente nueva sentada** (idea de Eze, 2026-10-19): la mesa toma el color de la comanda **de ahora** (abierta/enviada; es la que se abre al tocarla) y lleva **un segundo marco rojo por dentro, más chico y con su aureola** = "falta cobrar / cuenta impresa" (`MesaBtn pendienteCobro`, `pendienteCobroEn` en `SalaMesasPage`). Cuenta las otras comandas de la mesa `facturada` o `liberada` con items (las liberadas se piden aparte: la lista del mapa no las trae). Una mesa liberada sin nadie nuevo se ve verde con ese marco.
- **Mesas que se separan** (idea de Eze, 2026-10-25): en Sensi Tapas la "2" del mapa son la 2 y la 3 juntas (por eso se salta de la 2 a la 4), y a veces se separan. En `/admin/salon` → editar mesa → **"⇹ Se puede separar en dos"** con el número y los pax de la otra mitad (se guarda al momento, aparte del lienzo; en el lienzo la mesa lleva "⇹ 3"). La otra mitad es otra fila de `Mesa` con `parteDeId` = la entera, escondida mientras están juntas; `Mesa.separada` dice si ahora está partida. **`GET /salon` devuelve las mesas ya resueltas** (`mesasVisibles` en `apps/api/src/mesas-separadas.ts`, sin imports: lo comparten la API y el editor del admin, que lo importa desde `apps/web`): juntas, la entera con `separable` y `pareja`; separadas, las dos mitades (`separada`, `pareja`) dibujadas en el sitio de la mesa entera, una tras otra por su lado largo (redonda o cuadrada: al lado o encima, la que deje más aire con las demás mesas del salón; si da igual, al lado), **del tamaño de las mesas normales de esos pax del mismo salón** (`ladoDe`: el más repetido; una redonda sin redondas de esos pax usa las cuadradas; sin ninguna, media mesa entera, pero nunca menos de 60 — `MIN_MITAD` —, aunque salgan un poco del sitio de la entera) (respeta la rotación; el número menor se queda la mitad de arriba/izquierda para que el mapa siga 1, 2, 3, 4, también si la otra mitad tiene el número menor, como la 12 con la 11; pax: la mitad lleva los suyos y la entera el resto). Así mapa, plano de reservas, cambiar mesa, TPV y admin de comandas no saben nada de esto. El editor del admin pide `?editar=1` (filas tal cual, con `mitad`). **Vista del teléfono en el editor** (2026-10-26, pedido de Eze): a la derecha del lienzo de `/admin/salon`, el mapa como lo ve el camarero (`components/VistaTelefono.tsx`: mismo escalado que la sala, `MesaBtn` de la sala, cabecera y barra de abajo), en vivo mientras se mueven las mesas aunque no se haya guardado; 📱 Teléfono / 🖥 Tablet TPV, **Juntas / Separadas** (todas las separables partidas a la vez, el peor caso) y las mesas que se pisan en rojo con la lista abajo (no cuentan sillas altas entre sí ni con la barra). Se esconde con ✕ y vuelve con "📱 Ver en el teléfono" (`localStorage['salon_ver_telefono']`). Las medidas de pantalla son aproximadas (`PANTALLAS`). **Se separa sola al abrirla** (cambiado el 2026-10-25 a pedido de Eze; antes había un botón Separar/Juntar): abrir la 2 junta con los pax de una mitad (1 o 2 en una de 4; `separarAlAbrir`, en la misma transacción que crea la comanda en `POST /comandas`) la separa — la gente queda en la 2 y la 3 aparece libre al lado; con 3 o 4 pax se abre entera. **Si llegan primero los de la 3**: con los pax de una mitad, el `AbrirMesaModal` muestra **[ 2 ] [ 3 ]** ("¿En cuál se sientan?", marcada la 2); tocar 3 abre con `enPareja` y la comanda nace en la 3 (la 2 queda libre). En el TPV, teclear 3 + Enter con la mesa junta abre así. Los números y pax salen de la configuración del admin (`paxPareja` en la vista). Junta, en el mapa se ve solo "2". **Se juntan solas** cuando las dos mitades quedan libres (sin comanda abierta/enviada/facturada): cada aviso `update` de `routes/comandas.ts` llama a `juntarMesasLibres` (también al cerrar el turno); SSE `salon` → recarga `['salon-planes', rid]`. **Reservas** (2026-10-25): las de la otra mitad se quedan en ella aunque esté escondida (`idPareja` en la vista de la mesa junta); el plano de reservas las enseña dentro de la mesa junta con su número ("3·21:00"; "2·" = la 2 sola, sin número = la mesa entera), al asignar una reserva que cabe en una mitad pregunta **[ 2 ] [ 3 ]**, y los solapes solo cuentan dentro de la misma mitad (la de la mesa entera pisa a todas). **Sentar** (`PATCH /reservas/:id/sentar`) separa igual que abrir: una reserva de la 3 se sienta en la 3 (`separarAlAbrir` acepta el id de la mitad escondida). Quitar la mitad desde el admin pasa sus reservas por llegar a la entera. En el mapa, una mesa separable lleva una raya punteada donde se parte. **Tamaño "Doble"** (2026-10-25, Eze: una de 4 tiene que medir lo que dos de 2): en el editor, rectangular → Largo **Doble** = 2 × el tamaño elegido + el hueco de la rejilla (10); separada, sus mitades salen cuadradas del tamaño elegido con ese mismo hueco (`HUECO` en `salon.ts`), iguales a dos mesas de 2 puestas juntas. Es la opción por defecto de una rectangular nueva. Sin internet (Box) no se separa ni se junta. No cubre: reservar la 3 de un día futuro con la mesa junta, ni juntar dos mesas sueltas para un grupo. **Pendiente al cierre del 2026-10-26**: Eze tiene que ordenar en producción la Planta Baja y la Planta Alta de Sensi con la vista del teléfono en "Separadas" (bajar la 12 que pisa la 10; separar las filas de la Planta Alta); no se ha visto todavía en un teléfono real si las medidas de `PANTALLAS` se parecen a las de verdad.
- **Deslizar el mapa de lado = cambiar de salón** (idea de Eze, 2026-10-18): hacia la izquierda, el salón siguiente; hacia la derecha, el anterior (en el orden de `planes`), con el nombre del salón un momento en grande. **Desde el último salón, el encargado pasa a cobrar**: en el PAD abre **solo los cobros** (💶 Cobros, sin las pestañas de herramientas — `EncargadoPanel soloCobros`; "💼 Ver las demás herramientas" las despliega). Deslizando sigue **📅 Reservas** (lista `DESLIZAR` en `EncargadoPanel`, con puntitos de posición); hacia la derecha se vuelve paso a paso hasta el mapa; en el TPV, su 📊 Panel. Para todos los demás solo cambia de salón. `irASalon` + `swipeMapa` en `SalaMesasPage` (mismos umbrales `swipeThresholds()`). **La vuelta completa (2026-10-21)**: mapa (cada salón) → 💶 Cobros → 📅 Reservas (lista) → 🗺 plano de reservas (cada salón) → mapa otra vez, en los dos sentidos (del primer salón del mapa, a la derecha, se abre el plano por su último salón). Un solo **indicador de la vuelta** (`IndicadorVuelta`, pasos de `pasosVuelta`) abajo en las tres pantallas: un puntito por paso agrupados con su icono de línea, el actual estirado en verde de marca, y **tocar un puntito salta a ese paso** (`irAPaso` en la página; el panel se remonta con `panelKey` para tomar la pestaña). Solo encargado, con internet y fuera del TPV (`conVuelta`); el camarero ve los puntitos de los salones.
- Panel de perfil (`PerfilPanel`, tocar la viñeta): nombre del restaurante + nombre completo, **toggle claro/oscuro** (junto a la ✕), propinas del mes + accesos a **Producción (⚗️ premixes)**, Wiki y Checklists (iconos SVG de línea con tinte de color, no emoji)

### Añadir items — navegación por niveles (tiles, accesibilidad visual)

Pestaña "Añadir" del `ComandaPanel` (tabs mitad y mitad estilo marca: **"COMANDA (n)"** uppercase y el **+** gordo en SVG; el activo lleva el gradiente azul→verde, el inactivo va en verde de marca sobre fondo sutil). **Pestaña inicial al abrir una mesa**: si la comanda está toda enviada (sin pendientes) → entra directo a la carta ("Añadir" — el caso típico: vuelven a pedir una bebida); con items pendientes de enviar o cuenta impresa/liberada → vista del pedido. Navegación por **tiles cuadrados grandes** (texto uppercase 18px font-black, pensado para camareros con dificultades visuales):

```
Nivel 1: grupos (🍽️ COMIDA / 🍹 BEBIDAS…) — cards full-width h-24
Nivel 2: categorías del grupo — grid 3 cols, tiles aspect-square
Nivel 3: subcategorías (si las hay, mismo tile) + items directos
Nivel 4: items de la subcategoría
```

- **⚡ Accesos rápidos** (2026-10-24, pedido de Eze): en la pantalla de grupos (nivel 1, donde cae una mesa nueva), arriba de COMIDA / BEBIDAS, hasta 24 botones cortos en rejilla de 3 (`tileRapido`); se ven tres filas y el resto con **scroll vertical** dentro del recuadro (`CajaRapidos`, con degradado y "▾ n más"; nunca de lado, que es volver de nivel), con los mismos gestos que la carta (toques suman, mantener = nota, combinado → refresco, agotado tachado). Se configuran en **`/admin/accesos-rapidos`** (`AccesosRapidosPage`, grupo Carta) con selector **🌐 Global / local**: **fijos** elegidos a mano (tabla `AccesoRapido`, en orden; `restaurantId` null = **lista del grupo**, solo con platos de la carta global). Cada local **usa la del grupo** o tiene **la suya** (`Restaurant.accesoRapidoPropia`; null = nunca tocado → propia si tiene filas; al pasar a propia arranca copiando la del grupo, y la propia se conserva si vuelve a la del grupo). Además, si `Restaurant.accesoRapidoAuto` (por defecto sí), los huecos **de las tres primeras filas** (`AUTO_HASTA` = 9) se llenan con las **bebidas más vendidas** del local en 30 días (unidades de `ComandaItem` tipo barra por nombre; un combinado "X + Y" cuenta para X). `routes/accesos-rapidos.ts`: `GET /accesos-rapidos?restaurantId` (sala, en `RUTAS_SALA`; caché de 10 min de lo más vendido) y `GET|PUT /admin/accesos-rapidos`; SSE `accesos-rapidos`. Sin internet no está en `RUTAS_LOCAL`: el teléfono sigue con la última lista que cargó. En el TPV es la primera pestaña, "⚡ Rápido" (antes de los grupos, `TPV_RAPIDO` en `grupoTab`), y la que se ve al abrir la mesa, con los cuadrados grandes de la carta TPV. En el teléfono no sale si la carta tiene un solo grupo (se salta el nivel 1).
- Si solo hay un grupo se entra directo al nivel 2. Categoría sin subcategorías va directa a sus items.
- **Tinte ámbar** en tiles de grupos de barra (detectados con `esGrupoBarra(g)` = regex `/vino|bebida/i` — NO lista hardcodeada; cubre "Vinos Botella", "VINOS", etc.). Determina también el `tipo` cocina/barra del item.
- **Pasar a la siguiente categoría** (2026-10-24, idea de Eze): dentro de una categoría, **deslizar hacia la izquierda** abre la siguiente del grupo (CLÁSICAS → VEGETARIA → PESCADO…) o la subcategoría hermana (TINTO → BLANCO), con su nombre en grande un momento; da la vuelta (de la última a la primera). Al final de la lista de platos, botón **"PESCADO ›"** con el mismo paso (por si deslizar falla). Hacia la derecha = un nivel atrás. `irASiguienteCat` / `volverCat` en `ComandaPanel`. En la rejilla de categorías deslizar sigue siendo atrás en cualquier dirección.
- **Volver un nivel**: botón cuadrado (56px, gradiente azul→verde de marca) abajo a la izquierda del pie del panel, donde antes estaba la palabra "Oído" (la viñeta y el total siguen en su sitio; `puedeVolver`, 2026-10-20) + swipe hacia la derecha (en la rejilla de categorías, a cualquier lado) + botón "← nombre" arriba. Los tres conviven porque el swipe falla en algunos teléfonos.
- **Búsqueda global**: el campo de búsqueda (y la lupa del pie del panel, junto al botón de volver; antes flotaba y se arrastraba, 2026-10-20) ignora el nivel/grupo activo y matchea por nombre de item **o de categoría** en todo el menú. Todas las búsquedas de sala usan `normTxt` (NFD + sin diacríticos + lowercase): insensible a mayúsculas, acentos y composición Unicode (el bug "CAÑA" no encontrada).
- **Cantidad**: taps repetidos sobre un item acumulan (`qtyPending`, commit a los 1.5s en el PAD y 0,7 s en el TPV, `esperaCantidad`).
- **Aviso de añadido** (2026-10-17): al entrar un plato sale una pastilla "✓ 2× CAÑA" abajo a la derecha que se va sola (`avisarAnadido`, animación `avisoAnadido` en `index.css`, `pointer-events-none`). Reemplaza al check que tapaba el plato un segundo: con prisa no hay que esperar a nada para seguir tocando.
- **⚠️ Alergias de la mesa** (2026-10-20): botón junto al buscador de la carta (PAD y TPV), solo si algún plato de comida tiene alérgenos cargados. Hoja "Alguien es alérgico a…" con el catálogo de `/admin/alergenos`; con algo marcado, en los platos de **comida** (grupos que no son de barra) lo que choca sale tachado, apagado y con "🚫 🌾 Gluten" en rojo, y lo apto con "✓ Puede comer"; los contadores de las categorías pasan a "✓n" (cuántos puede comer). **No bloquea**: se puede pedir igual, para el resto de la mesa. Franja roja "🚫 Alérgico a: … · avisa a cocina" bajo el buscador. Se guarda **en la comanda** (`Comanda.alergenoIds Int[]`, vía `PATCH /comandas/:id/para-cocina`, en `CAMPOS_COMANDA` de `replica.ts`): lo ven todos los dispositivos y **sale solo en los tickets** — `imprimirTicketComanda` antepone `ALÉRGICO: GLUTEN, HUEVO` a la nota de mesa, así sale en la línea `COM:` de cocina y barra sin tocar el programa de la Box (decidido con Eze 2026-10-20: automático, mejor un aviso de más que uno de menos). El **orden de salida** (`OrdenarModal`) tiene el mismo ⚠️ en la cabecera, la línea roja "🚫 ALÉRGICO: …" bajo la mesa y "🚫 Lleva 🌾 Gluten" en cada plato que choca. Hook `useAlergiasMesa` + `AlergiasSheet` compartidos. Misma lógica que el filtro de las fichas de la Wiki (`FichasSeccion`).
- **Comentario por item (long-press)**: mantener apretado un plato (~450ms, con vibración) abre un box de comentario ("sin cebolla…"); al confirmar se añade el item con la `nota` puesta. Absorbe la cantidad pendiente de taps previos del mismo plato. Backend: `POST /comandas/:id/items` solo fusiona con un item pendiente existente si tiene **la misma nota** (notas distintas = filas separadas para cocina).

### Cambiar mesa / Merge (POST /api/comandas/merge)

Mueve items de una comanda (source) a otra (target):
- Si target es `facturada`: se crea una **nueva comanda** para esa mesa (preserva la facturada original en la cola del encargado). El source vacío queda como `liberada`.
- Si target no es facturada: los items se fusionan directamente.
- Items pendientes (`nivel=null`) con mismo nombre se suman en cantidad.
- Items ya enviados (`nivel!=null`) se crean como filas nuevas preservando nivel/ronda.

**Regla importante**: nunca usar una comanda `facturada` como SOURCE del merge (el botón "Cambiar mesa" está deshabilitado para comandas facturadas en SalaMesasPage).

### Modo encargado en /sala

Un empleado con `rol='encargado'` **o** `accesoEncargadoApp=true` ve la app de sala igual que un camarero + herramientas admin. `accesoEncargadoApp` es el "superpoder" temporal: se configura en **Editar empleado → sección "TPV"** (`/admin/empleados`, visible solo para tipo sala con rol ≠ encargado) — pensado para emergencias a mitad de turno. En la lista se ve con el badge **💼 TPV**. Es **independiente** de `puedeEncargado`, que es solo un concepto del auto-planning. El empleado debe re-logearse con su PIN para que el cambio surta efecto (el flag viaja en la sesión).

- **Login** (`SalaLoginPage`): la sesión `sessionStorage['oidoops_camarero']` guarda también `rol` y `accesoEncargadoApp`. `esEncargado` se deriva en `SalaMesasPage`.
- **Botón 💼 en el header** → `EncargadoPanel` (sheet lateral, tema sala) con varias tabs (fila con scroll horizontal, no todas caben en pantalla a la vez):
  - **💶 Cobros**: comandas `facturada`+`liberada` con items → botón "Cobrar mesa" abre el **`CobroSheet`**: mismo flujo que el dashboard (método de pago, importe recibido con **cambio** en efectivo, **propina** = exceso sobre el total con tarjeta) → `PATCH /comandas/:id/cerrar` con `propina`. El mismo sheet se usa desde el botón "💶 Cobrar mesa" del `ComandaPanel` (mesa facturada, solo encargado).
  - **⏱ Turno**: abrir turno (`POST /turnos` con su nombre) / cerrar con doble confirmación (aviso ámbar si hay mesas activas o cobros pendientes) → muestra resumen de totales al cerrar.
  - **✅ Checklists**: estado de hoy por sector (apertura/cierre, quién, hora, marcados/total) via `GET /checklists?restaurantId`.
  - **🗑 Mermas**: mermas del día con total € via `GET /mermas?desde=hoy&hasta=hoy`.
  - **📅 Reservas** (implementado 2026-09-14): sub-tabs "Hoy" / "🔄 Pool" — ver detalle completo en el pool de reservas dentro de **Módulo: Reservas**. Usa la identidad real del camarero logueado (`camarero.nombre`, sin pedir nombre a mano como en `/admin`) y sin diálogos nativos (`prompt`/`confirm`): el motivo al enviar al pool es un input inline, siguiendo la convención del resto de `/sala`.
  - **⭐ Reviews**: ver sección Google Reviews más abajo.
- **Pantalla "Turno no iniciado"**: si es encargado muestra botón "▶ Abrir turno" en vez del mensaje pasivo.
- **Cobro directo en `ComandaPanel`**: prop `esEncargado` — en mesas `facturada` aparecen botones "💶 Cobrar efectivo / 💳 Cobrar tarjeta" junto a "Mesa libre".
- **Backend endurecido**: `PATCH /comandas/:id/cerrar` ahora exige `metodoPago` (cash|tarjeta) y estado previo `facturada`|`liberada` (409 si no; antes no validaba nada).

### Información de la mesa para cocina: No comparten y nota (2026-10-15)

**Cabecera del `OrdenarModal`** (2026-10-17): título + 🔍 lupa (abre la búsqueda "Añadir algo más"; ya no hay campo fijo) + 🍷 copa + ✕ bien separada; debajo, "Mesa · cocina · barra" y a la derecha el interruptor **"No comparten"** con un plato y cubiertos en la bolita. Los niveles, tanto aquí como en la pestaña Comanda, salen **como en el ticket** (`components/NivelEtiqueta.tsx`: PRIMEROS, SEGUNDOS… o el nombre del bloque, ej. POSTRES, en un recuadro invertido sobre una línea fina). Cualquier camarero tiene: el interruptor **"No comparten"** (`Comanda.noComparten`, solo si hay platos de cocina) y la **nota para cocina de toda la mesa** (`Comanda.notaMesa`, máx. 200), que se escribe **manteniendo apretado "Oído"** como el comentario de un plato: toque corto = enviar; apretado (~450 ms, vibra) = recuadro de nota y "Oído con nota", que guarda la nota y después envía. Si la mesa ya tiene nota, se ve arriba del modal (📝) y tocarla abre el mismo recuadro. Los dos van por `PATCH /comandas/:id/para-cocina` y valen para esta comandada y las siguientes. La cabecera del `ComandaPanel` los muestra (etiqueta y 📝), sin botones. En papel salen **al final del ticket** como `COM: NO COMPARTEN · <nota>` (NO COMPARTEN solo en cocina; la nota en cocina y barra). Sin internet funcionan igual y suben al volver (`CAMPOS_COMANDA` en `replica.ts`).

**Diseño del ticket de cocina (de Eze, hecho en Canva, 2026-10-15)**: arriba un hueco en blanco para la pinza de las comandas (`MARGEN_PINZA_RENGLONES`) y una línea de puntos; cabecera en una sola imagen con la **mesa a la izquierda y el pax debajo** y **camarero (primer nombre), hora y fecha (más chica) a la derecha**. Sin la palabra "MESA" ni el nombre de la sala (pendiente de debatir si la sala hace falta con dos plantas). Los niveles van **en palabras** (PRIMEROS, SEGUNDOS… hasta DÉCIMOS), chicos, en blanco sobre un recuadro negro del ancho del texto, a la izquierda y apoyados en una línea fina, porque un número grande se confundía con la cantidad. Los **platos** son una imagen en negrita baja (`TAMANO_ITEM`, menos papel y cabezal que el doble alto de fábrica), con la cantidad en columna fija y la nota del plato (`»`) alineada con el nombre; los nombres largos se parten en renglones. Cada imagen tiene su respaldo en texto. `ejemplo_ticket.py <ip> [--no-comparten]` en la Box imprime una comanda de ejemplo.

**Categorías de bloque propio (ej. postres)**: `MenuCategoria.nombreEnTicket` — botón **🎫 Nombre en ticket** en el panel de la categoría en `/admin/menu` (solo categorías de nivel superior, en la vista donde se pueden editar: las globales en 🌐 Global; sus subcategorías lo heredan). Hace dos cosas: en el `OrdenarModal` sus platos sin comandar van **juntos en un solo nivel, el último** (detrás de todo lo demás de la mesa, uno por bloque; `conBloques` en `SalaMesasPage.tsx`, porque la sugerencia por categoría los repartía — el cheesecake caía como plato frío por "cheese"); y Un nivel cuyos platos son todos de esa categoría sale con su nombre (ej. **POSTRES**) en vez de CUARTOS, QUINTOS… (campo `seccion` de cada plato del ticket, lo calcula `imprimirTicketComanda`). La vista previa del admin no lo refleja.

**Pendiente al cierre del 2026-10-15**: ver el ticket nuevo impreso (la Box necesita `SIN_MODO_LOCAL=1 bash deploy/preparar-box.sh` y luego `ejemplo_ticket.py`), sobre todo el tamaño de la letra de los platos (`TAMANO_ITEM`); decidir con Eze si el ticket de cocina lleva el nombre de la sala (Sensi tiene dos plantas); el "Oído" del panel de la mesa (envío directo cuando solo hay bebidas) no tiene el gesto de la nota de mesa.

### Repartir propinas desde el teléfono (2026-10-18)

Pedido de Eze: el turno se cierra (mejor desde la tablet TPV), y el reparto de propinas lo hace el encargado **desde el teléfono**, también desde casa. Pestaña **💼 → 💰 Propinas** (`components/PropinasSala.tsx`, con aviso por cada turno sin repartir) y botón **"💰 Repartir propinas"** en el resumen del cierre. Mismo flujo que `PropinaTurnoModal` del admin: importes (la de tarjeta viene de `Turno.totalPropinas`) → **picar a quien trabajó y sus horas** (no se usa el planning: Sensi no lo carga; ±0,5 h, por defecto 8) → confirmar (a cada uno según sus horas). Se escribe igual en la hoja de Google y sale en "Mis propinas". Mientras se reparte, el panel esconde sus pestañas y pone de título "💰 Repartir propinas" (`onEnfoque` → `repartiendo`), y el botón "Ver reparto" queda fijo abajo: en el teléfono la rejilla de herramientas tapaba la lista y el teclado. Arriba de la pestaña, **🗓 Turnos / 👥 Por empleado**: la segunda lista cuánto lleva cada uno (horas, turnos, €) y el total repartido, **por período de la hoja (25 → 24)** con ‹ ›, **solo de este local** (`GET /propinas/encargado/resumen?desde&hasta`). Lista: turnos cerrados de los últimos 21 días, primero los sin repartir; un repartido se puede **corregir** (decidido con Eze). Rutas en `routes/propinas.ts`: `GET /propinas/encargado/turnos`, `GET /propinas/encargado/empleados` (solo id, nombre y tipo) y `PUT /propinas/encargado/turnos/:turnoId` (crea o corrige): solo turnos **cerrados del local de la sesión** (`req.user.restaurantId`); están en `SOLO_ENCARGADO` y en `CONSULTA_ENCARGADO` (valen fuera de la red del local). La lógica de crear/corregir es la misma del admin (`crearPropina` / `actualizarPropina`). ⚠️ En local la API escribe en la hoja de Google real si el `.env` la tiene: no guardar repartos de prueba.

### Pagar por separado (2026-10-23)

Pedido de Eze: mesas que quieren pagar cada uno lo suyo o dividir a partes iguales. **Cobrar sigue siendo solo del encargado**; el camarero, con la cuenta impresa (mesa en rojo), abre la mesa y toca **"✂️ Pagar por separado"** (`components/DividirCuenta.tsx`, `DividirCuentaSheet`). Dos modos: **⚖️ Por igual** (cuántos quedan por pagar → cuánto cada uno; los céntimos sueltos los paga el primero) y **🍽 Cada uno lo suyo** (picar platos de a una unidad; **÷** parte uno entre 2–6, ej. una botella entre 3; lo que se cobra por cabeza — `autoGenerado` con `cantidad === pax`: pan, menú de grupo — entra solo, uno por persona). "El resto, entre los que quedan" pasa a por igual con lo que falta. Cada pago: solo 💳/💶 (Eze: el camarero no escribe el importe del ticket, es un paso de más; la propina la pone el encargado al cotejar: en el `CobroSheet` escribe la suma de los tickets de tarjeta y la diferencia con lo pagado con tarjeta es propina). Se guarda en `Comanda.division` (Json: `{ quedan?, pagos: [{ id, importe, propina, metodo, consumo?, at, por? }] }`) con `PUT /comandas/:id/division` (en `RUTAS_SALA`, cualquier camarero; solo con la cuenta impresa; no deja pasarse del total): sigue donde quedó en cualquier dispositivo. El encargado, en la mesa, tiene un solo botón grande "💶 Cobrar mesa" con "✂️ 3 pagos · ✅ pagada" debajo (Mesa libre y Ver cuenta quedan chicos; el camarero ve lo de siempre); en el `CobroSheet`, "Tickets a cotejar" (`CotejoTickets`): cada pago es un ticket con su importe y, si uno de tarjeta dice más, se toca y se escribe lo que dice → la diferencia es propina (`propinaDeTickets`); "Cobrar mesa" no pide método: `PATCH /cerrar` lo saca de la división (`cierreDeDivision` en `apps/api/src/pago.ts`; 409 si falta o sobra algo). Una mesa con efectivo y tarjeta queda `metodoPago: 'mixto'` + `Comanda.pagoEfectivo`; todos los totales (cierre de turno, Pulso, panel TPV, `/admin/turnos`) reparten con `repartoPago` (API en `pago.ts`, web en `api.ts`) y las etiquetas con `textoPago`. Sin internet no está (el cobro tampoco). No imprime un ticket por persona.

### Corregir una mesa ya cobrada (2026-10-24)

Pedido de Eze: el encargado tiene que poder rectificar un cobro. En **💼 → 💶 Cobros** (teléfono), debajo de "Por cobrar", la lista **✅ Cobradas en este turno** (misma consulta que el panel del TPV: `GET /comandas?estado=cerrada&desde=<apertura>`). Al tocar una se abre `DetalleCobrada` (en `SalaMesasPage.tsx`, compartido con el TPV): platos, mermas, pago, correcciones previas y dos acciones:
- **💳 Cambiar forma de pago** (y propina): `PATCH /comandas/:id/rectificar-pago { metodoPago, propina, motivo? }`. La mesa sigue cobrada. No vale para mesas pagadas por separado o `mixto` (409): esas se deshacen.
- **↩ Deshacer el cobro**: `PATCH /comandas/:id/deshacer-cobro { motivo? }` → vuelve a `liberada` (por cobrar) sin pago ni `closedAt`, conserva la división; se corrige, se reimprime y se vuelve a cobrar.
- Motivo **opcional de un toque** (`error_cobro` | `cliente_reclamo` | `otro`). Solo encargado (`SOLO_ENCARGADO`), solo mesas del local de la sesión y **solo cobradas en el turno abierto** (al cerrar el turno se guardan sus totales).
- Cada corrección se apunta en `Comanda.rectificaciones` (Json: `[{ tipo: 'pago'|'deshacer', por, at, motivo?, antes, despues? }]`); la sala la muestra como "✏️ corregida".
- La lista de cobradas va **plegada** (barra con nº de mesas y total; en el TPV, 💶/💳).
- **Veri\*factu: factura al cobrar (2026-10-30, en modo pruebas; Eze decidió no esperar a la gestoría)**: al cobrar (`PATCH /cerrar`) `facturarCobro` en `comandas.ts` emite la **factura simplificada F2** en la tabla **`RegistroFactura`** (`src/verifactu.ts`, `emitirRegistro`): número correlativo por serie (`L1-000001`), huella SHA-256 encadenada a la anterior **del mismo NIF** con el formato oficial (comprobada con el ejemplo de la AEAT), fecha y hora con huso de Madrid, las líneas tal como se imprimen y un candado de Postgres por NIF (`pg_advisory_xact_lock`) para que dos cobros a la vez no bifurquen la cadena. Se imprime con QR tributario (URL de cotejo con nif, numserie, fecha, importe; nivel M, ~35 mm; leído con un lector de QR) por la ruta `cobro` si el diseño lo pide, y con efectivo o mixto se abre el cajón de la primera impresora de la ruta. Si se deshace el cobro y se vuelve a cobrar por otro importe, nace una **rectificativa R5 por diferencias** (`rectificaA`, importe negativo si se devolvió, «DEVUELTO EN» con el método del primer cobro) y su serie, número y huella quedan en la fila de `Rectificativa`; con el mismo importe vale la factura de antes. Sin NIF en Empresa no se emite nada; sin internet tampoco (el cobro no existe en modo local). Un fallo de la factura nunca deshace el cobro. **`EmpresaConfig.verifactuModo`** = `'pruebas'` (el QR apunta a `prewww2.aeat.es` y el ticket dice «MODO PRUEBAS · no se envía a la AEAT»); no hay botón para pasar a producción. **La tabla es solo de inserción** (sin relaciones que la borren en cascada). ⚠️ `sync-db.sh` la vaciaría y `prisma db push --accept-data-loss` podría tocarla: antes de producción real hacen falta migraciones para ella y sacarla de `sync-db.sh`. **Falta**: envío a la AEAT (SOAP, certificado de la empresa), declaración responsable, ver y reimprimir facturas desde la sala y el admin, anulaciones, una cadena por emisor si los locales tienen NIF distinto, e informe Z con primera y última huella.
- **Rectificativas (2026-10-24, decidido con Eze: la dinámica ya, lo fiscal cuando conteste la gestoría)**: deshacer el cobro guarda la cuenta como se cobró en `Comanda.cobroDeshecho` (items, total, pago, quién, motivo). Al volver a cobrar (`PATCH /cerrar`), si el importe cambió nace una fila de **`Rectificativa`** (por diferencias): `importeOriginal`, `importeNuevo`, `diferencia` (negativo = se devolvió), `devolucion` (método del cobro original), `lineas` (solo lo que cambió, por nombre+precio; una invitación cuenta como quitar el plato), `original`, quién deshizo y quién cobró, `turnoId`. Mismo importe = sin rectificativa. **Campos fiscales vacíos** (`serie`, `numero`, `facturaOriginal`, `huella`, `emitidaAt`): se rellenan cuando la app emita facturas (docs/verifactu.md, R5). El `CobroSheet` avisa "Cobro deshecho · se cobró antes X € · devolver Y € por tarjeta". Se ven en el detalle de la mesa cobrada (sala), en `/admin/turnos/:id` (por mesa y total) y en `Turno.totalRectificado` (cierre). El monitor `/admin/verifactu` (simulado) dibuja sus rectificativas con esta misma forma (motivo de un toque, líneas antes → después, devolución, quién deshizo y quién cobró). **Pendiente**: el informe Z; la numeración y la huella; conectar el monitor a la cadena real cuando exista.

### Platos agotados en el servicio (2026-10-15)

Cuando se acaba un plato a mitad del servicio, el encargado lo marca en **💼 → 🚫 Agotados** (buscar → "Sí, se acabó"). Tabla `ItemAgotado` (`restaurantId` + `menuItemId` únicos, `marcadoPor`): es **por local**, no toca `MenuItem.activo` (la carta es común a los cinco). Rutas en `routes/agotados.ts`: `GET /agotados?restaurantId`, `POST /agotados` y `DELETE /agotados/:menuItemId?restaurantId` (las dos últimas en `SOLO_ENCARGADO`). Efectos:
- **Impresoras**: sale un aviso `ALTO · <PLATO>` (y `HAY · <PLATO>` al reponerlo) en **todas las impresoras del local**, una vez por IP (`publicarAviso` en `mqtt.ts`; en el printer-server, `ticket.aviso` → `_construir_aviso`). Una Box con el programa anterior lo descarta sin imprimir.
- **Sala**: el plato sigue en su sitio pero apagado, tachado y con "AGOTADO", sin poder tocarlo (`PlatoAgotado` en `SalaMesasPage.tsx`; también en la búsqueda y en las mezclas de los combinados). Una línea **sin comandar** de ese plato muestra "⚠ Agotado — quítalo antes de comandar" (se compara por nombre). Llega al instante por SSE (`'agotados'`).
- **Cierre de turno**: se borran todos los del local (`turnos.ts`), así el turno siguiente arranca con toda la carta.
- **Sin internet**: la Box los copia (`replica.ts`) y la sala los sigue viendo apagados, pero no se pueden marcar ni reponer (el 💼 no está en modo local).

### Gastos del día — la libreta del encargado (2026-10-16)

Lo que se compra o recibe en el turno sin pedido formal: pan (efectivo, al momento), hielo (anotado, se paga después), frutería, agua del personal, velas de cumpleaños… Rutas en `routes/gastos.ts`.
- **`/admin/gastos`** (`GastosPage`, grupo Compras, "Gastos del día"): selector **🌐 Global / local** como la carta (`GastoHabitual.restaurantId`: null = sale en todos los locales, X = solo ese; en la vista de un local los globales se ven con 🌐 y se editan en Global). **Gastos habituales** (`GastoHabitual`: nombre, icono, unidad, precio opcional, forma de pago habitual `efectivo`|`cuenta`, orden ▲▼) con **tipos** opcionales (`GastoTipo`, ej. HIELO → PILE, CUBO, cada uno con precio opcional). Quitar uno con apuntes solo lo desactiva. Debajo: apuntes del mes por local, total por gasto, y lo **pendiente a cuenta** con "Pagar" (de la caja / transferencia u otra) y borrar.
- **Sala, 💼 → 🥖 Gastos** (`components/GastosSala.tsx`, solo encargado): botones con los habituales + **✏️ Otro** (texto libre, ej. VELAS). Cada apunte lleva **cantidad** (por tipo si los tiene), **importe** (se calcula solo si hay precio; se puede cambiar) y **💶 efectivo / 📒 a cuenta** (sale marcada la habitual). Lista "Pendiente de pagar" (cualquier día) con Pagar, y "Este turno" con "Salió de caja: X €" y ✕ para borrar un apunte equivocado (solo del turno y sin pagar; lo demás desde el admin).
- **`Gasto`** guarda copia del nombre y las líneas `[{ tipo, cantidad }]` (no ids de tipo: editar un habitual no cambia lo apuntado). Efectivo exige importe; a cuenta puede ir sin importe y se pone al pagar. `pagadoCon: 'efectivo'` = salió de la caja ese turno.
- **Cierre de turno**: `Turno.totalGastos` = apuntes en efectivo + deudas pagadas en efectivo durante el turno (`efectivoGastado`); el resumen del panel lo muestra como "🥖 Gastos en efectivo". Pensado para el informe Z.
- Sin internet no funciona (el 💼 no está en modo local). No abre el cajón todavía.

### Puesto TPV — tablet compartida del local (`/tpv`, 2026-10-17)

Para cuando fallan los PADs (pasa seguido): una tablet en cualquier sitio del local, usada sobre todo por encargados y a veces por camareros. **No es otra app**: es la misma sala (`SalaLoginPage tpv` y `SalaMesasPage tpv`), con los mismos permisos que da el PIN (camarero o encargado; el servidor ya los aplica) y sin internet funciona igual con la Box. Diferencias:
- **El PIN vale para una acción**: vuelve al PIN tras el **Oído**, tras un **cobro** (`TpvCtx` → `terminarTpv`, lo llama `CobroSheet`) o tras **60 s sin tocar la pantalla** (`TPV_INACTIVIDAD_MS`); lo que quedó sin mandar sigue en la mesa. Botón **SALIR** grande en la cabecera (y en "Turno no iniciado"). El PIN se puede **escribir con un teclado físico** (fila de números o numérico, ⌫ borra), en `/tpv` y en `/sala` (`SalaLoginPage`, escucha `keydown`). Pensado también para un **numérico Bluetooth junto a la tablet** (idea de Eze para ofrecer con el puesto): las teclas del numérico se leen por `e.code` (`Numpad0…9`), así entran aunque Bloq Num esté apagado.
- **Panel del encargado** (`PanelEncargadoTpv`, vista `'panel'`, idea de Eze 2026-10-17): con PIN de encargado el TPV abre aquí en vez del mapa (pestaña **📊 PANEL** en la cabecera; el camarero va al mapa). Arriba, cifras: turno desde, mesas abiertas, por cobrar (n · €), en mesas ahora (€) y mermas de hoy. Debajo, todas las mesas en tarjetas por urgencia: **Por cobrar** (facturadas + liberadas, con botón 💶 Cobrar o 🧾 Reimprimir si la cuenta cambió), **En servicio** (algo ya comandado, la que más lleva arriba) y **Abiertas sin comandar**; cada tarjeta con pax, camarero, hora de apertura y de 1ª comanda, tiempo, total y avisos (cuenta impresa, cuenta cambió, sin comandar, mermas, 🎁, no comparten). A la derecha, accesos a cada pestaña del 💼 (`EncargadoPanel tabInicial`). Las tarjetas llevan **las esquinas casi rectas y los mismos colores que la mesa en el mapa** (`coloresMesa()`, **semáforo** desde el 2026-10-21: libre/cobrada verde, comandada ámbar, cuenta impresa rojo; abierta sin comandar verde agua sobre azul; borde rojo si la cuenta cambió). Al final, **✅ Cobradas en este turno** (de la más reciente a la más antigua, con hora, 💶/💳 y propina; al tocar una, su detalle en solo lectura: platos, mermas, total y pago), y arriba la cifra **Cobrado** (solo de este local). Salen de `GET /comandas?estado=cerrada&desde=<apertura del turno>`: el parámetro `desde` filtra por `closedAt` (sin él, estado=cerrada trae toda la historia). No se usa `/turnos/activos/stats` porque enseña todos los locales. **El encargado no vuelve al PIN al cobrar** (encadena cobros): `TpvCtx` solo actúa con camareros; sí vuelve tras el Oído, con SALIR o al minuto.
- **Abrir mesa tecleando** (idea de Eze para el numérico Bluetooth, 2026-10-17): con alguien logueado en el TPV y ninguna ventana abierta (ni el foco en un campo), se teclea el **número de mesa** y Enter (no hay tecla previa: nada se abre hasta el Enter, así 1/10/101 no se confunden). Ocupada → se abre; libre → pide los **PAX** y Enter → abre la mesa; inexistente → "La mesa X no existe". ⌫ borra, Esc cancela. Lo tecleado se ve en un **visor tipo display de caja** abajo en el centro (dígitos verdes encendidos, JetBrains Mono). Estado `atajo` / `teclaAtajo` en `SalaMesasPage`; lee el numérico por `e.code` (vale con Bloq Num apagado) y `NumpadEnter`. Para **salir de la mesa**: **Bloq Num** (en Mac "Clear") o **Esc**, como la ✕ (con platos sin comandar pregunta Descartar / Comandar; con otra ventana abierta dentro de la mesa no hace nada; si está el teclado de búsqueda, primero lo cierra) — `teclaSalir` en `ComandaPanel`, solo con `ancho`.
- **Mesa en dos columnas** (`ComandaPanel ancho`): la carta a la izquierda y la mesa a la derecha con su cabecera y el Oído, sin pestañas ni gestos de deslizar. Rejilla CSS del panel; el contenido usa `contents` para que cada columna sea una celda.
- **Carta tipo TPV** (`cartaTpv` / `tileTpv` en `ComandaPanel`, pedido de Eze: "aprovechar el formato tablet"): sin entrar y salir de niveles. Arriba, los grupos (BEBIDAS / COMIDA) y las categorías del grupo como pestañas fijas; abajo, los platos en **cuadrados grandes** (nombre en mayúsculas centrado con la descripción debajo, precio abajo; ámbar si es de barra; con una palabra de 10+ letras la letra baja para no partirla). Una categoría con subcategorías las muestra todas seguidas con su título (VINOS BOTELLA → TINTO, BLANCO…). Mismos gestos que el PAD: toques que suman cantidad, mantener = nota, combinados, agotados tachados. Buscador grande arriba.
- **Niveles en vivo**: en la columna de la mesa, los platos sin comandar se ven ya agrupados en PRIMEROS, SEGUNDOS… mientras se pican (dentro de "Marcha pasa" si la mesa ya tenía comandas). Es la misma propuesta que abre el Oído: `nivelesPropuestos()` (nivel sugerido por categoría + bloques tipo POSTRES al final), compartida con `OrdenarModal`. Se ajustan ahí mismo con **▲▼ por plato y por nivel** (`ajusteNiveles` / `moverNivelTpv`, solo en pantalla hasta mandar) y el Oído abre el orden de salida con esos niveles ya puestos (`OrdenarModal nivelesIniciales`), donde siguen "No comparten" y la nota para cocina. En una mesa sin nada comandado los niveles quedan seguidos desde PRIMEROS (antes podía empezar en SEGUNDOS), también en el PAD.
- **Teclado propio para buscar** (`TecladoTpv`, opción elegida por Eze frente al del sistema, que tapaba media tablet): al tocar el buscador (`inputMode="none"`: no sale el del sistema; uno físico sí escribe) ocupa **el 45 % de la columna de la carta (encima caben dos filas de resultados sin desplazar), con teclas grandes que se estiran a lo ancho y a lo alto** (pedido de Eze: "debe ser GRANDE"; mientras está abierto se esconden las pestañas de categorías) con números, QWERTY con Ñ, ⌫, espacio, "Borrar todo" y "Cerrar" (cierra y limpia). Los resultados salen en cuadrados encima, con el número de resultados; la búsqueda no se borra al añadir, para tocar varias veces.
- **Menú de grupo a pantalla completa** (`MenuGrupoTpv`, recibe el estado de `MenuGrupoSheet ancho`): arriba, nombre, "Cambiar menú", 🍰 con/sin postre y la barra de presupuesto grande; paso 1, las plantillas en tarjetas grandes; paso 2, los cursos a la izquierda (filas con − / + de 48 px) y la carta de comida a la derecha (pestañas por categoría, buscador con el `TecladoTpv`). Tocar un curso lo marca como destino ("← aquí entra lo de la carta") y cada plato tocado en la carta se suma a ese curso (`anadirACurso`: si ya está, una ración más).
- App instalable aparte: `manifest-tpv.json` (horizontal), `icon-tpv.svg` ("T"), título "OidoOps TPV" (script de `index.html`). Sin restaurante elegido va a `/sala/setup?volver=/tpv`. Un 401 devuelve a `/tpv` (`api.ts`). Está en `/admin/accesos`.
- **Entrar sin PIN** (hablado el 2026-10-17, aparcado por Eze "quizás en otro momento"): huella descartada (el sensor de la tablet no dice *quién* es, y un lector propio guarda datos biométricos, art. 9 RGPD, la AEPD ya multó por fichar con huella); la opción buena es un **llavero NFC** por empleado con un lector USB que actúa como teclado (sin programa extra): campo "Llavero" en la ficha y que la pantalla de entrada lo acepte, con el PIN como respaldo.
- Decidido con Eze: nada de teclado numérico tipo BDP ("2 + Mesa"); se usa lo táctil de la sala. **Pendiente**: el cajón no se abre al cobrar en efectivo (kit de impresión); el ticket de cocina sale con el camarero que abrió la mesa, no con el que comandó desde la tablet.

### Dashboard encargado (MesasFeedPage)

- Vista en tiempo real (SSE) de todas las mesas
- Una mesa con **múltiples comandas activas** (ej: facturada original + nueva enviada tras traslado) genera **múltiples cards** en el feed
- Sección "Pendiente de cobro" muestra comandas `liberada` con items (filtra las vacías)
- El encargado cobra desde aquí (efectivo/tarjeta) → comanda pasa a `cerrada`

### Mermas

Registrar items no servidos o con queja. Motivos: `no_servido`, `queja_cliente`, `otro`.
Una merma se puede restituir (deshacer) desde el panel de detalle de comanda del admin **y desde la app de sala**: sección "🗑 Mermas" al final de la pestaña Pedido del `ComandaPanel`, con botón "↩ Deshacer" por merma (`DELETE /mermas/:id` — el item vuelve a la comanda y se cobra normal; si la cuenta estaba impresa, marca `cuentaDesactualizada`).

### Ver la cuenta antes de entregarla (2026-10-24)

`VerCuentaModal` (lo abre "Imprimir cuenta"): platos en filas grandes, **🗑 merma** en cada línea (abre el `MermaModal` de siempre, que va encima: se monta después) y **"＋ Añadir algo que faltó"** — buscador en la carta que suma 1 con `directo: true` (ya servido: se cobra y no sale por cocina ni barra), para cualquier camarero. Un combinable entra solo, sin refresco. Si la cuenta ya estaba impresa, el cambio marca `cuentaDesactualizada` como cualquier otro.

### Cuenta desactualizada (reimprimir antes de cobrar)

`Comanda.cuentaDesactualizada Boolean` — se enciende **en el backend** cuando cambian los items de una comanda `facturada`/`liberada` (merma → PATCH/DELETE item, invitación, restituir merma) y se apaga al volver a facturar (`PATCH /comandas/:id/facturar`). Mientras está encendido: `PATCH /comandas/:id/cerrar` devuelve 409, y en la UI el botón "Cobrar mesa" se reemplaza por **"🧾 Reimprimir cuenta"** (en `ComandaPanel` abre `VerCuentaModal` → "Entregar cuenta" re-factura; en la card de Cobros del panel 💼 abre la mesa) + aviso rojo "⚠️ La cuenta cambió después de imprimirse". Tras reimprimir, "Cobrar mesa" reaparece.

### Invitaciones de la casa

`ComandaItem.invitacion Boolean` + `invitadoPor String?` + `invitacionMotivo String?`. Solo el **encargado** puede marcarla: opción ámbar **"🎁 Invitación de la casa"** dentro del **`MermaModal`** (el desplegable ▼ de cada item; la opción solo aparece si `esEncargado`). Al seleccionarla aparece un input opcional "¿Por qué se invita?" y el botón de confirmación ámbar. Aplica a la línea entera y registra quién + motivo (visible en el `ItemRow`). Para quitarla: mismo modal (acción directa "Quitar invitación") o el 🎁 del `ItemRow`.

### Item directo / "sin cocina" (encargado)

`POST /comandas/:id/items` acepta `directo: true` → crea el item con `autoGenerado: true, nivel: 1, ronda: 1` **sin tocar el estado de la comanda**: se cobra normalmente pero nunca pasa por el flujo de envío (no imprime en cocina/barra, no aparece en OrdenarModal, no dispara "Oído"). Si la comanda estaba facturada/liberada, marca `cuentaDesactualizada`. UI: toggle **"🔇 sin cocina"** junto al buscador del menú en `ComandaPanel` (solo encargado) — mientras está ON, todo item añadido (tap, cantidad, combinados) entra directo; la barra se tiñe ámbar con aviso. Los items directos muestran el badge "🔇 sin cocina" en el `ItemRow` (igual que los autoPorPax, que comparten el flag `autoGenerado`). El item **queda visible en la cuenta a 0 €** con precio original tachado y badge "🎁 Invitación" — no desaparece (a diferencia de la merma). **No suma a ventas**: helpers compartidos `valorItem`/`totalComanda` en `apps/web/src/api.ts` (usados en todas las vistas) y exclusión server-side en los totales de turno (`turnos.ts` cierre + stats). El cierre de turno guarda `Turno.totalInvitaciones` y el resumen del panel encargado lo muestra. `PATCH /comandas/:id/items/:itemId` acepta `{ invitacion, invitadoPor }`.

### Propinas

Sistema de reparto de propinas por turno. Registro de efectivo + tarjeta del día, con horas trabajadas por empleado. El reparto es proporcional a las horas.

**Google Sheets (`apps/api/src/sheets.ts`)**: al guardar una propina se escribe en una hoja mensual (período 25→24). Estructura:
- **2 filas por empleado**: row1 = nombre + datos restaurante 1, row2 = datos restaurante 2 (si trabajó en dos sitios el mismo día)
- **Col A mergeada** entre ambas filas con el nombre del empleado (font 12 bold, centrado verticalmente)
- **Orden alfabético**: los empleados nuevos se insertan en su posición alfabética correcta usando `insertDimension` (no al final). Se procesan en orden alfabético para que los índices sean siempre correctos
- **Bordes**: `SOLID_MEDIUM` en la parte superior de cada bloque de empleado (separa grupos), línea `DASHED` entre row1 y row2 (separa los dos restaurantes)
- **Totales**: fórmulas que suman row1 + row2 de cada empleado para horas y propinas
- **Padding fix**: la API de Sheets omite filas vacías al final — se padea `nameRows` a longitud par para evitar que el row2 placeholder del último empleado se pierda
- `clearRemovedTurnosFromSheet`: al modificar una propina, borra solo la fila del restaurante correspondiente (no ambas filas del empleado)

### Google Reviews

Sistema de monitoreo automático por restaurante, con activación individual (`Restaurant.reviewsCheckActivo Boolean`) — hoy solo **Sensi Tapas** lo tiene prendido; el resto se activa con un checkbox, sin tocar código. Se apaga por defecto para restaurantes nuevos.

**Cron horario** (`44 * * * *` en el VPS, `POST /reviews/sync` con `Authorization: Bearer $SYNC_SECRET`): corre cada hora, no una vez al día — pensado así específicamente para no perderse reviews negativas si entran varias entre chequeos (ver más abajo). Solo procesa restaurantes con `reviewsCheckActivo=true`. Por restaurante:
1. Guardia anti-doble-disparo: si ya hay un snapshot de los últimos 50 min, lo saltea.
2. Pide a Google `rating`, `user_ratings_total` y **`reviews`** (hasta 5, `reviews_sort=newest` — límite duro de la API, no se puede pedir más ni paginar).
3. Compara esas reviews contra el snapshot anterior por `time` (timestamp) para detectar cuáles son **nuevas desde el último chequeo**. De esas, las que tengan `rating <= 3` se guardan en `negativasNuevas` (Json en `ReviewSnapshot`) — dispara alerta roja en la UI con estrellas + autor + texto.
4. Si el total subió más de lo que se pudo identificar en detalle (entraron más de 5 nuevas entre chequeos), marca `posibleOculta: true` → aviso ámbar "revisá Google Maps directamente".
5. Guarda todo en un nuevo `ReviewSnapshot` (`total`, `rating`, `reviewsData` — las hasta-5 crudas —, `negativasNuevas`, `posibleOculta`).

**Ventana de negocio "17:44 → 17:44"** (no confundir con día calendario): el contador de "reviews nuevas" y el `ratingDiff` (⚠️ si bajó el rating) se calculan contra el **primer snapshot dentro de esa ventana** (`inicioVentanaMadrid()`, anclada a Europe/Madrid explícitamente vía `Intl.DateTimeFormat` — no usar `Date.setHours` a secas, depende del huso del proceso). Mientras la ventana de hoy sigue abierta (no llegaron las 17:44 todavía), el número es **parcial, no el total final del día** — importante para no confundir con un conteo manual hecho mirando Google Maps por fecha/hora relativa, que no respeta ese mismo corte. `GET /reviews` devuelve `ventanaInicio` (fecha real del inicio, para mostrar "desde tal hora" en vez de asumir "hoy").

**Gotcha real detectado en producción**: el `total` de Google (`user_ratings_total`) es la fuente de verdad para el diff — verificado en vivo que coincide siempre con lo guardado. Si un conteo manual en la app de Maps del celular da un número mayor al de acá, sospechar primero de **reviews editadas** (Google las resurfacea con fecha reciente en la lista visual sin sumar al total, porque no son nuevas) antes de asumir un bug.

**Endpoints** (`apps/api/src/routes/reviews.ts`):
- `GET /reviews` — snapshot actual por restaurante + `activo`, `diff`, `ratingDiff`, `ventanaInicio`, `negativasNuevas`, `posibleOculta`, objetivo mensual (`totalMes`/`objetivoDinamico` = `floor(paxMes/tasa)`)
- `GET /reviews/historial?restaurantId=X` — reviews ganadas por día de negocio (ventana 17:44→17:44), acotado a ~30 días, excluye la ventana en curso (esa ya se ve como contador en vivo)
- `GET /reviews/turno?restaurantId=X&desde=ISO` — progreso del objetivo **durante el turno abierto**: pax cerrados y reviews nuevas desde `turno.aperturaAt` (no desde las 17:44 — el turno puede abrir más tarde), misma tasa que el objetivo mensual. Usado por la barra "Cómo va el turno" en el panel de sala.
- `PATCH /reviews/activo` — toggle `reviewsCheckActivo` por restaurante
- `PATCH /reviews/objetivo` — tasa de objetivo (`reviewObjetivoTasa Int?`, 1 review cada X pax)
- `POST /reviews/sync` — el cron

**Frontend**: sin botón manual, todo pasivo/automático — el widget del dashboard admin (`⭐ Google Reviews`) y la pestaña **⭐ Reviews** del panel encargado en `/sala` (💼 → Reviews) muestran: contador grande de reviews nuevas de la ventana en curso + hora de última consulta, tarjetas rojas de negativas nuevas, aviso ámbar de posible oculta, barra "Cómo va el turno", e historial de días anteriores (solo en `/sala`). El dashboard admin además tiene el checkbox de activar/desactivar por restaurante.

**Prisma db push**: en local usar `npx prisma db push` (no `migrate dev`) ya que las migraciones tienen conflictos con la shadow DB.

### Turnos

Gestionados desde `/admin/turnos`. Cada turno tiene estado `abierto` o `cerrado`. Al cerrar se calculan totales (efectivo, tarjeta, ventas, mermas, propinas, nº comandas).

- `TurnosPage`: lista de turnos con historial, borrado con doble confirmación, y modal `PropinaTurnoModal` para registrar/modificar propinas del turno
- `TurnoDetallePage` (`/admin/turnos/:id`): todas las comandas cerradas del turno agrupadas por mesa, con items, mermas y método de pago
- **Propinas vinculadas a turno**: `PropinaDia.turnoId` es `@unique` — un turno solo puede tener una propina. El modal usa búsqueda por nombre (autocomplete) para seleccionar empleados. Al modificar, reescribe Google Sheets y limpia empleados eliminados con `clearRemovedTurnosFromSheet`.

**Endpoints extra**:
- `GET /turnos/activos` — todos los turnos abiertos con `restaurant` incluido (widget TurnosWidget)
- `GET /turnos/activos/stats` — facturación en vivo por restaurante: suma de comandas cerradas desde apertura del turno (`totalEfectivo`, `totalTarjeta`, `totalVentas`, `numComandas`). Incluye restaurantes sin turno activo (con ceros).

### Modo visual camarero (SalaMesasPage)

Toggle claro/oscuro persistido en `localStorage('sala_theme')`. El tema se aplica mediante `data-sala-theme="dark|light"` en el div raíz, con CSS custom properties definidas en `index.css` (`--sala-bg`, `--sala-hdr`, `--sala-srf`, `--sala-txt`, etc.). `ThemeCtx` context pasa `isDark` a componentes hijos como `MesaBtn`. El toggle es un pill SVG luna/sol en el header del camarero.

### Compatibilidad con tablets no-Android-estándar (SUNMI)

El personal usa además de teléfonos personales unos PADs de marca **SUNMI** (sin impresora integrada) para la app de sala — pantalla y densidad distintas a un teléfono, dos ajustes hechos para eso:

- **Swipe relativo a pantalla, no en px fijos**: `swipeThresholds()` (helper a nivel de módulo en `SalaMesasPage.tsx`) calcula el umbral horizontal como 12% del ancho de pantalla (mínimo 60px) y el vertical como 8% del alto (mínimo 50px), en vez de valores fijos (antes `80`/`90`/`70` px). Usado en los 4 puntos de swipe: cerrar `OrdenarModal`, progresión Pedido→Carta→Mapa, y navegación entre niveles de la carta.
- **Escalado de tamaño por ancho de viewport**: en `index.css`, `[data-sala-theme] { font-size: ... }` con media queries en 700px/1400px que achican la base (16px → 13px → 11px). Como casi todo el sizing de Tailwind (`text-*`, `w-*`, `h-*`, `p-*`, `gap-*`) es `rem`, esto reescala toda la app de sala en cascada sin tocar cada componente. Escopeado solo a `[data-sala-theme]` — no afecta `/admin` ni `/pulso`. **Valores provisorios**: no se conoce todavía la resolución/PPI exacta del SUNMI — pendiente afinar los breakpoints con el dato real (`Ajustes → Pantalla` del dispositivo). Nota conceptual: esto corrige el ancho de viewport, pero no puede corregir solo una mala calibración de densidad (DPR) del panel — si el SUNMI no tiene el DPR bien calibrado, hace falta el PPI real (pulgadas + resolución) para un ajuste fino adicional.

---

## Dashboard Admin (`/admin` — AdminHomePage)

Página de inicio tras el login. Animación de entrada: viñeta grande aparece con spring → encoge → viñeta pequeña queda como acento sobre la "ı" de "OıdoOps" → tagline → widgets.

### Widgets

**TurnosWidget** — turnos activos en este momento, con nombre del encargado y tiempo transcurrido. Polling 30s.

**ReviewsWidget** — rating + total + diferencial diario por restaurante. Alerta ⚠️ si rating bajó. Barra de progreso mensual si hay tasa configurada. Ruedita ⚙️ abre modal para configurar `1 review cada X pax` por restaurante. Polling 60s.

**FacturacionWidget** — facturación en vivo del día por restaurante (ocupa 2 columnas). Muestra total global en el header. Por restaurante: total €, desglose efectivo/tarjeta, nº comandas. Restaurantes sin turno activo aparecen en gris. Polling 30s.

---

## Módulo: Menú

Gestionado desde `/admin/menu`. Selector de restaurante en la parte superior.

### Scope global / restaurante

`MenuCategoria` y `MenuItem` tienen `restaurantId Int?`:
- `null` = **global** (visible en todos los restaurantes)
- `X` = **específico** de un restaurante

En vista de restaurante se muestran globales + específicos del restaurante. Los items/categorías globales son de solo lectura desde la vista de restaurante.

### Operaciones de migración
- **Migrar a Global** (`POST /menu/migrar-a-global`): mueve todas las categorías e items de un restaurante a `restaurantId = null`. Si ya existe un global con el mismo nombre, elimina el duplicado del restaurante.
- **Mover item a restaurante** (`PATCH /menu/:id/mover-restaurante`): mueve un item global a un restaurante específico. Si ya existe una categoría global con ese nombre, el item convive bajo ella (no crea categoría específica).

### Deduplicación automática de categorías

`GET /menu/categorias?restaurantId=X` detecta y elimina silenciosamente las categorías específicas del restaurante que tienen el mismo nombre que una categoría global (evita duplicados visuales). Antes de borrar un duplicado, sus subcategorías vuelven al nivel superior (evita violación de FK).

### Jerarquía: Sección → Categoría → Subcategoría

- **Sección** = campo `grupo String` de MenuCategoria (ej: "Comida", "Bebidas"). Es el nivel 1 de la app del camarero. En el admin se elige con **pills de secciones existentes** + input libre (evita duplicados por mayúsculas).
- **Subcategoría** = `parentId Int?` en MenuCategoria (self-relation `SubCategorias`). **Solo 1 nivel** de anidado (una subcategoría no puede contener otras). Al anidar, la hija **hereda el `grupo` del padre** (mantiene el ruteo barra/cocina).
- ⚠️ `MenuItem.categoria` es un **string** (nombre de la categoría), no una FK. Cualquier rename/merge de categorías debe actualizar los items por nombre — ver siguiente punto.

### Renombrar categoría (PUT /menu/categorias/:id)

Al cambiar `nombre`, actualiza los items que apuntaban al nombre viejo. Si la categoría es **global**, actualiza también los items específicos de restaurante que conviven bajo ella (si no, quedan huérfanos e invisibles — bug histórico ya corregido).

### Navegación acordeón en el admin (MenuPage)

Las categorías se listan en **una columna** con chevron ▶. Clic en una card **despliega su contenido inline debajo** (el `CategoriaPanel` con items, toolbar y chips de subcategorías); segundo clic (o ✕) colapsa. Las subcategorías anidadas también se expanden con su propio panel. Solo hay una categoría expandida a la vez (`catSeleccionada`). No existe más el panel fijo arriba de la página.

### Drag & drop en el admin (MenuPage)

- **Item → card de categoría**: mueve el item a esa categoría (`PUT /menu/:id` con `categoria`). DataTransfer type `application/x-menu-item`.
- **Categoría → card de categoría**: la anida como subcategoría (con confirm; nada se borra). DataTransfer type `application/x-menu-cat`.
- **Chips de drop en el panel de items** (`SubDropChip`): al abrir una categoría padre, aparecen chips punteados de sus subcategorías para arrastrarle items sin cerrar el panel. Al abrir una subcategoría, los chips son el padre + las hermanas (reorganización en ambos sentidos).
- Solo lectura (globales en vista restaurante) no se puede arrastrar.

### Categorías
- **Orden**: cada categoría tiene campo `orden`. Botones ▲▼ en la card para reordenar dentro del mismo `grupo` (intercambia valores `orden` con la categoría adyacente via dos `PUT /menu/categorias/:id`).
- **Orden alfabético opcional**: `MenuCategoria.ordenAlfabetico Boolean` — toggle **A→Z** en el header del `CategoriaPanel`. Activado = los items se muestran A→Z (admin y app camarero, `localeCompare 'es'`); apagado = orden manual `orden asc, nombre asc` (carta física). Se preserva al copiar la categoría.
- **Subcategorías**: botón **"+ Sub"** en la card crea una subcategoría dentro (`POST /menu/categorias` con `parentId`; el form oculta la sección porque se hereda). El mismo botón está también en el **header del `CategoriaPanel`** (categoría abierta), junto a "+ Añadir item" — solo para categorías de nivel superior y no de solo lectura. Botón **"↖ Sacar"** en la card hija la devuelve al nivel superior. `POST /menu/categorias/:id/anidar` con `{ parentId: number | null }` hace ambas cosas (valida: no a sí misma, no >1 nivel, no anidar una que tiene hijas).
- **Copiar categoría** (`POST /menu/categorias/:id/copiar`): copia una categoría (con o sin sus items) a uno o varios restaurantes. Omite items duplicados por nombre.
- **Eliminar**: borrado en cascada — elimina todos los items del mismo scope primero, luego la categoría. Las subcategorías NO se borran: vuelven al nivel superior.

### Items
- **📁 Mover** (botón por item en el panel de categoría): abre `MoverACategoriaModal` con el árbol de categorías (secciones + subcategorías indentadas, estilo "mover a carpeta") — tocar el destino hace `PUT /menu/:id` con `categoria`. Es la alternativa táctil al drag & drop (que no funciona en tablets). El botón del item global "Mover" (a restaurante) se renombró a "→ Rest." para no confundir.
- **Copiar item** (`POST /menu/items/:id/copiar`): copia un item a un restaurante + categoría destino.
- **Mover item** (`PATCH /menu/:id/mover-restaurante`): desde vista Global, mueve un item global a un restaurante específico.
- **Hacer específico** (botón "→ Específico"): desde vista restaurante, convierte un item global en específico del restaurante actual.
- **Toggle activo** (`PATCH /menu/:id/toggle`): activa/desactiva un item.
- **Toggle autoPorPax** (`PATCH /menu/:id/toggleAutoPorPax`): marca si el item se cobra automáticamente por comensal.
- **Oculto en carta**: `MenuItem.ocultoEnCarta Boolean` — botón "carta" en la fila del item (badge 🙈). El item sigue activo (se cobra y se auto-añade con ×pax, ej. Servicio de pan) pero NO aparece en el picker del camarero: ni en la navegación por niveles, ni en las búsquedas, ni en los contadores de tiles. Distinto de "Ocultar" (`activo=false`), que desactiva el item por completo. Se preserva al copiar.
- **Ficha de estudio**: `MenuItem.ficha String` (2026-10-09) — texto largo para que el personal estudie la carta (uvas, crianza, notas de cata, puntuaciones). Distinto de `descripcion`, que es la línea corta que **sí** se ve en el picker de sala (ej. "D.O. Priorat"). La ficha **no** se muestra al tomar el pedido, ni viaja a comandas ni tickets; se edita en el `ItemForm` (textarea) y se ve en la fila del item del admin con 📖. Se preserva al copiar. Cargada en inglés para las 36 botellas de **VINOS BOTELLA** (categoría global con subcategorías TINTO/BLANCO/ROSADO BOTELLA y CAVA & CHAMPAGNE). El camarero las lee en la Wiki de sala (ver **Módulo: Wiki → Fichas de la carta**). **Pendiente**: un quiz para estudiar.
- **Alérgenos** (rehecho 2026-10-09 — ya **no** es bitmask): tabla `Alergeno` (`nombre` único, `nombreEn`, `icono`, `orden`) con relación muchos-a-muchos implícita a `MenuItem` + `MenuItem.alergenosNota String` para matices ("gluten in the sauce", trazas, "previously frozen"). El catálogo es común a todos los restaurantes y **editable** (añadir/renombrar/quitar) — arranca con los 14 de la UE (Reglamento 1169/2011), cargados por script, no por seed automático. Hacia el cliente el item viaja con **`alergenoIds: number[]`** (helper `serializarItem` en `menu.ts`; `PUT /menu/:id` acepta `alergenoIds` y hace `set`). Rutas del catálogo en `routes/alergenos.ts`: `GET /alergenos` (con `_count.items`), `POST`, `PUT /:id`, `DELETE /:id` (se desmarca solo de los platos). Componentes compartidos del admin en `components/Alergenos.tsx` (`useAlergenos`, `AlergenosPicker`, `AlergenosBadges`, `AlergenosInline` — usados por `MenuPage` y `GrupoMenuPage`). Se preservan al copiar items/categorías.
  - **`/admin/alergenos`** (`AlergenosPage.tsx`, grupo "Carta"): matriz platos × alérgenos (un toque marca/desmarca, optimista) + columna de nota, por restaurante y sección del menú; los globales se editan desde ahí con aviso 🌐. Debajo, el catálogo.
  - **Sala (Wiki → fichas)**: cada ficha muestra sus alérgenos y la nota; botón **"⚠️ Alergias"** junto al buscador → "El cliente es alérgico a…" (multi-selección) → la sección entera se parte en "✅ Puede comer" / "🚫 No puede" con el alérgeno que choca en rojo. El filtro **solo aparece si la sección tiene algún alérgeno cargado** (si no, "sin marcar" se leería como apto — ej. vinos y sulfitos). Lleva fijo el aviso de cocina compartida/trazas.
  - **Datos**: cargados para la carta de comida de Sensi Tapas desde la hoja de alérgenos del restaurante (2026-10-09). Las **trazas** (RAVIOLES) se marcan como si el plato las llevara + aclaración en la nota (opción segura). Un plato sin nada marcado no distingue "no lleva" de "sin revisar". **Pendiente confirmar con cocina**: la hoja no marca pescado en TOST. ANCHOAS ni soja en TARTAR DE ATÙN. Faltan los postres (no existen en el menú; la hoja trae sus alérgenos pero no hay precios).

### Combinados (destilado + refresco)

Modelo **pool global de mixers** con **precio combinado fijo**. Campos en `MenuItem`:
- `combinable Boolean` — el item se puede pedir combinado (destilados). Toggle rápido **COMB** en la fila del item (al activar pide el precio con `prompt`; vacío = usar precio normal).
- `precioCombinado Float?` — precio del combinado con refresco incluido (`null` = fallback a `precio`).
- `esMixer Boolean` — el item sirve de mezcla (refrescos, tónicas). Toggle rápido **MIX**.
- `suplementoMixer Float` — extra si el mixer es premium (ej. Red Bull +1,50). Default 0.

Los 4 campos también se editan en el `ItemForm` (sección "Combinados") y se preservan al copiar items/categorías. Badges en el admin: 🥃 precio combinado (púrpura) y 🥤 mix +supl (esmeralda).

**App camarero**: tocar un item `combinable` NO acumula cantidad — abre un picker bottom-sheet ("🥃 Combinado") con la opción **Solo · sin mezclar** (precio normal) + todos los items `esMixer` activos del menú con el precio resultante (`precioCombinado ?? precio` + `suplementoMixer`). Al elegir, añade **un solo renglón** a la comanda: `"Vodka Absolut + Coca-Cola"` con el precio del combinado y el `tipo` (barra/cocina) del destilado. Los tiles combinables muestran el hint `🥤+`. El long-press (comentario) sigue añadiendo el item solo. No hubo cambios de backend en comandas (los items viajan con nombre/precio libres).

### Asistente de vinos 🍷 (maridajes, 2026-10-16)

Primera función de la app que usa la **API de Anthropic** (`ANTHROPIC_API_KEY` en el `.env` de la API; modelo `ANTHROPIC_MODEL`, por defecto `claude-sonnet-5-5`). Claude **no** se llama desde la sala: calcula una vez y la sala solo cruza lo guardado (instantáneo y sin internet; `maridaje` y `perfilVino` van en `replica.ts`).

- **Se conecta desde el menú** (2026-10-16): `MenuCategoria.asistente` (`'vinos'`; `''` = ninguno; `null` = nunca tocado). Selector "Asistente de sala" al crear o editar una categoría de primer nivel y en el panel de la categoría en `/admin/menu` (sus subcategorías lo heredan). La lista de asistentes es `ASISTENTES` en `MenuPage.tsx`: un asistente nuevo se suma ahí y en el `z.enum` de `menu.ts`. Al arrancar, `conectarComoAntes()` conecta la categoría de los vinos ya perfilados si ninguna categoría tiene `asistente` (así Sensi quedó con VINOS BOTELLA); deja de actuar en cuanto se toca el selector. Los vinos de la casa por copa no se recomiendan (decisión de Eze): en Sensi viven en VINOS COPA, que no está conectada.
- **Qué es vino / plato** (`cartaParaMaridar` en `routes/maridajes.ts`): vino = item de una categoría conectada o de una subcategoría suya. **La ficha es opcional** (sin ella Claude usa nombre y descripción; el admin avisa cuántos no la tienen). Color = del nombre de la categoría (tinto/blanco/rosado/cava-champ-espum) o, si no sale, el que dice Claude al perfilar (`PerfilVino.color`); un vino sin color todavía solo sale en "Todos"; plato = item de un grupo que no es de barra, visible y no `autoPorPax`.
- **Tablas**: `Maridaje` (plato × vino, `puntos` 0-10, `motivo` ES + `motivoEn` solo para los de ≥7, `oculto` = "este no", `editado`) y `PerfilVino` (por vino, 1-5: cuerpo, dulzor, fruta, madera, frescor, aromático; `editado`). **Lo editado a mano no lo pisa el recálculo**; "↺ IA" lo devuelve.
- **`/admin/maridajes`** (`MaridajesPage`, grupo Carta): "✨ Recalcular todo con IA" / "Solo platos nuevos" (también perfila vinos sin perfil; un vino nuevo necesita "Recalcular todo" para sus parejas). Corre en segundo plano (`POST` → 202, la página pregunta cada 2 s): una consulta por plato, 4 a la vez, con la carta de vinos en caché de Anthropic, más una para todos los perfiles. ~80 s y céntimos. Pestañas "Por plato" (−/+ puntos, "Este no") y "Perfil de los vinos" (puntos 1-5 clicables). `tool_choice` forzado no lo admite el modelo: se usa `auto` y se pide en las instrucciones.
- **Sala** (`components/MaridajeSheet.tsx`, **copa de vino** redonda (`components/BotonVino.tsx`) en la pestaña Pedido de cualquier mesa no facturada (junto a "🔀 Ordenar salidas") y junto a la ✕ del `OrdenarModal` cuando hay comida: late si la mesa no tiene ninguna botella, y el vino elegido entra en barra y sale con ese mismo Oído; la hoja se monta fuera del modal para que sus toques no lo cierren): color + gustos opcionales bilingües (Con cuerpo/Full-bodied, Seco/Dry…; los opuestos se excluyen). Nota = media de [maridaje con los platos de la mesa] y [encaje con los gustos]. Cada gusto es un umbral, no un número exacto: "Con cuerpo", "Afrutado"… valen con 4 o 5; "Ligero", "Seco", "Sin madera" con 1 o 2; cada punto fuera resta 2,5. **Regla de venta (de Eze)**: se quedan los que encajan (≥7; si ninguno, los 3 que más se acercan) y se ofrecen **del más caro al más barato**: los dos más caros + "⭐ El que mejor encaja" de tercero; "Ver más baratos". **Techo con comida**: comida de la mesa × 1,5 (mín. 35 €); lo que lo pasa queda en "💎 Ver más caros". Sin comida, se pide por gusto. 🔊 English lee el motivo (o la ficha). Los agotados no salen. Los platos de la mesa se reconocen por nombre.

---

## Módulo: Escandallos (coste de platos)

Implementado 2026-10-09 (paso 1 de 3). `/admin/escandallos` (`EscandallosPage.tsx`, grupo "Carta"): qué cuesta en materia prima cada plato del menú y qué margen deja. **Sin datos todavía**: faltan los gramajes del chef — la pantalla arranca con todos los platos en "sin escandallo".

- **Ingredientes = `InventarioProducto`** (no hay tabla aparte): se reusa el catálogo de Inventario, con tres campos nuevos — `unidadBase` (`g`|`ml`|`ud`), `contenido` (unidades base por unidad de compra; botella de 700 ml → 700) y `mermaPct`. Si `unidadBase`/`contenido` son null se deducen de `unidad` (kg → 1000 g, l → 1000 ml, botella → 750 ml, caja/ud → 1 ud). Los ingredientes creados desde el editor de recetas caen en la categoría global **"Materia prima"** (se crea sola).
- **`Receta`** (`menuItemId @unique`, `raciones`) + **`RecetaLinea`** (`productoId`, `cantidad` en unidad base). Borrar el `MenuItem` borra su receta (cascade). Un producto usado en recetas no se borra de verdad desde Inventario: se desactiva (borrarlo abarataría el plato en silencio).
- **Cálculo (server-side, al vuelo, nada precalculado)** en `routes/escandallos.ts`: coste unitario = `precioCoste ÷ contenido ÷ (1 − merma)`; coste del plato = Σ líneas ÷ raciones; precio sin IVA = PVP ÷ (1 + `EmpresaConfig.tasaIva`/100); food cost % = coste ÷ precio sin IVA; margen = sin IVA − coste. El detalle recalcula lo mismo en el cliente mientras se edita (para ver el efecto antes de guardar).
- **Semáforo**: `EmpresaConfig.foodCostVerde` (30) / `foodCostAmbar` (35), comunes a todo el grupo, editables al pie de la pantalla. Estados: `verde` | `ambar` | `rojo` | `sin_receta` | `incompleta` (algún ingrediente sin `precioCoste` → el coste mostrado es menor que el real).
- **Auth real**: todo el plugin lleva `preHandler: requireAdmin` (rutas `/api/admin/escandallos*`, así `authFetch` manda el token de admin). Si falta o caducó, la página pide el PIN (mismo patrón que Facturas). Segundo módulo con sesión firmada.
- **API**: `GET /admin/escandallos?restaurantId` (matriz) · `PUT /admin/escandallos/umbrales` · `GET|POST /admin/escandallos/ingredientes` · `PATCH /admin/escandallos/ingredientes/:id` · `GET|PUT /admin/escandallos/:menuItemId` (el PUT reemplaza todas las líneas; sin líneas = borra la receta).
- **UI**: paleta oscura de marca (la del monitor Veri\*factu y Pulso) **sin animaciones** — es herramienta de trabajo. Matriz ordenable ("peor primero" por defecto) con filtros por sección y estado + 4 cifras arriba; **agrupada por categoría** en el orden de la carta (`categoriaOrden` en la matriz; una subcategoría va tras su padre), con cabecera por categoría (n con escandallo, food cost medio), botones para ver una sola (las cifras de arriba pasan a ser las de esa categoría) y "▤ Por categoría" para volver a la lista entera (2026-10-26); el "food cost medio" es **media simple**, no ponderada por ventas. Detalle en panel lateral: receta editable, alta/edición de ingrediente inline, barras "qué pesa más en el coste" y precio de venta para un food cost objetivo.
- **⚗️ Elaboraciones / sub-recetas (2026-10-26)**: salsas, fondos y premixes que se hacen en casa (en Sensi, 3 cocineros de producción por la mañana para los cinco locales: son **globales**) y entran en varios platos. Una elaboración es un `InventarioProducto` con su propia `Receta` (`Receta.productoId`, una receta es de un plato **o** de una elaboración) y `rendimiento` = lo que sale de la tanda en su unidad base. Su coste = Σ ingredientes ÷ rendimiento, **calculado, nunca a mano**; puede llevar otras elaboraciones (caldo dentro de la brava), hasta `PROFUNDIDAD_MAX` y sin recetas circulares (409). Todo el cálculo vive en **`src/costes.ts`** (`cargarCostes`, `alcanza`, `refrescarElaboraciones`): la matriz, el detalle y la lista de ingredientes lo usan; `refrescarElaboraciones()` deja el coste por kg/l/ud en `precioCoste` con `precioOrigen: 'receta'` (⚗️ en Inventario) y se llama al cambiar un precio (ingrediente en escandallos, producto en Inventario, pedido recibido) o una receta. Pantalla: `/admin/escandallos` → **🍽 Platos / ⚗️ Elaboraciones** (lista con tanda, coste por unidad y en cuántas recetas se usa; incluye los productos de las categorías de producción sin receta todavía, como los premixes de sala; "+ Nueva elaboración" con unidad kg/l/ud y quién la hace → categoría de producción global, nunca una "(demo)"). Rutas `GET|POST /admin/escandallos/elaboraciones`, `GET|PUT /admin/escandallos/elaboraciones/:productoId`. El editor de líneas (`LineasReceta`) es el mismo para platos y elaboraciones. **No hace**: descontar ingredientes al registrar una producción.
- **Ficha técnica (2026-10-31, fase 1 de "Recetas": decidido con Eze)**: la receta de un plato o de una elaboración va **por partes** (`RecetaParte`: nombre, `pasos` Json string[], orden; `RecetaLinea.parteId`), como las hojas de cocina de Sensi (PULPO, CREMA DE MAÍZ…), más `Receta.emplatado`, `notas` y foto (`fotoAt`; JPEG en `uploads/recetas/<plato|elab>-<id>.jpg`, `RECETAS_DIR`; `POST|GET|DELETE /admin/escandallos/foto/:tipo/:id`, se sube al momento). La cantidad de una línea es un número en g/ml/ud **o un texto** (`RecetaLinea.texto`: "c/s", "6 granos") con `cantidad` 0, que no cuesta (costes, matriz y margen se saltan las líneas en 0). El plato dice para cuántas raciones es la receta. Una elaboración compartida (global) entra en el plato con **"⚗️ Usar una elaboración"**: una parte con su nombre y cuánta lleva; la misma salsa puede ir en platos distintos de locales distintos. Las líneas de antes de las partes se leen como una primera parte sin nombre. `GET|PUT /admin/escandallos/:menuItemId` y `/elaboraciones/:productoId` llevan `partes`, `emplatado`, `notas` (el PUT reemplaza la ficha entera; una ficha sin nada y sin foto se borra). Editor: `FichaPartes` y `FotoFicha` en `EscandallosPage.tsx` (pasos: un renglón por paso). En el menú, "Recetas y costes". **Solo el chef ejecutivo crea y edita** (hoy: el admin); el encargado de cocina NO edita. Primera ficha real: `prisma/ficha-pulpo.ts --confirmar` (la hoja del pulpo, 10 raciones, cinco partes propias; crea los ingredientes que faltan sin precio y conserva la foto). **Wiki de cocina (fase 2, mismo día)**: decidido con Eze, **una sola app central**: el personal de cocina entra por `/sala` con su PIN como todos (`SalaLoginPage` ya no lo rechaza; la sesión `oidoops_camarero` guarda `tipo`) y cae en **`/sala/cocina`** (`CocinaPage.tsx`; `SalaMesasPage` lo manda ahí si llega con `tipo: 'cocina'`; el TPV sigue siendo solo de sala; `/cocina` redirige a `/sala`). Tres pestañas: **📖 Recetas**, **🗓 Horario** (`MiHorario`) y **💰 Propinas** (`PropinasPeriodo`, sacado de `MisPropinasPage`) — horario y propinas son lo común a todo el personal. Recetas: el local del dispositivo por defecto, con pastillas para elegir otro (`localStorage['cocina_restaurante']`); 🍽 Platos (los de **comida** de la carta de ese local con ficha, por categoría; lo de barra no sale) y ⚗️ Elaboraciones (todas), con buscador. La ficha a pantalla completa: foto, alérgenos del plato, **escalar** (raciones del plato o tanda de la elaboración en kg/l/ud; 1500 g → "1,5 kg"; "c/s" no cambia), partes con cantidades y pasos numerados, emplatado y notas; una elaboración dentro de un plato se toca y abre su ficha ("←" vuelve). Rutas de solo lectura en `routes/cocina.ts` (`GET /cocina/recetas?restaurantId`, `/cocina/recetas/:tipo/:id`, `/cocina/foto/:tipo/:id`), en `RUTAS_SALA` y `CONSULTA_SALA` (valen desde casa); **nunca devuelven un precio**. Sin internet (Box) la pantalla lo avisa. **Siguiente**: fase 3, imprimir en la térmica de cocina de ese local (imagen como la cuenta) y A4; fase 4, alérgenos que salen de los ingredientes.
- **Margen del turno (paso 2, 2026-10-27)**: cada línea de comanda guarda de qué plato de la carta sale (`ComandaItem.menuItemId`; la sala lo manda al tocar un plato, el pan × pax y los platos del menú de grupo lo toman por nombre, y lo copian marcha pasa, cambiar mesa y restituir una merma; `Merma.menuItemId` se copia de la línea). **Sin ficha**: los combinados "X + Y" (decisión de Eze: los alcoholes después), lo escrito a mano y todo lo anterior al cambio. `src/margen.ts` (`margenDe`, `resumenMargen`): coste de lo vendido = escandallo × cantidad (una invitación cuesta y no cobra; un plato sin receta o con algún precio faltante no cuenta), mermas aparte (menos las "no servido": ese plato no se hizo), y en un menú de grupo con platos con escandallo la línea "Menú X" cuenta como su venta. Se enseña: margen = ventas sin IVA − coste − mermas, food cost sobre lo vendido **con** escandallo y **cobertura** (% de lo vendido con escandallo; mientras sea baja, el margen está inflado). En vivo en **Pulso** (cada tarjeta y el total del grupo; `GET /turnos/activos/stats` trae `margen`) y al cerrar el turno se guarda (`Turno.costeVendido`, `costeMermas`, `ventasConEscandallo`; `/admin/turnos` lo muestra). **Nunca llega a la sala**: el filtro `sinSecretos` de `server.ts` quita esas claves salvo con sesión de admin o Pulso. Es margen **teórico** (lo que debería haber costado según la receta); el paso siguiente es compararlo con los conteos.
- **Recetas de demostración (2026-10-26, en producción)**: `apps/api/prisma/escandallos-demo.ts` creó 132 recetas **estimadas** (y 9 elaboraciones: brava, alioli, bechamel, sofrito, pesto, caldo, rustido y dos premixes, en "Elaboraciones (demo)" / "Premixes (demo)"; volver a correrlo rehace las recetas que solo llevan cosas de la demo) (raciones típicas de tapas, precios de mayorista inventados, vinos por botella con el coste sacado del PVP) para los platos globales y de Sensi Tapas, con 175 ingredientes en la categoría **"Materia prima (demo)"** (`precioOrigen: 'estimado'`). Son para ver la pantalla funcionando, **no datos del chef**. Se quitan con `npx tsx prisma/escandallos-demo.ts --borrar` (en `apps/api` de la instalación); no pisa recetas existentes.
- **Descartado por Eze (2026-10-09)**: alertas automáticas cuando sube el precio de un ingrediente (y por tanto el historial de precios).
- **Pendiente**: combinados en el margen; consumo teórico (ventas × receta) contra los conteos; líneas de factura de proveedor que actualicen `precioCoste`; previsión de producción (ventas históricas × receta − último conteo). No descontar stock por venta hasta comparar antes consumo teórico vs conteos.

---

## Módulo: Inventario

### Concepto

Catálogo **global** (compartido entre todos los restaurantes) + productos/categorías **específicos** por restaurante. Los conteos son siempre por restaurante individual.

### Modelos

```
InventarioCategoria  restaurantId=null → global | restaurantId=X → específica
                     personalProduccion: null | 'sala' | 'cocina'  ← quién produce
InventarioProducto   restaurantId=null → global | restaurantId=X → específica
                     unidad: ud | botella | caja | l | kg
                     precioCoste Float?   ← precio de compra al proveedor
                     precioVenta Float?   ← precio de venta al público
InventarioConteo     siempre por restaurantId, cerrado=true al guardar
InventarioConteoItem conteoId + productoId + cantidad  @@unique([conteoId, productoId])
InventarioProduccion restaurantId, productoId, cantidad, unidad, creadoPor?, notas?, fecha
```

### Compras: proveedor y formato de compra (2026-10-26, paso 1 de pedidos)

Primer paso del circuito **pedido del dueño → el encargado recibe con el albarán y coteja** (las facturas van a la oficina de administración, al local solo llega el albarán). Arranca solo con bebidas. Campos nuevos en `InventarioProducto`:
- `proveedorId` (catálogo `Proveedor` de Facturas, que suma `telefono`/`email`; un proveedor con productos no se borra, se desactiva).
- `formatoCompra` (`Caja`, `Pack`, `Barril`…; null = suelto) + `unidadesPorFormato` (caja de 24 → 24).
- `precioCoste` sigue siendo **por `unidad`** (la lata), así escandallos y Costes no cambian; el formulario lo pide por formato ("57 € la caja") y lo divide.
- `precioOrigen`: `pedido` | `chef` | `referencia` | `estimado` (los dos últimos salen en ámbar con "~").
- `menuItemId`: plato de la carta del que se trajo.

**⬇ Traer de la carta** (`POST /inventario/desde-carta { menuCategoriaId, confirmar?, soloIds? }`): crea una categoría de inventario global por la categoría elegida y cada subcategoría con platos, y un producto por plato (vinos y destilados por botella, el resto por unidad), enlazado. Se salta lo que ya existe (mismo plato, o mismo nombre en el mismo scope). La vista previa lleva casillas: la carta vende porciones (CAÑA y PINTA salen del mismo barril), así que se desmarca lo que no se compra tal cual. Ojo: no reconoce nombres parecidos ("Finca Rodman" vs "FINCA RODMA SELECCIÓN").

**Pedidos (paso 2, 2026-10-26)**: `/admin/pedidos` (`PedidosPage`, grupo Compras), rutas en `routes/pedidos.ts` (solo admin: no están en `RUTAS_SALA`). Tablas `Pedido` (restaurante + proveedor, `estado`: `borrador` → `enviado` → `recibido` | `recibido_diferencias`; `cancelado`) y `PedidoLinea` (copia del producto: nombre, unidad, formato, unidades; `cantidad` en formatos, `precioFormato`; los campos de recepción ya están para el paso 3). Flujo: elegir restaurante y proveedor → `GET /pedidos/sugerencia` trae los productos de ese proveedor con lo que quedaba en el **último conteo de ese local**, el mínimo, lo **en camino** (pedidos enviados) y `sugerido` = formatos que faltan para el mínimo (0 si nunca se contó). Se ajusta cantidad y precio, "+ Añadir otro producto" (un producto sin proveedor pasa a ser de este al guardar) → borrador o "Marcar como enviado". Un pedido enviado se edita o se cancela, no se borra. **📋 Copiar pedido** deja el texto para WhatsApp/mail (sin precios); la app no le escribe al proveedor. Teléfono y mail del proveedor se cargan junto al selector de proveedor.

**Recepción (paso 3, 2026-10-26)**: panel 💼 → **📦 Pedidos** (`components/PedidosSala.tsx`, con el número de pedidos en camino en la pestaña). El encargado ve lo **enviado a su local** (el de la sesión) y lo recibido en la última semana, **sin precios** (`sinPrecios`). Al abrir uno: 📷 foto del albarán (sube al momento, `uploads/albaranes/<id>/<n>.jpg`, `Pedido.albaranFotos`; ✕ quita una y las siguientes se corren; `components/AlbaranFotos.tsx`, compartido con el admin) y las líneas en verde "✓ Llegó": **solo se toca lo que vino distinto** (−/+ cajas que llegaron, Faltó / Llegó roto / Otro, nota). Un botón: "✓ Llegó todo — cerrar pedido" o "Cerrar con N diferencias" (naranja). `PATCH /pedidos/:id/recibir` → `recibido` o `recibido_diferencias` (menos cantidad sin motivo = `falta`), y **cada línea que llegó fija el `precioCoste` del producto** = precio del pedido ÷ unidades del formato, `precioOrigen: 'pedido'`. El encargado corrige su recepción hasta 2 días después (admin siempre). Rutas `GET /pedidos/recepcion`, `PATCH /pedidos/:id/recibir`, `POST|GET|DELETE /pedidos/:id/albaran[/:n]` en `RUTAS_SALA` + `SOLO_ENCARGADO` (exigen la red del local si el local la restringe). El admin ve en el detalle qué llegó, "Lo que llegó (la factura debería decir esto)" y el albarán; se actualiza por SSE `pedidos`. **No hace**: sumar stock al recibir, avisar al dueño de una diferencia (la ve en `/admin/pedidos`), ni cruzarse con el módulo Facturas. Las fotos no entran en el backup de la DB (igual que las facturas).

### Filtrado de productos por scope

`GET /inventario/categorias?restaurantId=X` filtra los productos incluidos por scope:
- Vista restaurante → productos globales + específicos del restaurante
- Vista global → solo productos globales

Esto evita que los productos de un restaurante aparezcan en otro.

### Producción (`personalProduccion`)

Las categorías se pueden marcar como de producción con quién las produce:
- `null` = no es categoría de producción (vinos, cervezas, etc.)
- `'sala'` = el personal de sala lo prepara (premixes de cócteles)
- `'cocina'` = el personal de cocina lo prepara

### API

- `GET /inventario/categorias?restaurantId=X` — globales + específicas, productos filtrados por scope
- `POST/PATCH/DELETE /inventario/categorias/:id` — PATCH acepta `personalProduccion`
- `POST/PATCH/DELETE /inventario/productos/:id` — PATCH acepta `precioCoste`, `precioVenta`
- `GET /inventario/conteos?restaurantId=X` — lista con `_count.items`
- `POST /inventario/conteos` — crea y cierra inmediatamente con todos los items
- `GET /inventario/conteos/:id` — detalle con diferencial vs conteo anterior + `precioCoste`/`precioVenta`
- `DELETE /inventario/conteos/:id`
- `GET /inventario/costes?baseId=X&finalId=Y` — compara dos conteos: consumido = cantBase − cantFinal, coste = consumido × precioCoste
- `GET /inventario/producciones?restaurantId=X` — historial de producciones
- `POST /inventario/producciones` — registrar producción (producto, cantidad, unidad, creadoPor, notas, fecha)
- `DELETE /inventario/producciones/:id`

### Frontend (`/admin/inventario`)

**Pestaña Catálogo**: selector Global/restaurante. Al añadir producto desde vista global, permite elegir a qué restaurante asignarlo (pills Global / Restaurante X). Toggle ⚗️ Sala / ⚗️ Cocina para marcar categorías de producción.

**Pestaña Conteos**: selector de restaurante, historial con fecha/autor/nº productos, nuevo conteo con inputs grandes (tablet-friendly) agrupados por categoría, vista detalle con tabla Cantidad | Anterior | Diferencia (verde/rojo) y productos bajo mínimo resaltados.

**Pestaña Costes**: seleccionar dos conteos para comparar consumo real × precio de coste. Total de coste y aviso de productos sin precio.

**Pestaña Producción**: historial de producciones por restaurante. Botón "+ Registrar producción" — desplegable solo con productos de categorías `personalProduccion !== null`.

### Producción desde la app de camarero

Botón ⚗️ en el header de `SalaMesasPage`. Abre `ProduccionSalaModal` con:
- Solo productos de categorías `personalProduccion = 'sala'` del restaurante
- Campos: producto, cantidad, unidad, notas
- `creadoPor` pre-relleno con el nombre del camarero logueado
- Al guardar muestra ✓ y se resetea para registrar otro sin cerrar

---

## Módulo: Almacén

### Flujo principal (tablet en almacén)

1. Empleado selecciona restaurante y su nombre
2. Escanea productos con pistola de barcode (USB, actúa como teclado rápido)
3. Por cada scan: `GET /api/producto/:barcode` → nombre del producto
4. Si no se encuentra → el usuario escribe el nombre a mano
5. Confirma cantidad y unidad (kg / ud / l / g)
6. "Confirmar retiro" → `POST /api/retiros`

### Hook del escáner (useScanner)

La pistola envía chars a < 50ms entre sí y termina con Enter. Un humano tarda > 300ms.
El hook distingue pistola vs teclado por velocidad.

### Validación de retiros por QR

- Cada retiro tiene un QR que apunta a `/verificar/:id` (vista pública con detalle del retiro)
- `/admin/validar` (`ValidarPage`): escáner de QR via cámara (html5-qrcode) para que el encargado valide retiros presencialmente
- Al confirmar: `POST /retiros/:id/confirmar` — guarda `confirmadoAt` y `confirmadoPor` en el retiro
- Campos en `Retiro`: `confirmadoAt DateTime?`, `confirmadoPor String?`

---

## Módulo: Empleados

Gestionado desde `/admin/empleados`. Ficha completa de personal del grupo.

### Campos de empleado

- `tipo`: `'cocina'` | `'sala'`
- `rol`: cocina → `'jefe_cocina'` | `'cocinero'` | `'produccion'` | `'friegaplatos'`; sala → `'camarero'` | `'encargado'`
- `puedeEncargado`: camarero que puede cubrir turno de encargado (solo planning)
- `accesoEncargadoApp`: superpoder que desbloquea el modo encargado 💼 en la app de sala (Editar → sección "TPV"; independiente del planning)
- `puedeJefeCocina`: cocinero que puede cubrir turno de jefe de cocina
- `excluirPlanning`: no incluir en auto-planning
- `restaurantId`: restaurante habitual (null = rotativo entre varios)
- `horasSemanales`: horas de contrato (opciones: 20, 25, 30, 35, 40)
- `diasLibresFijos`: días fijos de libranza (0=Lun … 6=Dom)
- `faseLibreRotacion`: ya no se usa (era la rotación de libres del planning viejo)
- `pin`: PIN de 4 dígitos para autenticación en la sala (camareros)
- `activo`: soft-delete

**Revisión del módulo (2026-10-22)**: buscador y filtro por restaurante (o rotativos); el PIN sale como •••• y se toca para verlo; cambiar Cocina/Sala se guarda (antes no viajaba) y apaga los permisos del tipo anterior. **Eliminar** no se permite si tiene propinas repartidas (409: se perderían sus filas y los repartos viejos no cuadrarían → desactivar); **desactivar** borra sus turnos del planning de hoy en adelante (`quitarTurnosFuturos` en `empleados.ts`). Contratos: solo 20/25/30/35/40 h (confirmado por Eze), también en `PATCH /staffing/empleados/:id`.

**Mi horario** (2026-10-22, pedido de Eze): cada empleado ve su semana planificada en el teléfono — bloque `components/MiHorario.tsx` (día por día, hoy resaltado, libre/ausente, ‹ › de la semana pasada a 4 por delante) en el **perfil de la sala** (`PerfilPanel`) y en **`/mis-propinas`** (la gente de cocina). `GET /staffing/mi-horario?desde=<lunes>` devuelve solo los turnos del empleado de la sesión; está en `RUTAS_SALA` y `CONSULTA_SALA` (vale fuera del local). Los horarios los hace el jefe ejecutivo desde `/admin/staffing`.

---

## Módulo: Grupos

Gestionado desde `/admin/grupos`. Gestión de menús cerrados para grupos con plantillas reutilizables.

### Modelos

```
GrupoMenuTemplate  restaurantId, nombre, precio (€/pax), niveles (Json), activo
GrupoAgendado      restaurantId, templateId, fecha, pax, restricciones (Json), estado, comandaId?
```

### Raciones sugeridas (`paxPorRacion`)

`GrupoMenuTemplate.paxPorRacion Int @default(3)` — tapeo compartido (todo al centro): al armar el menú se sugiere **1 ración de cada plato cada X pax** (`Math.max(1, Math.round(pax / paxPorRacion))`). Se configura en el editor de plantillas ("1 ración cada X pax"). **Si ni la ración base de todos cabe en el presupuesto** (grupo pequeño o plantilla con muchos platos; antes el botón quedaba bloqueado, ej. Premium a 2 pax = 141 € de 64 €), `sugerirCantidadesMenu` elige: da vueltas por los cursos poniendo, en el orden de la plantilla, el siguiente plato que quepa con la ración base; un curso al que no le cupo nada recibe su plato con la ración más grande que quepa; el resto queda en 0 a la vista (2026-10-17). La sugerencia **se recalcula al poner o quitar el postre** (mismo precio del menú: sin postre, su parte pasa a los demás platos); el botón de postre solo aparece si la plantilla tiene un curso `esPostre` (hoy ninguna de Sensi). Arriba se ve **"Se cobra: 2 × 32,00 € = 64,00 €"**; el "valor en carta" de lo elegido es solo el tope. El GenerarModal del admin y el MenuGrupoSheet de sala inicializan las cantidades con esta regla; el usuario ajusta a mano (restricciones alimentarias, tope de presupuesto).

### Menú grupo desde la app del camarero (`MenuGrupoSheet` en SalaMesasPage)

En el `AbrirMesaModal` (mesa **libre**, con el pax ya puesto) botón **"🍽 Menú grupo"** → sheet con: (1) selector de plantilla (precio×pax grande); (2) revisión por cursos con cantidades sugeridas por `paxPorRacion`, ajustables +/−, toggle postre, "+ carta" para añadir platos de la carta a un curso (caso vegetariano/intolerancias), y barra de presupuesto (valor en carta vs precio×pax; **bloquea** si se pasa); (3) confirmar → `POST /grupo-menu/:id/generar` (requiere mesa libre; el backend crea la comanda `enviada` con niveles asignados + item único de cobro "Menú X" a precio×pax **con `autoGenerado: true`** — se cobra pero queda fuera de OrdenarModal y de los flujos de envío, como el pan ×pax — y los platos a 0 €) → se abre el `ComandaPanel` de la mesa. Después la mesa se comporta como cualquier otra: añadir items = marcha pasa normal, y para reasignar niveles hay un botón **"🔀 Ordenar salidas"** arriba de los cursos en la pestaña Pedido (visible en cualquier comanda con niveles no facturada) que abre el `OrdenarModal` completo (`ordenarFull` fuerza `marchaPasa=false`: muestra TODOS los items con ▲▼ por plato y por nivel entero, cantidades y notas). El link "re-enviar comanda" del footer sigue existiendo.

```ts
{ nivel: number, nombre: string, platos: string[], esPostre: boolean }
// Legacy (backward compat): plato, vegetariano, sinCerdo, sinGluten
```

### GrupoMenuRestricciones (JSON en `restricciones`)

```ts
{ normales: number, vegetarianos: number, sinCerdo: number, sinGluten: number }
```

### Flujo

1. Crear plantillas (ej: "Estándar 45€", "Premium 65€") con sus cursos y platos
2. Agendar grupo: fecha + pax + restricciones alimentarias → `estado: 'pendiente'`
3. Cuando llegan: crear comanda y vincularla (`comandaId`) → `estado: 'asignado'`
4. El menú se sirve por niveles/cursos con las restricciones indicadas

### API (`/grupo-menu`)

- `GET /grupo-menu?restaurantId=X`
- `POST /grupo-menu` — crear plantilla
- `PUT /grupo-menu/:id` — editar plantilla (acepta `restaurantId` → botón **"Mover"** en la card de plantilla del dashboard: modal para pasarla a otro restaurante; los platos se referencian por nombre)
- `DELETE /grupo-menu/:id` — desactivar plantilla
- `GET /grupo-menu/agendados?restaurantId=X&fecha=YYYY-MM-DD`
- `POST /grupo-menu/agendados` — agendar grupo
- `PATCH /grupo-menu/agendados/:id` — actualizar estado/comanda
- `DELETE /grupo-menu/agendados/:id`

---

## Módulo: Staffing (Planificación de Personal)

Gestionado desde `/admin/staffing`. Planificación semanal de turnos por restaurante con auto-planning.

### Modelos

```
TurnoTipo          restaurantId? (null=global), nombre, horaInicio, horaFin, horas, color, tipoEmpleado?, rolEmpleado?, excluirAutoPlanning
TurnoEmpleado      restaurantId, empleadoId, tipoId?, fecha, horaInicio, horaFin, estado
StaffingConfig     restaurantId @unique, ratioSalaXPax, ratioCocinaXPax
StaffingNecesidadDia     restaurantId + diaSemana (plantilla base por día de la semana)
StaffingNecesidadFecha   restaurantId + fecha exacta (extras para festivos/eventos)
```

### TurnoEmpleado estados

`'planificado'` | `'confirmado'` | `'ausente'`

### TurnoTipo

- `restaurantId=null`: tipo global compartido entre todos los restaurantes
- `tipoEmpleado`: filtra qué tipo de empleado puede tener este turno (null = ambos)
- `rolEmpleado`: filtra por rol específico (null = todos los roles)
- `excluirAutoPlanning`: no usar este tipo en el auto-planning

### API (`/staffing`)

- `GET /staffing/tipos?restaurantId=X` — globales + específicos del restaurante
- `POST /staffing/tipos`, `PUT /staffing/tipos/:id`, `DELETE /staffing/tipos/:id`
- `GET /staffing/turnos?restaurantId=X&fecha=YYYY-MM-DD` — turnos del día con empleado+tipo incluidos
- `GET /staffing/turnos/semana?restaurantId=X&desde=YYYY-MM-DD` — turnos de la semana del local
- `POST /staffing/turnos` — crear turno
- `PUT /staffing/turnos/:id` — editar turno (acepta `restaurantId` para transferir a otro restaurante)
- `DELETE /staffing/turnos/:id` — eliminar turno
- `DELETE /staffing/turnos/semana-todos?desde=YYYY-MM-DD&restaurantIds=1,2,3` — borrar toda la semana de los restaurantes indicados
- `GET /staffing/config?restaurantId=X`
- `PUT /staffing/config` — actualizar ratios
- `GET /staffing/necesidades?restaurantId=X` — plantilla base por día de la semana
- `PUT /staffing/necesidades` — actualizar plantilla (los 7 días)
- `GET /staffing/necesidades/fecha?restaurantId=X&desde=&hasta=`
- `POST/PUT/DELETE /staffing/necesidades/fecha`
- `POST /staffing/auto-planning` / `POST /staffing/auto-planning-global` — planning automático (ver abajo)
- `GET /staffing/disponibles?restaurantId=X&fecha=YYYY-MM-DD&rol=X` — empleados disponibles ese día (sin turno asignado Y con horas semanales libres). Devuelve `horasRestantes` por empleado.
- `GET /staffing/transferir-destinos?empId=X&fecha=YYYY-MM-DD&origenId=X` — restaurantes donde el rol del empleado tiene déficit ese día (destinos válidos para transferir su turno)
- `GET /staffing/exceso-personal?rol=X&fecha=YYYY-MM-DD&restaurantId=X` — restaurantes donde ese rol tiene exceso de personal ese día, con lista de empleados transferibles (incluye `turnoId`)
- `GET /staffing/cobertura?lunes=YYYY-MM-DD` — lista todos los empleados activos con `horasAsignadas` esa semana vs `horasSemanales` de contrato
- `GET /staffing/huecos-empleado?empId=X&lunes=YYYY-MM-DD` — para un empleado concreto, devuelve los días+restaurantes donde su rol tiene déficit esa semana (`HuecoEmpleado[]`)

### Reglas comunes (revisión 2026-10-22)

- **Ausente no cuenta**: un turno `ausente` sigue ocupando el día (no se planifica encima) pero no cubre puestos ni suma horas, en el servidor y en la cuadrícula.
- **Una sola regla de cobertura** (`cubiertos()` en el auto-planning, `computeDayCoverageWithSubs` en la pantalla): primero el rol exacto; un suplente (cocinero `puedeJefeCocina`, camarero `puedeEncargado`) solo tapa un déficit y entonces deja de contar en su puesto; sin rol no cubre. Antes la vista previa contaba al suplente dos veces.
- Staffing abre en la pestaña de la semana; la cuadrícula muestra también a los fijos del local sin turnos; asignar a mano avisa si ya trabaja ese día en otro local o se pasa del contrato (no bloquea) y enseña el error si falla; arrastrar un turno a alguien de otro puesto pide confirmación.

### Planning automático "por necesidad" (rehecho 2026-10-22)

Auditado con los datos reales (semana completa de los 5 locales): el algoritmo anterior ponía **49 personas de más y dejaba 34 huecos** (a los fijos les daba siempre 5 días, los libres rotaban por patrón sin mirar la demanda, cada local se planificaba por separado y el tipo de turno se elegía por duración: jefes con turno "Friegaplatos"). Ahora: **0 de más, 12 huecos** (el mínimo posible con esa plantilla: faltan 8 turnos de jefe y 4 de cocinero por semana), libres seguidos para todos y tipos de turno del puesto.

- **`apps/api/src/planificador.ts`** — función pura `planificar()` (sin base de datos). Reglas duras: días libres fijos, máx. 5 días, un turno por día, nunca más horas que el contrato, **nunca más gente que la que pide cada local/día/puesto** (decisión de Eze: si sobra gente, se avisa a quién le faltan horas). Lo ya planificado a mano se respeta y cuenta.
- **Flujo de costo mínimo**: fuente → empleado → empleado×día → hueco (local×día×puesto) → sumidero. Garantiza el **mínimo de huecos** y, a igualdad, prefiere: fijos del local (0) < rotativos (100) < suplentes del local (200) < suplentes rotativos (300) < **fijos prestados de otro local** (400, decisión de Eze) < suplentes prestados (500); reparte días parejo según contrato y reparte los huecos inevitables (mejor 2 de 3 cocineros cada día que un día con 0).
- **Libres seguidos**: contratos ≥30 h libran al menos 2 días seguidos (par que incluye su fijo si tiene uno); se elige el par donde menos falta hace su puesto y una búsqueda local (400 pruebas, determinista: la vista previa y lo guardado coinciden) cambia pares si baja huecos o costo. ~3 s.
- **Horas**: primero quién trabaja qué día; al final cada turno con el tipo más largo de su puesto que deje sitio para los demás días (35 h → 8+8+8+5+5). El tipo se reconoce por `rolEmpleado` o, si no lo tiene, por el nombre (cocin/friega/camarer/encargad/produc); un suplente lleva el tipo del puesto que cubre.
- **Fuera**: producción (decisión de Eze), `excluirPlanning`, empleados sin rol. Suplentes = `puedeJefeCocina` / `puedeEncargado` de la ficha.
- **Rutas**: `POST /staffing/auto-planning` (un local: sus fijos + rotativos, sin préstamos) y `POST /staffing/auto-planning-global` (`restaurantIds`, todos a la vez, con préstamos; devuelve `porLocal`, `prestados`). Ambas con `preview` y con informe `huecos` (con motivo) y `faltanHoras`. En la pantalla: ✨ (un local) y ✨ Plan Global (una sola llamada, informe y "Crear N turnos").
- **Medir**: el script de auditoría genera una semana real en local, la compara con necesidades/libres/contratos y la borra (no está en el repo; rehacerlo si hace falta: genera con el global y cuenta por local/día/puesto con suplentes).
- Ya no se usan: `faseLibreRotacion`, los patrones fijos de libres, el "skip guard" y la poda.

### Tab Cobertura (`StaffingPage`)

Pestaña independiente en Gestión de Personal que lista todos los empleados activos ordenados alfabéticamente mostrando su cobertura semanal:

- **Navegador de semana propio** (independiente del de la tab Planning, para evitar mezcla de datos).
- **Barra de progreso** horas asignadas / horas de contrato con porcentaje. Verde ≥ 100%, ámbar < 100%.
- **Botón 🔍 Huecos**: aparece si `horasAsignadas < horasSemanales`. Abre `HuecosPanel` con los días+restaurantes donde el rol del empleado tiene déficit esa semana (pills con nombre de restaurante + nº de hueco).
- **Tooltip hover**: al pasar el cursor sobre el nombre del empleado, muestra la cuadrícula semanal (misma que en la tab Planning) con los turnos ya asignados y sus restaurantes.
- Los datos de cobertura provienen de `GET /staffing/cobertura?lunes=YYYY-MM-DD` y los huecos de `GET /staffing/huecos-empleado?empId=X&lunes=YYYY-MM-DD`.

### Transferir turno / traer personal

- **Transferir** (desde `TurnoAccionesModal`): al hacer clic en un turno → opciones Editar / Eliminar / Transferir. "Transferir" consulta `transferir-destinos` y muestra restaurantes con déficit del mismo rol ese día. Hace `PUT /staffing/turnos/:id` con `{ restaurantId: destino }`.
- **Traer de exceso** (desde `DisponiblesModal`): al añadir personal a un puesto vacío, además de disponibles libres, muestra una sección ámbar "Traer de restaurante con exceso" con empleados que están en otro restaurante pero son excedentes allí. Hace `PUT /staffing/turnos/:id` con `{ restaurantId: origenId }` para mover el turno.

---

## Módulo: Reservas (OidoPerso — en desarrollo ~70%)

### Concepto

Sistema de reservas online por restaurante. Cada restaurante tiene una config con slug único. Los clientes acceden al formulario público en `/reservas/:slug`.

### Modelos

```
ReservaConfig   restaurantId @unique, slug @unique, activo, maxPaxPorSlot, duracionMin, diasAntelacion
ReservaHorario  configId, nombre, diasSemana (Json), horaInicio, horaFin, intervaloMin, maxPax, activo
Reserva         restaurantId, configId, fecha, hora, pax, nombre, telefono, email?, notas?, estado, origen
                + campos del pool: enPool, poolMotivo?, poolDesde?, poolGestionandoPor?, poolGestionandoDesde?, restaurantIdOrigen?
```

### Estados de Reserva

`'confirmada'` | `'cancelada'` | `'no_show'`

### Origen

`'web'` (formulario público) | `'admin'` (creada desde el panel)

### Rutas

- `/reservas/:slug` — formulario público para clientes (`ReservaPublicaPage`)
- `/admin/reservas` — panel admin: ver reservas del día, crear manual, cambiar estado (`ReservasAdminPage`)

### API (`/reservas`)

- `GET /reservas/config/:slug` — config pública para el formulario
- `GET /reservas/disponibilidad?slug=X&fecha=YYYY-MM-DD` — slots disponibles
- `POST /reservas` — crear reserva (pública o admin)
- `GET /reservas?restaurantId=X&fecha=YYYY-MM-DD` — listar por restaurante + día
- `PATCH /reservas/:id` — actualizar estado
- `DELETE /reservas/:id`
- `GET /reservas/config/admin?restaurantId=X` — config admin
- `PUT /reservas/config` — actualizar config
- `POST /reservas/horarios`, `PUT /reservas/horarios/:id`, `DELETE /reservas/horarios/:id`

### Pool de reservas entre restaurantes (implementado 2026-09-14)

Resuelve el problema de "Zenchef no ofrece esto": cuando una reserva no entra en el restaurante que la recibió, el encargado la manda a un **pool compartido** en vez de coordinar por WhatsApp — cualquier encargado de los otros restaurantes del grupo la ve, llama al cliente, y si confirma se la lleva al suyo. La llamada al cliente la sigue haciendo un humano; lo que se elimina es el ida y vuelta entre WhatsApp/Zenchef y copiar el teléfono a mano.

Vive en **dos lugares** (mismos endpoints, dos frontends):
- **`/admin/reservas`** (`TabReservas` + `TabPool` en `ReservasAdminPage.tsx`): panel de escritorio, PIN único compartido de admin. Como no hay login individual ahí, el nombre del encargado se pide una vez con `prompt()` y se guarda en `localStorage` (`reservas_pool_nombre`). Al tomar una reserva hay que elegir el restaurante destino a mano (un select) porque cualquier admin puede estar mirando cualquier restaurante.
- **`/sala` → panel 💼 → pestaña "📅 Reservas"** (`EncargadoPanel` en `SalaMesasPage.tsx`, sub-tabs "Hoy" / "🔄 Pool"): la app real que usan los encargados en los Handys, con PIN individual. Acá la identidad ya se conoce (`camarero.nombre`, sin pedir nombre a mano) y "tomar" siempre es para el restaurante donde está logueado ese dispositivo (sin selector). Sigue la convención del resto de `/sala`: **nada de `prompt()`/`confirm()` nativos** — el motivo al enviar al pool es un input inline con botones "Confirmar envío"/"Cancelar", igual que el resto del panel.

- **Enviar al pool**: botón "🔄 Enviar al pool", solo sobre reservas `confirmada`. Motivo opcional (por qué no entra). La reserva sigue perteneciendo a su restaurante original mientras está en el pool (no desaparece de su lista de "Hoy", solo queda marcada "🔄 En pool" y visible además en la pestaña compartida).
- **Vista del pool**: lista todas las reservas `enPool=true` de **todos** los restaurantes (no filtra por restaurante seleccionado), con teléfono tap-to-call (`tel:`), motivo y restaurante de origen. Se actualiza en vivo vía SSE (canal global `/api/events/global`, tipo de evento `'reservas-pool'` — `useAdminEvents` en admin, `usePoolEvents` dedicado en sala) + polling de respaldo cada 30s.
- **Lock blando** (`poolGestionandoPor` + `poolGestionandoDesde`, timeout 10 min — `POOL_LOCK_TIMEOUT_MS` duplicado en ambos frontends y en el backend): al tocar "📞 Voy a gestionarla" queda lockeada a nombre del encargado — evita que dos personas llamen al mismo cliente a la vez. Vencido el timeout (por si alguien se cuelga o no llega a nadie), cualquiera puede volver a tomarla. Botón "Soltar" libera el lock manualmente si no se pudo confirmar.
- **Tomar** (`PATCH /reservas/:id/pool/tomar`): reasignación atómica server-side (`updateMany` con `where: { id, enPool: true, OR: [sin lock | lockeada por este mismo encargado] }`) — si otro ya la tomó o la lockeó primero, devuelve 409 (mensaje mostrado en admin con `alert`, en sala inline debajo del botón). Al tomarla se reescribe `restaurantId` + `configId` (busca el `ReservaConfig` del restaurante destino) y se limpian los campos de pool.
- `restaurantIdOrigen` se fija la primera vez que la reserva entra al pool y **no se borra** al tomarla — queda como registro de dónde entró originalmente aunque ya haya cambiado de restaurante.

**Endpoints**: `GET /reservas/pool` (lista global) · `PATCH /reservas/:id/pool` (enviar) · `PATCH /reservas/:id/pool/cancelar` (sacar del pool sin tomarla) · `PATCH /reservas/:id/pool/gestionar` (lock) · `PATCH /reservas/:id/pool/liberar` (soltar lock) · `PATCH /reservas/:id/pool/tomar` (reasignar).

### Walk-ins, sentar desde el mapa y plano de reservas (2026-10-19)

- **Walk-in = una entrada más del libro de reservas** (como Zenchef): `Reserva.origen = 'walkin'`, sin nombre ni teléfono (`nombre`, `telefono` y `configId` pasaron a opcionales; el formulario público y el admin los siguen pidiendo). Se crea ya `sentada`, con la hora de llegada (Europe/Madrid) y unida a la comanda.
- **Solo el encargado marca** (decisión de Eze): al tocar una mesa libre, el `AbrirMesaModal` le muestra **🚶 Walk-in** (en vez de "Abrir mesa") y **📅 Tiene reserva** (las de hoy sin sentar; primero las que tenían esa mesa asignada, después la más cercana a la hora). El walk-in va por `POST /comandas` con `walkin: true` y solo se apunta si la sesión es de encargado y no es la Box. `PATCH /reservas/:id/sentar` acepta `pax` (gana el que puso el encargado si lo tocó) y está en `SOLO_ENCARGADO`. El camarero abre como siempre, sin marca. Tampoco se marca al abrir tecleando el número en el TPV ni sin internet.
- **Sentar no abre la mesa** (ni desde el mapa ni desde 💼): el encargado sienta y sigue; el walk-in sí abre la mesa como "Abrir mesa".
- **Mesa abierta sin pedir nada → vuelve a libre al salir** (2026-10-19): al cerrar el `ComandaPanel` de una comanda `abierta` sin reserva, la sala llama a `DELETE /comandas/:id/vacia`, que la borra solo si no tiene nada pedido (lo automático tipo pan × pax con ronda 0 no cuenta), sin mermas, sin reserva sentada y no es de un grupo; si no, 409 y no pasa nada. **Un walk-in sin pedir nada también se borra**, con su apunte del libro (2026-10-24, Eze: casi siempre es mesa equivocada). También al salir con la mesa abierta (SALIR, minuto del TPV: `liberarAlSalir`). Si se cierra la app con la mesa abierta, queda abierta. Evita las mesas "fantasma" que quedaban abiertas días por poner los pax por error. Sin internet no aplica (no está en `RUTAS_LOCAL`).
- **Quién está sentado / "No era esta reserva"** (encargado): en la cabecera de la mesa, la línea 📅/🚶 se toca (en una mesa sin marca sale "📅 ¿Reserva o walk-in?") y abre `QuienEstaSheet`: walk-in o una reserva de hoy por llegar. `PUT /comandas/:id/reserva { reservaId | null }`: la reserva que estaba vuelve a `confirmada` sin mesa; un walk-in que estaba se borra; con `null` se apunta un walk-in con la hora de apertura de la mesa. Cambiar de mesa con ↔ (`mover-mesa`) muda también la reserva.
- **Lista del panel 💼 → 📅 Reservas → 📋 Lista** (rediseñada 2026-10-19): selector ‹ Hoy ›; arriba, cuatro cifras (reservas, pax, sentadas, sin mesa; esta última en ámbar y abre el plano); grupos **Por llegar / Sentadas / No vinieron y canceladas** (plegado). Cada tarjeta: **hora y pax grandes a la izquierda** (`BloqueHoraPax`, compartido con el plano, el pool, "Tiene reserva" y `QuienEstaSheet`), borde de color (azul por llegar, ámbar si llega en ≤30 min, rojo con "⏰ X min tarde" a los 15 min, verde sentada), notas resaltadas en ámbar, 📞/💬 como botones (`ContactoReserva`), botón principal "✅ Sentar en 207" (o "🪑 Elegir mesa", que abre el plano) y debajo 🚫 No vino (desde la hora), ✕ Canceló, 🔄 Al pool. "↩ Volver a por llegar" deshace una cancelada o no-show. `PATCH /reservas/:id` (en `SOLO_ENCARGADO`) solo acepta confirmada/cancelada/no_show y responde 409 si ya están sentados. El canal SSE `update` refresca las reservas en los demás dispositivos.
- **Se ve en la sala**: `GET /comandas` y `/comandas/:id` traen `reserva` (origen, nombre, hora, notas). En el mapa, circulito 📅 / 🚶 en la esquina de la mesa (`MesaBtn`); en la cabecera del `ComandaPanel`, `📅 García · 21:00 · notas` (un walk-in no ocupa línea; el encargado toca el número de mesa para abrir `QuienEstaSheet`).
- **Plano de reservas** (`PlanoReservas` en `SalaMesasPage.tsx`): 💼 → 📅 Reservas → **🗺 Plano**, o "🪑 Asignar mesa" de una reserva (abre con ella elegida; reemplaza la lista de mesas que había). El mismo dibujo del salón; dentro de cada mesa, las horas de sus reservas del día (sentadas tachadas, walk-ins con 🚶; si no caben, "+n"). Asignar en dos toques: una reserva (tira "Sin mesa" de abajo, o una hora dentro de una mesa) y después la mesa; "Sin mesa" la quita. Selector **‹ Hoy ›** para cualquier día. **Hoy**, las mesas con gente salen en morado ("OCUPADA" si no vienen de una reserva) y, sin reserva elegida, **tocar una mesa libre → pax → 🚶 Sentar** apunta un walk-in sin salir del plano. **Deslizar** como en el mapa de la sala: a la izquierda el salón siguiente, a la derecha el anterior, y desde el primero a la derecha se vuelve a la lista (nombre del salón en grande un momento y puntitos de posición abajo). Avisos en ámbar, sin bloquear: dos reservas de la misma mesa **se pisan** si la segunda llega antes de que termine la primera (`ReservaConfig.duracionMin`, que `GET /reservas` ahora incluye en `config`; 90 por defecto) y **mesa chica** (`pax > capacidad`). Las horas van **solo en el plano**, no en el mapa del servicio (decisión de Eze). Desde la lista (📋), **deslizar hacia la izquierda abre el plano** (2026-10-21), en cualquier modo del panel. En el plano: apellido bajo la hora si entra (si no, cada línea alterna hora 2,5 s / apellido 1,5 s), raya punteada entre reservas de una mesa, número de mesa en una pastilla sobre el borde, y **zoom propio** (pellizcar, arrastrar; con zoom, un toque en un hueco = vista normal; el del navegador está bloqueado ahí con `touch-action: none`). **Doble toque en un hueco = al mapa del servicio, en ese mismo salón** (encargado en la vuelta, 2026-10-22, idea de Eze; el zoom queda solo con los dedos — fuera de la vuelta el doble toque sigue acercando; y al revés: **doble toque en un hueco del mapa de la sala = plano de reservas de ese salón**, `toqueMapa` en la página, las mesas llevan `data-mesa`). Sin mirar en un teléfono todavía. **Avisos de llegada (2026-10-21)**: hoy, cada mesa avisa de su reserva por llegar más urgente con una aureola que late y una pastilla encima — 🟡 de 30 a 15 min antes ("en 21′"), 🟠 de 15 antes a 15 después ("⏰ en 4′" / "⏰ ya"), 🔴 desde los 15 min tarde ("+21 min") hasta que se sienta o se marca No vino. Mismas ventanas que la lista del 💼 (`nivelReserva`, función pura compartida). Un reloj de 30 s para el plano; la animación (`reserva-latido` en `index.css`) solo mueve opacidad y escala y se apaga con "reducir movimiento". Tocar una mesa con reserva por llegar hoy (cualquier hora, no solo naranja o roja: llegan antes; 2026-10-25) abre la más urgente o la siguiente, con "🚶 Son otros · walk-in" si la mesa está libre; tocar una mesa naranja o roja abre la reserva: 📞/💬, **✅ Sentar en X** (desactivado si la mesa tiene gente), 🪑 Cambiar de mesa, 🚫 No vino. Sentar un walk-in en una mesa con reserva más tarde avisa "⚠ Esta mesa tiene reserva a las …". Descartado: cobrar el no-show con la tarjeta (las reservas no guardan tarjeta; sería un proyecto con proveedor de pagos). **Reservas al ritmo del turno (2026-10-21; Sensi tiene un solo turno, de noche)**: el "hoy" de las reservas es el **día de servicio**, que corta a las **06:00** de Madrid — a las 00:30 la noche sigue viendo sus reservas (`diaDeServicio` en `apps/api/src/dia-servicio.ts`, `diaServicio()` en la sala; los walk-ins se apuntan en ese día con su hora real). En el plano de hoy, una reserva **sentada solo se ve mientras su comanda sigue activa**: los que ya se fueron no dejan horas tachadas. **Al cerrar el turno**, las reservas del día de servicio que seguían por llegar pasan solas a **No vino** (y salen del pool); el resumen del cierre dice cuántas (`reservasNoVinieron`, solo en esa respuesta) y se deshace con "↩ Volver a por llegar".

**Aviso de reserva nueva (2026-10-21)**: cuando entra una reserva por el formulario público (`POST /reservas/publica`), la API manda por SSE `reserva-nueva` con nombre, hora, pax y fecha (`broadcast` acepta datos extra); `useRestaurantEvents` lo pasa a la sala como evento de ventana `oido:reserva-nueva` y el **encargado** con la app abierta recibe vibración (`navigator.vibrate`, solo Android: el iPhone no deja vibrar a una web) y un aviso arriba 10 s ("Nueva reserva · hoy / jue 22 oct", tocar = lista de reservas). Con el teléfono bloqueado o la app cerrada no llega: para eso harían falta notificaciones push (Web Push con service worker), pendiente.

**Pendiente / no cubierto en esta primera versión**: no hay push notification cuando algo entra al pool — el encargado tiene que tener la pestaña Reservas abierta (o el badge de número en la pestaña, que sí se actualiza solo vía SSE) para enterarse.

---

## Módulo: Wiki

Base de conocimiento del grupo: speeches de bienvenida, protocolos, conceptos. El admin carga el contenido desde `/admin/wiki` y el personal de sala lo consulta (y **escucha**) desde el botón 📖 en el header de `SalaMesasPage`.

### Modelos

```
WikiCategoria  nombre, icono, orden  ← categorías globales/compartidas (Bienvenida, Concepto…)
WikiArticulo   categoriaId, restaurantId Int?, titulo, guiones (Json), notas, orden, activo
```

- **Categorías**: siempre globales (sin scope). Estructura organizativa compartida por toda la cadena.
- **Artículos**: `restaurantId Int?` — `null` = global (toda la cadena), `X` = específico de un restaurante. Mismo patrón scope que Menú/Inventario.
- `guiones`: **Json `{ en?, fr?, de? }`** — el guion del speech por idioma (lo que el camarero le dice al cliente y lo que lee el TTS). **Solo los idiomas con texto son "escuchables"** — así se decide desde el dashboard qué ítem tiene audio y en qué idiomas (sin flag extra).
- `notas`: contexto/instrucciones **en español** para el camarero (opcional).

### Text-to-Speech multi-idioma (`apps/web/src/lib/tts.tsx`)

Se usa la **Web Speech API nativa del navegador** (`SpeechSynthesisUtterance`), sin infraestructura de audio ni archivos. Módulo compartido `lib/tts.tsx`:
- `speak(text, lang)` — lee en el idioma dado (`en`→en-GB, `fr`→fr-FR, `de`→de-DE), con la voz y velocidad guardadas por el usuario.
- `LANGS` — idiomas soportados (inglés 🇬🇧, francés 🇫🇷, alemán 🇩🇪).
- `<VozSelector>` — componente reutilizable: un selector de **voz por idioma** (entre las del dispositivo) + control de **velocidad**, persistidos en `localStorage` (`tts_voice_<lang>`, `tts_rate`). En la sala usa el tema oscuro (`dark`), en el admin el claro.
- La calidad depende del dispositivo: en tablets Android usa las voces neuronales de Google (mejores); conviene descargar voces de alta calidad en Ajustes → Texto a voz.

### API (`/wiki`)

- `GET /wiki?restaurantId=X` — **vista sala**: categorías con sus artículos activos filtrados por scope (globales + del restaurante). Anidado.
- `GET /wiki/categorias` — categorías con `_count.articulos` (admin)
- `POST/PUT/DELETE /wiki/categorias/:id` — DELETE borra en cascada los artículos de la categoría
- `GET /wiki/articulos?restaurantId=X` — con restaurantId: globales + específicos; sin él: solo globales (admin)
- `POST/PUT/DELETE /wiki/articulos/:id`
- `PATCH /wiki/articulos/:id/toggle` — activar/ocultar artículo

### Frontend

- **Admin** (`/admin/wiki`, `WikiPage.tsx`): selector Global/restaurante (pills), gestión de categorías y artículos. Editor de artículo con textarea del guion (inglés) + botón 🔊 preview + textarea de notas (español). Los artículos globales son de solo lectura desde la vista de restaurante.
- **Sala** (`WikiPanel` en `SalaMesasPage.tsx`): bottom-sheet de **2 vistas** — (1) lista de artículos clicables agrupados por categoría (título + banderas de idiomas disponibles + chevron); (2) al tocar uno, detalle con la `WikiArticuloCard`: **chips de idioma** (🇬🇧 🇫🇷 🇩🇪) por cada guion cargado; al tocar un chip se muestra ese texto y se **lee en voz** en ese idioma. Flecha ← para volver (cancela el TTS). Botón 🎚️ en el header abre el `<VozSelector>`. Solo muestra categorías con artículos activos. Diseñado así para que la Wiki escale con más tipos de contenido.
- **Fichas de la carta** (2026-10-09, `FichasSeccion` + `armarSeccionesFichas` en `SalaMesasPage.tsx`): arriba de la lista de la Wiki aparece una tarjeta con gradiente por cada sección que tenga items con `ficha`. Regla de agrupado: si el item cuelga de una **subcategoría**, la sección es la categoría padre y las pestañas sus subcategorías (🍾 VINOS BOTELLA → TINTO/BLANCO/ROSADO/CAVA); si su categoría es de nivel superior, la sección es el **`grupo`** del menú y las pestañas las categorías (🍽️ Comida → CLASICAS/VEGETARIA/PESCADO/CARNE/PASTA-ARROZ). **No son artículos de la Wiki ni tienen configuración**: se arman solas desde las mismas queries del picker (`['menu', rid]` + `['menu-cats', rid]`) → si cambia la carta en `/admin/menu`, cambia la Wiki; cargarle ficha a un plato o cóctel hace aparecer su sección sin tocar código. Dentro: pestañas por subcategoría (el label quita las palabras que repite del padre: "TINTO BOTELLA" → "TINTO"), buscador que con texto busca en toda la sección (nombre + descripción + ficha, vía `normTxt` — sirve buscar por uva o D.O.), tarjetas con nombre, precio, descripción y primera línea de la ficha. Al tocar una: detalle a pantalla completa (1ª línea de la ficha destacada = uvas/crianza, resto = notas), botón "🔊 Escuchar en inglés" (las fichas se asumen en inglés → `speak(…, 'en')`), y ‹ › + swipe horizontal para pasar a la siguiente como un mazo (base del futuro quiz). Solo lectura. Orden = `orden` del item (carta física). Con una sección abierta el sheet toma alto fijo (`h-[85vh]`) para que no salte al pasar de ficha.
- **Acceso**: los botones de Wiki y Checklists **no** están en el header de la app de comandas — están dentro del **panel de perfil del camarero** (`PerfilPanel`, se abre al tocar el nombre), como accesos junto al resumen de propinas.

---

## Módulo: Asistente (aprender a usar la sala, 2026-10-29)

Pedido de Eze: que la app le enseñe al camarero a usarla. Opción elegida: **lecciones que se hacen en la sala de verdad, en modo práctica**, más dos complementos todavía sin hacer (progreso visible para el encargado y consejos la primera vez). Rama `asistente`, sin desplegar.

- **Modo práctica** (`apps/web/src/lib/practica.ts`): toda llamada de la app pasa por `pedir()` (`lib/conexion.ts`), que en práctica pregunta primero a `simular()`. Las lecturas (carta, salones, alérgenos…) van al servidor de verdad; **mesas y comandas, turno (uno de mentira, así se practica sin turno abierto), red, reservas, agotados y mermas** los contesta el simulador, que imita las rutas de `routes/comandas.ts` (abrir, items, para-cocina, enviar, pax, facturar, liberar, cerrar, vacia, mover-mesa); **cualquier otra escritura responde 403** "En la práctica esto todavía no se puede". Así es imposible que imprima, sume a la caja o le aparezca a otro (comprobado: cero filas nuevas y ninguna llamada en el log de la API tras las cinco lecciones). Vive en `sessionStorage` (`oidoops_practica`, `_db`, `_eventos`); entrar, cambiar de lección y salir **recargan la página** para que la caché de React Query nunca mezcle datos reales con los de mentira. Marco ámbar en toda la pantalla mientras dura.
- **Lecciones** (`components/Asistente.tsx`, `LECCIONES`): Camarero básico — abrir una mesa, pedir (cantidad, nota, quitar), deslizar para ir más rápido (pedido de Eze 2026-10-29: cambiar de salón en el mapa; en una categoría, izquierda = la siguiente y derecha = atrás; de las categorías a COMIDA/BEBIDAS; desde COMANDA a la carta; desde el primer nivel al mapa — cada deslizar de la sala llama a `gesto('…')` de `lib/practica.ts`, que fuera de la práctica no hace nada; el mapa lleva `data-salones` para saltarse el paso del salón si hay uno solo), Oído y orden de salida, nota para cocina y No comparten (mantener apretado el Oído → nota de toda la mesa, «Oído con nota»), alergias de la mesa (⚠️ Alergias → marcar → la carta tacha lo que choca → el orden de salida muestra «ALÉRGICO» y se manda; ambas 2026-10-29), marcha pasa, la cuenta (entregarla y, con la mesa en rojo sin cobrar y gente nueva sentada, «Mesa libre» y abrirla a los nuevos: la cuenta vieja pasa a los cobros del encargado y la mesa lleva el marco rojo por dentro; corregido a pedido de Eze 2026-10-29, antes decía «cuando ya pagó»), y platos agotados (ALTO): al entrar en esa lección el simulador marca como agotado un plato de comida de la carta (`DbPractica.alto`, elegido por `elegirAlto` y siempre el mismo en la práctica; solo en esa lección `GET /agotados` lo devuelve): tocar la franja roja del mapa y verlo tachado en la carta. El texto de un paso puede ser una función de la práctica para nombrar el plato. Y el asistente de vinos (pedido de Eze 2026-10-29): con comida en la mesa, tocar la copa, elegir color/gustos y añadir una botella; los vinos y maridajes se leen del servidor de verdad, solo el añadir pasa por el simulador (si el local no tiene maridajes calculados, la lección pasa sola al ver el aviso). `guia` puede ser una lista: se ilumina el primero que esté en pantalla (la copa, o la pestaña COMANDA donde está). Cada paso tiene texto, el botón que se ilumina (`guia`) y `hecho(ctx)`, que mira lo que llegó al simulador **desde que empezó ese paso** (`ctx.eventos`), el estado de las mesas de práctica (`ctx.db`) o si apareció algo en pantalla (`ctx.visible`). La tarjeta de la guía se pone en la mitad contraria al botón iluminado y se puede ocultar. Una lección sigue con las mesas que dejó la anterior.
- **Botones marcados** con `data-guia` en `SalaMesasPage.tsx`: `abrir-mesa`, `cerrar-mesa`, `pestana-comanda`, `oido`, `ordenar-oido`, `ver-cuenta`, `entregar-cuenta`, `mesa-libre`, `franja-altos`, `lista-altos`, `plato-agotado`, `no-comparten`, `nota-mesa`, `oido-con-nota`, `boton-alergias` (carta y orden de salida), `alergias-hoja`, `plato-choca`, `plato-apto`, `boton-vino` (en `BotonVino.tsx`), `asistente-vinos`, `vino-sugerido`, `vino-anadir`, `vinos-sin-calcular` (en `MaridajeSheet.tsx`). ⚠️ Si se cambia uno de esos botones, conservar el atributo o la guía deja de iluminarlo (la lección sigue funcionando, solo sin marco).
- **Entrada**: perfil de la sala → "Aprender a usar OidoOps", y en la pantalla "Turno no iniciado" ("Mientras tanto, aprende…"). No en el TPV ni sin internet.
- **Progreso** (2026-10-30): tabla `LeccionCompletada` (`empleadoId` + `leccion` únicos, `completadaAt`; `leccion` = id de `LECCIONES`), rutas en `routes/lecciones.ts`: `GET|POST /lecciones/mias` (cualquier empleado, valen fuera de la red del local: las lecciones se pueden hacer en casa), `GET /lecciones/equipo` (encargado: personal de sala activo de su local, fijos y rotativos) y `GET /admin/lecciones` (admin). Es **la única escritura que deja pasar el simulador** (`simular()` devuelve null para `/lecciones/mias`). El teléfono guarda también una copia (`localStorage['oidoops_lecciones_<empleadoId>']`) por si al terminar no había conexión; al abrir la lista se sube lo que el servidor no tenga y se baja lo hecho en otro teléfono. Lo ven: el **encargado** en 💼 → **🎓 Equipo** (`components/EquipoLeccionesSala.tsx`: n en sala / las hicieron todas / sin empezar; cada uno con barra, n/total, última lección y, al tocarlo, qué le falta; primero a quien más le falta; también fuera del local) y el **admin** en `/admin/empleados` (pastilla 🎓 n/total en el personal de sala; al tocarla, las lecciones con su fecha). Solo cuentan las lecciones que existen en `LECCIONES`. **Pendiente**: que el encargado pueda pedirle una lección a alguien (hablado, para después).
- ⚠️ Una ruta nueva de escritura que use la sala en una pantalla que se enseñe en una lección hay que imitarla en `simular()`; si no, en práctica sale el aviso de "no se puede".
- **Pendiente**: consejos de una línea la primera vez que se ve un botón; lecciones avanzadas (cambiar mesa, mermas, combinados, pagar por separado, menú de grupo) y de encargado (cobrar, turno, propinas, reservas…), que necesitan sumar esas rutas al simulador. Sin mirar todavía en un teléfono de verdad (probado en el navegador del Mac).

---

## Módulo: Checklists

Listas de apertura y cierre por **sector**, ya que cada restaurante tiene sus peculiaridades (2 salas, 2 barras, un paso…). El personal de sala las completa desde el botón ✅ en el header de `SalaMesasPage`; el encargado revisa el histórico en `/admin/checklists`.

### Modelos

```
ChecklistSector      restaurantId, nombre ("Barra 1"), orden  ← por restaurante (scope obligatorio)
ChecklistItem        sectorId, momento ('apertura'|'cierre'), texto, orden
ChecklistEjecucion   sectorId, restaurantId, momento, completadoPor, itemsMarcados (Json), fecha
```

- **Sectores**: siempre por restaurante (no hay globales — son la peculiaridad de cada local).
- **Ítems**: pertenecen a un sector + `momento`. Un sector tiene ítems de apertura y de cierre.
- **Ejecución**: cada vez que se completa un checklist se guarda un **snapshot inmutable** en `itemsMarcados` (`[{ texto, marcado }]`). Así el histórico no se altera aunque después se editen o borren los ítems del sector. Da accountability (quién abrió/cerró cada sector y qué quedó sin hacer).

### API (`/checklists`)

- `GET /checklists?restaurantId=X` — **vista sala**: sectores con sus ítems + las **ejecuciones de hoy** (para marcar en verde lo ya completado).
- `GET /checklists/sectores?restaurantId=X` — sectores con ítems (admin)
- `POST/PUT/DELETE /checklists/sectores/:id` — DELETE borra en cascada ítems + ejecuciones del sector
- `POST/PUT/DELETE /checklists/items/:id`
- `POST /checklists/ejecuciones` — registrar checklist completado (`{ sectorId, momento, completadoPor, itemsMarcados }`); el `restaurantId` se deriva del sector
- `GET /checklists/ejecuciones?restaurantId=X&fecha=YYYY-MM-DD` — histórico del día (admin), con `sector` incluido
- `DELETE /checklists/ejecuciones/:id`

### Frontend

- **Admin** (`/admin/checklists`, `ChecklistsPage.tsx`, grupo Sala): selector de restaurante + dos pestañas:
  - **Configurar**: sectores con dos columnas (🔓 Apertura / 🔒 Cierre), cada una con sus ítems editables inline. Añadir sector con input + Enter.
  - **Registro**: histórico por fecha. Cada ejecución muestra sector, momento, quién, hora y `marcados/total` (verde ✓ si completo, ámbar ⚠️ con los ítems sin marcar).
- **Sala** (`ChecklistPanel` en `SalaMesasPage.tsx`, se abre desde el `PerfilPanel`): bottom-sheet de 2 vistas — (1) lista de sectores, cada uno con chips Apertura/Cierre (verde con nombre+hora si ya se completó hoy); (2) al elegir sector+momento, ítems como checkboxes grandes (tablet) + botón "Completar (n/total)" que registra la ejecución con el nombre del camarero logueado.

---

## Módulo: Facturas (de proveedor)

Reemplaza el flujo "escanear con ScanCam + mandar el PDF por mail". Implementado 2026-10-01 (v1: foto comprimida, sin recorte de bordes ni OCR).

### Sesión firmada (primer módulo con auth real en el servidor)

El resto de la API sigue sin validar identidad; las rutas `/facturas*` sí, vía `@fastify/jwt` (`apps/api/src/auth.ts`, guards `requireEncargado` / `requireAdmin`):
- **Sala**: `POST /empleados/auth` devuelve además `token` (16h) con `encargado = rol 'encargado' || accesoEncargadoApp` — mismo criterio que `esEncargado` en `/sala`. Se guarda dentro de `sessionStorage['oidoops_camarero']`. Un encargado logueado desde antes del deploy no tiene token → tiene que volver a entrar con su PIN.
- **Admin**: `POST /admin/auth { pin }` valida contra `ADMIN_PIN` del `.env` de la API y devuelve token (12h) → `sessionStorage['admin_token']`. Es el login de todo `/admin`: `AdminGuard` lo pide al entrar; si el token caducó con la pestaña abierta, `FacturasPage` y `EscandallosPage` muestran su propio PIN. Sin `ADMIN_PIN` en el servidor el endpoint devuelve 503 y no se puede entrar al admin.
- `authFetch` en `api.ts` elige el token según la ruta (`/admin*` → admin, resto → sala). Las imágenes/PDF se bajan como blob (un `<img src>` directo no puede mandar el header).
- Sin `JWT_SECRET` la API arranca igual con un secreto efímero (las sesiones se caen en cada reinicio).

### Modelo y archivos

```
Proveedor  nombre @unique, activo   ← catálogo común a todos los restaurantes, gestionado en /admin/facturas → pestaña Proveedores
Factura  restaurantId, proveedor (nombre, snapshot), proveedorId? (null = "Otro…" escrito a mano), numero? (nº de factura, opcional), nota?, subidoPor, subidoPorId?, paginas, estado ('subiendo'|'pendiente'|'revisada'), revisadaAt?
```

Las páginas son JPEG en disco: `apps/api/uploads/facturas/<id>/<n>.jpg` (override con env `FACTURAS_DIR`; en `.gitignore`; Nginx no lo sirve). El PDF se arma al vuelo con `pdf-lib`. **No entran en el backup de la DB** y **`sync-db.sh` borra las filas de prod** (deja los archivos huérfanos) — pendiente resolver backup.

### Flujo de subida (3 pasos, una request por página)

`POST /facturas` (queda `subiendo`, invisible en listados) → `POST /facturas/:id/paginas` con el JPEG crudo en el body (`Content-Type: image/jpeg`) → `PATCH /facturas/:id/enviar` (pasa a `pendiente` + SSE `'facturas'`). Una request por página porque **Nginx corta en 1 MB por defecto**: `lib/imagen.ts` (`comprimirFoto`) reduce cada foto a ≤1800px y <850 KB en el dispositivo. Las subidas a medias de más de 1 día se limpian solas al crear la siguiente.

### API (`/facturas`)

- `GET /facturas?restaurantId=&estado=&mes=YYYY-MM` — admin: todas; encargado: `restaurantId` obligatorio
- `GET /facturas/proveedores` — catálogo activo (con `_count.facturas`) · `POST` (admin; reactiva si existía y vincula las facturas escritas a mano con ese nombre) · `PUT /:id` (renombrar; actualiza el nombre en sus facturas) · `DELETE /:id` (borra si no tiene facturas, si no lo desactiva)
- `GET /facturas/:id/paginas/:n` (JPEG) · `GET /facturas/:id/pdf`
- `PATCH /facturas/:id { estado }` — solo admin (pendiente ↔ revisada)
- `DELETE /facturas/:id` — admin cualquiera; encargado solo las suyas y no revisadas

### Frontend

- **Sala**: pestaña **🧾 Facturas** del `EncargadoPanel` → `components/FacturasSala.tsx` (proveedor: chips del catálogo + "Otro…" para escribir uno que no está — queda marcado "sin catalogar" en el admin con botón para añadirlo —, nº de factura, nota, fotos con `<input capture="environment">`, lista de las del restaurante con estado Enviada/✓ Revisada).
- **Admin**: `/admin/facturas` (`FacturasPage.tsx`, grupo "Compras"): pestañas Bandeja / Proveedores; filtros restaurante / proveedor / estado / mes, ver páginas, descargar PDF, marcar revisada, eliminar.
- `/api/facturas*` está excluido de la caché del service worker (`vite.config.ts`).

**Pendiente**: ZIP/exportación del mes, reenvío por mail a gestoría, recorte tipo escáner, lectura automática (proveedor/total/líneas → checklist de recepción + `precioCoste`), backup de `uploads/`.

---

## Módulo: Tickets (impresión térmica 80mm)

> **Kit de impresión (Pi + MQTT + térmicas)**: el estado real del prototipo y el diseño acordado para el local real (vinculación por código, enrutamiento desde el admin, detección de impresoras) están en [`docs/kit-impresion.md`](docs/kit-impresion.md) — leerlo antes de tocar `mqtt.ts`, `tickets.ts` o el `printer-server`.

Preparación para cuando llegue la impresora ESC/POS del roadmap (punto 2): configuración de qué sale en cada ticket y a qué impresora, más un preview en pantalla (sin hardware todavía — se imprime a PDF desde el navegador con Cmd+P, CSS ya ajustado a 80mm).

### Modelos

```
EmpresaConfig   razonSocial, nif, tasaIva, mensajePie   ← singleton, una sola fila, común a los 5 restaurantes
TicketConfig    restaurantId (único), nombreComercial, direccion, telefono, mensajePieOverride (null = hereda el de EmpresaConfig)
Impresora       restaurantId, nombre ("Cocina", "Barra", "Arriba"…), ip
ImpresionRuta   floorPlanId, tipoTicket ('cocina'|'barra'|'cobro'), impresoraId, copias
```

- **Empresa vs Local**: mismo patrón conceptual que "global vs restaurante" del resto de la app, pero con dos tablas distintas en vez de scope null/id, porque los campos no se superponen (razón social/NIF/IVA son de la empresa; nombre comercial/dirección son del local).
- **Rutas de impresión, por sala (`FloorPlan`) y no por restaurante**: un mismo restaurante puede tener varias salas (ej. Planta Baja / Planta Alta) con impresoras distintas, y un mismo tipo de ticket puede salir en **varios destinos a la vez con distinta cantidad de copias** (ej: la comida de la sala de arriba sale 1 copia arriba + 2 copias en la cocina de abajo — jefe de cocina + camarero de pase). `copias` por fila de `ImpresionRuta` cubre ese caso sin necesitar lógica especial.
- El envío real a la IP configurada ya funciona para comandas de cocina/barra en la rama `kit-impresion` (2026-10-08, sin desplegar): `imprimirTicketComanda` en `comandas.ts` lee `ImpresionRuta` y manda los destinos por MQTT a la Pi vinculada al restaurante (`Restaurant.piCodigo`, se vincula en la sección 📡 Raspberry Pi de `/admin/tickets` con el código de la Pi, ej. `OIDO-13FAEE`; endpoints `GET/PUT /tickets/pi`). Sin Pi vinculada no se imprime.
- **La cuenta y la factura las dibuja la API** (2026-10-30): `src/ticket-dibujo.ts` (`dibujarTicket`, `@napi-rs/canvas` + tipografía DejaVu del paquete `dejavu-fonts-ttf`, QR con `qrcode`) arma una imagen de 576 px en blanco y negro; la Box solo la imprime (`publicarImagen` en `mqtt.ts`, trabajo con `imagen` y destinos `Imagen`; sin imagen y con `cajon` solo abre el cajón; en el printer-server `_imprimir_imagen`, el cajón solo con la primera copia). Así la vista previa del admin es la misma imagen y cambiar el diseño no obliga a actualizar las Box. **Cuenta** (precuenta, sin número): al tocar «Imprimir cuenta» o reimprimir, `imprimirCuenta` en `comandas.ts`, ruta **`cobro`** de la sala. **Factura simplificada**: al cobrar, ver **Veri\*factu: factura al cobrar** más abajo. **Diseño por local** (`TicketConfig.diseno`, esquema y valores por defecto en `src/ticket-cuenta.ts`, los mismos en `DISENO_TICKET_DEFECTO` de `api.ts`): qué sale arriba (logo —`TicketConfig.logo`, PNG en blanco y negro que se sube en Local y se reduce en el navegador con `logoParaTicket`—, dirección, teléfono, razón social, NIF), camarero y pax, precio unitario, base imponible, el **orden de los platos por bloques** (pan × pax / barra / cocina / categorías de la carta, que ganan a barra y cocina; dentro de cada bloque como se pidió; por defecto pan → bebidas → comida, pedido de Eze), el texto bajo la mesa de la cuenta (por defecto «CUENTA · NO ES FACTURA»), las rayas de la propina en cada una, «imprimir la factura al cobrar» y la **serie** de las facturas del local (por defecto `L<id>`). Las líneas iguales se juntan, nombres largos en dos renglones, invitaciones a 0 con «INVITACIÓN», lo que va a 0 € sin ser invitación (platos de un menú de grupo) no sale. Editor en `/admin/tickets` → **🧾 Cuenta y factura** (`components/tickets/DisenoTicket.tsx`) con la vista previa al lado: `POST /admin/tickets/vista-previa` (solo admin) dibuja con el diseño sin guardar, sobre una comanda cerrada o una mesa de ejemplo con platos de la carta; la factura de ejemplo lleva un número inventado y no se registra. La cuenta funciona sin internet (la API de la Box dibuja igual). Decidido con Eze: **no** hay ticket por persona al pagar por separado. **Factura completa** con datos fiscales de una empresa (la piden y se manda por mail): idea para después. Una Box con el printer-server anterior no imprime ni la cuenta ni la factura.

### API (`/tickets`, `/empresa-config`)

- `GET/PUT /empresa-config` — GET crea la fila con defaults si no existe todavía (singleton)
- `GET /tickets/config?restaurantId=X` / `PUT /tickets/config` — upsert por restaurante
- `GET /tickets/impresoras?restaurantId=X` / `POST/PUT/DELETE /tickets/impresoras/:id`
- `GET /tickets/rutas?floorPlanId=X` / `POST/PUT/DELETE /tickets/rutas/:id`

### Frontend (`/admin/tickets`, `TicketsPage.tsx`)

Secciones: **Empresa** (sin selector, se edita una sola vez) → **Local** (selector de restaurante: nombre comercial, dirección, teléfono, mensaje pie propio) → **Impresoras** (nombre + IP, editable inline) → **¿A dónde sale cada ticket?** (selector de sala + por tipo Cocina/Barra/Cobro, lista de destinos con impresora+copias, botón "+ Destino") → **Vista previa** (elegís una comanda cerrada real, tabs Ticket cobro / Comanda cocina / Comanda barra, botón imprimir).

**Plantillas de ticket** (`components/tickets/`):
- `TicketCobro.tsx`: nombre comercial, dirección/NIF, mesa/camarero/hora, items con invitaciones a 0€, desglose base+IVA (`tasaIva` de `EmpresaConfig`), total, propina, método de pago, mensaje pie.
- `TicketComanda.tsx`: **agrupado por `nivel`** (no por ronda) con un divisor de línea completa "NIVEL N" — así cocina ve el orden de salida claro. Cocina agrupa por nivel; **barra no** (las bebidas no siguen orden de cursos, van todas seguidas). Todo el ticket en mayúsculas (`text-transform` en el contenedor, no hace falta `.toUpperCase()` manual). Tipografía base del ticket: Arial bold (no monoespaciada — se probó Courier y no convenció).

---

## Módulo: Pulso (dashboard en vivo para el dueño)

Ruta standalone `/pulso` (fuera del layout de `/admin`, con su propio PIN vía `PulsoGuard` — independiente del PIN de admin) pensada para que el dueño del grupo vea la facturación de todos los restaurantes en tiempo real desde el celular.

- **Datos reales (2026-10-09)**: lee `GET /turnos/activos/stats` con la misma queryKey que `FacturacionWidget` (`['facturacion-dia']`) — comandas cerradas desde la apertura del turno de cada restaurante. Se actualiza por SSE (`useAdminEvents`) en cada cobro, con polling de 30s de respaldo. Restaurantes sin turno abierto salen apagados (gris, "Sin turno abierto") y no suman al total. Ojo: es "desde que abrió el turno", no "día calendario".
- **Modo demo (para mostrarlo)**: la simulación vieja sigue disponible — cada card arranca en 0€ y sube sola imitando mesas que pagan (pax random × ticket medio, con ruido). Se activa con `/pulso?demo=1` o **manteniendo apretado el logo ~0,8s** (pensado para la PWA instalada, donde no hay barra de direcciones). Mientras está activo se ve una píldora ámbar "Demo ✕" junto a "Salir" (tocarla vuelve a los datos reales) — está a propósito, para que nadie confunda facturación inventada con real. Vive en `sessionStorage['pulso_demo']`: al cerrar la app vuelve a real. La card (`RestauranteCard`) es la misma en los dos modos: detecta sola cuándo sube el monto y dispara el flash + "+X €".
- **Animación**: al entrar se ve el `CheckOverlay` (viñeta OidoOps) ~2s, después aparece el board con fade-in. Los números usan un efecto "odómetro" (`RollingNumber`, cada dígito se remonta con `key={char}` para retriggerear la animación CSS `digitUp` — solo los dígitos que cambian suben).
- **Mobile-first de verdad**: cards en fila horizontal compacta en mobile (nombre+monto en una sola línea, sin scroll), layout apilado más grande en desktop.
- **PWA instalable por separado de `/sala` y `/admin`**: `manifest-sala.json`, `manifest-pulso.json` y `manifest-admin.json` en `public/`, cada uno con su propio `start_url`/`scope`/`id` — sin esto, Android/iOS reconocían "Añadir a inicio" de las tres rutas como la misma app. `index.html` tiene un script inline que, según el pathname, inyecta el `<link rel="manifest">` correcto, cambia el título/`apple-mobile-web-app-title`, y cambia el `apple-touch-icon` — todo antes de que el usuario le dé a instalar.
- **Ícono propio por app**: `icon-sala.svg`, `icon-pulso.svg`, `icon-admin.svg` en `public/` — mismo logo/gradiente base que `icon.svg`, con una letra (S/P/A) centrada dentro de la viñeta (`dominant-baseline="central"` para que quede bien centrada verticalmente, no solo por baseline) para poder distinguir los íconos en el home screen del teléfono.
- **Gotcha de reinstalación en Android**: una PWA instalada no es solo un acceso directo — Chrome genera un **WebAPK** registrado a nivel sistema (`Ajustes → Apps`). Borrar el ícono del home screen no siempre desinstala el WebAPK; si Chrome dice "esta aplicación ya está instalada" al reinstalar, hay que desinstalarla desde `Ajustes → Apps`, no solo sacar el ícono.

---

## Página de presentación (la vidriera)

`oidoops.ezeangeloni.xyz` — es el mismo build servido sin API detrás (`InicioPage` muestra `LandingPage` cuando `GET /api/instalacion` no responde). Vive en `apps/web/src/pages/landing/`: **todo el texto está en `copy.ts`**, los componentes en `components/` (uno por sección) y los estilos en `landing.css` (aquí sí hay CSS aparte, escopeado a `.landing-root`). Orden: Nav → Hero → Marquee → StickyFeatures ("Cómo funciona") → Camarero → Modules → Box → Verifactu → Statement → Stats → Closer.

**Regla que fijó Eze (2026-10-12): la página solo cuenta lo que OidoOps hace hoy.** La plantilla original traía funciones inventadas y se limpió entera ese día. No volver a escribir: pantalla de cocina/KDS con botón «listo» ni alertas de tiempo (cocina y barra **imprimen** tickets), exportación al contable, descuento automático de stock, fichajes/vacaciones, modos daltonismo/zurdo/lectura por voz/huella, cifras de clientes (no hay "1.234 restaurantes"), prueba gratis de 30 días ni vídeo de demo. Veri\*factu va **en futuro** ("lo estamos construyendo"). Tampoco la biografía de Eze: el bloque "Manifiesto" habla del producto ("Pensado en pleno servicio, no en un despacho").

Estado tras el 2026-10-12:
- **Hero**: la Oído Box (`public/oido-box.webp`) entra arriba a la derecha con el primer titular rotativo (`.hero-box` en `landing.css`: `top: 1vw; right: 5vw; width: clamp(320px, 40vw, 780px)`; se oculta por debajo de 1100 px). Probado con los titulares más largos ("sincronizada.", "sin papelitos.") a 1456 px de ancho: no los pisa, pero queda justo — si se agranda más, toca el texto.
- **Modules**: el titular no lleva número ("Una plataforma. Todo tu restaurante, sin cuotas extra."), seis tarjetas destacadas + fila de chips "Y además, incluido" (`copy.modules.mas`) con el resto de módulos. Al sumar un módulo a la app, añadirlo ahí.
- **Box**: sección propia (`components/Box.tsx`, `id="box"`), cuatro puntos.
- **Stats**: cifras propias del producto (4 toques, +15 módulos, 0 apps que instalar) y "Pensado para…", sin clientes.
- **Nav**: Producto · Cómo funciona · Oído Box · Veri\*factu · Contacto. Los botones del hero y de la navegación son enlaces a anclas (`#contacto`, `#features`).

**Gotcha — caché de la PWA**: tras un deploy el navegador sigue sirviendo la versión guardada. Para ver un cambio: Cmd+Shift+R (a veces dos veces) o ventana de incógnito. Eze creyó dos veces que un cambio no se había publicado por esto.

**Pendiente**:
- **"Pedir una demo" no lleva a ningún sitio**: los botones de arriba bajan al cierre, y el botón del cierre (`Closer.tsx`) no hace nada. Falta decidir el destino (correo que reciba, WhatsApp, o formulario que caiga en "Interesados" de HQ). El pie ya no muestra correo (`copy.closer.foot.email` vacío): el anterior era de un dominio que no es de Eze.
- **Mockups reales** (pedido de Eze, 2026-10-12, frenado por él a los pocos minutos sin decir por qué — **preguntarle antes de retomarlo**): que los dibujos de la página sean pantallas de verdad de la app. Idea que se empezó: capturas automáticas con Puppeteer (está instalado en `~/Desktop/dev/cv/node_modules`) sobre una copia local con los datos de `prisma/seed-demo.ts` en una base aparte, metidas en los mismos marcos de móvil/tablet. No se llegó a crear nada (ojo: `psql`/`createdb` a secas piden contraseña en este Mac y se quedan colgados; usar la URL del `.env`).
- "Sin cuotas extra" y "activa el resto cuando lo necesites" son promesas de precio: a confirmar con el socio. "Probada en servicio real" (Manifiesto): suavizar si Sensi aún no la usa a diario.
- La rejilla de tarjetas de Modules deja un hueco a la derecha en escritorio (tarjetas de 3 y 2 columnas sobre 6); venía así.
- Sin mirar en móvil nada de lo cambiado ese día (la Box del hero se oculta en pantallas chicas).
- Pantalla `/entrar` ("escribe tu grupo"): a Eze le pareció confusa.

---

## SSE — Server-Sent Events

Dos canales de eventos en tiempo real:

- **`/api/events?restaurantId=X`** — eventos de un restaurante concreto. Hook: `useRestaurantEvents` (usado en la sala del camarero y MesasFeedPage).
- **`/api/events/global`** — eventos de todos los restaurantes. Hook: `useAdminEvents` (usado en el dashboard admin).

Ambos envían un ping cada 25s y confirman conexión con `{"type":"connected"}`. El broadcast está en `apps/api/src/sse.ts` (`broadcast(restaurantId, event)` y `broadcastGlobal(event)`).

---

## Componentes compartidos (`apps/web/src/components/`)

### IconoPicker

`components/IconoPicker.tsx` (2026-10-16): selector de icono del admin — botón con el emoji actual que abre una rejilla de ~100 emojis de hostelería agrupados (Comida, Bebida, Local y limpieza, Sala y otros) + "Pega otro emoji" + Quitar. Se guarda el emoji como texto (igual que antes, sin cambios de datos). Usado en gastos habituales, categorías de la carta y categorías de la wiki. Para sumar emojis, añadirlos a `GRUPOS`.

### CheckOverlay

Overlay de confirmación animado — la viñeta de OidoOps (speech bubble con gradiente azul-verde) con la tilde blanca que se dibuja animadamente, seguida del texto "OidoOps".

**Uso:**
```tsx
import CheckOverlay from '../components/CheckOverlay'

const [showCheck, setShowCheck] = useState(false)
const triggerCheck = () => { setShowCheck(true); setTimeout(() => setShowCheck(false), 2000) }

{showCheck && <CheckOverlay />}
```

Las keyframes (`checkOverlayFade`, `checkBadgeIn`, `drawCheckStroke`, `checkTextIn`) están definidas globalmente en `index.css`.

---

## Convenciones de código

- TypeScript strict en todo
- Componentes funcionales con hooks
- React Query para todos los fetches — nunca `useEffect + fetch` manual
- Tailwind para estilos, sin CSS separado
- Zod para validación en el backend
- Nombres en español para variables de dominio (comanda, mesa, retiro, empleado)
- Nombres en inglés para términos técnicos (handler, props, state)

## TypeScript — errores frecuentes a evitar

**Siempre verificar con `cd apps/web && npx tsc --noEmit` antes de hacer commit.** El build de producción falla si hay errores TS.

Errores que han ocurrido:

1. **Funciones declaradas y no usadas** — eliminarlas directamente, no dejarlas comentadas.
   ```ts
   // ❌ function fmtFecha(...) { ... }  // declared but never read
   ```

2. **`Object.entries()` devuelve `string`**, no el tipo union de la key. Castear explícitamente:
   ```ts
   // ❌ onClick={() => setTipoLocal(t)}
   // ✅ onClick={() => setTipoLocal(t as Mesa['tipo'])}
   ```

3. **Props de componentes con tipo `string` cuando el estado espera un union type** — usar `Mesa['tipo']` en lugar de `string` en las interfaces de props:
   ```ts
   // ❌ onConfirm: (data: { tipo: string }) => void
   // ✅ onConfirm: (data: { tipo: Mesa['tipo'] }) => void
   ```

4. **Desestructurar propiedades que no existen en el tipo** — si un array de objetos no tiene una propiedad opcional, no desestructurarla o añadirla al tipo:
   ```ts
   // ❌ items.map(({ to, label, end }) => ...)  // si 'end' no está en el tipo
   // ✅ items.map(({ to, label }) => ...)
   ```
