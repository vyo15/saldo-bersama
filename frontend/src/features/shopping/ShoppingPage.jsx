import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiCheck, FiCheckCircle, FiEdit2, FiMoreHorizontal, FiPlus, FiSearch, FiShoppingCart, FiTrash2 } from "react-icons/fi";
import { useNavigate, useParams } from "react-router";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import ContextBack from "../../components/navigation/ContextBack.jsx";
import { todayInJakarta } from "../../domain/dates.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import {
  checkoutShoppingList, createShoppingList, invalidateShopping, removeShoppingItem, setShoppingItemState,
} from "./shopping.api.js";
import styles from "./ShoppingPage.module.css";

const ShoppingItemEditor = lazy(() => import("./ShoppingItemEditor.jsx"));

const mutationMessage = (error) => error?.message || "Perubahan belum berhasil disimpan. Coba lagi.";
const formatQty = (milli) => {
  const value = Number(milli || 1000) / 1000;
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
};

const useOnlineStatus = () => {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);
  return online;
};

const periodLastDate = (periodKey) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || ""));
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`;
};

const Summary = ({ data }) => {
  const budget = data.budget;
  const summary = data.summary;
  const available = Number(budget.remaining_amount ?? budget.amount ?? 0);
  const remainingAfterEstimate = available - Number(summary.estimated_total || 0);
  return <div className={styles.summary} aria-label="Ringkasan daftar belanja">
    <div><span>Estimasi</span><strong><Money value={summary.estimated_total || 0} /></strong></div>
    <div><span>Anggaran tersedia</span><strong><Money value={available} /></strong></div>
    <div data-tone={remainingAfterEstimate < 0 ? "danger" : "positive"}><span>{remainingAfterEstimate < 0 ? "Melebihi rencana" : "Sisa setelah estimasi"}</span><strong><Money value={Math.abs(remainingAfterEstimate)} tone={remainingAfterEstimate < 0 ? "negative" : "positive"} /></strong></div>
  </div>;
};

const ItemRow = ({ item, onToggle, onEdit, onRemove, disabled }) => {
  const checked = ["in_cart", "purchased"].includes(item.status);
  const purchased = item.status === "purchased";
  const displayAmount = Number(item.actual_amount || item.estimated_amount || 0);
  return <div className={`${styles.itemRow} ${purchased ? styles.itemPurchased : ""}`}>
    <button type="button" className={styles.checkButton} disabled={disabled || purchased} onClick={() => onToggle(item)} aria-label={`${checked ? "Batalkan centang" : "Tandai masuk keranjang"} ${item.name}`} aria-pressed={checked}>{checked ? <FiCheck aria-hidden="true" /> : null}</button>
    <button type="button" className={styles.itemBody} onClick={() => !purchased && onEdit(item)} disabled={purchased}>
      <strong>{item.name}</strong><span>{formatQty(item.quantity_milli)} {item.unit_key}{displayAmount ? <> · <Money value={displayAmount} /></> : null}</span>{item.note ? <small>{item.note}</small> : null}
    </button>
    {!purchased ? <details className={styles.itemMenu}><summary aria-label={`Pilihan ${item.name}`}><FiMoreHorizontal aria-hidden="true" /></summary><div><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onEdit(item); }}><FiEdit2 aria-hidden="true" />Edit</button><button type="button" className={styles.dangerAction} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onRemove(item); }}><FiTrash2 aria-hidden="true" />Hapus</button></div></details> : <span className={styles.purchasedMark}><FiCheckCircle aria-hidden="true" /></span>}
  </div>;
};

const GroupedItems = ({ items, onToggle, onEdit, onRemove, disabled }) => {
  const visible = items.filter((item) => item.status !== "removed");
  const groups = new Map();
  visible.forEach((item) => { const key = item.group_name || "Lainnya"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
  return <div className={styles.groups}>{[...groups.entries()].map(([group, rows]) => <section key={group} className={styles.group}><h3>{group}</h3>{rows.map((item) => <ItemRow key={item.shopping_item_id} item={item} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} disabled={disabled} />)}</section>)}</div>;
};

const CheckoutSummary = ({ estimated, total, difference }) => <dl className={styles.checkoutSummary}>
  <div><dt>Estimasi awal</dt><dd><Money value={estimated} /></dd></div>
  <div><dt>Total aktual</dt><dd><Money value={Number(total || 0)} /></dd></div>
  {difference !== 0 ? <div data-tone={difference > 0 ? "positive" : "danger"}><dt>{difference > 0 ? "Lebih hemat" : "Lebih besar"}</dt><dd>{difference > 0 ? "↓" : "↑"} <Money value={Math.abs(difference)} tone={difference > 0 ? "positive" : "negative"} /></dd></div> : null}
</dl>;

const CheckoutOverspendReason = ({ total, available, value, onChange, disabled = false }) => Number(total || 0) > Number(available || 0)
  ? <label className="field"><span>Alasan melebihi rencana</span><input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} maxLength={180} placeholder="Contoh: harga kebutuhan naik" /></label>
  : null;

const CheckoutPendingItems = ({ pending, leftover, onChange, disabled = false }) => pending ? <fieldset className={styles.leftover}>
  <legend>{pending} barang belum dibeli</legend>
  <label><input type="radio" name="leftover" value="keep" checked={leftover === "keep"} disabled={disabled} onChange={() => onChange("keep")} />Simpan di daftar ini</label>
  <label><input type="radio" name="leftover" value="remove" checked={leftover === "remove"} disabled={disabled} onChange={() => onChange("remove")} />Hapus dari daftar</label>
</fieldset> : null;

const CheckoutFeedback = ({ online, error, confirmDuplicate, outcomeUnknown }) => <>
  {!online ? <p className={styles.inlineWarning}>Kamu sedang offline. Sambungkan internet untuk mencatat transaksi.</p> : null}
  {outcomeUnknown ? <div className={styles.inlineError} role="alert"><strong>Status pencatatan belum dapat dipastikan.</strong><br /><small>Jangan ubah data dulu. Coba lagi dengan data yang sama agar transaksi tidak tercatat ganda.</small></div> : null}
  {!outcomeUnknown && error ? <div className={styles.inlineError} role="alert">{mutationMessage(error)}{confirmDuplicate ? <><br /><small>Jika ini memang belanja baru dengan nominal yang sama, tekan tombol catat sekali lagi untuk mengonfirmasi.</small></> : null}</div> : null}
</>;

const CheckoutView = ({ data, onBack, onDone, online }) => {
  const inCart = data.items.filter((item) => item.status === "in_cart");
  const defaultTotal = inCart.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
  const [total, setTotal] = useState(defaultTotal ? String(defaultTotal) : "");
  const [date, setDate] = useState(todayInJakarta());
  const [leftover, setLeftover] = useState("keep");
  const [overspendReason, setOverspendReason] = useState("");
  const mutation = useGuardedMutation();
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const pending = data.items.filter((item) => item.status === "pending").length;
  const estimated = inCart.reduce((sum, item) => sum + Number(item.estimated_amount || 0), 0);
  const difference = estimated - Number(total || 0);
  const available = data.budget.remaining_amount ?? data.budget.amount ?? 0;
  const resetConfirmation = () => { setConfirmDuplicate(false); mutation.reset(); };
  const submit = async () => {
    if (!online || !Number(total || 0) || mutation.busy) return;
    try {
      await mutation.run(async () => {
        const result = await checkoutShoppingList({ shopping_list_id: data.list.shopping_list_id, row_version: data.list.row_version, total_amount: Number(total), checkout_date: date, leftover_action: leftover, overspend_reason: overspendReason, description: data.list.name, confirm_duplicate: confirmDuplicate }, { rowVersion: data.list.row_version });
        invalidateShopping();
        await onDone(result);
        return result;
      });
    } catch (error) {
      if (error?.code === "POSSIBLE_DUPLICATE") setConfirmDuplicate(true);
    }
  };
  return <div className={styles.checkoutPage}>
    <header className={styles.mobileSubHeader}><button type="button" disabled={mutation.busy || mutation.outcomeUnknown} onClick={onBack} aria-label="Kembali ke mode belanja"><FiArrowLeft aria-hidden="true" /></button><div><h1>Selesai belanja</h1><p>Cek total aktual sebelum dicatat.</p></div></header>
    <Card className={styles.checkoutCard}>
      <div className={styles.checkoutIntro}><span className={styles.shoppingIcon}><FiShoppingCart aria-hidden="true" /></span><div><strong>{inCart.length} barang dibeli</strong><span>{pending} belum dibeli</span></div></div>
      <CheckoutSummary estimated={estimated} total={total} difference={difference} />
      <MoneyInput id="shopping-checkout-total" label="Total aktual *" value={total} onChange={(value) => { setTotal(value); resetConfirmation(); }} required disabled={mutation.outcomeUnknown} />
      <div className={styles.lockedField}><span>Bayar dari</span><strong>{data.budget.source_account_name || "Rekening Alokasi Dana"}</strong><small>Terkunci dari Alokasi Dana</small></div>
      <div className={styles.lockedField}><span>Untuk</span><strong>{data.budget.name}</strong><small>Kebutuhan yang dipilih</small></div>
      <label className={styles.temporalLabel}><span>Tanggal</span><TemporalInput type="date" value={date} disabled={mutation.outcomeUnknown} onChange={(event) => { setDate(event.target.value); resetConfirmation(); }} min={`${data.budget.period_key}-01`} max={periodLastDate(data.budget.period_key)} /></label>
      <CheckoutOverspendReason total={total} available={available} value={overspendReason} disabled={mutation.outcomeUnknown} onChange={(value) => { setOverspendReason(value); resetConfirmation(); }} />
      <CheckoutPendingItems pending={pending} leftover={leftover} disabled={mutation.outcomeUnknown} onChange={(value) => { setLeftover(value); resetConfirmation(); }} />
      <CheckoutFeedback online={online} error={mutation.error} confirmDuplicate={confirmDuplicate} outcomeUnknown={mutation.outcomeUnknown} />
    </Card>
    <div className={styles.stickyAction}><Button variant="primary" loading={mutation.busy} disabled={!online || !Number(total || 0)} onClick={submit}>{mutation.outcomeUnknown ? "Coba lagi data yang sama" : <>Catat <Money value={Number(total || 0)} /></>}</Button></div>
  </div>;
};

const SuccessView = ({ result, data, onBackToList, navigate }) => <div className={styles.successPage}>
  <div className={styles.successMark}><FiCheck aria-hidden="true" /></div><h1>Belanja berhasil dicatat!</h1><p>Transaksi dan daftar belanja sudah tersimpan dengan aman.</p>
  <Card className={styles.successCard}><strong><Money value={result.checkout.total_amount} /></strong><span>{data.budget.source_account_name}</span><span>{data.budget.name}</span><small>{result.checkout.item_count} barang dibeli</small></Card>
  <Button variant="primary" onClick={() => navigate("/transaksi", { state: { period: data.budget.period_key } })}>Lihat Transaksi</Button>
  <Button onClick={onBackToList}>Kembali ke Daftar</Button>
</div>;

const ShoppingListUnavailableView = ({ data, canManage, online, mutationError, onCreate }) => <div className={styles.page}>
  <ContextBack to="/perencanaan/kantong" label="Atur Dana" />
  <Card className={styles.emptyShell}><EmptyState title="Belum ada daftar belanja" description={`Buat daftar untuk ${data.budget.name}. Barang dapat disiapkan sekarang lalu dicentang saat belanja.`} action={canManage ? <Button variant="primary" icon={FiShoppingCart} onClick={onCreate} disabled={!online}>Buat daftar belanja</Button> : null} />
    {!canManage ? <p className={styles.inlineWarning}>Daftar ini hanya dapat dilihat. Kebutuhan tidak aktif atau dikelola anggota lain.</p> : !online ? <p className={styles.inlineWarning}>Kamu sedang offline. Sambungkan internet untuk membuat daftar.</p> : null}
    {mutationError ? <p className={styles.inlineError}>{mutationMessage(mutationError)}</p> : null}
  </Card>
</div>;

const CompletedListView = ({ data, canManage, online, onCreate, navigate }) => <div className={styles.page}>
  <ContextBack to="/perencanaan/kantong" label="Atur Dana" />
  <Card className={styles.emptyShell}><div className={styles.completedState}><span className={styles.successMark}><FiCheck aria-hidden="true" /></span><h1>{data.list.name}</h1><p>Daftar ini sudah selesai. {data.summary.purchased_items} barang tersimpan sebagai histori belanja.</p><Summary data={data} />{canManage ? <Button variant="primary" icon={FiShoppingCart} onClick={onCreate} disabled={!online}>Buat daftar belanja baru</Button> : null}<Button onClick={() => navigate("/transaksi", { state: { period: data.budget.period_key } })}>Lihat Transaksi</Button></div></Card>
</div>;

const ShoppingHeader = ({ data, mode, counts, online, canManage, onAdd }) => <header className={styles.header}>
  <div><ContextBack className={styles.mobileBack} to="/perencanaan/kantong" label="Atur Dana" ariaLabel="Kembali ke Atur Dana" /><span>{data.budget.name}</span><h1>{data.list.name}</h1><p>{mode === "shopping" ? `${counts.done} dari ${counts.active} barang` : `${counts.open} dari ${counts.active} barang belum selesai`}</p></div>
  {mode === "planning" ? <Button icon={FiPlus} onClick={onAdd} disabled={!online || !canManage}>Tambah barang</Button> : null}
</header>;

const ShoppingStatusNotices = ({ canManage, online, refreshError, onRetry, mutationError, onDismissError }) => <>
  {!canManage ? <div className={styles.offlineNotice}>Mode hanya lihat. Kebutuhan tidak aktif atau dikelola anggota lain.</div> : !online ? <div className={styles.offlineNotice}>Kamu sedang offline. Daftar tetap dapat dilihat, tetapi perubahan perlu koneksi internet.</div> : null}
  <RefreshWarning error={refreshError} onRetry={onRetry} />
  {mutationError ? <div className={styles.errorNotice} role="alert">{mutationMessage(mutationError)} <button type="button" onClick={onDismissError}>Tutup</button></div> : null}
</>;

const PlanningWorkspace = ({ data, activeItems, purchasedItems, showItems, online, canManage, busyId, onAdd, onToggle, onEdit, onRemove, onStart }) => <div className={styles.workspace}>
  <main className={styles.listPane}>
    <div className={styles.mobileSummary}><Summary data={data} /></div>
    <div className={styles.quickAdd}><FiSearch aria-hidden="true" /><button type="button" onClick={onAdd}>Cari / tambah barang...</button><button type="button" className={styles.addSquare} aria-label="Tambah barang" onClick={onAdd}><FiPlus aria-hidden="true" /></button></div>
    {activeItems.length ? <GroupedItems items={showItems} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} disabled={!online || !canManage || Boolean(busyId)} /> : <EmptyState variant="inline" title="Daftar masih kosong" description="Tambahkan barang yang ingin dibeli. Harga boleh diisi sekarang atau nanti." action={<Button variant="primary" icon={FiPlus} onClick={onAdd} disabled={!online || !canManage}>Tambah barang</Button>} />}
  </main>
  <aside className={styles.summaryRail}><h2>Ringkasan</h2><div className={styles.countMeta}><span><FiShoppingCart aria-hidden="true" /></span><div><strong>{activeItems.length} barang</strong><small>{purchasedItems.length} selesai</small></div></div><Summary data={data} /><Button variant="primary" disabled={!activeItems.length || !online || !canManage} onClick={onStart}>Mulai Belanja</Button></aside>
</div>;

const ShoppingModeView = ({ activeItems, cartItems, purchasedItems, pendingItems, showItems, progress, shoppingFilter, online, canManage, busyId, onFilter, onToggle, onEdit, onRemove }) => <div className={styles.shoppingMode}>
  <div className={styles.progressBlock}><div><span>{cartItems.length + purchasedItems.length} dari {activeItems.length} barang</span><strong>{progress}%</strong></div><ProgressBar value={progress} max={100} label="Progress belanja" showValue={false} compact /></div>
  <div className={styles.filterPills} role="group" aria-label="Filter barang"><button type="button" className={shoppingFilter === "all" ? styles.activePill : ""} aria-pressed={shoppingFilter === "all"} onClick={() => onFilter("all")}>Semua <b>{activeItems.length}</b></button><button type="button" className={shoppingFilter === "pending" ? styles.activePill : ""} aria-pressed={shoppingFilter === "pending"} onClick={() => onFilter("pending")}>Belum <b>{pendingItems.length}</b></button><button type="button" className={shoppingFilter === "done" ? styles.activePill : ""} aria-pressed={shoppingFilter === "done"} onClick={() => onFilter("done")}>Selesai <b>{cartItems.length + purchasedItems.length}</b></button></div>
  <GroupedItems items={showItems} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} disabled={!online || !canManage || Boolean(busyId)} />
</div>;

const ShoppingStickyAction = ({ mode, activeItems, cartItems, data, online, canManage, onStart, onCheckout }) => <div className={styles.stickyAction}>
  {mode === "planning" ? <Button variant="primary" disabled={!activeItems.length || !online || !canManage} onClick={onStart}>Mulai Belanja</Button> : <><div><span>Estimasi keranjang</span><strong><Money value={data.summary.in_cart_estimated_total || 0} /></strong></div><Button variant="primary" disabled={!cartItems.length || !online || !canManage} onClick={onCheckout}>Selesai Belanja</Button></>}
</div>;

const ShoppingActiveView = ({ data, mode, shoppingFilter, online, canManage, busyId, mutationError, resource, collections, onMode, onFilter, onAdd, onToggle, onEdit, onRemove, onDismissError }) => {
  const { activeItems, pendingItems, cartItems, purchasedItems, shoppingItems } = collections;
  const progress = activeItems.length ? Math.round(((cartItems.length + purchasedItems.length) / activeItems.length) * 100) : 0;
  const showItems = mode === "shopping" ? shoppingItems : activeItems;
  const counts = { active: activeItems.length, done: cartItems.length + purchasedItems.length, open: pendingItems.length + cartItems.length };
  return <div className={styles.page} data-mode={mode}>
    <div className={styles.desktopBack}><ContextBack to="/perencanaan/kantong" label="Atur Dana" /></div>
    <ShoppingHeader data={data} mode={mode} counts={counts} online={online} canManage={canManage} onAdd={onAdd} />
    <ShoppingStatusNotices canManage={canManage} online={online} refreshError={resource.refreshError} onRetry={resource.reload} mutationError={mutationError} onDismissError={onDismissError} />
    {mode === "planning" ? <PlanningWorkspace data={data} activeItems={activeItems} purchasedItems={purchasedItems} showItems={showItems} online={online} canManage={canManage} busyId={busyId} onAdd={onAdd} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} onStart={() => onMode("shopping")} /> : <ShoppingModeView activeItems={activeItems} cartItems={cartItems} purchasedItems={purchasedItems} pendingItems={pendingItems} showItems={showItems} progress={progress} shoppingFilter={shoppingFilter} online={online} canManage={canManage} busyId={busyId} onFilter={onFilter} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} />}
    <ShoppingStickyAction mode={mode} activeItems={activeItems} cartItems={cartItems} data={data} online={online} canManage={canManage} onStart={() => onMode("shopping")} onCheckout={() => onMode("checkout")} />
  </div>;
};

const collectShoppingItems = (data, shoppingFilter) => {
  const activeItems = data?.items?.filter((item) => item.status !== "removed") || [];
  const pendingItems = activeItems.filter((item) => item.status === "pending");
  const cartItems = activeItems.filter((item) => item.status === "in_cart");
  const purchasedItems = activeItems.filter((item) => item.status === "purchased");
  const shoppingItems = shoppingFilter === "pending" ? pendingItems : shoppingFilter === "done" ? [...cartItems, ...purchasedItems] : [...pendingItems, ...cartItems, ...purchasedItems];
  return { activeItems, pendingItems, cartItems, purchasedItems, shoppingItems };
};

const ShoppingPage = () => {
  const { budgetId } = useParams();
  const navigate = useNavigate();
  const finance = useFinance();
  const online = useOnlineStatus();
  const resource = useApiResource("shopping.detail", { budget_id: budgetId });
  const [mode, setMode] = useState("planning");
  const [shoppingFilter, setShoppingFilter] = useState("all");
  const [editor, setEditor] = useState({ open: false, item: null });
  const [mutationError, setMutationError] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [success, setSuccess] = useState(null);
  const [undoRemove, setUndoRemove] = useState(null);
  useEffect(() => {
    if (!undoRemove || busyId === undoRemove.shopping_item_id) return undefined;
    const timer = window.setTimeout(() => setUndoRemove(null), 8000);
    return () => window.clearTimeout(timer);
  }, [busyId, undoRemove]);
  const data = resource.data;
  const canManage = Boolean(data?.can_manage);
  const collections = useMemo(() => collectShoppingItems(data, shoppingFilter), [data, shoppingFilter]);

  const reload = async () => { await resource.reload(); };
  const createList = async () => {
    if (!online || !canManage) return;
    setMutationError(null);
    try { await createShoppingList({ budget_id: budgetId }); invalidateShopping(); await reload(); }
    catch (error) { setMutationError(error); }
  };
  const toggle = async (item) => {
    if (!online || !canManage || busyId) return;
    setBusyId(item.shopping_item_id); setMutationError(null);
    try {
      await setShoppingItemState({ shopping_item_id: item.shopping_item_id, row_version: item.row_version, status: item.status === "in_cart" ? "pending" : "in_cart", actual_amount: item.actual_amount || 0 }, { rowVersion: item.row_version });
      invalidateShopping(); await reload();
    } catch (error) { setMutationError(error); } finally { setBusyId(""); }
  };
  const remove = async (item) => {
    if (!online || !canManage || busyId) return;
    setBusyId(item.shopping_item_id); setMutationError(null);
    try {
      await removeShoppingItem({ shopping_item_id: item.shopping_item_id, row_version: item.row_version }, { rowVersion: item.row_version });
      setUndoRemove({ ...item, row_version: Number(item.row_version || 0) + 1 });
      invalidateShopping(); await reload();
    } catch (error) { setMutationError(error); } finally { setBusyId(""); }
  };
  const restoreRemoved = async () => {
    if (!undoRemove || !online || busyId) return;
    const item = undoRemove;
    setBusyId(item.shopping_item_id); setMutationError(null);
    try {
      await setShoppingItemState({ shopping_item_id: item.shopping_item_id, row_version: item.row_version, status: ["pending", "in_cart"].includes(item.status) ? item.status : "pending", actual_amount: item.actual_amount || 0 }, { rowVersion: item.row_version });
      setUndoRemove(null); invalidateShopping(); await reload();
    } catch (error) { setMutationError(error); } finally { setBusyId(""); }
  };
  const completeCheckout = async (result) => { setSuccess(result); setMode("success"); await Promise.allSettled([finance.refreshOverview(), resource.reload()]); };
  const backToList = async () => { setSuccess(null); setMode("planning"); await reload(); };
  const openEditor = (item = null) => setEditor({ open: true, item });

  if (resource.status === "loading") return <NativePageSkeleton kind="planning" label="Memuat daftar belanja…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  if (!data) return null;
  if (mode === "checkout") return <CheckoutView data={data} onBack={() => setMode("shopping")} onDone={completeCheckout} online={online && canManage} />;
  if (mode === "success" && success) return <SuccessView result={success} data={data} onBackToList={backToList} navigate={navigate} />;
  if (!data.list) return <ShoppingListUnavailableView data={data} canManage={canManage} online={online} mutationError={mutationError} onCreate={createList} />;
  if (data.list.status === "completed") return <CompletedListView data={data} canManage={canManage} online={online} onCreate={createList} navigate={navigate} />;

  return <>
    {undoRemove ? <div className={styles.undoNotice} role="status"><span><strong>{undoRemove.name}</strong> dihapus dari daftar.</span><button type="button" onClick={restoreRemoved} disabled={Boolean(busyId)}>Urungkan</button></div> : null}
    <ShoppingActiveView data={data} mode={mode} shoppingFilter={shoppingFilter} online={online} canManage={canManage} busyId={busyId} mutationError={mutationError} resource={resource} collections={collections} onMode={setMode} onFilter={setShoppingFilter} onAdd={() => openEditor()} onToggle={toggle} onEdit={openEditor} onRemove={remove} onDismissError={() => setMutationError(null)} />
    {editor.open ? <Suspense fallback={<div className={styles.editorLoading} role="status">Menyiapkan form barang…</div>}><ShoppingItemEditor open onClose={() => setEditor({ open: false, item: null })} data={data} list={data.list} item={editor.item} onSaved={reload} online={online && canManage} /></Suspense> : null}
  </>;
};

export default ShoppingPage;
