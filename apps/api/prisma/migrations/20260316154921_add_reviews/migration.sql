-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "placeId" TEXT;

-- CreateTable
CREATE TABLE "ReviewSnapshot" (
    "id" SERIAL NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewSnapshot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ReviewSnapshot" ADD CONSTRAINT "ReviewSnapshot_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
