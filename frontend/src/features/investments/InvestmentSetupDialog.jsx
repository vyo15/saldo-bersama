import { useMemo, useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { isMutualFundInstrument } from "../../shared/presentation/investmentAssets.js";
import InvestmentAssetPicker from "./InvestmentAssetPicker.jsx";
import InvestmentFormField from "./InvestmentFormField.jsx";
import InvestmentUnitPrice from "./InvestmentUnitPrice.jsx";
import { createInvestmentAssetPosition, invalidateInvestmentReads, recordInvestmentAssetPurchase } from "./investments.api.js";
import { investmentOpeningPositionPreview, validateInvestmentAssetPosition, validateInvestmentAssetPurchase } from "./investments.model.js";
import styles from "./InvestmentForm.module.css";

const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const ticker = (value) => String(value || "").trim().toUpperCase();

const heldAssetEntries = (portfolios) => {
  const values = new Set();
  for (const portfolio of portfolios) for (const holding of portfolio.holdings || []) values.add(ticker(holding.ticker));
  return [...values].filter(Boolean).map((value) => ({ ticker: value }));
};

const assetPositionPreview = (form, asset) => investmentOpeningPositionPreview({
  ...form, instrument_id: asset?.instrument_id || "asset-preview",
}, [{ ...asset, instrument_id: asset?.instrument_id || "asset-preview" }]);

const previewPurchase = (form, asset) => {
  const shares = Number(form.opening_quantity || 0) * (isMutualFundInstrument(asset || {}) ? 1 : Number(asset?.lot_size || 100));
  const gross = Math.round(shares * Number(form.average_price || 0));
  return { shares, gross, total: gross + Number(form.fee_amount || 0) };
};

const PositionSummary = ({ form, asset }) => {
  if (!asset || !Number(form.opening_quantity) || !Number(form.average_price) || !Number(form.reference_price)) return null;
  const preview = assetPositionPreview(form, asset);
  return <section className={styles.review} aria-label="Ringkasan posisi investasi">
    <dl className={styles.reviewGrid}>
      <div><dt>Harga rata-rata</dt><dd><InvestmentUnitPrice value={preview.averagePrice} /></dd></div>
      <div><dt>Harga saat ini</dt><dd><InvestmentUnitPrice value={preview.currentPrice} /></dd></div>
      <div><dt>Modal tercatat</dt><dd><Money value={preview.costBasis} /></dd></div>
      <div><dt>Nilai saat ini</dt><dd><Money value={preview.marketValue} /></dd></div>
    </dl>
    <small className={styles.formHint}>Posisi awal tidak memotong RDN, tidak membuat transaksi bank, dan tidak mengirim order ke broker.</small>
  </section>;
};

const PurchaseSummary = ({ form, asset, account }) => {
  if (!asset || !(Number(form.opening_quantity) > 0) || !(Number(form.average_price) > 0)) return null;
  const preview = previewPurchase(form, asset);
  return <section className={styles.review} aria-label="Tinjau pembelian investasi">
    <h3>Tinjau catatan pembelian</h3>
    <dl className={styles.reviewGrid}>
      <div><dt>Aset</dt><dd>{asset?.ticker || "-"}</dd></div>
      <div><dt>Jumlah</dt><dd>{Number(form.opening_quantity).toLocaleString("id-ID")} {isMutualFundInstrument(asset || {}) ? "unit" : "lot"}</dd></div>
      <div><dt>Harga beli</dt><dd><InvestmentUnitPrice value={Number(form.average_price)} /></dd></div>
      <div><dt>Nilai pembelian</dt><dd><Money value={preview.gross} /></dd></div>
      <div><dt>Biaya</dt><dd><Money value={Number(form.fee_amount || 0)} /></dd></div>
      <div><dt>Total pengurang RDN</dt><dd><Money value={preview.total} /></dd></div>
      <div><dt>Rekening RDN</dt><dd>{account?.name || "-"}</dd></div>
      <div><dt>Tanggal beli</dt><dd>{form.position_date}</dd></div>
    </dl>
    <small className={styles.formHint}>Hanya pencatatan pembelian yang telah terjadi di broker. Saldo RDN dalam Saldo Bersama akan berkurang; tidak ada order beli sungguhan.</small>
  </section>;
};

const createAssetPositionPayload = (form, asset, instruments, goalId = "") => {
  const registered = instruments.find((item) => ticker(item.ticker) === ticker(asset.ticker) && item.status === "active") || null;
  const preview = assetPositionPreview(form, asset);
  const instrument = registered ? { instrument_id: registered.instrument_id } : {
    ticker: ticker(asset.ticker), name: asset.name, exchange: ticker(asset.exchange),
    lot_size: Number(asset.lot_size || 1), status: "active",
  };
  return {
    ...instrument, shares: preview.shares, cost_basis: preview.costBasis,
    average_price: Number(form.average_price), reference_price: Number(form.reference_price),
    ...(form.market_value !== "" && form.market_value != null ? { market_value: Number(form.market_value) } : {}),
    position_date: form.position_date, notes: form.notes || "", ...(goalId ? { goal_id: goalId } : {}),
  };
};

const createPurchasePayload = (form, asset, instruments, goalId = "") => {
  const registered = instruments.find((item) => ticker(item.ticker) === ticker(asset.ticker) && item.status === "active") || null;
  return {
    ...(registered ? { instrument_id: registered.instrument_id } : {
      ticker: ticker(asset.ticker), name: asset.name, exchange: ticker(asset.exchange), lot_size: Number(asset.lot_size || 1), status: "active",
    }),
    rdn_account_id: form.rdn_account_id, purchase_quantity: Number(form.opening_quantity),
    purchase_price: Number(form.average_price), fee_amount: Number(form.fee_amount || 0),
    position_date: form.position_date, notes: form.notes || "", ...(goalId ? { goal_id: goalId } : {}),
  };
};

const PurchaseDetails = ({ form, asset, mutualFund, fieldErrors, onFieldChange, rdnAccounts, accountsStatus }) => <>
  {mutualFund ? <InvestmentFormField id="investment-position-average" label="NAB beli per unit" required error={fieldErrors.average_price}>
    <input min="0.01" step="0.01" inputMode="decimal" type="number" value={form.average_price} onChange={(event) => onFieldChange("average_price", event.target.value)} />
  </InvestmentFormField> : <MoneyInput id="investment-position-average" label="Harga beli per saham" required value={form.average_price} error={fieldErrors.average_price} onChange={(value) => onFieldChange("average_price", value)} />}
  <MoneyInput id="investment-position-fee" label="Biaya transaksi (opsional)" value={form.fee_amount} error={fieldErrors.fee_amount} onChange={(value) => onFieldChange("fee_amount", value)} />
  <InlineSelectionPicker label="Sumber dana RDN" required error={fieldErrors.rdn_account_id}
    value={form.rdn_account_id} onChange={(value) => onFieldChange("rdn_account_id", value)}
    disabled={accountsStatus !== "ready" && accountsStatus !== "refreshing"}
    placeholder="Pilih rekening investasi/RDN" searchable={rdnAccounts.length > 8} searchPlaceholder="Cari rekening investasi…"
    options={rdnAccounts.map((account) => ({ value: account.account_id, label: account.name, meta: `Saldo tercatat Rp${Number(account.balance || 0).toLocaleString("id-ID")}`, ...accountOptionVisual(account) }))} />
  {Number(form.opening_quantity) > 0 && Number(form.average_price) > 0 ? <div className={styles.setupImpact} role="status"><span>Estimasi pengurang RDN</span><strong><Money value={previewPurchase(form, asset).total} /></strong></div> : null}
</>;

const OpeningDetails = ({ form, mutualFund, fieldErrors, onFieldChange, asset }) => <>
  <InvestmentFormField id="investment-position-average" label={mutualFund ? "Nilai rata-rata per unit" : "Harga rata-rata per saham"} required error={fieldErrors.average_price}>
    <input min="0.01" step="0.01" inputMode="decimal" type="number" value={form.average_price} onChange={(event) => onFieldChange("average_price", event.target.value)} />
  </InvestmentFormField>
  {mutualFund ? <InvestmentFormField id="investment-position-current" label="NAB per unit saat ini" required error={fieldErrors.reference_price}><input min="0.01" step="0.01" inputMode="decimal" type="number" value={form.reference_price} onChange={(event) => onFieldChange("reference_price", event.target.value)} /></InvestmentFormField> : <MoneyInput id="investment-position-current" label="Harga saham saat ini" required value={form.reference_price} error={fieldErrors.reference_price} onChange={(value) => onFieldChange("reference_price", value)} />}
  <MoneyInput id="investment-position-capital" label="Total diinvestasikan (opsional)" value={form.cost_basis} error={fieldErrors.cost_basis} onChange={(value) => onFieldChange("cost_basis", value)} />
  <MoneyInput id="investment-position-market-value" label="Total nilai saat ini dari broker (opsional)" value={form.market_value} error={fieldErrors.market_value} onChange={(value) => onFieldChange("market_value", value)} />
  <small className={styles.formHint}>Salin modal dan nilai aktual sesuai Ajaib. Perbedaan akibat pembulatan harga yang tampil tetap tersimpan.</small>
  {Number(form.opening_quantity) > 0 && Number(form.average_price) > 0 && Number(form.reference_price) > 0 ? <div className={styles.setupImpact} role="status"><span>Nilai investasi tercatat</span><strong><Money value={assetPositionPreview(form, asset).marketValue} /></strong></div> : null}
</>;

const AssetFields = ({ form, asset, heldTickers, allowedTickers, outcomeUnknown, fieldErrors, onAssetSelect, onAssetKindChange, onFieldChange, intent, rdnAccounts, accountsStatus }) => {
  const mutualFund = isMutualFundInstrument(asset || {});
  return <fieldset className={`${styles.intentFieldset} ${styles.setupFields}`} disabled={outcomeUnknown}>
    <InvestmentAssetPicker value={form.ticker} existingInstruments={heldTickers} allowedTickers={allowedTickers} disabled={outcomeUnknown} error={fieldErrors.ticker} onSelect={onAssetSelect} onKindChange={onAssetKindChange} />
    {asset ? <>
      <div className={styles.formRow}>
        <InvestmentFormField id="investment-position-quantity" label={mutualFund ? "Jumlah unit" : "Jumlah lot"} required error={fieldErrors.opening_quantity}>
          <input min={mutualFund ? "0.01" : "1"} step={mutualFund ? "0.01" : "1"} inputMode={mutualFund ? "decimal" : "numeric"} type="number" value={form.opening_quantity} onChange={(event) => onFieldChange("opening_quantity", event.target.value)} />
        </InvestmentFormField>
        <InvestmentFormField id="investment-position-date" label={intent === "purchase" ? "Tanggal beli" : "Tanggal posisi"} required error={fieldErrors.position_date}>
          <TemporalInput type="date" max={TODAY()} value={form.position_date} onChange={(event) => onFieldChange("position_date", event.target.value)} />
        </InvestmentFormField>
      </div>
      {intent === "purchase" ? <PurchaseDetails form={form} asset={asset} mutualFund={mutualFund} fieldErrors={fieldErrors} onFieldChange={onFieldChange} rdnAccounts={rdnAccounts} accountsStatus={accountsStatus} /> : <OpeningDetails form={form} asset={asset} mutualFund={mutualFund} fieldErrors={fieldErrors} onFieldChange={onFieldChange} />}
      <details className={styles.setupOptional} key={asset.ticker}>
        <summary>Catatan tambahan{form.notes ? " · Terisi" : ""}</summary>
        <InvestmentFormField id="investment-position-notes" label="Catatan (opsional)" error={fieldErrors.notes}>
          <textarea maxLength="500" value={form.notes} onChange={(event) => onFieldChange("notes", event.target.value)} />
        </InvestmentFormField>
      </details>
    </> : null}
  </fieldset>;
};

const SetupFooter = ({ intent, reviewing, outcomeUnknown, busy, asset, accountReady, onBack, onCancel, onEdit }) => <>
  {intent && !reviewing && !outcomeUnknown ? <Button type="button" onClick={onBack} disabled={busy}>Kembali</Button> : <Button type="button" onClick={onCancel} disabled={busy || outcomeUnknown}>Batal</Button>}
  {reviewing && !outcomeUnknown ? <Button type="button" onClick={onEdit} disabled={busy}>Ubah</Button> : null}
  {intent ? <Button variant="primary" type="submit" form="investment-setup-form" loading={busy} disabled={!asset || (intent === "purchase" && !accountReady)}>{outcomeUnknown ? "Coba lagi data yang sama" : reviewing ? "Simpan catatan" : "Tinjau"}</Button> : null}
</>;

const MissingPurchaseRdn = ({ onCreateRdn }) => <section className={styles.setupHint} aria-label="Rekening RDN belum siap">
  <span>Belum ada rekening RDN yang bisa digunakan untuk mencatat pembelian. Siapkan rekening investasi, lalu catat dana masuk lewat Transfer. Saldo Bersama tidak mengirim dana ke broker.</span>
  <Button type="button" variant="secondary" onClick={onCreateRdn}>Siapkan RDN</Button>
</section>;

const SetupForm = ({ formRef, submit, intent, chooseIntent, reviewing, outcomeUnknown, error, fieldErrors, accountsResource, form, asset, heldTickers, allowedTickers, onAssetSelect, onAssetKindChange, onFieldChange, rdnAccounts, onCreateRdn }) => <form ref={formRef} id="investment-setup-form" className={`${styles.form} ${styles.setupForm}`} onSubmit={submit} noValidate>
  {!intent ? <VisualChoiceGroup legend="Kondisi investasi" name="investment-ownership" value={intent} onChange={chooseIntent} columns={2} compact descriptive options={[
    { value: "existing", label: "Sudah punya", description: "Catat saham atau reksa dana lama. Tidak memotong RDN." },
    { value: "purchase", label: "Belum punya", description: "Catat pembelian baru. Saldo RDN tercatat akan berkurang." },
  ]} /> : null}
  {fieldErrors._form ? <div className="notice notice--danger" role="alert">{fieldErrors._form}</div> : null}
  {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
  {outcomeUnknown ? <p className={styles.intentGuard} role="status">Hasil penyimpanan belum pasti. Jangan ubah aset, jumlah, harga atau tanggal. Ulangi data yang sama agar catatan tidak ganda.</p> : null}
  {intent === "purchase" && accountsResource.status === "error" ? <div className="notice notice--danger" role="alert">Daftar rekening gagal dimuat. <Button type="button" onClick={() => accountsResource.reload().catch(() => {})}>Muat ulang</Button></div> : null}
  {intent === "purchase" && accountsResource.status === "ready" && !rdnAccounts.length ? <MissingPurchaseRdn onCreateRdn={onCreateRdn} /> : null}
  {intent && !reviewing && (intent !== "purchase" || rdnAccounts.length > 0) ? <AssetFields form={form} asset={asset} heldTickers={heldTickers} allowedTickers={allowedTickers} outcomeUnknown={outcomeUnknown} fieldErrors={fieldErrors} onAssetSelect={onAssetSelect} onAssetKindChange={onAssetKindChange} onFieldChange={onFieldChange} intent={intent} rdnAccounts={rdnAccounts} accountsStatus={accountsResource.status} /> : null}
  {intent && reviewing ? intent === "purchase" ? <PurchaseSummary form={form} asset={asset} account={rdnAccounts.find((account) => account.account_id === form.rdn_account_id)} /> : <PositionSummary form={form} asset={asset} /> : null}
</form>;

const InvestmentSetupDialog = ({ instruments = [], portfolios = [], owner = false, initialGoalId = "", initialRdnAccountId = "", onClose, onSuccess, onCreateRdn }) => {
  const formRef = useRef(null);
  const [intent, setIntent] = useState("");
  const [form, setForm] = useState({
    ticker: "", opening_quantity: "", average_price: "", reference_price: "", cost_basis: "",
    market_value: "", fee_amount: "", rdn_account_id: initialRdnAccountId,
    position_date: TODAY(), notes: "",
  });
  const [asset, setAsset] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const accountsResource = useApiResource("accounts.list", {}, { enabled: intent === "purchase" });
  const rdnAccounts = useMemo(() => (accountsResource.data?.items || []).filter((account) => account.account_type === "investment" && account.status === "active" && !account.is_system_hidden && account.can_operate !== false), [accountsResource.data]);
  const heldTickers = useMemo(() => heldAssetEntries(portfolios), [portfolios]);
  const allowedTickers = useMemo(() => owner ? null : instruments.filter((item) => item.status === "active").map((item) => ticker(item.ticker)), [instruments, owner]);
  const guard = useUnsavedChangesGuard({ open: true, value: { ...form, intent, asset: asset?.ticker || "" }, onClose, blocked: busy || outcomeUnknown });

  const clearErrors = () => { setFieldErrors({}); setError(""); setReviewing(false); };
  const onFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key && name !== "_form")) : current);
    setError(""); setReviewing(false);
  };
  const chooseIntent = (nextIntent) => { if (!outcomeUnknown && !busy) { setIntent(nextIntent); clearErrors(); } };
  const onAssetSelect = (nextAsset) => { if (!outcomeUnknown) { setAsset(nextAsset); setForm((current) => ({ ...current, ticker: nextAsset.ticker, opening_quantity: "", average_price: "", reference_price: "", cost_basis: "", market_value: "" })); clearErrors(); } };
  const onAssetKindChange = () => { if (!outcomeUnknown) { setAsset(null); setForm((current) => ({ ...current, ticker: "" })); clearErrors(); } };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || (!intent && !outcomeUnknown)) return;
    const purchase = intent === "purchase";
    const nextErrors = purchase
      ? validateInvestmentAssetPurchase(form, asset, rdnAccounts, { goalId: initialGoalId })
      : validateInvestmentAssetPosition(form, asset);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setReviewing(false); globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus()); return; }
    if (!reviewing && !outcomeUnknown) { setReviewing(true); return; }
    const payload = purchase ? createPurchasePayload(form, asset, instruments, initialGoalId) : createAssetPositionPayload(form, asset, instruments, initialGoalId);
    setBusy(true); setError("");
    try {
      const saved = await (purchase ? recordInvestmentAssetPurchase(payload) : createInvestmentAssetPosition(payload));
      setOutcomeUnknown(false); invalidateInvestmentReads(); onSuccess?.(saved, asset, intent); onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setError(caught?.message || "Catatan investasi belum berhasil disimpan.");
    } finally { setBusy(false); }
  };

  return <Modal open title="Tambah investasi" description={intent === "purchase" ? "Catat pembelian yang telah Anda lakukan di broker, menggunakan saldo RDN tercatat." : intent === "existing" ? "Masukkan posisi yang sudah Anda miliki tanpa memotong saldo RDN." : "Apakah Anda sudah memiliki investasi ini?"}
    onClose={busy || outcomeUnknown ? undefined : guard.requestClose} discardGuard={guard} discardSubject="investasi" dismissible={!busy && !outcomeUnknown}
    footer={<SetupFooter intent={intent} reviewing={reviewing} outcomeUnknown={outcomeUnknown} busy={busy} asset={asset} accountReady={["ready", "refreshing"].includes(accountsResource.status) && rdnAccounts.length > 0} onBack={() => chooseIntent("")} onCancel={guard.discardAndClose} onEdit={() => setReviewing(false)} />}
  >
    <SetupForm formRef={formRef} submit={submit} intent={intent} chooseIntent={chooseIntent} reviewing={reviewing} outcomeUnknown={outcomeUnknown} error={error} fieldErrors={fieldErrors} accountsResource={accountsResource} form={form} asset={asset} heldTickers={heldTickers} allowedTickers={allowedTickers} onAssetSelect={onAssetSelect} onAssetKindChange={onAssetKindChange} onFieldChange={onFieldChange} rdnAccounts={rdnAccounts} onCreateRdn={onCreateRdn} />
  </Modal>;
};

export default InvestmentSetupDialog;
