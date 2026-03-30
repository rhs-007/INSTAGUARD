/*
  Warnings:

  - Added the required column `updatedAt` to the `message` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `message` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `editedAt` DATETIME(3) NULL,
    ADD COLUMN `seenAt` DATETIME(3) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;
