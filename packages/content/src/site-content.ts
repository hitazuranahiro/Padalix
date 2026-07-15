export const siteContent = {
  navigation: {
    links: [
      { label: "System", href: "#system" },
      { label: "Product", href: "#product" },
      { label: "About", href: "/about" },
      { label: "Presentation", href: "/presentation" },
      { label: "Docs", href: "/docs" },
      { label: "Help", href: "/help" }
    ],
    action: "Launch app"
  },
  hero: {
    systemLabel: "STELLAR PAYMENT SYSTEM",
    locationLabel: "PH / GLOBAL",
    releaseLabel: "MVP 01",
    eyebrow: "BORDERLESS MONEY. HUMAN DELIVERY.",
    title: ["MOVE MONEY.", "MOVE LIFE.", "FORWARD."],
    body: "Padalix turns stablecoin speed into a clear remittance system for the people and families who keep the world moving.",
    primaryAction: "Explore the system",
    secondaryAction: "Open Padalix"
  },
  signals: [
    { value: "SECONDS", label: "TARGET SETTLEMENT" },
    { value: "24 / 7", label: "NETWORK AVAILABILITY" },
    { value: "1 → MANY", label: "FAMILY DISTRIBUTION" },
    { value: "STELLAR", label: "SETTLEMENT LAYER" }
  ],
  system: {
    eyebrow: "ONE SEND / MULTIPLE OUTCOMES",
    title: "Built for the way families actually move money.",
    body: "One precise flow connects the sender, the network, and every recipient without exposing the complexity underneath.",
    steps: [
      {
        index: "01 / FUND",
        symbol: "+",
        title: "Set the transfer.",
        body: "Choose the source asset and see the rate, fee, and recipient amount before committing.",
        state: "CLEAR BEFORE CONFIRM"
      },
      {
        index: "02 / ROUTE",
        symbol: "route",
        title: "Distribute with intent.",
        body: "Send once, then divide support across recipients using saved percentage or fixed rules.",
        state: "ONE TO MANY"
      },
      {
        index: "03 / ARRIVE",
        symbol: "check",
        title: "Receive their way.",
        body: "Deliver to a supported wallet, bank flow, or secure claim experience as partners come online.",
        state: "DESIGNED FOR ACCESS"
      }
    ]
  },
  product: {
    eyebrow: "DESIGNED AROUND THE DECISION",
    title: "Every number visible. Every action deliberate.",
    body: "Padalix makes the amount, fee, rate, delivery method, and expected arrival clear before the sender moves forward.",
    features: ["Transparent quotes", "Family distribution rules", "Claimable receiving", "End-to-end status"]
  },
  infrastructure: {
    title: "Crypto underneath. Clarity above.",
    body: "The network is infrastructure, not the interface. Padalix coordinates identity, quotes, transfers, recipient rules, and settlement as one accountable system.",
    layers: [
      { label: "LAYER 01", title: "PADALIX PWA", body: "THE HUMAN INTERFACE" },
      { label: "LAYER 02", title: "TRANSFER ENGINE", body: "RULES / LEDGER / STATUS" },
      { label: "LAYER 03", title: "STELLAR", body: "GLOBAL SETTLEMENT" }
    ]
  },
  mission: {
    statement: "Distance should never decide how much care arrives home.",
    body: "Padalix begins with Filipino families and freelancers, then expands the same programmable movement of value to the businesses and platforms that serve them.",
    metric: "2.19M",
    metricLabel: "OVERSEAS FILIPINO WORKERS / 2024 PSA ESTIMATE"
  },
  access: {
    eyebrow: "BUILDING ON STELLAR / PHILIPPINES",
    title: "The next movement of money starts here.",
    body: "Explore the platform and follow the first Padalix testnet release.",
    action: "Open Padalix"
  },
  about: {
    eyebrow: "PADALA / INFRASTRUCTURE EXCHANGE",
    title: "Sending love home, rebuilt for a borderless world.",
    introduction: "Padalix is a Stellar-powered cross-border transfer platform that connects stablecoin infrastructure to real-world fiat payouts. It is designed first for overseas Filipino workers, freelancers, and the families who depend on every transfer.",
    nameTitle: "A Filipino heart. An infrastructure engine.",
    nameBody: "Padalix combines Padala, the Filipino word for sending or remittance, with IX, Infrastructure Exchange. The name carries both sides of the product: the human act of sending support home and the technical system that moves it.",
    problemTitle: "Moving money still costs too much time, value, and access.",
    problemBody: "Traditional remittance services can charge 5-8%, bank wires can take 1-5 business days, and many recipients remain unbanked or underbanked. Existing products offer reach or efficient crypto rails, but rarely connect both through an interface built for everyday use.",
    principles: [
      { value: "5-8%", label: "TRADITIONAL TRANSFER FEES" },
      { value: "1-5 DAYS", label: "BANK WIRE SETTLEMENT" },
      { value: "$38B", label: "PH REMITTANCES / 2023" }
    ],
    vision: "Padalix starts with the Filipino corridor and grows toward programmable infrastructure for global money movement: consumer transfers, business payments, and developer APIs on one accountable network."
  },
  presentation: {
    eyebrow: "BUILD ON STELLAR PHILIPPINES / 2026",
    title: "Crypto to cash, instantly connected.",
    introduction: "A mobile-first payment system that makes stablecoin settlement usable for real families, freelancers, businesses, and recipients without bank accounts.",
    documentUrl: "/documents/padalix-idea-submission.pdf",
    documentLabel: "PADALIX IDEA SUBMISSION / CHECKPOINT 1",
    flow: [
      { index: "01", title: "Load", body: "Fund a Padalix wallet with USDC or a PHP stablecoin." },
      { index: "02", title: "Route", body: "Select recipients and payout methods while Stellar finds the liquidity path." },
      { index: "03", title: "Receive", body: "Deliver through GCash, bank, cash pickup, QR, phone, or claim code." }
    ],
    features: [
      { title: "Smart Family Distribution", body: "One transfer automatically splits across multiple recipients using saved rules." },
      { title: "Receive Without Bank", body: "Claimable transfers make phone, QR, and code-based receiving possible." },
      { title: "Real-time FX", body: "Show the sender the route, conversion, fee, and expected delivery before confirmation." },
      { title: "Milestone Escrow", body: "Soroban contracts lock and release funds when agreed conditions are confirmed." },
      { title: "Cash Pickup", body: "Extend digital settlement to recipients who depend on physical payout networks." },
      { title: "Transfer Status", body: "Track the payment from initiation through settlement and recipient delivery." }
    ],
    markets: ["OFWs AND FILIPINO FREELANCERS", "UNBANKED PHILIPPINE RECIPIENTS", "SMES AND CROSS-BORDER PAYROLL"],
    visionTitle: "The infrastructure layer behind global money movement.",
    visionBody: "The long-term goal is to become the AWS for global money movement: invisible, programmable infrastructure that financial products can build on, starting in the Philippines and expanding across major remittance economies."
  },
  help: {
    eyebrow: "PADALIX SUPPORT / HUMAN FIRST",
    title: "Find the next clear step.",
    introduction: "Get direct guidance for accounts, transfers, receiving, security, and payment status without needing to understand the blockchain underneath.",
    paths: [
      { title: "Account and access", body: "Sign in, recover access, protect your account, and manage trusted devices." },
      { title: "Sending money", body: "Understand quotes, fees, payout methods, family splits, and transfer confirmation." },
      { title: "Receiving money", body: "Receive through supported wallets, banks, claim codes, QR, or future cash pickup partners." },
      { title: "Transfer status", body: "Read each payment state and know what to do when delivery needs attention." }
    ],
    faq: [
      { question: "What currencies can I use?", answer: "The MVP is designed around USDC and a PHP stablecoin on Stellar. Available assets and payout corridors will be shown before a transfer begins." },
      { question: "Does the recipient need a bank account?", answer: "Not for every Padalix flow. Claimable transfers are designed to support phone, QR, and secure claim-code receiving, with cash pickup added as partner coverage expands." },
      { question: "When will the recipient receive the money?", answer: "Stellar settlement targets seconds. Final delivery time depends on the selected payout partner, and Padalix shows the expected arrival before confirmation." },
      { question: "How does Family Distribution work?", answer: "The sender creates percentage or fixed-amount rules once, then Padalix applies those rules to future transfers across multiple recipients." },
      { question: "What should I do if a transfer is delayed?", answer: "Open the transfer status, confirm the recipient details and payout method, then contact support with the Padalix transfer reference. Never share your password or recovery information." }
    ],
    supportTitle: "Still need a person?",
    supportBody: "Send the transfer reference and a short description of the issue. Do not include passwords, recovery codes, or private keys.",
    supportEmail: "support@padalix.com"
  },
  docs: {
    eyebrow: "PADALIX DOCUMENTATION / MVP 01",
    title: "Move money with every decision visible.",
    introduction: "This guide explains the intended Padalix experience from account setup through settlement. Features remain subject to availability as the testnet MVP and payout network develop.",
    quickstart: [
      { index: "01", title: "Create and secure your account", body: "Verify your identity, use a unique password, and protect every recovery method before adding funds." },
      { index: "02", title: "Fund your wallet", body: "Add a supported USDC or PHP stablecoin balance and wait for the deposit status to confirm." },
      { index: "03", title: "Build the transfer", body: "Choose an amount, recipient, payout method, and optional Family Distribution rules." },
      { index: "04", title: "Review and send", body: "Confirm the rate, network fee, Padalix fee, recipient amount, and expected arrival before approving." }
    ],
    guides: [
      { slug: "wallet", title: "Wallet and balances", summary: "Understand supported assets, deposits, available balances, and settlement balances.", points: ["Use only the network and asset shown by Padalix.", "Wait for a confirmed deposit before starting a transfer.", "Asset availability can vary by corridor and testnet status."] },
      { slug: "transfer", title: "Send a transfer", summary: "Create a quote and deliver money through a supported payout route.", points: ["Enter the amount and recipient details.", "Select GCash, bank, claimable receive, or another available method.", "Review every fee and the final recipient amount before sending."] },
      { slug: "distribution", title: "Family Distribution", summary: "Split one transfer across multiple recipients with reusable allocation rules.", points: ["Add two or more recipients.", "Choose percentage or fixed allocations.", "Make sure the total allocation equals the transfer amount."] },
      { slug: "claim", title: "Receive without a bank", summary: "Use a secure claim flow when the recipient does not have a supported bank account.", points: ["Send the claim link or code only to the intended recipient.", "The recipient completes the required identity checks.", "A claim expires or returns to the sender according to the displayed terms."] },
      { slug: "status", title: "Track a payment", summary: "Follow the payment from quote and submission through network settlement and delivery.", points: ["Pending means Padalix is waiting for the next confirmed step.", "Settled means the network movement is complete.", "Delivered means the selected payout route has confirmed receipt."] }
    ],
    safetyTitle: "Protect access before protecting speed.",
    safetyBody: "Padalix support will never ask for your password, private key, recovery phrase, or one-time security code. Confirm the domain and recipient details before approving any transfer."
  },
  footer: {
    tagline: "CRYPTO TO CASH, INSTANTLY CONNECTED."
  }
} as const;

export type SiteContent = typeof siteContent;

export function mergeSiteContent(value: unknown): SiteContent {
  function merge(defaultValue: unknown, nextValue: unknown): unknown {
    if (Array.isArray(defaultValue)) return Array.isArray(nextValue) ? nextValue : defaultValue;
    if (defaultValue && typeof defaultValue === "object") {
      const source = nextValue && typeof nextValue === "object" ? nextValue as Record<string, unknown> : {};
      return Object.fromEntries(Object.entries(defaultValue).map(([key, child]) => [key, merge(child, source[key])]));
    }
    return nextValue ?? defaultValue;
  }

  return merge(siteContent, value) as SiteContent;
}
