-- AlterEnum
ALTER TYPE "ProcessedEmailResult" ADD VALUE 'PossibleDuplicate';

-- AlterTable
ALTER TABLE "financial_institutions" ADD COLUMN     "parser_key" TEXT;
