-- CreateTable
CREATE TABLE "InventarioCategoria" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "restaurantId" INTEGER,

    CONSTRAINT "InventarioCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioProducto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'ud',
    "stockMinimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "categoriaId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "InventarioProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioConteo" (
    "id" SERIAL NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPor" TEXT,
    "notas" TEXT,
    "cerrado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventarioConteo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioConteoItem" (
    "id" SERIAL NOT NULL,
    "conteoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InventarioConteoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventarioConteoItem_conteoId_productoId_key" ON "InventarioConteoItem"("conteoId", "productoId");

-- AddForeignKey
ALTER TABLE "InventarioCategoria" ADD CONSTRAINT "InventarioCategoria_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioProducto" ADD CONSTRAINT "InventarioProducto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "InventarioCategoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioProducto" ADD CONSTRAINT "InventarioProducto_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioConteo" ADD CONSTRAINT "InventarioConteo_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioConteoItem" ADD CONSTRAINT "InventarioConteoItem_conteoId_fkey" FOREIGN KEY ("conteoId") REFERENCES "InventarioConteo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioConteoItem" ADD CONSTRAINT "InventarioConteoItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "InventarioProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
