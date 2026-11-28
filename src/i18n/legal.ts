/**
 * Legal documents (English is the binding version).
 * TEMPLATE — have a lawyer adapt these to the operating jurisdiction before launch.
 */
export type LegalDoc = { title: string; updated: string; sections: { h: string; p: string[] }[] };

const company = () => process.env.COMPANY_NAME || "BETX";
const support = () => process.env.SUPPORT_EMAIL?.trim() || "support.betx@gmail.com";

export function legalDoc(kind: "terms" | "privacy" | "responsible-gaming"): LegalDoc {
  const c = company();
  const supportContact = support();
  if (kind === "terms") {
    return {
      title: "Terms of Service",
      updated: "2026-01-01",
      sections: [
        { h: "1. Operator", p: [`The service is operated by ${c}. Status: Pre-launch / Preview mode (real-money deposits and withdrawals are currently disabled). Contact: support.betx@gmail.com.`] },
        { h: "2. Eligibility", p: [
          "You must be at least 18 years old, or the age of legal majority for prize draws in your jurisdiction if higher.",
          "You may not use the service from any jurisdiction where online prize draws or the service are prohibited by local law, including the restricted territories listed on our website. Using VPNs or other tools to circumvent geographic restrictions is prohibited and may result in account closure and forfeiture of winnings obtained in breach.",
          "One account per person. Accounts are personal and non-transferable.",
        ] },
        { h: "3. The games", p: [
          "Lucky pool: published tiers define each round's ticket price, capacity and allocation. A completed round receives a provisional result that is settled only after admin review and approval; winner, treasury and BETX platform fee amounts are published for the selected tier and recorded separately. Withdrawals are available only when the published payments switch is enabled and after security checks.",
          "Daily wheel: one free spin every 24 hours plus one bonus spin after each referred user's first qualifying ticket purchase. Guest spins are previews only and cannot win prizes or receive balance.",
          "Draws use commit-reveal HMAC-SHA256: a SHA-256 commitment of the server seed is published before each round and the seed is revealed after the draw so the winner can be independently recomputed. No client or external randomness source is used.",
        ] },
        { h: "4. Deposits and withdrawals", p: [
          "When payments are enabled, deposits are accepted in SPL-USDC on the Solana network. Funds sent on the wrong network or to the wrong address cannot be recovered.",
          "When payments are enabled, withdrawals are processed to a Solana address you provide after a security review. We may request identity verification (KYC) and proof of source of funds before processing withdrawals, in line with anti-money-laundering rules.",
          "Bonus spins and referral rewards have no cash value until converted into balance by a prize.",
        ] },
        { h: "5. Prohibited conduct", p: [
          "Fraud, collusion, multi-accounting, abuse of referral rewards, use of bots, chargeback abuse and money laundering are prohibited. We may suspend accounts, void rewards and report suspicious activity to the authorities.",
        ] },
        { h: "6. Responsible gaming", p: [
          "We offer deposit limits and self-exclusion. Self-exclusion cannot be lifted before its end date. See our Responsible Gaming page.",
        ] },
        { h: "7. Liability", p: [
          "The service is provided “as is”. To the extent permitted by law, we are not liable for losses arising from network outages, blockchain delays, third-party processors or your failure to comply with local law.",
        ] },
        { h: "8. Changes and governing law", p: [
          "We may update these terms; continued use after notice constitutes acceptance. These terms are governed by applicable laws as specified by the operator, and in the event of any conflict between translations, the English version prevails.",
        ] },
      ],
    };
  }
  if (kind === "privacy") {
    return {
      title: "Privacy Policy",
      updated: "2026-01-01",
      sections: [
        { h: "1. Controller", p: [`${c} is the data controller. ${supportContact ? `Contact: ${supportContact}.` : "Support contact is not configured."}`] },
        { h: "2. Data we collect", p: [
          "Account data: username, display name, Telegram ID and handle (if you sign in with Telegram), preferred language.",
          "Compliance data: approximate country derived from your IP address at the network edge, terms-acceptance timestamp, responsible-gaming settings.",
          "Transaction data: deposits, withdrawals, wallet addresses you provide, tickets and prizes.",
          "We do not store passwords, payment card data or private keys.",
        ] },
        { h: "3. Why we use it (legal bases)", p: [
          "To provide the service (contract), to meet legal duties such as age, geo and anti-money-laundering checks (legal obligation), and to prevent fraud and secure the platform (legitimate interest).",
        ] },
        { h: "4. Cookies", p: [
          "We use only strictly necessary cookies: a session cookie, a language cookie and an age-confirmation flag. We do not use advertising or cross-site tracking cookies.",
        ] },
        { h: "5. Sharing", p: [
          "We share data only with processors needed to run the service (hosting, database, payment processor, Telegram for bot messages) and with authorities where legally required.",
        ] },
        { h: "6. International transfers & retention", p: [
          "Data may be processed outside your country under appropriate safeguards. Transaction records are kept for the period required by anti-money-laundering law (typically 5 years); other data is deleted when no longer needed.",
        ] },
        { h: "7. Your rights", p: [
          `Depending on your location (e.g. GDPR, UK GDPR, LGPD) you may request access, correction, deletion, restriction, portability or object to processing${supportContact ? ` by emailing ${supportContact}` : " through the support contact once it is configured"}. You may also complain to your data-protection authority.`,
        ] },
      ],
    };
  }
  return {
    title: "Responsible Gaming",
    updated: "2026-01-01",
    sections: [
      { h: "Play for fun, not for income", p: [
        "Games of chance are entertainment. Only play with money you can afford to lose, never chase losses, and never borrow to play.",
      ] },
      { h: "Tools in your account", p: [
        "Daily deposit limit — lowering is immediate; raising or removing takes effect after a 24-hour cooling-off period.",
        "Self-exclusion — 24 hours, 7 days, 30 days or permanently. During exclusion you cannot deposit, buy tickets or spin; withdrawals remain available. Exclusion cannot be shortened.",
      ] },
      { h: "Warning signs", p: [
        "Spending more than planned, hiding play from others, feeling anxious when not playing, or playing to escape problems are signs to take a break.",
      ] },
      { h: "Get help", p: [
        "International: BeGambleAware (begambleaware.org), Gamblers Anonymous (gamblersanonymous.org), GamCare (gamcare.org.uk). Contact local health services for support in your country.",
        supportContact
          ? `Need us to close your account? Email ${supportContact}.`
          : "Need us to close your account? The support contact is not configured.",
      ] },
      { h: "Underage gaming", p: [
        "Players must be 18+. We may request proof of age at any time. Parents can use device-level filtering tools to block gambling sites.",
      ] },
    ],
  };
}
