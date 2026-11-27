export interface ConsolationReward {
  prizeCents: number;
  probabilityBps: number;
  kind: "cash" | "loyalty-credit";
}

export const CONSOLATION_REWARDS: readonly ConsolationReward[] = [
  { prizeCents: 5, probabilityBps: 4500, kind: "cash" },
  { prizeCents: 10, probabilityBps: 3000, kind: "cash" },
  { prizeCents: 25, probabilityBps: 1500, kind: "cash" },
  { prizeCents: 50, probabilityBps: 700, kind: "cash" },
  { prizeCents: 100, probabilityBps: 300, kind: "cash" },
];

export const CONSOLATION_FALLBACK: ConsolationReward = { prizeCents: 0, probabilityBps: 0, kind: "loyalty-credit" };

export function consolationProbabilityTotal(): number {
  return CONSOLATION_REWARDS.reduce((total, reward) => total + reward.probabilityBps, 0);
}

export function drawConsolationReward(randomUnit: number): ConsolationReward {
  if (!Number.isFinite(randomUnit) || randomUnit < 0 || randomUnit >= 1) {
    throw new Error("Invalid consolation random unit");
  }
  const randomBps = Math.floor(randomUnit * 10000);
  let cursor = 0;
  for (const reward of CONSOLATION_REWARDS) {
    cursor += reward.probabilityBps;
    if (randomBps < cursor) return reward;
  }
  return CONSOLATION_FALLBACK;
}

export interface JackpotSplit {
  firstCents: number;
  secondCents: number;
  thirdCents: number;
}

export function weeklyJackpotSplit(potCents: number): JackpotSplit {
  if (!Number.isSafeInteger(potCents) || potCents < 0) throw new Error("Invalid jackpot pot");
  const firstCents = Math.floor((potCents * 5000) / 10000);
  const secondCents = Math.floor((potCents * 3000) / 10000);
  const thirdCents = Math.floor((potCents * 2000) / 10000);
  return {
    firstCents: firstCents + (potCents - firstCents - secondCents - thirdCents),
    secondCents,
    thirdCents,
  };
}

export function validateJackpotSplit(split: JackpotSplit, potCents: number): boolean {
  const expected = weeklyJackpotSplit(potCents);
  return (
    expected.firstCents === split.firstCents &&
    expected.secondCents === split.secondCents &&
    expected.thirdCents === split.thirdCents
  );
}
