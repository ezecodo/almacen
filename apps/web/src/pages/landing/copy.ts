// ═══════════════════════════════════════════════════════════════════════════
// Landing copy — TODO el texto editable de la landing en un solo sitio.
//
// Convenciones:
// - Para títulos con UNA palabra/frase en acento (teal cursivo), uso la forma
//   { before, accent, after }. El componente se encarga del estilo.
// - Para títulos con múltiples acentos, uso `parts: { text, accent }[]` y
//   marco con `break: true` para forzar salto de línea.
// - Para texto multi-párrafo, uso array de strings.
// - Para line breaks dentro de un párrafo, uso \n y el componente lo renderea.
// ═══════════════════════════════════════════════════════════════════════════

export type AccentPart = { text: string; accent?: boolean; break?: boolean }
export type AccentTitle = { before?: string; accent: string; after?: string }

export const copy = {
  nav: {
    links: [
      { label: 'Producto', href: '#producto' },
      { label: 'Cómo funciona', href: '#features' },
      { label: 'Precios', href: '#precios' },
      { label: 'Clientes', href: '#clientes' },
      { label: 'Contacto', href: '#contacto' },
    ],
    access: 'Acceder',
    accessHref: '/acceder',
    cta: 'Probar gratis',
  },

  hero: {
    meta: {
      left: 'v2 · Tapas · Bistró · Cervecería',
      cities: 'Madrid · Barcelona · Bilbao',
      // timestamp se genera dinámicamente
    },
    pairs: [
      ['Tu sala,', 'sincronizada.'],
      ['Tu cocina,', 'sin gritos.'],
      ['Tu equipo,', 'organizado.'],
      ['Tu turno,', 'sin papelitos.'],
      ['Tu viernes,', 'feliz.'],
    ] as Array<[string, string]>,
    rotorIntervalMs: 2800,
    rotorStartDelayMs: 2300,
    subtitle:
      'OidoOps es el sistema de comanda hecho para hosteleros que ya no quieren TPVs de los 2000.\nUna sola app para sala, cocina y barra. Sin licencias, sin instalaciones, sin gritos «¡marcha pasa!».',
    ctaPrimary: 'Probar 30 días gratis',
    ctaSecondary: 'Ver demo de 2 min',
    miniDisclaimer: 'Sin tarjeta · 30 días · cancela cuando quieras',
    chips: {
      topRight: { text: 'Mesa 7 · marcha pasa pendiente', badge: '3' },
      midLeft: { text: 'Salida 2 enviada · cocina 4:22' },
      bottomRight: { textBefore: 'Tiempo medio de envío:', accent: '1.2s' },
    },
  },

  marquee: {
    top: [
      'Comanda en 4 toques',
      'Cocina sincronizada',
      'Marcha pasa pendiente',
      'Tickets QR',
      'Inventario en tiempo real',
      'Propinas justas',
      'Sin instalaciones',
      'Sin licencias',
    ],
    bottom: [
      'Mesa 5',
      'Salida 2',
      'En cocina',
      'Vino blanco',
      'Café cortado',
      'Pan con tomate',
      'Croquetas',
      'Bravas',
      'Pulpo a la brasa',
      'Vermut casa',
    ],
  },

  stickyFeatures: {
    eyebrow: 'Cómo funciona',
    headline: {
      line1: 'Una app.',
      line2: { before: '', accent: 'Tres ángulos', after: 'del servicio.' } as AccentTitle,
    },
    features: [
      {
        num: '01',
        eyebrow: 'Sala',
        title: { before: 'Comanda', accent: 'en 4 toques', after: ', sin gritos.' } as AccentTitle,
        body: 'El camarero abre mesa, añade platos, asigna salida y envía. Lo que cuesta una vuelta a la cocina con tu sistema actual, OidoOps lo hace antes de que llegues al pase.',
        bullets: [
          'Pax + comanda + marcha pasa en una sola pantalla',
          'Cantidad como héroe: imposible equivocarse cantando',
          'Tickets a cocina y barra en paralelo',
        ],
        view: 'mapa' as const,
      },
      {
        num: '02',
        eyebrow: 'Cocina',
        title: { before: 'El pase,', accent: 'sin papeles', after: '.' } as AccentTitle,
        body: 'Los tickets aparecen en pantalla por salidas, ordenados por tiempo de envío. Marca «listo» y la sala lo ve al instante. Si una mesa lleva 11 minutos esperando, OidoOps lo marca en ámbar antes de que el cliente pregunte.',
        bullets: [
          'KDS por salidas (1, 2, 3) — no por orden de entrada',
          'Alertas de tiempo: amarillo a 8min, rojo a 15min',
          'Modificadores y observaciones visibles sin abrir',
        ],
        view: 'cocina' as const,
      },
      {
        num: '03',
        eyebrow: 'Encargado',
        title: { before: 'El turno entero,', accent: 'de un vistazo', after: '.' } as AccentTitle,
        body: 'El dashboard muestra qué mesas van por delante, cuáles van retrasadas, cuántas comandas por camarero, cuánto tiempo medio de envío. Sin Excel, sin recopilar a final de día.',
        bullets: [
          'Mapa de sala con estado en tiempo real',
          'Ticket medio, rotación, propinas por camarero',
          'Exporta cierre a tu contable en 1 clic',
        ],
        view: 'comanda' as const,
      },
    ],
  },

  camarero: {
    eyebrow: 'La app del camarero',
    headlineLine1: 'No todos los camareros',
    headlineLine2Parts: [
      { text: 'son iguales', accent: true },
      { text: '. Su app,' },
      { text: 'tampoco', accent: true },
      { text: '.' },
    ] as AccentPart[],
    body: {
      prefix:
        'OidoOps se adapta a cada persona del equipo en 4 toques: modo claro para el turno del día, oscuro para la noche, modo grande para vista cansada, alto contraste para daltonismo.',
      strong: 'La configuración vive en el PIN del camarero',
      suffix: ' — entra en cualquier dispositivo y todo se ajusta.',
    },
    phones: [
      { label: 'Modo claro', sub: 'Por defecto · turnos diurnos', tag: 'default' as const },
      { label: 'Modo nocturno', sub: 'Sala con poca luz · noches', tag: 'dark' as const, highlight: true },
      { label: 'Modo accesible', sub: 'Tipografía grande · alto contraste', tag: 'a11y' as const },
    ],
    a11yCards: [
      {
        title: 'Tipografía dinámica',
        body: 'Tres tamaños: por defecto · cómodo · grande. La densidad se reajusta sin perder información.',
      },
      {
        title: 'Daltonismo',
        body: 'Cada estado de mesa lleva color + chip de texto + posición. El color nunca es el único cue.',
      },
      {
        title: 'Hit targets ≥ 44px',
        body: 'Botones y controles cumplen Apple HIG. Manos ocupadas, guantes, prisa — se pulsa bien.',
      },
      {
        title: 'Modo zurdo',
        body: 'El panel de comanda salta al lado izquierdo. Los pulgares no se cruzan.',
      },
      {
        title: 'Lectura por voz',
        body: 'Compatible con VoiceOver y TalkBack. Cada item canta nombre + cantidad + estado.',
      },
      {
        title: 'PIN o biometría',
        body: 'Cada camarero entra con PIN de 4 dígitos o huella. La sesión dura hasta que cierre.',
      },
    ],
  },

  modules: {
    eyebrow: 'El menú completo',
    headlineLine1: 'Una plataforma.',
    headlineLine2: { before: '', accent: 'Seis módulos', after: 'sin cuotas extra.' } as AccentTitle,
    body: 'Empieza con sala y cocina. Activa el resto cuando lo necesites. Todo funciona con los mismos datos — sin doble entrada, sin export/import, sin Excel a final de mes.',
    cards: [
      {
        num: '01',
        tag: 'Operación',
        title: 'Sala',
        body: 'Comanda, mesas, marcha pasa. Comparte cocina y barra en paralelo.',
        visual: 'sala' as const,
        big: true,
      },
      {
        num: '02',
        tag: 'Operación',
        title: 'Cocina · KDS',
        body: 'Tickets por salidas, alertas de tiempo. Marca «listo» y la sala lo ve.',
        visual: 'cocina' as const,
      },
      {
        num: '03',
        tag: 'Equipo',
        title: 'Planning',
        body: 'Turnos, cobertura, vacaciones, fichajes. Cuadrante semanal arrastrable.',
        visual: 'planning' as const,
      },
      {
        num: '04',
        tag: 'Stock',
        title: 'Inventario',
        body: 'Sala y cocina. Descuento automático al cobrar. Alertas bajo mínimo.',
        visual: 'inventario' as const,
      },
      {
        num: '05',
        tag: 'Reputación',
        title: 'Reseñas Google',
        body: 'Reseñas en vivo, antes de que las veas en tu móvil. Alerta si baja el rating.',
        visual: 'reviews' as const,
        big: true,
      },
      {
        num: '06',
        tag: 'Cierre',
        title: 'Caja & propinas',
        body: 'Cierre del turno, propinas por camarero, export a tu contable en 1 clic.',
        visual: 'caja' as const,
      },
    ],
  },

  verifactu: {
    eyebrow: 'Cumplimiento Hacienda',
    chipPrefix: 'VERI', // antes del asterisco
    chipSuffix: 'FACTU', // después del asterisco
    chipObligation: 'obligatorio 01·01·2027',
    deadlineISO: '2027-01-01T00:00:00+01:00',
    countdownLabel: 'días',
    titleLine1Prefix: 'Listo para VERI', // luego viene * coloreado + FACTU
    titleLine1Suffix: 'FACTU',
    titleAccent: 'desde el primer segundo',
    titleEndDot: '.',
    sub: 'Hacienda exige que cada ticket sea inalterable, encadenado por hash y enviado en tiempo real. OidoOps se encarga de todo en segundo plano para que tu cocina no deje de marchar. Cumples con el Reglamento 1007/2023 sin cambiar un solo paso de tu flujo de trabajo.',
    bullets: [
      {
        num: '01',
        title: 'Envío automático (y blindado) a la AEAT',
        body: 'Cada vez que cobras una mesa, el ticket se transmite a Hacienda en milisegundos. ¿Fallo de Wi-Fi? OidoOps guarda la factura en una cola segura y la reintenta enviar automáticamente en cuanto vuelve la red. Cero pérdidas, cero multas.',
      },
      {
        num: '02',
        title: 'Seguridad inmutable por Hash',
        body: 'Cada factura se encadena matemáticamente con la anterior. Si alguien intenta borrar o modificar un ticket del pasado, la cadena se rompe y queda registrado en el historial. Auditorías perfectas, paz mental total.',
      },
      {
        num: '03',
        title: 'Códigos QR oficiales al instante',
        body: 'Tus tickets impresos o digitales generarán automáticamente el código QR reglamentario. Tus clientes podrán escanearlo para verificar en la web de la AEAT que su factura es 100% legal. Transparencia total para tu negocio.',
      },
      {
        num: '04',
        title: 'Olvídate de los «módulos fiscales» extra',
        body: 'VeriFactu viene integrado de forma nativa. Está incluido en tu suscripción mensual. Sin cobrarte licencias sorpresa, sin recargos por volumen de tickets enviados y sin trampas en tu próxima factura.',
      },
    ],
    footLaw: 'Reglamento RD 1007/2023 · Orden HAC/1177/2024 · AEAT',
    footStatus: 'Integración certificada · pruebas en entorno de pre-producción AEAT',
    ticket: {
      label: 'Ticket simplificado · Mesa 5',
      time: '20:47:13',
      rows: [
        { q: 2, n: 'Croquetas jamón', p: '17,00 €' },
        { q: 1, n: 'Patatas bravas', p: '7,00 €' },
        { q: 4, n: 'Cerveza caña', p: '12,00 €' },
        { q: 1, n: 'Vermut casa', p: '4,80 €' },
      ],
      totalLabel: 'Total IVA inc.',
      totalAmount: '40,80 €',
      registry: 'F-2026-008473',
      hash: 'a3f9…b21e',
      hashPrev: '7c12…0a4f',
      status: 'Registrado en AEAT',
      verifyUrl: 'sede.agenciatributaria.gob.es/verifica',
    },
  },

  statement: {
    eyebrow: 'Manifiesto',
    lines: [
      [
        { text: 'La', accent: false },
        { text: 'gastronomía', accent: false },
        { text: 'es', accent: false },
        { text: 'su', accent: false },
        { text: 'itinerancia', accent: true },
      ],
      [
        { text: 'cuando', accent: false },
        { text: 'la', accent: false },
        { text: 'pantalla', accent: false },
        { text: 'lo', accent: false },
        { text: 'deja', accent: false },
        { text: 'vacío.', accent: false },
      ],
    ] as Array<Array<{ text: string; accent: boolean }>>,
    paragraphs: [
      'Hecho por alguien que alterna entre código y sala desde hace 15 años. Programador de profesión, camarero por elección — cuando la pantalla lo deja vacío, vuelve a la barra; cuando la barra lo deja agotado, vuelve al teclado.',
      'Por eso OidoOps no se parece a un TPV diseñado por alguien que solo ha visto un restaurante en una foto de stock. Cada decisión está probada en servicio real: el tamaño de los botones, dónde aparece la marcha pasa, cómo se canta una mesa con las manos llenas.',
    ],
  },

  stats: {
    eyebrow: 'Hosteleros que confían',
    headlineParts: [
      { text: 'No estás cambiando' },
      { text: 'de TPV.', accent: true, break: true },
      { text: 'Estás cambiando' },
      { text: 'de era', accent: true },
      { text: '.' },
    ] as AccentPart[],
    aggregatedLabel: 'Datos agregados',
    aggregatedValue: '1.234 restaurantes · 12 meses',
    cards: [
      {
        number: 1.2,
        decimals: 1,
        suffix: 's',
        label: 'Tiempo medio comanda → cocina',
        meta: 'Antes: 90s · gritando «¡marcha pasa!»',
      },
      {
        number: 47,
        suffix: '%',
        label: 'Menos errores en la comanda',
        meta: 'Cantidad como héroe del item',
      },
      {
        number: 28,
        prefix: '+',
        suffix: ' min',
        label: 'Cada turno, por camarero',
        meta: 'Tiempo que vuelve a la mesa',
      },
    ],
    trustStripLabel: 'Restaurantes activos · por categoría',
    trustStripItems: [
      { count: '427', label: 'Tapas / Bar' },
      { count: '218', label: 'Bistró' },
      { count: '193', label: 'Cervecería' },
      { count: '167', label: 'Restaurante familiar' },
      { count: '129', label: 'Fine dining' },
      { count: '100+', label: 'Cafetería' },
    ],
  },

  closer: {
    eyebrow: '30 días · sin tarjeta · sin compromiso',
    headlineLine1: 'Que tu próximo viernes',
    headlineLine2: { before: 'a las 22:00', accent: 'fluya', after: '.' } as AccentTitle,
    ctaPrimary: 'Probar OidoOps 30 días',
    ctaSecondary: 'Hablar con ventas',
    foot: {
      copyright: '· Hecho en Madrid + Lima', // se prependa con © year OidoOps
      links: ['Privacidad', 'Términos'],
      email: 'hola@oidoops.com',
    },
  },
}
