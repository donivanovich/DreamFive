-- DropForeignKey
ALTER TABLE "transfer_offers" DROP CONSTRAINT "transfer_offers_proposed_by_user_id_fkey";

-- AlterTable
ALTER TABLE "transfer_offers" ALTER COLUMN "proposed_by_user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "transfer_offers" ADD CONSTRAINT "transfer_offers_proposed_by_user_id_fkey" FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
