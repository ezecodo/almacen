import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

// Catálogo de alérgenos (común a todos los restaurantes). Qué alérgenos tiene cada
// plato se guarda en el propio item: PUT /menu/:id con `alergenoIds`.

const alergenoSchema = z.object({
  nombre:   z.string().trim().min(1),
  nombreEn: z.string().trim().default(''),
  icono:    z.string().trim().default(''),
  orden:    z.number().int().optional(),
})

export async function alergenoRoutes(app: FastifyInstance) {

  // GET /alergenos — con cuántos items lo llevan marcado
  app.get('/alergenos', async () => {
    return prisma.alergeno.findMany({
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      include: { _count: { select: { items: true } } },
    })
  })

  // POST /alergenos — el nuevo va al final salvo que se indique orden
  app.post('/alergenos', async (req, reply) => {
    const result = alergenoSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const existe = await prisma.alergeno.findUnique({ where: { nombre: result.data.nombre } })
    if (existe) return reply.status(409).send({ error: `Ya existe el alérgeno "${result.data.nombre}"` })
    const ultimo = await prisma.alergeno.aggregate({ _max: { orden: true } })
    const alergeno = await prisma.alergeno.create({
      data: { ...result.data, orden: result.data.orden ?? (ultimo._max.orden ?? -1) + 1 },
    })
    return reply.status(201).send(alergeno)
  })

  // PUT /alergenos/:id
  app.put('/alergenos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = alergenoSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    if (result.data.nombre) {
      const otro = await prisma.alergeno.findFirst({ where: { nombre: result.data.nombre, NOT: { id } } })
      if (otro) return reply.status(409).send({ error: `Ya existe el alérgeno "${result.data.nombre}"` })
    }
    return prisma.alergeno.update({ where: { id }, data: result.data })
  })

  // DELETE /alergenos/:id — se desmarca solo de todos los platos que lo tenían
  app.delete('/alergenos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.alergeno.delete({ where: { id } })
    return reply.status(204).send()
  })
}
