import { useMemo, useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { isMutualFundInstrument } from "../../shared/presentation/investmentAssets.js";
import InvestmentAssetLogo from "./InvestmentAssetLogo.jsx";
import InvestmentFormField from "./InvestmentFormField.jsx";
import { bulkUpdateInvestmentValuations, invalidateInvestmentReads } from "./investments.api.js";

import formStyles from "./InvestmentForm.module.css";
import styles from "./InvestmentValuationDialog.module.css";

const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const rowKey = (portfolioId, instrumentId) => `${portfolioId}:${instrumentId}`;

const valuationRows = (portfolios = []) => portfolios
  .filter((portfolio) => portfolio?.can_operate !== false)
  .flatMap((portfolio) => (portfolio.holdings || []).map((holding) => ({
    portfolio,
    holding,
    key: rowKey(portfolio.portfolio_id, holding.instrument_id),
  })))
  .sort((left, right) => String(left.holding.ticker || left.holding.name || "").localeCompare(String(right.holding.ticker || right.holding.name || "")));

const initialPriceMap = (rows) => Object.fromEntries(rows.map(({ key, holding }) => [key, Number(holding.price_per_share || 0) || ""]));

const changedValuations = (rows, prices) => rows.filter(({ key, holding }) => Number(prices[key] || 0) !== Number(holding.price_per_share || 0));

const validationErrors = (rows, prices, valuationDate) => {
  const errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valuationDate || ""))) errors.valuation_date = "Tanggal nilai wajib dipilih.";
  else if (valuationDate > TODAY()) errors.valuation_date = "Tanggal nilai tidak boleh di masa depan.";
  for (const { key, holding } of changedValuations(rows, prices)) {
    const price = Number(prices[key]);
    if (!Number.isSafeInteger(price) || price <= 0) errors[key] = `${isMutualFundInstrument(holding) ? "NAB per unit" : "Harga per lembar"} harus berupa Rupiah lebih dari 0.`;
  }
  return errors;
};

const payloadFromChanges = (rows, prices, valuationDate) => {
  const groups = new Map();
  for (const { portfolio, holding, key } of changedValuations(rows, prices)) {
    if (!groups.has(portfolio.portfolio_id)) groups.set(portfolio.portfolio_id, {
      portfolio_id: portfolio.portfolio_id,
      row_version: portfolio.row_version,
      valuations: [],
    });
    groups.get(portfolio.portfolio_id).valuations.push({
      instrument_id: holding.instrument_id,
      price_per_share: Number(prices[key]),
    });
  }
  return { valuation_date: valuationDate, portfolios: [...groups.values()] };
};

const AssetPriceRow = ({ row, value, error, disabled, onChange }) => {
  const { holding, key } = row;
  const mutualFund = isMutualFundInstrument(holding);
  return <article className={styles.assetRow}>
    <div className={styles.assetIdentity}>
      <InvestmentAssetLogo ticker={holding.ticker} className={styles.assetLogo} />
      <div>
        <strong>{mutualFund ? holding.name || holding.ticker : holding.ticker || holding.name}</strong>
        <span>{mutualFund ? (holding.ticker || "Reksa Dana") : (holding.name || "Saham")}</span>
      </div>
    </div>
    <div className={styles.currentValue}>
      <span>Sebelumnya</span>
      <strong><Money value={holding.price_per_share} /></strong>
    </div>
    <MoneyInput
      id={`investment-valuation-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
      label={mutualFund ? "NAB per unit" : "Harga per lembar"}
      required
      disabled={disabled}
      value={value}
      error={error}
      onChange={onChange}
    />
  </article>;
};

const InvestmentValuationDialog = ({ portfolios = [], onClose, onSuccess }) => {
  const rows = useMemo(() => valuationRows(portfolios), [portfolios]);
  const initialPrices = useMemo(() => initialPriceMap(rows), [rows]);
  const formRef = useRef(null);
  const [prices, setPrices] = useState(initialPrices);
  const [valuationDate, setValuationDate] = useState(TODAY());
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const changed = changedValuations(rows, prices);
  const guard = useUnsavedChangesGuard({
    open: true,
    value: { valuationDate, prices },
    onClose,
    blocked: busy || outcomeUnknown,
  });

  const updatePrice = (key, value) => {
    setPrices((current) => ({ ...current, [key]: value }));
    setErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key && name !== "_form")) : current);
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const nextErrors = validationErrors(rows, prices, valuationDate);
    if (!changed.length) nextErrors._form = "Belum ada harga atau NAB yang berubah.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      const result = await bulkUpdateInvestmentValuations(payloadFromChanges(rows, prices, valuationDate));
      setOutcomeUnknown(false);
      invalidateInvestmentReads();
      onSuccess?.(result);
      onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setError(caught?.message || "Nilai investasi belum berhasil diperbarui.");
    } finally {
      setBusy(false);
    }
  };

  const footer = <>
    <Button type="button" onClick={guard.discardAndClose} disabled={busy || outcomeUnknown}>Batal</Button>
    <Button variant="primary" type="submit" form="investment-valuations-form" loading={busy} disabled={!rows.length}>
      {outcomeUnknown ? "Coba lagi data yang sama" : changed.length ? `Simpan ${changed.length} perubahan` : "Simpan nilai"}
    </Button>
  </>;

  return <Modal
    open
    title="Perbarui nilai investasi"
    description="Masukkan harga per lembar saham atau NAB per unit reksa dana terbaru. Jumlah kepemilikan tidak berubah."
    onClose={busy || outcomeUnknown ? undefined : guard.requestClose}
    discardGuard={guard}
    discardSubject="pembaruan nilai investasi"
    dismissible={!busy && !outcomeUnknown}
    footer={footer}
  >
    <form ref={formRef} id="investment-valuations-form" className={`${formStyles.form} ${styles.form}`} onSubmit={submit} noValidate>
      {errors._form ? <div className="notice notice--warning" role="alert">{errors._form}</div> : null}
      {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
      {outcomeUnknown ? <p className={formStyles.intentGuard} role="status">Data dikunci sementara. Jangan ubah harga, NAB, atau tanggal. Tekan “Coba lagi data yang sama” untuk memverifikasi hasil tanpa membuat catatan ganda.</p> : null}
      <div className={styles.toolbar}>
        <div>
          <strong>{rows.length.toLocaleString("id-ID")} aset dimiliki</strong>
          <span>Ubah hanya nilai yang memang sudah memiliki harga/NAB terbaru.</span>
        </div>
        <InvestmentFormField id="investment-bulk-valuation-date" label="Tanggal nilai" required error={errors.valuation_date}>
          <TemporalInput type="date" max={TODAY()} value={valuationDate} disabled={busy || outcomeUnknown} onChange={(event) => { setValuationDate(event.target.value); setErrors((current) => ({ ...current, valuation_date: undefined })); setError(""); }} />
        </InvestmentFormField>
      </div>
      <div className={styles.assetList}>
        {rows.map((row) => <AssetPriceRow key={row.key} row={row} value={prices[row.key]} error={errors[row.key]} disabled={busy || outcomeUnknown} onChange={(value) => updatePrice(row.key, value)} />)}
      </div>
      <p className={styles.helper}>Pembaruan ini hanya membuat snapshot valuasi. Lot saham, unit reksa dana, modal tercatat, dan histori beli/jual tidak diubah.</p>
    </form>
  </Modal>;
};

export default InvestmentValuationDialog;
