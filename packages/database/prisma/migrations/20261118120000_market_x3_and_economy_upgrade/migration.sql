ALTER TABLE "leagues"
ADD COLUMN "market_scale" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "leagues"
ALTER COLUMN "market_scale" SET DEFAULT 3;

ALTER TABLE "league_teams"
ALTER COLUMN "budget_millions" SET DEFAULT 75.0;
