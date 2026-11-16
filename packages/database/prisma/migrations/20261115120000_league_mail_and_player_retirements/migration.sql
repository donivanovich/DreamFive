-- CreateEnum
CREATE TYPE "LeagueMailCategory" AS ENUM (
  'MATCH_RESULT',
  'TRANSFER_SENT',
  'TRANSFER_RECEIVED',
  'TRANSFER_ACCEPTED',
  'TRANSFER_REJECTED',
  'INJURY',
  'EJECTION',
  'RETIREMENT_REPLACEMENT',
  'SEASON_SUMMARY'
);

-- AlterTable: seasons.players_aged
ALTER TABLE "seasons" ADD COLUMN "players_aged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: player_instances nullable template + retirement flags
ALTER TABLE "player_instances" DROP CONSTRAINT "player_instances_template_player_id_fkey";
ALTER TABLE "player_instances" ALTER COLUMN "template_player_id" DROP NOT NULL;
ALTER TABLE "player_instances" ADD COLUMN "is_retired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "player_instances" ADD COLUMN "retired_season_number" INTEGER;
ALTER TABLE "player_instances"
  ADD CONSTRAINT "player_instances_template_player_id_fkey"
  FOREIGN KEY ("template_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "player_instances_league_id_is_retired_current_team_id_idx"
  ON "player_instances"("league_id", "is_retired", "current_team_id");

-- CreateTable: league_mails
CREATE TABLE "league_mails" (
  "id" TEXT NOT NULL,
  "league_id" TEXT NOT NULL,
  "season_id" TEXT NOT NULL,
  "league_team_id" TEXT NOT NULL,
  "round_number" INTEGER,
  "category" "LeagueMailCategory" NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "metadata_json" JSONB,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "league_mails_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "league_mails_league_id_league_team_id_created_at_idx"
  ON "league_mails"("league_id", "league_team_id", "created_at");
CREATE INDEX "league_mails_league_id_season_id_idx"
  ON "league_mails"("league_id", "season_id");

ALTER TABLE "league_mails"
  ADD CONSTRAINT "league_mails_league_id_fkey"
  FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "league_mails"
  ADD CONSTRAINT "league_mails_season_id_league_id_fkey"
  FOREIGN KEY ("season_id", "league_id") REFERENCES "seasons"("id", "league_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "league_mails"
  ADD CONSTRAINT "league_mails_league_team_id_league_id_fkey"
  FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE CASCADE ON UPDATE CASCADE;
