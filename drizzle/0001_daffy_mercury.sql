CREATE TABLE `folders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`parentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `noteFolders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`noteId` int NOT NULL,
	`folderId` int NOT NULL,
	CONSTRAINT `noteFolders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `noteTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`noteId` int NOT NULL,
	`tagId` int NOT NULL,
	CONSTRAINT `noteTags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` text,
	`encryptedContent` text NOT NULL,
	`noteType` enum('plain','rich','markdown','checklist','code','spreadsheet') NOT NULL DEFAULT 'plain',
	`isPinned` int NOT NULL DEFAULT 0,
	`isArchived` int NOT NULL DEFAULT 0,
	`isTrashed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`noteId` int NOT NULL,
	`encryptedContent` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `revisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(7),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`encryptedMasterKey` text,
	`saltForKeyDerivation` varchar(64),
	`twoFactorEnabled` int NOT NULL DEFAULT 0,
	`twoFactorSecret` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `userSettings_userId_unique` UNIQUE(`userId`)
);
