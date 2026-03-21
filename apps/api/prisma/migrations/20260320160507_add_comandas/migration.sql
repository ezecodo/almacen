-- CreateTable
CREATE TABLE "Comanda" (
    "id" SERIAL NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "mesaId" INTEGER NOT NULL,
    "pax" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Comanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComandaItem" (
    "id" SERIAL NOT NULL,
    "comandaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "nota" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ComandaItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
