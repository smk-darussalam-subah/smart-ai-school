const FINAL_SCORE_WEIGHTS = {
  uh: 0.20,
  praktik: 0.25,
  sikap: 0.15,
  uts: 0.20,
  uas: 0.20,
} as const;

type WeightedGradeType = keyof typeof FINAL_SCORE_WEIGHTS;

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function averageScores(scores: number[]): number {
  if (scores.length === 0) return 0;
  return round(scores.reduce((sum, score) => sum + score, 0) / scores.length, 2);
}

/** Same normalized formula as web `naOf`: absent components do not count in the denominator. */
export function calculateWeightedFinalScore(byType: ReadonlyMap<string, number[]>): number {
  let weighted = 0;
  let weightTotal = 0;
  for (const [type, scores] of byType) {
    if (!(type in FINAL_SCORE_WEIGHTS) || scores.length === 0) continue;
    const weight = FINAL_SCORE_WEIGHTS[type as WeightedGradeType];
    weighted += averageScores(scores) * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? round(weighted / weightTotal, 1) : 0;
}
