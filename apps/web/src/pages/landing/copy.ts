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
      { label: 'Oído Box', href: '#box' },
      { label: 'Veri*factu', href: '#verifactu' },
      { label: 'Contacto', href: '#contacto' },
    ],
    access: 'Acceder',
    accessHref: '/entrar',
    cta: 'Pedir una demo',
    ctaHref: '#contacto',
  },

  hero: {
    meta: {
      left: 'v2 · Tapas · Bistró · Cervecería',
      cities: 'Hecho en Barcelona',
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
      'OidoOps es el sistema de comanda hecho para hosteleros que ya no quieren TPVs de los 2000.\nUna sola app para sala, cocina y barra, en el móvil o la tablet que ya tienes. Sin gritos de «¡marcha pasa!».',
    ctaPrimary: 'Pedir una demo',
    ctaPrimaryHref: '#contacto',
    ctaSecondary: 'Ver cómo funciona',
    ctaSecondaryHref: '#features',
    miniDisclaimer: 'Sin instalar nada · se abre desde el navegador',
    chips: {
      topRight: { text: 'Mesa 7 · marcha pasa pendiente', badge: '3' },
      midLeft: { text: 'Salida 2 enviada · cocina 4:22' },
      bottomRight: { textBefore: 'Comanda impresa en', accent: 'cocina y barra' },
    },
  },

  marquee: {
    top: [
      'Comanda en 4 toques',
      'Cocina sincronizada',
      'Marcha pasa pendiente',
      'Carta y alérgenos',
      'Menús de grupo',
      'Propinas justas',
      'Reseñas en vivo',
      'Planning del equipo',
      'Oído Box',
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
          'Carta en botones grandes, con buscador y notas por plato',
          'Tickets a cocina y barra en paralelo',
        ],
        view: 'mapa' as const,
      },
      {
        num: '02',
        eyebrow: 'Cocina',
        title: { before: 'El pase,', accent: 'en orden', after: '.' } as AccentTitle,
        body: 'Cada comanda sale impresa en cocina y en barra a la vez, agrupada por salidas: primero los entrantes, después los segundos. Si la mesa pide algo más, la marcha pasa llega como ticket aparte, sin pisar lo anterior.',
        bullets: [
          'Tickets por salidas (1, 2, 3), no por orden de entrada',
          'Cada sala imprime donde tú decidas, con las copias que quieras',
          'Las notas del plato («sin cebolla») salen en el ticket',
        ],
        view: 'cocina' as const,
      },
      {
        num: '03',
        eyebrow: 'Encargado',
        title: { before: 'El turno entero,', accent: 'de un vistazo', after: '.' } as AccentTitle,
        body: 'El encargado ve todas las mesas en vivo, cobra desde su móvil y cierra el turno con los totales ya hechos: efectivo, tarjeta, mermas, invitaciones y propinas. Sin Excel, sin recopilar a final de día.',
        bullets: [
          'Mapa de sala con estado en tiempo real',
          'Cobro con el cambio y la propina calculados',
          'Cierre de turno con totales y reparto de propinas',
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
        'La app de sala está hecha para usarse con prisa y con las manos ocupadas: modo claro para el turno de día, oscuro para la noche, botones grandes y texto que se lee sin acercar la pantalla.',
      strong: 'Cada camarero entra con su PIN',
      suffix: ' — en su móvil o en la tablet del local, sin instalar nada.',
    },
    phones: [
      { label: 'Modo claro', sub: 'Por defecto · turnos diurnos', tag: 'default' as const },
      { label: 'Modo nocturno', sub: 'Sala con poca luz · noches', tag: 'dark' as const, highlight: true },
      { label: 'Letra grande', sub: 'Se lee de lejos · se pulsa bien', tag: 'a11y' as const },
    ],
    a11yCards: [
      {
        title: 'Botones grandes',
        body: 'La carta se navega con botones cuadrados y texto en mayúsculas. Manos ocupadas, prisa: se pulsa bien.',
      },
      {
        title: 'Buscador que perdona',
        body: 'Encuentra «caña» aunque escribas «cana». Sin acentos ni mayúsculas, por plato o por categoría.',
      },
      {
        title: 'Notas con un toque largo',
        body: 'Mantén pulsado un plato y escribe «sin cebolla». La nota sale en el ticket de cocina.',
      },
      {
        title: 'Alergias al momento',
        body: 'Marca a qué es alérgico el cliente y la carta se parte en dos: lo que puede comer y lo que no.',
      },
      {
        title: 'La carta, estudiada',
        body: 'Fichas de vinos y platos en el bolsillo, y speeches en inglés, francés y alemán que se pueden escuchar antes del turno.',
      },
      {
        title: 'PIN personal',
        body: 'Cada camarero entra con su PIN de 4 dígitos. Sus propinas del mes, a un toque.',
      },
    ],
  },

  modules: {
    eyebrow: 'El menú completo',
    headlineLine1: 'Una plataforma.',
    headlineLine2: { before: '', accent: 'Todo tu restaurante,', after: 'sin cuotas extra.' } as AccentTitle,
    body: 'Empieza con sala y cocina. Activa el resto cuando lo necesites. Todo funciona con los mismos datos — sin doble entrada, sin export/import, sin Excel a final de mes.',
    masLabel: 'Y además, incluido',
    mas: ['Carta y alérgenos', 'Escandallos', 'Menús de grupo', 'Reservas', 'Fichas de personal', 'Wiki del equipo', 'Checklists de apertura y cierre', 'Facturas de proveedor', 'Almacén', 'Pulso para el dueño', 'Tickets e impresión'],
    cards: [
      {
        num: '01',
        tag: 'Operación',
        title: 'Sala',
        body: 'Mapa de mesas, comanda, marcha pasa y cobro. Cocina y barra reciben lo suyo a la vez.',
        visual: 'sala' as const,
        big: true,
      },
      {
        num: '02',
        tag: 'Operación',
        title: 'Cocina y barra',
        body: 'Cada comanda sale impresa donde toca, ordenada por salidas. La marcha pasa, con un toque.',
        visual: 'cocina' as const,
      },
      {
        num: '03',
        tag: 'Equipo',
        title: 'Planning',
        body: 'Cuadrante semanal por local, horas de contrato y días libres. Con planificación automática.',
        visual: 'planning' as const,
      },
      {
        num: '04',
        tag: 'Stock',
        title: 'Inventario',
        body: 'Conteos por local, consumo y coste entre dos conteos. Avisos bajo mínimo.',
        visual: 'inventario' as const,
      },
      {
        num: '05',
        tag: 'Reputación',
        title: 'Reseñas Google',
        body: 'Las reseñas nuevas del día y aviso de las negativas. Alerta si baja la nota.',
        visual: 'reviews' as const,
        big: true,
      },
      {
        num: '06',
        tag: 'Cierre',
        title: 'Caja & propinas',
        body: 'Cierre de turno con efectivo, tarjeta, mermas e invitaciones. Propinas repartidas por horas.',
        visual: 'caja' as const,
      },
    ],
  },

  box: {
    eyebrow: 'El kit de local',
    title: 'Oído Box.',
    titleAccent: 'Se enchufa y la cocina imprime.',
    sub: 'Una caja que cabe en la palma de la mano y conecta tu local con OidoOps. La enchufas al router, encuentra sola tus impresoras de tickets, y cada comanda sale donde tiene que salir: cocina, barra o las dos.',
    imageAlt: 'Oído Box, el aparato de OidoOps para cada local',
    chips: ['En línea', '2 impresoras encontradas'],
    points: [
      {
        num: '01',
        title: 'Lista en minutos',
        body: 'Llega configurada. La enchufas, le das el WiFi del local desde el móvil, y aparece sola en tu panel.',
      },
      {
        num: '02',
        title: 'Encuentra tus impresoras',
        body: 'Detecta las térmicas de tu red y te las propone. Tú les pones nombre y eliges qué sale en cada una, sala por sala y con las copias que quieras.',
      },
      {
        num: '03',
        title: 'No pierde un ticket',
        body: 'Si la Box pierde la conexión un momento, las comandas esperan y se imprimen en cuanto vuelve. Y no abre ninguna puerta en tu red: es la Box la que llama, nunca al revés.',
      },
      {
        num: '04',
        title: 'Tu sala, solo desde tu local',
        body: 'Si lo activas, la Box le dice a OidoOps cuál es la red del restaurante. Fuera de ella el equipo consulta la carta y sus propinas, pero nadie toca una mesa ni cobra.',
      },
    ],
    foot: ['Impresoras térmicas de tickets por red', 'Probada con Epson TM-T20', 'Una por local'],
  },
  verifactu: {
    eyebrow: 'Cumplimiento Hacienda',
    chipPrefix: 'VERI', // antes del asterisco
    chipSuffix: 'FACTU', // después del asterisco
    chipObligation: 'obligatorio 01·01·2027',
    deadlineISO: '2027-01-01T00:00:00+01:00',
    countdownLabel: 'días',
    titleLine1Prefix: 'Preparado para VERI', // luego viene * coloreado + FACTU
    titleLine1Suffix: 'FACTU',
    titleAccent: 'antes de que sea obligatorio',
    titleEndDot: '.',
    sub: 'Desde 2027 Hacienda exigirá que cada ticket sea inalterable, vaya encadenado por huella y lleve un QR verificable. Lo estamos construyendo dentro de OidoOps para que llegue incluido y sin cambiar tu forma de trabajar.',
    bullets: [
      {
        num: '01',
        title: 'Envío automático a la AEAT',
        body: 'Al cobrar una mesa, el registro del ticket se enviará a Hacienda sin que nadie haga nada. Si falla la red, quedará en cola y se reintentará solo.',
      },
      {
        num: '02',
        title: 'Cadena de huellas',
        body: 'Cada ticket se encadena con el anterior. Si alguien borra o modifica uno, la cadena se rompe y se nota. La cadena ya se puede ver funcionando en el monitor de demostración del panel.',
      },
      {
        num: '03',
        title: 'QR oficial en el ticket',
        body: 'El ticket llevará el código QR reglamentario para que tu cliente pueda comprobarlo en la web de la AEAT.',
      },
      {
        num: '04',
        title: 'Sin «módulo fiscal» aparte',
        body: 'Vendrá dentro de OidoOps, no como un programa más que instalar, conectar y pagar por separado.',
      },
    ],
    footLaw: 'Reglamento RD 1007/2023 · Orden HAC/1177/2024 · AEAT',
    footStatus: 'En desarrollo · obligatorio desde el 1-1-2027 para sociedades',
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
      status: 'Ticket de ejemplo',
      verifyUrl: 'sede.agenciatributaria.gob.es/verifica',
    },
  },

  statement: {
    eyebrow: 'Manifiesto',
    lines: [
      [
        { text: 'Pensado', accent: false },
        { text: 'en', accent: false },
        { text: 'pleno', accent: false },
        { text: 'servicio,', accent: true },
      ],
      [
        { text: 'no', accent: false },
        { text: 'en', accent: false },
        { text: 'un', accent: false },
        { text: 'despacho.', accent: false },
      ],
    ] as Array<Array<{ text: string; accent: boolean }>>,
    paragraphs: [
      'Un viernes a las diez de la noche nadie tiene tiempo de pelearse con una pantalla. OidoOps está hecho para ese momento: botones que se aciertan sin mirar, la carta a dos toques y la comanda en cocina antes de que vuelvas a la barra.',
      'Cada decisión está probada en servicio real: el tamaño de los botones, dónde aparece la marcha pasa, cómo se canta una mesa con las manos llenas.',
    ],
  },

  stats: {
    eyebrow: 'En números',
    headlineParts: [
      { text: 'No estás cambiando' },
      { text: 'de TPV.', accent: true, break: true },
      { text: 'Estás cambiando' },
      { text: 'de era', accent: true },
      { text: '.' },
    ] as AccentPart[],
    aggregatedLabel: 'Hecho en',
    aggregatedValue: 'Barcelona · 2026',
    cards: [
      {
        number: 4,
        suffix: ' toques',
        label: 'De abrir la mesa a la comanda enviada',
        meta: 'Mesa · carta · salida · oído',
      },
      {
        number: 15,
        prefix: '+',
        label: 'Módulos con los mismos datos',
        meta: 'De la comanda al cuadrante',
      },
      {
        number: 0,
        suffix: ' apps',
        label: 'Que instalar en el móvil del equipo',
        meta: 'Se abre desde el navegador',
      },
    ],
    trustStripLabel: 'Pensado para',
    trustStripItems: [
      { count: 'Tapas', label: 'y bares' },
      { count: 'Bistrós', label: 'y casas de comidas' },
      { count: 'Cervecerías', label: 'y vermuterías' },
      { count: 'Grupos', label: 'de varios locales' },
    ],
  },

  closer: {
    eyebrow: 'Una demo · sin compromiso',
    headlineLine1: 'Que tu próximo viernes',
    headlineLine2: { before: 'a las 22:00', accent: 'fluya', after: '.' } as AccentTitle,
    ctaPrimary: 'Pedir una demo',
    ctaSecondary: 'Ya soy cliente',
    ctaSecondaryHref: '/entrar',
    foot: {
      copyright: '· Hecho en Barcelona', // se prependa con © year OidoOps
      links: ['Privacidad', 'Términos'],
      email: '',
    },
  },
}
