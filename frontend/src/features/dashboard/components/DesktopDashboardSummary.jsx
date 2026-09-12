import { FiAlertCircle, FiEye, FiEyeOff, FiMinus, FiPieChart, FiPlus, FiShield, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import { AccountIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import PageInfoButton from "../../../components/common/PageInfoButton.jsx";
import { ACCOUNT_AVAILABLE_BALANCE_HINT } from "../../../shared/presentation/account.js";
import { scrollIntoViewWithMotionPreference } from "../../../shared/motion.js";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import { AccountVisual } from "../../accounts/components/AccountFinancialCard.jsx";
import { formatPeriod, dashboardSyncLabel } from "../dashboardPresentation.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

export const DashboardHeader = ({ overview, displayName, balanceVisible, onToggleBalance, onOpenTransaction }) => (
  <header className={dashboardClass("shared-dashboard__header")}>
    <div>
      <div className={dashboardClass("shared-dashboard__title-row")}>
        <h1>Hai, {displayName}</h1>
        <PageInfoButton title="Tentang Beranda">
          Beranda merangkum saldo, transaksi terbaru, alokasi, dan perhatian penting. Informasi di sini mengikuti data terbaru yang sudah diterima aplikasi.
        </PageInfoButton>
      </div>
      <p>Keuangan keluarga · <strong>{formatPeriod(overview.periodKey)}</strong></p>
    </div>
    <div className={dashboardClass("shared-dashboard__actions")}>
      <button
        type="button"
        className={dashboardClass("shared-icon-action")}
        onClick={onToggleBalance}
        aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"}
        aria-pressed={!balanceVisible}
      >
        {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
      </button>
      <Button variant="primary" icon={FiPlus} onClick={onOpenTransaction}>Tambah transaksi</Button>
    </div>
  </header>
);

export const PrimaryMetrics = ({ overview, model, balanceVisible }) => {
  const nonInvestmentBalance = overview.nonInvestmentBalance ?? model.accountBalances
    .filter((item) => item.account_type !== "investment")
    .reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const cashFlow = overview?.cashFlow || {};
  const netCashFlow = Number(cashFlow.income || 0) - Number(cashFlow.expense || 0);
  const NetCashFlowIcon = netCashFlow > 0 ? FiTrendingUp : netCashFlow < 0 ? FiTrendingDown : FiMinus;

  return (
    <section className={dashboardClass("desktop-balance-card shared-panel")} aria-label="Ringkasan keuangan utama">
      <div className={dashboardClass("desktop-balance-card__heading")}>
        <div>
          <span>Dana Tersedia</span>
          <SensitiveMoney visible={balanceVisible} value={overview.safeToSpend || 0} />
          <small>Setelah Alokasi Dana, dana terlindungi, dan komitmen di luar Alokasi</small>
        </div>
        <div className={dashboardClass("desktop-balance-card__sync")}>
          <FiShield aria-hidden="true" />
          <span aria-live="polite">{dashboardSyncLabel(overview.lastSyncedAt)}</span>
        </div>
      </div>

      <div className={dashboardClass("desktop-balance-card__safe")}>
        <div>
          <span>Saldo rekening</span>
          <SensitiveMoney visible={balanceVisible} value={nonInvestmentBalance} />
        </div>
        <div>
          <span>Batas harian</span>
          <SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} />
        </div>
      </div>

      <div className={dashboardClass("desktop-balance-card__secondary")}>
        <div>
          <span><NetCashFlowIcon aria-hidden="true" />Arus kas bersih</span>
          <SensitiveMoney
            visible={balanceVisible}
            value={netCashFlow}
            tone={netCashFlow < 0 ? "negative" : "positive"}
          />
        </div>
        <div>
          <span><FiPieChart aria-hidden="true" />Sisa kebutuhan</span>
          <SensitiveMoney visible={balanceVisible} value={model.remainingBudget} />
        </div>
      </div>
    </section>
  );
};

export const DashboardAttention = ({ alerts }) => {
  if (!alerts.length) {
    return (
      <section className={dashboardClass("desktop-attention-card desktop-attention-card--clear shared-panel")} aria-label="Kondisi keuangan">
        <div className={dashboardClass("desktop-attention-card__heading")}>
          <div>
            <span>Perlu dilakukan</span>
            <strong>Kondisi keuangan terkendali</strong>
          </div>
          <span className={dashboardClass("desktop-attention-card__badge")}>0 tugas</span>
        </div>
        <div className={dashboardClass("desktop-attention-card__clear")}>
          <FiShield aria-hidden="true" />
          <p>Tidak ada tindakan mendesak dari kondisi aktif saat ini.</p>
        </div>
        <Link to="/notifikasi">Lihat semua perhatian</Link>
      </section>
    );
  }

  const first = alerts[0];
  const guidance = financialAlertGuidance(first);
  return (
    <section className={dashboardClass("desktop-attention-card shared-panel")} aria-label="Perlu perhatian">
      <div className={dashboardClass("desktop-attention-card__heading")}>
        <div>
          <span>Perlu dilakukan</span>
          <strong>{alerts.length === 1 ? "1 tugas prioritas" : `${alerts.length} tugas prioritas`}</strong>
        </div>
        <span className={dashboardClass("desktop-attention-card__badge")}>{alerts.length} tugas</span>
      </div>
      <Link className={dashboardClass("desktop-attention-card__task")} to={guidance.to} state={guidance.state}>
        <span className={dashboardClass("desktop-attention-card__icon")}><FiAlertCircle aria-hidden="true" /></span>
        <span>
          <strong>{first.title || first.message}</strong>
          <small>{first.message || "Tinjau kondisi ini agar data keuangan tetap sesuai."}</small>
        </span>
        <em>Tinjau sekarang</em>
      </Link>
      <Link to="/notifikasi">Lihat semua perhatian</Link>
    </section>
  );
};

const selectDashboardAccount = (accountId, onSelectAccount) => {
  onSelectAccount(accountId);
  if (typeof document === "undefined") return;
  const target = Array.from(document.querySelectorAll("[data-dashboard-account]"))
    .find((element) => element.dataset.dashboardAccount === accountId);
  scrollIntoViewWithMotionPreference(target, { block: "nearest", inline: "nearest" });
};

export const AccountSelector = ({ accountBalances, selectedAccount, onSelectAccount, balanceVisible }) => (
  <section className={dashboardClass("shared-panel shared-account-panel")} aria-labelledby="dashboard-accounts-title">
    <div className={dashboardClass("shared-section-heading")}>
      <div>
        <p>Konteks transaksi</p>
        <h2 id="dashboard-accounts-title">Rekening</h2>
      </div>
      <Link to="/rekening">Kelola</Link>
    </div>
    {accountBalances.length ? (
      <>
        <p className={dashboardClass("shared-account-balance-note")}>{ACCOUNT_AVAILABLE_BALANCE_HINT}</p>
        <div className={dashboardClass("shared-account-carousel")} aria-label="Pilih rekening dashboard">
          {accountBalances.map((account) => {
            const selected = account.account_id === selectedAccount?.account_id;
            const cleanAccount = { ...account, name: account.account_name || account.name };
            return (
              <button
                key={account.account_id}
                type="button"
                className={dashboardClass(`shared-account-card${selected ? " is-selected" : ""}`)}
                onClick={() => selectDashboardAccount(account.account_id, onSelectAccount)}
                aria-pressed={selected}
                aria-label={`Pilih ${cleanAccount.name}`}
                data-dashboard-account={account.account_id}
              >
                <AccountVisual account={cleanAccount} carousel />
                <span className={dashboardClass("shared-account-card__summary")}>
                  <span>
                    <small>{account.account_type === "investment" ? "Saldo RDN" : "Saldo"}</small>
                    <SensitiveMoney visible={balanceVisible} value={account.balance} />
                  </span>
                  {account.account_type === "investment" ? null : (
                    <span>
                      <small>Tersedia</small>
                      <SensitiveMoney visible={balanceVisible} value={account.available_balance ?? account.balance ?? 0} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className={dashboardClass("shared-account-pagination")} aria-label="Posisi rekening terpilih">
          {accountBalances.map((account) => (
            <button
              key={account.account_id}
              type="button"
              className={dashboardClass(account.account_id === selectedAccount?.account_id ? "is-active" : "")}
              onClick={() => selectDashboardAccount(account.account_id, onSelectAccount)}
              aria-label={`Pilih ${account.account_name || account.name}`}
            />
          ))}
        </div>
      </>
    ) : (
      <div className={dashboardClass("shared-empty-state")}>
        <AccountIcon aria-hidden="true" />
        <strong>Belum ada rekening aktif</strong>
        <Link to="/rekening">Tambah rekening</Link>
      </div>
    )}
  </section>
);

