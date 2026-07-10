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

## Roadmap (acordado con Eze, pendiente de implementar)

1. **Restricción por red WiFi del restaurante** (para usar Handys del personal): allowlist de IPs públicas por restaurante en el servidor — tabla `RedAutorizada` + middleware Fastify sobre las rutas de sala (comandas/cobros). El PIN sigue siendo *quién sos*; la IP es *dónde estás*. Botón **"Autorizar esta red"** en el panel 💼 del encargado (guarda la IP pública actual con etiqueta + caducidad ~90 días; si el ISP rota la IP, el encargado re-autoriza en segundos). El admin/dashboard queda FUERA de la restricción (accesible desde cualquier lado). Nunca validar en el cliente — solo server-side vía `X-Forwarded-For` de Nginx.
2. **Kit de local (hardware llave en mano por restaurante)**: router propio con SSID dedicado (los PADs/Handys se conectan ahí → su IP pública es la autorizada del punto 1) + switch + **Raspberry Pi 4 (4GB) con monitor** + impresoras térmicas ESC/POS Ethernet (cocina y barra). La Pi: (a) servicio de impresión — conexión *saliente* al VPS (SSE/polling), imprime por TCP 9100, sin abrir puertos; (b) **puesto fijo del encargado** — Chromium en kiosco con la app abierta (dashboard de mesas / modo encargado): visión panorámica del salón para cerrar mesas, armar menús de grupos, etc. Reemplaza los ordenadores que hoy tienen en cada sala (abajo y arriba). **Confirmado: 2 Pi + 2 monitores táctiles por local** (una por planta; solo una Pi lleva el servicio de impresión + heartbeat, la otra es puro kiosco). **Cajón de efectivo**: se conecta por RJ11 al puerto DK de la térmica (no a la Pi); se abre con comando ESC/POS `ESC p` → al cobrar en efectivo desde el CobroSheet, el servicio de impresión imprime el ticket y abre el cajón; con tarjeta no se abre; (c) heartbeat al VPS que refresca automáticamente la IP autorizada (elimina el botón manual del punto 1). Gotcha hardware: Pi 4 usa micro-HDMI; comprar microSD nueva o boot USB; fuente USB-C 3A de calidad. Eze prototipa con Pi + 2 impresoras usadas.
3. **RBAC en dashboard** (ver memoria): encargado sin precios de coste, chef con costes, admin total.

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
│   │   │       └── checklists.ts   ← checklists de apertura/cierre por sector
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
│           │   ├── ReservasAdminPage.tsx ← admin de reservas (OidoPerso)
│           │   ├── ReservaPublicaPage.tsx← formulario público /reservas/:slug
│           │   ├── ValidarPage.tsx       ← escaneo QR para validar retiros
│           │   ├── VerificarPage.tsx     ← vista pública de un retiro /verificar/:id
│           │   └── LogoLabPage.tsx       ← herramienta interna exploración logo
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
```

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
- **Header**: `[viñeta OidoOps + primer nombre]` grande (w-16, `self-stretch` — ocupa toda la altura del header, abre el `PerfilPanel`) + cuadrados de 48px: `[planta ↓] [planta ↑]` (siempre visibles, llevan al mapa de esa planta) + `[mesas]`. A la derecha: 💼 (encargado) y el icono de logout (SVG puerta+flecha). El **reloj en vivo** flota sobre el mapa (píldora centrada en el margen superior, `pointer-events-none`); también está en el header del panel 💼. NO hay botón de mapa (las plantas lo cubren), ni "+" (vista 'nueva' sin acceso), ni ⚗️, ni toggle de tema en el header.
- Panel de perfil (`PerfilPanel`, tocar la viñeta): nombre del restaurante + nombre completo, **toggle claro/oscuro** (junto a la ✕), propinas del mes + accesos a **Producción (⚗️ premixes)**, Wiki y Checklists (iconos SVG de línea con tinte de color, no emoji)

### Añadir items — navegación por niveles (tiles, accesibilidad visual)

Pestaña "Añadir" del `ComandaPanel` (tabs mitad y mitad estilo marca: **"COMANDA (n)"** uppercase y el **+** gordo en SVG; el activo lleva el gradiente azul→verde, el inactivo va en verde de marca sobre fondo sutil). **Pestaña inicial al abrir una mesa**: si la comanda está toda enviada (sin pendientes) → entra directo a la carta ("Añadir" — el caso típico: vuelven a pedir una bebida); con items pendientes de enviar o cuenta impresa/liberada → vista del pedido. Navegación por **tiles cuadrados grandes** (texto uppercase 18px font-black, pensado para camareros con dificultades visuales):

```
Nivel 1: grupos (🍽️ COMIDA / 🍹 BEBIDAS…) — cards full-width h-24
Nivel 2: categorías del grupo — grid 3 cols, tiles aspect-square
Nivel 3: subcategorías (si las hay, mismo tile) + items directos
Nivel 4: items de la subcategoría
```

- Si solo hay un grupo se entra directo al nivel 2. Categoría sin subcategorías va directa a sus items.
- **Tinte ámbar** en tiles de grupos de barra (detectados con `esGrupoBarra(g)` = regex `/vino|bebida/i` — NO lista hardcodeada; cubre "Vinos Botella", "VINOS", etc.). Determina también el `tipo` cocina/barra del item.
- **Volver un nivel**: FAB circular centrado (64px, gradiente azul→verde de marca, `bottom-24`) + swipe horizontal en cualquier dirección (>80px) + botón "← nombre" arriba. Los tres conviven porque el swipe falla en algunos teléfonos.
- **Búsqueda global**: el campo de búsqueda (y la lupa flotante arrastrable) ignora el nivel/grupo activo y matchea por nombre de item **o de categoría** en todo el menú. Todas las búsquedas de sala usan `normTxt` (NFD + sin diacríticos + lowercase): insensible a mayúsculas, acentos y composición Unicode (el bug "CAÑA" no encontrada).
- **Cantidad**: taps repetidos sobre un item acumulan (`qtyPending`, commit a los 1.5s).
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
- **Botón 💼 en el header** → `EncargadoPanel` (sheet lateral, tema sala) con 4 tabs:
  - **💶 Cobros**: comandas `facturada`+`liberada` con items → botón "Cobrar mesa" abre el **`CobroSheet`**: mismo flujo que el dashboard (método de pago, importe recibido con **cambio** en efectivo, **propina** = exceso sobre el total con tarjeta) → `PATCH /comandas/:id/cerrar` con `propina`. El mismo sheet se usa desde el botón "💶 Cobrar mesa" del `ComandaPanel` (mesa facturada, solo encargado).
  - **⏱ Turno**: abrir turno (`POST /turnos` con su nombre) / cerrar con doble confirmación (aviso ámbar si hay mesas activas o cobros pendientes) → muestra resumen de totales al cerrar.
  - **✅ Checklists**: estado de hoy por sector (apertura/cierre, quién, hora, marcados/total) via `GET /checklists?restaurantId`.
  - **🗑 Mermas**: mermas del día con total € via `GET /mermas?desde=hoy&hasta=hoy`.
- **Pantalla "Turno no iniciado"**: si es encargado muestra botón "▶ Abrir turno" en vez del mensaje pasivo.
- **Cobro directo en `ComandaPanel`**: prop `esEncargado` — en mesas `facturada` aparecen botones "💶 Cobrar efectivo / 💳 Cobrar tarjeta" junto a "Mesa libre".
- **Backend endurecido**: `PATCH /comandas/:id/cerrar` ahora exige `metodoPago` (cash|tarjeta) y estado previo `facturada`|`liberada` (409 si no; antes no validaba nada).

### Dashboard encargado (MesasFeedPage)

- Vista en tiempo real (SSE) de todas las mesas
- Una mesa con **múltiples comandas activas** (ej: facturada original + nueva enviada tras traslado) genera **múltiples cards** en el feed
- Sección "Pendiente de cobro" muestra comandas `liberada` con items (filtra las vacías)
- El encargado cobra desde aquí (efectivo/tarjeta) → comanda pasa a `cerrada`

### Mermas

Registrar items no servidos o con queja. Motivos: `no_servido`, `queja_cliente`, `otro`.
Una merma se puede restituir (deshacer) desde el panel de detalle de comanda del admin **y desde la app de sala**: sección "🗑 Mermas" al final de la pestaña Pedido del `ComandaPanel`, con botón "↩ Deshacer" por merma (`DELETE /mermas/:id` — el item vuelve a la comanda y se cobra normal; si la cuenta estaba impresa, marca `cuentaDesactualizada`).

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

Widget en el dashboard admin (`AdminHomePage`) que muestra por restaurante:
- Rating actual ★ + total de reseñas
- Diferencial diario (`diff` hoy)
- **Alerta ⚠️** si el rating bajó respecto al snapshot anterior (`ratingDiff < 0`) — fondo rojo, manager debe revisar Google Maps
- **Barra de progreso mensual**: objetivo dinámico = `floor(paxMes / tasa)`. La tasa (1 review cada X comensales) se configura por restaurante con el ⚙️ del widget.

**Snapshots**: cron diario a las 17:44 en VPS (`44 17 * * * curl ... POST /api/reviews/sync`). Un snapshot por restaurante por día. Se conservan todos — el diff usa `take: 2 orderBy fecha desc`. El progreso mensual usa el primer snapshot del mes vs el último.

**Campo en Restaurant**: `reviewObjetivoTasa Int?` — tasa de objetivo. `PATCH /reviews/objetivo` para actualizarlo.

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
- **Alérgenos**: campo `alergenos Int` — bitmask de los 14 alérgenos EU (Reglamento 1169/2011). Bit 0=Gluten, 1=Crustáceos, 2=Huevos, 3=Pescado, 4=Cacahuetes, 5=Soja, 6=Lácteos, 7=Frutos secos, 8=Apio, 9=Mostaza, 10=Sésamo, 11=Sulfitos, 12=Altramuces, 13=Moluscos.

### Combinados (destilado + refresco)

Modelo **pool global de mixers** con **precio combinado fijo**. Campos en `MenuItem`:
- `combinable Boolean` — el item se puede pedir combinado (destilados). Toggle rápido **COMB** en la fila del item (al activar pide el precio con `prompt`; vacío = usar precio normal).
- `precioCombinado Float?` — precio del combinado con refresco incluido (`null` = fallback a `precio`).
- `esMixer Boolean` — el item sirve de mezcla (refrescos, tónicas). Toggle rápido **MIX**.
- `suplementoMixer Float` — extra si el mixer es premium (ej. Red Bull +1,50). Default 0.

Los 4 campos también se editan en el `ItemForm` (sección "Combinados") y se preservan al copiar items/categorías. Badges en el admin: 🥃 precio combinado (púrpura) y 🥤 mix +supl (esmeralda).

**App camarero**: tocar un item `combinable` NO acumula cantidad — abre un picker bottom-sheet ("🥃 Combinado") con la opción **Solo · sin mezclar** (precio normal) + todos los items `esMixer` activos del menú con el precio resultante (`precioCombinado ?? precio` + `suplementoMixer`). Al elegir, añade **un solo renglón** a la comanda: `"Vodka Absolut + Coca-Cola"` con el precio del combinado y el `tipo` (barra/cocina) del destilado. Los tiles combinables muestran el hint `🥤+`. El long-press (comentario) sigue añadiendo el item solo. No hubo cambios de backend en comandas (los items viajan con nombre/precio libres).

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
- `faseLibreRotacion`: fase 0-3 en rotación de días libres para el auto-planning
- `pin`: PIN de 4 dígitos para autenticación en la sala (camareros)
- `activo`: soft-delete

---

## Módulo: Grupos

Gestionado desde `/admin/grupos`. Gestión de menús cerrados para grupos con plantillas reutilizables.

### Modelos

```
GrupoMenuTemplate  restaurantId, nombre, precio (€/pax), niveles (Json), activo
GrupoAgendado      restaurantId, templateId, fecha, pax, restricciones (Json), estado, comandaId?
```

### Raciones sugeridas (`paxPorRacion`)

`GrupoMenuTemplate.paxPorRacion Int @default(3)` — tapeo compartido (todo al centro): al armar el menú se sugiere **1 ración de cada plato cada X pax** (`Math.max(1, Math.round(pax / paxPorRacion))`). Se configura en el editor de plantillas ("1 ración cada X pax"). El GenerarModal del admin y el MenuGrupoSheet de sala inicializan las cantidades con esta regla; el usuario ajusta a mano (restricciones alimentarias, tope de presupuesto).

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
- `GET /staffing/semana?restaurantId=X&lunes=YYYY-MM-DD` — vista semanal agrupada por día
- `POST /staffing/turnos` — crear turno
- `PUT /staffing/turnos/:id` — editar turno (acepta `restaurantId` para transferir a otro restaurante)
- `DELETE /staffing/turnos/:id` — eliminar turno
- `DELETE /staffing/turnos/semana-todos?desde=YYYY-MM-DD&restaurantIds=1,2,3` — borrar toda la semana de los restaurantes indicados
- `GET /staffing/config?restaurantId=X`
- `PUT /staffing/config` — actualizar ratios
- `GET /staffing/necesidades/dia?restaurantId=X` — plantilla base por día de la semana
- `PUT /staffing/necesidades/dia` — actualizar plantilla
- `GET /staffing/necesidades/fecha?restaurantId=X&desde=&hasta=`
- `POST/PUT/DELETE /staffing/necesidades/fecha`
- `POST /staffing/auto-planning` — Wizard: genera turnos automáticamente para una semana
- `GET /staffing/disponibles?restaurantId=X&fecha=YYYY-MM-DD&rol=X` — empleados disponibles ese día (sin turno asignado Y con horas semanales libres). Devuelve `horasRestantes` por empleado.
- `GET /staffing/transferir-destinos?empId=X&fecha=YYYY-MM-DD&origenId=X` — restaurantes donde el rol del empleado tiene déficit ese día (destinos válidos para transferir su turno)
- `GET /staffing/exceso-personal?rol=X&fecha=YYYY-MM-DD&restaurantId=X` — restaurantes donde ese rol tiene exceso de personal ese día, con lista de empleados transferibles (incluye `turnoId`)
- `GET /staffing/cobertura?lunes=YYYY-MM-DD` — lista todos los empleados activos con `horasAsignadas` esa semana vs `horasSemanales` de contrato
- `GET /staffing/huecos-empleado?empId=X&lunes=YYYY-MM-DD` — para un empleado concreto, devuelve los días+restaurantes donde su rol tiene déficit esa semana (`HuecoEmpleado[]`)

### Wizards

- **Global Wizard**: genera planificación para todos los restaurantes a la vez. Respeta horas contractuales (`horasSemanales`) — 40h=5×8h, 35h=3×8h+2×5.5h, etc. Fase de pruning: elimina turnos sobrantes solo si el empleado mantiene sus horas de contrato.
- **HR Planning Wizard**: wizard de planificación RRHH — considera horas contractuales, días libres fijos y fase de rotación de cada empleado.
- **Borrar Planning Global**: botón junto a "Plan Global" que elimina todos los turnos de la semana actual en los restaurantes seleccionados (`DELETE /staffing/turnos/semana-todos`).

### Tab Cobertura (`StaffingPage`)

Pestaña independiente en Gestión de Personal que lista todos los empleados activos ordenados alfabéticamente mostrando su cobertura semanal:

- **Navegador de semana propio** (independiente del de la tab Planning, para evitar mezcla de datos).
- **Barra de progreso** horas asignadas / horas de contrato con porcentaje. Verde ≥ 100%, ámbar < 100%.
- **Botón 🔍 Huecos**: aparece si `horasAsignadas < horasSemanales`. Abre `HuecosPanel` con los días+restaurantes donde el rol del empleado tiene déficit esa semana (pills con nombre de restaurante + nº de hueco).
- **Tooltip hover**: al pasar el cursor sobre el nombre del empleado, muestra la cuadrícula semanal (misma que en la tab Planning) con los turnos ya asignados y sus restaurantes.
- Los datos de cobertura provienen de `GET /staffing/cobertura?lunes=YYYY-MM-DD` y los huecos de `GET /staffing/huecos-empleado?empId=X&lunes=YYYY-MM-DD`.

### Patrones de días libres (auto-planning)

4 patrones consecutivos, distribución por índice posicional dentro del grupo tipo (cocina/sala):

```
Fase 0: Lun+Mar  (días 0+1)
Fase 1: Mié+Jue  (días 2+3)
Fase 2: Vie+Sáb  (días 4+5)
Fase 3: Dom+Lun  (días 6+0)
```

- Solo el Lunes se repite (aparece en fase 0 y fase 3) — día más tranquilo del restaurante.
- Días libres siempre consecutivos. Si el empleado tiene `diasLibresFijos`, se completan con días consecutivos al último fijo.
- La distribución usa **índice posicional** dentro del grupo tipo (no `emp.id % 4`) para garantizar reparto uniforme independientemente de los IDs de BD.
- `faseLibreRotacion` avanza 1 cada semana planificada para rotar los días libres.

### Asignación de rotativos — sistema de 3 niveles

Cuando un rotativo se incorpora a un restaurante, los días de trabajo se construyen por prioridad hasta completar la **semana entera** del empleado (días disponibles = 7 − 2 días libres, típicamente 5):

| Nivel | Criterio | Propósito |
|-------|----------|-----------|
| **1 — Déficit** | needed > 0 y aún no cubierto | Principal: cubrir hueco real |
| **2 — Cubierto-pero-necesario** | needed > 0, ya cubierto | Rellenar horas de contrato |
| **3 — No necesario** | needed = 0 | Último recurso |

**Regla clave**: `targetDays = workingDays.length` (días disponibles antes del filtro). Siempre se intenta dar al rotativo su semana completa — 20h → 5×4h, 40h → 5×8h, etc.

**Efecto en el Global Wizard** (secuencial): el primer restaurante que usa al rotativo absorbe su semana completa. Los siguientes lo ven con 0h libres en `otherRestaurantShifts` y no lo vuelven a planificar.

### Diversidad de fases (rotativos sin días libres fijos)

Cuando dos rotativos del mismo rol tienen la misma fase natural, el segundo recibe una fase complementaria calculada por `bestComplementPhase`:

- Recorre las 4 fases no usadas y calcula la cobertura combinada (días-trabajados ∪ nuevos días trabajados).
- Devuelve la fase que maximiza los días distintos cubiertos entre los dos empleados.
- Esto evita el patrón "ambos libres Mié+Jue → déficit esos días, exceso el resto".

Solo se aplica cuando el empleado **no tiene** `diasLibresFijos` (los que sí tienen no pueden cambiar su libranza contractual).

### Skip guard (rotativos con días libres fijos)

Antes de añadir turnos a un rotativo, se comprueba si puede cubrir **al menos un día con déficit real**:

- Se calcula `deficitDayNums`: días donde `needed > 0` y `covered < needed`.
- Se excluyen también los días que el empleado tiene bloqueados en otro restaurante (`otherRestaurantShifts`).
- Si hay días con déficit pero el empleado no puede cubrir ninguno (todos son sus días libres fijos o días ya ocupados en otro restaurante), se **salta** (`continue`) — no se le asignan turnos.

Esto evita asignar a un rotativo que solo crearía exceso sin resolver el déficit real.

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
- **Acceso**: los botones de Wiki y Checklists **no** están en el header de la app de comandas — están dentro del **panel de perfil del camarero** (`PerfilPanel`, se abre al tocar el nombre), como accesos junto al resumen de propinas.

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

## SSE — Server-Sent Events

Dos canales de eventos en tiempo real:

- **`/api/events?restaurantId=X`** — eventos de un restaurante concreto. Hook: `useRestaurantEvents` (usado en la sala del camarero y MesasFeedPage).
- **`/api/events/global`** — eventos de todos los restaurantes. Hook: `useAdminEvents` (usado en el dashboard admin).

Ambos envían un ping cada 25s y confirman conexión con `{"type":"connected"}`. El broadcast está en `apps/api/src/sse.ts` (`broadcast(restaurantId, event)` y `broadcastGlobal(event)`).

---

## Componentes compartidos (`apps/web/src/components/`)

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
