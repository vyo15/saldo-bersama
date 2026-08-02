import { appendAudit } from "./audit.js";
import { cancelTransactionInternal, createTransactionInternal, assertTransactionDateUnlocked } from "./finance.js";
import { accountBalanceAsOf, envelopeItems, goalProgress } from "./readModels.js";
import {
  addDays, appError, assertOwner, assertVersion, dateValue, monthBounds, normalizeOwnedScope, nowIso,
  periodKey, positiveInteger, publicRow, sanitizeText, scopeFromAccountPair, strictBoolean, todayJakarta,
  uuid, visibleAccountSql, visibleScopeSql,
} from "./core.js";

const PERIOD_TYPES = new Set(["daily","weekly","biweekly","monthly","paycycle","custom"]);
const ROLLOVER_POLICIES = new Set(["unallocated","carry"]);
const OVERSPEND_POLICIES = new Set(["block","confirm","allow"]);
const FREQUENCIES = new Set(["daily","weekly","biweekly","monthly","bimonthly","quarterly","semiannual","annual"]);

const dueDayValue = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) throw appError("INVALID_DUE_DAY", "Tanggal jatuh tempo harus berupa angka 1-31.", 400);
  return parsed;
};

const addMonths = (date, count) => {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = month - 1 + count;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`;
};

const accountWithAccess = async (db, actor, accountId, { optional = false } = {}) => {
  if (!accountId && optional) return null;
  const row = await db.one("SELECT * FROM accounts WHERE account_id=? AND status='active'", [accountId]);
  if (!row) throw appError("INVALID_ACCOUNT", "Rekening tidak ditemukan atau tidak aktif.", 400);
  if (actor.role !== "owner" && row.owner_scope === "personal" && row.owner_user_id !== actor.user_id) throw appError("FORBIDDEN_ACCOUNT", "Rekening pribadi bukan milik pengguna aktif.",403);
  return row;
};

const ruleScopeFromAccount = (account) => account?.owner_scope === "personal"
  ? { scope:"personal", owner_user_id:account.owner_user_id }
  : { scope:"shared", owner_user_id:null };

const assertOwnedAccess = (actor, row) => {
  if (actor.role !== "owner" && row.scope === "personal" && row.owner_user_id !== actor.user_id) throw appError("FORBIDDEN_PERSONAL_DATA","Data pribadi ini bukan milik pengguna aktif.",403);
};

const nextEnvelopeBounds = (period) => {
  const type = period.period_type;
  if (type === "daily") return { start:addDays(period.period_end,1), end:addDays(period.period_end,1) };
  if (type === "weekly") return { start:addDays(period.period_end,1), end:addDays(period.period_end,7) };
  if (type === "biweekly") return { start:addDays(period.period_end,1), end:addDays(period.period_end,14) };
  if (["monthly","paycycle"].includes(type)) {
    const start=addDays(period.period_end,1); return { start, end:addDays(addMonths(start,1),-1) };
  }
  const length=Math.max(1,Math.round((new Date(`${period.period_end}T00:00:00Z`)-new Date(`${period.period_start}T00:00:00Z`))/86400000)+1);
  return { start:addDays(period.period_end,1), end:addDays(period.period_end,length) };
};

const assertAllocationAvailable = async (db, sourceAccount, amount, excludePeriodId = null) => {
  if (!sourceAccount) return;
  const balance=await accountBalanceAsOf(db,sourceAccount,todayJakarta());
  const allocated=await db.one(`SELECT COALESCE(SUM(p.allocated_amount - p.reserved_amount - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id),0)),0) AS total
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.status='active' AND r.status='active' AND r.source_account_id=? ${excludePeriodId?"AND p.envelope_period_id<>?":""}`, [sourceAccount.account_id,...(excludePeriodId?[excludePeriodId]:[])]);
  const available=balance-Number(allocated?.total||0);
  if (amount>available) throw appError("ALLOCATION_EXCEEDS_AVAILABLE","Alokasi melebihi dana rekening yang belum dialokasikan.",409,{availableAmount:available,accountBalance:balance});
};

export const listEnvelopes = async (db, context) => {
  const items=await envelopeItems(db,context.actor,{includeClosed:true});
  return {items:items.map((item)=>({...item,can_close:context.actor.role==="owner"&&item.status==="active"}))};
};

export const createEnvelopeRule = async (db, context, payload=context.payload||{}) => {
  assertOwner(context.actor);
  const name=sanitizeText(payload.name,100);
  const periodType=String(payload.period_type||"monthly");
  const rollover=String(payload.rollover_policy||"unallocated");
  const overspend=String(payload.overspend_policy||"confirm");
  if(!name) throw appError("NAME_REQUIRED","Nama kantong wajib diisi.",400);
  if(!PERIOD_TYPES.has(periodType)||!ROLLOVER_POLICIES.has(rollover)||!OVERSPEND_POLICIES.has(overspend)) throw appError("INVALID_ENVELOPE_RULE","Aturan kantong tidak valid.",400);
  const account=await accountWithAccess(db,context.actor,payload.source_account_id,{optional:true});
  const owned=ruleScopeFromAccount(account);
  const amount=positiveInteger(payload.default_amount,"Nominal alokasi");
  const timestamp=nowIso();
  const record={envelope_rule_id:uuid(),name,period_type:periodType,scope:owned.scope,owner_user_id:owned.owner_user_id,default_amount:amount,source_account_id:account?.account_id||null,rollover_policy:rollover,overspend_policy:overspend,status:"active",row_version:1,created_by:context.actor.user_id,created_at:timestamp,updated_by:context.actor.user_id,updated_at:timestamp};
  await db.execute(`INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,Object.values(record));
  return record;
};

export const createEnvelopePeriod = async (db, context, payload=context.payload||{}) => {
  assertOwner(context.actor);
  const rule=await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'",[payload.envelope_rule_id]);
  if(!rule) throw appError("INVALID_ENVELOPE_RULE","Aturan kantong tidak ditemukan.",404);
  const start=dateValue(payload.period_start,"Tanggal mulai kantong");
  const end=dateValue(payload.period_end,"Tanggal akhir kantong");
  if(start>end) throw appError("INVALID_PERIOD_RANGE","Tanggal akhir harus setelah tanggal mulai.",400);
  const amount=positiveInteger(payload.allocated_amount??rule.default_amount,"Nominal alokasi");
  const source=rule.source_account_id?await accountWithAccess(db,context.actor,rule.source_account_id):null;
  await assertAllocationAvailable(db,source,amount);
  const duplicate=await db.one("SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=? AND period_start=? AND period_end=?",[rule.envelope_rule_id,start,end]);
  if(duplicate) throw appError("DUPLICATE_ENVELOPE_PERIOD","Periode kantong yang sama sudah ada.",409);
  const timestamp=nowIso();
  const record={envelope_period_id:uuid(),envelope_rule_id:rule.envelope_rule_id,name:sanitizeText(payload.name||rule.name,100),period_start:start,period_end:end,allocated_amount:amount,reserved_amount:0,status:"active",row_version:1,created_by:context.actor.user_id,created_at:timestamp,updated_by:context.actor.user_id,updated_at:timestamp,closed_by:null,closed_at:null};
  await db.execute(`INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,Object.values(record));
  return record;
};

export const createEnvelope = async (db,context) => {
  const rule=await createEnvelopeRule(db,context,context.payload||{});
  const period=await createEnvelopePeriod(db,context,{...context.payload,envelope_rule_id:rule.envelope_rule_id,name:rule.name});
  const result={rule:publicRow(rule),period:publicRow(period)};
  await appendAudit(db,context,{entityType:"envelope",entityId:period.envelope_period_id,next:result});
  await context.enqueueMirror?.(db,"envelope",period.envelope_period_id);
  return result;
};

export const moveEnvelope = async (db,context) => {
  const payload=context.payload||{};
  const fromId=payload.fromEnvelopePeriodId||payload.from_envelope_period_id;
  const toId=payload.toEnvelopePeriodId||payload.to_envelope_period_id;
  if(!fromId||!toId||fromId===toId) throw appError("INVALID_ENVELOPE_MOVE","Kantong sumber dan tujuan harus berbeda.",400);
  const [from,to]=await Promise.all([
    db.one(`SELECT p.*,r.scope,r.owner_user_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`,[fromId]),
    db.one(`SELECT p.*,r.scope,r.owner_user_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`,[toId]),
  ]);
  if(!from||!to) throw appError("INVALID_ENVELOPE","Kantong aktif tidak ditemukan.",404);
  assertOwnedAccess(context.actor,from); assertOwnedAccess(context.actor,to);
  assertVersion(from,payload.from_row_version); assertVersion(to,payload.to_row_version);
  if(from.scope!==to.scope||String(from.owner_user_id||"")!==String(to.owner_user_id||"")) throw appError("ENVELOPE_SCOPE_MISMATCH","Alokasi hanya dapat dipindahkan antar kantong dengan kepemilikan sama.",409);
  const amount=positiveInteger(payload.amount,"Nominal realokasi");
  const usage=await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?",[fromId]);
  const remaining=Number(from.allocated_amount)-Number(from.reserved_amount)-Number(usage?.used||0);
  if(amount>remaining) throw appError("INSUFFICIENT_ENVELOPE","Nominal melebihi sisa kantong sumber.",409,{remainingAmount:remaining});
  const reason=sanitizeText(payload.reason,180);
  if(!reason) throw appError("REASON_REQUIRED","Alasan realokasi wajib diisi.",400);
  const timestamp=nowIso();
  const movement={movement_id:uuid(),from_envelope_period_id:fromId,to_envelope_period_id:toId,amount,movement_type:"reallocation",reason,status:"active",row_version:1,created_by:context.actor.user_id,created_at:timestamp};
  const fromUpdate=await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount-?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?",[amount,context.actor.user_id,timestamp,fromId,from.row_version]);
  if(fromUpdate.rowsAffected!==1) throw appError("CONFLICT","Kantong sumber berubah di perangkat lain.",409);
  const toUpdate=await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?",[amount,context.actor.user_id,timestamp,toId,to.row_version]);
  if(toUpdate.rowsAffected!==1) throw appError("CONFLICT","Kantong tujuan berubah di perangkat lain.",409);
  await db.execute("INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",Object.values(movement));
  await appendAudit(db,context,{entityType:"envelope_movement",entityId:movement.movement_id,next:publicRow(movement)});
  await context.enqueueMirror?.(db,"envelope",fromId);
  return publicRow(movement);
};

export const closeEnvelope = async (db,context) => {
  assertOwner(context.actor);
  const payload=context.payload||{};
  const period=await db.one(`SELECT p.*,r.name AS rule_name,r.period_type,r.rollover_policy,r.scope,r.owner_user_id,r.source_account_id,r.default_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`,[payload.envelope_period_id]);
  if(!period) throw appError("NOT_FOUND","Periode kantong aktif tidak ditemukan.",404);
  assertVersion(period,context.rowVersion??payload.row_version);
  const usage=await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?",[period.envelope_period_id]);
  const remaining=Math.max(0,Number(period.allocated_amount)-Number(period.reserved_amount)-Number(usage?.used||0));
  let rollover=null;
  if(period.rollover_policy==="carry"&&remaining>0){
    const bounds=nextEnvelopeBounds(period);
    let next=await db.one("SELECT * FROM envelope_periods WHERE envelope_rule_id=? AND period_start=? AND period_end=?",[period.envelope_rule_id,bounds.start,bounds.end]);
    if(next){
      const nextUpdate=await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?",[remaining,context.actor.user_id,nowIso(),next.envelope_period_id,next.row_version]);
      if(nextUpdate.rowsAffected!==1) throw appError("CONFLICT","Kantong rollover berubah di perangkat lain.",409);
      next={...next,allocated_amount:Number(next.allocated_amount)+remaining,row_version:Number(next.row_version)+1};
    } else {
      const timestamp=nowIso();
      next={envelope_period_id:uuid(),envelope_rule_id:period.envelope_rule_id,name:period.rule_name,period_start:bounds.start,period_end:bounds.end,allocated_amount:remaining,reserved_amount:0,status:"active",row_version:1,created_by:context.actor.user_id,created_at:timestamp,updated_by:context.actor.user_id,updated_at:timestamp,closed_by:null,closed_at:null};
      await db.execute(`INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,Object.values(next));
    }
    const movement={movement_id:uuid(),from_envelope_period_id:period.envelope_period_id,to_envelope_period_id:next.envelope_period_id,amount:remaining,movement_type:"rollover",reason:"Rollover sisa periode",status:"active",row_version:1,created_by:context.actor.user_id,created_at:nowIso()};
    await db.execute("INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",Object.values(movement));
    rollover={amount:remaining,to_envelope_period_id:next.envelope_period_id};
  }
  const next={...period,status:"closed",closed_by:context.actor.user_id,closed_at:nowIso(),row_version:Number(period.row_version)+1,updated_by:context.actor.user_id,updated_at:nowIso()};
  const result=await db.execute("UPDATE envelope_periods SET status='closed',closed_by=?,closed_at=?,row_version=?,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?",[next.closed_by,next.closed_at,next.row_version,next.updated_by,next.updated_at,period.envelope_period_id,period.row_version]);
  if(result.rowsAffected!==1) throw appError("CONFLICT","Periode kantong berubah di perangkat lain.",409);
  const response={period:publicRow(next),rollover};
  await appendAudit(db,context,{entityType:"envelope_period",entityId:period.envelope_period_id,previous:publicRow(period),next:response});
  await context.enqueueMirror?.(db,"envelope",period.envelope_period_id);
  return response;
};

const frequencyMonthStep={monthly:1,bimonthly:2,quarterly:3,semiannual:6,annual:12};
const datesForRule = (rule,startPeriod,endPeriod) => {
  const startBound=monthBounds(startPeriod).start; const endBound=monthBounds(endPeriod).end;
  const ruleStart=rule.start_date; const ruleEnd=rule.end_date||"9999-12-31";
  const lower=ruleStart>startBound?ruleStart:startBound; const upper=ruleEnd<endBound?ruleEnd:endBound;
  if(lower>upper) return [];
  const dates=[];
  if(["daily","weekly","biweekly"].includes(rule.frequency)){
    const step=rule.frequency==="daily"?1:rule.frequency==="weekly"?7:14;
    let cursor=rule.start_date;
    while(cursor<lower) cursor=addDays(cursor,step);
    while(cursor<=upper){dates.push(cursor);cursor=addDays(cursor,step);}
    return dates;
  }
  const step=frequencyMonthStep[rule.frequency]||1;
  const [sy,sm]=rule.start_date.split("-").map(Number);
  const [ey,em]=endPeriod.split("-").map(Number);
  let index=0;
  while(index<600){
    const total=sm-1+index*step; const year=sy+Math.floor(total/12); const month=((total%12)+12)%12+1;
    if(year>ey||(year===ey&&month>em)) break;
    const last=new Date(Date.UTC(year,month,0)).getUTCDate();
    const due=`${year}-${String(month).padStart(2,"0")}-${String(Math.min(Number(rule.due_day),last)).padStart(2,"0")}`;
    if(due>=lower&&due<=upper) dates.push(due);
    index+=1;
  }
  return dates;
};

export const ensureRuleOccurrences = async (db,rule,{monthsAhead=24}={}) => {
  const current=periodKey();
  const end=addMonths(`${current}-01`,monthsAhead).slice(0,7);
  const dates=datesForRule(rule,current,end);
  const now=nowIso();
  for(const due of dates){
    const existing=await db.one("SELECT occurrence_id FROM recurring_occurrences WHERE recurring_rule_id=? AND due_date=?",[rule.recurring_rule_id,due]);
    if(existing) continue;
    const occurrence={occurrence_id:uuid(),recurring_rule_id:rule.recurring_rule_id,period_key:due.slice(0,7),due_date:due,expected_amount:rule.expected_amount,actual_amount:0,status:due<todayJakarta()?"overdue":"expected",transaction_ids_json:"[]",row_version:1,created_at:now,updated_at:now};
    await db.execute("INSERT INTO recurring_occurrences(occurrence_id,recurring_rule_id,period_key,due_date,expected_amount,actual_amount,status,transaction_ids_json,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",Object.values(occurrence));
  }
};

const recurringScheduleChanged = (current, next) => [
  "frequency", "due_day", "start_date", "end_date", "expected_amount", "status",
].some((field) => String(current[field] ?? "") !== String(next[field] ?? ""));

const removeUnpaidFutureOccurrences = async (db, ruleId, cutoff = todayJakarta()) => {
  await db.execute(`DELETE FROM recurring_occurrences
    WHERE recurring_rule_id=?
      AND due_date>=?
      AND actual_amount=0
      AND transaction_ids_json='[]'
      AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.recurring_occurrence_id=recurring_occurrences.occurrence_id
      )`, [ruleId, cutoff]);
};

export const createRecurringRule = async (db,context) => {
  assertOwner(context.actor);
  const p=context.payload||{}; const name=sanitizeText(p.name,100); const kind=String(p.kind||"expense"); const frequency=String(p.frequency||"monthly");
  if(!name||!["expense","income"].includes(kind)||!FREQUENCIES.has(frequency)) throw appError("INVALID_RECURRING_RULE","Aturan rutin tidak valid.",400);
  const category=await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'",[p.category_id]);
  if(!category||category.transaction_type!==kind) throw appError("INVALID_CATEGORY","Kategori jadwal tidak valid.",400);
  const account=await accountWithAccess(db,context.actor,p.default_account_id);
  const owned=ruleScopeFromAccount(account); const start=dateValue(p.start_date||todayJakarta(),"Tanggal mulai"); const end=p.end_date?dateValue(p.end_date,"Tanggal akhir"):null;
  if(end&&end<start) throw appError("INVALID_DATE_RANGE","Tanggal akhir sebelum tanggal mulai.",400);
  const now=nowIso();
  const rule={recurring_rule_id:uuid(),name,kind,category_id:category.category_id,expected_amount:positiveInteger(p.expected_amount,"Nominal rutin"),frequency,due_day:dueDayValue(p.due_day ?? 1),default_account_id:account.account_id,payment_method:sanitizeText(p.payment_method,40),auto_debit:strictBoolean(p.auto_debit,false)?1:0,start_date:start,end_date:end,priority:["low","normal","high"].includes(String(p.priority||"normal"))?String(p.priority||"normal"):"normal",status:"active",row_version:1,created_by:context.actor.user_id,created_at:now,updated_by:context.actor.user_id,updated_at:now,scope:owned.scope,owner_user_id:owned.owner_user_id};
  await db.execute(`INSERT INTO recurring_rules(recurring_rule_id,name,kind,category_id,expected_amount,frequency,due_day,default_account_id,payment_method,auto_debit,start_date,end_date,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,Object.values(rule));
  await ensureRuleOccurrences(db,rule);
  await appendAudit(db,context,{entityType:"recurring_rule",entityId:rule.recurring_rule_id,next:publicRow(rule,["auto_debit"])});
  await context.enqueueCalendar?.(db,"recurring",rule.recurring_rule_id);
  await context.enqueueMirror?.(db,"recurring",rule.recurring_rule_id);
  return publicRow(rule,["auto_debit"]);
};

export const updateRecurringRule = async (db,context) => {
  assertOwner(context.actor);
  const p=context.payload||{}; const current=await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=?",[p.recurring_rule_id]);
  if(!current) throw appError("NOT_FOUND","Aturan rutin tidak ditemukan.",404);
  assertVersion(current,context.rowVersion??p.row_version);
  const status=p.status===undefined?current.status:String(p.status); if(!["active","archived"].includes(status)) throw appError("INVALID_STATUS","Status aturan tidak valid.",400);
  let account=await accountWithAccess(db,context.actor,p.default_account_id??current.default_account_id);
  const owned=ruleScopeFromAccount(account);
  const kind=String(p.kind??current.kind),frequency=String(p.frequency??current.frequency);
  const category=await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'",[p.category_id??current.category_id]);
  if(!category||category.transaction_type!==kind||!FREQUENCIES.has(frequency)) throw appError("INVALID_RECURRING_RULE","Aturan rutin tidak valid.",400);
  const next={...current,name:sanitizeText(p.name??current.name,100),kind,category_id:category.category_id,expected_amount:p.expected_amount===undefined?current.expected_amount:positiveInteger(p.expected_amount,"Nominal rutin"),frequency,due_day:p.due_day===undefined?current.due_day:dueDayValue(p.due_day),default_account_id:account.account_id,payment_method:sanitizeText(p.payment_method??current.payment_method,40),auto_debit:p.auto_debit===undefined?current.auto_debit:(strictBoolean(p.auto_debit)?1:0),start_date:p.start_date===undefined?current.start_date:dateValue(p.start_date),end_date:p.end_date===undefined?current.end_date:(p.end_date?dateValue(p.end_date):null),priority:p.priority===undefined?current.priority:String(p.priority||"normal"),status,scope:owned.scope,owner_user_id:owned.owner_user_id,row_version:Number(current.row_version)+1,updated_by:context.actor.user_id,updated_at:nowIso()};
  if(!next.name||!["low","normal","high"].includes(next.priority)||next.end_date&&next.end_date<next.start_date) throw appError("INVALID_RECURRING_RULE","Aturan rutin tidak valid.",400);
  const linked=await db.one("SELECT COUNT(*) AS count FROM transactions WHERE recurring_occurrence_id IN (SELECT occurrence_id FROM recurring_occurrences WHERE recurring_rule_id=?)",[current.recurring_rule_id]);
  if(Number(linked?.count||0)&&["kind","category_id","default_account_id","scope","owner_user_id"].some((field)=>String(next[field]||"")!==String(current[field]||""))) throw appError("RECURRING_FINANCIAL_IDENTITY_LOCKED","Rekening, kategori, jenis, dan kepemilikan tidak dapat diubah setelah memiliki transaksi terkait.",409);
  const result=await db.execute(`UPDATE recurring_rules SET name=?,kind=?,category_id=?,expected_amount=?,frequency=?,due_day=?,default_account_id=?,payment_method=?,auto_debit=?,start_date=?,end_date=?,priority=?,status=?,scope=?,owner_user_id=?,row_version=?,updated_by=?,updated_at=? WHERE recurring_rule_id=? AND row_version=?`,[next.name,next.kind,next.category_id,next.expected_amount,next.frequency,next.due_day,next.default_account_id,next.payment_method,next.auto_debit,next.start_date,next.end_date,next.priority,next.status,next.scope,next.owner_user_id,next.row_version,next.updated_by,next.updated_at,current.recurring_rule_id,current.row_version]);
  if(result.rowsAffected!==1) throw appError("CONFLICT","Aturan rutin berubah di perangkat lain.",409);
  if(recurringScheduleChanged(current,next)) await removeUnpaidFutureOccurrences(db,current.recurring_rule_id);
  if(next.status==="active") await ensureRuleOccurrences(db,next);
  await appendAudit(db,context,{entityType:"recurring_rule",entityId:current.recurring_rule_id,previous:publicRow(current),next:publicRow(next,["auto_debit"])});
  await context.enqueueCalendar?.(db,"recurring",current.recurring_rule_id);
  await context.enqueueMirror?.(db,"recurring",current.recurring_rule_id);
  return publicRow(next,["auto_debit"]);
};

export const listRecurring = async (db,context) => {
  const period=periodKey(context.payload?.period); const access=visibleScopeSql(context.actor,"r");
  const rows=await db.all(`SELECT o.*,r.name,r.kind,r.category_id,r.frequency,r.default_account_id,r.payment_method,r.auto_debit,r.start_date,r.end_date,r.priority,r.status AS rule_status,r.row_version AS rule_row_version,r.scope,r.owner_user_id
    FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    WHERE o.period_key=? AND ${access.sql} ORDER BY o.due_date,r.name`,[period,...access.args]);
  const today=todayJakarta();
  return {items:rows.map((row)=>{
    const transactionIds=JSON.parse(row.transaction_ids_json||"[]");
    const status=Number(row.actual_amount)>=Number(row.expected_amount)?(row.kind==="income"?"received":"paid"):Number(row.actual_amount)>0?"partial":row.due_date<today?"overdue":"expected";
    return {...publicRow(row,["auto_debit"]),status,transaction_ids:transactionIds.join(","),can_pay:row.rule_status==="active"&&Number(row.actual_amount)<Number(row.expected_amount),can_reverse:transactionIds.length>0,can_edit_rule:context.actor.role==="owner",can_archive_rule:context.actor.role==="owner"&&row.rule_status==="active",transaction_type:row.kind};
  })};
};

export const payOccurrence = async (db, context) => {
  const p = context.payload || {};
  const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE occurrence_id=?", [p.occurrence_id]);
  if (!occurrence) throw appError("NOT_FOUND", "Occurrence rutin tidak ditemukan.", 404);
  const rule = await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=?", [occurrence.recurring_rule_id]);
  if (!rule) throw appError("INTEGRITY_ERROR", "Aturan rutin untuk occurrence tidak ditemukan.", 409);
  assertOwnedAccess(context.actor, rule);
  assertVersion(occurrence, context.rowVersion ?? p.row_version);
  if (rule.status !== "active") throw appError("RECURRING_RULE_ARCHIVED", "Aturan rutin sudah diarsipkan.", 409);
  const account = await accountWithAccess(db, context.actor, p.account_id || rule.default_account_id);
  const owned = ruleScopeFromAccount(account);
  if (owned.scope !== rule.scope || String(owned.owner_user_id || "") !== String(rule.owner_user_id || "")) {
    throw appError("ACCOUNT_SCOPE_MISMATCH", "Rekening aktual harus memiliki kepemilikan sama dengan aturan.", 409);
  }
  const amount = positiveInteger(p.amount, "Nominal aktual");
  const remaining = Math.max(0, Number(occurrence.expected_amount) - Number(occurrence.actual_amount));
  if (!remaining) throw appError("OCCURRENCE_ALREADY_COMPLETE", "Occurrence sudah selesai dibayar.", 409);
  const transaction = await createTransactionInternal(db, { ...context, action: "recurring.payOccurrence" }, {
    transaction_type: rule.kind,
    transaction_date: p.transaction_date || todayJakarta(),
    source_account_id: rule.kind === "expense" ? account.account_id : null,
    destination_account_id: rule.kind === "income" ? account.account_id : null,
    category_id: rule.category_id,
    amount,
    description: rule.name,
    payment_method: rule.payment_method,
    recurring_occurrence_id: occurrence.occurrence_id,
  }, { allowInternalLinks: true, audit: false });
  const ids = JSON.parse(occurrence.transaction_ids_json || "[]");
  ids.push(transaction.transaction_id);
  const actual = Number(occurrence.actual_amount) + amount;
  const status = actual >= Number(occurrence.expected_amount) ? "paid" : "partial";
  const next = { ...occurrence, actual_amount: actual, status, transaction_ids_json: JSON.stringify(ids), row_version: Number(occurrence.row_version) + 1, updated_at: nowIso() };
  const result = await db.execute("UPDATE recurring_occurrences SET actual_amount=?,status=?,transaction_ids_json=?,row_version=?,updated_at=? WHERE occurrence_id=? AND row_version=?", [next.actual_amount, next.status, next.transaction_ids_json, next.row_version, next.updated_at, occurrence.occurrence_id, occurrence.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Occurrence berubah di perangkat lain.", 409);
  const response = { occurrence: { ...publicRow(next), status: rule.kind === "income" && status === "paid" ? "received" : status }, transaction };
  await appendAudit(db, context, { entityType: "recurring_occurrence", entityId: occurrence.occurrence_id, previous: publicRow(occurrence), next: response });
  await context.enqueueCalendar?.(db, "recurring_occurrence", occurrence.occurrence_id);
  await context.enqueueMirror?.(db, "recurring", occurrence.recurring_rule_id);
  return response;
};

export const reverseOccurrencePayment = async (db,context) => {
  const p=context.payload||{}; const occurrence=await db.one(`SELECT o.*,r.scope,r.owner_user_id,r.recurring_rule_id FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id WHERE o.occurrence_id=?`,[p.occurrence_id]);
  if(!occurrence) throw appError("NOT_FOUND","Occurrence rutin tidak ditemukan.",404); assertOwnedAccess(context.actor,occurrence); assertVersion(occurrence,context.rowVersion??p.row_version);
  const transaction=await db.one("SELECT * FROM transactions WHERE transaction_id=? AND recurring_occurrence_id=? AND status='active'",[p.transaction_id,occurrence.occurrence_id]);
  if(!transaction) throw appError("NOT_FOUND","Transaksi rutin aktif tidak ditemukan.",404);
  if(context.actor.role!=="owner"&&transaction.created_by!==context.actor.user_id) throw appError("FORBIDDEN","Member hanya dapat membatalkan pembayaran rutin yang dibuat sendiri.",403);
  const cancelledTransaction = await cancelTransactionInternal(db,context,transaction,p.reason,{allowLinked:true,audit:false});
  const ids=JSON.parse(occurrence.transaction_ids_json||"[]").filter((id)=>id!==transaction.transaction_id);
  const active=ids.length?await db.all(`SELECT amount FROM transactions WHERE status='active' AND transaction_id IN (${ids.map(()=>"?").join(",")})`,ids):[];
  const actual=active.reduce((sum,row)=>sum+Number(row.amount),0); const status=actual>=Number(occurrence.expected_amount)?"paid":actual>0?"partial":occurrence.due_date<todayJakarta()?"overdue":"expected";
  const next={...occurrence,actual_amount:actual,status,transaction_ids_json:JSON.stringify(ids),row_version:Number(occurrence.row_version)+1,updated_at:nowIso()};
  const update = await db.execute("UPDATE recurring_occurrences SET actual_amount=?,status=?,transaction_ids_json=?,row_version=?,updated_at=? WHERE occurrence_id=? AND row_version=?",[actual,status,next.transaction_ids_json,next.row_version,next.updated_at,occurrence.occurrence_id,occurrence.row_version]);
  if(update.rowsAffected!==1) throw appError("CONFLICT","Occurrence berubah di perangkat lain.",409);
  const response={occurrence:publicRow(next),transaction:cancelledTransaction}; await appendAudit(db,context,{entityType:"recurring_occurrence",entityId:occurrence.occurrence_id,previous:publicRow(occurrence),next:response});
  await context.enqueueCalendar?.(db,"recurring",occurrence.recurring_rule_id); await context.enqueueMirror?.(db,"recurring",occurrence.occurrence_id); return response;
};

export const listBudgets = async (db,context) => {
  const period=periodKey(context.payload?.period); const access=visibleScopeSql(context.actor,"b");
  const rows=await db.all(`SELECT b.*,COALESCE(c.name,b.name) AS display_name,COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.category_id=b.category_id AND substr(t.transaction_date,1,7)=b.period_key AND ((b.scope='shared' AND t.scope='shared') OR (b.scope='personal' AND t.scope='personal' AND t.owner_user_id=b.owner_user_id))),0) AS used_amount FROM budgets b LEFT JOIN categories c ON c.category_id=b.category_id WHERE b.period_key=? AND b.status='active' AND ${access.sql} ORDER BY display_name`,[period,...access.args]);
  return {items:rows.map((row)=>({...publicRow(row),name:row.display_name}))};
};

export const upsertBudget = async (db,context) => {
  assertOwner(context.actor); const p=context.payload||{}; const period=periodKey(p.period_key); const category=await db.one("SELECT * FROM categories WHERE category_id=? AND status='active' AND transaction_type='expense'",[p.category_id]);
  if(!category) throw appError("INVALID_CATEGORY","Kategori pengeluaran tidak valid.",400);
  const owned=await normalizeOwnedScope(db,context.actor,p); const current=await db.one("SELECT * FROM budgets WHERE period_key=? AND category_id=? AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')",[period,category.category_id,owned.scope,owned.owner_user_id]);
  const amount=positiveInteger(p.amount,"Nominal budget"); const threshold=Math.min(100,Math.max(1,Number(p.warning_threshold||80))); const now=nowIso();
  let next;
  if(current){assertVersion(current,context.rowVersion??p.row_version); next={...current,name:sanitizeText(p.name||category.name,100),amount,warning_threshold:threshold,status:"active",row_version:Number(current.row_version)+1,updated_by:context.actor.user_id,updated_at:now}; const result=await db.execute("UPDATE budgets SET name=?,amount=?,warning_threshold=?,status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=?",[next.name,amount,threshold,next.row_version,next.updated_by,next.updated_at,current.budget_id,current.row_version]); if(result.rowsAffected!==1) throw appError("CONFLICT","Budget berubah di perangkat lain.",409);}
  else {next={budget_id:uuid(),period_key:period,category_id:category.category_id,envelope_rule_id:null,name:sanitizeText(p.name||category.name,100),amount,warning_threshold:threshold,status:"active",row_version:1,created_by:context.actor.user_id,created_at:now,updated_by:context.actor.user_id,updated_at:now,scope:owned.scope,owner_user_id:owned.owner_user_id}; await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",Object.values(next));}
  await appendAudit(db,context,{entityType:"budget",entityId:next.budget_id,previous:current?publicRow(current):null,next:publicRow(next)}); await context.enqueueMirror?.(db,"budget",next.budget_id); return publicRow(next);
};

export const archiveBudget = async (db,context) => {assertOwner(context.actor); const p=context.payload||{}; const current=await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='active'",[p.budget_id]); if(!current) throw appError("NOT_FOUND","Budget aktif tidak ditemukan.",404); assertVersion(current,context.rowVersion??p.row_version); const next={...current,status:"archived",row_version:Number(current.row_version)+1,updated_by:context.actor.user_id,updated_at:nowIso()}; const r=await db.execute("UPDATE budgets SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=?",[next.row_version,next.updated_by,next.updated_at,current.budget_id,current.row_version]); if(r.rowsAffected!==1) throw appError("CONFLICT","Budget berubah di perangkat lain.",409); await appendAudit(db,context,{entityType:"budget",entityId:current.budget_id,previous:publicRow(current),next:publicRow(next)}); await context.enqueueMirror?.(db,"budget",current.budget_id); return publicRow(next);};

export const listGoals = async (db, context) => {
  const access = visibleScopeSql(context.actor, "g");
  const rows = await db.all(`SELECT g.*,a.name AS account_name,a.status AS account_status FROM savings_goals g JOIN accounts a ON a.account_id=g.account_id WHERE ${access.sql} AND g.status<>'archived' ORDER BY CASE g.priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,g.status,g.target_date`, access.args);
  const items = [];
  for (const row of rows) {
    const current = await goalProgress(db, row.goal_id);
    const last = await db.one("SELECT goal_movement_id,transaction_id,created_at FROM goal_movements WHERE goal_id=? AND status='active' ORDER BY created_at DESC LIMIT 1", [row.goal_id]);
    const linked = last?.transaction_id ? await db.one("SELECT transaction_date FROM transactions WHERE transaction_id=?", [last.transaction_id]) : null;
    const locked = linked ? Boolean(await db.one("SELECT closure_id FROM period_closures WHERE status='closed' AND period_key>=substr(?,1,7) LIMIT 1", [linked.transaction_date])) : false;
    items.push({ ...publicRow(row), current_amount: current, last_movement_id: last?.goal_movement_id || "", can_move: row.status === "active" && row.account_status === "active", can_reverse: Boolean(last) && !locked, can_update: context.actor.role === "owner", can_archive: context.actor.role === "owner" && row.status !== "archived" });
  }
  return { items };
};

export const createGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const account = await accountWithAccess(db, context.actor, p.account_id);
  const owned = ruleScopeFromAccount(account);
  const now = nowIso();
  const priority = String(p.priority || "normal");
  const goalType = String(p.goal_type || "savings");
  const record = { goal_id: uuid(), name: sanitizeText(p.name, 100), goal_type: goalType, target_amount: positiveInteger(p.target_amount, "Target nominal"), target_date: p.target_date ? dateValue(p.target_date, "Tanggal target") : null, account_id: account.account_id, priority, status: "active", row_version: 1, created_by: context.actor.user_id, created_at: now, updated_by: context.actor.user_id, updated_at: now, scope: owned.scope, owner_user_id: owned.owner_user_id };
  if (!record.name || !["savings", "emergency_fund", "sinking_fund"].includes(goalType) || !["low", "normal", "high"].includes(priority)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  await db.execute("INSERT INTO savings_goals(goal_id,name,goal_type,target_amount,target_date,account_id,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(record));
  await appendAudit(db, context, { entityType: "goal", entityId: record.goal_id, next: publicRow(record) });
  await context.enqueueMirror?.(db, "goal", record.goal_id);
  return publicRow(record);
};

export const updateGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=?", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const account = await accountWithAccess(db, context.actor, p.account_id ?? current.account_id);
  const owned = ruleScopeFromAccount(account);
  const status = String(p.status ?? current.status);
  const goalType = String(p.goal_type ?? current.goal_type);
  const priority = String(p.priority ?? current.priority);
  if (!["active", "completed", "archived"].includes(status) || !["savings", "emergency_fund", "sinking_fund"].includes(goalType) || !["low", "normal", "high"].includes(priority)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  if (status === "completed" && (await goalProgress(db, current.goal_id)) < Number(p.target_amount ?? current.target_amount)) throw appError("GOAL_NOT_REACHED", "Target belum mencapai nominal tujuan.", 409);
  const movements = await db.one("SELECT COUNT(*) AS count FROM goal_movements WHERE goal_id=?", [current.goal_id]);
  if (Number(movements?.count || 0) && (account.account_id !== current.account_id || owned.scope !== current.scope || String(owned.owner_user_id || "") !== String(current.owner_user_id || ""))) throw appError("GOAL_ACCOUNT_LOCKED", "Rekening dan kepemilikan target tidak dapat diubah setelah memiliki mutasi.", 409);
  const next = { ...current, name: sanitizeText(p.name ?? current.name, 100), goal_type: goalType, target_amount: p.target_amount === undefined ? current.target_amount : positiveInteger(p.target_amount, "Target nominal"), target_date: p.target_date === undefined ? current.target_date : (p.target_date ? dateValue(p.target_date) : null), account_id: account.account_id, priority, status, scope: owned.scope, owner_user_id: owned.owner_user_id, row_version: Number(current.row_version) + 1, updated_by: context.actor.user_id, updated_at: nowIso() };
  if (!next.name) throw appError("NAME_REQUIRED", "Nama target wajib diisi.", 400);
  const r = await db.execute("UPDATE savings_goals SET name=?,goal_type=?,target_amount=?,target_date=?,account_id=?,priority=?,status=?,scope=?,owner_user_id=?,row_version=?,updated_by=?,updated_at=? WHERE goal_id=? AND row_version=?", [next.name, next.goal_type, next.target_amount, next.target_date, next.account_id, next.priority, next.status, next.scope, next.owner_user_id, next.row_version, next.updated_by, next.updated_at, current.goal_id, current.row_version]);
  if (r.rowsAffected !== 1) throw appError("CONFLICT", "Target berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "goal", entityId: current.goal_id, previous: publicRow(current), next: publicRow(next) });
  await context.enqueueMirror?.(db, "goal", current.goal_id);
  return publicRow(next);
};

export const moveGoal = async (db,context) => {const p=context.payload||{}; const goal=await db.one("SELECT * FROM savings_goals WHERE goal_id=? AND status='active'",[p.goal_id]); if(!goal) throw appError("NOT_FOUND","Target aktif tidak ditemukan.",404); assertOwnedAccess(context.actor,goal); const amount=positiveInteger(p.amount,"Nominal mutasi target"); const movementType=String(p.movement_type||"deposit"); const type=({contribution:"deposit",withdraw:"withdrawal"})[movementType]||movementType; if(!["deposit","withdrawal"].includes(type)) throw appError("INVALID_GOAL_MOVEMENT","Jenis mutasi target tidak valid.",400); const source=await accountWithAccess(db,context.actor,p.source_account_id); const destination=await accountWithAccess(db,context.actor,p.destination_account_id); const owned=scopeFromAccountPair(source,destination); if(owned.scope!==goal.scope||String(owned.owner_user_id||"")!==String(goal.owner_user_id||"")) throw appError("GOAL_SCOPE_MISMATCH","Rekening mutasi harus satu kepemilikan dengan target.",409); if(type==="deposit"&&destination.account_id!==goal.account_id) throw appError("GOAL_ACCOUNT_MISMATCH","Setoran target harus masuk ke rekening target.",409); if(type==="withdrawal"&&source.account_id!==goal.account_id) throw appError("GOAL_ACCOUNT_MISMATCH","Penarikan target harus berasal dari rekening target.",409); const current=await goalProgress(db,goal.goal_id); if(type==="withdrawal"&&amount>current) throw appError("GOAL_INSUFFICIENT","Nominal penarikan melebihi progress target.",409,{currentAmount:current}); const transaction=await createTransactionInternal(db,{...context,action:"goals.move"},{transaction_type:"transfer",transaction_date:p.transaction_date||todayJakarta(),source_account_id:source.account_id,destination_account_id:destination.account_id,amount,description:sanitizeText(p.reason||`Mutasi target ${goal.name}`,180),goal_id:goal.goal_id},{allowInternalLinks:true,audit:false}); const movement={goal_movement_id:uuid(),goal_id:goal.goal_id,transaction_id:transaction.transaction_id,movement_type:type,amount,reason:sanitizeText(p.reason,180),status:"active",row_version:1,created_by:context.actor.user_id,created_at:nowIso(),reversed_by:null,reversed_at:null,reversal_reason:""}; if(!movement.reason) throw appError("REASON_REQUIRED","Alasan mutasi target wajib diisi.",400); await db.execute("INSERT INTO goal_movements(goal_movement_id,goal_id,transaction_id,movement_type,amount,reason,status,row_version,created_by,created_at,reversed_by,reversed_at,reversal_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",Object.values(movement)); const response={movement:publicRow(movement),transaction,goal:{...publicRow(goal),current_amount:type==="deposit"?current+amount:current-amount}}; await appendAudit(db,context,{entityType:"goal_movement",entityId:movement.goal_movement_id,next:response}); await context.enqueueMirror?.(db,"goal",goal.goal_id); return response;};

export const reverseGoalMovement = async (db, context) => {
  const p = context.payload || {};
  const movement = await db.one(`SELECT m.*,g.scope,g.owner_user_id,g.name FROM goal_movements m JOIN savings_goals g ON g.goal_id=m.goal_id WHERE m.goal_movement_id=? AND m.status='active'`, [p.goal_movement_id]);
  if (!movement) throw appError("NOT_FOUND", "Mutasi target aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, movement);
  if (context.actor.role !== "owner" && movement.created_by !== context.actor.user_id) throw appError("FORBIDDEN", "Member hanya dapat membatalkan mutasi target yang dibuat sendiri.", 403);
  const reason = sanitizeText(p.reason, 180);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.", 400);
  const transaction = movement.transaction_id ? await db.one("SELECT * FROM transactions WHERE transaction_id=? AND status='active'", [movement.transaction_id]) : null;
  let cancelledTransaction = null;
  if (transaction) {
    await assertTransactionDateUnlocked(db, transaction.transaction_date);
    cancelledTransaction = await cancelTransactionInternal(db, context, transaction, reason, { allowLinked: true, audit: false });
  }
  const next = { ...movement, status: "reversed", row_version: Number(movement.row_version) + 1, reversed_by: context.actor.user_id, reversed_at: nowIso(), reversal_reason: reason };
  const update = await db.execute("UPDATE goal_movements SET status='reversed',row_version=?,reversed_by=?,reversed_at=?,reversal_reason=? WHERE goal_movement_id=? AND row_version=? AND status='active'", [next.row_version, next.reversed_by, next.reversed_at, next.reversal_reason, movement.goal_movement_id, movement.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Mutasi target berubah di perangkat lain.", 409);
  const goal = await db.one("SELECT * FROM savings_goals WHERE goal_id=?", [movement.goal_id]);
  const response = { movement: publicRow(next), transaction: cancelledTransaction, goal: { ...publicRow(goal), current_amount: await goalProgress(db, movement.goal_id) } };
  await appendAudit(db, context, { entityType: "goal_movement", entityId: movement.goal_movement_id, previous: publicRow(movement), next: response });
  await context.enqueueMirror?.(db, "goal", movement.goal_id);
  return response;
};
