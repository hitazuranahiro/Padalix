"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";

type Quote = {
  id: string;
  sourceAmount: string;
  destinationAmount: string;
  feeAmount: string;
  rate: string;
  sourceAsset: string;
  destinationCurrency: string;
  expiresAt: string;
};

export function SendFlow({ allowed }: { allowed: boolean }) {
  const [amount, setAmount] = useState("500.00");
  const [recipientName, setRecipientName] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [result, setResult] = useState<{ reference: string; status: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createQuote() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/platform/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount, destinationCurrency: "PHP" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setQuote(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Quote unavailable");
    } finally {
      setLoading(false);
    }
  }

  async function transfer() {
    if (!quote) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platform/transfers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ quoteId: quote.id, recipientName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Transfer unavailable");
    } finally {
      setLoading(false);
    }
  }

  const destinationAmount = quote
    ? `₱${Number(quote.destinationAmount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
      })}`
    : "₱0.00";

  return (
    <div className="send-layout">
      <section className="quote-form" aria-labelledby="transfer-details-heading">
        <header className="transfer-section-head">
          <span>01</span>
          <div>
            <h2 id="transfer-details-heading">Transfer details</h2>
            <p>Enter the amount and recipient exactly as shown on their account.</p>
          </div>
        </header>

        <div className="transfer-field">
          <label htmlFor="source-amount">You send</label>
          <div className="money-field">
            <input
              id="source-amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setQuote(null);
              }}
              inputMode="decimal"
              aria-describedby="source-help"
            />
            <select aria-label="Source currency">
              <option>USDC</option>
            </select>
          </div>
          <small id="source-help">Available from your Stellar wallet</small>
        </div>

        <button
          className="quote-trigger"
          onClick={() => void createQuote()}
          disabled={loading || Number(amount) <= 0}
        >
          <RefreshCw className={loading ? "spin" : ""} size={16} aria-hidden="true" />
          {loading ? "Fetching rate" : quote ? "Refresh live quote" : "Get live quote"}
        </button>

        <div className="transfer-field">
          <label htmlFor="destination-amount">Recipient gets</label>
          <div className="money-field money-field-readonly">
            <input
              id="destination-amount"
              value={quote?.destinationAmount ?? "0.00"}
              readOnly
            />
            <select aria-label="Destination currency">
              <option>PHP</option>
            </select>
          </div>
          <small>{quote ? "Rate locked until quote expiry" : "Request a quote to calculate PHP"}</small>
        </div>

        <div className="transfer-divider" />

        <div className="transfer-field">
          <label htmlFor="recipient-name">Recipient legal name</label>
          <div className="recipient-field">
            <UserRound size={17} aria-hidden="true" />
            <input
              id="recipient-name"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              placeholder="Full name on recipient account"
              autoComplete="name"
            />
            <span>PH</span>
          </div>
          <small>Use the name registered with the receiving provider</small>
        </div>

        <dl className="quote-facts">
          <div>
            <dt>Indicative rate</dt>
            <dd>{quote ? `1 USDC = ${quote.rate} PHP` : "Waiting for quote"}</dd>
          </div>
          <div>
            <dt>Padalix sandbox fee</dt>
            <dd>{quote ? `${quote.feeAmount} USDC` : "—"}</dd>
          </div>
          <div>
            <dt>Quote expires</dt>
            <dd>{quote ? new Date(quote.expiresAt).toLocaleTimeString() : "—"}</dd>
          </div>
        </dl>

        {error && <p className="flow-error" role="alert">{error}</p>}
      </section>

      <aside className="quote-review" aria-label="Transfer summary">
        <header>
          <span>02</span>
          <div>
            <h2>Review transfer</h2>
            <p>Nothing moves until you confirm.</p>
          </div>
        </header>

        <div className="quote-total">
          <span>RECIPIENT RECEIVES</span>
          <strong>{destinationAmount}</strong>
          <small>{quote ? "PHP payout estimate" : "Create a quote to continue"}</small>
        </div>

        <dl className="review-facts">
          <div>
            <dt>You send</dt>
            <dd>{amount || "0.00"} USDC</dd>
          </div>
          <div>
            <dt>Recipient</dt>
            <dd>{recipientName.trim() || "Not added"}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd><Clock3 size={14} aria-hidden="true" /> Sandbox</dd>
          </div>
        </dl>

        {result ? (
          <section className="transfer-result">
            <CheckCircle2 size={25} aria-hidden="true" />
            <h2>{result.reference}</h2>
            <p>Sandbox transfer confirmed and recorded in your activity ledger.</p>
            <Link href={`/receipts/${encodeURIComponent(result.reference)}`}>
              View receipt <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        ) : allowed ? (
          <button
            disabled={!quote || recipientName.trim().length < 2 || loading}
            onClick={() => void transfer()}
          >
            <span>{loading ? "Processing" : "Confirm sandbox transfer"}</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        ) : (
          <section className="verification-lock">
            <LockKeyhole size={22} aria-hidden="true" />
            <h2>Verification required</h2>
            <p>You may create quotes now. Transfer confirmation unlocks after identity approval.</p>
            <Link href="/verification">
              <ShieldCheck size={16} aria-hidden="true" />
              Verify identity
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        )}

        <p className="review-assurance">
          <ShieldCheck size={14} aria-hidden="true" />
          Quote details are checked again before confirmation.
        </p>
      </aside>
    </div>
  );
}
