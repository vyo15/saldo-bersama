import { lazy, Suspense, useCallback, useState } from "react";
import LazyActionFallback from "../../../components/feedback/LazyActionFallback.jsx";
import { FiEye, FiEyeOff, FiList, FiPlus } from "react-icons/fi";
import { useNavigate } from "react-router";
import Money from "../../../components/common/Money.jsx";
import PageInfoButton from "../../../components/common/PageInfoButton.jsx";
import {
  ACCOUNT_BALANCE_GUIDANCE,
} from "../../../shared/presentation/account.js";
import { AccountVisual } from "./AccountFinancialCard.jsx";
import { accountAmbientTone, useMobileStackController } from "./useMobileAccountStack.js";
import styles from "./MobileAccountsExperience.module.css";

const MobileAccountActivity = lazy(() => import("./MobileAccountActivity.jsx"));
const MobileAccountTransferAction = lazy(() => import("./MobileAccountTransferAction.jsx"));

const OWNERSHIP_FILTERS = Object.freeze([
  ["all", "Semua"],
  ["self", "Saya"],
  ["partner", "Pasangan"],
  ["shared", "Bersama"],
]);

const PrivateMoney = ({ hidden, value }) => hidden
  ? <span className={styles.mobilePrivateMoney} aria-label="Nominal disembunyikan">••••••</span>
  : <Money value={value || 0} />;

const MobileBalanceSummary = ({ account }) => {
  const [hidden, setHidden] = useState(false);
  const investment = account.account_type === "investment";
  const available = account.available_balance ?? account.balance ?? 0;
  return (
    <section key={account.account_id} className={styles.mobileBalanceSummary} aria-label={`Ringkasan saldo ${account.name}`}>
      <div className={styles.mobileBalanceHeading}>
        <div className={styles.mobileBalanceLabel}>
          <span>{investment ? "Saldo RDN" : "Dana tersedia"}</span>
        </div>
        <button type="button" className={styles.mobilePrivacyButton} onClick={() => setHidden((value) => !value)} aria-label={hidden ? "Tampilkan nominal rekening" : "Sembunyikan nominal rekening"} aria-pressed={hidden}>
          {hidden ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
        </button>
      </div>
      <strong className={styles.mobileAvailableValue}><PrivateMoney hidden={hidden} value={investment ? account.balance : available} /></strong>
      <div className={styles.mobileBalanceStats}>
        {investment ? <div><strong>Investasi</strong><span>Tujuan dana</span></div> : <>
          <div><strong><PrivateMoney hidden={hidden} value={account.balance || 0} /></strong><span>Saldo</span></div>
          <div><strong><PrivateMoney hidden={hidden} value={account.allocated_remaining || 0} /></strong><span>Dialokasikan</span></div>
        </>}
      </div>
    </section>
  );
};

const MobileQuickActions = ({ account, bootstrap, onTransferSaved, onViewTransactions }) => (
  <div key={account.account_id} className={styles.mobileQuickActions} aria-label={`Aksi cepat rekening ${account.name}`}>
    <button type="button" className={styles.mobileQuickAction} onClick={() => onViewTransactions(account)}><FiList aria-hidden="true" /><span>Riwayat</span></button>
    <Suspense fallback={<span className={styles.mobileQuickActionPlaceholder} aria-hidden="true" />}>
      <MobileAccountTransferAction bootstrap={bootstrap} selectedAccount={account} onTransferSaved={onTransferSaved} onViewTransactions={onViewTransactions} />
    </Suspense>
  </div>
);

const MobileAccountsExperience = ({ accounts, selectedAccount, selectedAccountId, ownershipFilter, onOwnershipFilterChange, ownerMode, openCreateDialog, setMobileAccountSheet, setSelectedAccountId, bootstrap, onTransferSaved }) => {
  const navigate = useNavigate();
  const stack = useMobileStackController({ accounts, selectedAccountId, setSelectedAccountId, setMobileAccountSheet });
  const {
    refs: { cardRefs: mobileStackCardRefs, stageRef: mobileStackStageRef, statusRef: mobileStackStatusRef },
    handleMobileStackPointerDown, handleMobileStackPointerMove, finishMobileStackPointer, cancelMobileStackPointer,
    handleMobileStackKeyDown, selectMobileStackAccount, selectMobileStackIndex,
  } = stack;
  const onViewTransactions = useCallback((item, period) => navigate("/transaksi", { state: { accountId: item.account_id, period } }), [navigate]);
  const ambientTone = accountAmbientTone(selectedAccount);

  return <div className={styles.mobileAccountExperience}>
    <section className={styles.mobileStackPanel} data-account-tone={ambientTone} aria-labelledby="mobile-account-stack-title">
      <header className={styles.mobileStackHeader}>
        <div className={styles.mobileStackHeaderCopy}>
          <strong id="mobile-account-stack-title" className={styles.mobileStackHeaderTitle}>Rekening</strong>
          <PageInfoButton title="Tentang Rekening" label="Tentang Rekening" className={styles.mobileStackHeaderInfoButton}>Kelola seluruh rekening keluarga—yang dipegang Anda, pasangan, maupun bersama. {ACCOUNT_BALANCE_GUIDANCE}</PageInfoButton>
        </div>
        <div className={styles.mobileStackHeaderActions}>
          {ownerMode ? <button type="button" className={`${styles.mobileStackHeaderButton} ${styles.mobileStackHeaderButtonPrimary}`} data-preload-action="accountEditor" onClick={openCreateDialog} aria-label="Tambah rekening" title="Tambah rekening"><FiPlus aria-hidden="true" /><span>Tambah</span></button> : null}
        </div>
      </header>

      <div className={styles.mobileOwnershipFilters} role="group" aria-label="Filter kepemilikan rekening">
        {OWNERSHIP_FILTERS.map(([value, label]) => <button key={value} type="button" className={styles.mobileOwnershipFilter} aria-pressed={ownershipFilter === value} onClick={() => onOwnershipFilterChange(value)}>{label}</button>)}
      </div>

      <div ref={mobileStackStageRef} className={styles.mobileStackStage} tabIndex={0} aria-label="Rekening aktif. Geser kartu ke kiri atau kanan untuk mengganti rekening" aria-describedby="mobile-account-stack-hint" onKeyDown={handleMobileStackKeyDown}>
        <div className={styles.mobileStackAmbient} aria-hidden="true" />
        {accounts.map((account, index) => (
          <button key={`mobile-stack-${account.account_id}`} ref={(node) => { if (node) mobileStackCardRefs.current.set(account.account_id, node); else mobileStackCardRefs.current.delete(account.account_id); }}
            type="button" className={styles.mobileStackCard} aria-label={`Lihat detail rekening ${account.name}`} aria-pressed={account.account_id === selectedAccount?.account_id}
            onPointerDown={handleMobileStackPointerDown} onPointerMove={handleMobileStackPointerMove} onPointerUp={finishMobileStackPointer}
            onPointerCancel={cancelMobileStackPointer} onClick={() => selectMobileStackAccount(account, index)}>
            <AccountVisual account={account} carousel stack />
          </button>
        ))}
      </div>

      {accounts.length > 1 ? <div className={styles.mobileCarouselDots} aria-label="Pilih rekening">
        {accounts.map((account, index) => <button key={`mobile-dot-${account.account_id}`} type="button" className={styles.mobileCarouselDot} aria-label={`Pilih rekening ${account.name}`} aria-current={account.account_id === selectedAccount?.account_id ? "true" : undefined} onClick={() => selectMobileStackIndex(index)} />)}
      </div> : null}

      {selectedAccount ? <>
        <MobileBalanceSummary account={selectedAccount} />
        <MobileQuickActions account={selectedAccount} bootstrap={bootstrap} onTransferSaved={onTransferSaved} onViewTransactions={onViewTransactions} />
      </> : null}

      <p id="mobile-account-stack-hint" className="sr-only">Geser kartu aktif ke kiri atau kanan, gunakan tombol panah kiri dan kanan, atau indikator posisi. Tekan kartu aktif untuk membuka detail.</p>
      <p ref={mobileStackStatusRef} id="mobile-account-stack-status" className="sr-only" aria-live="polite" />
    </section>
    {selectedAccount ? <Suspense fallback={<LazyActionFallback label="Menyiapkan aktivitas rekening..." />}><MobileAccountActivity key={selectedAccount.account_id} selectedAccount={selectedAccount} bootstrap={bootstrap} onViewTransactions={onViewTransactions} /></Suspense> : null}
  </div>;
};

export default MobileAccountsExperience;
