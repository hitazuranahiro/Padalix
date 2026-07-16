"use client";

import { useState } from "react";
import { Plus, UserRoundCheck } from "lucide-react";
import type { PaymentMethod } from "@/lib/platform";

type Recipient = { id: string; name: string; countryCode: string; payoutMethod: string; payoutReferenceMasked: string };

export function RecipientManager({ initialRecipients, paymentMethods }: { initialRecipients: Recipient[]; paymentMethods: PaymentMethod[] }) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return <section className="recipient-manager"><header><div><p>RECIPIENTS / SAVED</p><h2>Delivery profiles</h2></div><span>{recipients.length} SAVED</span></header><div className="recipient-layout"><div className="recipient-list">{recipients.map(item => <article key={item.id}><UserRoundCheck size={19}/><span><strong>{item.name}</strong><small>{item.countryCode} / {item.payoutMethod.replaceAll("_", " ").toUpperCase()}</small></span><b>{item.payoutReferenceMasked}</b></article>)}{!recipients.length && <p>No recipients saved yet.</p>}</div><form onSubmit={async event => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const method = paymentMethods.find(item => item.id === form.get("paymentMethodId"));
    if (!method) {
      setError("Select an available payout method.");
      setLoading(false);
      return;
    }
    const response = await fetch("/api/platform/recipients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), countryCode: method.countryCode, payoutMethod: method.payoutType, paymentMethodId: method.id, payoutReference: form.get("payoutReference") }) });
    const data = await response.json();
    if (response.ok) {
      setRecipients([{ ...data, countryCode: method.countryCode, payoutMethod: method.payoutType }, ...recipients]);
      event.currentTarget.reset();
    } else setError(data.error);
    setLoading(false);
  }}><p>ADD RECIPIENT</p><label><span>COUNTRY</span><select disabled><option>Philippines / PHP</option></select></label><label><span>LEGAL NAME</span><input name="name" required minLength={2}/></label><label><span>PAYOUT METHOD</span><select name="paymentMethodId" required disabled={!paymentMethods.length}>{paymentMethods.map(method => <option value={method.id} key={method.id}>{method.displayName} / {method.environment.toUpperCase()}</option>)}{!paymentMethods.length && <option>No methods available</option>}</select></label><label><span>ACCOUNT OR WALLET REFERENCE</span><input name="payoutReference" required minLength={4}/></label>{error && <p className="flow-error">{error}</p>}<button disabled={loading || !paymentMethods.length}><Plus size={16}/>{loading ? "SAVING" : "SAVE RECIPIENT"}</button></form></div></section>;
}
