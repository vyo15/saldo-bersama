import { useMemo, useState } from "react";
import { FiCheck, FiSearch } from "react-icons/fi";
import {
  INVESTMENT_MUTUAL_FUND_CATALOG,
  investmentAssetKeywords,
  investmentMutualFundByTicker,
} from "../../shared/presentation/investmentAssets.js";
import { INVESTMENT_PROTOTYPE_CATALOG } from "../../shared/presentation/investmentStocks.js";
import InvestmentAssetLogo from "./InvestmentAssetLogo.jsx";
import styles from "./InvestmentAssetPicker.module.css";

const normalize = (value) => String(value || "").trim().toLocaleLowerCase("id-ID");

const CATALOGS = Object.freeze({
  stock: INVESTMENT_PROTOTYPE_CATALOG.map((item) => ({ ...item, asset_type: "stock" })),
  mutual_fund: INVESTMENT_MUTUAL_FUND_CATALOG,
});

const metaLabel = (item) => item.asset_type === "mutual_fund"
  ? `Reksa Dana · ${item.category}`
  : `${item.exchange} · lot size ${item.lot_size.toLocaleString("id-ID")}`;

const trailingLabel = (item) => item.asset_type === "mutual_fund" ? "Reksa Dana" : item.sector;

const InvestmentAssetPicker = ({ value = "", existingInstruments = [], disabled = false, onSelect, onKindChange }) => {
  const [kind, setKind] = useState(() => investmentMutualFundByTicker(value) ? "mutual_fund" : "stock");
  const [query, setQuery] = useState("");
  const existingTickers = useMemo(() => new Set(existingInstruments.map((item) => String(item.ticker || "").trim().toUpperCase())), [existingInstruments]);
  const available = useMemo(() => CATALOGS[kind].filter((item) => !existingTickers.has(item.ticker)), [existingTickers, kind]);
  const visible = useMemo(() => {
    const normalized = normalize(query);
    if (!normalized) return available;
    return available.filter((item) => normalize(investmentAssetKeywords(item)).includes(normalized));
  }, [available, query]);
  const chooseKind = (nextKind) => {
    if (disabled || nextKind === kind) return;
    setKind(nextKind);
    setQuery("");
    onKindChange?.(nextKind);
  };

  return <div className={styles.picker}>
    <div className={styles.kindSwitch} aria-label="Jenis aset investasi">
      <button type="button" aria-pressed={kind === "stock"} disabled={disabled} onClick={() => chooseKind("stock")}>Saham LQ45</button>
      <button type="button" aria-pressed={kind === "mutual_fund"} disabled={disabled} onClick={() => chooseKind("mutual_fund")}>Reksa Dana</button>
    </div>
    <label className={styles.search}>
      <FiSearch aria-hidden="true" />
      <span className="sr-only">Cari {kind === "mutual_fund" ? "reksa dana" : "saham LQ45"}</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === "mutual_fund" ? "Cari nama reksa dana" : "Cari kode atau nama saham"} autoComplete="off" disabled={disabled} />
    </label>
    {available.length ? <p className={styles.hint}>{kind === "mutual_fund"
      ? `${available.length} reksa dana tersedia di katalog.`
      : `${available.length} saham LQ45 tersedia di katalog.`}</p> : null}
    <div className={styles.list} role="listbox" aria-label={kind === "mutual_fund" ? "Daftar reksa dana" : "Daftar saham LQ45"}>
      {visible.length ? visible.map((item) => {
        const selected = item.ticker === value;
        return <button
          key={item.ticker}
          type="button"
          className={`${styles.option} ${selected ? styles.selected : ""}`.trim()}
          role="option"
          aria-selected={selected}
          disabled={disabled}
          onClick={() => onSelect(item)}
        >
          <InvestmentAssetLogo ticker={item.ticker} />
          <span className={styles.copy}>
            <strong>{item.asset_type === "mutual_fund" ? item.name : item.ticker}</strong>
            <span>{item.asset_type === "mutual_fund" ? item.ticker : item.name}</span>
            <small>{item.asset_type === "mutual_fund" ? item.category : metaLabel(item)}</small>
          </span>
          <span className={styles.trailing}>
            {selected ? <span className={styles.check}><FiCheck aria-hidden="true" /></span> : <span className={styles.sector}>{trailingLabel(item)}</span>}
          </span>
        </button>;
      }) : <p className={styles.empty}>{available.length ? "Tidak ada aset yang cocok dengan pencarian." : kind === "mutual_fund" ? "Semua reksa dana katalog sudah ditambahkan." : "Semua saham LQ45 katalog sudah ditambahkan."}</p>}
    </div>
  </div>;
};

export default InvestmentAssetPicker;
