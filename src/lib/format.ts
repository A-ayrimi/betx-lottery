/** USD amounts are always rendered en-US style ($1,234.56) for every locale. */
export const money = (n: number | string) =>
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
