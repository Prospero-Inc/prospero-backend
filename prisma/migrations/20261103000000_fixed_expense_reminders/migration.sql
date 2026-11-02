-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FixedExpenseReminder';

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "fixed_expense_reminder_enabled" BOOLEAN NOT NULL DEFAULT true;
