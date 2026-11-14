import Link from "next/link";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds, tickets } from "@/db/schema";
import { ensureSeed, fairIndex } from "@/lib/store";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: PageProps<"/[locale]/verify/[round]">) {
  const { round, locale } = await params;
  const home = `/${locale}`;
  const id = Number(round);
  await ensureSeed();
  const r = Number.isInteger(id) ? (await db.select().from(rounds).where(eq(rounds.id, id)).limit(1))[0] : undefined;

  const body = (() => {
    if (!r) return <p className="text-mint">Round not found.</p>;
    if (r.status !== "drawn" || !r.serverSeed) {
      return (
        <div className="space-y-3 text-mint">
          <p>This round is still open. The secret seed is revealed after the draw.</p>
          <Row label="Commitment (SHA-256)" value={r.seedHash ?? "—"} />
        </div>
      );
    }
    return null;
  })();

  let details: React.ReactNode = null;
  if (r && r.status === "drawn" && r.serverSeed) {
    const list = await db.select().from(tickets).where(eq(tickets.roundId, r.id)).orderBy(tickets.id);
    const serials = list.map((t) => t.serial);
    const hashOk = createHash("sha256").update(r.serverSeed).digest("hex") === r.seedHash;
    const idx = fairIndex(r.serverSeed, r.id, serials);
    const winnerOk = serials[idx] === r.winningSerial;
    details = (
      <div className="space-y-4">
        <Row label="Server seed (revealed)" value={r.serverSeed} />
        <Row label="Commitment (SHA-256)" value={r.seedHash ?? "—"} ok={hashOk} />
        <Row label="Message" value={`${r.id}:${serials.join(",")}`} />
        <Row label="Winner index = HMAC-SHA256(seed, message)[0..13] mod n" value={`${idx} / ${serials.length}`} />
        <Row label="Winning serial" value={r.winningSerial ?? "—"} ok={winnerOk} />
        <p className="pt-2 text-sm leading-7 text-mint">
          {hashOk && winnerOk
            ? "✅ The seed hashes to the published commitment and the winner is exactly the result of this calculation."
            : "⚠️ The result does not match the calculation."}
        </p>
      </div>
    );
  }

  return (
    <main dir="ltr" lang="en" className="mx-auto min-h-screen max-w-3xl px-4 py-12 text-left sm:px-6">
      <Link href={home} className="focus-ring inline-block rounded-lg" dir="ltr">
        <Logo />
      </Link>
      <p className="micro mt-10 text-neon-2">PROVABLY FAIR · ROUND {id}</p>
      <h1 className="mt-3 text-3xl font-black text-white">Provably fair verification</h1>
      <div className="panel mt-8 rounded-2xl p-6">{body ?? details}</div>
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

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <p className="micro text-mint">
        {label} {ok === undefined ? null : ok ? <span className="text-neon-2">✓</span> : <span className="text-red-400">✗</span>}
      </p>
      <p dir="ltr" className="font-display mt-1 break-all text-[13px] text-white">
        {value}
      </p>
    </div>
  );
}
