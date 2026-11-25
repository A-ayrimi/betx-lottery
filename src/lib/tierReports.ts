import { sql } from "drizzle-orm";
import { db } from "@/db";
import { roundMoney } from "@/lib/tierAccounting";

type TierReportRow = {
  tier_id: number;
  code: string;
  name: string;
  status: string;
  price_usd: string;
  ticket_capacity: number;
  draw_duration_minutes: number;
  prize_percentage: string;
  treasury_percentage: string;
  admin_percentage: string;
  open_rounds: number;
  settled_rounds: number;
  tickets_sold: number;
  ticket_revenue: string;
  prize_obligation: string;
  treasury_obligation: string;
  admin_obligation: string;
};

export async function getTierPerformanceReport() {
  const result = await db.execute(sql`
    select
      t.id as tier_id,
      t.code,
      t.name,
      t.status,
      t.price_usd::text,
      t.ticket_capacity,
      t.draw_duration_minutes,
      t.prize_percentage::text,
      t.treasury_percentage::text,
      t.admin_percentage::text,
      coalesce(o.open_rounds, 0)::int as open_rounds,
      coalesce(s.settled_rounds, 0)::int as settled_rounds,
      coalesce(k.tickets_sold, 0)::int as tickets_sold,
      coalesce(r.ticket_revenue, 0)::text as ticket_revenue,
      coalesce(s.prize_obligation, 0)::text as prize_obligation,
      coalesce(s.treasury_obligation, 0)::text as treasury_obligation,
      coalesce(s.admin_obligation, 0)::text as admin_obligation
    from ticket_tiers t
    left join (
      select tier_id, count(*)::int as open_rounds
      from rounds
      where status in ('OPEN', 'open', 'FULL', 'full')
      group by tier_id
    ) o on o.tier_id = t.id
    left join (
      select
        tier_id,
        count(*)::int as settled_rounds,
        sum(prize)::text as prize_obligation,
        sum(treasury_contribution)::text as treasury_obligation,
        sum(admin_gross_revenue)::text as admin_obligation
      from rounds
      where status in ('SETTLED', 'settled')
      group by tier_id
    ) s on s.tier_id = t.id
    left join (
      select tier_id, count(*)::int as tickets_sold
      from tickets
      where kind = 'gold'
      group by tier_id
    ) k on k.tier_id = t.id
    left join (
      select r.tier_id, sum(-l.amount)::text as ticket_revenue
      from ledger l
      inner join rounds r on r.id = l.round_id
      where l.type = 'ticket_buy' and l.tier_id is not null
      group by r.tier_id
    ) r on r.tier_id = t.id
    order by t.display_order, t.id
  `);

  return (result.rows as unknown as TierReportRow[]).map((row) => ({
    tierId: Number(row.tier_id),
    code: row.code,
    name: row.name,
    status: row.status,
    priceUsd: roundMoney(Number(row.price_usd)),
    capacity: Number(row.ticket_capacity),
    drawDurationMinutes: Number(row.draw_duration_minutes),
    prizePercentage: roundMoney(Number(row.prize_percentage)),
    treasuryPercentage: roundMoney(Number(row.treasury_percentage)),
    adminPercentage: roundMoney(Number(row.admin_percentage)),
    openRounds: Number(row.open_rounds),
    settledRounds: Number(row.settled_rounds),
    ticketsSold: Number(row.tickets_sold),
    ticketRevenue: roundMoney(Number(row.ticket_revenue)),
    prizeObligation: roundMoney(Number(row.prize_obligation)),
    treasuryObligation: roundMoney(Number(row.treasury_obligation)),
    adminObligation: roundMoney(Number(row.admin_obligation)),
  }));
}
