import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding...')

  const restaurantes = [
    { nombre: 'Sensi Tapas', empleados: ['María García', 'Carlos López', 'Ana Martínez'] },
    { nombre: 'Restaurante 2', empleados: ['Pedro Sánchez', 'Laura Fernández'] },
    { nombre: 'Restaurante 3', empleados: ['Miguel Torres', 'Sofia Ruiz'] },
    { nombre: 'Restaurante 4', empleados: ['David Moreno', 'Elena Jiménez'] },
    { nombre: 'Restaurante 5', empleados: ['Roberto Díaz', 'Carmen Vega'] }
  ]

  for (const rest of restaurantes) {
    const restaurant = await prisma.restaurant.create({
      data: { nombre: rest.nombre }
    })
    for (const nombre of rest.empleados) {
      await prisma.empleado.create({
        data: { nombre, restaurantId: restaurant.id }
      })
    }
    console.log(`✓ ${rest.nombre}`)
  }

  console.log('Listo!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
