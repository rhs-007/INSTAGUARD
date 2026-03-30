-- AlterTable
ALTER TABLE `user` MODIFY `avatarUrl` LONGTEXT NULL;

-- CreateTable
CREATE TABLE `moderationqueue` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('TEXT') NOT NULL DEFAULT 'TEXT',
    `status` ENUM('PENDING', 'RESOLVED') NOT NULL DEFAULT 'PENDING',
    `messageId` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `textSnapshot` LONGTEXT NOT NULL,
    `reason` VARCHAR(191) NULL,
    `matched` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolutionNote` VARCHAR(191) NULL,

    UNIQUE INDEX `moderationqueue_messageId_key`(`messageId`),
    INDEX `moderationqueue_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `moderationqueue_senderId_idx`(`senderId`),
    INDEX `moderationqueue_chatId_idx`(`chatId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `moderationqueue` ADD CONSTRAINT `moderationqueue_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderationqueue` ADD CONSTRAINT `moderationqueue_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderationqueue` ADD CONSTRAINT `moderationqueue_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderationqueue` ADD CONSTRAINT `moderationqueue_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
