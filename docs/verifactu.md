# VeriFactu — mapa técnico y de impacto en OidoOps

Preparado el 2026-10-08 a partir de la documentación oficial de la AEAT. Todavía **no hay nada de facturación real implementado**: lo único construido es un monitor de demostración (sección 8).

**Cómo leer este documento**: lo marcado **[AEAT]** sale literalmente de los documentos oficiales citados al final. Lo marcado **[interpretación]** es una lectura mía de esas normas aplicada a la app, y hay que confirmarlo con la gestoría antes de construir sobre ello. No soy asesor fiscal.

---

## 1. Lo primero: ¿aplica a OidoOps?

Sigue sin respuesta, y de ella depende todo lo demás:

> **¿El ticket que imprime OidoOps al cobrar es la factura simplificada del restaurante, o la facturación oficial se hace con otro programa?**

| | Si OidoOps emite la factura | Si la factura la emite otro sistema |
|---|---|---|
| ¿Aplica VeriFactu a la app? | Sí, de lleno | No a la facturación. Queda la obligación general de no alterar registros sin dejar rastro |
| Trabajo | Grande (secciones 4 a 6) | Pequeño: que el ticket de OidoOps diga claramente que no es factura |
| Quién responde ante Hacienda como fabricante | Eze, con declaración responsable | El fabricante del otro programa |

**Quién lo responde**: la gestoría de Valentina. Preguntas listas para enviar en la sección 7.

---

## 2. Plazos

- **1 de enero de 2027**: sociedades (contribuyentes del Impuesto sobre Sociedades).
- **1 de julio de 2027**: autónomos y resto de obligados.
- Fechas fijadas por el Real Decreto-ley 15/2025 (BOE del 3 de diciembre de 2025), que aplazó un año las anteriores. Ya se movieron dos veces: reconfirmar antes de planificar.
- **Los fabricantes de software no tienen prórroga**: están obligados desde el 29 de julio de 2025 a que el producto que comercializan cumpla.

Normas: Real Decreto 1007/2023 (reglamento) y Orden HAC/1177/2024 (especificaciones técnicas).

---

## 3. Qué exige, en corto

1. **Un registro de facturación por cada factura**, generado en el momento de expedirla.
2. **Encadenado**: cada registro incluye la huella (hash) del anterior. Alterar o borrar uno rompe la cadena.
3. **QR en la factura**, para que el cliente la coteje en la web de la AEAT.
4. **Dos modalidades**:
   - **VERI\*FACTU**: cada registro se envía a la AEAT al momento. El sistema se simplifica: no hace falta firma electrónica de cada registro ni registro de eventos.
   - **No VERI\*FACTU**: los registros se guardan en el propio sistema, firmados, con un registro de eventos y comprobaciones de integridad continuas. Más trabajo y más responsabilidad.
5. **Declaración responsable** del fabricante del software, visible en el propio programa.
6. **Certificado electrónico** para enviar a la AEAT.

Cosas concretas que dice la AEAT **[AEAT, preguntas frecuentes de desarrolladores, 4-12-2025]**:

- **Los borradores y pre-facturas están permitidos.** "Tiene que existir un momento en el que, una vez completado internamente el contenido de una factura, este se valide a los efectos de elaborar un RF". Pero sus registros también deben conservarse sin alteraciones que no dejen rastro.
- **No existen facturas de prueba en un sistema en producción.** Toda factura confirmada es real.
- **La facturación nunca debe interrumpirse** por un error de encadenamiento: se anota el problema y se sigue.
- **Los registros se generan en orden cronológico**, y un registro no puede tener fecha más de un minuto anterior al previo.
- **Si no hay conexión**, los registros quedan en cola y se reintentan.
- **En un sistema en la nube que da servicio a varios emisores**, la cadena es independiente por cada emisor, no una global.

---

## 4. Especificación técnica verificada

### 4.1 Huella (hash) **[AEAT, especificaciones de huella v0.1.2]**

- Algoritmo: **SHA-256**, único permitido.
- Salida: hexadecimal, **en mayúsculas**, 64 caracteres.
- Entrada: una cadena de texto en UTF-8 con este formato exacto, para un registro de alta:

```
IDEmisorFactura=<NIF>&NumSerieFactura=<serie+número>&FechaExpedicionFactura=<DD-MM-AAAA>&TipoFactura=<tipo>&CuotaTotal=<n.nn>&ImporteTotal=<n.nn>&Huella=<huella del registro anterior>&FechaHoraHusoGenRegistro=<AAAA-MM-DDTHH:MM:SS+HH:MM>
```

- En el **primer registro**, `Huella=` va vacío.
- Los valores van sin espacios al inicio ni al final. En los importes da igual uno o dos decimales.
- Los registros de **anulación** usan otra lista de campos (emisor, número y fecha de la factura anulada, huella anterior, fecha y hora).

**Comprobado**: el ejemplo oficial (caso 1 del documento) da `3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`, y el cálculo implementado en `VerifactuMatrixLedger.tsx` devuelve exactamente ese valor.

### 4.2 QR **[AEAT, especificaciones del QR v0.5.0]**

- Contenido: una URL del servicio de cotejo con cuatro parámetros.

| Entorno | Modalidad | URL base |
|---|---|---|
| Pruebas | VERI\*FACTU | `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR` |
| Producción | VERI\*FACTU | `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR` |
| Pruebas | No VERI\*FACTU | `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu` |
| Producción | No VERI\*FACTU | `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu` |

- Parámetros: `nif`, `numserie`, `fecha` (DD-MM-AAAA), `importe` (punto decimal). Con codificación de URL en UTF-8.
- Tamaño impreso: **entre 30×30 y 40×40 mm**. Norma ISO/IEC 18004:2015, nivel de corrección **M**.
- Encima del QR: el texto **"QR tributario:"**.
- Debajo, solo en modalidad VERI\*FACTU: **"Factura verificable en la sede electrónica de la AEAT"** o **"VERI\*FACTU"**.

### 4.3 Tipos de factura que tocan a un restaurante **[AEAT]**

| Clave | Qué es | Cuándo |
|---|---|---|
| `F2` | Factura simplificada | El ticket normal |
| `R5` | Rectificativa de simplificada | Corregir un ticket ya emitido |
| `F3` | Factura emitida en sustitución de simplificadas | El cliente pide factura completa después de tener el ticket |

Una factura emitida no se edita. Se corrige con una rectificativa, por diferencias o por sustitución.

### 4.4 Envío a la AEAT

- Servicio **SOAP con XML**, definido por WSDL y esquemas XSD publicados. No es una API JSON.
- **Entorno de pruebas**: Portal de Pruebas Externas, `https://preportal.aeat.es`.
- **Certificado electrónico cualificado** obligatorio.
- Para que el fabricante del software envíe en nombre del restaurante hace falta **colaboración social** con la AEAT o una **representación** otorgada por el restaurante. Es un trámite, no código.

---

## 5. Qué choca con la app tal como está hoy

| Tema | Hoy | Lo que haría falta |
|---|---|---|
| **Número de factura** | La comanda no tiene serie ni número fiscal | Serie y número correlativo por emisor, sin saltos |
| **Momento de emitir** | "Facturar" es imprimir la cuenta, antes de cobrar; después todavía se edita (`cuentaDesactualizada`) | **[interpretación]** La cuenta que va a la mesa pasa a ser una pre-cuenta sin validez fiscal, y la factura se emite **al cobrar**. Así el flujo actual de editar y reimprimir antes del cobro sigue siendo legal |
| **Cambios tras cobrar** | Una merma o invitación sobre una comanda cerrada cambia sus importes | Factura rectificativa `R5` nueva; la original no se toca |
| **Borrados** | Se pueden borrar turnos enteros y quitar líneas de una comanda | El registro fiscal no se borra nunca. Hay que separarlo de la comanda: tabla propia, solo de inserción |
| **`sync-db.sh`** | Reemplaza toda la base de producción por la local | Incompatible: destruiría la cadena. Las tablas fiscales tienen que quedar fuera |
| **`prisma db push --accept-data-loss`** | Se ejecuta en cada despliegue | Riesgo de perder registros fiscales por un cambio de esquema. Para esas tablas hacen falta migraciones de verdad |
| **Copias de seguridad** | Solo el backup previo de `sync-db.sh` | Copia periódica y verificada: los registros hay que conservarlos años |
| **IVA** | Un único porcentaje para toda la empresa (`EmpresaConfig.tasaIva`) | El registro desglosa base y cuota por tipo de IVA. Confirmar con la gestoría si todo va al mismo tipo |
| **Emisor** | Una sola empresa (`EmpresaConfig`) para los cinco restaurantes | Confirmar si los cinco facturan con el mismo NIF. Una cadena por emisor |
| **Ticket impreso** | Sin QR; el ticket de cobro ni siquiera se imprime todavía | QR de 30 a 40 mm con sus leyendas. La Pi puede imprimirlo: el QR viajaría en el trabajo de cobro |
| **Hora** | La del servidor | Tiene que ser fiable y nunca ir hacia atrás entre registros |
| **Sin conexión con la AEAT** | No aplica | Cola de envío con reintentos, sin frenar el cobro |
| **Propinas** | Se registran aparte | No forman parte de la factura. Sin cambios |
| **Invitaciones** | Línea a 0 € | **[interpretación]** Línea a importe cero en la factura. Confirmar tratamiento fiscal |

---

## 6. Caminos posibles

| | Hacerlo propio contra la AEAT | Usar un proveedor intermediario |
|---|---|---|
| Qué es | Generar el XML, encadenar, firmar la conexión con certificado y hablar SOAP con la AEAT | Un servicio de terceros recibe la factura por una API sencilla y se ocupa del envío |
| A favor | Sin coste por factura ni dependencia de otro | Mucho menos desarrollo; el proveedor absorbe los cambios de la AEAT |
| En contra | Más trabajo, certificado y trámite de colaboración social; hay que seguir los cambios normativos | Coste recurrente, y la responsabilidad como fabricante no desaparece |
| Modalidad recomendable | VERI\*FACTU (envío inmediato): evita firma por registro y registro de eventos | La que ofrezca el proveedor |

En cualquiera de los dos, **dentro de la app hay que hacer lo mismo**: numeración, emitir al cobrar, rectificativas, registro fiscal inmutable, QR en el ticket y protección frente a borrados y `sync-db.sh`. El proveedor solo ahorra la parte de hablar con la AEAT.

Orden de trabajo sugerido si aplica:

1. Registro fiscal propio: tabla solo de inserción, numeración, huella encadenada. Sin enviar nada todavía.
2. Cambiar el flujo de cobro: pre-cuenta antes, factura al cobrar, rectificativa después.
3. QR en el ticket de cobro, que de todos modos está pendiente para el kit de impresión.
4. Sacar las tablas fiscales de `sync-db.sh` y de `db push`, y montar copias de seguridad.
5. Envío a la AEAT, primero contra el entorno de pruebas.
6. Declaración responsable.

---

## 7. Preguntas para la gestoría

1. ¿El ticket que entrega el restaurante al cobrar es la factura simplificada, y con qué programa se emite hoy?
2. ¿La empresa tributa por Impuesto sobre Sociedades? De eso depende si el plazo es el 1 de enero o el 1 de julio de 2027.
3. ¿Los cinco restaurantes facturan con el mismo NIF, o hay varias sociedades?
4. ¿Qué series de numeración se usan, y hay una por restaurante?
5. ¿Todo lo que se sirve va al mismo tipo de IVA?
6. ¿Cómo se documenta hoy una invitación de la casa?
7. ¿Cómo se corrige hoy un ticket ya emitido?
8. ¿La gestoría es colaborador social de la AEAT y podría representar al restaurante para el envío de registros?
9. ¿Con qué frecuencia piden factura completa los clientes?

---

## 8. El monitor de demostración

`/admin/verifactu` → `apps/web/src/components/VerifactuMatrixLedger.tsx` (página `VerifactuPage.tsx`).

Una pantalla estilo terminal que muestra la cadena de registros como bloques enlazados, con una consola de eventos debajo. Sirve para enseñar la idea a Valentina o a un cliente, y como base de la pantalla de auditoría real.

**Qué es real:**

- **Las huellas**: SHA-256 calculado en el navegador con el formato oficial, verificado contra el ejemplo de la AEAT.
- **La verificación de integridad**: se recalcula cada bloque y se comprueba el enlace con el anterior. Probado: detecta un importe alterado y un registro borrado.
- **El formato del QR**: URL, parámetros y nivel de corrección según la especificación.

**Qué es simulado:**

- **Las facturas**: datos de ejemplo, y una venta nueva cada 7 segundos.
- **El envío a la AEAT**: no se envía nada. La pantalla lo dice en la cabecera y en cada registro.
- **El QR** apunta al entorno de pruebas de la AEAT, donde esas facturas no existen.
- **El NIF** del emisor (`B12345678`).

El botón **"Simular manipulación"** cambia el importe de un ticket sin tocar su huella, como haría alguien editando la base a mano: la cadena pasa a rojo desde ese bloque. Es la mejor forma de explicar para qué sirve todo esto.

Para conectarlo a datos reales basta con pasarle los registros por la prop `mockTransactions` y apagar `simular`.

---

## Fuentes

- AEAT — [Información técnica VERI\*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/informacion-tecnica.html)
- AEAT — [Especificaciones técnicas para generación de la huella o hash de los registros de facturación, v0.1.2](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_especificaciones_huella_hash_registros.pdf)
- AEAT — [Características del QR y especificaciones del servicio de cotejo, v0.5.0](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DetalleEspecificacTecnCodigoQRfactura.pdf)
- AEAT — [Preguntas frecuentes de empresas de desarrollo, 4-12-2025](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf)
- AEAT — [Portal de Pruebas Externas](https://preportal.aeat.es)
- Plazos: [Garrigues](https://www.garrigues.com/es_ES/noticia/retrasa-entrada-vigor-verifactu), [Fiscal-impuestos](https://www.fiscal-impuestos.com/node/40339), [ICAM](https://web.icam.es/se-retrasa-al-2027-la-entrada-en-vigor-de-verifactu-la-nueva-normativa-de-facturacion-electronica/)

No leído todavía: el WSDL y los esquemas XSD, los diseños de registro completos y el documento de validaciones y errores. Hacen falta antes de implementar el envío.
