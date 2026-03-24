# Almacén App — Contexto para Claude Code

## Qué es este proyecto

Sistema de gestión integral para un grupo de restaurantes (cliente: Sensi Tapas, Barcelona).
Incluye dos módulos principales:
1. **Almacén**: control de retiros de materia prima con pistola de código de barras
2. **Sala (TPV)**: sistema de comandas para camareros y encargados — mesas, menú, cocina, propinas, mermas, Google Reviews

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
│   │   │       └── empleados.ts
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

Widget en el dashboard admin que muestra el rating y total de reseñas por restaurante, con diferencial diario. Sync manual protegido por clave.

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

## Convenciones de código

- TypeScript strict en todo
- Componentes funcionales con hooks
- React Query para todos los fetches — nunca `useEffect + fetch` manual
- Tailwind para estilos, sin CSS separado
- Zod para validación en el backend
- Nombres en español para variables de dominio (comanda, mesa, retiro, empleado)
- Nombres en inglés para términos técnicos (handler, props, state)
