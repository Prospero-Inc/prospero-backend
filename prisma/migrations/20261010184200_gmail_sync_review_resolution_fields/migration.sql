-- AlterTable
ALTER TABLE "processed_emails" ADD COLUMN     "parsed_amount" DOUBLE PRECISION,
ADD COLUMN     "parsed_date" TIMESTAMP(3),
ADD COLUMN     "parsed_description" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "processed_emails_related_transaction_id_result_resolved_at_idx" ON "processed_emails"("related_transaction_id", "result", "resolved_at");

-- CreateIndex
CREATE INDEX "processed_emails_related_salary_id_result_resolved_at_idx" ON "processed_emails"("related_salary_id", "result", "resolved_at");
