import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FiArrowRight, FiCheck, FiCheckCircle, FiEdit2, FiHeart, FiPlus, FiShoppingBag, FiTrash2, FiUsers, FiTarget } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField, { SelectionControl } from "../../components/common/SelectionField.jsx";
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

const priorityLabels = { soon: "Segera", planned: "Direncanakan", later: "Nanti" };
const strategyLabels = { gradual: "Menabung bertahap", available: "Dari dana tersedia", combined: "Gabungan" };
const emptyForm = () => ({ scope: "personal", name: "", estimated_amount: "", priority: "planned", funding_strategy: "gradual", target_date: "", monthly_plan: "", product_url: "", note: "" });
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

const WishlistItemFields = ({ item, form, set }) => <>
        {!item ? <fieldset className={styles.scopeChoice}><legend>Wishlist untuk</legend><label><input type="radio" name="scope" checked={form.scope === "personal"} onChange={() => set("scope", "personal")} /> Pribadi</label><label><input type="radio" name="scope" checked={form.scope === "shared"} onChange={() => set("scope", "shared")} /> Bersama</label></fieldset> : <p className={styles.muted}>Pemilik: {scopeText(item.scope)}</p>}
        <label className="field"><span>Nama barang *</span><input maxLength={120} required value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Contoh: Sepatu kerja" autoFocus /></label>
        <MoneyInput id="wish-price" label="Perkiraan harga *" value={form.estimated_amount} required onChange={(value) => set("estimated_amount", value)} />
        <label className="field"><span>Link marketplace (opsional, HTTPS)</span><input type="url" pattern="https://.*" maxLength={1200} value={form.product_url} placeholder="https://..." onChange={(event) => set("product_url", event.target.value)} /></label>
        <label className="field"><span>Catatan (opsional)</span><input maxLength={400} value={form.note} onChange={(event) => set("note", event.target.value)} placeholder="Ukuran, warna, atau alasan membeli" /></label>
</>;

const WishlistPlanFields = ({ form, set, showSuggestion, setShowSuggestion, urgency, setUrgency, impact, setImpact, recommendedPriority, priorityReason }) => <>
        <div className={styles.planInfo}><span>Yang ingin disiapkan</span><strong>{formatRupiah(Number(form.estimated_amount || 0))}</strong><small>Membuat rencana belum mengurangi saldo atau mengikat dana.</small></div>
        <SelectionField label="Prioritas" value={form.priority} onChange={(value) => set("priority", value)} options={selectionOptions(priorityLabels)} />
        <button className={styles.adviceToggle} type="button" aria-expanded={showSuggestion} onClick={() => setShowSuggestion((current) => !current)}>Bantu tentukan prioritas (opsional) <FiArrowRight aria-hidden="true" /></button>
        {showSuggestion ? <div className={styles.priorityAdvisor}>
          <div className={styles.formTwo}>
            <SelectionField label="Kapan barang diperlukan?" value={urgency} onChange={setUrgency} options={[{ value: "soon", label: "Dalam waktu dekat" }, { value: "flexible", label: "Waktunya fleksibel" }]} />
            <SelectionField label="Seberapa penting?" value={impact} onChange={setImpact} options={[{ value: "important", label: "Penting untuk aktivitas" }, { value: "useful", label: "Bermanfaat, bisa ditunda" }, { value: "optional", label: "Lebih ke keinginan" }]} />
          </div>
          <p>Saran: <strong>{priorityLabels[recommendedPriority]}</strong>. {priorityReason} Pilihan tetap di tangan Anda.</p>
          <Button type="button" onClick={() => set("priority", recommendedPriority)}>Gunakan saran</Button>
        </div> : null}
        <SelectionField label="Cara menyiapkan dana" value={form.funding_strategy} onChange={(value) => set("funding_strategy", value)} options={selectionOptions(strategyLabels)} />
        {form.funding_strategy !== "available" ? <>
          <label className="field"><span>Target tanggal (opsional jika dana per bulan terisi)</span><TemporalInput type="date" min={todayInJakarta()} value={form.target_date} onChange={(event) => set("target_date", event.target.value)} /></label>
          <MoneyInput id="wish-monthly" label="Rencana dana per bulan (opsional jika tanggal diisi)" value={form.monthly_plan} onChange={(value) => set("monthly_plan", value)} />
          {form.target_date && !Number(form.monthly_plan) ? <p className={styles.muted}>Perkiraan kebutuhan: {formatRupiah(Math.ceil(Number(form.estimated_amount || 0) / availablePlanMonths(form.target_date)))} per bulan.</p> : null}
        </> : <p className={styles.muted}>Dana baru benar-benar digunakan saat transaksi pembelian dikonfirmasi. Periksa dana bebas rekening di Atur Dana.</p>}
</>;

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
    if (!form.name.trim() || !(Number(form.estimated_amount) > 0)) return setError("Isi nama barang dan perkiraan harga lebih dari Rp0.");
    setError(""); setStep(2);
  };
  const save = async (event) => {
    event.preventDefault();
    if (["gradual", "combined"].includes(form.funding_strategy) && !form.target_date && !(Number(form.monthly_plan) > 0)) {
      setError("Isi target tanggal atau nominal bulanan untuk rencana bertahap."); return;
    }
    setError("");
    try {
      await mutation.run(() => item
        ? updateWishlist({ ...form, wishlist_item_id: item.wishlist_item_id, row_version: item.row_version, estimated_amount: Number(form.estimated_amount), monthly_plan: Number(form.monthly_plan || 0) })
        : createWishlist({ ...form, estimated_amount: Number(form.estimated_amount), monthly_plan: Number(form.monthly_plan || 0) }));
      invalidateWishlist(); await onSaved();
    } catch (failure) { setError(failure.message); }
  };
  return <Modal open onClose={mutation.busy || mutation.outcomeUnknown ? undefined : onClose} title={item ? "Edit keinginan" : "Tambah keinginan"} description={`Langkah ${step} dari 2 · ${step === 1 ? "Barang" : "Rencana dana"}`} size="md">
    <form className={styles.editor} onSubmit={step === 1 ? next : save}>
      {step === 1 ? <WishlistItemFields item={item} form={form} set={set} /> : <WishlistPlanFields form={form} set={set} showSuggestion={showSuggestion} setShowSuggestion={setShowSuggestion} urgency={urgency} setUrgency={setUrgency} impact={impact} setImpact={setImpact} recommendedPriority={recommendedPriority} priorityReason={priorityReason} />}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {mutation.outcomeUnknown ? <p className={styles.error} role="alert">Hasil penyimpanan belum dapat dipastikan. Periksa Wishlist setelah koneksi pulih, jangan membuat ulang barang yang sama.</p> : null}
      <div className={styles.editorActions}>{step === 2 ? <Button type="button" disabled={mutation.busy || mutation.outcomeUnknown} onClick={() => { setStep(1); setError(""); }}>Kembali</Button> : null}<Button type="submit" variant="primary" disabled={mutation.outcomeUnknown} loading={mutation.busy}>{step === 1 ? "Lanjut" : item ? "Simpan perubahan" : "Simpan rencana"}</Button></div>
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
  const [showSimulator, setShowSimulator] = useState(false);
  const items = useMemo(() => resource.data?.items || [], [resource.data]);
  const active = items.filter((item) => item.status === "active");
  const selected = active.filter((item) => selectedIds.includes(item.wishlist_item_id));
  const toggleSelection = (id) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((itemId) => itemId !== id) : [...previous, id]);
  const filtered = items.filter((item) => (showArchive || item.status === "active") && (scope === "all" || item.scope === scope) && (priority === "all" || item.priority === priority));
  const total = active.reduce((sum, item) => sum + Number(item.estimated_amount), 0);
  const urgent = active.filter((item) => item.priority === "soon");
  const urgentTotal = urgent.reduce((sum, item) => sum + Number(item.estimated_amount), 0);
  const done = items.filter((item) => item.status === "purchased" && item.purchase_transaction_status === "active").length;
  const refresh = async () => { setEditor(null); setCheckout(null); setFeedback(""); await resource.reload(); };
  const changeState = async (item, status) => {
    if (!window.confirm(status === "archived" ? `Arsipkan ${item.name}? Rencana dana tidak akan lagi dihitung.` : `Aktifkan kembali ${item.name}?`)) return;
    setFeedback("");
    try { await mutation.run(() => changeWishlistState({ wishlist_item_id: item.wishlist_item_id, row_version: item.row_version, status })); invalidateWishlist(); await resource.reload(); }
    catch (error) { setFeedback(isOutcomeUnknownError(error) ? "Status perubahan belum pasti. Muat ulang sebelum mencoba lagi." : error.message); }
  };
  const restoreCancelled = async (item) => {
    setFeedback("");
    try { await mutation.run(() => reopenWishlist({ wishlist_item_id: item.wishlist_item_id, row_version: item.row_version })); invalidateWishlist(); await resource.reload(); }
    catch (error) { setFeedback(error.message); }
  };
  if (resource.status === "loading" && !resource.data) return <NativePageSkeleton />;
  if (resource.status === "error" && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return <div className={styles.page}>
    <PageHeader eyebrow="Rencana & Insight" title="Wishlist" description="Simpan keinginan, atur prioritas, dan rencanakan uang sebelum membeli." actions={<Button variant="primary" className={styles.addAction} aria-label="Tambah keinginan" icon={FiPlus} onClick={() => setEditor({})}>Tambah keinginan</Button>} />
    {resource.refreshError ? <RefreshWarning error={resource.refreshError} onRetry={resource.reload} /> : null}
    {feedback ? <p className={styles.error} role="alert">{feedback}</p> : null}
    <section className={styles.overview} aria-label="Ringkasan Wishlist">
      <div className={styles.overviewPrimary}><span>Total rencana aktif</span><strong>{formatRupiah(total)}</strong><small>{active.length} barang · estimasi, bukan dana terikat</small></div>
      <div><span>Prioritas segera</span><strong>{formatRupiah(urgentTotal)}</strong><small>{urgent.length} barang perlu diperhatikan</small></div>
      <div><span>Selesai dibeli</span><strong>{done}</strong><small>Dicatat sebagai transaksi</small></div>
    </section>
    <div className={styles.toolbar}>
      <div className={styles.pills} role="group" aria-label="Filter pemilik">{[["all", "Semua"], ["personal", "Pribadi"], ["shared", "Bersama"]].map(([value, label]) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>)}</div>
      <div className={`${styles.pills} ${styles.desktopPriority}`} role="group" aria-label="Filter prioritas">{[["all", "Semua prioritas"], ...Object.entries(priorityLabels)].map(([value, label]) => <button key={value} type="button" aria-pressed={priority === value} onClick={() => setPriority(value)}>{label}</button>)}</div>
      <div className={styles.mobilePriority}>
        <SelectionControl ariaLabel="Filter prioritas" compact value={priority} onChange={setPriority} options={selectionOptions({ all: "Semua prioritas", ...priorityLabels })} />
      </div>
    </div>
    {selected.length ? <div className={styles.simToolbar}><span>{selected.length} barang dipilih · {formatRupiah(selected.reduce((sum, item) => sum + Number(item.estimated_amount), 0))}</span><div><Button type="button" onClick={() => setSelectedIds([])}>Batal pilih</Button><Button type="button" variant="primary" onClick={() => setShowSimulator(true)}>Simulasi total</Button></div></div> : null}
    <section className={styles.board} aria-label="Daftar keinginan">
      {filtered.length === 0 ? <div className={styles.empty}><FiHeart aria-hidden="true" /><h2>{items.length ? "Tidak ada barang pada filter ini" : "Belum ada keinginan"}</h2><p>Tambahkan barang dan rencanakan dana yang perlu disiapkan. Saldo tidak akan berubah.</p><Button icon={FiPlus} variant="primary" onClick={() => setEditor({})}>Tambah Wishlist</Button></div> : filtered.map((item) => <article className={styles.item} key={item.wishlist_item_id}>
        <div className={styles.itemIcon} aria-hidden="true"><FiShoppingBag /></div>
        <div className={styles.itemMain}><div className={styles.itemName}><h2>{item.name}</h2><span data-priority={item.priority}>{priorityLabels[item.priority]}</span></div><p><span>{item.scope === "shared" ? <FiUsers aria-hidden="true" /> : <FiHeart aria-hidden="true" />} {scopeText(item.scope)}</span> · {strategyLabels[item.funding_strategy]} {item.target_date ? `· ${item.target_date}` : ""}</p>
          <div className={styles.itemMeta}><strong>{formatRupiah(item.estimated_amount)}</strong>{planMonthly(item) > 0 && item.status === "active" ? <small>Rencana {formatRupiah(planMonthly(item))}/bln</small> : null}</div>
          {item.note ? <p className={styles.itemNote}>{item.note}</p> : null}
          {isCancelled(item) ? <p className={styles.warning}>Transaksi sebelumnya dibatalkan. Buka kembali rencana sebelum mencatat ulang.</p> : null}
          {item.status === "purchased" && !isCancelled(item) ? <p className={styles.done}><FiCheckCircle aria-hidden="true" /> Dibeli · {formatRupiah(item.displayed_purchased_amount)}</p> : null}
          {item.status === "archived" ? <p className={styles.muted}>Diarsipkan</p> : null}
          <div className={styles.itemActions}>{item.status === "active" ? <><button type="button" aria-pressed={selectedIds.includes(item.wishlist_item_id)} disabled={mutation.busy} onClick={() => toggleSelection(item.wishlist_item_id)}><FiCheck aria-hidden="true" /> {selectedIds.includes(item.wishlist_item_id) ? "Terpilih" : "Pilih simulasi"}</button><button type="button" disabled={mutation.busy} onClick={() => setEditor(item)}><FiEdit2 /> Edit</button><button type="button" disabled={mutation.busy} onClick={() => setCheckout(item)}><FiCheck /> Dibeli</button><button type="button" disabled={mutation.busy} onClick={() => changeState(item, "archived")}><FiTrash2 /> Arsipkan</button></> : item.status === "archived" ? <button type="button" disabled={mutation.busy} onClick={() => changeState(item, "active")}>Aktifkan lagi</button> : isCancelled(item) ? <button type="button" disabled={mutation.busy} onClick={() => restoreCancelled(item)}>Buka rencana lagi</button> : null}
          {item.product_url ? <a href={item.product_url} target="_blank" rel="noopener noreferrer">Buka marketplace <FiArrowRight aria-hidden="true" /></a> : null}</div>
        </div>
      </article>)}
    </section>
    <label className={styles.archivedToggle}><input type="checkbox" checked={showArchive} onChange={(event) => setShowArchive(event.target.checked)} /> Tampilkan arsip & pembelian</label>
    <aside className={styles.bottomInfo}><FiTarget aria-hidden="true" /><div><strong>Rencana tidak otomatis menjadi dana tersedia</strong><p>Siapkan alokasi sebenarnya melalui <Link to="/perencanaan/kantong">Atur Dana</Link> atau <Link to="/target">Target</Link>. Saat pembelian dicatat, validasi saldo dan dana bebas tetap dijalankan.</p></div></aside>
    {showSimulator && selected.length ? <WishlistSimulator items={selected} onClose={() => setShowSimulator(false)} /> : null}
    {editor ? <WishlistEditor key={editor.wishlist_item_id || "new"} item={editor.wishlist_item_id ? editor : null} onSaved={refresh} onClose={() => setEditor(null)} /> : null}
    {checkout ? <WishlistCheckout key={checkout.wishlist_item_id} item={checkout} onSaved={refresh} onClose={() => setCheckout(null)} /> : null}
  </div>;
};
export default WishlistPage;
