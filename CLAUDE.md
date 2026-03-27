# Almacén App — Contexto para Claude Code

## Qué es este proyecto

Sistema de gestión integral para un grupo de restaurantes (cliente: Sensi Tapas, Barcelona).
Incluye tres módulos principales:
1. **Almacén**: control de retiros de materia prima con pistola de código de barras
2. **Sala (TPV)**: sistema de comandas para camareros y encargados — mesas, menú, cocina, propinas, mermas, Google Reviews
3. **Inventario**: conteo periódico de stock de sala por restaurante, con catálogo global + específico por restaurante

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
- **Tiempo real**: SSE (Server-Sent Events) via `apps/api/src/sse.ts` + `useRestaurantEvents` hook

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
│   │   │       └── inventario.ts
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
│           │   └── ...
│           ├── hooks/
│           │   ├── useRestaurantEvents.ts ← SSE → invalida React Query cache
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
Basta con hacer `git push` desde local — el workflow actualiza el VPS automáticamente (git pull + build frontend + migraciones + restart PM2).

- VPS: Ubuntu, directorio `/root/almacen`
- Proceso PM2: `almacen-api` (el frontend lo sirve Nginx como estáticos)
- Para ver estado en VPS: `pm2 status` / `pm2 logs --lines 50`

---

## Módulo: Sala (TPV)

### Estados de una Comanda

```
abierta → enviada → facturada → liberada → cerrada
```

- **abierta**: mesa con items pendientes de enviar a cocina
- **enviada**: todos los items tienen nivel asignado y fueron enviados
- **facturada**: camarero imprimió la cuenta (botón "Imprimir cuenta")
- **liberada**: camarero confirmó entrega de cuenta — mesa libre, pendiente de cobro por el encargado
- **cerrada**: encargado cobró (cash o tarjeta) — requiere `metodoPago`

### Lógica de items (ComandaItem)

Cada item tiene:
- `nivel`: orden de salida (1=primero, 2=segundo, etc.) — `null` si aún no enviado
- `ronda`: `0`=nunca enviado, `1`=comanda original, `2+`=marcha pasa (re-envíos)
- `tipo`: `'cocina'` | `'barra'`

Al enviar (`PATCH /comandas/:id/enviar`), se calcula `nextRonda = max(ronda existente) + 1` y se asignan nivel y ronda a los items pendientes.

### Flujo camarero (SalaMesasPage)

- Mapa SVG interactivo con los planos del salón
- PIN de autenticación por camarero
- Abrir mesa → añadir items del menú → OrdenarModal (asignar niveles de salida) → Enviar a cocina
- Puede re-enviar (marcha pasa), imprimir cuenta, registrar mermas, cambiar mesa, fusionar mesas

### Cambiar mesa / Merge (POST /api/comandas/merge)

Mueve items de una comanda (source) a otra (target):
- Si target es `facturada`: se crea una **nueva comanda** para esa mesa (preserva la facturada original en la cola del encargado). El source vacío queda como `liberada`.
- Si target no es facturada: los items se fusionan directamente.
- Items pendientes (`nivel=null`) con mismo nombre se suman en cantidad.
- Items ya enviados (`nivel!=null`) se crean como filas nuevas preservando nivel/ronda.

**Regla importante**: nunca usar una comanda `facturada` como SOURCE del merge (el botón "Cambiar mesa" está deshabilitado para comandas facturadas en SalaMesasPage).

### Dashboard encargado (MesasFeedPage)

- Vista en tiempo real (SSE) de todas las mesas
- Una mesa con **múltiples comandas activas** (ej: facturada original + nueva enviada tras traslado) genera **múltiples cards** en el feed
- Sección "Pendiente de cobro" muestra comandas `liberada` con items (filtra las vacías)
- El encargado cobra desde aquí (efectivo/tarjeta) → comanda pasa a `cerrada`

### Mermas

Registrar items no servidos o con queja. Motivos: `no_servido`, `queja_cliente`, `otro`.
Una merma se puede restituir (eliminar) desde el panel de detalle de comanda.

### Propinas

Sistema de reparto de propinas por turno. Registro de efectivo + tarjeta del día, con horas trabajadas por empleado. El reparto es proporcional a las horas.

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

## Módulo: Inventario

### Concepto

Catálogo **global** (compartido entre todos los restaurantes) + productos/categorías **específicos** por restaurante. Los conteos son siempre por restaurante individual.

### Modelos

```
InventarioCategoria  restaurantId=null → global | restaurantId=X → específica
InventarioProducto   restaurantId=null → global | restaurantId=X → específica
                     unidad: ud | botella | caja | l | kg
InventarioConteo     siempre por restaurantId, cerrado=true al guardar
InventarioConteoItem conteoId + productoId + cantidad  @@unique([conteoId, productoId])
```

### API

- `GET /inventario/categorias?restaurantId=X` — devuelve globales + específicas del restaurante, con productos incluidos
- `POST/PATCH/DELETE /inventario/categorias/:id`
- `POST/PATCH/DELETE /inventario/productos/:id`
- `GET /inventario/conteos?restaurantId=X` — lista con `_count.items`
- `POST /inventario/conteos` — crea y cierra inmediatamente con todos los items
- `GET /inventario/conteos/:id` — detalle con diferencial vs conteo anterior del mismo restaurante
- `DELETE /inventario/conteos/:id`

### Frontend (`/admin/inventario`)

**Pestaña Catálogo**: selector Global/restaurante, categorías con productos inline, badge "Global", campos nombre/unidad/stockMínimo.

**Pestaña Conteos**: selector de restaurante, historial con fecha/autor/nº productos, nuevo conteo con inputs grandes (tablet-friendly) agrupados por categoría, vista detalle con tabla Cantidad | Anterior | Diferencia (verde/rojo) y productos bajo mínimo resaltados.

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
