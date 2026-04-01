# OidoOps — Roadmap

## Estado actual (Marzo 2026)

Sistema en producción en VPS para Restaurantes.
Módulos operativos: Sala (TPV), Almacén, Inventario, Propinas, Google Reviews.

---

## En progreso

- [ ] Sincronización Google Sheets propinas (credenciales JSON subidas al VPS)
- [ ] Deploy módulo Menú (copiar categorías/items entre restaurantes, reordenar)

---

## Próximas features

### Offline / Local-First con Raspberry Pi ⭐

**Prioridad alta — diferenciador clave de producto**

Arquitectura: cada restaurante tiene una Raspberry Pi en local que corre la misma
API + PostgreSQL. Las tablets se conectan al Pi por WiFi local. El Pi sincroniza
con el VPS cloud cuando hay internet. Sin internet: todo sigue funcionando en
tiempo real entre tablets (SSE, cocina, comandas).

Fases:

- [ ] **Fase 1**: Setup del Pi — instalar Node.js, PostgreSQL, Nginx, clonar repo
- [ ] **Fase 2**: Script de configuración automática del Pi (un comando instala todo)
- [ ] **Fase 3**: Sincronización Pi ↔ VPS (deltas, resolución de conflictos)
- [ ] **Fase 4**: Detección automática de red en tablets (Pi local vs cloud)
- [ ] **Fase 5**: Deploy en los 5 restaurantes

Hardware por restaurante: Raspberry Pi 5 (8GB) ~90€ + MicroSD 64GB ~12€ + caja/fuente ~15€
Total estimado por restaurante: ~120€

### Pantalla cocina (Kitchen Display System)

- [ ] Vista dedicada para cocina — muestra items enviados por nivel/ronda
- [ ] Se actualiza en tiempo real vía SSE
- [ ] Confirmación de platos listos desde cocina

### App camarero nativa (PWA mejorada)

- [ ] Instalación como app en tablet (ya es PWA, mejorar manifest + iconos)
- [ ] Soporte offline Nivel 1: cache de assets y menú (sin Pi)

### Estadísticas y reporting

- [ ] Dashboard con gráficos de ventas por período
- [ ] Ranking de platos más vendidos
- [ ] Exportación a PDF/Excel

---

## Ideas futuras

- Integración con impresoras térmicas directamente desde el navegador (WebUSB / WebBluetooth)
- QR en mesa para que clientes vean la carta
- Sistema de reservas integrado
- Notificaciones push (encargado recisbe alerta cuando rating de Google baja)

---

## Modelo de negocio

- Setup: 1.500€ por cliente
- Mensualidad: 120€/mes por cliente
- Objetivo futuro: 150€/mes por mesa/restaurante
