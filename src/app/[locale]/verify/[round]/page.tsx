import Link from "next/link";
import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Logo } from "@/components/Logo";
import { getDictionary } from "@/i18n";
import { dirOf, isLocale, type Locale } from "@/i18n/config";
import { formatNumber } from "@/lib/format";
import { isNonLivePreview } from "@/lib/previewFallback";

export const dynamic = "force-dynamic";

type VerifyView =
  | { kind: "notFound" }
  | { kind: "pending"; commitment?: string }
  | { kind: "verified"; commitment: string; winningSerial: string; serials: string[]; index: number; pass: boolean };

export default async function VerifyPage({ params }: PageProps<"/[locale]/verify/[round]">) {
  const { round, locale } = await params;
  if (!isLocale(locale)) notFound();

  const v = getDictionary(locale).verification;
  const home = `/${locale}`;
  const id = Number(round);
  let view: VerifyView = { kind: "pending" };

  if (!isNonLivePreview()) {
    try {
      const [{ db }, { rounds, tickets }, { fairIndex, normalizeRoundStatus, ROUND_STATUSES }] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("@/lib/store"),
      ]);
      const r = Number.isInteger(id) ? (await db.select().from(rounds).where(eq(rounds.id, id)).limit(1))[0] : undefined;
      if (!r) {
        view = { kind: "notFound" };
      } else {
        const status = normalizeRoundStatus(r.status);
        const hasServerSeed =
          [ROUND_STATUSES.AWAITING_ADMIN_APPROVAL, ROUND_STATUSES.APPROVED, ROUND_STATUSES.SETTLED].some((value) => value === status) && Boolean(r.serverSeed);
        if (!hasServerSeed) {
          view = { kind: "pending", commitment: r.seedHash ?? undefined };
        } else {
          const list = await db
            .select()
            .from(tickets)
            .where(and(eq(tickets.roundId, r.id), eq(tickets.kind, "gold")))
            .orderBy(tickets.id);
          const serials = list.map((t) => t.ticketSerial);
          const serverSeed = r.serverSeed!;
          const hashOk = createHash("sha256").update(serverSeed).digest("hex") === r.seedHash;
          const index = fairIndex(serverSeed, r.id, serials);
          const winnerOk =
            serials.length === r.sold &&
            serials.length <= r.capacity &&
            serials.length >= r.minimumParticipants &&
            serials[index] === r.winningSerial &&
            list[index]?.userId === r.winnerId;
          view = {
            kind: "verified",
            commitment: r.seedHash ?? "-",
            winningSerial: r.winningSerial ?? "-",
            serials,
            index,
            pass: hashOk && winnerOk,
          };
        }
      }
    } catch {
      view = { kind: "pending" };
    }
  }

  const body = renderBody(view, v, locale);

  return (
    <main dir={dirOf(locale)} lang={locale} className="mx-auto min-h-screen max-w-3xl px-4 py-12 text-start sm:px-6">
      <Link href={home} className="focus-ring inline-block rounded-lg">
        <Logo />
      </Link>
      <p className="micro mt-10 text-neon-2">{`${v.round} ${formatNumber(Number.isInteger(id) ? id : 0, locale)}`}</p>
      <h1 className="mt-3 text-3xl font-black text-white">{v.title}</h1>
      <div className="panel mt-8 rounded-2xl p-6">{body}</div>
      <pre dir="ltr" className="mt-6 overflow-x-auto rounded-2xl border border-rule bg-black/40 p-5 text-[12px] leading-6 text-mint">
        {`// verify yourself (Node.js)
const c = require("crypto");
c.createHash("sha256").update(seed).digest("hex") === commitment;
const h = c.createHmac("sha256", seed).update(\`\${round}:\${serials.join(",")}\`).digest("hex");
const index = parseInt(h.slice(0, 13), 16) % serials.length;`}
      </pre>
    </main>
  );
}

function renderBody(view: VerifyView, v: Record<string, string>, locale: Locale): React.ReactNode {
  if (view.kind === "notFound") return <p className="text-mint">{v.notFound}</p>;
  if (view.kind === "pending") {
    return (
      <div className="space-y-3 text-mint">
        <p>{v.pendingText}</p>
        {view.commitment ? <Row label={v.commitment} value={view.commitment} /> : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-foil">{view.pass ? v.pass : v.fail}</p>
      <Row label={v.commitment} value={view.commitment} ok={view.pass} />
      <Row label={v.winningSerial} value={view.winningSerial} ok={view.pass} />
      <Row label={v.serial} value={view.serials.join(",")} />
      <p className="pt-2 text-sm leading-7 text-mint">
        {formatNumber(view.index + 1, locale)} / {formatNumber(view.serials.length, locale)}
      </p>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <p className="micro text-mint">
        {label} {ok === undefined ? null : ok ? <span className="text-neon-2">✓</span> : <span className="text-red-400">✗</span>}
      </p>
      <p dir="ltr" className="font-display mt-1 break-all text-start text-[13px] text-white">
        {value}
      </p>
    </div>
  );
}
