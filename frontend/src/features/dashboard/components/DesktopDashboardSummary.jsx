import {
  FiAlertCircle,
  FiChevronRight,
  FiEye,
  FiEyeOff,
  FiHeart,
  FiPieChart,
  FiPlus,
  FiShield,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import { AccountIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import { ACCOUNT_AVAILABLE_BALANCE_HINT } from "../../../shared/presentation/account.js";
import { scrollIntoViewWithMotionPreference } from "../../../shared/motion.js";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import { AccountVisual } from "../../accounts/components/AccountFinancialCard.jsx";
import familyHero from "../../../assets/dashboard/family-hero.webp";
import foliageLeft from "../../../assets/dashboard/foliage-left.webp";
import foliageRight from "../../../assets/dashboard/foliage-right.webp";
import { dashboardOwnershipBreakdown, dashboardSyncLabel } from "../dashboardPresentation.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

export const DashboardHeader = ({ overview, displayName, onOpenQuickRecord }) => (
  <header className={dashboardClass("shared-dashboard__header desktop-reference-header")}>
    <div>
      <h1>Halo, {displayName}!</h1>
      <p>
        Yuk, kelola keuangan keluarga dengan lebih baik <span aria-hidden="true">✨</span>
        <span className={dashboardClass("desktop-reference-header__sync")}>{dashboardSyncLabel(overview.lastSyncedAt)}</span>
      </p>
    </div>
    <div className={dashboardClass("desktop-reference-header__actions")}>
      <Button variant="primary" icon={FiPlus} onClick={onOpenQuickRecord}>Catat</Button>
    </div>
  </header>
);

const ownershipIcon = (key) => {
  if (key === "self") return FiUser;
  if (key === "partner") return FiHeart;
  return FiUsers;
};

export const PrimaryMetrics = ({ overview, model, balanceVisible, onToggleBalance }) => {
  const nonInvestmentBalance = overview.nonInvestmentBalance ?? model.accountBalances
    .filter((item) => item.account_type !== "investment")
    .reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const allocation = model.allocationSummary || {};
  const ownershipItems = dashboardOwnershipBreakdown(overview.familyBalanceBreakdown);

  return (
    <div className={dashboardClass("desktop-reference-summary")}>
      <section className={dashboardClass("desktop-family-hero")} aria-label="Saldo Keluarga">
        <div className={dashboardClass("desktop-family-hero__copy")}>
          <div className={dashboardClass("desktop-family-hero__label")}>
            <span>Saldo Keluarga</span>
            <button
              type="button"
              className={dashboardClass("desktop-family-hero__visibility")}
              onClick={onToggleBalance}
              aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"}
              aria-pressed={!balanceVisible}
            >
              {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
            </button>
          </div>
          <SensitiveMoney visible={balanceVisible} value={overview.familyBalance ?? nonInvestmentBalance} />
          <span className={dashboardClass("desktop-family-hero__usable")}><small>Dana bisa digunakan</small><strong><SensitiveMoney visible={balanceVisible} value={overview.usableFunds ?? overview.safeToSpend ?? 0} /></strong></span>
        </div>

        <div className={dashboardClass("desktop-family-hero__art")} aria-hidden="true">
          <img className={dashboardClass("desktop-family-hero__foliage desktop-family-hero__foliage--left")} src={foliageLeft} width="900" height="675" decoding="async" alt="" />
          <img className={dashboardClass("desktop-family-hero__foliage desktop-family-hero__foliage--right")} src={foliageRight} width="900" height="675" decoding="async" alt="" />
          <img className={dashboardClass("desktop-family-hero__people")} src={familyHero} width="980" height="735" decoding="async" alt="" />
        </div>
      </section>

      <section className={dashboardClass("desktop-family-breakdown")} aria-label="Rincian Saldo Keluarga">
        {ownershipItems.map((item) => {
          const Icon = ownershipIcon(item.key);
          return (
            <Link key={item.key} className={dashboardClass(`desktop-owner-card desktop-owner-card--${item.key}`)} to="/rekening" state={{ ownershipFilter: item.key }}>
              <span className={dashboardClass("desktop-owner-card__icon")}><Icon aria-hidden="true" /></span>
              <span className={dashboardClass("desktop-owner-card__copy")}>
                <small>{item.label}</small>
                <strong><SensitiveMoney visible={balanceVisible} value={item.amount} /></strong>
              </span>
              <FiChevronRight className={dashboardClass("desktop-owner-card__chevron")} aria-hidden="true" />
            </Link>
          );
        })}
      </section>

      <section className={dashboardClass("desktop-reference-metrics")} aria-label="Ringkasan penggunaan dana">
        <Link className={dashboardClass("desktop-reference-metric desktop-reference-metric--safe")} to="/laporan">
          <span className={dashboardClass("desktop-reference-metric__icon")}><FiShield aria-hidden="true" /></span>
          <span>
            <small>Aman untuk hari ini</small>
            <strong><SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} /></strong>
          </span>
          <FiChevronRight aria-hidden="true" />
        </Link>
        <Link className={dashboardClass("desktop-reference-metric desktop-reference-metric--allocation")} to="/perencanaan/kantong">
          <span className={dashboardClass("desktop-reference-metric__icon")}><FiPieChart aria-hidden="true" /></span>
          <span>
            <small>Sisa alokasi bulan ini</small>
            <strong><SensitiveMoney visible={balanceVisible} value={allocation.remaining || 0} /></strong>
          </span>
          <FiChevronRight aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
};

const AttentionTask = ({ alert }) => {
  const guidance = financialAlertGuidance(alert);
  return (
    <Link className={dashboardClass("desktop-attention-row")} to={guidance.to} state={guidance.state}>
      <span className={dashboardClass("desktop-attention-row__icon")}><FiAlertCircle aria-hidden="true" /></span>
      <span className={dashboardClass("desktop-attention-row__copy")}>
        <strong>{alert.title || alert.message}</strong>
        <small>{alert.message || "Tinjau kondisi ini agar data keuangan tetap sesuai."}</small>
      </span>
      <span className={dashboardClass("desktop-attention-row__action")}>Tinjau</span>
      <FiChevronRight aria-hidden="true" />
    </Link>
  );
};

export const DashboardAttention = ({ alerts }) => {
  const visibleAlerts = alerts.slice(0, 3);
  if (!visibleAlerts.length) return null;
  return (
    <section className={dashboardClass("shared-panel desktop-reference-panel desktop-attention-panel")} aria-labelledby="dashboard-attention-title">
      <div className={dashboardClass("desktop-reference-panel__heading")}>
        <div>
          <h2 id="dashboard-attention-title">Perlu dilakukan</h2>
          <small>{alerts.length === 1 ? "1 tugas prioritas" : `${alerts.length} tugas prioritas`}</small>
        </div>
        <Link to="/notifikasi" state={{ returnTo: "/" }}>Lihat semua perhatian <FiChevronRight aria-hidden="true" /></Link>
      </div>
      <div className={dashboardClass("desktop-attention-list")}>
        {visibleAlerts.map((alert, index) => <AttentionTask key={alert.id || alert.alert_id || `${alert.type || "alert"}-${index}`} alert={alert} />)}
      </div>
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
