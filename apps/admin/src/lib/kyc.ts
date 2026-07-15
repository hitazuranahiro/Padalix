import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";

export const kycStatuses = ["submitted", "in_review", "needs_information", "approved", "rejected", "expired"] as const;
export const kycRisks = ["unrated", "low", "medium", "high", "critical"] as const;
export type KycStatus = (typeof kycStatuses)[number];
export type KycRisk = (typeof kycRisks)[number];
export type KycCase = { id:string; reference:string; memberId:string; memberName:string; memberEmail:string; countryCode:string|null; verificationLevel:string; status:KycStatus; riskLevel:KycRisk; tier:string; assignedTo:string|null; vendorReference:string|null; submittedAt:string; reviewDueAt:string; decidedAt:string|null; decisionReasonCode:string|null; decisionSummary:string|null; updatedAt:string };
export type KycAutomationInput = { provider:string; modelName:string; modelVersion:string; policyVersion:string; documentAuthenticityScore?:number; faceMatchScore?:number; livenessScore?:number; dataConsistencyScore?:number; evidenceSafetyClear:boolean; sanctionsClear?:boolean; pepClear?:boolean; adverseMediaClear?:boolean; countrySupported:boolean; rawResultReference?:string };

function mapCase(row: Record<string, unknown>): KycCase {
  return { id:String(row.id), reference:String(row.reference), memberId:String(row.member_id), memberName:String(row.full_name), memberEmail:String(row.email), countryCode:row.country_code ? String(row.country_code) : null, verificationLevel:String(row.verification_level??"basic"), status:row.status as KycStatus, riskLevel:row.risk_level as KycRisk, tier:String(row.tier), assignedTo:row.assigned_to ? String(row.assigned_to) : null, vendorReference:row.vendor_reference ? String(row.vendor_reference) : null, submittedAt:new Date(String(row.submitted_at)).toISOString(), reviewDueAt:new Date(String(row.review_due_at)).toISOString(), decidedAt:row.decided_at ? new Date(String(row.decided_at)).toISOString() : null, decisionReasonCode:row.decision_reason_code ? String(row.decision_reason_code) : null, decisionSummary:row.decision_summary ? String(row.decision_summary) : null, updatedAt:new Date(String(row.updated_at)).toISOString() };
}
const caseSelect = `select c.*,m.full_name,m.email,m.country_code,m.verification_level from compliance.kyc_case c join identity.member m on m.id=c.member_id`;

export async function listKycCases(filters:{status?:string;risk?:string;query?:string}) {
  const values:string[]=[]; const clauses:string[]=[];
  if (kycStatuses.includes(filters.status as KycStatus)) { values.push(filters.status!); clauses.push(`c.status=$${values.length}`); }
  if (kycRisks.includes(filters.risk as KycRisk)) { values.push(filters.risk!); clauses.push(`c.risk_level=$${values.length}`); }
  if (filters.query) { values.push(`%${filters.query}%`); clauses.push(`(c.reference ilike $${values.length} or m.email ilike $${values.length} or m.full_name ilike $${values.length})`); }
  const result=await database.query(`${caseSelect} ${clauses.length?`where ${clauses.join(" and ")}`:""} order by case c.risk_level when 'critical' then 1 when 'high' then 2 when 'medium' then 3 when 'low' then 4 else 5 end,c.review_due_at limit 200`,values); return result.rows.map(mapCase);
}

export async function getKycCase(reference:string) {
  const result=await database.query(`${caseSelect} where c.reference=$1`,[reference.toUpperCase()]); if(!result.rowCount)return null;
  const id=result.rows[0].id;
  const [documents,reviews,events,assessments]=await Promise.all([
    database.query("select id,document_type,filename,mime_type,verification_status,expires_on,created_at from compliance.kyc_document where case_id=$1 order by created_at",[id]),
    database.query("select id,reviewer_name,action,note,reason_code,is_internal,created_at from compliance.kyc_review where case_id=$1 order by created_at desc",[id]),
    database.query("select id,actor_type,event_type,metadata,created_at from compliance.kyc_event where case_id=$1 order by created_at desc",[id]),
    database.query("select id,provider,model_name,model_version,policy_version,document_authenticity_score,face_match_score,liveness_score,data_consistency_score,evidence_safety_clear,sanctions_clear,pep_clear,adverse_media_clear,country_supported,recommendation,reason_codes,created_at from compliance.kyc_automation_assessment where case_id=$1 order by created_at desc",[id]),
  ]);
  return {case:mapCase(result.rows[0]),documents:documents.rows.map(row=>({...row,id:String(row.id),created_at:new Date(row.created_at).toISOString()})),reviews:reviews.rows.map(row=>({...row,id:String(row.id),created_at:new Date(row.created_at).toISOString()})),events:events.rows.map(row=>({...row,id:String(row.id),created_at:new Date(row.created_at).toISOString()})),assessments:assessments.rows.map(row=>({...row,id:String(row.id),created_at:new Date(row.created_at).toISOString()}))};
}

async function event(client:PoolClient,caseId:string,actorType:string,actorId:string|null,eventType:string,metadata:object={}) { await client.query("insert into compliance.kyc_event(case_id,actor_type,actor_id,event_type,metadata) values($1,$2,$3,$4,$5)",[caseId,actorType,actorId,eventType,metadata]); }
async function notify(client:PoolClient,memberId:string|null,category:string,template:string,recipient:string,payload:object) { await client.query("insert into notification.outbox(member_id,category,template_key,recipient,payload) values($1,$2,$3,$4,$5)",[memberId,category,template,recipient,payload]); }

function assessAutomation(input:KycAutomationInput){const reasons:string[]=[];if(!input.evidenceSafetyClear)reasons.push("EVIDENCE_SAFETY_PENDING");if(!input.countrySupported)reasons.push("COUNTRY_UNSUPPORTED");if(input.sanctionsClear!==true)reasons.push("SANCTIONS_REVIEW");if(input.pepClear!==true)reasons.push("PEP_REVIEW");if(input.adverseMediaClear!==true)reasons.push("ADVERSE_MEDIA_REVIEW");if((input.documentAuthenticityScore??0)<.92)reasons.push("DOCUMENT_SCORE_LOW");if((input.faceMatchScore??0)<.92)reasons.push("FACE_MATCH_LOW");if((input.livenessScore??0)<.92)reasons.push("LIVENESS_LOW");if((input.dataConsistencyScore??0)<.92)reasons.push("DATA_INCONSISTENT");const screeningFailed=input.sanctionsClear===false||input.pepClear===false||input.adverseMediaClear===false;return{recommendation:screeningFailed?"escalate":reasons.length?"manual_review":"auto_approve",reasons};}

export async function ingestKycCase(input:{authSubject:string;email:string;fullName:string;countryCode?:string;tier?:string;vendorReference?:string;documents:Array<{type:string;storageKey:string;filename:string;mimeType:string;checksumSha256?:string}>;automation?:KycAutomationInput}) {
  const client=await database.connect(); const memberId=randomUUID(); const caseId=randomUUID();
  try { await client.query("begin");
    const member=await client.query(`insert into identity.member(id,auth_subject,email,full_name,country_code,email_verified) values($1,$2,$3,$4,$5,true)
      on conflict(auth_subject) do update set email=excluded.email,full_name=excluded.full_name,country_code=excluded.country_code,updated_at=now() returning *`,[memberId,input.authSubject,input.email,input.fullName,input.countryCode??null]);
    const memberRow=member.rows[0]; await client.query("insert into notification.member_preference(member_id) values($1) on conflict do nothing",[memberRow.id]);
    const sequence=await client.query("select nextval('compliance.kyc_reference_seq') as value"); const reference=`KYC-${new Date().getUTCFullYear()}-${String(sequence.rows[0].value).padStart(6,"0")}`;
    await client.query(`insert into compliance.kyc_case(id,reference,member_id,tier,vendor_reference,review_due_at) values($1,$2,$3,$4,$5,now()+interval '24 hours')`,[caseId,reference,memberRow.id,input.tier??"individual_basic",input.vendorReference??null]);
    for(const document of input.documents) await client.query(`insert into compliance.kyc_document(id,case_id,document_type,storage_key,filename,mime_type,checksum_sha256) values($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),caseId,document.type,document.storageKey,document.filename,document.mimeType,document.checksumSha256??null]);
    await event(client,caseId,"member",String(memberRow.id),"kyc.submitted",{documentCount:input.documents.length});
    let automated=false;
    if(input.automation){const assessment=assessAutomation(input.automation);await client.query(`insert into compliance.kyc_automation_assessment(id,case_id,provider,model_name,model_version,policy_version,document_authenticity_score,face_match_score,liveness_score,data_consistency_score,evidence_safety_clear,sanctions_clear,pep_clear,adverse_media_clear,country_supported,recommendation,reason_codes,raw_result_reference) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[randomUUID(),caseId,input.automation.provider,input.automation.modelName,input.automation.modelVersion,input.automation.policyVersion,input.automation.documentAuthenticityScore??null,input.automation.faceMatchScore??null,input.automation.livenessScore??null,input.automation.dataConsistencyScore??null,input.automation.evidenceSafetyClear,input.automation.sanctionsClear??null,input.automation.pepClear??null,input.automation.adverseMediaClear??null,input.automation.countrySupported,assessment.recommendation,JSON.stringify(assessment.reasons),input.automation.rawResultReference??null]);await event(client,caseId,"system",null,"kyc.automation_assessed",{recommendation:assessment.recommendation,reasonCodes:assessment.reasons,modelVersion:input.automation.modelVersion,policyVersion:input.automation.policyVersion});if(assessment.recommendation==="auto_approve"&&process.env.KYC_AUTO_APPROVAL_ENABLED==="true"){automated=true;await client.query("update compliance.kyc_case set status='approved',risk_level='low',decided_at=now(),decision_reason_code='automated_policy_pass',decision_summary='Approved by versioned automated KYC policy.',updated_at=now() where id=$1",[caseId]);await client.query("update identity.member set verification_level='verified',account_status='active',updated_at=now() where id=$1",[memberRow.id]);await event(client,caseId,"system",null,"kyc.auto_approved",{policyVersion:input.automation.policyVersion});}}
    await notify(client,String(memberRow.id),"compliance",automated?"kyc_auto_approved":"kyc_submission_received",input.email,{reference});
    if(!automated)await notify(client,null,"staff","kyc_case_submitted",process.env.KYC_REVIEW_EMAIL??"compliance@padalix.com",{reference,riskLevel:"unrated"});
    await client.query("commit"); return getKycCase(reference);
  } catch(error){await client.query("rollback");throw error;}finally{client.release();}
}

export async function reviewKycCase(reference:string,input:{action:string;note?:string;reasonCode?:string;riskLevel?:KycRisk;assignedTo?:string|null},reviewer:{id:string;name:string;role:string}) {
  const existing=await getKycCase(reference); if(!existing)return null; const client=await database.connect();
  const allowed=["note","request_information","approve","reject","risk_change","assign"]; if(!allowed.includes(input.action))throw new Error("Invalid review action");
  if(["approve","reject","request_information"].includes(input.action)&&!input.note)throw new Error("A review explanation is required");
  if(["reject","request_information"].includes(input.action)&&!input.reasonCode)throw new Error("A reason code is required");
  if(["approve","reject"].includes(input.action)&&existing.case.riskLevel==="critical"&&reviewer.role!=="admin")throw new Error("Critical-risk decisions require administrator approval");
  try{await client.query("begin"); let status=existing.case.status; const risk=input.riskLevel??existing.case.riskLevel; const assigned=input.assignedTo===undefined?existing.case.assignedTo:input.assignedTo;
    if(input.action==="approve")status="approved"; if(input.action==="reject")status="rejected"; if(input.action==="request_information")status="needs_information"; if(input.action==="assign"&&status==="submitted")status="in_review";
    await client.query(`update compliance.kyc_case set status=$1,risk_level=$2,assigned_to=$3,decision_reason_code=case when $1 in ('approved','rejected') then $4 else decision_reason_code end,decision_summary=case when $1 in ('approved','rejected') then $5 else decision_summary end,decided_at=case when $1 in ('approved','rejected') then now() else null end,updated_at=now() where id=$6`,[status,risk,assigned,input.reasonCode??null,input.note??null,existing.case.id]);
    if(input.action==="approve")await client.query("update identity.member set verification_level='verified',account_status='active',updated_at=now() where id=$1",[existing.case.memberId]);
    await client.query("insert into compliance.kyc_review(id,case_id,reviewer_id,reviewer_name,action,note,reason_code) values($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),existing.case.id,reviewer.id,reviewer.name,input.action,input.note??null,input.reasonCode??null]);
    await event(client,existing.case.id,reviewer.role==="admin"?"administrator":"reviewer",reviewer.id,`kyc.${input.action}`,{fromStatus:existing.case.status,toStatus:status,riskLevel:risk});
    if(["approve","reject","request_information"].includes(input.action)) await notify(client,existing.case.memberId,"compliance",`kyc_${input.action}`,existing.case.memberEmail,{reference,status,reasonCode:input.reasonCode??null});
    await client.query("commit"); return getKycCase(reference);
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
}
