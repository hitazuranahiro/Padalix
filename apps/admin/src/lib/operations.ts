import { database } from "@/lib/db";

export type OperationsTransfer = {
  reference: string;
  status: string;
  settlementMode: string;
  recipientName: string;
  sourceAsset: string;
  sourceAmount: string;
  transactionHash: string;
  reconciliationStatus: string;
  createdAt: string;
};

export type OperationsJob = {
  id: string;
  topic: string;
  aggregateId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastErrorCode: string;
  availableAt: string;
  createdAt: string;
};

export type ReconciliationException = {
  id: string;
  reference: string;
  transactionHash: string;
  exceptionCode: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type WorkerRuntime = {
  id: string;
  service: string;
  lastSeenAt: string;
  lastCycleStatus: string;
  lastErrorCode: string;
  consecutiveErrors: number;
  cyclesCompleted: number;
  heartbeatAgeSeconds: number;
  healthy: boolean;
};

export type QueueHealth = {
  pending: number;
  processing: number;
  failed: number;
  oldestPendingSeconds: number;
};

export type OperationsSnapshot = {
  transfers: OperationsTransfer[];
  jobs: OperationsJob[];
  exceptions: ReconciliationException[];
  workers: WorkerRuntime[];
  queue: QueueHealth;
  generatedAt: string;
};

export async function getOperationsSnapshot(): Promise<OperationsSnapshot> {
  const [transfers, jobs, exceptions, workers, queue] = await Promise.all([
    database.query<OperationsTransfer>(`select t.reference,t.status,t.settlement_mode as "settlementMode",
      t.recipient_name as "recipientName",t.source_asset as "sourceAsset",t.source_amount::text as "sourceAmount",
      coalesce(i.transaction_hash,'') as "transactionHash",coalesce(i.reconciliation_status,'not_applicable') as "reconciliationStatus",
      t.created_at::text as "createdAt"
      from platform.transfer t left join platform.stellar_payment_intent i on i.transfer_id=t.id
      order by t.created_at desc limit 100`),
    database.query<OperationsJob>(`select id,topic,aggregate_id as "aggregateId",status,attempts,max_attempts as "maxAttempts",
      coalesce(last_error_code,'') as "lastErrorCode",available_at::text as "availableAt",created_at::text as "createdAt"
      from platform.outbox_job order by
      case status when 'dead_letter' then 0 when 'failed' then 1 when 'processing' then 2 when 'pending' then 3 else 4 end,
      created_at desc limit 100`),
    database.query<ReconciliationException>(`select e.id,t.reference,i.transaction_hash as "transactionHash",
      e.exception_code as "exceptionCode",e.status,e.details,e.created_at::text as "createdAt"
      from platform.reconciliation_exception e join platform.transfer t on t.id=e.transfer_id
      join platform.stellar_payment_intent i on i.id=e.payment_intent_id
      order by case e.status when 'open' then 0 when 'investigating' then 1 else 2 end,e.created_at desc limit 100`),
    database.query<WorkerRuntime>(`select worker_id as id,service,last_seen_at::text as "lastSeenAt",
      last_cycle_status as "lastCycleStatus",coalesce(last_error_code,'') as "lastErrorCode",
      consecutive_errors as "consecutiveErrors",cycles_completed::integer as "cyclesCompleted",
      greatest(0,extract(epoch from now()-last_seen_at))::integer as "heartbeatAgeSeconds",
      (last_seen_at >= now()-interval '60 seconds' and last_cycle_status not in ('error','stopped')) as healthy
      from operations.worker_heartbeat order by last_seen_at desc limit 10`),
    database.query<QueueHealth>(`with queue as (
      select status,created_at from platform.outbox_job
      union all select status,created_at from notification.outbox
      union all select status,created_at from support.notification_outbox
    ) select count(*) filter(where status='pending')::integer as pending,
      count(*) filter(where status='processing')::integer as processing,
      count(*) filter(where status in ('failed','dead_letter'))::integer as failed,
      coalesce(greatest(0,extract(epoch from now()-min(created_at) filter(where status='pending'))),0)::integer as "oldestPendingSeconds"
      from queue`),
  ]);
  return {
    transfers: transfers.rows,
    jobs: jobs.rows,
    exceptions: exceptions.rows,
    workers: workers.rows,
    queue: queue.rows[0] ?? { pending: 0, processing: 0, failed: 0, oldestPendingSeconds: 0 },
    generatedAt: new Date().toISOString(),
  };
}

export async function retryOperationsJob(id: string, actorId: string) {
  const client = await database.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ aggregateId: string; topic: string }>(`update platform.outbox_job set
      status='pending',attempts=0,available_at=now(),locked_at=null,locked_by=null,last_error_code=null,completed_at=null,updated_at=now()
      where id=$1 and status in ('failed','dead_letter') returning aggregate_id as "aggregateId",topic`, [id]);
    if (!result.rowCount) throw new Error("Job is not retryable");
    await client.query(`insert into audit.admin_event(actor_id,action,resource_type,resource_id,metadata)
      values($1,'operations.job.retry','outbox_job',$2,$3::jsonb)`, [actorId, id, JSON.stringify(result.rows[0])]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveReconciliationException(id: string, note: string, actorId: string) {
  const normalized = note.trim().slice(0, 1000);
  if (normalized.length < 8) throw new Error("Resolution note required");
  const client = await database.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ paymentIntentId: string }>(`update platform.reconciliation_exception set
      status='resolved',resolved_at=now(),details=details||jsonb_build_object('resolutionNote',$2,'resolvedBy',$3)
      where id=$1 and status in ('open','investigating') returning payment_intent_id as "paymentIntentId"`, [id, normalized, actorId]);
    if (!result.rowCount) throw new Error("Exception is not open");
    await client.query(`update platform.stellar_payment_intent set reconciliation_status='matched',reconciled_at=now(),updated_at=now()
      where id=$1`, [result.rows[0].paymentIntentId]);
    await client.query(`insert into audit.admin_event(actor_id,action,resource_type,resource_id,metadata)
      values($1,'operations.reconciliation.resolve','reconciliation_exception',$2,$3::jsonb)`,
      [actorId, id, JSON.stringify({ note: normalized, paymentIntentId: result.rows[0].paymentIntentId })]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
