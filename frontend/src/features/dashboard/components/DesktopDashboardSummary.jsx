import { FiAlertCircle, FiArrowDownRight, FiArrowUpRight, FiEye, FiEyeOff, FiPlus, FiShield } from "react-icons/fi";
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

const flowWidth = (value, maximum) => {
  const amount = Math.max(0, Number(value || 0));
  if (!amount || maximum <= 0) return 0;
  return Math.max(8, Math.round((amount / maximum) * 100));
};

export const DashboardHeader = ({ overview, displayName, balanceVisible, onToggleBalance, onOpenTransaction }) => (
  <header className={dashboardClass("shared-dashboard__header")}>
    <div>
      <div className={dashboardClass("shared-dashboard__title-row")}>
        <h1>Hai, {displayName}</h1>
        <PageInfoButton title="Tentang Beranda">
          Beranda desktop adalah ruang analisis utama: saldo, arus uang, transaksi, Alokasi, dan perhatian penting dirangkum tanpa mengubah alur cepat di mobile.
        </PageInfoButton>
      </div>
      <p>Command center keuangan keluarga · <strong>{formatPeriod(overview.periodKey)}</strong></p>
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
      <Button variant="primary" icon={FiPlus} onClick={onOpenTransaction}>Catat transaksi</Button>
    </div>
  </header>
);

export const PrimaryMetrics = ({ overview, model, balanceVisible }) => {
  const nonInvestmentBalance = overview.nonInvestmentBalance ?? model.accountBalances
    .filter((item) => item.account_type !== "investment")
    .reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const cashFlow = overview?.cashFlow || {};
  const cashIn = Number(cashFlow.income || 0) + Number(cashFlow.refund || 0);
  const cashOut = Number(cashFlow.expense || 0);
  const net = cashIn - cashOut;
  const maxFlow = Math.max(1, cashIn, cashOut);
  const allocation = model.allocationSummary || {};

  return (
    <section className={dashboardClass("desktop-balance-card shared-panel")} aria-label="Ringkasan keuangan utama">
      <div className={dashboardClass("desktop-balance-card__topline")}>
        <span>Posisi keuangan</span>
        <div className={dashboardClass("desktop-balance-card__sync")}>
          <FiShield aria-hidden="true" />
          <span aria-live="polite">{dashboardSyncLabel(overview.lastSyncedAt)}</span>
        </div>
      </div>

      <div className={dashboardClass("desktop-balance-card__hero")}>
        <div className={dashboardClass("desktop-balance-card__heading")}>
          <span>Dana Tersedia</span>
          <SensitiveMoney visible={balanceVisible} value={overview.safeToSpend || 0} />
          <small>Sisa uang yang aman dipakai setelah kebutuhan dan tagihan.</small>
          <div className={dashboardClass("desktop-balance-card__allocation-note")}>
            <span>{allocation.count || 0} Alokasi aktif</span>
            <strong>{Number(allocation.percentage || 0)}% terpakai / disiapkan</strong>
          </div>
        </div>

        <div className={dashboardClass("desktop-cashflow-visual")} aria-label="Arus uang bulan ini">
          <div className={dashboardClass("desktop-cashflow-visual__heading")}>
            <span>Arus uang bulan ini</span>
            <strong className={dashboardClass(net < 0 ? "is-negative" : "is-positive")}>
              {net < 0 ? <FiArrowDownRight aria-hidden="true" /> : <FiArrowUpRight aria-hidden="true" />}
              <SensitiveMoney visible={balanceVisible} value={Math.abs(net)} />
            </strong>
          </div>
          <div className={dashboardClass("desktop-cashflow-bar")}>
            <span><i style={{ width: `${flowWidth(cashIn, maxFlow)}%` }} /></span>
            <div><small>Masuk bulan ini</small><SensitiveMoney visible={balanceVisible} value={cashIn} tone="positive" /></div>
          </div>
          <div className={dashboardClass("desktop-cashflow-bar desktop-cashflow-bar--out")}>
            <span><i style={{ width: `${flowWidth(cashOut, maxFlow)}%` }} /></span>
            <div><small>Keluar bulan ini</small><SensitiveMoney visible={balanceVisible} value={cashOut} tone="negative" /></div>
          </div>
        </div>
      </div>

      <div className={dashboardClass("desktop-balance-card__safe")}>
        <div>
          <span>Saldo rekening</span>
          <SensitiveMoney visible={balanceVisible} value={nonInvestmentBalance} />
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
          <p>Tidak ada tindakan mendesak dari kondisi aktif saat ini. Kamu bisa lanjut menganalisis transaksi dan rencana bulan ini.</p>
        </div>
        <Link to="/notifikasi">Lihat semua perhatian</Link>
      </section>
    );
  }

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
      <Link to="/notifikasi">{alerts.length > visibleAlerts.length ? `Lihat semua perhatian (+${alerts.length - visibleAlerts.length})` : "Lihat semua perhatian"}</Link>
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
