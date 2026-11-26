import { type Player, POSITIONS, type Position } from '@/types/fantasy';

export const REQUIRED_SQUAD_SIZE = 18;
export const MIN_TRADE_VALUE_RATIO = 0.5;

export interface TradeEvaluation {
  readonly offeredPlayersValue: number;
  readonly offeredTotalValue: number;
  readonly requestedTotalValue: number;
  readonly minimumRequiredValue: number;
  readonly meetsValueRule: boolean;
  readonly resultingSquadSize: number;
  readonly meetsSquadSizeRule: boolean;
  readonly missingPositions: readonly Position[];
  readonly meetsPositionCoverageRule: boolean;
  readonly isValid: boolean;
}

/**
 * Evalúa visualmente en el prototipo si una propuesta de intercambio cumple las
 * restricciones conocidas de DreamFive (18 jugadores, mínimo 1 por posición y al
 * menos el 50 % del valor del jugador o jugadores deseados).
 *
 * La validación autoritativa pertenecerá siempre al backend.
 */
export function evaluateTradeProposal(params: {
  readonly currentRoster: readonly Player[];
  readonly offeredPlayerIds: readonly string[];
  readonly requestedPlayers: readonly Player[];
  readonly cashOfferedMillions: number;
}): TradeEvaluation {
  const { currentRoster, offeredPlayerIds, requestedPlayers, cashOfferedMillions } = params;

  const offeredSet = new Set(offeredPlayerIds);
  const offeredPlayers = currentRoster.filter((player) => offeredSet.has(player.id));

  const offeredPlayersValue = offeredPlayers.reduce((sum, p) => sum + p.priceMillions, 0);
  const offeredTotalValue = offeredPlayersValue + Math.max(0, cashOfferedMillions);
  const requestedTotalValue = requestedPlayers.reduce((sum, p) => sum + p.priceMillions, 0);
  const minimumRequiredValue = requestedTotalValue * MIN_TRADE_VALUE_RATIO;

  const remainingRoster = currentRoster.filter((player) => !offeredSet.has(player.id));
  const resultingRoster = [...remainingRoster, ...requestedPlayers];
  const resultingSquadSize = resultingRoster.length;

  const positionCounts: Record<Position, number> = {
    PG: 0,
    SG: 0,
    SF: 0,
    PF: 0,
    C: 0,
  };
  for (const player of resultingRoster) {
    positionCounts[player.position] += 1;
  }

  const missingPositions = POSITIONS.filter((pos) => positionCounts[pos] === 0);

  const meetsValueRule =
    requestedPlayers.length > 0 &&
    offeredTotalValue + 1e-9 >= minimumRequiredValue &&
    (offeredPlayers.length > 0 || cashOfferedMillions > 0);
  const meetsSquadSizeRule = resultingSquadSize === REQUIRED_SQUAD_SIZE;
  const meetsPositionCoverageRule = missingPositions.length === 0;

  return {
    offeredPlayersValue,
    offeredTotalValue,
    requestedTotalValue,
    minimumRequiredValue,
    meetsValueRule,
    resultingSquadSize,
    meetsSquadSizeRule,
    missingPositions,
    meetsPositionCoverageRule,
    isValid: meetsValueRule && meetsSquadSizeRule && meetsPositionCoverageRule,
  };
}
