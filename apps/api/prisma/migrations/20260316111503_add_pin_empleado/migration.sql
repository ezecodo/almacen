/*
  Warnings:

  - You are about to drop the column `restaurantId` on the `Empleado` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[pin]` on the table `Empleado` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `pin` to the `Empleado` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Empleado" DROP CONSTRAINT "Empleado_restaurantId_fkey";

-- AlterTable
ALTER TABLE "Empleado" DROP COLUMN "restaurantId",
ADD COLUMN     "pin" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_pin_key" ON "Empleado"("pin");
