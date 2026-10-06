import { useEffect, useState } from "react";
import { FiPlus, FiSearch, FiX } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import Modal from "../../components/common/Modal.jsx";
import { createShoppingItem, getShoppingSuggestions, invalidateShopping, updateShoppingItem } from "./shopping.api.js";
import styles from "./ShoppingPage.module.css";

const UNIT_OPTIONS = ["pcs", "kg", "gr", "liter", "ml", "pack", "dus"];
const DEFAULT_GROUP = "Kebutuhan Dapur";
const mutationMessage = (error) => error?.message || "Perubahan belum berhasil disimpan. Coba lagi.";
const formatQty = (milli) => {
  const value = Number(milli || 1000) / 1000;
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
};

const emptyShoppingForm = () => ({ name: "", quantity: "1", unit_key: "pcs", estimated_unit_price: "", actual_amount: "", note: "", group_name: DEFAULT_GROUP });
const shoppingFormFromItem = (item) => item ? {
  name: item.name || "",
  quantity: formatQty(item.quantity_milli),
  unit_key: item.unit_key || "pcs",
  estimated_unit_price: item.estimated_unit_price ? String(item.estimated_unit_price) : "",
  actual_amount: item.actual_amount ? String(item.actual_amount) : "",
  note: item.note || "",
  group_name: item.group_name || DEFAULT_GROUP,
} : emptyShoppingForm();
const shoppingEditorDescription = (editing) => editing
  ? "Perbarui detail barang tanpa mengubah transaksi."
  : "Nama barang saja sudah cukup. Detail lainnya bisa dilengkapi nanti.";

const shoppingEditorOnClose = (status, onClose) => status === "submitting" ? undefined : onClose;

const shouldShowActualPrice = (item) => Boolean(item) && item.status === "in_cart";

const ShoppingItemEditor = ({ open, onClose, data, list, item = null, onSaved, online }) => {
  const editing = Boolean(item);
  const [form, setForm] = useState(emptyShoppingForm);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [state, setState] = useState({ status: "idle", error: null });
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(shoppingFormFromItem(item));
    setQuery(""); setSuggestions([]); setState({ status: "idle", error: null }); setFieldErrors({});
  }, [item, open]);

  useEffect(() => {
    if (!open || editing || query.trim().length < 2) { setSuggestions([]); return undefined; }
    const timer = window.setTimeout(() => {
      getShoppingSuggestions({ budget_id: data.budget.budget_id, query: query.trim() }, { force: true })
        .then((result) => setSuggestions(result?.items || [])).catch(() => setSuggestions([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [data.budget.budget_id, editing, open, query]);

  const quantityNumber = Number(form.quantity);
  const quantityValid = Number.isFinite(quantityNumber) && quantityNumber > 0 && quantityNumber <= 1000;
  const quantityMilli = quantityValid ? Math.round(quantityNumber * 1000) : 0;
  const recentGroups = [...new Set((data?.items || []).map((entry) => String(entry.group_name || "").trim()).filter(Boolean))].slice(0, 8);
  const estimated = Math.round((quantityMilli / 1000) * Number(form.estimated_unit_price || 0));
  const chooseSuggestion = (suggestion) => {
    setForm((current) => ({ ...current, name: suggestion.name, unit_key: suggestion.unit_key || "pcs", quantity: formatQty(suggestion.quantity_milli), estimated_unit_price: suggestion.last_amount ? String(Math.round(Number(suggestion.last_amount) / Math.max(0.001, Number(suggestion.quantity_milli || 1000) / 1000))) : current.estimated_unit_price }));
    setQuery(""); setSuggestions([]);
  };
  const save = async (event) => {
    event.preventDefault();
    if (!online) return;
    const nextFieldErrors = {};
    if (!form.name.trim()) nextFieldErrors.name = "Nama barang wajib diisi.";
    if (!quantityValid) nextFieldErrors.quantity = "Jumlah harus lebih dari 0 dan maksimal 1.000.";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) return;
    setState({ status: "submitting", error: null });
    try {
      const payload = { name: form.name.trim(), quantity_milli: quantityMilli, unit_key: form.unit_key, estimated_unit_price: Number(form.estimated_unit_price || 0), estimated_amount: estimated, actual_amount: Number(form.actual_amount || 0), note: form.note, group_name: form.group_name };
      if (editing) await updateShoppingItem({ ...payload, shopping_item_id: item.shopping_item_id, row_version: item.row_version }, { rowVersion: item.row_version });
      else await createShoppingItem({ ...payload, shopping_list_id: list.shopping_list_id, list_row_version: list.row_version });
      invalidateShopping();
      await onSaved();
      onClose();
    } catch (error) { setState({ status: "error", error }); }
  };

  return <Modal open={open} title={editing ? "Edit barang" : "Tambah barang"} description={shoppingEditorDescription(editing)} onClose={shoppingEditorOnClose(state.status, onClose)} size="sm" mobileSwipeToClose={!editing}>
    <form className={styles.editor} onSubmit={save}>
      {!editing ? <div className={styles.suggestionSearch}><FiSearch aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari dari histori, mis. beras" aria-label="Cari barang dari histori" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Bersihkan pencarian"><FiX aria-hidden="true" /></button> : null}</div> : null}
      {suggestions.length ? <div className={styles.suggestions}><span>Saran dari histori</span>{suggestions.map((suggestion) => <button type="button" key={`${suggestion.name}-${suggestion.unit_key}`} onClick={() => chooseSuggestion(suggestion)}><span><strong>{suggestion.name}</strong><small>{suggestion.list_count} daftar sebelumnya{suggestion.last_amount ? <> · terakhir <Money value={suggestion.last_amount} /></> : null}</small></span><FiPlus aria-hidden="true" /></button>)}</div> : null}
      <label className="field"><span>Nama barang *</span><input value={form.name} aria-invalid={Boolean(fieldErrors.name) || undefined} onChange={(event) => { setForm((current) => ({ ...current, name: event.target.value })); setFieldErrors((current) => ({ ...current, name: "" })); }} maxLength={120} autoFocus />{fieldErrors.name ? <small className="field__error">{fieldErrors.name}</small> : null}</label>
      <div className={styles.quantityRow}>
        <label className="field"><span>Jumlah</span><input inputMode="decimal" value={form.quantity} aria-invalid={Boolean(fieldErrors.quantity) || undefined} onChange={(event) => { setForm((current) => ({ ...current, quantity: event.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") })); setFieldErrors((current) => ({ ...current, quantity: "" })); }} />{fieldErrors.quantity ? <small className="field__error">{fieldErrors.quantity}</small> : null}</label>
        <SelectionField compact label="Satuan" value={form.unit_key} onChange={(unit_key) => setForm((current) => ({ ...current, unit_key }))} options={UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit }))} />
      </div>
      <MoneyInput id="shopping-estimated-price" label="Perkiraan harga / satuan" value={form.estimated_unit_price} onChange={(value) => setForm((current) => ({ ...current, estimated_unit_price: value }))} />
      {shouldShowActualPrice(item) ? <MoneyInput id="shopping-actual-price" label="Harga aktual item (opsional)" value={form.actual_amount} onChange={(value) => setForm((current) => ({ ...current, actual_amount: value }))} /> : null}
      <label className="field"><span>Catatan (opsional)</span><input value={form.note} maxLength={300} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Merek, ukuran, dll" /></label>
      <label className="field"><span>Kelompok daftar</span><input list="shopping-group-suggestions" value={form.group_name} maxLength={60} onChange={(event) => setForm((current) => ({ ...current, group_name: event.target.value }))} placeholder="Contoh: Kebutuhan Dapur" /><datalist id="shopping-group-suggestions">{recentGroups.map((group) => <option key={group} value={group} />)}</datalist></label>
      <div className={styles.editorTotal}><span>Total estimasi</span><strong><Money value={estimated} /></strong></div>
      {!online ? <p className={styles.inlineWarning}>Kamu sedang offline. Sambungkan internet untuk menyimpan perubahan.</p> : null}
      {state.error ? <p className={styles.inlineError} role="alert">{mutationMessage(state.error)}</p> : null}
      <Button variant="primary" type="submit" loading={state.status === "submitting"} disabled={!online}>{editing ? "Simpan perubahan" : "Tambahkan"}</Button>
    </form>
  </Modal>;
};

export default ShoppingItemEditor;
