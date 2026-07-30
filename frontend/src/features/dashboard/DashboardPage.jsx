import { FiAlertCircle, FiArrowDownRight, FiArrowUpRight, FiClock, FiPlus, FiRefreshCw, FiShield } from "react-icons/fi";
import { useState } from "react";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import Button from "../../components/common/Button.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import BarChart from "../../components/charts/BarChart.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import TransactionForm from "../transactions/TransactionForm.jsx";

const DashboardPage = () => {
  const { overview, status, error, refresh } = useFinance();
  const [formOpen, setFormOpen] = useState(false);
  if (status === "loading" || status === "idle") return <LoadingScreen />;
  if (status === "error") return <ErrorState error={error} onRetry={refresh} />;
  if (!overview) return null;

  const expenseByCategory = overview.categoryExpenses || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`Periode ${overview.periodKey}`}
        title="Ringkasan keuangan"
        description="Saldo rekening, alokasi, kewajiban, dan arus kas dari satu sumber data."
        actions={<><Button icon={FiRefreshCw} onClick={refresh}>Sinkronkan</Button><Button variant="primary" icon={FiPlus} onClick={() => setFormOpen(true)}>Tambah transaksi</Button></>}
      />

      <section className="metric-grid" aria-label="Ringkasan saldo">
        <Card className="metric-card metric-card--primary"><span>Total saldo aktual</span><Money value={overview.totalBalance} /><small>Seluruh rekening aktif</small></Card>
        <Card className="metric-card"><span>Saldo aman digunakan</span><Money value={overview.safeToSpend} /><small>Batas aman/hari <Money value={overview.dailySafeToSpend || 0} /> · {overview.daysRemaining || 0} hari tersisa</small></Card>
        <Card className="metric-card"><span>Pemasukan bulan ini</span><Money value={overview.cashFlow.income} tone="positive" /><small><FiArrowUpRight /> Aktual diterima</small></Card>
        <Card className="metric-card"><span>Pengeluaran bulan ini</span><Money value={overview.cashFlow.expense} tone="negative" /><small><FiArrowDownRight /> Transfer tidak ikut dihitung</small></Card>
      </section>

      <section className="dashboard-grid">
        <Card className="panel panel--wide">
          <div className="panel__header"><div><p className="eyebrow">Kantong aktif</p><h2>Alokasi dana</h2></div><span>{overview.envelopes.length} kantong</span></div>
          <div className="envelope-list">
            {overview.envelopes.map((item) => (
              <article className="envelope-row" key={item.envelope_period_id}>
                <div><strong>{item.name}</strong><small><Money value={item.used_amount} /> terpakai dari <Money value={item.allocated_amount} /></small></div>
                <div><ProgressBar value={item.used_amount + Number(item.reserved_amount || 0)} max={item.allocated_amount} label={item.name} /><Money value={item.remaining_amount} /></div>
              </article>
            ))}
          </div>
        </Card>

        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Kontrol</p><h2>Perlu perhatian</h2></div><FiShield /></div>
          <div className="attention-list">
            <div><FiClock /><span>Kewajiban tersisa</span><Money value={overview.reservedBills} /></div>
            <div><FiAlertCircle /><span>Dana belum dialokasikan</span><Money value={overview.unallocatedFunds || 0} /></div>
            <div><FiAlertCircle /><span>Transaksi belum dialokasikan</span><strong>{overview.unallocatedCount} transaksi</strong></div>
            <div><FiRefreshCw /><span>Sinkron terakhir</span><time>{new Date(overview.lastSyncedAt).toLocaleString("id-ID")}</time></div>
          </div>
        </Card>

        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Rekening</p><h2>Saldo per rekening</h2></div></div>
          <div className="compact-list">
            {overview.accountBalances.map((item) => <div key={item.account_id}><span>{item.name}</span><Money value={item.balance} /></div>)}
          </div>
        </Card>

        <Card className="panel panel--wide">
          <div className="panel__header"><div><p className="eyebrow">Kebocoran kecil</p><h2>Pengeluaran bulan ini per kategori</h2></div></div>
          {expenseByCategory.length ? <BarChart data={expenseByCategory} label="Pengeluaran bulan berjalan berdasarkan kategori" /> : <p>Belum ada pengeluaran aktif.</p>}
        </Card>

        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Jadwal</p><h2>Kewajiban terdekat</h2></div></div>
          <div className="compact-list compact-list--stacked">
            {overview.recurring.slice(0, 4).map((item) => <div key={item.occurrence_id}><span><strong>{item.name}</strong><small>{item.due_date}</small></span><span><Money value={item.expected_amount} /><StatusBadge status={item.status} /></span></div>)}
          </div>
        </Card>
      </section>

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
};

export default DashboardPage;
