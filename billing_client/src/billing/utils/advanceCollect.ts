export const advanceUsedOf = (paid?: number | null, cash?: number | null, bank?: number | null) =>
  Math.max(0, (Number(paid) || 0) - (Number(cash) || 0) - (Number(bank) || 0));
