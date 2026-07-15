import { getKycReviewerSession } from "@/lib/admin-session";
import { listKycCases } from "@/lib/kyc";
export async function GET(request:Request){if(!await getKycReviewerSession())return Response.json({error:"Unauthorized"},{status:401});const q=new URL(request.url).searchParams;return Response.json({cases:await listKycCases({status:q.get("status")??undefined,risk:q.get("risk")??undefined,query:q.get("query")?.trim()||undefined})});}
