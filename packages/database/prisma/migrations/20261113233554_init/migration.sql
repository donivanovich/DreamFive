-- CreateEnum
CREATE TYPE "UserAccountRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('PG', 'SG', 'SF', 'PF', 'C');

-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('SUPERSTAR', 'STAR', 'STARTER', 'ROTATION', 'ROOKIE', 'BENCH');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('HEALTHY', 'QUESTIONABLE', 'INJURED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LeagueRole" AS ENUM ('PRESIDENT', 'MEMBER');

-- CreateEnum
CREATE TYPE "LeagueStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MarketMode" AS ENUM ('LEAGUE_ISOLATED', 'GLOBAL_HYBRID');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'FINAL');

-- CreateEnum
CREATE TYPE "MatchEventType" AS ENUM ('TIPOFF', 'RUN', 'CLUTCH', 'INJURY', 'EJECTION', 'OVERTIME', 'FINAL');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SimulationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserAccountRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "preferences_json" JSONB NOT NULL DEFAULT '{"tradeAlerts":true,"injuryAlerts":true,"lineupReminder":true,"compactTables":false}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "conference" TEXT NOT NULL,
    "primary_color" TEXT NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "template_team_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "initial_role" "PlayerRole" NOT NULL,
    "age" INTEGER NOT NULL,
    "base_price_millions" DOUBLE PRECISION NOT NULL,
    "overall_rating" INTEGER NOT NULL,
    "offense" INTEGER NOT NULL,
    "defense" INTEGER NOT NULL,
    "playmaking" INTEGER NOT NULL,
    "rebounding" INTEGER NOT NULL,
    "athleticism" INTEGER NOT NULL,
    "iq" INTEGER NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "president_user_id" TEXT NOT NULL,
    "status" "LeagueStatus" NOT NULL DEFAULT 'ACTIVE',
    "max_participants" INTEGER NOT NULL DEFAULT 30,
    "market_mode" "MarketMode" NOT NULL DEFAULT 'LEAGUE_ISOLATED',
    "game_clock_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_accelerated" BOOLEAN NOT NULL DEFAULT false,
    "simulation_seed" TEXT NOT NULL,
    "scoring_config_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "season_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "calendar_year" INTEGER NOT NULL,
    "calendar_month" INTEGER NOT NULL,
    "days_in_month" INTEGER NOT NULL,
    "total_rounds" INTEGER NOT NULL DEFAULT 58,
    "current_round_number" INTEGER NOT NULL DEFAULT 0,
    "status" "SeasonStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_teams" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "template_team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "budget_millions" DOUBLE PRECISION NOT NULL DEFAULT 25.0,
    "is_cpu_controlled" BOOLEAN NOT NULL DEFAULT true,
    "total_fantasy_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "league_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_members" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "league_team_id" TEXT NOT NULL,
    "role" "LeagueRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_invitations" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "invited_user_id" TEXT NOT NULL,
    "invited_tag" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "league_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_instances" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "template_player_id" TEXT NOT NULL,
    "current_team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "role" "PlayerRole" NOT NULL,
    "age" INTEGER NOT NULL,
    "price_millions" DOUBLE PRECISION NOT NULL,
    "price_delta_millions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'HEALTHY',
    "status_note" TEXT,
    "games_out_remaining" INTEGER NOT NULL DEFAULT 0,
    "overall_rating" INTEGER NOT NULL,
    "offense" INTEGER NOT NULL,
    "defense" INTEGER NOT NULL,
    "playmaking" INTEGER NOT NULL,
    "rebounding" INTEGER NOT NULL,
    "athleticism" INTEGER NOT NULL,
    "iq" INTEGER NOT NULL,
    "season_games_played" INTEGER NOT NULL DEFAULT 0,
    "season_fantasy_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "season_pts_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "season_reb_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "season_ast_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "player_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "league_team_id" TEXT NOT NULL,
    "player_instance_id" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineups" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "league_team_id" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "pg_player_id" TEXT,
    "sg_player_id" TEXT,
    "sf_player_id" TEXT,
    "pf_player_id" TEXT,
    "c_player_id" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lineups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "simulated_at" TIMESTAMP(3),
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "home_team_id" TEXT NOT NULL,
    "away_team_id" TEXT NOT NULL,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "overtime_count" INTEGER NOT NULL DEFAULT 0,
    "seed" TEXT NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "clock_label" TEXT NOT NULL,
    "event_type" "MatchEventType" NOT NULL,
    "player_instance_id" TEXT,
    "league_team_id" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_match_stats" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "league_team_id" TEXT NOT NULL,
    "player_instance_id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "pts" INTEGER NOT NULL,
    "reb" INTEGER NOT NULL,
    "ast" INTEGER NOT NULL,
    "stl" INTEGER NOT NULL,
    "blk" INTEGER NOT NULL,
    "tov" INTEGER NOT NULL,
    "pf" INTEGER NOT NULL,
    "fantasy_points" DOUBLE PRECISION NOT NULL,
    "was_starter" BOOLEAN NOT NULL,
    "ejected" BOOLEAN NOT NULL DEFAULT false,
    "injured" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "player_match_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_match_stats" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "league_team_id" TEXT NOT NULL,
    "pts" INTEGER NOT NULL,
    "reb" INTEGER NOT NULL,
    "ast" INTEGER NOT NULL,
    "stl" INTEGER NOT NULL,
    "blk" INTEGER NOT NULL,
    "tov" INTEGER NOT NULL,
    "pf" INTEGER NOT NULL,

    CONSTRAINT "team_match_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_scores" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "league_team_id" TEXT NOT NULL,
    "total_fp" DOUBLE PRECISION NOT NULL,
    "breakdown_json" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fantasy_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standings" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "league_team_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "fantasy_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_round_fp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_fp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "last_five_results" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_offers" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "proposing_team_id" TEXT NOT NULL,
    "receiving_team_id" TEXT NOT NULL,
    "proposed_by_user_id" TEXT NOT NULL,
    "offered_player_ids" TEXT[],
    "requested_player_ids" TEXT[],
    "cash_offered_millions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cash_requested_millions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "response_note" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "transfer_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_history" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "from_team_id" TEXT NOT NULL,
    "to_team_id" TEXT NOT NULL,
    "moved_player_ids" TEXT[],
    "cash_transferred_net" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "injuries" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "player_instance_id" TEXT NOT NULL,
    "match_id" TEXT,
    "reason" TEXT NOT NULL,
    "games_remaining" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "injuries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suspensions" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "player_instance_id" TEXT NOT NULL,
    "match_id" TEXT,
    "reason" TEXT NOT NULL,
    "games_remaining" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_history" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "player_instance_id" TEXT NOT NULL,
    "price_millions" DOUBLE PRECISION NOT NULL,
    "delta_millions" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_jobs" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "season_id" TEXT,
    "job_type" TEXT NOT NULL,
    "target_round" INTEGER,
    "target_match_id" TEXT,
    "bullmq_job_id" TEXT,
    "status" "SimulationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "seed" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "simulation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_username_key" ON "user_profiles"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_tag_key" ON "user_profiles"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- CreateIndex
CREATE UNIQUE INDEX "players_slug_key" ON "players"("slug");

-- CreateIndex
CREATE INDEX "players_template_team_id_idx" ON "players"("template_team_id");

-- CreateIndex
CREATE INDEX "leagues_president_user_id_idx" ON "leagues"("president_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_league_id_season_number_key" ON "seasons"("league_id", "season_number");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_id_league_id_key" ON "seasons"("id", "league_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_teams_league_id_template_team_id_key" ON "league_teams"("league_id", "template_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_teams_league_id_code_key" ON "league_teams"("league_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "league_teams_id_league_id_key" ON "league_teams"("id", "league_id");

-- CreateIndex
CREATE INDEX "league_members_user_id_idx" ON "league_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_members_league_id_user_id_key" ON "league_members"("league_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_members_league_team_id_league_id_key" ON "league_members"("league_team_id", "league_id");

-- CreateIndex
CREATE INDEX "league_invitations_league_id_status_idx" ON "league_invitations"("league_id", "status");

-- CreateIndex
CREATE INDEX "league_invitations_invited_user_id_status_idx" ON "league_invitations"("invited_user_id", "status");

-- CreateIndex
CREATE INDEX "player_instances_league_id_current_team_id_idx" ON "player_instances"("league_id", "current_team_id");

-- CreateIndex
CREATE INDEX "player_instances_league_id_position_role_idx" ON "player_instances"("league_id", "position", "role");

-- CreateIndex
CREATE UNIQUE INDEX "player_instances_league_id_template_player_id_key" ON "player_instances"("league_id", "template_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_instances_id_league_id_key" ON "player_instances"("id", "league_id");

-- CreateIndex
CREATE INDEX "rosters_league_id_league_team_id_idx" ON "rosters"("league_id", "league_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "rosters_player_instance_id_league_id_key" ON "rosters"("player_instance_id", "league_id");

-- CreateIndex
CREATE UNIQUE INDEX "lineups_league_id_season_id_league_team_id_round_number_key" ON "lineups"("league_id", "season_id", "league_team_id", "round_number");

-- CreateIndex
CREATE INDEX "matches_league_id_season_id_round_number_idx" ON "matches"("league_id", "season_id", "round_number");

-- CreateIndex
CREATE INDEX "matches_league_id_status_scheduled_at_idx" ON "matches"("league_id", "status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "matches_id_league_id_key" ON "matches"("id", "league_id");

-- CreateIndex
CREATE INDEX "match_events_league_id_match_id_idx" ON "match_events"("league_id", "match_id");

-- CreateIndex
CREATE INDEX "player_match_stats_league_id_round_number_idx" ON "player_match_stats"("league_id", "round_number");

-- CreateIndex
CREATE INDEX "player_match_stats_league_id_player_instance_id_idx" ON "player_match_stats"("league_id", "player_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_match_stats_match_id_player_instance_id_key" ON "player_match_stats"("match_id", "player_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_match_stats_match_id_league_team_id_key" ON "team_match_stats"("match_id", "league_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_scores_league_id_season_id_round_number_league_team_key" ON "fantasy_scores"("league_id", "season_id", "round_number", "league_team_id");

-- CreateIndex
CREATE INDEX "standings_league_id_season_id_rank_idx" ON "standings"("league_id", "season_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "standings_league_id_season_id_league_team_id_key" ON "standings"("league_id", "season_id", "league_team_id");

-- CreateIndex
CREATE INDEX "transfer_offers_league_id_status_idx" ON "transfer_offers"("league_id", "status");

-- CreateIndex
CREATE INDEX "transfer_offers_league_id_proposing_team_id_idx" ON "transfer_offers"("league_id", "proposing_team_id");

-- CreateIndex
CREATE INDEX "transfer_offers_league_id_receiving_team_id_idx" ON "transfer_offers"("league_id", "receiving_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_offer_id_key" ON "transactions"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotency_key_key" ON "transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "transactions_league_id_executed_at_idx" ON "transactions"("league_id", "executed_at");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_history_offer_id_key" ON "transfer_history"("offer_id");

-- CreateIndex
CREATE INDEX "transfer_history_league_id_executed_at_idx" ON "transfer_history"("league_id", "executed_at");

-- CreateIndex
CREATE INDEX "injuries_league_id_active_idx" ON "injuries"("league_id", "active");

-- CreateIndex
CREATE INDEX "suspensions_league_id_active_idx" ON "suspensions"("league_id", "active");

-- CreateIndex
CREATE INDEX "market_history_league_id_player_instance_id_recorded_at_idx" ON "market_history"("league_id", "player_instance_id", "recorded_at");

-- CreateIndex
CREATE INDEX "simulation_jobs_league_id_started_at_idx" ON "simulation_jobs"("league_id", "started_at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_template_team_id_fkey" FOREIGN KEY ("template_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_president_user_id_fkey" FOREIGN KEY ("president_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_template_team_id_fkey" FOREIGN KEY ("template_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_team_id_league_id_fkey" FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_invitations" ADD CONSTRAINT "league_invitations_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_invitations" ADD CONSTRAINT "league_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_invitations" ADD CONSTRAINT "league_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_instances" ADD CONSTRAINT "player_instances_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_instances" ADD CONSTRAINT "player_instances_template_player_id_fkey" FOREIGN KEY ("template_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_instances" ADD CONSTRAINT "player_instances_current_team_id_league_id_fkey" FOREIGN KEY ("current_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_league_team_id_league_id_fkey" FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_player_instance_id_league_id_fkey" FOREIGN KEY ("player_instance_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_season_id_league_id_fkey" FOREIGN KEY ("season_id", "league_id") REFERENCES "seasons"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_league_team_id_league_id_fkey" FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_pg_player_id_league_id_fkey" FOREIGN KEY ("pg_player_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_sg_player_id_league_id_fkey" FOREIGN KEY ("sg_player_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_sf_player_id_league_id_fkey" FOREIGN KEY ("sf_player_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_pf_player_id_league_id_fkey" FOREIGN KEY ("pf_player_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_c_player_id_league_id_fkey" FOREIGN KEY ("c_player_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_league_id_fkey" FOREIGN KEY ("season_id", "league_id") REFERENCES "seasons"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_league_id_fkey" FOREIGN KEY ("home_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_league_id_fkey" FOREIGN KEY ("away_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_league_id_fkey" FOREIGN KEY ("match_id", "league_id") REFERENCES "matches"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_instance_id_league_id_fkey" FOREIGN KEY ("player_instance_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_league_team_id_league_id_fkey" FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_season_id_league_id_fkey" FOREIGN KEY ("season_id", "league_id") REFERENCES "seasons"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_match_id_league_id_fkey" FOREIGN KEY ("match_id", "league_id") REFERENCES "matches"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_league_team_id_league_id_fkey" FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_player_instance_id_league_id_fkey" FOREIGN KEY ("player_instance_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_match_stats" ADD CONSTRAINT "team_match_stats_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_match_stats" ADD CONSTRAINT "team_match_stats_match_id_league_id_fkey" FOREIGN KEY ("match_id", "league_id") REFERENCES "matches"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_match_stats" ADD CONSTRAINT "team_match_stats_league_team_id_league_id_fkey" FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_scores" ADD CONSTRAINT "fantasy_scores_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_scores" ADD CONSTRAINT "fantasy_scores_season_id_league_id_fkey" FOREIGN KEY ("season_id", "league_id") REFERENCES "seasons"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_scores" ADD CONSTRAINT "fantasy_scores_league_team_id_league_id_fkey" FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standings" ADD CONSTRAINT "standings_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standings" ADD CONSTRAINT "standings_season_id_league_id_fkey" FOREIGN KEY ("season_id", "league_id") REFERENCES "seasons"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standings" ADD CONSTRAINT "standings_league_team_id_league_id_fkey" FOREIGN KEY ("league_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_offers" ADD CONSTRAINT "transfer_offers_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_offers" ADD CONSTRAINT "transfer_offers_proposing_team_id_league_id_fkey" FOREIGN KEY ("proposing_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_offers" ADD CONSTRAINT "transfer_offers_receiving_team_id_league_id_fkey" FOREIGN KEY ("receiving_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_offers" ADD CONSTRAINT "transfer_offers_proposed_by_user_id_fkey" FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "transfer_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "transfer_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_from_team_id_league_id_fkey" FOREIGN KEY ("from_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_to_team_id_league_id_fkey" FOREIGN KEY ("to_team_id", "league_id") REFERENCES "league_teams"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_player_instance_id_league_id_fkey" FOREIGN KEY ("player_instance_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_match_id_league_id_fkey" FOREIGN KEY ("match_id", "league_id") REFERENCES "matches"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_player_instance_id_league_id_fkey" FOREIGN KEY ("player_instance_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_match_id_league_id_fkey" FOREIGN KEY ("match_id", "league_id") REFERENCES "matches"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_history" ADD CONSTRAINT "market_history_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_history" ADD CONSTRAINT "market_history_player_instance_id_league_id_fkey" FOREIGN KEY ("player_instance_id", "league_id") REFERENCES "player_instances"("id", "league_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_jobs" ADD CONSTRAINT "simulation_jobs_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_jobs" ADD CONSTRAINT "simulation_jobs_season_id_league_id_fkey" FOREIGN KEY ("season_id", "league_id") REFERENCES "seasons"("id", "league_id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Custom Partial Unique Index: Max 1 active presidency per user (Atomic DB guarantee)
CREATE UNIQUE INDEX "leagues_one_active_presidency_per_user" ON "leagues" ("president_user_id") WHERE status = 'ACTIVE';
