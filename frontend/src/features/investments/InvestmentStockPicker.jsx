import { useMemo, useState } from "react";
import { FiCheck, FiSearch } from "react-icons/fi";
import { INVESTMENT_PROTOTYPE_CATALOG, investmentStockKeywords } from "../../shared/presentation/investmentStocks.js";
import StockLogo from "./StockLogo.jsx";
import styles from "./InvestmentStockPicker.module.css";

const normalize = (value) => String(value || "").trim().toLocaleLowerCase("id-ID");

const InvestmentStockPicker = ({ value = "", existingInstruments = [], disabled = false, onSelect }) => {
  const [query, setQuery] = useState("");
  const existingTickers = useMemo(() => new Set(existingInstruments.map((item) => String(item.ticker || "").trim().toUpperCase())), [existingInstruments]);
  const available = useMemo(() => INVESTMENT_PROTOTYPE_CATALOG.filter((item) => !existingTickers.has(item.ticker)), [existingTickers]);
  const visible = useMemo(() => {
    const normalized = normalize(query);
    if (!normalized) return available;
    return available.filter((item) => normalize(investmentStockKeywords(item)).includes(normalized));
  }, [available, query]);

  return <div className={styles.picker}>
    <label className={styles.search}>
      <FiSearch aria-hidden="true" />
      <span className="sr-only">Cari saham LQ45</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode atau nama saham" autoComplete="off" disabled={disabled} />
    </label>
    <p className={styles.hint}>Daftar dibatasi pada saham LQ45 yang disediakan prototype. Bursa dan ukuran lot sudah ditetapkan otomatis.</p>
    <div className={styles.list} role="listbox" aria-label="Daftar saham LQ45">
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
          <StockLogo ticker={item.ticker} />
          <span className={styles.copy}>
            <strong>{item.ticker}</strong>
            <span>{item.name}</span>
            <small>{item.exchange} · {item.lot_size.toLocaleString("id-ID")} lembar/lot</small>
          </span>
          <span className={styles.trailing}>
            {selected ? <span className={styles.check}><FiCheck aria-hidden="true" /></span> : <span className={styles.sector}>{item.sector}</span>}
          </span>
        </button>;
      }) : <p className={styles.empty}>{available.length ? "Tidak ada saham yang cocok dengan pencarian." : "Semua saham prototype sudah tersedia di daftar instrumen."}</p>}
    </div>
  </div>;
};

export default InvestmentStockPicker;
