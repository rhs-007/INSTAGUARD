-- AlterTable
ALTER TABLE `user` ADD COLUMN `banReason` VARCHAR(191) NULL,
    ADD COLUMN `bannedAt` DATETIME(3) NULL,
    ADD COLUMN `isBanned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `suspendReason` VARCHAR(191) NULL,
    ADD COLUMN `suspendedUntil` DATETIME(3) NULL;
