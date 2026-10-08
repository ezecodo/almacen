# Kit de impresión — del prototipo al local real

Cómo funciona hoy el servidor de impresión (prototipo) y cómo tiene que quedar instalado en un restaurante de verdad. Decisiones acordadas con Eze el 2026-10-08.

**Leyenda de estado**, usada en todo el documento:

- ✅ **Hecho** — implementado y probado.
- 🟡 **Diseñado** — acordado, sin implementar todavía.
- ❓ **Abierto** — falta decidir o probar.

---

## 1. Las piezas

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| **API** (`apps/api`) | VPS | Al enviar una comanda, publica el ticket por MQTT |
| **Broker MQTT** (Mosquitto) | VPS, `mqtt.ezeangeloni.xyz:8883` con TLS | Pasa los mensajes entre la API y las Pi |
| **`printer-server`** (Python) | Raspberry Pi del local | Recibe tickets y los imprime por red en las térmicas |
| **Impresoras** Epson TM-T20II | Local | Reciben ESC/POS por TCP en el puerto 9100 |
| **Admin** `/admin/tickets` | Navegador | Pantalla para cargar impresoras y rutas |

La Pi **siempre abre la conexión hacia afuera** (hacia el VPS). En el local no se abre ningún puerto ni se toca el router para que esto funcione.

El código de la Pi vive en `~/Desktop/dev/printer-server`, **fuera de este repo**, con su propio git local (sin repositorio remoto). Para llevar un cambio a la Pi, desde la app Terminal del Mac: `scp <archivos> oido@oido.local:printer-server/` y después, en la Pi, `sudo systemctl restart printer-server`.

---

## 2. El prototipo hoy ✅

### Montaje físico

```
Internet ── WiFi de casa ··· Pi "oido" ── cable de red directo ── 1 Epson
```

- La Pi sale a internet **por WiFi**.
- La impresora está enchufada **directo al puerto de red de la Pi**, sin router ni switch en el medio.
- Para que se hablen por ese cable, la Pi tiene una IP fija puesta a mano en su puerto de red (`192.168.192.1`) y la impresora usa su IP de fábrica (`192.168.192.168`).

Este montaje sirve solo para probar: **una Pi no puede tener más de una impresora así**, y la IP fija hay que sacarla antes de pasar a un local (ver sección 6).

### Banco de pruebas con el AirPort (desde 2026-10-08)

Paso intermedio entre el cable directo y un local real: un AirPort Extreme viejo (A1143) hace de "router del kit", sin internet.

```
WiFi de casa ··· Pi ── cable ── AirPort "OidoKit" ──┬── Epson 1
                                                    └── Epson 2
```

- **AirPort** ✅: configurado como `OidoKit-Router`, WiFi `OidoKit`. Reparte IPs `10.0.1.x` aunque no tenga internet (él es `10.0.1.1`). La luz ámbar parpadeando es solo por la falta de internet.
- **Pi** ✅: el puerto de red ya **no tiene IP fija**. Recibe IP del AirPort (`10.0.1.3`) y tiene `ipv4.never-default yes`, para seguir saliendo a internet por el WiFi de casa y no por el cable. **Ese ajuste hay que quitarlo en un local real**, donde el cable sí es la salida a internet:
  `sudo nmcli con mod netplan-eth0 ipv4.never-default no && sudo nmcli con up netplan-eth0`
- **Impresora 1** ✅ (dirección física `38:9D:92:23:C1:BD`): enchufada al AirPort y pasada de IP fija a **automática**. Tiene reservada la IP `10.0.1.4` en el AirPort: se probó apagándola y encendiéndola, y volvió a recibir la misma. La Pi imprime en ella por el puerto 9100, a través del router.
- **Impresora 2** ❓: todavía no se probó.

### Cómo pasar una Epson de la IP de fábrica a automática ✅

Probado el 2026-10-08 con la TM-T20II. Se hace una vez por impresora, en casa:

1. Enchufar la impresora al mismo router o switch que la Pi.
2. En la Pi, darle una dirección temporal en la red de fábrica de la impresora (se pierde al reiniciar):
   `sudo ip addr add 192.168.192.2/24 dev eth0`
3. Desde el Mac, en la app Terminal, abrir un túnel a la página de configuración de la impresora:
   `ssh -L 8443:192.168.192.168:443 oido@oido.local`
4. Abrir `https://localhost:8443` en el navegador y aceptar el aviso de certificado. Usuario `epson`, contraseña `epson`.
5. Menú **Configuration → TCP/IP** (el de abajo; el de "Information" es solo lectura) → **Acquiring the IP Address: Auto** → **Send**. APIPA queda en "Disable".
6. La página se queda en "please wait" porque la impresora cambió de IP. No hizo falta reiniciarla.
7. Buscar la IP nueva desde la Pi, por la dirección física de la impresora (las Epson empiezan por `38:9d:92`):
   `(for i in $(seq 2 30); do ping -c1 -W1 10.0.1.$i >/dev/null & done; wait); ip neigh | grep -i 38:9d:92`
8. Imprimir una prueba en la IP nueva:
   `printf '\x1b@PRUEBA\n\n\n\n\n\x1dV\x01' | nc -w 2 <ip> 9100`

### Reservar la IP de una impresora en el AirPort ✅

1. El Mac tiene que estar **enchufado por cable** al AirPort. Por WiFi está en la red de casa y no lo ve.
2. En AirPort-Dienstprogramm, menú **Andere WLAN-Geräte → USB 10/100/1000 LAN**. Si queda marcado "WLAN", busca por el WiFi y el AirPort no aparece.
3. Clic en el AirPort → **Bearbeiten** → pestaña **Netzwerk** → **+** bajo **DHCP-Reservierungen**: descripción, dirección física de la impresora y la IP a reservar.
4. **Sichern** → **Aktualisieren**. El AirPort se reinicia, tarda alrededor de un minuto.

Aprendido en la prueba:

- **Al reiniciarse, el AirPort olvida las IPs que había repartido.** La Pi pasó de `10.0.1.3` a `10.0.1.6`. Solo las reservadas se mantienen, así que toda impresora necesita su reserva.
- **Una impresora recién encendida tarda en estar lista.** A los 20 segundos todavía no imprimía; un poco después sí. El comando `nc` no avisa si falla: antes de sospechar de la red, comprobar con `ping`.
- **El Mac no debe tener el cable por encima del WiFi** en el orden de conexiones, o intenta salir a internet por el AirPort, que no tiene.
- Para volver al montaje viejo (impresora directo a la Pi) sin tocar la configuración: `sudo ip addr add 192.168.192.1/24 dev eth0`. Es temporal, se pierde al reiniciar.

### Recorrido de un ticket

En producción todavía corre la versión anterior de la API. Lo que sigue describe la rama `kit-impresion`, que es lo que ya corre en la Pi y en local:

1. El camarero toca "Enviar" → `PATCH /comandas/:id/enviar`.
2. La API busca la Pi vinculada al restaurante y las rutas de la sala de esa mesa (`imprimirTicketComanda` en `apps/api/src/routes/comandas.ts`), y publica el ticket con sus destinos en `pi/<codigo>/trabajo/<ticket_id>`. No espera respuesta: si MQTT falla, la comanda se envía igual.
3. La Pi lo recibe, lo guarda en una cola local (SQLite) y lo manda a imprimir en el momento, a las IPs que vienen en el mensaje.
4. Si la impresora no responde, reintenta hasta 5 veces.
5. La Pi publica el resultado (impreso / fallido) en `pi/<codigo>/resultado/<ticket_id>`.

### Límites que quedan

- **Nadie mira el resultado.** La Pi avisa si imprimió o falló, pero la API no escucha esos mensajes: si un ticket no sale, no se entera nadie. Lo único que se ve en el admin es si la Pi está conectada.
- **Solo imprime comandas** de cocina y barra. No hay ticket de cobro ni apertura de cajón.
- **En producción falta vincular.** La vinculación y el enrutamiento ya están desplegados, pero Sensi Tapas todavía no tiene la Pi vinculada ahí y sus impresoras tienen IPs inventadas: hasta corregirlas y vincular, la Pi solo imprime lo que se comanda desde la API local.

---

## 3. El local real 🟡

### Montaje físico

```
Internet ── Router del kit ──┬── Pi
                             ├── Impresora cocina
                             └── Switch ──┬── Impresora barra
                                          ├── Impresora planta alta
                                          └── (cajón: por RJ11 a su impresora)
            Router del kit ··· WiFi ··· Handys / PADs del personal
```

- **Todo por cable.** La Pi va por cable de red, no por WiFi: no hay nada que configurar y no depende de la señal en la cocina.
- **Pi e impresoras en la misma red.** Da igual si cuelgan del router o de un switch, mientras todo dependa del mismo router. Una red de invitados o un segundo router las separa y dejan de verse.
- **Mejor en el router del kit** que en el del local: así las IPs fijas de las impresoras no dependen de lo que haga el dueño del local con su router.
- **El switch** hace falta solo si no alcanzan los puertos del router.
- **Planta alta**: un cable de red desde abajo, o un segundo switch arriba conectado al de abajo. Sigue siendo la misma red.
- **Cajón de efectivo**: no es un aparato de red. Va por cable RJ11 al puerto DK de la impresora donde se cobra. En Sensi Tapas hay dos, uno por planta.

### Diferencias con el prototipo

| | Prototipo | Local real |
|---|---|---|
| Conexión de la Pi | WiFi | Cable al router o switch |
| IP de la Pi | Fija, puesta a mano | Automática (la da el router) |
| Conexión de las impresoras | 1, directo a la Pi | Varias, al router o switch |
| IP de las impresoras | La de fábrica | Fija dentro de la red del local |
| Quién decide a dónde sale cada ticket | `config.py` en la Pi | `/admin/tickets` |
| Cómo sabe la Pi de qué restaurante es | Archivo `.env` | No lo sabe: se vincula desde el admin |
| Cambiar una ruta o una IP | SSH a la Pi | Editar en el admin |
| Restaurantes soportados | 1 | Todos |

---

## 4. Las decisiones de diseño

Estado de cada una: 4.1 ✅ · 4.2 ✅ · 4.3 ✅ · 4.4 ✅ · 4.5 ✅. Lo marcado ✅ está hecho y probado con la Pi real. 4.1 y 4.2 están desplegados en producción desde el 2026-10-08; 4.3 está en `main` local, sin subir; 4.5 vive solo en el `printer-server`.

### 4.1 Vinculación Pi ↔ restaurante por código

La Pi no guarda de qué restaurante es. Se identifica con un **código corto propio**, `OIDO-` más los últimos 6 dígitos de su número de serie de fábrica (por ejemplo `OIDO-7F3A2C`), y en el admin se le dice a cada restaurante cuál es su Pi.

1. En casa: se le pega a la carcasa una etiqueta con su código.
2. En el local: se enchufa. Se conecta sola al VPS y avisa "estoy en línea".
3. En `/admin/tickets`, sección **📡 Raspberry Pi** del restaurante: se escribe el código de la etiqueta y se toca "Vincular". Un punto verde indica que la Pi está conectada.

Consecuencias:

- **Todas las Pi son iguales.** Se clona la misma tarjeta SD para todas.
- **Si se rompe una Pi**, se enchufa otra y se cambia el código en el admin. Impresoras y rutas no se tocan, porque viven en el admin.
- **Si se rompe solo la tarjeta SD**, se pone otra clonada en la misma Pi: el código no cambia.

Hecho y probado el 2026-10-08:

- **Código de la Pi del prototipo: `OIDO-13FAEE`.** Sale en el log al arrancar ("Código de esta Pi: …") y con `cd ~/printer-server && venv/bin/python3 -c "import config; print(config.PI_CODIGO)"`.
- **Dónde se guarda**: `Restaurant.piCodigo` (único). Endpoints `GET /tickets/pi?restaurantId=X` y `PUT /tickets/pi { restaurantId, codigo }` (`codigo: null` desvincula).
- **Validaciones**: rechaza códigos mal formados y no deja vincular la misma Pi a dos restaurantes. Acepta minúsculas y el código sin el `OIDO-`.
- **Conectada / sin conexión**: la Pi publica su estado y el broker la marca caída si se corta. Probado matando el proceso de golpe: el admin lo mostró en menos de 5 segundos.
- **Sin Pi vinculada, el restaurante no imprime.** No hay destino por defecto.

### 4.2 El enrutamiento lo resuelve la API

Al enviar una comanda, la API busca en `ImpresionRuta` las rutas de la sala (`FloorPlan`) de esa mesa y manda a la Pi el trabajo **con los destinos ya resueltos**: a qué IP y cuántas copias. La Pi no decide nada, solo imprime.

- Los tipos de ticket son los que ya tiene `ImpresionRuta`: `cocina`, `barra`, `cobro`.

Hecho y probado el 2026-10-08:

- **API** (`imprimirTicketComanda` en `comandas.ts`): arma `destinos` por tipo de item con impresora, IP y copias sacados de `ImpresionRuta`. Ya no hay regex de zona ni `MQTT_RESTAURANTE_ID`.
- **Pi** (`router.py`, `printer.py`): imprime en los destinos del mensaje. Ya no tiene `IMPRESORAS` ni `ENRUTAMIENTO` en `config.py`.
- **Regla**: lo cargado en el admin manda. Un tipo de item sin ruta en esa sala no se imprime en ningún lado.
- **Probado de punta a punta**: IP de la impresora cargada en `/admin/tickets` → comanda desde `/sala` → ticket impreso, con la cabecera mostrando el nombre de la sala.

**Cómo probar en local sin tocar producción**: la API local publica al mismo broker que producción si su `.env` tiene las variables `MQTT_*` (copiadas del `.env` del servidor). Vinculando la Pi a un restaurante en el admin local, una comanda hecha en `localhost:5173/sala` sale en la Pi real.

### 4.3 La Pi detecta las impresoras, el admin las configura

No hay página de configuración de impresoras en la Pi. La Pi solo hace lo que nadie más puede hacer desde afuera: mirar la red del local.

1. La Pi recorre las redes a las que está conectada buscando aparatos que acepten conexión en el puerto 9100, y le manda la lista al VPS. Lo hace al conectarse, cuando se le pide desde el admin y cada 15 minutos.
2. En `/admin/tickets` → **🖨️ Impresoras** aparecen como "Detectadas en la red sin añadir", con su IP y su dirección física.
3. Botón **"Probar"**: esa impresora imprime un papel con su IP. Sirve para saber físicamente cuál es cuál.
4. Se le pone nombre ("Cocina", "Barra", "Arriba"), se toca "+ Añadir" y se asignan las rutas en la pantalla que ya existe.

Hecho y probado el 2026-10-08 con la Pi real, que encontró sola la Epson en `10.0.1.4`:

- **Buscar no imprime nada**: la Pi solo abre y cierra la conexión, no manda datos.
- **Punto verde o rojo** junto a cada impresora ya cargada: indica si la Pi la encuentra en la red. Rojo = IP mal escrita o impresora apagada.
- **"🔍 Buscar de nuevo"** lanza una búsqueda en el momento. Tarda unos 10 segundos con tres redes.
- **"Probar" solo acepta IPs** que la Pi detectó o que ya están cargadas en ese restaurante.
- **Si la Pi no está conectada**, buscar y probar responden con un aviso en vez de fallar en silencio.
- **Cada red se recorta a 254 direcciones** (`/24`). Si un local tuviera una red más grande, se puede forzar con `REDES_ESCANEO` en el `.env` de la Pi.
- Código: `red.py` en el `printer-server`; `GET /tickets/pi/impresoras`, `POST /tickets/pi/escanear` y `POST /tickets/pi/probar` en la API.

Pendiente: la impresora se guarda por IP. Si su IP cambia, hay que corregirla a mano; guardar también la dirección física permitiría seguirla sola.

### 4.4 Una sola contraseña del broker para todas las Pi

Todas las Pi usan el mismo usuario y contraseña de MQTT, grabados en la tarjeta SD. Es lo único que lleva el `.env` de la Pi. El broker hoy no limita qué puede leer cada usuario.

- **A favor**: las Pi quedan idénticas y clonables.
- **En contra**: quien saque la contraseña de una Pi podría leer los tickets de los demás locales.
- **Cuándo cambiarlo**: al instalar OidoOps en otro grupo de restaurantes. Ahí conviene una contraseña por Pi, con permisos limitados a sus propios mensajes.

### 4.5 Portal WiFi para la primera conexión

Para que un manager pueda instalar la Pi solo en un local sin cable de red hasta ella, sin SSH. Confirmado con Eze el 2026-10-08.

**Estado al 2026-10-08: construido y probado de punta a punta con la Pi real.** Vive en el `printer-server` (`portal.py` + `oido-portal.service`, servicio aparte que corre como root) y está instalado en la Pi del prototipo. Es una página propia sobre NetworkManager, sin herramientas externas.

Probado cortándole el WiFi a la Pi:

- La Pi levantó sola la red abierta `OIDO-13FAEE` en un minuto y medio.
- El portal se abrió en el teléfono, con la lista de redes.
- Tras elegir la red y escribir la contraseña, la Pi se conectó en 9 segundos, su red desapareció y volvió a figurar "Conectada" en el dashboard.
- Ante un intento fallido, la Pi volvió a levantar su red y la página mostró el error.
- Sin nadie usando el portal, cada 5 minutos baja su red unos 40 segundos para reintentar las redes que ya conoce y actualizar la lista, y la vuelve a subir.

**Fallo encontrado y corregido**: los dos primeros intentos fallaron con `802-11-wireless-security.key-mgmt: property is missing`. No era la contraseña: el comando rápido `nmcli device wifi connect` no logra deducir el tipo de seguridad de la red. El portal ahora crea el perfil a mano indicando la seguridad (`wpa-psk`, o `sae` para WPA3) y después lo activa. No volver a usar `device wifi connect`.

**Para probar el portal**: `sudo nmcli con down <perfil-wifi>` deja a la Pi sin WiFi hasta el próximo reinicio. Conviene estar entrando a la Pi por cable, para no perder el acceso ni el registro (`journalctl -u oido-portal -n 30 --no-pager`).

**Sin probar todavía**: reiniciar la Pi y comprobar que vuelve sola al WiFi configurado por el portal; red con WPA3 puro; red oculta; iPhone (la prueba fue con un solo teléfono).

**Etiqueta de la Pi**: lleva el código (`OIDO-13FAEE`) y un **código QR** que conecta el teléfono a la red WiFi de la Pi con solo apuntarle la cámara. Funciona en iPhone y Android, sin app.

**Flujo:**

1. La Pi arranca. Si tiene cable, se conecta sola y nada de esto aparece.
2. Si no tiene ninguna conexión, crea su propia red WiFi, con su código como nombre (`OIDO-13FAEE`).
3. El manager escanea el QR. El teléfono se conecta a esa red y se le abre sola una página (portal cautivo).
4. La página muestra el código de la Pi y la **lista de redes WiFi que la Pi ve alrededor**, con su señal. Hay un botón "Mi red no aparece" para escribir el nombre a mano (redes ocultas).
5. Elige el WiFi del local, escribe la contraseña y toca "Conectar".
6. La Pi apaga su red, se conecta al WiFi del local y arranca el servicio de impresión.

**Cómo se sabe si funcionó.** La Pi tiene una sola antena: no puede mantener su red y a la vez conectarse a la del local. Al cambiar, el teléfono pierde la página, así que la confirmación no puede aparecer ahí.

- **Salió bien**: la red `OIDO-…` desaparece, el teléfono vuelve a su WiFi habitual y en el dashboard la Pi aparece "Conectada" al vincular su código (4.1).
- **Contraseña incorrecta**: la Pi no logra conectarse, vuelve a levantar su red en un minuto más o menos y, al entrar de nuevo, la página avisa que no pudo conectarse a esa red.
- Antes del corte, la página lo explica: "Si en un minuto vuelve a aparecer la red OIDO-13FAEE, es que la contraseña no era correcta."

**Otros casos:**

- **El local cambia de router o de contraseña**: la Pi se queda sin conexión, vuelve a levantar su red sola y se repite el proceso con el QR.
- **Con cable no hace falta**, y con el router del kit tampoco: su WiFi lo define Eze y la Pi puede salir de casa ya configurada. Esto resuelve el caso de un local con router propio y sin cable hasta la Pi.

**Notas de implementación:**

- **Se usan herramientas existentes** para la Pi, no se programa el portal desde cero. Falta elegir cuál.
- **No contradice** el descarte de una página de configuración en la Pi: esto es solo para darle red, que es lo único que no se puede hacer desde el dashboard.
- **Para probarlo** hay que dejar a la Pi sin WiFi a propósito, lo que corta el SSH. Conviene tenerla además por cable, para no perder el acceso.

**Por qué no Bluetooth.** Desde una página web, Bluetooth solo funciona en Chrome (Android, Mac, Windows), no en iPhone ni iPad, y muchos managers tienen iPhone. Cubrirlos obligaría a desarrollar y publicar una app para un paso que se hace una vez por local. A favor tenía que todo pasa dentro del dashboard, sin cambiar de red, y que la Pi puede avisar en el momento si la contraseña está mal. Queda como mejora opcional si las instalaciones las hace siempre Eze con Android.

### Descartado

- **Página web en la Pi para configurar impresoras y rutas.** Duplica la configuración en dos lugares, solo se puede abrir estando en el WiFi del local y obliga a mantener un servidor web con login en cada Pi.
- **Que la Pi descargue su tabla de rutas y siga decidiendo ella.** Solo tendría sentido para imprimir sin internet, y el modo offline está pausado.
- **Bluetooth para la primera conexión.** Ver 4.5.

---

## 5. Mensajes entre la API y la Pi

Todo cuelga del código de la Pi, no del restaurante.

| Tema MQTT | Quién publica | Para qué | Estado |
|---|---|---|---|
| `pi/<codigo>/trabajo/<id>` | API | Un trabajo a imprimir | ✅ |
| `pi/<codigo>/resultado/<id>` | Pi | Si se imprimió o falló | ✅ lo publica la Pi; la API todavía no lo escucha |
| `pi/<codigo>/estado` | Pi | `online` / `offline`, retenido (el broker pone `offline` si la Pi se cae) | ✅ |
| `pi/<codigo>/impresoras` | Pi | Lista de impresoras detectadas en la red, retenido | ✅ |
| `pi/<codigo>/orden` | API | Pedido puntual: buscar impresoras de nuevo o imprimir una prueba. Sin garantía de entrega a propósito: a una Pi desconectada no debe llegarle más tarde | ✅ |

La Pi se suscribe **solo** a `pi/<codigo>/trabajo/#`. Sus propios avisos van por temas hermanos, nunca por debajo de `trabajo/`: con el esquema anterior ya pasó que la Pi recibía sus propias confirmaciones como si fueran tickets nuevos.

Ticket de comanda, tal como viaja hoy:

```json
{
  "ticket_id": "cmd-123-r2",
  "sala": "Planta Alta",
  "mesa": "14",
  "camarero": "Ana",
  "pax": 4,
  "timestamp": "2026-10-08T19:42:10.000Z",
  "items": [
    { "nombre": "Patatas bravas", "cantidad": 2, "tipo": "Comida", "nivel": 1, "notas": null },
    { "nombre": "Vermut", "cantidad": 1, "tipo": "Bebida", "nivel": 1, "notas": null }
  ],
  "destinos": {
    "Comida": [
      { "impresora": "Cocina", "ip": "10.0.1.4", "copias": 2 },
      { "impresora": "Arriba", "ip": "10.0.1.5", "copias": 1 }
    ],
    "Bebida": [{ "impresora": "Barra", "ip": "10.0.1.6", "copias": 1 }]
  }
}
```

La Pi parte el ticket por tipo de item (comida / bebida) y arma un trabajo por cada destino de ese tipo.

Trabajos que faltan definir 🟡: ticket de **cobro** (con apertura de cajón si se cobró en efectivo) y **cajón** solo (botón "Abrir cajón" del encargado).

---

## 6. Instalación en un local 🟡

### Antes de ir (en casa)

1. Clonar la tarjeta SD con el `printer-server` instalado y la contraseña del broker.
2. Arrancar la Pi una vez, leer su código en el log (`journalctl -u printer-server -n 20 --no-pager`) y pegarle la etiqueta.
3. Comprobar que el puerto de red de la Pi está en **automático** y que puede usarse para salir a internet. La Pi del prototipo tiene puesto `never-default` para el banco de pruebas, y hay que quitarlo:
   `sudo nmcli con mod netplan-eth0 ipv4.method auto ipv4.addresses "" ipv4.never-default no && sudo nmcli con up netplan-eth0`
4. En cada impresora, comprobar con el autotest (encender manteniendo FEED) que la interfaz activa es **Ethernet** y no USB. Si quedó en USB, la red no funciona aunque el cable esté bien.

### En el local

1. Montar router, switch y cables. Pi e impresoras en la misma red.
2. Enchufar las impresoras (ya en automático, ver sección 2) y **reservarle a cada una su IP en el router del kit**, por su dirección física.
3. Enchufar la Pi. En el admin tiene que aparecer "en línea".
4. `/admin/tickets` → restaurante → **📡 Raspberry Pi** → escribir el código de la etiqueta → **Vincular**.
5. `/admin/tickets` → cargar las impresoras con sus IPs. Cuando esté la detección: impresoras detectadas → **Probar** cada una y ponerle nombre.
6. Asignar las rutas por sala: cocina, barra y cobro, con sus copias.
7. Prueba real: comandar una mesa de cada sala con comida y bebida, y revisar que cada ticket sale donde tiene que salir, con las copias correctas.
8. Enchufar cada cajón a su impresora y probar "Abrir cajón".

### Cuando algo falla

| Síntoma | Qué mirar primero |
|---|---|
| La Pi no aparece "en línea" | Cable de red, y que el local tenga internet |
| La Pi no detecta una impresora | Autotest de la impresora: interfaz activa y su IP |
| "Probar" funciona pero las comandas no salen | Rutas de esa sala en `/admin/tickets` |
| Sale en la impresora equivocada | Nombres mal asignados: volver a "Probar" cada una |
| Se rompió la Pi | Enchufar la de repuesto y cambiar el código en el admin |

---

## 7. Puntos abiertos ❓

- ~~**IP fija de las impresoras.**~~ Resuelto el 2026-10-08: las impresoras van en **automático** y la IP se fija con una **reserva en el router del kit**, por la dirección física de cada impresora. El procedimiento está en la sección 2, reserva incluida y probada. Se descartó escribir la IP fija en la impresora: obliga a configurarla para la red de cada local, y si esa red cambia queda inalcanzable.
- **Tickets viejos.** Si la Pi estuvo caída y vuelve, el broker le entrega lo que quedó pendiente. Hay que descartar los trabajos con más de unos minutos, para que no salga en cocina una comanda de hace una hora.
- **Avisar cuando no imprime.** Mostrar en el admin (y quizá en la app de sala) cuando una sala no tiene rutas, la Pi está sin conexión o un ticket falló.
- **Reimprimir comanda.** Botón para volver a mandar un ticket: cubre el hueco mientras se cambia una Pi y el caso de quedarse sin papel.
- **Segunda Epson.** Todavía no se probó.
- **Conexión por SSH a la Pi desde el Mac.** Falla de forma intermitente y no se encontró la causa. Con este diseño deja de hacer falta para el día a día, pero sigue siendo necesaria para actualizar el `printer-server`.
- **Actualizar el `printer-server` en las Pi ya instaladas.** No hay mecanismo: hoy es copiar archivos a mano.

---

## 8. Orden de implementación

Acordado el 2026-10-08:

1. ~~**Enrutamiento desde el admin**~~ (4.2). Hecho.
2. ~~**Vinculación por código**~~ (4.1). Hecho.
3. ~~**Detección de impresoras + botón "Probar"**~~ (4.3). Hecho.
4. ~~**Portal WiFi**~~ (4.5). Hecho. Falta la etiqueta con el QR.
5. **Ticket de cobro y cajón**, automático en efectivo y botón manual. Es lo único de la lista que ve el restaurante.
6. Avisos de fallo y "reimprimir comanda".

### Día cero completo, probado de corrido (2026-10-08)

Con la Pi sin WiFi, sin vincular y sin impresoras cargadas, se hizo toda la instalación sin SSH y sin escribir ninguna IP:

1. La Pi levantó su red `OIDO-13FAEE`; desde el teléfono se le dio el WiFi con el portal.
2. En `/admin/tickets` se vinculó con su código y pasó a "Conectada".
3. La impresora apareció sola como detectada; se le puso nombre y se añadió.
4. Se le asignó la ruta de cocina de una sala.
5. Una comanda de esa sala salió impresa.

Hecho contra la API local, con una impresora. Falta repetirlo en un local real y con más de una impresora.

### Alternativa: kit armado en casa

Como el router viaja con el kit, las IPs se pueden dejar resueltas antes de enviarlo, y el manager solo enchufa:

1. En casa: armar router, Pi e impresoras, y reservarle su IP a cada impresora en el router.
2. Cargar esas IPs y las rutas en `/admin/tickets` del restaurante.
3. Probar una comanda.
4. Desenchufar y enviar. En el local las impresoras reciben las mismas IPs, porque el router es el mismo.

### Tareas sueltas

- ~~Poner `~/Desktop/dev/printer-server` bajo git.~~ Hecho el 2026-10-08, solo en local, sin repositorio remoto.
- ~~Desplegar la rama `kit-impresion`.~~ Hecho el 2026-10-08. Falta, en el admin de producción: corregir las impresoras de Sensi Tapas, que tienen **IPs inventadas** (`192.168.0.2`, `.3`, `.4`), y recién después vincular la Pi.
- Sacar de este repo la carpeta `-x/`: es una copia vieja del `printer-server` con su `venv`, commiteada por accidente.
- ~~Quitar del `config.py` de la Pi el bloque temporal con la impresora "test".~~ Hecho: el `config.py` nuevo ya no tiene impresoras. En la Pi quedaron copias `*.bak` de los archivos anteriores, se pueden borrar.
