import { google, sheets_v4 } from 'googleapis'
import path from 'path'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!
const CREDENTIALS_PATH = path.resolve(process.cwd(), process.env.GOOGLE_SHEETS_CREDENTIALS!)

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function colLetter(idx: number): string {
  let col = idx + 1
  let letter = ''
  while (col > 0) {
    const rem = (col - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    col = Math.floor((col - 1) / 26)
  }
  return letter
}

function getPeriodName(fecha: Date): string {
  const d = new Date(fecha)
  if (d.getDate() >= 25) d.setMonth(d.getMonth() + 1)
  const month = d.toLocaleDateString('es-ES', { month: 'long' })
  const year = d.getFullYear()
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`
}

function getPeriodDates(periodName: string): Date[] {
  const [monthStr, yearStr] = periodName.split(' ')
  const monthNames: Record<string, number> = {
    Enero: 0, Febrero: 1, Marzo: 2, Abril: 3, Mayo: 4, Junio: 5,
    Julio: 6, Agosto: 7, Septiembre: 8, Octubre: 9, Noviembre: 10, Diciembre: 11,
  }
  const year = parseInt(yearStr)
  const month = monthNames[monthStr]
  const dates: Date[] = []
  const start = new Date(year, month - 1, 25)
  const end   = new Date(year, month, 24)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d))
  }
  return dates
}

function dayLabel(fecha: Date): string {
  return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function dayStartCol(dayIndex: number): number {
  return 1 + dayIndex * 3
}

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  navy:      { red: 0.118, green: 0.161, blue: 0.235 },   // #1e293b
  cyan:      { red: 0.035, green: 0.565, blue: 0.706 },   // #0990b4
  cyanLight: { red: 0.878, green: 0.969, blue: 1.0   },   // #e0f7ff
  gray:      { red: 0.945, green: 0.953, blue: 0.965 },   // #f1f5f9
  grayMid:   { red: 0.800, green: 0.820, blue: 0.850 },   // borders
  white:     { red: 1,     green: 1,     blue: 1     },
  dayAlt:    { red: 0.949, green: 0.988, blue: 1.0   },   // #f0fcff very light
  total:     { red: 0.800, green: 0.969, blue: 0.902 },   // #ccf7e6 light green
}

function rgb(c: typeof C.navy) {
  return c
}

async function formatNewSheet(
  sheets: sheets_v4.Sheets,
  sheetId: number,
  totalDays: number,
) {
  const totalHorasColIdx  = 1 + totalDays * 3
  const totalPropinaColIdx = totalHorasColIdx + 1
  const lastCol = totalPropinaColIdx + 1

  const requests: sheets_v4.Schema$Request[] = []

  // ── Freeze rows 1-2 and column A ──────────────────────────────────────────
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { frozenRowCount: 2, frozenColumnCount: 1 },
      },
      fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
    },
  })

  // ── Row 1: dark navy bg, white bold text, centered ────────────────────────
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: lastCol },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(C.navy),
          textFormat: { foregroundColor: C.white, bold: true, fontSize: 10 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  })

  // ── Row 2: cyan bg, white bold text, centered ─────────────────────────────
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: lastCol },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(C.cyan),
          textFormat: { foregroundColor: C.white, bold: true, fontSize: 9 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  })

  // ── Column A (names): gray bg, bold ───────────────────────────────────────
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(C.gray),
          textFormat: { bold: true },
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
    },
  })

  // ── Alternating day group backgrounds (data rows only) ────────────────────
  for (let i = 0; i < totalDays; i++) {
    const startCol = dayStartCol(i)
    const bg = i % 2 === 0 ? C.white : C.dayAlt
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 2, startColumnIndex: startCol, endColumnIndex: startCol + 3 },
        cell: {
          userEnteredFormat: { backgroundColor: rgb(bg) },
        },
        fields: 'userEnteredFormat(backgroundColor)',
      },
    })
  }

  // ── Totals columns: light green bg, bold, centered ────────────────────────
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, startColumnIndex: totalHorasColIdx, endColumnIndex: lastCol },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(C.total),
          textFormat: { bold: true },
          horizontalAlignment: 'CENTER',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
    },
  })

  // ── Number format: € columns → #,##0.00 ──────────────────────────────────
  for (let i = 0; i < totalDays; i++) {
    const propinaCol = dayStartCol(i) + 2
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 2, startColumnIndex: propinaCol, endColumnIndex: propinaCol + 1 },
        cell: {
          userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } },
        },
        fields: 'userEnteredFormat(numberFormat)',
      },
    })
  }
  // Total € column
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 2, startColumnIndex: totalPropinaColIdx, endColumnIndex: lastCol },
      cell: {
        userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } },
      },
      fields: 'userEnteredFormat(numberFormat)',
    },
  })

  // ── Column widths ─────────────────────────────────────────────────────────
  // Col A (names): 170px
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 170 },
      fields: 'pixelSize',
    },
  })
  // Each day: Restaurante=115, Horas=55, €=65
  for (let i = 0; i < totalDays; i++) {
    const start = dayStartCol(i)
    requests.push(
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: start,     endIndex: start + 1 }, properties: { pixelSize: 115 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: start + 1, endIndex: start + 2 }, properties: { pixelSize: 55  }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: start + 2, endIndex: start + 3 }, properties: { pixelSize: 65  }, fields: 'pixelSize' } },
    )
  }
  // Totals: 80px each
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: totalHorasColIdx, endIndex: lastCol },
      properties: { pixelSize: 80 },
      fields: 'pixelSize',
    },
  })

  // ── Row height for headers ─────────────────────────────────────────────────
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 2 },
      properties: { pixelSize: 28 },
      fields: 'pixelSize',
    },
  })

  // ── Outer border around header ─────────────────────────────────────────────
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: lastCol },
      bottom: { style: 'SOLID_MEDIUM', color: C.grayMid },
    },
  })

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  })
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface PropinaDiaSheets {
  id: number
  fecha: Date
  restaurant: { nombre: string }
  efectivo: number
  tarjeta: number
  total: number
  turnos: {
    propina: number
    horas: number
    empleado: { nombre: string; tipo: string }
  }[]
}

export async function appendPropinaToSheet(propina: PropinaDiaSheets) {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    const fecha = new Date(propina.fecha)
    const periodName = getPeriodName(fecha)
    const periodDates = getPeriodDates(periodName)

    const fechaStr = fecha.toDateString()
    const dayIndex = periodDates.findIndex(d => d.toDateString() === fechaStr)
    if (dayIndex === -1) {
      console.error('[Sheets] Fecha fuera del período:', fecha)
      return
    }

    const restCol    = dayStartCol(dayIndex)
    const propinaCol = restCol + 2
    const totalDays  = periodDates.length
    const totalHorasCol   = 1 + totalDays * 3
    const totalPropinaCol = totalHorasCol + 1

    // 1. Ensure sheet tab exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const existingSheet = meta.data.sheets?.find(s => s.properties?.title === periodName)

    let sheetId: number

    if (!existingSheet) {
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: periodName } } }],
        },
      })
      sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId!

      // Build header rows
      const row1: string[] = ['NOMBRE']
      const row2: string[] = ['']
      for (const d of periodDates) {
        row1.push(dayLabel(d), '', '')
        row2.push('Restaurante', 'Horas', '€')
      }
      row1.push('TOTAL Horas', 'TOTAL €')
      row2.push('', '')

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `'${periodName}'!A1`, values: [row1] },
            { range: `'${periodName}'!A2`, values: [row2] },
          ],
        },
      })

      // Apply formatting
      await formatNewSheet(sheets, sheetId, totalDays)
    } else {
      sheetId = existingSheet.properties?.sheetId!
    }

    // 2. Read existing employee names
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${periodName}'!A3:A200`,
    })
    const nameRows: string[] = ((dataRes.data.values ?? []) as string[][]).map(r => r[0] ?? '')

    // 3. Build value updates
    const updates: sheets_v4.Schema$ValueRange[] = []

    for (const turno of propina.turnos) {
      let empIdx = nameRows.findIndex(n => n === turno.empleado.nombre)

      if (empIdx === -1) {
        empIdx = nameRows.length
        nameRows.push(turno.empleado.nombre)
        updates.push({
          range: `'${periodName}'!A${empIdx + 3}`,
          values: [[turno.empleado.nombre]],
        })
      }

      const sheetRow = empIdx + 3

      updates.push({
        range: `'${periodName}'!${colLetter(restCol)}${sheetRow}:${colLetter(propinaCol)}${sheetRow}`,
        values: [[propina.restaurant.nombre, turno.horas, turno.propina]],
      })

      const horasTotalFormula   = `=${periodDates.map((_, i) => `${colLetter(dayStartCol(i) + 1)}${sheetRow}`).join('+')}`
      const propinaTotalFormula = `=${periodDates.map((_, i) => `${colLetter(dayStartCol(i) + 2)}${sheetRow}`).join('+')}`

      updates.push({
        range: `'${periodName}'!${colLetter(totalHorasCol)}${sheetRow}:${colLetter(totalPropinaCol)}${sheetRow}`,
        values: [[horasTotalFormula, propinaTotalFormula]],
      })

      // Apply name column formatting for new employees
      if (nameRows.indexOf(turno.empleado.nombre) === empIdx) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              repeatCell: {
                range: { sheetId, startRowIndex: sheetRow - 1, endRowIndex: sheetRow, startColumnIndex: 0, endColumnIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: C.gray,
                    textFormat: { bold: true },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            }],
          },
        })
      }
    }

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
      })
    }

    console.log(`[Sheets] Propina #${propina.id} → "${periodName}" día ${dayLabel(fecha)}`)
  } catch (err) {
    console.error('[Sheets] Error:', err)
  }
}

// ── Sheet de restaurantes ─────────────────────────────────────────────────────
// Estructura: filas = restaurantes, cols = días × 3 (Efectivo | Tarjeta | Total)

async function formatRestaurantesSheet(
  sheets: sheets_v4.Sheets,
  sheetId: number,
  totalDays: number,
) {
  const totalEfectivoCol = 1 + totalDays * 3
  const totalCol         = totalEfectivoCol + 2
  const lastCol          = totalCol + 1

  const orange = { red: 0.996, green: 0.427, blue: 0.169 }  // #fe6d2b
  const orangeLight = { red: 1.0, green: 0.949, blue: 0.925 }

  const requests: sheets_v4.Schema$Request[] = [
    // Freeze
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 2, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
    // Row 1: navy
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: lastCol }, cell: { userEnteredFormat: { backgroundColor: rgb(C.navy), textFormat: { foregroundColor: C.white, bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)' } },
    // Row 2: orange header
    { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: lastCol }, cell: { userEnteredFormat: { backgroundColor: orange, textFormat: { foregroundColor: C.white, bold: true, fontSize: 9 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)' } },
    // Col A: gray bold
    { repeatCell: { range: { sheetId, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: rgb(C.gray), textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    // Totals: orange light
    { repeatCell: { range: { sheetId, startRowIndex: 0, startColumnIndex: totalEfectivoCol, endColumnIndex: lastCol }, cell: { userEnteredFormat: { backgroundColor: orangeLight, textFormat: { bold: true }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
    // Header row height
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } },
    // Col A width
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 170 }, fields: 'pixelSize' } },
    // Totals width
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: totalEfectivoCol, endIndex: lastCol }, properties: { pixelSize: 85 }, fields: 'pixelSize' } },
    // Bottom border under headers
    { updateBorders: { range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: lastCol }, bottom: { style: 'SOLID_MEDIUM', color: C.grayMid } } },
  ]

  // Alternating day backgrounds + column widths
  for (let i = 0; i < totalDays; i++) {
    const start = dayStartCol(i)
    const bg = i % 2 === 0 ? C.white : C.dayAlt
    requests.push(
      { repeatCell: { range: { sheetId, startRowIndex: 2, startColumnIndex: start, endColumnIndex: start + 3 }, cell: { userEnteredFormat: { backgroundColor: rgb(bg) } }, fields: 'userEnteredFormat(backgroundColor)' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: start,     endIndex: start + 1 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: start + 1, endIndex: start + 2 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: start + 2, endIndex: start + 3 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },
    )
    // Number format for the 3 cols
    for (let c = 0; c < 3; c++) {
      requests.push({ repeatCell: { range: { sheetId, startRowIndex: 2, startColumnIndex: start + c, endColumnIndex: start + c + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } } }, fields: 'userEnteredFormat(numberFormat)' } })
    }
  }
  // Number format totals
  for (let c = 0; c < 3; c++) {
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 2, startColumnIndex: totalEfectivoCol + c, endColumnIndex: totalEfectivoCol + c + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } } }, fields: 'userEnteredFormat(numberFormat)' } })
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } })
}

export async function appendRestauranteToSheet(propina: PropinaDiaSheets) {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    const fecha = new Date(propina.fecha)
    const periodName = getPeriodName(fecha)
    const periodDates = getPeriodDates(periodName)
    const sheetName = `Restaurantes | ${periodName}`

    const fechaStr = fecha.toDateString()
    const dayIndex = periodDates.findIndex(d => d.toDateString() === fechaStr)
    if (dayIndex === -1) return

    const efectivoCol    = dayStartCol(dayIndex)
    const totalDayCol    = efectivoCol + 2
    const totalDays      = periodDates.length
    const totEfectivoCol = 1 + totalDays * 3
    const totTotalCol    = totEfectivoCol + 2

    // 1. Ensure sheet exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const existingSheet = meta.data.sheets?.find(s => s.properties?.title === sheetName)
    let sheetId: number

    if (!existingSheet) {
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
      })
      sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId!

      const row1: string[] = ['RESTAURANTE']
      const row2: string[] = ['']
      for (const d of periodDates) {
        row1.push(dayLabel(d), '', '')
        row2.push('Efectivo', 'Tarjeta', 'Total')
      }
      row1.push('TOTAL Efectivo', 'TOTAL Tarjeta', 'TOTAL')
      row2.push('', '', '')

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `'${sheetName}'!A1`, values: [row1] },
            { range: `'${sheetName}'!A2`, values: [row2] },
          ],
        },
      })
      await formatRestaurantesSheet(sheets, sheetId, totalDays)
    } else {
      sheetId = existingSheet.properties?.sheetId!
    }

    // 2. Read existing restaurant names
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A3:A50`,
    })
    const nameRows: string[] = ((dataRes.data.values ?? []) as string[][]).map(r => r[0] ?? '')

    let restIdx = nameRows.findIndex(n => n === propina.restaurant.nombre)
    const updates: sheets_v4.Schema$ValueRange[] = []

    if (restIdx === -1) {
      restIdx = nameRows.length
      nameRows.push(propina.restaurant.nombre)
      updates.push({ range: `'${sheetName}'!A${restIdx + 3}`, values: [[propina.restaurant.nombre]] })

      // Format new restaurant row col A
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            repeatCell: {
              range: { sheetId, startRowIndex: restIdx + 2, endRowIndex: restIdx + 3, startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { backgroundColor: C.gray, textFormat: { bold: true } } },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          }],
        },
      })
    }

    const sheetRow = restIdx + 3

    // Write Efectivo | Tarjeta | Total for this day
    updates.push({
      range: `'${sheetName}'!${colLetter(efectivoCol)}${sheetRow}:${colLetter(totalDayCol)}${sheetRow}`,
      values: [[propina.efectivo, propina.tarjeta, propina.total]],
    })

    // Totals as formulas
    const sumEfectivo = `=${periodDates.map((_, i) => `${colLetter(dayStartCol(i))}${sheetRow}`).join('+')}`
    const sumTarjeta  = `=${periodDates.map((_, i) => `${colLetter(dayStartCol(i) + 1)}${sheetRow}`).join('+')}`
    const sumTotal    = `=${periodDates.map((_, i) => `${colLetter(dayStartCol(i) + 2)}${sheetRow}`).join('+')}`

    updates.push({
      range: `'${sheetName}'!${colLetter(totEfectivoCol)}${sheetRow}:${colLetter(totTotalCol)}${sheetRow}`,
      values: [[sumEfectivo, sumTarjeta, sumTotal]],
    })

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })

    console.log(`[Sheets] Restaurante ${propina.restaurant.nombre} → "${sheetName}" día ${dayLabel(fecha)}`)
  } catch (err) {
    console.error('[Sheets] Error restaurantes:', err)
  }
}
