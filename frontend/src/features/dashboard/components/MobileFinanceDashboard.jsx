import { useState } from "react";
import { FiAlertTriangle, FiChevronDown, FiChevronRight, FiEye, FiEyeOff, FiInfo, FiPieChart, FiRefreshCw, FiSliders } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import ThemeToggle from "../../../components/common/ThemeToggle.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { formatTransactionDate, transactionCategoryIcon, transactionSign, transactionTone } from "../../../shared/presentation/transaction.js";
import { formatPeriod, QUICK_ACTIONS } from "../dashboardPresentation.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const alertEntityId = (alert) => String(alert?.id || "").split(":")[1] || "";
const alertPeriod = (alert) => {
  const candidate = alertEntityId(alert);
  return /^\d{4}-\d{2}$/.test(candidate) ? candidate : "";
};

const alertGuidance = (alert) => {
  const entityId = alertEntityId(alert);
  switch (alert.type) {
    case "reconciliation_difference":
      return {
        instruction: "Masukkan saldo rekening yang benar saat ini. Rekening akan dipilih otomatis agar Anda tidak perlu mencarinya lagi.",
        actionLabel: "Cocokkan saldo",
        to: "/rekonsiliasi",
        state: { attentionSource: "dashboard", attentionType: alert.type, accountId: entityId },
      };
    case "reconciliation_stale":
      return {
        instruction: "Cek saldo sebenarnya di bank atau uang tunai Anda, lalu masukkan nilainya untuk memastikan catatan aplikasi masih sesuai.",
        actionLabel: "Cek saldo sekarang",
        to: "/rekonsiliasi",
        state: { attentionSource: "dashboard", attentionType: alert.type, accountId: entityId },
      };
    case "unallocated_expense":
      return {
        instruction: "Pilih pengeluaran yang belum memiliki kantong, buka Edit, lalu tentukan alokasi seperti Makan, Bensin, Rumah, atau jatah lainnya.",
        actionLabel: "Pilih alokasi",
        to: "/transaksi",
        state: { attentionSource: "dashboard", attentionType: alert.type, allocation: "unallocated", period: alertPeriod(alert) },
      };
    case "budget_threshold":
      return {
        instruction: alert.severity === "danger" ? "Periksa transaksi yang membuat anggaran terlampaui. Ubah batas hanya jika rencana anggarannya memang berubah." : "Periksa pemakaian kategori ini dan pastikan sisa anggaran cukup sampai akhir periode.",
        actionLabel: "Periksa anggaran",
        to: "/anggaran",
        state: { attentionSource: "dashboard", attentionType: alert.type, attentionBudgetId: entityId },
      };
    case "envelope_threshold":
      return {
        instruction: alert.severity === "danger" ? "Periksa transaksi pada kantong ini karena jatah sudah habis atau terlampaui." : "Periksa sisa jatah sebelum membuat pengeluaran berikutnya dari kantong ini.",
        actionLabel: "Periksa alokasi",
        to: "/alokasi",
        state: { attentionSource: "dashboard", attentionType: alert.type, attentionEnvelopeId: entityId },
      };
    case "recurring_overdue":
      return {
        instruction: "Jika tagihan sudah dibayar, catat pembayaran aktual sekarang. Jika belum, periksa nominal dan rekening sebelum melanjutkan.",
        actionLabel: "Catat pembayaran",
        to: "/tagihan",
        state: { attentionSource: "dashboard", attentionType: alert.type, attentionOccurrenceId: entityId, attentionAction: "payment" },
      };
    case "recurring_due":
      return {
        instruction: "Periksa tagihan yang akan jatuh tempo. Jika sudah dibayar lebih awal, catat aktualnya agar saldo dan jadwal tetap sinkron.",
        actionLabel: "Buka tagihan ini",
        to: "/tagihan",
        state: { attentionSource: "dashboard", attentionType: alert.type, attentionOccurrenceId: entityId },
      };
    case "goal_behind":
      return {
        instruction: "Target berada di bawah ritme rencana. Tambahkan dana jika kondisi keuangan memungkinkan; jangan mengambil dana dari rekening yang tidak sesuai.",
        actionLabel: "Tambah dana target",
        to: "/target",
        state: { attentionSource: "dashboard", attentionType: alert.type, attentionGoalId: entityId, attentionAction: "deposit" },
      };
    default:
      return {
        instruction: "Buka bagian terkait untuk melihat data yang perlu diperiksa sebelum mengambil tindakan.",
        actionLabel: "Buka tindakan",
        to: alert.targetPath || "/",
        state: { attentionSource: "dashboard", attentionType: alert.type || "unknown" },
      };
  }
};

const AttentionSeverityIcon = ({ severity }) => severity === "info" ? <FiInfo aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />;

const AttentionSheet = ({ alerts, open, onClose }) => <Modal open={open} onClose={onClose} title="Perlu perhatian" description="Selesaikan yang paling penting terlebih dahulu. Tidak ada perubahan data sebelum Anda mengonfirmasi tindakan pada halaman tujuan." size="sm" mobileSwipeToClose>
  <div className="mobile-attention-list">
    {alerts.map((alert) => {
      const guidance = alertGuidance(alert);
      return <article className="mobile-attention-item" data-severity={alert.severity} key={alert.id}>
        <span className="mobile-attention-item__icon"><AttentionSeverityIcon severity={alert.severity} /></span>
        <div className="mobile-attention-item__content">
          <strong>{alert.title}</strong>
          <p>{alert.message}</p>
          <div className="mobile-attention-instruction"><span>Yang perlu dilakukan</span><p>{guidance.instruction}</p></div>
          <Link className="mobile-attention-action" to={guidance.to} state={guidance.state}>{guidance.actionLabel}<FiChevronRight aria-hidden="true" /></Link>
        </div>
      </article>;
    })}
  </div>
</Modal>;

const MobileFinanceHero = ({ overview, displayName, balanceVisible, onToggleBalance, onRefresh }) => (
  <header className="mobile-finance-hero">
    <div className="mobile-finance-hero__bar"><div className="mobile-finance-brand"><strong>Saldo Bersama</strong><span>{formatPeriod(overview.periodKey)}</span></div><div className="mobile-finance-hero__actions"><ThemeToggle tone="hero" className="mobile-hero-button" /><button type="button" className="mobile-hero-button" onClick={onRefresh} aria-label="Sinkronkan data" title="Sinkronkan data"><FiRefreshCw aria-hidden="true" /></button><button type="button" className="mobile-hero-button" onClick={onToggleBalance} aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"} aria-pressed={!balanceVisible}>{balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}</button></div></div>
    <div className="mobile-finance-identity"><p>Hai, {displayName}</p><span>Total saldo</span><div className={`mobile-finance-balance${balanceVisible ? "" : " mobile-finance-balance--hidden"}`} aria-live="polite"><SensitiveMoney visible={balanceVisible} value={overview.totalBalance} /></div><small>{overview.accountBalances.length} rekening aktif</small></div>
    <div className="mobile-finance-summary" aria-label="Ringkasan saldo dan alokasi"><div><span>Aman digunakan</span><SensitiveMoney visible={balanceVisible} value={overview.safeToSpend} /></div><div><span>Pengeluaran bulan ini</span><SensitiveMoney visible={balanceVisible} value={overview.cashFlow.expense} /></div><div><span>Batas aman per hari</span><SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} /></div><div><span>Belum dialokasikan</span><SensitiveMoney visible={balanceVisible} value={overview.unallocatedFunds || 0} /><small>{overview.unallocatedCount || 0} transaksi</small></div></div>
  </header>
);

const MobileQuickActions = () => <nav className="mobile-quick-grid" aria-label="Menu keuangan cepat">{QUICK_ACTIONS.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className="mobile-quick-action"><span><Icon aria-hidden="true" /></span><strong>{label}</strong></Link>)}</nav>;

const MobileInsightList = ({ title, items, balanceVisible, expense = false, emptyText, target, targetLabel }) => <section aria-labelledby={title.id}><h2 id={title.id}>{title.text}</h2>{items.length ? <ul>{items.map((item, index) => <li key={item.account_id || `${item.name}-${index}`}><span>{item.name}</span><SensitiveMoney visible={balanceVisible} value={expense ? item.amount : item.balance} tone={expense ? "negative" : undefined} /></li>)}</ul> : <p>{emptyText}</p>}<Link to={target}>{targetLabel}</Link></section>;
const MobileInsights = ({ accountBars, expenseBars, balanceVisible }) => <details className="mobile-finance-insights"><summary><span>Rincian rekening dan kategori</span><FiChevronDown aria-hidden="true" /></summary><div className="mobile-finance-insights__grid"><MobileInsightList title={{ id: "mobile-account-insights-title", text: "Saldo per rekening" }} items={accountBars} balanceVisible={balanceVisible} emptyText="Belum ada rekening aktif." target="/rekening" targetLabel="Kelola rekening" /><MobileInsightList title={{ id: "mobile-category-insights-title", text: "Pengeluaran per kategori" }} items={expenseBars} balanceVisible={balanceVisible} expense emptyText="Belum ada pengeluaran kategori." target="/laporan" targetLabel="Buka laporan" /></div></details>;

const MobileAlerts = ({ alerts }) => {
  const [open, setOpen] = useState(false);
  if (!alerts?.length) return null;
  const counts = alerts.reduce((result, alert) => ({ ...result, [alert.severity]: (result[alert.severity] || 0) + 1 }), {});
  const summary = [counts.danger ? `${counts.danger} penting` : "", counts.warning ? `${counts.warning} peringatan` : "", counts.info ? `${counts.info} pengingat` : ""].filter(Boolean).join(" · ");
  return <section className="mobile-finance-section mobile-alert-section" aria-labelledby="mobile-alerts-title">
    <button type="button" className="mobile-attention-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Perlu perhatian, ${alerts.length} item. ${summary}`}>
      <span className="mobile-attention-trigger__icon"><FiAlertTriangle aria-hidden="true" /></span>
      <span className="mobile-attention-trigger__copy"><strong id="mobile-alerts-title">Perlu perhatian <em>{alerts.length}</em></strong><small>{summary}</small></span>
      <FiChevronRight className="mobile-attention-trigger__chevron" aria-hidden="true" />
    </button>
    <AttentionSheet alerts={alerts} open={open} onClose={() => setOpen(false)} />
  </section>;
};

const MobileTransactionItem = ({ item, categoryLookup, transactionAccountLabel, balanceVisible, onOpenTransactionDetail }) => {
  const category = categoryLookup[item.category_id]; const Icon = transactionCategoryIcon(category, item.transaction_type); const title = item.description || item.merchant || category?.name || "Transaksi"; const sign = balanceVisible ? transactionSign(item.transaction_type) : "";
  return <button type="button" className="mobile-transaction-item" onClick={() => onOpenTransactionDetail(item.transaction_id)} aria-label={`Buka detail ${title}`}><span className={`mobile-transaction-icon mobile-transaction-icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span><span className="mobile-transaction-copy"><strong>{title}</strong><small>{transactionAccountLabel(item)} · {formatTransactionDate(item.transaction_date)}</small></span><span className={`mobile-transaction-amount money--${transactionTone(item.transaction_type)}`}>{sign}{sign ? " " : ""}<SensitiveMoney visible={balanceVisible} value={item.amount} tone={transactionTone(item.transaction_type)} /></span></button>;
};

const MobileTransactions = ({ filteredTransactions, activeFilterCount, categoryLookup, transactionAccountLabel, balanceVisible, onOpenFilters, onOpenTransaction, onOpenTransactionDetail }) => (
  <section className="mobile-finance-section" aria-labelledby="recent-transactions-title">
    <div className="mobile-section-heading mobile-section-heading--transactions"><div><h2 id="recent-transactions-title">Transaksi terakhir</h2>{activeFilterCount ? <span>{activeFilterCount} filter aktif</span> : null}</div><div className="mobile-section-heading__actions"><button type="button" className="mobile-dashboard-filter-button" onClick={onOpenFilters} aria-label={`Filter transaksi${activeFilterCount ? `, ${activeFilterCount} aktif` : ""}`}><FiSliders aria-hidden="true" /><span>Filter</span></button><Link to="/transaksi">Lihat semua</Link></div></div>
    {filteredTransactions.length ? <div className="mobile-transaction-list">{filteredTransactions.slice(0, 5).map((item) => <MobileTransactionItem key={item.transaction_id} item={item} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />)}</div> : <EmptyState title={activeFilterCount ? "Tidak ada transaksi yang cocok" : "Belum ada transaksi"} action={activeFilterCount ? <Button onClick={onOpenFilters}>Ubah filter</Button> : <Button variant="primary" onClick={onOpenTransaction}>Tambah transaksi</Button>} />}
  </section>
);

const MobileAllocation = ({ featuredEnvelope, featuredEnvelopeUsed, featuredEnvelopeMax, featuredEnvelopePercent, balanceVisible }) => featuredEnvelope ? <section className="mobile-allocation-card" aria-label={`Ringkasan alokasi ${featuredEnvelope.name}`}><div className="mobile-allocation-card__header"><span className="mobile-allocation-card__icon"><FiPieChart aria-hidden="true" /></span><div><h2>{featuredEnvelope.name}</h2><p><SensitiveMoney visible={balanceVisible} value={featuredEnvelopeUsed} /> terpakai dari <SensitiveMoney visible={balanceVisible} value={featuredEnvelopeMax} /></p></div><strong>{featuredEnvelopePercent}%</strong></div><ProgressBar value={featuredEnvelopeUsed} max={featuredEnvelopeMax} label={`Pemakaian ${featuredEnvelope.name}`} /><div className="mobile-allocation-card__footer"><span>Sisa <SensitiveMoney visible={balanceVisible} value={featuredEnvelope.remaining_amount || 0} /></span><Link to="/alokasi">Kelola alokasi</Link></div></section> : null;

const MobileFinanceDashboard = ({ overview, viewModel, displayName, balanceVisible, onToggleBalance, onRefresh, onOpenTransaction, onOpenFilters, onOpenTransactionDetail }) => {
  const { accountBars, expenseBars, filteredTransactions, activeFilterCount, categoryLookup, transactionAccountLabel, featuredEnvelope, featuredEnvelopeUsed, featuredEnvelopeMax, featuredEnvelopePercent } = viewModel;
  return <section className="mobile-finance-dashboard" aria-label="Ringkasan keuangan mobile"><h1 className="sr-only">Ringkasan Keuangan</h1><MobileFinanceHero overview={overview} displayName={displayName} balanceVisible={balanceVisible} onToggleBalance={onToggleBalance} onRefresh={onRefresh} /><div className="mobile-finance-content"><MobileQuickActions /><MobileInsights accountBars={accountBars} expenseBars={expenseBars} balanceVisible={balanceVisible} /><MobileAlerts alerts={overview.alerts} /><MobileTransactions filteredTransactions={filteredTransactions} activeFilterCount={activeFilterCount} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} balanceVisible={balanceVisible} onOpenFilters={onOpenFilters} onOpenTransaction={onOpenTransaction} onOpenTransactionDetail={onOpenTransactionDetail} /><MobileAllocation featuredEnvelope={featuredEnvelope} featuredEnvelopeUsed={featuredEnvelopeUsed} featuredEnvelopeMax={featuredEnvelopeMax} featuredEnvelopePercent={featuredEnvelopePercent} balanceVisible={balanceVisible} /></div></section>;
};

export default MobileFinanceDashboard;
