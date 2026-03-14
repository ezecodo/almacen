-- CreateTable
CREATE TABLE "Restaurant" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retiro" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empleadoId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "Retiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetiroItem" (
    "id" SERIAL NOT NULL,
    "retiroId" INTEGER NOT NULL,
    "barcode" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,

    CONSTRAINT "RetiroItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retiro" ADD CONSTRAINT "Retiro_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retiro" ADD CONSTRAINT "Retiro_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetiroItem" ADD CONSTRAINT "RetiroItem_retiroId_fkey" FOREIGN KEY ("retiroId") REFERENCES "Retiro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
