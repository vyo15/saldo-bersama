import { FiAlertCircle, FiEye, FiEyeOff, FiPlus } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import { AccountIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import PageInfoButton from "../../../components/common/PageInfoButton.jsx";
import { ACCOUNT_AVAILABLE_BALANCE_HINT } from "../../../shared/presentation/account.js";
import { scrollIntoViewWithMotionPreference } from "../../../shared/motion.js";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import { AccountVisual } from "../../accounts/components/AccountFinancialCard.jsx";
import { dashboardOwnershipBreakdown, dashboardSyncLabel } from "../dashboardPresentation.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

export const DashboardHeader = ({ overview, displayName, balanceVisible, onToggleBalance, onOpenQuickRecord }) => (
  <header className={dashboardClass("shared-dashboard__header")}>
    <div>
      <div className={dashboardClass("shared-dashboard__title-row")}>
        <h1>Hai, {displayName}</h1>
        <PageInfoButton title="Tentang Beranda">Saldo Keluarga merangkum rekening operasional Saya, Pasangan, dan Bersama. Hak menggunakan uang tetap mengikuti pemegang rekening.</PageInfoButton>
      </div>
      <p>{dashboardSyncLabel(overview.lastSyncedAt)}</p>
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
      <Button variant="primary" icon={FiPlus} onClick={onOpenQuickRecord}>Catat</Button>
    </div>
  </header>
);

export const PrimaryMetrics = ({ overview, model, balanceVisible }) => {
  const nonInvestmentBalance = overview.nonInvestmentBalance ?? model.accountBalances
    .filter((item) => item.account_type !== "investment")
    .reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const allocation = model.allocationSummary || {};
  const ownershipItems = dashboardOwnershipBreakdown(overview.familyBalanceBreakdown);

  return (
    <section className={dashboardClass("desktop-balance-card shared-panel")} aria-label="Ringkasan keuangan utama">
      <div className={dashboardClass("desktop-balance-card__topline")}>
        <span>Posisi keuangan</span>
      </div>

      <div className={dashboardClass("desktop-balance-card__hero")}>
        <div className={dashboardClass("desktop-balance-card__heading")}>
          <span>Saldo Keluarga</span>
          <SensitiveMoney visible={balanceVisible} value={overview.familyBalance ?? nonInvestmentBalance} />
          <small>Semua saldo operasional terlihat bersama; hak menggunakan uang tetap mengikuti pemilik rekening.</small>
          <div className={dashboardClass("desktop-family-breakdown")} aria-label="Rincian Saldo Keluarga">
            {ownershipItems.map((item) => <Link key={item.key} to="/rekening" state={{ ownershipFilter: item.key }}><span>{item.label}</span><strong><SensitiveMoney visible={balanceVisible} value={item.amount} /></strong></Link>)}
          </div>
        </div>
      </div>

      <div className={dashboardClass("desktop-balance-card__safe")}>
        <div>
          <span>Dana yang bisa kamu gunakan</span>
          <SensitiveMoney visible={balanceVisible} value={overview.usableFunds ?? overview.safeToSpend ?? 0} />
        </div>
        <div>
          <span>Aman dipakai / hari</span>
          <SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} />
        </div>
        <div>
          <span>Sisa di Alokasi</span>
          <SensitiveMoney visible={balanceVisible} value={allocation.remaining || 0} />
        </div>
      </div>
    </section>
  );
};

const AttentionTask = ({ alert }) => {
  const guidance = financialAlertGuidance(alert);
  return (
    <Link className={dashboardClass("desktop-attention-card__task")} to={guidance.to} state={guidance.state}>
      <span className={dashboardClass("desktop-attention-card__icon")}><FiAlertCircle aria-hidden="true" /></span>
      <span>
        <strong>{alert.title || alert.message}</strong>
        <small>{alert.message || "Tinjau kondisi ini agar data keuangan tetap sesuai."}</small>
      </span>
      <em>Tinjau</em>
    </Link>
  );
};

export const DashboardAttention = ({ alerts }) => {
  const visibleAlerts = alerts.slice(0, 3);
  return (
    <section className={dashboardClass("desktop-attention-card shared-panel")} aria-label="Perlu perhatian">
      <div className={dashboardClass("desktop-attention-card__heading")}>
        <div>
          <span>Perlu dilakukan</span>
          <strong>{alerts.length === 1 ? "1 tugas prioritas" : `${alerts.length} tugas prioritas`}</strong>
        </div>
        <span className={dashboardClass("desktop-attention-card__badge")}>{alerts.length} tugas</span>
      </div>
      <div className={dashboardClass("desktop-attention-card__list")}>
        {visibleAlerts.map((alert, index) => <AttentionTask key={alert.id || alert.alert_id || `${alert.type || "alert"}-${index}`} alert={alert} />)}
      </div>
      <Link to="/notifikasi" state={{ returnTo: "/" }}>{alerts.length > visibleAlerts.length ? `Lihat semua perhatian (+${alerts.length - visibleAlerts.length})` : "Lihat semua perhatian"}</Link>
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
        <h2 id="dashboard-accounts-title">Rekening keluarga</h2>
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
