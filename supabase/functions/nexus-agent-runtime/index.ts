import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
const url=Deno.env.get("SUPABASE_URL")??"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const db=createClient(url,service,{auth:{persistSession:false}});
const ALLOWED_WORKER_TASKS=new Set(["system.healthcheck","knowledge.ingest"]);
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return response({error:"POST required"},405);
 const bearer=req.headers.get("authorization")??"";if(!service||bearer!=="Bearer "+service)return response({error:"forbidden"},403);
 let body:Record<string,unknown>;try{body=await req.json();}catch{return response({error:"invalid JSON"},400);}
 const action=body.action;
 if(action==="ingest"){
  const {data,error}=await db.rpc("nexus_ingest_knowledge",{p_namespace:body.namespace,p_title:body.title,p_body:body.content,p_source_uri:body.source_uri,p_source_revision:body.source_revision??null,p_provenance:body.provenance??{},p_sensitivity:body.sensitivity??"internal"});
  if(error)return response({error:"knowledge_ingest_failed"},400);return response({accepted:true,document_id:data,approval:"proposed"},201);
 }
 if(action==="retrieve"){
  const {data,error}=await db.rpc("nexus_retrieve_knowledge",{p_namespace:body.namespace,p_query:body.query??"",p_limit:body.limit??5});
  if(error)return response({error:"knowledge_retrieval_failed"},400);return response({results:data??[]});
 }
 if(action==="enqueue"){
  const taskType=typeof body.task_type==="string"?body.task_type:"";
  if(!ALLOWED_WORKER_TASKS.has(taskType))return response({error:"task_type_not_allowed"},400);
  const {data,error}=await db.rpc("nexus_enqueue_task",{p_task_type:taskType,p_requested_by:body.requested_by??"system",p_idempotency_key:body.idempotency_key,p_input_ref:body.input_ref??null,p_priority:body.priority??0});
  if(error)return response({error:"task_enqueue_failed"},400);return response({task_id:data,status:"queued"},202);
 }
 if(action==="worker_tick"){
  const worker=typeof body.worker_id==="string"?body.worker_id:"nexus-edge-worker";
  const {data:tasks,error:claimError}=await db.rpc("nexus_claim_task",{p_worker:worker,p_lease_seconds:60});
  if(claimError)return response({error:"task_claim_failed"},500);
  const task=Array.isArray(tasks)?tasks[0]:null;if(!task)return response({worked:false,reason:"queue_empty"});
  let ok=false,output="";
  try{
   if(!ALLOWED_WORKER_TASKS.has(task.task_type))throw new Error("task_type_not_allowed");
   if(task.task_type==="system.healthcheck"){ok=true;output="NEXUS worker healthcheck OK";}
   else if(task.task_type==="knowledge.ingest"){
    const parsed=JSON.parse(task.input_ref??"{}");
    const {data,error}=await db.rpc("nexus_ingest_knowledge",{p_namespace:parsed.namespace,p_title:parsed.title,p_body:parsed.content,p_source_uri:parsed.source_uri,p_source_revision:parsed.source_revision??null,p_provenance:parsed.provenance??{},p_sensitivity:parsed.sensitivity??"internal"});
    if(error)throw new Error("knowledge_ingest_failed");ok=true;output="proposed:"+data;
   }
  }catch(e){output=e instanceof Error?e.message:"worker_error";}
  const {data:finished,error:finishError}=await db.rpc("nexus_finish_task",{p_id:task.id,p_worker:worker,p_fencing_token:task.fencing_token,p_success:ok,p_output_ref:ok?output:null,p_error:ok?null:output});
  if(finishError)return response({error:"task_finalize_failed",task_id:task.id},500);
  return response({worked:true,task_id:task.id,task_type:task.task_type,succeeded:ok,finalized:finished,detail:output});
 }
 return response({error:"unsupported_action"},400);
});