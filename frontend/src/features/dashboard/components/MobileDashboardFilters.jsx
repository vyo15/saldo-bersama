import { FiFilter, FiRotateCcw } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import { accountDisplayLabel } from "../../accounts/accountPresentation.js";
import { TRANSACTION_LABELS } from "../../transactions/transactionPresentation.js";

const MobileDashboardFilters = ({
  open,
  onClose,
  accounts,
  categories,
  accountFilter,
  onAccountFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  typeFilter,
  onTypeFilterChange,
  searchTerm,
  onSearchTermChange,
  activeFilterCount,
  onReset,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Filter transaksi dashboard"
    description="Gunakan filter yang sama seperti dashboard web. Perubahan langsung diterapkan pada daftar transaksi."
    size="sm"
    footer={(
      <>
        <Button type="button" icon={FiRotateCcw} onClick={onReset} disabled={!activeFilterCount}>Reset</Button>
        <Button type="button" variant="primary" icon={FiFilter} onClick={onClose}>Terapkan filter</Button>
      </>
    )}
  >
    <form className="mobile-dashboard-filter-form" onSubmit={(event) => { event.preventDefault(); onClose(); }}>
      <label className="field">
        <span>Cari transaksi</span>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Keterangan, rekening, kategori..."
        />
      </label>
      <label className="field">
        <span>Rekening</span>
        <select value={accountFilter} onChange={(event) => onAccountFilterChange(event.target.value)}>
          <option value="all">Semua rekening</option>
          {accounts.map((item) => <option key={item.account_id} value={item.account_id}>{accountDisplayLabel(item)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Kategori</span>
        <select value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
          <option value="all">Semua kategori</option>
          {categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Jenis transaksi</span>
        <select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value)}>
          <option value="all">Semua jenis</option>
          {Object.entries(TRANSACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <p className="mobile-dashboard-filter-summary" role="status">
        {activeFilterCount ? `${activeFilterCount} filter aktif.` : "Belum ada filter aktif."}
      </p>
    </form>
  </Modal>
);

export default MobileDashboardFilters;
