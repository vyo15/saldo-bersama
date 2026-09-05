import { FiDatabase } from "react-icons/fi";
import Card from "../../../components/common/Card.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import styles from "../ReconciliationsPage.module.css";

const HistoryTable = ({ items, accountLookup, formatReconciledAt }) => (
  <>
    <div className="data-table-wrap desktop-data-table">
      <table className="data-table">
        <thead><tr><th>Waktu</th><th>Rekening</th><th className="align-right">Sistem</th><th className="align-right">Aktual</th><th className="align-right">Selisih</th><th>Status</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.reconciliation_id}><td>{formatReconciledAt(item.reconciled_at)}</td><td>{accountLookup[item.account_id] || item.account_name || "Rekening tidak tersedia"}</td><td className="align-right"><Money value={item.system_balance} /></td><td className="align-right"><Money value={item.actual_balance} /></td><td className="align-right"><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></td><td><StatusBadge status={item.status} /></td></tr>)}</tbody>
      </table>
    </div>
    <div className={`mobile-data-list ${styles.mobileHistoryList}`} aria-label="Riwayat pencocokan saldo">
      {items.map((item) => {
        const matched = Number(item.difference || 0) === 0;
        return (
          <article className={`mobile-data-card ${styles.mobileHistoryCard}`} key={item.reconciliation_id}>
            <div className={styles.mobileHistoryCardHeader}>
              <div><strong>{accountLookup[item.account_id] || item.account_name || "Rekening tidak tersedia"}</strong><small>{formatReconciledAt(item.reconciled_at)}</small></div>
              <StatusBadge status={item.status} />
            </div>
            <dl className={styles.mobileHistoryMetrics}>
              <div><dt>Saldo sistem</dt><dd><Money value={item.system_balance} /></dd></div>
              <div><dt>Saldo aktual</dt><dd><Money value={item.actual_balance} /></dd></div>
            </dl>
            <div className={styles.mobileHistoryDifference} data-state={matched ? "matched" : "difference"}>
              <span><small>Selisih</small><strong>{matched ? "Tidak ada perbedaan" : "Perlu ditinjau kembali"}</strong></span>
              <Money value={item.difference} tone={matched ? "positive" : "negative"} />
            </div>
          </article>
        );
      })}
    </div>
  </>
);

const ReconciliationHistory = ({ accounts, items, accountLookup, historyAccountId, setHistoryAccountId, formatReconciledAt }) => (
  <Card className={`panel ${styles.historyPanel}`}>
    <div className={`panel__header ${styles.historyHeader}`}>
      <h2>Riwayat</h2>
      <label className={styles.historyFilter}>
        <span className="sr-only">Filter riwayat berdasarkan rekening</span>
        <select value={historyAccountId} onChange={(event) => setHistoryAccountId(event.target.value)} aria-label="Filter riwayat rekonsiliasi berdasarkan rekening">
          <option value="all">Semua rekening</option>
          {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}
        </select>
      </label>
    </div>
    {items.length ? <HistoryTable items={items} accountLookup={accountLookup} formatReconciledAt={formatReconciledAt} /> : <EmptyState variant="inline" icon={FiDatabase} title="Belum ada hasil pencocokan" description="Belum ada riwayat rekonsiliasi untuk filter ini." headingLevel={3} />}
  </Card>
);


export default ReconciliationHistory;
