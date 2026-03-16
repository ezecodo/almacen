-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "barcode" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'ud',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Producto_barcode_key" ON "Producto"("barcode");
