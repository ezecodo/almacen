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

1. El camarero toca "Enviar" → `PATCH /comandas/:id/enviar`.
2. La API arma el ticket (`imprimirTicketComanda` en `apps/api/src/routes/comandas.ts`) y lo publica en `restaurante/<id>/ticket/<ticket_id>`. No espera respuesta: si MQTT falla, la comanda se envía igual.
3. La Pi lo recibe, lo guarda en una cola local (SQLite) y lo manda a imprimir en el momento.
4. Si la impresora no responde, reintenta hasta 5 veces.
5. La Pi publica el resultado (impreso / fallido) en `restaurante/<id>/ticket-status/<ticket_id>`.

### Qué está escrito a mano en el código

| Qué | Dónde | Valor hoy |
|---|---|---|
| A qué restaurante se publica | `.env` de la API, `MQTT_RESTAURANTE_ID` | Uno solo para toda la app (`sensi-tapas-pb`) |
| Zona de la mesa | `comandas.ts` | Regex: si la sala se llama algo con "alta" → `PA`, si no → `PB` |
| IPs de las impresoras | `config.py` de la Pi, `IMPRESORAS` | IPs de ejemplo `192.168.1.101-103` |
| Qué sale por cada impresora | `config.py` de la Pi, `ENRUTAMIENTO` | Tabla fija por zona + tipo (Bebida/Comida) |
| De qué restaurante es la Pi | `.env` de la Pi, `RESTAURANTE_ID` | `sensi-tapas-pb` |

### Límites del prototipo

- **Solo sirve para un restaurante.** Todas las comandas, de cualquier local, se publican al mismo destino.
- **`/admin/tickets` no se usa en producción.** Las tablas `Impresora` e `ImpresionRuta` existen y se pueden cargar, pero la API desplegada no las lee. El enrutamiento desde el admin ya está hecho en la rama `kit-impresion` (ver 4.2), sin desplegar.
- **Cualquier cambio es por SSH** mientras no se despliegue esa rama: una ruta, una copia más o una IP nueva obligan a editar `config.py` en la Pi y reiniciar el servicio.
- **Nadie mira el resultado.** La Pi avisa si imprimió o falló, pero la API no escucha esos mensajes: si un ticket no sale, no se entera nadie.
- **Solo imprime comandas** de cocina y barra. No hay ticket de cobro ni apertura de cajón.

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

Estado de cada una: 4.1 🟡 · 4.2 ✅ en local, sin desplegar · 4.3 🟡 · 4.4 🟡 · 4.5 🟡

### 4.1 Vinculación Pi ↔ restaurante por código

La Pi no guarda de qué restaurante es. Se identifica con un **código corto propio** (por ejemplo `OIDO-7F3A`), derivado de su número de serie de fábrica, y en el admin se le dice a cada restaurante cuál es su Pi.

1. En casa: se le pega a la carcasa una etiqueta con su código.
2. En el local: se enchufa. Se conecta sola al VPS y avisa "estoy en línea".
3. En el admin, dentro del restaurante: "Vincular Pi" → se escribe el código de la etiqueta.

Consecuencias:

- **Todas las Pi son iguales.** Se clona la misma tarjeta SD para todas.
- **Si se rompe una Pi**, se enchufa otra y se cambia el código en el admin. Impresoras y rutas no se tocan, porque viven en el admin.
- **Si se rompe solo la tarjeta SD**, se pone otra clonada en la misma Pi: el código no cambia.

### 4.2 El enrutamiento lo resuelve la API

Al enviar una comanda, la API busca en `ImpresionRuta` las rutas de la sala (`FloorPlan`) de esa mesa y manda a la Pi el trabajo **con los destinos ya resueltos**: a qué IP y cuántas copias. La Pi no decide nada, solo imprime.

- Los tipos de ticket son los que ya tiene `ImpresionRuta`: `cocina`, `barra`, `cobro`.

**Primera versión hecha y probada el 2026-10-08** (rama `kit-impresion` de este repo + `printer-server`), compatible con el formato anterior:

- **API** (`imprimirTicketComanda` en `comandas.ts`): agrega al mensaje un campo `destinos`, por tipo de item, con impresora, IP y copias sacados de `ImpresionRuta`. El tema MQTT y el resto del mensaje no cambian.
- **Pi** (`router.py`, `printer.py`): si el mensaje trae `destinos`, imprime ahí y no consulta su tabla. Si no trae, enruta por zona como antes.
- **Regla**: si la sala tiene al menos una ruta de cocina o barra, lo cargado en el admin manda, y un tipo sin ruta no se imprime en ningún lado. Si la sala no tiene ninguna ruta, no se manda `destinos` y la Pi usa su tabla.
- **Probado de punta a punta**: IP de la impresora cargada en `/admin/tickets` → comanda desde `/sala` → ticket impreso, con la Pi respondiendo "impreso" a los 2 segundos.

```json
"destinos": {
  "Comida": [{ "impresora": "COCINA", "ip": "10.0.1.4", "copias": 1 }],
  "Bebida": [{ "impresora": "BARRA ABAJO", "ip": "192.168.0.4", "copias": 1 }]
}
```

Lo que falta para completar 4.2, y que llega con la vinculación (4.1):

- Sacar `IMPRESORAS` y `ENRUTAMIENTO` del `config.py` de la Pi.
- Sacar el regex de zona y `MQTT_RESTAURANTE_ID` de la API.

⚠️ **Antes de desplegar esta rama**: en producción, `/admin/tickets` de Sensi Tapas tiene tres impresoras con **IPs inventadas** (`192.168.0.2`, `.3`, `.4`) y rutas en las dos plantas. La Pi ya obedece los destinos que reciba, así que al desplegar, las comandas reales se mandarían a esas IPs y no saldrían. Hay que corregir o borrar esas impresoras en producción primero.

**Cómo probar en local sin tocar producción**: la API local publica al mismo broker que producción si su `.env` tiene las variables `MQTT_*` (copiadas del `.env` del servidor). Con eso, una comanda hecha en `localhost:5173/sala` sale en la Pi real.

### 4.3 La Pi detecta las impresoras, el admin las configura

No hay página de configuración en la Pi. La Pi solo hace lo que nadie más puede hacer desde afuera: mirar la red del local.

1. La Pi escanea su red buscando aparatos que respondan en el puerto 9100 y le manda la lista al VPS.
2. En `/admin/tickets` aparecen como "Impresoras detectadas", con su IP.
3. Botón **"Probar"**: esa impresora imprime un papel con su IP. Sirve para saber físicamente cuál es cuál.
4. Se le pone nombre ("Cocina", "Barra", "Arriba") y se asignan las rutas en la pantalla que ya existe.

### 4.4 Una sola contraseña del broker para todas las Pi

Todas las Pi usan el mismo usuario y contraseña de MQTT, grabados en la tarjeta SD.

- **A favor**: las Pi quedan idénticas y clonables.
- **En contra**: quien saque la contraseña de una Pi podría leer los tickets de los demás locales.
- **Cuándo cambiarlo**: al instalar OidoOps en otro grupo de restaurantes. Ahí conviene una contraseña por Pi, con permisos limitados a sus propios mensajes.

### 4.5 Portal WiFi para la primera conexión

Para que un manager pueda instalar la Pi solo en un local sin cable de red hasta ella, sin SSH.

1. La Pi arranca. Si tiene cable, se conecta sola y no pasa nada más.
2. Si no tiene ninguna conexión, crea su propia red WiFi, tipo `OIDO-7F3A`.
3. El manager se conecta con el teléfono y se le abre sola una página (portal cautivo).
4. Elige el WiFi del local y escribe la contraseña. La Pi se pasa a esa red.
5. La última pantalla muestra el código de la Pi, que es el que se escribe en el dashboard para vincularla (4.1).

- **Con cable no hace falta**, y con el router del kit tampoco: su WiFi lo define Eze y la Pi puede salir de casa ya configurada. Resuelve el caso de un local con router propio y sin cable hasta la Pi.
- **Se usan herramientas existentes** para la Pi, no se programa el portal desde cero. Falta elegir cuál.
- **No contradice** el descarte de una página de configuración en la Pi: esto es solo para darle red, que es lo único que no se puede hacer desde el dashboard.

Se eligió esto y no **Bluetooth**: Bluetooth obliga a desarrollar y publicar una app (sin app solo funciona en Chrome de Android, no en iPhone) para un paso que se hace una vez por local. A favor tenía que la Pi puede avisar en el momento si la contraseña está mal.

### Descartado

- **Página web en la Pi para configurar impresoras y rutas.** Duplica la configuración en dos lugares, solo se puede abrir estando en el WiFi del local y obliga a mantener un servidor web con login en cada Pi.
- **Que la Pi descargue su tabla de rutas y siga decidiendo ella.** Solo tendría sentido para imprimir sin internet, y el modo offline está pausado.
- **Bluetooth para la primera conexión.** Ver 4.5.

---

## 5. Mensajes entre la API y la Pi 🟡

**Propuesta, se cierra al implementar.** Todo cuelga del código de la Pi, no del restaurante.

| Tema MQTT | Quién publica | Para qué |
|---|---|---|
| `pi/<codigo>/trabajo/<id>` | API | Un trabajo a imprimir |
| `pi/<codigo>/resultado/<id>` | Pi | Si se imprimió o falló |
| `pi/<codigo>/estado` | Pi | "en línea" / "sin conexión" (el broker lo marca solo si la Pi se cae) |
| `pi/<codigo>/impresoras` | Pi | Lista de impresoras detectadas en la red |

La Pi se suscribe **solo** a `pi/<codigo>/trabajo/#`. Sus propios avisos van por temas hermanos, nunca por debajo de `trabajo/`: en el prototipo ya pasó que la Pi recibía sus propias confirmaciones como si fueran tickets nuevos.

Ejemplo de trabajo, la comida de una mesa de planta alta:

```json
{
  "id": "cmd-123-r2",
  "tipo": "cocina",
  "mesa": "14",
  "camarero": "Ana",
  "pax": 4,
  "timestamp": "2026-10-08T19:42:10.000Z",
  "items": [
    { "nombre": "Patatas bravas", "cantidad": 2, "nivel": 1, "notas": null },
    { "nombre": "Pulpo", "cantidad": 1, "nivel": 2, "notas": "sin pimentón" }
  ],
  "destinos": [
    { "impresora": "Cocina", "ip": "192.168.1.102", "copias": 2 },
    { "impresora": "Arriba", "ip": "192.168.1.103", "copias": 1 }
  ]
}
```

Los demás tipos usan el mismo sobre:

- `barra` — igual que cocina, sin agrupar por nivel.
- `cobro` — ticket de cuenta. Lleva además `abrirCajon: true` cuando se cobró en efectivo.
- `cajon` — sin contenido: solo el pulso que abre el cajón (botón "Abrir cajón" del encargado).
- `prueba` — el papel con la IP, para el botón "Probar".

**Cambio de formato = despliegue coordinado.** La Pi vieja no entiende estos mensajes y la API vieja no los manda. API y Pi se actualizan en el mismo momento, fuera del horario de servicio.

---

## 6. Instalación en un local 🟡

### Antes de ir (en casa)

1. Clonar la tarjeta SD con el `printer-server` instalado y la contraseña del broker.
2. Arrancar la Pi una vez, anotar su código y pegarle la etiqueta.
3. Comprobar que el puerto de red de la Pi está en **automático** y que puede usarse para salir a internet. La Pi del prototipo tiene puesto `never-default` para el banco de pruebas, y hay que quitarlo:
   `sudo nmcli con mod netplan-eth0 ipv4.method auto ipv4.addresses "" ipv4.never-default no && sudo nmcli con up netplan-eth0`
4. En cada impresora, comprobar con el autotest (encender manteniendo FEED) que la interfaz activa es **Ethernet** y no USB. Si quedó en USB, la red no funciona aunque el cable esté bien.

### En el local

1. Montar router, switch y cables. Pi e impresoras en la misma red.
2. Enchufar las impresoras (ya en automático, ver sección 2) y **reservarle a cada una su IP en el router del kit**, por su dirección física.
3. Enchufar la Pi. En el admin tiene que aparecer "en línea".
4. Admin → restaurante → **Vincular Pi** con el código de la etiqueta.
5. Admin → `/admin/tickets` → impresoras detectadas → **Probar** cada una y ponerle nombre.
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

1. ~~**Enrutamiento desde el admin**~~ (4.2). Primera versión hecha y probada en local.
2. **Vinculación por código** (4.1). Base de todo lo demás: sin ella la app solo le habla a una Pi.
3. **Detección de impresoras + botón "Probar"** (4.3). Se usa en toda instalación y evita tener que saber las IPs.
4. **Ticket de cobro y cajón**, automático en efectivo y botón manual. Es lo único de la lista que ve el restaurante.
5. **Portal WiFi** (4.5). Al final: solo hace falta sin cable, y es lo más incómodo de probar.
6. Avisos de fallo y "reimprimir comanda".

### Mientras no esté la detección: kit armado en casa

Como el router viaja con el kit, las IPs se pueden dejar resueltas antes de enviarlo, y el manager solo enchufa:

1. En casa: armar router, Pi e impresoras, y reservarle su IP a cada impresora en el router.
2. Cargar esas IPs y las rutas en `/admin/tickets` del restaurante.
3. Probar una comanda.
4. Desenchufar y enviar. En el local las impresoras reciben las mismas IPs, porque el router es el mismo.

### Tareas sueltas

- ~~Poner `~/Desktop/dev/printer-server` bajo git.~~ Hecho el 2026-10-08, solo en local, sin repositorio remoto.
- Corregir o borrar las impresoras con IPs inventadas de producción antes de desplegar la rama `kit-impresion`.
- Sacar de este repo la carpeta `-x/`: es una copia vieja del `printer-server` con su `venv`, commiteada por accidente.
- Quitar del `config.py` de la Pi el bloque temporal con la impresora "test".
