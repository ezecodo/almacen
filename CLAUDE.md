# Almacén App — Contexto para Claude Code

## Qué es este proyecto

Sistema de control de retiros de almacén para un grupo de 5 restaurantes (cliente: Sensi Tapas, Barcelona).
Cuando un empleado va al almacén a buscar materia prima, escanea los productos con una pistola de código de barras y el retiro queda registrado con su nombre, restaurante, productos, cantidades y fecha.

## Objetivo de negocio

MVP funcional para demo con Valentina (CEO del grupo). El pitch es: "saben exactamente qué se lleva cada restaurante, cuándo, y quién". Actualmente no tienen ningún registro — todo se pierde.

## Stack

- **Frontend**: React + Vite + TailwindCSS + React Query (PWA, tablet-first)
- **Backend**: Fastify + Prisma + Zod + TypeScript
- **DB**: PostgreSQL 16
- **Infra**: Ubuntu VPS + Nginx + PM2

## Estructura del proyecto

```
almacen_app/
├── apps/
│   ├── api/                  ← Fastify API (puerto 3001)
│   │   ├── src/
│   │   │   ├── server.ts     ← entry point
│   │   │   └── routes/
│   │   │       ├── retiros.ts
│   │   │       ├── productos.ts
│   │   │       ├── restaurantes.ts
│   │   │       └── empleados.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── .env              ← DATABASE_URL, JWT_SECRET, etc.
│   └── web/                  ← React app (puerto 5173)
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── hooks/
│           └── api.ts        ← cliente HTTP centralizado
└── packages/
    └── types/                ← tipos TypeScript compartidos
```

## Base de datos — Schema Prisma

```prisma
model Restaurant {
  id        Int        @id @default(autoincrement())
  nombre    String
  empleados Empleado[]
  retiros   Retiro[]
  createdAt DateTime   @default(now())
}

model Empleado {
  id           Int        @id @default(autoincrement())
  nombre       String
  restaurantId Int
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
  retiros      Retiro[]
  activo       Boolean    @default(true)
  createdAt    DateTime   @default(now())
}

model Retiro {
  id           Int          @id @default(autoincrement())
  createdAt    DateTime     @default(now())
  empleadoId   Int
  restaurantId Int
  empleado     Empleado     @relation(fields: [empleadoId], references: [id])
  restaurant   Restaurant   @relation(fields: [restaurantId], references: [id])
  items        RetiroItem[]
}

model RetiroItem {
  id       Int    @id @default(autoincrement())
  retiroId Int
  retiro   Retiro @relation(fields: [retiroId], references: [id])
  barcode  String
  nombre   String
  cantidad Float
  unidad   String  // 'kg' | 'ud' | 'l' | 'g'
}
```

## Rutas de la API (todas con prefix /api)

| Método | Ruta                      | Descripción                         |
| ------ | ------------------------- | ----------------------------------- |
| GET    | /restaurantes             | Lista todos los restaurantes        |
| GET    | /empleados?restaurantId=1 | Empleados activos de un restaurante |
| GET    | /producto/:barcode        | Lookup en Open Food Facts           |
| POST   | /retiros                  | Crear retiro con items              |
| GET    | /retiros                  | Historial con filtros opcionales    |
| GET    | /retiros/:id              | Detalle de un retiro                |
| GET    | /health                   | Health check                        |

### Filtros disponibles en GET /retiros

- `restaurantId` (number)
- `empleadoId` (number)
- `desde` (ISO date string)
- `hasta` (ISO date string)
- `page` (number, default 1)
- `limit` (number, default 20)

## Variables de entorno

### apps/api/.env

```
DATABASE_URL="postgresql://ezequielangeloni@localhost:5432/almacen_dev"
JWT_SECRET="dev-secret-local"
FRONTEND_URL="http://localhost:5173"
PORT=3001
```

## Comandos útiles

```bash
# Arrancar API en desarrollo
cd apps/api && npm run dev

# Arrancar web en desarrollo
cd apps/web && npm run dev

# Migraciones
cd apps/api && npx prisma migrate dev --name nombre_migracion

# Prisma Studio (ver DB visualmente)
cd apps/api && npx prisma studio

# Seed (cargar datos iniciales)
cd apps/api && npx tsx prisma/seed.ts
```

## Flujo principal de la app (tablet en almacén)

1. Empleado abre la tablet → ve la app
2. Selecciona su restaurante
3. Selecciona su nombre
4. Escanea productos con la pistola de barcode
   - La pistola actúa como teclado: envía chars + Enter
   - Por cada scan: se consulta /api/producto/:barcode → aparece el nombre
   - Si no se encuentra en Open Food Facts → el usuario escribe el nombre a mano
   - Se confirma la cantidad y unidad (kg / ud / l / g)
5. Lista de items escaneados visible en pantalla
6. Botón "Confirmar retiro" → POST /api/retiros → guardado
7. Pantalla de confirmación con resumen

## Hook del escáner (useScanner)

La pistola USB manda caracteres muy rápido (< 50ms entre chars) y termina con Enter.
Un humano tarda > 300ms entre teclas.
El hook distingue pistola vs teclado por la velocidad del input.

```typescript
// Ya implementado en apps/web/src/hooks/useScanner.ts
useScanner({
  onScan: (barcode) => handleBarcode(barcode),
  enabled: true,
  minLength: 4,
});
```

## Panel admin

- Historial de todos los retiros
- Filtros por restaurante, empleado, fecha
- Vista de detalle de cada retiro
- Acceso desde desktop (no tablet)

## Lo que FALTA construir (frontend completo)

- [ ] Setup de Vite + React + Tailwind en apps/web
- [ ] Router con React Router
- [ ] Página de retiro (flujo principal tablet)
- [ ] Hook useScanner integrado
- [ ] Panel admin con historial y filtros
- [ ] Componentes: SelectRestaurante, SelectEmpleado, ItemList, ConfirmModal

## Convenciones de código

- TypeScript strict en todo
- Componentes funcionales con hooks
- React Query para todos los fetches (no useEffect + fetch manual)
- Tailwind para estilos, sin CSS separado
- Zod para validación en el backend
- Nombres en español para variables de dominio (retiro, empleado, restaurante)
- Nombres en inglés para términos técnicos (handler, props, state)

## Datos de prueba (ya cargados en DB)

- Sensi Tapas: María García, Carlos López, Ana Martínez
- Restaurante 2: Pedro Sánchez, Laura Fernández
- Restaurante 3: Miguel Torres, Sofia Ruiz
- Restaurante 4: David Moreno, Elena Jiménez
- Restaurante 5: Roberto Díaz, Carmen Vega

## Contexto de negocio importante

- Cliente: grupo de 5 restaurantes en Barcelona
- Interlocutora: Valentina, CEO de Sensi Tapas
- Precio acordado: 1.500€ setup + 120€/mes
- El MVP es solo registro de retiros — sin gestión de stock real
- Los productos tienen códigos de barra comerciales (no productos propios)
- Hardware: tablet Android/iPad + pistola USB en el almacén
