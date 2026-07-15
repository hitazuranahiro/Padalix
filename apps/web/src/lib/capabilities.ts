export type VerificationLevel = "basic" | "verified" | "enhanced" | "business";
export type Capability = "profile.manage"|"wallet.view"|"quote.preview"|"transfer.send"|"fiat.cashout"|"family_distribution.send"|"limits.increase"|"mass_payment.send"|"merchant.gateway"|"developer.api_keys";
const rank:Record<VerificationLevel,number>={basic:0,verified:1,enhanced:2,business:3};
export const capabilityPolicy:Record<Capability,VerificationLevel>={"profile.manage":"basic","wallet.view":"basic","quote.preview":"basic","transfer.send":"verified","fiat.cashout":"verified","family_distribution.send":"verified","limits.increase":"enhanced","mass_payment.send":"enhanced","merchant.gateway":"business","developer.api_keys":"business"};
export function can(level:VerificationLevel,capability:Capability){return rank[level]>=rank[capabilityPolicy[capability]];}
export const demoMember={name:"Maria",level:"basic" as VerificationLevel,email:"maria@example.com"};
