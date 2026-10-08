import { useMemo, useState } from "react";
import { FiTrendingUp } from "react-icons/fi";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import { instrumentOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import {
  INVESTMENT_MUTUAL_FUND_CATALOG,
  investmentAssetKeywords,
  investmentMutualFundByTicker,
} from "../../shared/presentation/investmentAssets.js";
import { INVESTMENT_PROTOTYPE_CATALOG } from "../../shared/presentation/investmentStocks.js";
import styles from "./InvestmentAssetPicker.module.css";

const CATALOGS = Object.freeze({
  stock: INVESTMENT_PROTOTYPE_CATALOG.map((item) => ({ ...item, asset_type: "stock" })),
  mutual_fund: INVESTMENT_MUTUAL_FUND_CATALOG,
});

const optionForAsset = (item) => ({
  value: item.ticker,
  label: item.asset_type === "mutual_fund" ? item.name : item.ticker,
  meta: item.asset_type === "mutual_fund" ? `${item.ticker} · ${item.category}` : item.name,
  keywords: investmentAssetKeywords(item),
  ...instrumentOptionVisual(item),
});

const InvestmentAssetPicker = ({ value = "", existingInstruments = [], allowedTickers = null, disabled = false, error = "", onSelect, onKindChange }) => {
  const [kind, setKind] = useState(() => investmentMutualFundByTicker(value) ? "mutual_fund" : "stock");
  const existingTickers = useMemo(() => new Set(existingInstruments.map((item) => String(item.ticker || "").trim().toUpperCase())), [existingInstruments]);
  const allowedTickerSet = useMemo(() => Array.isArray(allowedTickers) ? new Set(allowedTickers.map((item) => String(item || "").trim().toUpperCase())) : null, [allowedTickers]);
  const available = useMemo(() => CATALOGS[kind].filter((item) => !existingTickers.has(item.ticker) && (!allowedTickerSet || allowedTickerSet.has(item.ticker))), [allowedTickerSet, existingTickers, kind]);
  const options = useMemo(() => available.map(optionForAsset), [available]);
  const mutualFund = kind === "mutual_fund";

  const chooseKind = (nextKind) => {
    if (disabled || nextKind === kind) return;
    setKind(nextKind);
    onKindChange?.(nextKind);
  };

  return <div className={styles.picker}>
    <div className={styles.kindSwitch} role="group" aria-label="Jenis aset investasi">
      <button type="button" aria-pressed={!mutualFund} disabled={disabled} onClick={() => chooseKind("stock")}>Saham</button>
      <button type="button" aria-pressed={mutualFund} disabled={disabled} onClick={() => chooseKind("mutual_fund")}>Reksa Dana</button>
    </div>
    <InlineSelectionPicker
      label={mutualFund ? "Pilih reksa dana" : "Pilih saham"}
      value={value}
      onChange={(nextTicker) => {
        const selected = available.find((item) => item.ticker === nextTicker);
        if (selected) onSelect?.(selected);
      }}
      options={options}
      placeholder={mutualFund ? "Pilih reksa dana" : "Pilih saham"}
      placeholderMeta="Ketuk untuk mencari aset"
      placeholderOption={{ icon: FiTrendingUp }}
      searchable
      searchPlaceholder={mutualFund ? "Cari nama reksa dana…" : "Cari kode atau nama saham…"}
      emptyText={available.length ? "Tidak ada aset yang cocok dengan pencarian." : "Belum ada aset baru yang dapat dipilih."}
      error={error}
      disabled={disabled || !available.length}
      required
    />
    {!available.length ? <p className={styles.emptyNote} role="status">{mutualFund ? "Reksa dana" : "Saham"} yang tersedia sudah dicatat atau belum dapat ditambahkan.</p> : null}
  </div>;
};

export default InvestmentAssetPicker;
