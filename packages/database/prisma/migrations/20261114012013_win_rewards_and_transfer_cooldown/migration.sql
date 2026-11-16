-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "win_reward_millions" DOUBLE PRECISION,
ADD COLUMN     "win_reward_paid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transfer_offers" ADD COLUMN     "rejected_game_clock_at" TIMESTAMP(3);
