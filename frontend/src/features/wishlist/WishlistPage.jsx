import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FiArrowRight, FiCheck, FiCheckCircle, FiChevronDown, FiEdit2, FiHeart, FiMoreHorizontal, FiPlus, FiShoppingBag, FiTrash2, FiTarget, FiList, FiUser, FiUsers, FiSliders, FiX, FiShoppingCart } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { todayInJakarta } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { changeWishlistState, createWishlist, invalidateWishlist, isOutcomeUnknownError, purchaseWishlist, reopenWishlist, updateWishlist } from "./wishlist.api.js";
import styles from "./WishlistPage.module.css";

const priorityLabels = { soon: "Segera", planned: "Normal", later: "Nanti" };
const strategyLabels = { gradual: "Menabung bertahap", available: "Dari dana tersedia", combined: "Gabungan" };
const emptyForm = () => ({ scope: "personal", name: "", estimated_amount: "", priority: "planned", funding_strategy: "gradual", planning_enabled: 0, target_date: "", monthly_plan: "", product_url: "", note: "" });
const selectionOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
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

const WishlistItemFields = ({ item, form, set }) => {
  const [showDetails, setShowDetails] = useState(Boolean(form.product_url || form.note));
  return <>
    {!item ? <fieldset className={styles.scopeChoice}>
      <legend>Wishlist untuk</legend>
      <div className={styles.segmentedScope}>
        {[["personal", "Pribadi"], ["shared", "Bersama"]].map(([value, label]) => <label key={value} data-active={form.scope === value}>
          <input type="radio" name="wishlist-scope" value={value} checked={form.scope === value} onChange={() => set("scope", value)} />{label}
        </label>)}
      </div>
    </fieldset> : <p className={styles.ownerLabel}>Wishlist {scopeText(item.scope)}</p>}
    <label className="field"><span>Nama barang *</span><input maxLength={120} required value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Contoh: Monitor 27 inci" /></label>
    <MoneyInput id="wish-price" label="Perkiraan harga" value={form.estimated_amount} required onChange={(value) => set("estimated_amount", value)} />
    <button type="button" className={styles.expandToggle} aria-expanded={showDetails} aria-controls="wishlist-item-extra" onClick={() => setShowDetails((value) => !value)}>
      <span>Detail tambahan {form.product_url || form.note ? <small>· Terisi</small> : null}</span><FiChevronDown aria-hidden="true" />
    </button>
    {showDetails ? <div className={styles.extraFields} id="wishlist-item-extra">
      <label className="field"><span>Link marketplace (HTTPS)</span><input type="url" pattern="https://.*" maxLength={1200} value={form.product_url} placeholder="https://..." onChange={(event) => set("product_url", event.target.value)} /></label>
      <label className="field"><span>Catatan</span><input maxLength={400} value={form.note} onChange={(event) => set("note", event.target.value)} placeholder="Ukuran, warna, spesifikasi..." /></label>
    </div> : null}
  </>;
};

const WishlistPlanFields = ({ form, set, showSuggestion, setShowSuggestion, urgency, setUrgency, impact, setImpact, recommendedPriority, priorityReason }) => {
  const hasTarget = Boolean(form.planning_enabled);
  const [advanced, setAdvanced] = useState(Boolean(form.monthly_plan || ["available", "combined"].includes(form.funding_strategy)));
  const toggleTarget = (enabled) => {
    set("planning_enabled", enabled ? 1 : 0);
    // Turning off the plan removes stale scheduling data when the form is saved.
    if (!enabled) { set("funding_strategy", "gradual"); set("target_date", ""); set("monthly_plan", ""); }
  };
  return <>
    <div className={styles.planAmount}><span>Perkiraan harga</span><strong>{formatRupiah(Number(form.estimated_amount || 0))}</strong></div>
    <fieldset className={styles.priorityChoice}>
      <legend>Prioritas</legend>
      <div className={styles.prioritySegments}>
        {Object.entries(priorityLabels).map(([value, label]) => <label key={value} data-active={form.priority === value}>
          <input type="radio" name="wishlist-priority" value={value} checked={form.priority === value} onChange={() => set("priority", value)} />{label}
        </label>)}
      </div>
    </fieldset>
    <button className={styles.adviceToggle} type="button" aria-expanded={showSuggestion} onClick={() => setShowSuggestion((value) => !value)}>Bantu pilih prioritas <FiChevronDown aria-hidden="true" /></button>
    {showSuggestion ? <div className={styles.priorityAdvisor}>
      <div className={styles.formTwo}>
        <SelectionField label="Kapan diperlukan?" value={urgency} onChange={setUrgency} options={[{ value: "soon", label: "Dalam waktu dekat" }, { value: "flexible", label: "Fleksibel" }]} />
        <SelectionField label="Seberapa penting?" value={impact} onChange={setImpact} options={[{ value: "important", label: "Penting untuk aktivitas" }, { value: "useful", label: "Bermanfaat, bisa ditunda" }, { value: "optional", label: "Keinginan" }]} />
      </div>
      <p>Saran: <strong>{priorityLabels[recommendedPriority]}</strong>. {priorityReason}</p>
      <Button type="button" onClick={() => set("priority", recommendedPriority)}>Gunakan saran</Button>
    </div> : null}
    <div className={styles.targetHeader}>
      <span><strong>Target pembelian</strong><small>Opsional · bisa diatur nanti</small></span>
      <label className={styles.targetSwitch}>
        <input type="checkbox" checked={hasTarget} onChange={(event) => toggleTarget(event.target.checked)} aria-label="Aktifkan target pembelian" />
        <span aria-hidden="true" />
      </label>
    </div>
    {hasTarget ? <div className={styles.targetFields}>
      <label className="field"><span>Target tanggal{form.funding_strategy !== "available" ? " *" : ""}</span><TemporalInput type="date" min={todayInJakarta()} value={form.target_date} onChange={(event) => set("target_date", event.target.value)} /></label>
      {form.target_date && !Number(form.monthly_plan) ? <p className={styles.targetEstimate}>Estimasi {formatRupiah(Math.ceil(Number(form.estimated_amount || 0) / availablePlanMonths(form.target_date)))}/bulan</p> : null}
      <button className={styles.expandToggle} type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>Pengaturan dana lanjutan <FiChevronDown aria-hidden="true" /></button>
      {advanced ? <div className={styles.extraFields}>
        <SelectionField label="Cara menyiapkan dana" value={form.funding_strategy} onChange={(value) => { set("funding_strategy", value); if (value === "available") set("monthly_plan", ""); }} options={selectionOptions({ gradual: strategyLabels.gradual, available: strategyLabels.available, combined: strategyLabels.combined })} />
        {form.funding_strategy !== "available" ? <MoneyInput id="wish-monthly" label="Tabungan per bulan" value={form.monthly_plan} onChange={(value) => set("monthly_plan", value)} /> : null}
      </div> : null}
    </div> : null}
  </>;
};

const recommendedPriorityFor = (urgency, impact) => urgency === "soon" && impact === "important" ? "soon" : urgency === "flexible" && impact === "optional" ? "later" : "planned";
const priorityExplanation = (priority) => ({
  soon: "Barang penting dan dibutuhkan segera.",
  planned: "Rencanakan secara bertahap sambil menjaga kebutuhan utama.",
  later: "Kebutuhan fleksibel dan manfaatnya opsional; tidak mendesak.",
})[priority];

const WishlistEditor = ({ item, onClose, onSaved }) => {
  const [step, setStep] = useState(1);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [urgency, setUrgency] = useState("flexible");
  const [impact, setImpact] = useState("useful");
  const [form, setForm] = useState(() => item ? { ...item, estimated_amount: String(item.estimated_amount), monthly_plan: String(item.monthly_plan || ""), target_date: item.target_date || "" } : emptyForm());
  const [error, setError] = useState("");
  const mutation = useGuardedMutation();
  const recommendedPriority = recommendedPriorityFor(urgency, impact);
  const priorityReason = priorityExplanation(recommendedPriority);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const next = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !Number.isSafeInteger(Number(form.estimated_amount)) || !(Number(form.estimated_amount) > 0)) return setError("Isi nama barang dan perkiraan harga yang valid.");
    if (form.product_url.trim()) {
      try {
        const url = new URL(form.product_url.trim());
        if (url.protocol !== "https:" || url.username || url.password || !url.hostname) throw new Error("invalid");
      } catch { return setError("Link marketplace harus HTTPS. Periksa Detail tambahan."); }
    }
    setError(""); setStep(2);
  };
  const save = async (event) => {
    event.preventDefault();
    if (form.planning_enabled && ["gradual", "combined"].includes(form.funding_strategy) && !form.target_date && !(Number(form.monthly_plan) > 0)) {
      setError("Pilih tanggal target, atau isi tabungan bulanan di pengaturan lanjutan."); return;
    }
    setError("");
    try {
      await mutation.run(() => item
        ? updateWishlist({ ...form, wishlist_item_id: item.wishlist_item_id, row_version: item.row_version, estimated_amount: Number(form.estimated_amount), monthly_plan: Number(form.monthly_plan || 0) })
        : createWishlist({ ...form, estimated_amount: Number(form.estimated_amount), monthly_plan: Number(form.monthly_plan || 0) }));
      invalidateWishlist(); await onSaved();
    } catch (failure) { setError(failure.message); }
  };
  return <Modal open onClose={mutation.busy || mutation.outcomeUnknown ? undefined : onClose} title={item ? "Edit keinginan" : "Tambah keinginan"} description={`Langkah ${step} dari 2 · ${step === 1 ? "Detail barang" : "Prioritas & target"}`} size="md">
    <form className={styles.editor} onSubmit={step === 1 ? next : save}>
      {step === 1 ? <WishlistItemFields item={item} form={form} set={set} /> : <WishlistPlanFields form={form} set={set} showSuggestion={showSuggestion} setShowSuggestion={setShowSuggestion} urgency={urgency} setUrgency={setUrgency} impact={impact} setImpact={setImpact} recommendedPriority={recommendedPriority} priorityReason={priorityReason} />}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {mutation.outcomeUnknown ? <p className={styles.error} role="alert">Hasil penyimpanan belum dapat dipastikan. Periksa Wishlist setelah koneksi pulih, jangan membuat ulang barang yang sama.</p> : null}
      <div className={styles.editorActions}>{step === 2 ? <Button type="button" disabled={mutation.busy || mutation.outcomeUnknown} onClick={() => { setStep(1); setError(""); }}>Kembali</Button> : null}<Button type="submit" variant="primary" disabled={mutation.outcomeUnknown} loading={mutation.busy}>{step === 1 ? "Lanjut" : item ? "Simpan perubahan" : "Simpan wishlist"}</Button></div>
    </form>
  </Modal>;
};

const WishlistCheckout = ({ item, onClose, onSaved }) => {
  const accounts = useApiResource("accounts.list");
  const categories = useApiResource("categories.list");
  const mutation = useGuardedMutation();
  const [amount, setAmount] = useState(item.estimated_amount);
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayInJakarta());
  const [merchant, setMerchant] = useState("");
  const [error, setError] = useState("");
  const total = Number(amount || 0) + Number(shipping || 0) - Number(discount || 0);
  const visibleAccounts = (accounts.data?.items || []).filter((account) => account.status === "active" && account.account_type !== "investment" && (account.owner_scope === item.scope) && (item.scope === "shared" || account.owner_user_id === item.owner_user_id));
  const expenseCategories = (categories.data?.items || []).filter((category) => category.transaction_type === "expense");
  const submit = async (event) => {
    event.preventDefault();
    if (!Number.isSafeInteger(total) || total <= 0 || !accountId || !categoryId) { setError("Total pembayaran harus positif, pilih rekening dan kategori."); return; }
    setError("");
    try {
      await mutation.run(() => purchaseWishlist({ wishlist_item_id: item.wishlist_item_id, row_version: item.row_version, amount: total, transaction_date: transactionDate, source_account_id: accountId, category_id: categoryId, merchant }));
      invalidateWishlist(); await onSaved();
    } catch (failure) { setError(failure.message); }
  };
  return <Modal open onClose={mutation.busy || mutation.outcomeUnknown ? undefined : onClose} size="md" title={`Catat pembelian · ${item.name}`} description="Satu transaksi pengeluaran canonical; belum ada perubahan saldo sebelum disimpan.">
    <form className={styles.editor} onSubmit={submit}>
      <MoneyInput id="wish-actual" value={amount} label="Harga barang aktual" required onChange={setAmount} />
      <div className={styles.formTwo}><MoneyInput id="wish-shipping" value={shipping} label="Ongkir" onChange={setShipping} /><MoneyInput id="wish-discount" value={discount} label="Diskon" onChange={setDiscount} /></div>
      <div className={styles.planInfo}><span>Total pembayaran</span><strong>{formatRupiah(total)}</strong><small>{total - item.estimated_amount === 0 ? "Sesuai estimasi" : `Selisih dari estimasi: ${formatRupiah(total - item.estimated_amount)}`}</small></div>
      <SelectionField label="Rekening pembayaran" required placeholder="Pilih rekening" value={accountId} onChange={setAccountId} options={visibleAccounts.map((a) => ({ value: a.account_id, label: a.name }))} />
      <SelectionField label="Kategori pengeluaran" required placeholder="Pilih kategori" value={categoryId} onChange={setCategoryId} options={expenseCategories.map((c) => ({ value: c.category_id, label: c.name }))} />
      <div className={styles.formTwo}><label className="field"><span>Tanggal</span><TemporalInput type="date" required value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></label><label className="field"><span>Marketplace (opsional)</span><input maxLength={120} value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Shopee, Tokopedia..." /></label></div>
      <p className={styles.muted}>Saldo dan dana bebas tetap divalidasi server, termasuk pengalokasian yang sudah ada. Pembelian tidak akan dicatat jika validasi gagal.</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {mutation.outcomeUnknown ? <p className={styles.error} role="alert">Status transaksi belum pasti. Jangan mencatat ulang; periksa riwayat transaksi dan muat ulang halaman.</p> : null}
      <div className={styles.editorActions}><Button type="button" disabled={mutation.busy || mutation.outcomeUnknown} onClick={onClose}>Batal</Button><Button variant="primary" type="submit" loading={mutation.busy} disabled={mutation.outcomeUnknown || !visibleAccounts.length || !expenseCategories.length}>Catat transaksi</Button></div>
    </form>
  </Modal>;
};

const WishlistSimulator = ({ items, onClose }) => {
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const estimated = items.reduce((sum, item) => sum + Number(item.estimated_amount), 0);
  const total = estimated + Number(shipping || 0) - Number(discount || 0);
  return <Modal open onClose={onClose} title="Simulasi keranjang" description="Gabungkan perkiraan beberapa barang sebelum menentukan pembelian." size="md">
    <div className={styles.editor}>
      <div className={styles.simItems}>{items.map((item) => <div key={item.wishlist_item_id}><span>{item.name}</span><strong>{formatRupiah(item.estimated_amount)}</strong></div>)}</div>
      <div className={styles.formTwo}><MoneyInput id="wishlist-sim-shipping" label="Total ongkir" value={shipping} onChange={setShipping} /><MoneyInput id="wishlist-sim-discount" label="Total diskon/voucher" value={discount} onChange={setDiscount} /></div>
      <div className={styles.planInfo}><span>Kebutuhan dana untuk {items.length} barang</span><strong>{total > 0 && Number.isSafeInteger(total) ? formatRupiah(total) : "—"}</strong><small>Estimasi saja, belum mengalokasikan uang atau membuat transaksi. Diskon tidak boleh melebihi harga barang + ongkir.</small></div>
      <p className={styles.muted}>Untuk mencatat pembayaran nyata, buka barang yang dibeli dan pilih “Dibeli”. Checkout beberapa barang sekaligus belum tersedia agar tidak membuat transaksi ganda.</p>
      <div className={styles.editorActions}><Button type="button" variant="primary" onClick={onClose}>Selesai</Button></div>
    </div>
  </Modal>;
};

const WishlistRowStatus = ({ item, busy, onActivate, onReopen }) => <>
  {planMonthly(item) > 0 && item.status === "active" ? <p className={styles.monthlySummary}>{formatRupiah(planMonthly(item))}/bulan</p> : null}
  {isCancelled(item) ? <p className={styles.warning}>Pembelian dibatalkan. Buka kembali rencana sebelum membeli ulang.</p> : null}
  {item.status === "purchased" && !isCancelled(item) ? <p className={styles.done}><FiCheckCircle aria-hidden="true" /> Dibeli · {formatRupiah(item.displayed_purchased_amount)}</p> : null}
  {item.status === "archived" ? <><p className={styles.muted}>Diarsipkan</p><button className={styles.restoreAction} type="button" disabled={busy} onClick={() => onActivate(item)}>Aktifkan lagi</button></> : null}
  {isCancelled(item) ? <button className={styles.restoreAction} type="button" disabled={busy} onClick={() => onReopen(item)}>Buka rencana lagi</button> : null}
</>;

const WishlistRowMenu = ({ item, busy, onEdit, onArchive }) => <details className={styles.itemMenu}>
  <summary aria-label={`Aksi lainnya untuk ${item.name}`}><FiMoreHorizontal aria-hidden="true" /></summary>
  <div className={styles.menuPanel}>
    {item.status === "active" ? <><button type="button" disabled={busy} onClick={() => onEdit(item)}><FiEdit2 aria-hidden="true" /> Edit wishlist</button><button type="button" disabled={busy} onClick={() => onArchive(item)}><FiTrash2 aria-hidden="true" /> Arsipkan</button></> : null}
    {item.product_url ? <a href={item.product_url} target="_blank" rel="noopener noreferrer"><FiArrowRight aria-hidden="true" /> Marketplace</a> : null}
    {item.note ? <p className={styles.menuNote}>{item.note}</p> : null}
  </div>
</details>;

const WishlistRow = ({ item, simulationMode, selected, busy, onSelect, onBuy, onEdit, onArchive, onActivate, onReopen }) => <article className={styles.item}>
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
  {!simulationMode && (item.status === "active" || item.product_url || item.note) ? <WishlistRowMenu item={item} busy={busy} onEdit={onEdit} onArchive={onArchive} /> : null}
</article>;

const WishlistBoard = ({ items, filtered, scope, priority, showArchive, simulationMode, selectedIds, busy, onSelect, onBuy, onEdit, onArchive, onActivate, onReopen, onReset, onCreate }) => <section className={styles.board} aria-label="Daftar keinginan">
  <div key={`${scope}-${priority}-${showArchive}`} className={styles.resultsMotion}>
    {filtered.length === 0 ? <div className={styles.empty}><FiHeart aria-hidden="true" /><h2>{items.length ? "Tidak ada barang pada filter ini" : "Belum ada keinginan"}</h2><p>{items.length ? "Coba ubah pemilik atau filter prioritas." : "Tambahkan barang yang ingin dibeli. Target dana bisa diatur nanti."}</p>{items.length ? <button type="button" className={styles.resetFilter} onClick={onReset}>Reset filter</button> : <Button icon={FiPlus} variant="primary" onClick={onCreate}>Tambah Wishlist</Button>}</div>
      : filtered.map((item) => <WishlistRow key={item.wishlist_item_id} item={item} simulationMode={simulationMode} selected={selectedIds.includes(item.wishlist_item_id)} busy={busy} onSelect={onSelect} onBuy={onBuy} onEdit={onEdit} onArchive={onArchive} onActivate={onActivate} onReopen={onReopen} />)}
  </div>
</section>;

const WishlistControls = ({ scope, setScope, priority, setPriority, showArchive, setFilterOpen, active, filtered, simulationMode, setSimulationMode, exitSimulation, selected, setSelectedIds, setShowSimulator }) => <>
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
    <div className={styles.listTools}>
      <span>{filtered.length} keinginan{priority !== "all" ? ` · ${priorityLabels[priority]}` : ""}</span>
      {active.length > 0 || simulationMode ? <button type="button" className={styles.simModeToggle} aria-pressed={simulationMode} onClick={() => simulationMode ? exitSimulation() : setSimulationMode(true)}>
        {simulationMode ? <FiX aria-hidden="true" /> : <FiShoppingCart aria-hidden="true" />}{simulationMode ? "Selesai" : "Simulasi belanja"}
      </button> : null}
    </div>
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

const WishlistPage = () => {
  const resource = useApiResource("wishlist.list");
  const mutation = useGuardedMutation();
  const [scope, setScope] = useState("all");
  const [priority, setPriority] = useState("all");
  const [editor, setEditor] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [simulationMode, setSimulationMode] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const items = useMemo(() => resource.data?.items || [], [resource.data]);
  const active = items.filter((item) => item.status === "active");
  // Always derive selections from active server records; purchased/archived items cannot be simulated.
  const selected = active.filter((item) => selectedIds.includes(item.wishlist_item_id));
  const exitSimulation = () => { setSimulationMode(false); setSelectedIds([]); setShowSimulator(false); };
  const toggleSelection = (id) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((itemId) => itemId !== id) : [...previous, id]);
  const filtered = items.filter((item) => (showArchive || item.status === "active") && (scope === "all" || item.scope === scope) && (priority === "all" || item.priority === priority));
  const total = active.reduce((sum, item) => sum + Number(item.estimated_amount), 0);
  const urgent = active.filter((item) => item.priority === "soon");
  const urgentTotal = urgent.reduce((sum, item) => sum + Number(item.estimated_amount), 0);
  const done = items.filter((item) => item.status === "purchased" && item.purchase_transaction_status === "active").length;
  const refresh = async () => { setEditor(null); setCheckout(null); setFeedback(""); setSelectedIds([]); await resource.reload(); };
  const changeState = async (item, status) => {
    if (!window.confirm(status === "archived" ? `Arsipkan ${item.name}? Rencana dana tidak akan lagi dihitung.` : `Aktifkan kembali ${item.name}?`)) return;
    setFeedback("");
    try { await mutation.run(() => changeWishlistState({ wishlist_item_id: item.wishlist_item_id, row_version: item.row_version, status })); invalidateWishlist(); await resource.reload(); setSelectedIds([]); }
    catch (error) { setFeedback(isOutcomeUnknownError(error) ? "Status perubahan belum pasti. Muat ulang sebelum mencoba lagi." : error.message); }
  };
  const restoreCancelled = async (item) => {
    setFeedback("");
    try { await mutation.run(() => reopenWishlist({ wishlist_item_id: item.wishlist_item_id, row_version: item.row_version })); invalidateWishlist(); await resource.reload(); setSelectedIds([]); }
    catch (error) { setFeedback(error.message); }
  };
  if (resource.status === "loading" && !resource.data) return <NativePageSkeleton />;
  if (resource.status === "error" && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return <div className={styles.page}>
    <PageHeader eyebrow="Rencana & Insight" title="Wishlist" description="Catat keinginan dan atur prioritasnya." actions={<Button variant="primary" className={styles.addAction} aria-label="Tambah keinginan" icon={FiPlus} onClick={() => setEditor({})}>Tambah keinginan</Button>} />
    {resource.refreshError ? <RefreshWarning error={resource.refreshError} onRetry={resource.reload} /> : null}
    {feedback ? <p className={styles.error} role="alert">{feedback}</p> : null}
    <section className={styles.overview} aria-label="Ringkasan Wishlist">
      <div className={styles.overviewPrimary}><span>Total rencana aktif</span><strong>{formatRupiah(total)}</strong><small>{active.length} keinginan aktif</small></div>
      <div><span>Prioritas segera</span><strong>{formatRupiah(urgentTotal)}</strong><small>{urgent.length} barang</small></div>
      <div><span>Selesai dibeli</span><strong>{done}</strong><small>Dicatat sebagai transaksi</small></div>
    </section>
    <WishlistControls scope={scope} setScope={setScope} priority={priority} setPriority={setPriority} showArchive={showArchive} setFilterOpen={setFilterOpen}
      active={active} filtered={filtered} simulationMode={simulationMode} setSimulationMode={setSimulationMode} exitSimulation={exitSimulation}
      selected={selected} setSelectedIds={setSelectedIds} setShowSimulator={setShowSimulator} />
    <WishlistBoard items={items} filtered={filtered} scope={scope} priority={priority} showArchive={showArchive} simulationMode={simulationMode}
      selectedIds={selectedIds} busy={mutation.busy} onSelect={toggleSelection} onBuy={setCheckout} onEdit={setEditor}
      onArchive={(item) => changeState(item, "archived")} onActivate={(item) => changeState(item, "active")} onReopen={restoreCancelled}
      onReset={() => { setScope("all"); setPriority("all"); setShowArchive(false); }} onCreate={() => setEditor({})} />
    {filterOpen ? <WishlistFilterModal priority={priority} showArchive={showArchive} onClose={() => setFilterOpen(false)}
      onApply={(nextPriority, nextArchive) => { setPriority(nextPriority); setShowArchive(nextArchive); setFilterOpen(false); }} /> : null}
    <label className={styles.archivedToggle}><input type="checkbox" checked={showArchive} onChange={(event) => setShowArchive(event.target.checked)} /> Tampilkan arsip & pembelian</label>
    <details className={styles.bottomInfo}><summary><FiTarget aria-hidden="true" /> Wishlist bukan saldo tersimpan <FiChevronDown aria-hidden="true" /></summary><p>Menambah keinginan tidak menyisihkan uang. Atur melalui <Link to="/perencanaan/kantong">Atur Dana</Link> atau <Link to="/target">Target</Link>. Pembelian tetap memeriksa saldo dan dana bebas.</p></details>
    {simulationMode && showSimulator && selected.length ? <WishlistSimulator items={selected} onClose={() => setShowSimulator(false)} /> : null}
    {editor ? <WishlistEditor key={editor.wishlist_item_id || "new"} item={editor.wishlist_item_id ? editor : null} onSaved={refresh} onClose={() => setEditor(null)} /> : null}
    {checkout ? <WishlistCheckout key={checkout.wishlist_item_id} item={checkout} onSaved={refresh} onClose={() => setCheckout(null)} /> : null}
  </div>;
};
export default WishlistPage;
