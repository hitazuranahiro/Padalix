"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

type Quote={id:string;sourceAmount:string;destinationAmount:string;feeAmount:string;rate:string;sourceAsset:string;destinationCurrency:string;expiresAt:string};

export function SendFlow({ allowed }: { allowed: boolean }) {
  const [amount,setAmount]=useState("500.00");
  const [recipientName,setRecipientName]=useState("");
  const [quote,setQuote]=useState<Quote|null>(null);
  const [result,setResult]=useState<{reference:string;status:string}|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  async function createQuote(){setLoading(true);setError("");setResult(null);try{const response=await fetch("/api/platform/quotes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount,destinationCurrency:"PHP"})});const data=await response.json();if(!response.ok)throw new Error(data.error);setQuote(data);}catch(error){setError(error instanceof Error?error.message:"Quote unavailable");}finally{setLoading(false)}}
  async function transfer(){if(!quote)return;setLoading(true);setError("");try{const response=await fetch("/api/platform/transfers",{method:"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({quoteId:quote.id,recipientName})});const data=await response.json();if(!response.ok)throw new Error(data.error);setResult(data);}catch(error){setError(error instanceof Error?error.message:"Transfer unavailable");}finally{setLoading(false)}}

  return <div className="send-layout"><section className="quote-form"><div className="flow-step"><span>01</span><strong>LIVE SANDBOX QUOTE</strong></div><label><span>You send</span><div className="amount-input"><input value={amount} onChange={event=>{setAmount(event.target.value);setQuote(null)}} inputMode="decimal"/><select aria-label="Source currency"><option>USDC</option></select></div></label><button className="swap-command" aria-label="Create quote" onClick={()=>void createQuote()} disabled={loading}><RefreshCw className={loading?"spin":""} size={15}/></button><label><span>Recipient gets</span><div className="amount-input"><input value={quote?.destinationAmount??"—"} readOnly/><select aria-label="Destination currency"><option>PHP</option></select></div></label><label><span>Recipient legal name</span><div className="amount-input recipient-input"><input value={recipientName} onChange={event=>setRecipientName(event.target.value)} placeholder="Recipient name"/><select aria-label="Destination country"><option>PH</option></select></div></label><dl><div><dt>Indicative rate</dt><dd>{quote?`1 USDC = ${quote.rate} PHP`:"Create quote"}</dd></div><div><dt>Padalix sandbox fee</dt><dd>{quote?`${quote.feeAmount} USDC`:"—"}</dd></div><div><dt>Quote expiry</dt><dd>{quote?new Date(quote.expiresAt).toLocaleTimeString():"—"}</dd></div></dl>{error&&<p className="flow-error">{error}</p>}</section><aside className="quote-review"><p>QUOTE SUMMARY</p><div><span>RECIPIENT RECEIVES</span><strong>{quote?`₱${Number(quote.destinationAmount).toLocaleString(undefined,{minimumFractionDigits:2})}`:"₱—"}</strong></div>{result?<section className="transfer-result"><CheckCircle2 size={25}/><h2>{result.reference}</h2><p>Sandbox transfer confirmed and recorded in your activity ledger.</p><Link href="/activity">VIEW ACTIVITY <ArrowRight size={16}/></Link></section>:allowed?<button disabled={!quote||recipientName.trim().length<2||loading} onClick={()=>void transfer()}>{loading?"PROCESSING":"CONFIRM SANDBOX TRANSFER"} <ArrowRight size={16}/></button>:<><section><LockKeyhole size={22}/><h2>Verification required</h2><p>You may create quotes now. Transfer confirmation unlocks after identity approval.</p></section><Link href="/verification"><ShieldCheck size={16}/>VERIFY IDENTITY <ArrowRight size={16}/></Link></>}</aside></div>;
}
