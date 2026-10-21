import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router";
import { FiArrowRight, FiCheck, FiCheckCircle, FiChevronDown, FiEdit2, FiHeart, FiPlus, FiShoppingBag, FiArchive, FiEye, FiEyeOff, FiTarget, FiList, FiUser, FiUsers, FiSliders, FiX, FiShoppingCart } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ActionOverflowMenu from "../../components/common/ActionOverflowMenu.jsx";
import Modal from "../../components/common/Modal.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { todayInJakarta } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { changeWishlistState, invalidateWishlist, isOutcomeUnknownError, reopenWishlist } from "./wishlist.api.js";
import styles from "./WishlistPage.module.css";
import { setItemVisibility } from "../../services/visibility.js";

const WishlistDialogLayer = lazy(() => import("./WishlistDialogLayer.jsx"));

const priorityLabels = { soon: "Segera", planned: "Normal", later: "Nanti" };
const strategyLabels = { gradual: "Menabung bertahap", available: "Dari dana tersedia", combined: "Gabungan" };
const availablePlanMonths = (date) => {
  if (!date) return 0;
  const now = todayInJakarta();
  const [ty, tm] = date.split("-").map(Number);
  const [cy, cm] = now.split("-").map(Number);
  return Math.max(1, (ty - cy) * 12 + tm - cm + 1);
};
const planMonthly = (item) => {
  if (Number(item.monthly_plan) > 0) return Number(item.monthly_plan);
  const months = availablePlanMonths(item.target_date);
  return months > 0 ? Math.ceil(Number(item.estimated_amount) / months) : 0;
};
const scopeText = (scope) => scope === "shared" ? "Bersama" : "Pribadi";
const isCancelled = (item) => item.status === "purchased" && item.purchase_transaction_status === "cancelled";

const WishlistRowStatus = ({ item, busy, onActivate, onReopen }) => <>
  {planMonthly(item) > 0 && item.status === "active" ? <p className={styles.monthlySummary}>{formatRupiah(planMonthly(item))}/bulan</p> : null}
  {isCancelled(item) ? <p className={styles.warning}>Pembelian dibatalkan. Buka kembali rencana sebelum membeli ulang.</p> : null}
  {item.status === "purchased" && !isCancelled(item) ? <p className={styles.done}><FiCheckCircle aria-hidden="true" /> Dibeli · {formatRupiah(item.displayed_purchased_amount)}</p> : null}
  {item.status === "archived" ? <><p className={styles.muted}>Diarsipkan</p><button className={styles.restoreAction} type="button" disabled={busy} onClick={() => onActivate(item)}>Aktifkan lagi</button></> : null}
  {isCancelled(item) ? <button className={styles.restoreAction} type="button" disabled={busy} onClick={() => onReopen(item)}>Buka rencana lagi</button> : null}
</>;

const WishlistRowMenu = ({ item, busy, onEdit, onArchive, onVisibility }) => <ActionOverflowMenu label={`Aksi lainnya untuk ${item.name}`} className={styles.itemMenu} panelClassName={styles.menuPanel}>
  {(closeMenu) => <>
    {item.status === "active" ? <>
      <button type="button" disabled={busy} onClick={() => { closeMenu(); onEdit(item); }}><FiEdit2 aria-hidden="true" /> Edit wishlist</button>
      <button type="button" disabled={busy} onClick={() => { closeMenu(); onArchive(item); }}><FiArchive aria-hidden="true" /> Arsipkan</button>
    </> : null}
    {item.status === "purchased" ? <button type="button" disabled={busy} onClick={() => { closeMenu(); onVisibility(item, !item.is_hidden); }}>{item.is_hidden ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />} {item.is_hidden ? "Tampilkan lagi" : "Sembunyikan"}</button> : null}
    {item.product_url ? <a href={item.product_url} onClick={closeMenu} target="_blank" rel="noopener noreferrer"><FiArrowRight aria-hidden="true" /> Marketplace</a> : null}
    {item.note ? <p className={styles.menuNote}>{item.note}</p> : null}
  </>}
</ActionOverflowMenu>;

const WishlistRow = ({ item, simulationMode, selected, busy, onSelect, onBuy, onEdit, onArchive, onActivate, onReopen, onVisibility }) => <article className={styles.item}>
  {simulationMode && item.status === "active" ? <label className={styles.simIcon}>
    <input type="checkbox" checked={selected} disabled={busy} onChange={() => onSelect(item.wishlist_item_id)} aria-label={`Pilih ${item.name} untuk simulasi`} />
  </label> : <div className={styles.itemIcon} aria-hidden="true"><FiShoppingBag /></div>}
  <div className={styles.itemMain}>
    <div className={styles.itemName}><h2>{item.name}</h2><span data-priority={item.priority}>{priorityLabels[item.priority]}</span></div>
    <div className={styles.itemPurchaseRow}>
      <strong className={styles.itemPrice}>{formatRupiah(item.estimated_amount)}</strong>
      {item.status === "active" && !simulationMode ? <button type="button" className={styles.buyAction} disabled={busy} onClick={() => onBuy(item)}><FiCheck aria-hidden="true" /> Dibeli</button> : null}
    </div>
    <p className={styles.itemSubtitle}>{scopeText(item.scope)} · {item.target_date ? `Target ${item.target_date}` : !item.planning_enabled ? "Tanpa target" : strategyLabels[item.funding_strategy]}</p>
    <WishlistRowStatus item={item} busy={busy} onActivate={onActivate} onReopen={onReopen} />
  </div>
  {!simulationMode && (item.status === "active" || item.status === "purchased" || item.product_url || item.note) ? <WishlistRowMenu item={item} busy={busy} onEdit={onEdit} onArchive={onArchive} onVisibility={onVisibility} /> : null}
</article>;

const WishlistEmptyState = ({ items, active, showArchive, onReset, onShowHistory, onCreate }) => {
  const firstItem = items.length === 0;
  const historyOnly = !firstItem && active.length === 0 && !showArchive;
  const title = firstItem ? "Belum ada keinginan" : historyOnly ? "Belum ada keinginan aktif" : "Tidak ada barang pada filter ini";
  const description = firstItem ? "Catat barang yang ingin dibeli. Wishlist tidak mengurangi saldo." : historyOnly ? "Barang yang dibeli atau diarsipkan ada di riwayat." : "Coba tampilkan semua barang.";
  const action = firstItem
    ? <Button icon={FiPlus} variant="primary" onClick={onCreate}>Tambah keinginan</Button>
    : historyOnly
      ? <Button type="button" variant="primary" onClick={onShowHistory}>Lihat riwayat</Button>
      : <button type="button" className={styles.resetFilter} onClick={onReset}>Reset filter</button>;
  return <div className={styles.empty}><FiHeart aria-hidden="true" /><h2>{title}</h2><p>{description}</p>{action}</div>;
};

const WishlistBoard = ({ items, active, filtered, scope, priority, showArchive, simulationMode, selectedIds, busy, onSelect, onBuy, onEdit, onArchive, onActivate, onReopen, onVisibility, onReset, onShowHistory, onCreate }) => <section className={styles.board} aria-label="Daftar keinginan">
  <div key={`${scope}-${priority}-${showArchive}`} className={styles.resultsMotion}>
    {filtered.length === 0 ? <WishlistEmptyState items={items} active={active} showArchive={showArchive} onReset={onReset} onShowHistory={onShowHistory} onCreate={onCreate} />
      : filtered.map((item) => <WishlistRow key={item.wishlist_item_id} item={item} simulationMode={simulationMode} selected={selectedIds.includes(item.wishlist_item_id)} busy={busy} onSelect={onSelect} onBuy={onBuy} onEdit={onEdit} onArchive={onArchive} onActivate={onActivate} onReopen={onReopen} onVisibility={onVisibility} />)}
  </div>
</section>;

const WishlistControls = ({ scope, setScope, priority, setPriority, showArchive, setFilterOpen, filtered, simulationMode, setSimulationMode, exitSimulation, selected, setSelectedIds, setShowSimulator }) => <>
    <div className={styles.toolbar}>
      <div className={styles.scopeFilters} data-scope={scope} role="group" aria-label="Filter pemilik Wishlist">
        {[["all", "Semua", FiList], ["personal", "Pribadi", FiUser], ["shared", "Bersama", FiUsers]].map(([value, label, Icon]) => <button
          key={value} type="button" className={styles.scopeFilter} aria-pressed={scope === value} onClick={() => setScope(value)}>
          <span className={styles.scopeIcon}><Icon aria-hidden="true" /></span><span>{label}</span>
        </button>)}
      </div>
      <div className={`${styles.pills} ${styles.desktopPriority}`} role="group" aria-label="Filter prioritas">{[["all", "Semua prioritas"], ...Object.entries(priorityLabels)].map(([value, label]) => <button key={value} type="button" aria-pressed={priority === value} onClick={() => setPriority(value)}>{label}</button>)}</div>
      <button type="button" className={styles.mobileFilterButton} data-active={priority !== "all" || showArchive} aria-label={`Filter lanjutan Wishlist, ${priority === "all" ? "semua prioritas" : priorityLabels[priority]}${showArchive ? ", termasuk arsip dan pembelian" : ""}`} aria-haspopup="dialog" onClick={() => setFilterOpen(true)}>
        <FiSliders aria-hidden="true" />{priority !== "all" || showArchive ? <span className={styles.filterDot} aria-hidden="true" /> : null}
      </button>
    </div>
    {filtered.length || simulationMode ? <div className={styles.listTools}>
      <span>{filtered.length} keinginan{priority !== "all" ? ` · ${priorityLabels[priority]}` : ""}</span>
      {filtered.some((item) => item.status === "active") || simulationMode ? <button type="button" className={styles.simModeToggle} aria-pressed={simulationMode} onClick={() => simulationMode ? exitSimulation() : setSimulationMode(true)}>
        {simulationMode ? <FiX aria-hidden="true" /> : <FiShoppingCart aria-hidden="true" />}{simulationMode ? "Selesai" : "Simulasi belanja"}
      </button> : null}
    </div> : null}
    {simulationMode ? <div className={styles.simToolbar} role="status">
      <span>{selected.length} barang dipilih · {formatRupiah(selected.reduce((sum, item) => sum + Number(item.estimated_amount), 0))}</span>
      <div><button type="button" className={styles.clearSelection} disabled={!selected.length} onClick={() => setSelectedIds([])}>Bersihkan</button><Button type="button" variant="primary" disabled={!selected.length} onClick={() => setShowSimulator(true)}>Hitung total</Button></div>
    </div> : null}
</>;

const WishlistFilterModal = ({ priority, showArchive, onApply, onClose }) => {
  const [draftPriority, setDraftPriority] = useState(priority);
  const [draftArchive, setDraftArchive] = useState(showArchive);
  return <Modal open onClose={onClose} size="sm" title="Filter Wishlist">
    <div className={styles.filterModalContent}>
      <fieldset className={styles.priorityChoice}><legend>Prioritas</legend><div className={styles.prioritySegments}>
        {[["all", "Semua"], ...Object.entries(priorityLabels)].map(([value, label]) => <label key={value} data-active={draftPriority === value}>
          <input type="radio" name="wishlist-filter-priority" value={value} checked={draftPriority === value} onChange={() => setDraftPriority(value)} />{label}
        </label>)}
      </div></fieldset>
      <label className={styles.archivedFilter}><input type="checkbox" checked={draftArchive} onChange={(event) => setDraftArchive(event.target.checked)} /> Tampilkan arsip & pembelian</label>
      <div className={styles.filterModalActions}><button type="button" onClick={() => { setDraftPriority("all"); setDraftArchive(false); }}>Reset</button><Button variant="primary" type="button" onClick={() => onApply(draftPriority, draftArchive)}>Tampilkan hasil</Button></div>
    </div>
  </Modal>;
};

const wishlistCreateAction = (hasItems, onCreate) => hasItems
  ? <Button variant="primary" className={styles.addAction} aria-label="Tambah keinginan" icon={FiPlus} onClick={onCreate}>Tambah keinginan</Button>
  : null;

const WishlistOverview = ({ active, urgent, total, urgentTotal, done }) => {
  if (!active.length) return null;
  return <section className={styles.overview} aria-label="Ringkasan Wishlist">
    <div className={styles.overviewPrimary}><span>Estimasi keinginan</span><strong>{formatRupiah(total)}</strong></div>
    {urgent.length ? <div><span>Prioritas segera</span><strong>{formatRupiah(urgentTotal)}</strong></div> : null}
    {done > 0 ? <div className={styles.overviewCompleted}><span>Selesai dibeli</span><strong>{done}</strong></div> : null}
  </section>;
};

const WishlistFooter = ({ hasItems, showArchive, setShowArchive }) => {
  if (!hasItems) return null;
  return <>
    <label className={styles.archivedToggle}><input type="checkbox" checked={showArchive} onChange={(event) => setShowArchive(event.target.checked)} /> Tampilkan arsip & pembelian</label>
    <details className={styles.bottomInfo}><summary><FiTarget aria-hidden="true" /> Wishlist bukan saldo tersimpan <FiChevronDown aria-hidden="true" /></summary><p>Menambah keinginan tidak menyisihkan uang. Atur melalui <Link to="/perencanaan/kantong">Atur Dana</Link> atau <Link to="/target">Target</Link>. Pembelian tetap memeriksa saldo dan dana bebas.</p></details>
  </>;
};

const WishlistToolbar = ({ active, showArchive, ...props }) => active.length || showArchive ? <WishlistControls showArchive={showArchive} {...props} /> : null;

const visibleWishlistItems = (items, { showHidden, showArchive, scope, priority }) => items.filter((item) =>
  (showHidden || !item.is_hidden) && (showArchive || item.status === "active")
  && (scope === "all" || item.scope === scope) && (priority === "all" || item.priority === priority));

const WishlistHiddenToggle = ({ items, showHidden, setShowHidden, setShowArchive }) => {
  if (!items.some((item) => item.is_hidden)) return null;
  const toggle = (event) => {
    const checked = event.target.checked;
    setShowHidden(checked);
    if (checked) setShowArchive(true);
  };
  return <label className={styles.hiddenToggle}><input type="checkbox" checked={showHidden} onChange={toggle} /> Tampilkan yang disembunyikan</label>;
};

const WishlistArchiveConfirmation = ({ target, attempted, mutation, feedback, onClose, onConfirm }) => {
  const retryOnly = Boolean(target && attempted && mutation.outcomeUnknown);
  return <ConfirmationModal open={Boolean(target)} title="Arsipkan keinginan?"
    description={target ? `${target.name} akan dipindahkan ke arsip dan rencana dana tidak lagi dihitung. Kamu dapat mengaktifkannya kembali.` : ""}
    confirmLabel="Arsipkan" busy={mutation.busy} retryOnly={retryOnly}
    error={target && feedback ? new Error(feedback) : null}
    onCancel={() => { if (!mutation.busy && !retryOnly) onClose(); }} onConfirm={onConfirm} />;
};

const WishlistDialogs = ({ simulationMode, showSimulator, selected, onCloseSimulator, editor, onCloseEditor, checkout, onCloseCheckout, onSaved }) => {
  const showSimulation = simulationMode && showSimulator && selected.length > 0;
  if (!showSimulation && !editor && !checkout) return null;
  return <Suspense fallback={<LazyActionFallback surface="modal" title="Wishlist" label="Menyiapkan aksi Wishlist..." />}>
    {showSimulation ? <WishlistDialogLayer mode="simulator" items={selected} onClose={onCloseSimulator} /> : null}
    {editor ? <WishlistDialogLayer mode="editor" key={editor.wishlist_item_id || "new"} item={editor.wishlist_item_id ? editor : null} onSaved={onSaved} onClose={onCloseEditor} /> : null}
    {checkout ? <WishlistDialogLayer mode="checkout" key={checkout.wishlist_item_id} item={checkout} onSaved={onSaved} onClose={onCloseCheckout} /> : null}
  </Suspense>;
};

const WishlistPage = () => {
  const resource = useApiResource("wishlist.list");
  const mutation = useGuardedMutation();
  const [scope, setScope] = useState("all");
  const [priority, setPriority] = useState("all");
  const [editor, setEditor] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveAttempted, setArchiveAttempted] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [simulationMode, setSimulationMode] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const items = useMemo(() => resource.data?.items || [], [resource.data]);
  const active = items.filter((item) => item.status === "active" && !item.is_hidden);
  // Always derive selections from active server records; purchased/archived items cannot be simulated.
  const selected = active.filter((item) => selectedIds.includes(item.wishlist_item_id));
  const exitSimulation = () => { setSimulationMode(false); setSelectedIds([]); setShowSimulator(false); };
  const toggleSelection = (id) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((itemId) => itemId !== id) : [...previous, id]);
  const filtered = visibleWishlistItems(items, { showHidden, showArchive, scope, priority });
  const total = active.reduce((sum, item) => sum + Number(item.estimated_amount), 0);
  const urgent = active.filter((item) => item.priority === "soon");
  const urgentTotal = urgent.reduce((sum, item) => sum + Number(item.estimated_amount), 0);
  const done = items.filter((item) => item.status === "purchased" && item.purchase_transaction_status === "active").length;
  const refresh = async () => { setEditor(null); setCheckout(null); setFeedback(""); setSelectedIds([]); await resource.reload(); };
  const changeState = async (item, status) => {
    setFeedback("");
    try { await mutation.run(() => changeWishlistState({ wishlist_item_id: item.wishlist_item_id, row_version: item.row_version, status })); if (status === "archived") setArchiveTarget(null); invalidateWishlist(); await resource.reload(); setSelectedIds([]); }
    catch (error) { setFeedback(isOutcomeUnknownError(error) ? "Status perubahan belum pasti. Muat ulang sebelum mencoba lagi." : error.message); }
  };
  const toggleVisibility = async (item, hidden) => {
    setFeedback("");
    try { await mutation.run(() => setItemVisibility("wishlist_item", item.wishlist_item_id, hidden)); invalidateWishlist(); await resource.reload(); }
    catch (error) { setFeedback(isOutcomeUnknownError(error) ? "Status belum pasti. Muat ulang terlebih dahulu." : error.message); }
  };
  const restoreCancelled = async (item) => {
    setFeedback("");
    try { await mutation.run(() => reopenWishlist({ wishlist_item_id: item.wishlist_item_id, row_version: item.row_version })); invalidateWishlist(); await resource.reload(); setSelectedIds([]); }
    catch (error) { setFeedback(error.message); }
  };
  if (resource.status === "loading" && !resource.data) return <NativePageSkeleton />;
  if (resource.status === "error" && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return <div className={styles.page}>
    <PageHeader title="Wishlist" actions={wishlistCreateAction(items.length > 0, () => setEditor({}))} />
    {resource.refreshError ? <RefreshWarning error={resource.refreshError} onRetry={resource.reload} /> : null}
    {feedback ? <p className={styles.error} role="alert">{feedback}</p> : null}
    <WishlistOverview active={active} urgent={urgent} total={total} urgentTotal={urgentTotal} done={done} />
    <WishlistHiddenToggle items={items} showHidden={showHidden} setShowHidden={setShowHidden} setShowArchive={setShowArchive} />
    <WishlistToolbar active={active} scope={scope} setScope={setScope} priority={priority} setPriority={setPriority} showArchive={showArchive} setFilterOpen={setFilterOpen}
      filtered={filtered} simulationMode={simulationMode} setSimulationMode={setSimulationMode} exitSimulation={exitSimulation}
      selected={selected} setSelectedIds={setSelectedIds} setShowSimulator={setShowSimulator} />
    <WishlistBoard items={items} active={active} filtered={filtered} scope={scope} priority={priority} showArchive={showArchive} simulationMode={simulationMode}
      selectedIds={selectedIds} busy={mutation.busy} onSelect={toggleSelection} onBuy={setCheckout} onEdit={setEditor}
      onArchive={(item) => { setFeedback(""); setArchiveAttempted(false); setArchiveTarget(item); }} onActivate={(item) => changeState(item, "active")} onReopen={restoreCancelled} onVisibility={toggleVisibility}
      onReset={() => { setScope("all"); setPriority("all"); setShowArchive(false); }} onShowHistory={() => { setScope("all"); setPriority("all"); setShowArchive(true); }} onCreate={() => setEditor({})} />
    <WishlistArchiveConfirmation target={archiveTarget} attempted={archiveAttempted} mutation={mutation} feedback={feedback}
      onClose={() => { setArchiveTarget(null); setFeedback(""); }} onConfirm={() => { if (!archiveTarget) return; setArchiveAttempted(true); return changeState(archiveTarget, "archived"); }} />
    {filterOpen ? <WishlistFilterModal priority={priority} showArchive={showArchive} onClose={() => setFilterOpen(false)}
      onApply={(nextPriority, nextArchive) => { setPriority(nextPriority); setShowArchive(nextArchive); setFilterOpen(false); }} /> : null}
    <WishlistFooter hasItems={items.length > 0} showArchive={showArchive} setShowArchive={setShowArchive} />
    <WishlistDialogs simulationMode={simulationMode} showSimulator={showSimulator} selected={selected} onCloseSimulator={() => setShowSimulator(false)}
      editor={editor} onCloseEditor={() => setEditor(null)} checkout={checkout} onCloseCheckout={() => setCheckout(null)} onSaved={refresh} />
  </div>;
};
export default WishlistPage;
