import { FiArchive, FiRotateCcw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import Modal from "../../components/common/Modal.jsx";
import { allocationAssigneeLabel, allocationPeriodLabel } from "./allocationPresentation.js";
import { allocationClass } from "./allocationStyles.js";

const AllocationHistory = ({ items }) => items.length ? <Card className="panel"><div className="panel__header"><h2>Riwayat</h2></div><div className="compact-list compact-list--stacked">{items.map((item) => <div key={item.envelope_period_id}><span><strong>{item.name}</strong><small>{allocationPeriodLabel(item.period_start, item.period_end)} · Untuk {allocationAssigneeLabel(item)}</small></span><span><Money value={item.allocated_amount} /><small>Terpakai <Money value={item.used_amount} /></small></span></div>)}</div></Card> : null;

const movementTitle = (item) => {
  if (item.movement_type === "fund") return `Tambah dana · ${item.envelope_name}`;
  if (item.movement_type === "release") return `Kembalikan dana · ${item.envelope_name}`;
  return `${item.from_name} → ${item.to_name}`;
};

const RecoveryPanels = ({ recentMovements, setReverseTarget, setReverseState }) => recentMovements.length ? <Card className="panel"><div className="panel__header"><h2>Aktivitas dana terakhir</h2></div><div className="compact-list compact-list--stacked">{recentMovements.map((item) => <div key={item.movement_id}><span><strong>{movementTitle(item)}</strong><small><Money value={item.amount} /> · {item.reason}</small></span>{item.can_reverse ? <Button icon={FiRotateCcw} onClick={() => { setReverseTarget(item); setReverseState({ status: "idle", error: null }); }}>Batalkan</Button> : null}</div>)}</div></Card> : null;

const AllocationActionModal = ({ target, onClose, onLifecycle }) => <Modal open={Boolean(target)} onClose={onClose} title={target?.name || "Kelola Alokasi Dana"} description={target ? `${allocationAssigneeLabel(target)} · ${allocationPeriodLabel(target.period_start, target.period_end)}` : ""} size="sm" mobileSwipeToClose><div className={allocationClass("allocation-action-sheet")}><div className={allocationClass("allocation-action-sheet__balance")}><span>Masih tersedia</span><Money value={target?.remaining_amount || 0} tone={Number(target?.remaining_amount || 0) < 0 ? "negative" : "default"} /></div><div className={allocationClass("allocation-action-sheet__actions")}>{target?.can_archive_rule ? <Button className={allocationClass("allocation-action-sheet__danger")} icon={FiArchive} onClick={() => onLifecycle(target)}>Kelola status</Button> : null}</div><p>Transaksi dan riwayat yang sudah terjadi tetap dipertahankan agar saldo masa lalu tidak berubah.</p></div></Modal>;

const AllocationSecondaryLayer = ({ historicalItems, recentMovements, actionTarget, onCloseAction, onLifecycle, setReverseTarget, setReverseState }) => <>
  <AllocationHistory items={historicalItems} />
  <RecoveryPanels recentMovements={recentMovements} setReverseTarget={setReverseTarget} setReverseState={setReverseState} />
  <AllocationActionModal target={actionTarget} onClose={onCloseAction} onLifecycle={onLifecycle} />
</>;

export default AllocationSecondaryLayer;
