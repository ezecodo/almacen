// Quién puede llamar a qué. La regla la aplica el hook onRequest de server.ts:
//
//   sin sesión  → solo RUTAS_PUBLICAS
//   admin       → todo
//   pulso       → solo RUTAS_PULSO
//   sala        → solo RUTAS_SALA; las de SOLO_ENCARGADO, además, piden ser encargado
//
// Lo que no aparece acá es de administración. Una ruta nueva nace así: si la tiene que usar la
// app de sala hay que añadirla a RUTAS_SALA (método + ruta tal como se declara, con /api).

// Lo único que responde sin sesión
export const RUTAS_PUBLICAS = new Set([
  'GET /api/instalacion',             // "acá hay un OidoOps" (vidriera y raíz del sitio)
  'POST /api/admin/auth',             // los tres logins
  'POST /api/pulso/auth',
  'POST /api/empleados/auth',
  'GET /api/restaurantes',            // elegir el local al configurar un dispositivo de sala (solo nombres)
  'GET /api/reservas/publica/config', // formulario público de reservas
  'GET /api/reservas/publica/slots',
  'POST /api/reservas/publica',
  'GET /api/retiros/:id',             // lo que abre el QR de un retiro
  'POST /api/reviews/sync',           // cron: se valida con SYNC_SECRET
  'POST /api/pi/latido',              // la Pi del local: se valida con su secreto
  'POST /api/pi/replica',             // la Pi pide la copia de la sala para el modo local (mismo secreto)
  'POST /api/pi/subida',              // y al volver internet sube lo comandado sin él (mismo secreto)
  'POST /api/pi/eventos',             // línea abierta de la Box: se le avisa al instante de cada cambio (mismo secreto)
  'POST /api/suite/sincronizar',      // aviso del back-office: se valida con el secreto de la suite
])

// El panel del dueño: facturación en vivo y nada más
export const RUTAS_PULSO = new Set([
  'GET /api/turnos/activos/stats',
  'GET /api/events/global',
])

// Lo que usa un empleado con su PIN: la app de sala, el almacén (/retiro) y "mis propinas".
// Sale de lo que realmente llaman esas pantallas (SalaMesasPage y sus componentes).
// Lo único que existe dentro de la Box, en modo local (docs/modo-local.md): entrar con el PIN, ver
// el salón y la carta, y comandar. Sin cobros, turno, mermas ni nada de administración: eso espera
// a que vuelva internet. Si una ruta no está aquí, en la Box responde "no disponible sin internet".
export const RUTAS_LOCAL = new Set([
  'GET /api/instalacion', 'POST /api/empleados/auth', 'GET /api/restaurantes',
  'GET /api/events', 'GET /api/red/estado',
  'GET /api/salon', 'GET /api/turnos/activo',
  'GET /api/menu', 'GET /api/menu/categorias', 'GET /api/alergenos',
  'GET /api/comandas', 'GET /api/comandas/:id', 'POST /api/comandas', 'POST /api/comandas/merge',
  'POST /api/comandas/:id/items', 'PATCH /api/comandas/:id/items/:itemId', 'DELETE /api/comandas/:id/items/:itemId',
  'PATCH /api/comandas/:id/enviar', 'PATCH /api/comandas/:id/facturar', 'PATCH /api/comandas/:id/liberar',
  'PATCH /api/comandas/:id/mover-mesa', 'PATCH /api/comandas/:id/pax', 'PATCH /api/comandas/:id/para-cocina',
  'GET /api/mermas',
  'GET /api/maridajes', // 🍷 qué vino recomendar
  'GET /api/agotados', // solo ver: sin internet no se marcan (el panel 💼 no está en modo local)
])

export const RUTAS_SALA = new Set([
  // tiempo real
  'GET /api/events', 'GET /api/events/global',
  // mesas y comandas
  'GET /api/salon', 'GET /api/turnos/activo',
  'GET /api/comandas', 'GET /api/comandas/:id', 'POST /api/comandas', 'POST /api/comandas/merge',
  'POST /api/comandas/:id/items', 'PATCH /api/comandas/:id/items/:itemId', 'DELETE /api/comandas/:id/items/:itemId',
  'PATCH /api/comandas/:id/enviar', 'PATCH /api/comandas/:id/facturar', 'PATCH /api/comandas/:id/liberar',
  'PATCH /api/comandas/:id/mover-mesa', 'PATCH /api/comandas/:id/pax', 'PATCH /api/comandas/:id/para-cocina', 'PATCH /api/comandas/:id/cerrar', 'DELETE /api/comandas/:id/vacia',
  'PUT /api/comandas/:id/division', // pagar por separado (cualquier camarero; cobrar sigue siendo del encargado)
  'PATCH /api/comandas/:id/rectificar-pago', 'PATCH /api/comandas/:id/deshacer-cobro', // corregir una mesa cobrada (encargado)
  'GET /api/mermas', 'POST /api/mermas', 'DELETE /api/mermas/:id',
  // platos agotados en el servicio
  'GET /api/agotados', 'POST /api/agotados', 'DELETE /api/agotados/:menuItemId',
  // gastos del día (libreta del encargado: pan, hielo…)
  'GET /api/gastos/habituales', 'GET /api/gastos', 'POST /api/gastos', 'DELETE /api/gastos/:id', 'PATCH /api/gastos/:id/pagar',
  // carta (solo lectura), wiki y alérgenos
  'GET /api/menu', 'GET /api/menu/categorias', 'GET /api/alergenos', 'GET /api/wiki',
  'GET /api/maridajes', // 🍷 qué vino recomendar con lo que pidió la mesa
  'GET /api/accesos-rapidos', // ⚡ lo de un toque arriba de COMIDA / BEBIDAS
  // menús de grupo
  'GET /api/grupo-menu', 'POST /api/grupo-menu/:id/generar', 'GET /api/grupo-menu/agendados',
  'POST /api/grupo-menu/agendados', 'PATCH /api/grupo-menu/agendados/:id', 'DELETE /api/grupo-menu/agendados/:id',
  'POST /api/grupo-menu/agendados/:id/asignar',
  // turno, checklists, producción, reviews
  'POST /api/turnos', 'PATCH /api/turnos/:id/cerrar',
  'GET /api/checklists', 'POST /api/checklists/ejecuciones',
  'GET /api/inventario/categorias', 'POST /api/inventario/producciones',
  'GET /api/reviews', 'GET /api/reviews/historial', 'GET /api/reviews/turno',
  // reservas del día y pool entre restaurantes
  'GET /api/reservas', 'GET /api/reservas/pool', 'PATCH /api/reservas/:id/mesa', 'PATCH /api/reservas/:id/sentar', 'PATCH /api/reservas/:id', 'PUT /api/comandas/:id/reserva',
  'PATCH /api/reservas/:id/pool', 'PATCH /api/reservas/:id/pool/cancelar', 'PATCH /api/reservas/:id/pool/gestionar',
  'PATCH /api/reservas/:id/pool/liberar', 'PATCH /api/reservas/:id/pool/tomar',
  // facturas de proveedor (cada ruta comprueba además que sea encargado)
  'GET /api/facturas', 'POST /api/facturas', 'GET /api/facturas/proveedores', 'GET /api/facturas/:id/paginas/:n',
  'POST /api/facturas/:id/paginas', 'PATCH /api/facturas/:id/enviar', 'DELETE /api/facturas/:id',
  // recepción de pedidos a proveedores con el albarán (encargado)
  'GET /api/pedidos/recepcion', 'PATCH /api/pedidos/:id/recibir',
  'POST /api/pedidos/:id/albaran', 'GET /api/pedidos/:id/albaran/:n', 'DELETE /api/pedidos/:id/albaran/:n',
  // en qué red está el dispositivo
  'GET /api/red/estado',
  // propinas propias, almacén y validación de retiros
  'GET /api/propinas/mis-turnos', 'GET /api/staffing/mi-horario',
  // reparto de propinas del encargado (turnos cerrados de su local)
  'GET /api/propinas/encargado/turnos', 'GET /api/propinas/encargado/empleados', 'GET /api/propinas/encargado/resumen', 'PUT /api/propinas/encargado/turnos/:turnoId',
  'GET /api/producto/:barcode', 'POST /api/retiros', 'PATCH /api/retiros/:id/confirmar',
])

// Dentro de la app de sala, lo que solo hace el encargado (rol o superpoder accesoEncargadoApp)
export const SOLO_ENCARGADO = new Set([
  'PATCH /api/comandas/:id/cerrar',   // cobrar
  'POST /api/turnos',                 // abrir turno
  'PATCH /api/turnos/:id/cerrar',     // cerrar turno
  'POST /api/agotados',               // marcar un plato agotado
  'DELETE /api/agotados/:menuItemId', // reponerlo
  'GET /api/gastos', 'POST /api/gastos', 'DELETE /api/gastos/:id', 'PATCH /api/gastos/:id/pagar', // gastos del día
  'GET /api/propinas/encargado/turnos', 'GET /api/propinas/encargado/empleados', 'GET /api/propinas/encargado/resumen', 'PUT /api/propinas/encargado/turnos/:turnoId', // repartir propinas
  'PATCH /api/reservas/:id/sentar',   // sentar una reserva (el walk-in va con POST /comandas y solo cuenta si es encargado)
  'PATCH /api/reservas/:id',          // no vino / cancelada / volver a por llegar
  'PUT /api/comandas/:id/reserva',    // quién está sentado en la mesa ("No era esta reserva")
  'PATCH /api/comandas/:id/rectificar-pago', 'PATCH /api/comandas/:id/deshacer-cobro', // corregir una mesa ya cobrada
  'GET /api/pedidos/recepcion', 'PATCH /api/pedidos/:id/recibir', // recibir un pedido con el albarán
  'POST /api/pedidos/:id/albaran', 'GET /api/pedidos/:id/albaran/:n', 'DELETE /api/pedidos/:id/albaran/:n',
])

// ── Dónde está el dispositivo ────────────────────────────────────────────────────────────────
// Si el restaurante tiene restringirPorRed, lo de RUTAS_SALA solo funciona desde la red del local
// (la que aprende el latido de la Pi), salvo lo de estas dos listas, que es consulta y se puede
// abrir desde cualquier lado. Lo aplica el hook preHandler de server.ts.

// Cualquier empleado, desde donde esté: estudiar la carta y la wiki, ver sus propinas
export const CONSULTA_SALA = new Set([
  'GET /api/red/estado',
  'GET /api/wiki', 'GET /api/menu', 'GET /api/menu/categorias', 'GET /api/alergenos', 'GET /api/maridajes',
  'GET /api/propinas/mis-turnos', 'GET /api/staffing/mi-horario',
])

// Además, el encargado: reviews y reservas (solo verlas)
export const CONSULTA_ENCARGADO = new Set([
  'GET /api/reviews', 'GET /api/reviews/historial', 'GET /api/reviews/turno',
  'GET /api/reservas', 'GET /api/reservas/pool',
  // repartir las propinas de un turno cerrado (al llegar a casa, al día siguiente…)
  'GET /api/propinas/encargado/turnos', 'GET /api/propinas/encargado/empleados', 'GET /api/propinas/encargado/resumen', 'PUT /api/propinas/encargado/turnos/:turnoId',
])
