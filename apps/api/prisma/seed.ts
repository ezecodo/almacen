import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const productos = [
  { barcode: "8410188012", nombre: "Aceite de oliva virgen", cantidad: 2, unidad: "l" },
  { barcode: "8480000101", nombre: "Patatas", cantidad: 5, unidad: "kg" },
  { barcode: "8410000001", nombre: "Limones", cantidad: 2, unidad: "kg" },
  { barcode: "8410000002", nombre: "Tomates pera", cantidad: 3, unidad: "kg" },
  { barcode: "8410000003", nombre: "Cebolla blanca", cantidad: 4, unidad: "kg" },
  { barcode: "8410000004", nombre: "Ajo", cantidad: 1, unidad: "kg" },
  { barcode: "8410000005", nombre: "Harina de trigo", cantidad: 5, unidad: "kg" },
  { barcode: "8410000006", nombre: "Sal marina", cantidad: 2, unidad: "kg" },
  { barcode: "8410000007", nombre: "Vino blanco", cantidad: 3, unidad: "l" },
  { barcode: "8410000008", nombre: "Caldo de pollo", cantidad: 4, unidad: "l" },
  { barcode: "8410000009", nombre: "Mantequilla", cantidad: 1, unidad: "kg" },
  { barcode: "8410000010", nombre: "Nata para cocinar", cantidad: 2, unidad: "l" },
  { barcode: "8410000011", nombre: "Huevos", cantidad: 30, unidad: "ud" },
  { barcode: "8410000012", nombre: "Pechuga de pollo", cantidad: 4, unidad: "kg" },
  { barcode: "8410000013", nombre: "Solomillo de cerdo", cantidad: 3, unidad: "kg" },
  { barcode: "8410000014", nombre: "Bacalao", cantidad: 2, unidad: "kg" },
  { barcode: "8410000015", nombre: "Gambas", cantidad: 2, unidad: "kg" },
  { barcode: "8410000016", nombre: "Mejillones", cantidad: 3, unidad: "kg" },
  { barcode: "8410000017", nombre: "Arroz bomba", cantidad: 5, unidad: "kg" },
  { barcode: "8410000018", nombre: "Pasta", cantidad: 4, unidad: "kg" },
  { barcode: "8410000019", nombre: "Azúcar", cantidad: 2, unidad: "kg" },
  { barcode: "8410000020", nombre: "Pimentón dulce", cantidad: 0.5, unidad: "kg" },
  { barcode: "8410000021", nombre: "Comino", cantidad: 0.2, unidad: "kg" },
  { barcode: "8410000022", nombre: "Pimienta negra", cantidad: 0.3, unidad: "kg" },
  { barcode: "8410000023", nombre: "Vinagre de Jerez", cantidad: 1, unidad: "l" },
  { barcode: "8410000024", nombre: "Cerveza rubia", cantidad: 24, unidad: "ud" },
  { barcode: "8410000025", nombre: "Agua mineral", cantidad: 12, unidad: "ud" },
  { barcode: "8410000026", nombre: "Pimientos del piquillo", cantidad: 2, unidad: "kg" },
  { barcode: "8410000027", nombre: "Chorizo ibérico", cantidad: 1.5, unidad: "kg" },
  { barcode: "8410000028", nombre: "Jamón serrano", cantidad: 2, unidad: "kg" },
];

function diasAtras(dias: number) {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

function itemsAleatorios(n: number) {
  return [...productos].sort(() => Math.random() - 0.5).slice(0, n);
}

async function main() {
  console.log("Limpiando datos anteriores...");
  await prisma.retiroItem.deleteMany();
  await prisma.retiro.deleteMany();
  await prisma.empleado.deleteMany();
  await prisma.restaurant.deleteMany();

  console.log("Seeding restaurantes...");

  const restaurantesData = [
    { nombre: "Sensi Tapas",          placeId: "ChIJ-Tjd-VUipBIR9AOzqm5NzEY" },
    { nombre: "Petit Tapas",          placeId: "ChIJNZTfv0ejpBIRkWHbSz0WEjU" },
    { nombre: "Colección by Sensi",   placeId: "ChIJQTcU1FejpBIRcAsuIHtvZHY" },
    { nombre: "Le Bistro Sensi",      placeId: "ChIJp4MZsfiipBIRM7YJu0xCScQ" },
    { nombre: "Gourmet Tapas by Sensi", placeId: "ChIJHzYhAFaipBIRx-tuRQR-P7Y" },
  ];

  const restaurantes = [];
  for (const data of restaurantesData) {
    const r = await prisma.restaurant.create({ data });
    restaurantes.push(r);
    console.log(`✓ ${data.nombre}`);
  }

  console.log("Seeding empleados...");

  const empleadosData = [
    { nombre: "María García",    pin: "1001" },
    { nombre: "Carlos López",    pin: "1002" },
    { nombre: "Ana Martínez",    pin: "1003" },
    { nombre: "Pedro Sánchez",   pin: "1004" },
    { nombre: "Laura Fernández", pin: "1005" },
    { nombre: "Miguel Torres",   pin: "1006" },
    { nombre: "Sofia Ruiz",      pin: "1007" },
    { nombre: "David Moreno",    pin: "1008" },
    { nombre: "Elena Jiménez",   pin: "1009" },
    { nombre: "Roberto Díaz",    pin: "1010" },
    { nombre: "Carmen Vega",     pin: "1011" },
  ];

  const empleados = [];
  for (const data of empleadosData) {
    const e = await prisma.empleado.create({ data });
    empleados.push(e);
    console.log(`✓ ${data.nombre} (PIN: ${data.pin})`);
  }

  console.log("Seeding retiros...");

  const retirosPorRestaurante = [
    { dias: [1, 2, 3, 5, 6] },
    { dias: [1, 3, 4, 6, 7] },
    { dias: [2, 3, 5, 6, 7] },
    { dias: [1, 2, 4, 5, 7] },
    { dias: [1, 3, 4, 6, 7] },
  ];

  for (let i = 0; i < restaurantes.length; i++) {
    const rest = restaurantes[i];
    const diasRetiros = retirosPorRestaurante[i].dias;

    for (const dia of diasRetiros) {
      const empleado = empleados[Math.floor(Math.random() * empleados.length)];
      const numItems = Math.floor(Math.random() * 5) + 3;

      await prisma.retiro.create({
        data: {
          empleadoId: empleado.id,
          restaurantId: rest.id,
          createdAt: diasAtras(dia),
          items: {
            create: itemsAleatorios(numItems),
          },
        },
      });
    }
    console.log(`✓ Retiros para ${rest.nombre}`);
  }

  console.log("Todo listo!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
