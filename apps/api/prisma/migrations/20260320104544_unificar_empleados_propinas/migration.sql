-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'cocina',
ALTER COLUMN "pin" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PropinaDia" (
    "id" SERIAL NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "efectivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tarjeta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropinaDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropinaTurno" (
    "id" SERIAL NOT NULL,
    "propinaDiaId" INTEGER NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "propina" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PropinaTurno_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PropinaDia" ADD CONSTRAINT "PropinaDia_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropinaTurno" ADD CONSTRAINT "PropinaTurno_propinaDiaId_fkey" FOREIGN KEY ("propinaDiaId") REFERENCES "PropinaDia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropinaTurno" ADD CONSTRAINT "PropinaTurno_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
