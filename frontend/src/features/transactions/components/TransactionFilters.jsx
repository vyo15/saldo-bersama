import { useState } from "react";
import { FiSearch, FiSliders, FiX } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import SelectionField from "../../../components/common/SelectionField.jsx";
import TemporalInput from "../../../components/common/TemporalInput.jsx";
import { accountOptionVisual, categoryOptionVisual, memberOptionVisual } from "../../../components/common/selectionOptionVisuals.js";
import { currentMonthInJakarta } from "../../../domain/dates.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import styles from "../TransactionsPage.module.css";

const advancedFilterState = (filters) => ({ allocation: filters.allocation, account: filters.account, category: filters.category, creator: filters.creator });
const advancedFilterCount = (filters) => [filters.allocation, filters.account, filters.category, filters.creator].filter((value) => value !== "all").length;
const filterOptionLabel = (items, id, idKey, fallback) => items.find((item) => item[idKey] === id)?.name || fallback;

const TransactionFilters = ({ draftQuery, setDraftQuery, filters, setFilters, filterOptions, updateFilter, submitSearch, filtersActive }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedDraft, setAdvancedDraft] = useState(() => advancedFilterState(filters));
  const activeAdvancedCount = advancedFilterCount(filters);
  const chips = [
    filters.allocation !== "all" ? { key: "allocation", label: filters.allocation === "allocated" ? "Menggunakan Alokasi Dana" : "Belum masuk Alokasi Dana" } : null,
    filters.account !== "all" ? { key: "account", label: `Rekening: ${filterOptionLabel(filterOptions.accounts, filters.account, "account_id", "Terpilih")}` } : null,
    filters.category !== "all" ? { key: "category", label: `Kategori: ${filterOptionLabel(filterOptions.categories, filters.category, "category_id", "Terpilih")}` } : null,
    filters.creator !== "all" ? { key: "creator", label: `Pencatat: ${filterOptionLabel(filterOptions.creators, filters.creator, "user_id", "Terpilih")}` } : null,
  ].filter(Boolean);
  const resetAll = () => { setDraftQuery(""); setFilters((current) => ({ ...current, query: "", type: "all", allocation: "all", account: "all", category: "all", creator: "all", offset: 0 })); };
  const openAdvanced = () => { setAdvancedDraft(advancedFilterState(filters)); setAdvancedOpen(true); };
  const resetAdvancedDraft = () => setAdvancedDraft({ allocation: "all", account: "all", category: "all", creator: "all" });
  const applyAdvanced = () => { setFilters((current) => ({ ...current, ...advancedDraft, offset: 0 })); setAdvancedOpen(false); };
  const clearChip = (key) => setFilters((current) => ({ ...current, [key]: "all", offset: 0 }));

  return (
    <>
      <form className={`toolbar ${styles.toolbar}`} aria-label="Filter transaksi" onSubmit={submitSearch}>
        <div className={styles.searchRow}><label className="search-field"><FiSearch aria-hidden="true" /><input type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Cari keterangan atau kategori" /><span className="sr-only">Cari transaksi</span></label><Button type="submit">Cari</Button></div>
        <div className={styles.filterRow}>
          <label className="field field--compact"><span className="sr-only">Periode transaksi</span><TemporalInput type="month" max={currentMonthInJakarta()} value={filters.period} onChange={(event) => updateFilter("period", event.target.value)} aria-label="Periode transaksi" /></label>
          <SelectionField label="Filter jenis transaksi" hideLabel compact value={filters.type} onChange={(value) => updateFilter("type", value)} options={[{ value: "all", label: "Semua jenis" }, { value: "expense", label: "Pengeluaran" }, { value: "income", label: "Pemasukan" }, { value: "transfer", label: "Transfer" }, { value: "refund", label: "Refund" }, { value: "adjustment", label: "Penyesuaian" }]} />
          <Button type="button" className={styles.filterMore} icon={FiSliders} onClick={openAdvanced} aria-label={`Buka filter lainnya${activeAdvancedCount ? `, ${activeAdvancedCount} aktif` : ""}`}>
            Filter lainnya{activeAdvancedCount ? <span className={styles.filterCount} aria-hidden="true">{activeAdvancedCount}</span> : null}
          </Button>
        </div>
        {chips.length || filtersActive ? <div className={styles.filterSummary} aria-label="Filter transaksi aktif">
          <div className={styles.filterChips}>{chips.map((chip) => <button key={chip.key} type="button" className={styles.filterChip} onClick={() => clearChip(chip.key)} aria-label={`Hapus filter ${chip.label}`}><span>{chip.label}</span><FiX aria-hidden="true" /></button>)}</div>
          {filtersActive ? <button type="button" className={styles.filterReset} onClick={resetAll}>Reset</button> : null}
        </div> : null}
      </form>
      <Modal open={advancedOpen} onClose={() => setAdvancedOpen(false)} title="Filter lainnya" size="sm" footer={<><Button type="button" onClick={resetAdvancedDraft}>Reset pilihan</Button><Button type="button" variant="primary" onClick={applyAdvanced}>Terapkan filter</Button></>}>
        <div className={styles.advancedFilterGrid}>
          <SelectionField label="Alokasi Dana" value={advancedDraft.allocation} onChange={(allocation) => setAdvancedDraft((current) => ({ ...current, allocation }))} options={[{ value: "all", label: "Semua Alokasi" }, { value: "unallocated", label: "Belum masuk Alokasi" }, { value: "allocated", label: "Menggunakan Alokasi" }]} />
          <SelectionField label="Rekening" value={advancedDraft.account} onChange={(account) => setAdvancedDraft((current) => ({ ...current, account }))} searchable={filterOptions.accounts.length > 8} options={[{ value: "all", label: "Semua rekening" }, ...filterOptions.accounts.map((item) => ({ value: item.account_id, label: accountDisplayLabel(item), ...accountOptionVisual(item) }))]} />
          <SelectionField label="Kategori" value={advancedDraft.category} onChange={(category) => setAdvancedDraft((current) => ({ ...current, category }))} searchable={filterOptions.categories.length > 8} searchPlaceholder="Cari kategori…" options={[{ value: "all", label: "Semua kategori" }, ...filterOptions.categories.map((item) => ({ value: item.category_id, label: item.name, ...categoryOptionVisual(item) }))]} />
          <SelectionField label="Pencatat" value={advancedDraft.creator} onChange={(creator) => setAdvancedDraft((current) => ({ ...current, creator }))} searchable={filterOptions.creators.length > 8} options={[{ value: "all", label: "Semua pencatat" }, ...filterOptions.creators.map((item) => ({ value: item.user_id, label: item.name, meta: item.email || "", ...memberOptionVisual(item) }))]} />
        </div>
      </Modal>
    </>
  );
};

export default TransactionFilters;
