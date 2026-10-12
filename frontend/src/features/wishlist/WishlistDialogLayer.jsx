import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { todayInJakarta } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { createWishlist, invalidateWishlist, purchaseWishlist, updateWishlist } from "./wishlist.api.js";
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
const scopeText = (scope) => scope === "shared" ? "Bersama" : "Pribadi";

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

// Loaded only when an editor, checkout, or simulation is opened.
// Keep transaction writes guarded inside their original dialogs.
const WishlistDialogLayer = ({ mode, ...props }) => {
  if (mode === "editor") return <WishlistEditor {...props} />;
  if (mode === "checkout") return <WishlistCheckout {...props} />;
  if (mode === "simulator") return <WishlistSimulator {...props} />;
  return null;
};

export default WishlistDialogLayer;
