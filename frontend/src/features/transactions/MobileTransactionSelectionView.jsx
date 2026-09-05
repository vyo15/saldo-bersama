import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiSearch } from "react-icons/fi";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { userRoleLabel } from "../../shared/presentation/user.js";
import { frequentCategories, orderedEnvelopeOptions, sourceAccountPicker } from "./transactionFormSmartDefaults.js";
import styles from "./MobileTransactionSelectionView.module.css";

const normalizeSearch = (value) => String(value || "").trim().toLocaleLowerCase("id-ID");

const SelectionRow = ({ selected, title, meta, onClick, disabled = false }) => (
  <button
    className={`${styles.choiceRow} ${selected ? styles.selected : ""}`.trim()}
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    disabled={disabled}
  >
    <span className={styles.choiceCopy}>
      <span className={styles.choiceName}>{title}</span>
      {meta ? <span className={styles.choiceMeta}>{meta}</span> : null}
    </span>
    <FiCheck className={styles.choiceCheck} aria-hidden="true" />
  </button>
);

const CategorySelection = ({ fields, onBack }) => {
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [fields.form.transaction_type, fields.form.source_account_id]);

  const quickCategories = useMemo(
    () => frequentCategories({
      recentTransactions: fields.recentTransactions,
      sourceAccountId: fields.form.source_account_id,
      visibleCategories: fields.visibleCategories,
    }),
    [fields.form.source_account_id, fields.recentTransactions, fields.visibleCategories],
  );

  const filtered = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return fields.visibleCategories;
    return fields.visibleCategories.filter((item) => normalizeSearch(item.name).includes(normalized));
  }, [fields.visibleCategories, query]);

  const choose = (categoryId) => {
    fields.update("category_id", categoryId);
    onBack();
  };

  return (
    <div className={styles.selectionContent}>
      <label className={styles.searchField} htmlFor="mobile-category-search">
        <FiSearch aria-hidden="true" />
        <input
          id="mobile-category-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
          placeholder="Cari kategori…"
          autoComplete="off"
          disabled={fields.outcomeUnknown}
        />
      </label>

      {!query && quickCategories.length ? (
        <>
          <span className={styles.groupLabel}>Sering dipakai</span>
          <div className={styles.frequentRow}>
            {quickCategories.map((item) => (
              <button
                key={item.category_id}
                type="button"
                aria-pressed={fields.form.category_id === item.category_id}
                onClick={() => choose(item.category_id)}
                disabled={fields.outcomeUnknown}
              >
                {item.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <span className={styles.groupLabel}>{query ? "Hasil pencarian" : "Semua kategori"}</span>
      <div className={styles.choiceList} aria-label="Kategori transaksi">
        {filtered.length ? filtered.map((item) => (
          <SelectionRow
            key={item.category_id}
            selected={fields.form.category_id === item.category_id}
            title={item.name}
            onClick={() => choose(item.category_id)}
            disabled={fields.outcomeUnknown}
          />
        )) : <p className={styles.empty}>Kategori tidak ditemukan.</p>}
      </div>
    </div>
  );
};

const sourceAccountMeta = (item, transactionType) => {
  if (transactionType === TRANSACTION_TYPES.TRANSFER) {
    return `Dana tersedia ${formatRupiah(item.available_balance ?? item.balance ?? 0)}`;
  }
  if (transactionType === TRANSACTION_TYPES.EXPENSE) {
    return `Dana tersedia ${formatRupiah(item.available_balance ?? item.balance ?? 0)}`;
  }
  return `Saldo ${formatRupiah(item.balance || 0)}`;
};

const AccountSelection = ({ selection, fields, onBack }) => {
  const sourceMode = selection === "source-account";
  const accounts = useMemo(() => {
    if (!sourceMode) return fields.compatibleDestinationAccounts;
    return sourceAccountPicker({
      accounts: fields.accounts,
      transactionType: fields.form.transaction_type,
      selectedAccountId: fields.form.source_account_id,
      recentTransactions: fields.recentTransactions,
    });
  }, [
    fields.accounts,
    fields.compatibleDestinationAccounts,
    fields.form.source_account_id,
    fields.form.transaction_type,
    fields.recentTransactions,
    sourceMode,
  ]);

  const selectedId = sourceMode ? fields.form.source_account_id : fields.form.destination_account_id;
  const choose = (accountId) => {
    if (sourceMode) fields.onSourceAccountChange(accountId);
    else fields.update("destination_account_id", accountId);
    onBack();
  };

  return (
    <div className={styles.selectionContent}>
      <span className={styles.groupLabel}>
        {sourceMode
          ? fields.form.transaction_type === TRANSACTION_TYPES.EXPENSE
            ? "Rekening yang dapat dipakai"
            : "Rekening sumber"
          : "Rekening tujuan"}
      </span>
      <div className={styles.choiceList} aria-label={sourceMode ? "Rekening sumber" : "Rekening tujuan"}>
        {accounts.length ? accounts.map((item) => (
          <SelectionRow
            key={item.account_id}
            selected={selectedId === item.account_id}
            title={accountDisplayLabel(item)}
            meta={sourceMode ? sourceAccountMeta(item, fields.form.transaction_type) : `Saldo ${formatRupiah(item.balance || 0)}`}
            onClick={() => choose(item.account_id)}
            disabled={fields.outcomeUnknown}
          />
        )) : (
          <p className={styles.empty}>
            {sourceMode ? "Belum ada rekening sumber yang dapat digunakan." : "Belum ada rekening tujuan yang kompatibel."}
          </p>
        )}
      </div>
    </div>
  );
};

const envelopeMeta = (item) => {
  const assignee = item.assignee_user_id
    ? `${item.assignee_name || "Pengguna"} · ${userRoleLabel(item.assignee_role)}`
    : "Bersama";
  return `${assignee} · sisa ${formatRupiah(item.remaining_amount || 0)}`;
};

const EnvelopeSelection = ({ fields, onBack }) => {
  const options = useMemo(
    () => orderedEnvelopeOptions(fields.compatibleEnvelopes, fields.allocationCandidates),
    [fields.allocationCandidates, fields.compatibleEnvelopes],
  );

  const choose = (envelopePeriodId) => {
    fields.onEnvelopeChange(envelopePeriodId);
    onBack();
  };

  return (
    <div className={styles.selectionContent}>
      <span className={styles.groupLabel}>Sesuai rekening + kategori</span>
      <div className={styles.choiceList} aria-label="Alokasi Dana">
        <SelectionRow
          selected={!fields.form.envelope_period_id}
          title="Belum dialokasikan"
          meta="Gunakan dana rekening tanpa mengikat ke Alokasi Dana"
          onClick={() => choose("")}
          disabled={fields.outcomeUnknown}
        />
        {options.map((item) => (
          <SelectionRow
            key={item.envelope_period_id}
            selected={fields.form.envelope_period_id === item.envelope_period_id}
            title={item.name}
            meta={envelopeMeta(item)}
            onClick={() => choose(item.envelope_period_id)}
            disabled={fields.outcomeUnknown}
          />
        ))}
      </div>
    </div>
  );
};

const MobileTransactionSelectionView = ({ selection, fields, onBack }) => {
  const viewRef = useRef(null);
  useEffect(() => {
    window.requestAnimationFrame(() => viewRef.current?.focus?.({ preventScroll: true }));
  }, [selection]);

  let content = null;
  if (selection === "category") content = <CategorySelection fields={fields} onBack={onBack} />;
  if (selection === "source-account" || selection === "destination-account") {
    content = <AccountSelection selection={selection} fields={fields} onBack={onBack} />;
  }
  if (selection === "envelope") content = <EnvelopeSelection fields={fields} onBack={onBack} />;
  if (!content) return null;

  return <div ref={viewRef} className={styles.selectionView} tabIndex={-1}>{content}</div>;
};

export default MobileTransactionSelectionView;
