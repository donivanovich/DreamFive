import type { SimulatedPlayerBox, SimulatedTeamTotals } from '../shared/types.js';

export function buildTeamTotalsFromBoxes(params: {
  readonly teamId: string;
  readonly teamName: string;
  readonly teamCode: string;
  readonly boxes: readonly SimulatedPlayerBox[];
}): SimulatedTeamTotals {
  const { teamId, teamName, teamCode, boxes } = params;
  const teamBoxes = boxes.filter((box) => box.teamId === teamId);

  return {
    teamId,
    teamName,
    teamCode,
    pts: teamBoxes.reduce((acc, b) => acc + b.pts, 0),
    reb: teamBoxes.reduce((acc, b) => acc + b.reb, 0),
    ast: teamBoxes.reduce((acc, b) => acc + b.ast, 0),
    stl: teamBoxes.reduce((acc, b) => acc + b.stl, 0),
    blk: teamBoxes.reduce((acc, b) => acc + b.blk, 0),
    tov: teamBoxes.reduce((acc, b) => acc + b.tov, 0),
    pf: teamBoxes.reduce((acc, b) => acc + b.pf, 0),
  };
}
