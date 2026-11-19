/** Fine conversion uses 99.5.
 *  Net wt = finishing − stone wt + stone wastage
 *  Step 1: net × (purity + percentage) / 99.5
 *  Step 2: minus net × purity / 99.5
 */
export const FINE_DIVISOR = 99.5;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export const calcWastageWt = (finishing: number, percent: number, purity = 0, stoneWt = 0, stoneWastage = 0) => {
  if (!(percent > 0)) return 0;
  const base = (Number(finishing) || 0) - (Number(stoneWt) || 0) + (Number(stoneWastage) || 0);
  if (!(base > 0)) return 0;
  const pur = Number(purity) > 0 ? Number(purity) : 0;
  const first = (base * (pur + percent)) / FINE_DIVISOR;
  const second = (base * pur) / FINE_DIVISOR;
  return Math.max(0, round2(first - second));
};

/** (finishing − stone wt + stone wastage) × (purity + percentage) / 99.5 */
export const calcTotalWt = (
  finishing: number,
  stoneWt: number,
  stoneWastage: number,
  purity: number,
  percent: number,
) => {
  const net = (Number(finishing) || 0) - (Number(stoneWt) || 0) + (Number(stoneWastage) || 0);
  const touch = (Number(purity) || 0) + (Number(percent) || 0);
  if (!(net > 0) || !(touch > 0)) return 0;
  return round2((net * touch) / FINE_DIVISOR);
};

export type GoldParts = {
  finishing?: number | null;
  wastage?: number | null;
  stoneWt?: number | null;
  stoneWastage?: number | null;
  purity?: number | null;
  wastagePer?: number | null;
  stoneCost?: number | null;
  gramRate?: number | null;
  chargeAmt?: number | null;
};

export const goldTotalWt = (p: GoldParts) =>
  calcTotalWt(p.finishing || 0, p.stoneWt || 0, p.stoneWastage || 0, p.purity || 0, p.wastagePer || 0);

export const goldRateAmt = (p: GoldParts) => {
  const rate = Number(p.gramRate) || 0;
  if (!(rate > 0)) return 0;
  return round2(goldTotalWt(p) * rate);
};

/** stone cost + total wt × 1 gram rate + type cost */
export const goldAmount = (p: GoldParts) =>
  round2((Number(p.stoneCost) || 0) + goldRateAmt(p) + (Number(p.chargeAmt) || 0));
