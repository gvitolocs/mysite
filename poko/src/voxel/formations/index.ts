/**
 * All formations, in texture-layer order. Built once at start-up on the main
 * thread (~30–60 ms on a laptop; measured in the performance report) from pure,
 * deterministic generators: every visitor gets bit-identical formations.
 */
import type { PokoModel } from '../../character/pokoVoxelizer.ts';
import { toPoolFormation } from '../correspondence.ts';
import type { PoolFormation } from '../VoxelData.ts';
import { buildCardRails } from './cardRail.ts';
import { buildCloud } from './cloud.ts';
import { buildFinale } from './finale.ts';
import { buildPokoPool } from './poko.ts';
import { buildPokoinCard } from './pokoinCard.ts';
import { buildPortal } from './portal.ts';
import { buildPrductPilot } from './prductPilot.ts';
import { buildSystems } from './systems.ts';
import { buildTmelnikApp } from './tmelnikApp.ts';

export interface FormationSet {
  formations: PoolFormation[];
  staticData: Float32Array;
  pokoCenter: [number, number, number];
  counts: Record<string, number>;
  cardRailGate: ReturnType<typeof buildCardRails>['gate'];
}

export function buildFormations(model: PokoModel): FormationSet {
  const poko = buildPokoPool(model);
  const cardRail = buildCardRails();
  const formations = [
    poko.formation,
    buildCloud(poko.formation, poko.center),
    toPoolFormation(buildPortal()),
    toPoolFormation(buildPokoinCard()),
    toPoolFormation(cardRail.targets),
    toPoolFormation(buildPrductPilot()),
    toPoolFormation(buildTmelnikApp()),
    toPoolFormation(buildSystems()),
    buildFinale(poko.formation),
  ];
  const counts = Object.fromEntries(formations.map((f) => [f.name, f.visible]));
  return { formations, staticData: poko.staticData, pokoCenter: poko.center, counts, cardRailGate: cardRail.gate };
}
