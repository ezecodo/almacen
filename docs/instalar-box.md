# Instalar y activar una Oído Box

Cómo se prepara una Box, cómo la activa el cliente y cómo se prueba. Probado de punta a punta el 2026-10-14 con la Box `OIDO-13FAEE` (Raspberry Pi 4, 2 GB, Raspberry Pi OS Lite 64-bit, Debian 13).

**Regla de Eze**: instalar una Box tiene que ser *grabar la tarjeta y enchufar*. El cliente no toca terminales ni nadie entra al VPS. Desde el 2026-10-15 la clave del canal, el nombre DNS y el certificado salen de **HQ → Oído Box → Activar** (sección 6); lo que queda es la imagen de Oído (etapa 2).

Detalle técnico del kit (canal MQTT, portal WiFi, impresoras): [`kit-impresion.md`](kit-impresion.md). Modo sin internet: [`modo-local.md`](modo-local.md).

---

## 1. El montaje en el local

```
Internet del restaurante ── router del local (WiFi de clientes)
                                  │ cable a su puerto WAN
                            Router del kit (WiFi del personal)
                              ├── Oído Box (cable)
                              ├── impresoras (cable)
                              └── teléfonos del personal (WiFi)
```

- El kit lleva **su propio router**, aislado de la red de los clientes.
- La Box puede tener además WiFi. Si tiene las dos, sale a internet por el **WiFi**, y el cable queda de respaldo (`/etc/NetworkManager/conf.d/oido-cable.conf`, lo pone el instalador). Así funciona aunque el router del kit no tenga internet, como en el banco de pruebas de casa (AirPort sin internet, la Box por el WiFi de casa).

## 2. Preparar la Box (en casa, Oído)

1. **Grabar la tarjeta** con Raspberry Pi Imager:
   - Dispositivo: Raspberry Pi 4. Sistema: Raspberry Pi OS (other) → **Raspberry Pi OS Lite (64-bit)**.
   - Editar ajustes:
     - Nombre del equipo: `oido`. Usuario: `oido`, con contraseña anotada.
     - WiFi: el de casa, país ES. Zona horaria: Europe/Madrid.
     - Servicios: SSH **solo con clave pública**, con la del Mac (`pbcopy < ~/.ssh/id_ed25519.pub`).
     - Raspberry Pi Connect: **apagado**.
2. Ponerla en la Box, enchufar y esperar unos 3 minutos. El primer arranque se reinicia solo.
3. En el Mac: `ssh-keygen -R oido.local` (si antes hubo otra tarjeta en esa Box) y `ssh oido@oido.local hostname` → `oido`.
4. Desde la raíz de este repo: **`bash deploy/preparar-box.sh`**. Son 7 pasos, cada uno con ✓ o ✗; si algo falla, se detiene y dice qué mirar. Se puede repetir.
   1. Entra, quita la contraseña de `sudo` a `oido` (la pide una vez) y lee el código de la Box.
   2. Paquetes: Python, Node, Postgres, fuentes. Tarda 5-10 min la primera vez.
   3. `printer-server`, portal WiFi, comando `oido` y prioridad WiFi/cable. Pillow se compila: unos minutos.
   4. **Activación en HQ**: la Box se presenta sola. El script dice "abre HQ → Oído Box" y espera: en **Esperando activación** aparece su código; se comprueba con la etiqueta y se toca **Activar**. En menos de un minuto la Box recibe su clave del canal y conecta. Renovar la clave: "renovar clave" en su fila de HQ.
   5. Certificado de su nombre: llega de HQ junto con la clave (el comodín `*.box…`).
   6. Modo local (`deploy/box.sh`).
   7. Comprobación: servicios, IPs, nombre → IP, enlace con la instalación.
5. En **HQ** (`hq.oidoops…/admin` → Suite OidoOps): asignar la Box al local del cliente. En segundos le llega su enlace.
6. Opcional, para que llegue "como de fábrica": `ssh oido@oido.local oido sin-wifi`.

## 3. Activarla (el cliente, en el local)

1. Enchufar el router del kit, las impresoras y la Box.
2. **WiFi de la Box** (solo si no va por cable): a los 1-2 min aparece la red `OIDO-XXXXXX`. Conectarse con el teléfono, se abre el portal, elegir el WiFi y poner la contraseña. La red `OIDO-…` desaparece cuando conecta.
3. Panel → Sala → **Tickets** → su restaurante:
   - La Box, en 🟢 **Conectada**.
   - Impresoras: **🔍 Buscar de nuevo** → aparecen las detectadas → ponerles nombre → **Probar**.
   - **Rutas** por sala: cocina, barra y cobro, con sus copias.
4. Comandar una mesa con comida y bebida: cada ticket sale donde debe.
5. Durante un apagón no funciona nada (router e impresoras sin luz): el local tiene **comanderos de papel de OidoOps**. Al volver la luz, la Box arranca sola.

## 4. El comando `oido` (pruebas y soporte)

Viene instalado en cada Box. Desde el Mac:

| Comando | Qué hace |
|---|---|
| `ssh oido@oido.local oido estado` | Servicios, redes, por dónde sale a internet, canal, enlace, si hay corte |
| `ssh oido@oido.local oido corte` | La Box deja de llegar a la nube: simula que se cayó internet |
| `ssh oido@oido.local oido vuelve` | Quita el corte. Reiniciar la Box también lo quita |
| `ssh oido@oido.local oido sin-wifi` | Olvida el WiFi y reinicia: arranca como recién sacada de la caja (portal) |
| `ssh -t oido@oido.local oido clave` | Emergencia: pegar a mano una clave del canal. Lo normal es "renovar clave" en HQ |
| `ssh oido@oido.local oido registro` | Últimas líneas de los tres servicios |

Fuente: `deploy/oido-box.sh` (el instalador lo copia a `/usr/local/bin/oido`).

### Prueba rápida de modo local (sin cortar internet a nadie)

1. `oido corte`. En Tickets, la Box pasa a 🔴.
2. En el teléfono: perfil → mantener apretado ~1 s el nombre del restaurante → franja "modo local, activado a mano".
3. Comandar en una mesa abierta y en una nueva: salen los tickets; la nube no los ve.
4. `oido vuelve`. En unos segundos la nube tiene todo, sin duplicados ni reimpresiones.
5. Salir del modo a mano (mismo gesto).

Resultado del 2026-10-14: todo ✅. Sin probar: el teléfono con el router del local **de verdad** sin internet (¿encuentra `<código>.box…`?), el aviso al cerrar turno y los botones ocultos en modo local.

## 5. Lo que era manual (historia, superado por la sección 6)

| Qué | Hoy | Propuesta (2026-10-14) | Lo que hace Eze, una vez |
|---|---|---|---|
| **Clave del canal** ✅ escrito (2026-10-14) | Entrar al VPS como root, `mqtt.sh pi OIDO-…`, copiar y pegar la clave | El instalador la pide al VPS por SSH y la mete en la Box, sin copiar ni pegar | Una vez, como root: `bash /root/almacen/deploy/permitir-claves-box.sh` (`eze` puede correr **solo** `mqtt.sh pi OIDO-…` sin contraseña) |
| **Certificado** | Uno por Box, pedido a mano con un TXT en IONOS; no se renueva solo (el de `13faee` caduca el 2027-01-11) | **Un certificado comodín** `*.box.oidoops…` para todas, renovado solo; cada Box recibe el vigente | Crear una **clave de la API de IONOS** |
| **Nombre de cada Box** | Registro A a mano en IONOS (`13faee.box…` → `192.168.1.24`) | Lo crea la nube con la IP que informa la Box, y lo corrige si la IP cambia | La misma clave de IONOS |

Contra del comodín: todas las Box llevan la misma clave privada. Quien robe una podría hacerse pasar por otra Box, pero solo dentro de un local cuya red controle. Riesgo bajo.

## 6. Decidido: todo desde HQ, en el navegador (Eze, 2026-10-14)

Eze no quiere entrar al VPS para nada relacionado con una Box, **ni siquiera una vez** ("muy importante poder hacerlo desde una plataforma web"). Por eso la fila "Clave del canal" de la sección 5 queda **superada**: `deploy/permitir-claves-box.sh` existe pero **no se usa** (Eze no lo corrió), y el paso 4 del instalador sigue pidiendo pegar la clave hasta que exista la etapa 1. La clave de IONOS se pegará en un formulario de HQ, nunca en el VPS.

Cómo queda:

1. Oído graba la tarjeta (etapa 1: + `preparar-box.sh`; etapa 2: la **imagen de Oído**, con todo instalado) y enchufa la Box.
2. La Box se **presenta sola a HQ** ("soy OIDO-XXXXXX") con un secreto que genera ella en el primer arranque.
3. **HQ → Boxes → "Esperando activación"**: Eze comprueba el código con la etiqueta y toca **Activar**. Hasta ese clic la Box no recibe nada: la seguridad la pone una persona.
4. HQ encarga al **instalador del VPS** (`deploy/runner.sh`, root por cron, el mismo patrón que "Instalar su OidoOps") la clave del canal, el registro DNS `<código>.box…` con la IP que informa la Box (y su corrección si cambia) y el certificado comodín `*.box.oidoops…` (renovación automática por la API de IONOS).
5. La Box recoge su clave y su certificado de HQ con su secreto. Después, la asignación a un local sigue como hoy.

| Etapa | Qué | Trabajo de Eze después |
|---|---|---|
| **1** | HQ → Boxes (presentarse, Activar, clave, DNS, certificado) + clave de IONOS en HQ. Toca `oido-talent` (HQ), `deploy/` de este repo (runner) y `printer-server` (presentarse y recoger) | Grabar + `preparar-box.sh` (sin VPS) + Activar en HQ |
| **2** | Imagen de Oído + que la Box se actualice sola | Grabar la imagen + Activar en HQ. Cero terminal |

### Etapa 1, hecha (2026-10-15)

Cambio sobre lo de arriba, acordado con Eze: el instalador del VPS hace **solo la clave del canal** (el archivo de claves de Mosquitto pide root). El nombre DNS y el certificado los hace **HQ directamente** con la API de IONOS; no hay certbot ni plugins en el VPS.

| Pieza | Dónde | Qué hace |
|---|---|---|
| Presentarse y recoger | printer-server → `activacion.py` | `POST <HQ>/api/box/hola` con código + secreto (`~/.config/oido/secreto`, lo inventa la Box) + IP local. Cada 15 s mientras espera; activa, cada 10 min o al cambiar de IP. Al recibir la clave la escribe en `.env` y se reinicia; el certificado va a `~/oidoops/cert` y reinicia `oidoops-local`. Sin clave no llama al broker |
| La única puerta pública | oido-talent → `routes/boxes.ts` | `/api/box/hola`. La primera vez la Box queda **esperando**; otro secreto con el mismo código → 409 (en HQ, "Olvidar"). La clave se entrega hasta que la Box confirma que conecta con ella (manda su huella) y entonces HQ la borra |
| Activar, Olvidar, IONOS, certificado | oido-talent → `routes/boxes.ts` + `AdminSuite.tsx` | Sección Oído Box: tarjetas "Esperando activación", estado de cada Box (nombre → IP, "renovar clave") y al pie los ajustes: clave de IONOS (se prueba antes de guardar), certificado, instalador |
| Clave del canal | este repo → `deploy/runner.sh` (`activar_box`) | Cada minuto: `GET /api/interno/boxes/siguiente` → `mqtt.sh pi <código>` → `POST /api/interno/boxes/<código>/clave` |
| Nombre DNS | oido-talent → `src/boxes.ts` + `src/ionos.ts` | Registro A `<código>.box…` → la IP de la conexión por donde la Box sale a internet. Al activar y cuando cambia; repaso cada hora |
| Certificado comodín | oido-talent → `src/boxes.ts` (`acme-client`) | Let's Encrypt por DNS-01 con la API de IONOS. Se pide al guardar la clave de IONOS y se renueva solo con menos de 30 días; tras un fallo espera 6 h. `ACME_STAGING=1` para pruebas |
| Secretos en HQ | oido-talent → `src/cifrado.ts` | Clave de IONOS, clave privada del certificado y claves pendientes, cifradas (AES-GCM, llave derivada de `JWT_SECRET`: si se cambia, hay que volver a pegar la de IONOS) |

Quedó **sin usar y borrado**: `deploy/permitir-claves-box.sh`. Las Box con el programa anterior (la `13FAEE`) se presentan solas al actualizarlas; activarlas les da una clave nueva.
