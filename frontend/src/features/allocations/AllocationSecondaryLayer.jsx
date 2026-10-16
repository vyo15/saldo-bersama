import { FiRotateCcw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { allocationAssigneeLabel, allocationPeriodLabel } from "./allocationPresentation.js";

const AllocationHistory = ({ items }) => items.length ? <Card className="panel"><div className="panel__header"><h2>Riwayat periode</h2></div><div className="compact-list compact-list--stacked">{items.map((item) => <div key={item.envelope_period_id}><span><strong>{item.name}</strong><small>{allocationPeriodLabel(item.period_start, item.period_end)} · Untuk {allocationAssigneeLabel(item)}</small></span><span><Money value={item.allocated_amount} /><small>Terpakai <Money value={item.used_amount} /></small></span></div>)}</div></Card> : null;

const movementTitle = (item) => {
  if (item.movement_type === "allocation") return `Dana dialokasikan · ${item.envelope_name}`;
  if (item.movement_type === "fund") return `Tambah dana · ${item.envelope_name}`;
  if (item.movement_type === "release") return `Kembalikan dana · ${item.envelope_name}`;
  if (item.movement_type === "rollover") return `Bawa sisa · ${item.from_name} → ${item.to_name}`;
  return `${item.from_name} → ${item.to_name}`;
};

const movementMeta = (item) => {
  const parts = [item.reason, formatDateLongIndonesia(item.created_at) || ""].filter(Boolean);
  return parts.join(" · ");
};

const RecoveryPanels = ({ recentMovements, setReverseTarget, setReverseState }) => recentMovements.length ? <Card className="panel"><div className="panel__header"><h2>Riwayat dana</h2></div><div className="compact-list compact-list--stacked">{recentMovements.map((item) => <div key={item.movement_id}><span><strong>{movementTitle(item)}</strong><small><Money value={item.amount} />{movementMeta(item) ? ` · ${movementMeta(item)}` : ""}</small></span>{item.can_reverse ? <Button icon={FiRotateCcw} onClick={() => { setReverseTarget(item); setReverseState({ status: "idle", error: null }); }}>Batalkan</Button> : null}</div>)}</div></Card> : null;

const AllocationSecondaryLayer = ({ historicalItems, recentMovements, setReverseTarget, setReverseState }) => <>
  <AllocationHistory items={historicalItems} />
  <RecoveryPanels recentMovements={recentMovements} setReverseTarget={setReverseTarget} setReverseState={setReverseState} />
</>;

export default AllocationSecondaryLayer;
