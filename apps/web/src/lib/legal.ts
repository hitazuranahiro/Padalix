export const CURRENT_TERMS_VERSION = "2026-07-18";
export const CURRENT_TERMS_EFFECTIVE_DATE = "July 18, 2026";

export const termsSections = [
  {
    title: "1. Service scope",
    paragraphs: [
      "Padalix provides software for payment demonstrations, Stellar testnet transactions, identity verification, account funding checkouts, and limited pilot services. Features marked sandbox, testnet, preview, or coming soon do not move real money and must not be treated as completed payment services.",
      "Real-money funding, conversion, custody, payout, cash pickup, bank, or wallet services may be performed by regulated third-party providers under their own terms, eligibility rules, limits, and availability.",
    ],
  },
  {
    title: "2. Eligibility and account security",
    paragraphs: [
      "You must provide accurate information, be legally able to enter this agreement, and use Padalix only for yourself or an organization you are authorized to represent. You are responsible for protecting your password, passkeys, linked wallets, devices, and claim links.",
      "Notify Padalix immediately if you suspect unauthorized access. We may restrict an account while investigating security, compliance, or ownership concerns.",
    ],
  },
  {
    title: "3. Identity and compliance",
    paragraphs: [
      "Access to payment capabilities may require identity or business verification, sanctions and politically exposed person screening, source-of-funds information, transaction monitoring, and additional review. Submission does not guarantee approval.",
      "Padalix may delay, reject, report, or restrict activity when required by law, a regulated partner, network rules, or risk controls. You must not use the service to evade verification, limits, sanctions, or reporting obligations.",
    ],
  },
  {
    title: "4. Quotes, transfers, and external providers",
    paragraphs: [
      "A quote is valid only until its stated expiration and may include an exchange rate, Padalix fee, network fee, and provider fee. Review the final amount, recipient, delivery method, and estimated timing before confirming.",
      "A provider checkout confirmation is evidence of collection by that provider only. It is not proof of Stellar settlement or recipient payout. A transfer is complete only when the applicable receipt and settlement status identify it as completed.",
    ],
  },
  {
    title: "5. Wallets and blockchain transactions",
    paragraphs: [
      "Linked Stellar wallets remain under the wallet owner's control. Padalix does not request or store a wallet secret key. Blockchain transactions can be irreversible, may incur network fees, and can be delayed or fail because of network, trustline, balance, signing, or destination issues.",
      "Testnet assets have no monetary value. Do not send mainnet assets to testnet addresses or rely on testnet demonstrations as financial commitments.",
    ],
  },
  {
    title: "6. Prohibited use",
    paragraphs: [
      "You may not use Padalix for fraud, unlawful goods or services, money laundering, terrorist financing, sanctions evasion, exploitation, unauthorized third-party transactions, abusive automation, interference with the service, or any activity prohibited by law or partner policy.",
    ],
  },
  {
    title: "7. Cancellations, refunds, and disputes",
    paragraphs: [
      "Cancellation or refund availability depends on the transaction state and provider rules. Completed blockchain transactions may not be reversible. Contact support promptly with the Padalix reference and provider reference; never send passwords, passkeys, wallet secret keys, or full identity documents through a support message.",
    ],
  },
  {
    title: "8. Data and communications",
    paragraphs: [
      "Padalix processes account, verification, device, transaction, and support information to provide the service, prevent abuse, meet legal obligations, and operate security controls. Required transactional, compliance, and security notices cannot be disabled. Optional product email can be controlled in Settings.",
    ],
  },
  {
    title: "9. Availability and changes",
    paragraphs: [
      "Services, corridors, providers, assets, limits, and features may change or become unavailable. Padalix may suspend features during incidents, maintenance, legal review, or provider outages. Material changes to these Terms will be versioned and may require renewed acceptance.",
    ],
  },
  {
    title: "10. Liability and governing law",
    paragraphs: [
      "To the extent permitted by law, Padalix is not responsible for losses caused by inaccurate recipient details, compromised credentials, wallet-owner actions, unsupported assets, external-provider failures, or events outside reasonable control. Rights that cannot lawfully be excluded remain unaffected.",
      "These Terms are governed by the laws of the Republic of the Philippines, without limiting mandatory consumer protections that apply to you. Questions may be sent to legal@padalix.com.",
    ],
  },
] as const;
