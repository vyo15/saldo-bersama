import { FiArchive, FiRotateCcw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import Modal from "../../components/common/Modal.jsx";
import { allocationAssigneeLabel, allocationPeriodLabel } from "./allocationPresentation.js";
import { allocationClass } from "./allocationStyles.js";

const AllocationHistory = ({ items }) => items.length ? <Card className="panel"><div className="panel__header"><h2>Riwayat periode</h2></div><div className="compact-list compact-list--stacked">{items.map((item) => <div key={item.envelope_period_id}><span><strong>{item.name}</strong><small>{item.period_start} – {item.period_end} · Untuk {allocationAssigneeLabel(item)} · {item.status === "closed" ? "Ditutup" : item.status === "archived" ? "Diarsipkan" : item.status}</small></span><span><Money value={item.allocated_amount} /><small>Terpakai <Money value={item.used_amount} /></small></span></div>)}</div></Card> : null;

const RecoveryPanels = ({ recentMovements, setReverseTarget, setReverseState }) => recentMovements.length ? <Card className="panel"><div className="panel__header"><h2>Mutasi terakhir</h2></div><div className="compact-list compact-list--stacked">{recentMovements.map((item) => <div key={item.movement_id}><span><strong>{item.from_name} → {item.to_name}</strong><small><Money value={item.amount} /> · {item.reason}</small></span>{item.can_reverse ? <Button icon={FiRotateCcw} onClick={() => { setReverseTarget(item); setReverseState({ status: "idle", error: null }); }}>Batalkan</Button> : null}</div>)}</div></Card> : null;

const AllocationActionModal = ({ target, onClose, onClosePeriod, onLifecycle }) => <Modal open={Boolean(target)} onClose={onClose} title={target?.name || "Kelola Alokasi Dana"} description={target ? `${allocationAssigneeLabel(target)} · ${allocationPeriodLabel(target.period_start, target.period_end)}` : ""} size="sm" mobileSwipeToClose><div className={allocationClass("allocation-action-sheet")}><div className={allocationClass("allocation-action-sheet__balance")}><span>Sisa dana</span><Money value={target?.remaining_amount || 0} tone={Number(target?.remaining_amount || 0) < 0 ? "negative" : "default"} /></div><div className={allocationClass("allocation-action-sheet__actions")}>{target?.can_close ? <Button icon={FiArchive} onClick={() => onClosePeriod(target)}>Tutup periode</Button> : null}{target?.can_archive_rule ? <Button className={allocationClass("allocation-action-sheet__danger")} icon={FiArchive} onClick={() => onLifecycle(target)}>Kelola data</Button> : null}</div><p>Aksi penutupan dan arsip tetap memakai validasi serta konfirmasi yang sama seperti sebelumnya.</p></div></Modal>;

const AllocationSecondaryLayer = ({ historicalItems, recentMovements, actionTarget, onCloseAction, onClosePeriod, onLifecycle, setReverseTarget, setReverseState }) => <>
  <AllocationHistory items={historicalItems} />
  <RecoveryPanels recentMovements={recentMovements} setReverseTarget={setReverseTarget} setReverseState={setReverseState} />
  <AllocationActionModal target={actionTarget} onClose={onCloseAction} onClosePeriod={onClosePeriod} onLifecycle={onLifecycle} />
</>;

export default AllocationSecondaryLayer;
