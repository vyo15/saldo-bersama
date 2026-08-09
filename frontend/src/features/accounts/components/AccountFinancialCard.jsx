import { useState } from "react";
import {
  FiArchive,
  FiChevronRight,
  FiClock,
  FiCopy,
  FiCreditCard,
  FiDollarSign,
  FiEdit2,
  FiEye,
  FiFileText,
  FiFlag,
  FiHash,
  FiList,
  FiShield,
  FiSmartphone,
  FiUser,
  FiUsers,
  FiWifi,
  FiX,
} from "react-icons/fi";
import bcaCard from "../../../assets/bank-cards/bca.webp";
import bniCard from "../../../assets/bank-cards/bni.webp";
import btnCard from "../../../assets/bank-cards/btn.webp";
import mandiriCard from "../../../assets/bank-cards/mandiri.webp";
import permataCard from "../../../assets/bank-cards/permata.webp";
import Button from "../../../components/common/Button.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import {
  accountCardholderName,
  accountCardNumberGroups,
  accountOwnerName,
  accountOwnershipLabel,
  accountProviderLabel,
  accountTypeLabel,
  detectBankTemplate,
  formatAccountNumber,
} from "../../../shared/presentation/account.js";
import styles from "./AccountFinancialCard.module.css";

const BANK_IMAGES = Object.freeze({ bca: bcaCard, bni: bniCard, btn: btnCard, mandiri: mandiriCard, permata: permataCard });
const ACCOUNT_ICONS = Object.freeze({
  bank: FiCreditCard,
  cash: FiDollarSign,
  ewallet: FiSmartphone,
  emergency_fund: FiShield,
  savings: FiDollarSign,
  sinking_fund: FiDollarSign,
  investment: FiDollarSign,
  other: FiCreditCard,
});

const formatUpdatedAt = (value) => {
  if (!value) return "Belum tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Belum tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date);
};

const maskedAccountNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `•••• ${digits.slice(-4)}` : "Belum diisi";
};

export const AccountVisual = ({ account, templateOverride, detail = false, carousel = false, stack = false }) => {
  const detectedTemplate = templateOverride || detectBankTemplate(account);
  const image = account.account_type === "bank" ? BANK_IMAGES[detectedTemplate] : null;
  const Icon = ACCOUNT_ICONS[account.account_type] || FiCreditCard;
  const numberGroups = account.account_type === "bank" ? accountCardNumberGroups(account.account_number) : [];
  const holderName = accountCardholderName(account.name) || "Nama rekening";
  const ownershipLabel = accountOwnershipLabel(account);

  return (
    <div className={`${styles.visual} ${detail ? styles.detailVisual : ""} ${carousel ? styles.carouselVisual : ""} ${stack ? styles.stackVisual : ""}`} data-bank-template={detectedTemplate}>
      {image ? <img className={styles.cardImage} src={image} alt="" aria-hidden="true" loading={detail || carousel || stack ? "eager" : "lazy"} /> : <div className={styles.genericCard} aria-hidden="true"><Icon /></div>}
      <div className={styles.cardFace}>
        {carousel ? <span className={styles.cardOwnership}>{ownershipLabel}</span> : null}
        {image ? <FiWifi className={styles.contactless} aria-hidden="true" /> : null}
        {account.account_type === "bank" ? (
          <div className={styles.accountNumber} aria-label={account.account_number ? `Nomor rekening ${formatAccountNumber(account.account_number, { placeholder: false })}` : "Nomor rekening belum diisi"}>
            {numberGroups.map((group, index) => <span key={`${group}-${index}`}>{group}</span>)}
          </div>
        ) : <div className={styles.accountType}>{accountTypeLabel(account.account_type)}</div>}
        <strong className={styles.holderName}>{holderName}</strong>
        {carousel ? <span className={styles.cardTypeLabel}>{accountTypeLabel(account.account_type)}</span> : null}
      </div>
    </div>
  );
};

const MobileDetailRow = ({ icon: Icon, label, children }) => (
  <div className={styles.mobileDetailRow}>
    <dt><span className={styles.mobileDetailIcon}><Icon aria-hidden="true" /></span><span>{label}</span></dt>
    <dd>{children}</dd>
  </div>
);

const AccountFinancialCard = ({
  account,
  variant = "list",
  selected = false,
  ownerMode = false,
  templateOverride,
  buttonRef,
  closeButtonRef,
  onSelect,
  onClose,
  onEdit,
  onArchive,
  onViewTransactions,
  embedded = false,
}) => {
  const [copied, setCopied] = useState(false);
  const typeLabel = accountTypeLabel(account.account_type);
  const ownershipLabel = accountOwnershipLabel(account);
  const ownerName = accountOwnerName(account);
  const canManage = Boolean(account.can_manage ?? ownerMode);
  const readOnly = Boolean(account.read_only);
  const bankLabel = accountProviderLabel(account);
  const ownerLabel = account.owner_scope === "personal" ? ownerName || "Belum tersedia" : "Kedua pengguna";

  const copyAccountNumber = async () => {
    if (!account.account_number) return;
    try {
      await navigator.clipboard.writeText(account.account_number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  if (variant === "preview") return <div className={styles.preview}><AccountVisual account={account} templateOverride={templateOverride} detail /></div>;

  if (variant === "carousel") {
    return (
      <article className={`${styles.carouselItem} ${selected ? styles.carouselItemSelected : ""}`}>
        <button
          ref={buttonRef}
          type="button"
          className={styles.carouselSelect}
          onClick={() => onSelect?.(account)}
          aria-pressed={selected}
          aria-label={`Pilih rekening ${account.name}`}
        >
          <AccountVisual account={account} templateOverride={templateOverride} carousel />
        </button>
      </article>
    );
  }

  if (variant === "mobileDetail") {
    return (
      <section className={styles.mobileDetail} aria-labelledby={`mobile-account-${account.account_id}`} aria-label={`Detail rekening ${account.name}`}>
        {embedded ? (
          <>
            <h2 id={`mobile-account-${account.account_id}`} className="sr-only">{account.name}</h2>
            {readOnly ? <div className={styles.mobileDetailBadges}><span className={styles.readOnlyBadge}><FiEye aria-hidden="true" />Hanya lihat</span></div> : null}
          </>
        ) : (
          <header className={styles.mobileDetailHeading}>
            <div>
              <p>Detail rekening</p>
              <h2 id={`mobile-account-${account.account_id}`}>{account.name}</h2>
            </div>
            <div className={styles.mobileDetailBadges}>
              <StatusBadge status={account.status || "active"} />
              {readOnly ? <span className={styles.readOnlyBadge}><FiEye aria-hidden="true" />Hanya lihat</span> : null}
            </div>
          </header>
        )}

        <dl className={styles.mobileDetailCard}>
          <MobileDetailRow icon={FiList} label="Bank / jenis"><span>{bankLabel}</span></MobileDetailRow>
          <MobileDetailRow icon={FiUser} label="Nama pemilik"><span>{ownerLabel}</span></MobileDetailRow>
          <MobileDetailRow icon={FiHash} label="No. rekening">
            {account.account_number ? (
              <button type="button" className={styles.mobileCopyNumber} onClick={copyAccountNumber} aria-label="Salin nomor rekening">
                <span>{copied ? "Tersalin" : maskedAccountNumber(account.account_number)}</span><FiCopy aria-hidden="true" />
              </button>
            ) : <span>Belum diisi</span>}
          </MobileDetailRow>
          <MobileDetailRow icon={FiUsers} label="Kepemilikan"><span className={styles.detailPill}>{ownershipLabel}</span></MobileDetailRow>
          <MobileDetailRow icon={FiDollarSign} label="Saldo saat ini"><strong className={styles.mobileMoney}><Money value={account.balance || 0} /></strong></MobileDetailRow>
          <MobileDetailRow icon={FiFlag} label="Saldo awal"><span><Money value={account.initial_balance || 0} /></span></MobileDetailRow>
          <MobileDetailRow icon={FiClock} label="Diperbarui"><span className={styles.mobileUpdatedAt}>{formatUpdatedAt(account.updated_at)}</span></MobileDetailRow>
        </dl>

        {readOnly ? <p className={styles.readOnlyNotice}>Rekening ini transparan untuk pasangan, tetapi tindakan finansial tetap mengikuti capability dari server.</p> : null}

        <div className={`${styles.mobileDetailActions} ${!canManage ? styles.mobileDetailActionsSingle : ""}`}>
          {account.status === "active" && canManage ? <Button icon={FiEdit2} onClick={() => onEdit?.(account)}>Edit rekening</Button> : null}
          <Button variant="primary" icon={FiFileText} onClick={() => onViewTransactions?.(account)}>Lihat transaksi</Button>
        </div>

        {account.status === "active" && canManage ? (
          <div className={styles.mobileSecondaryActions} aria-label={`Tindakan tambahan rekening ${account.name}`}>
            <button type="button" className={styles.mobileDangerAction} onClick={() => onArchive?.(account)}><FiArchive aria-hidden="true" />Arsipkan</button>
          </div>
        ) : null}
      </section>
    );
  }

  if (variant === "detail") {
    return (
      <aside className={styles.detailPanel} aria-label={`Detail rekening ${account.name}`}>
        <header className={styles.detailHeader}>
          <strong>Detail rekening</strong>
          <button ref={closeButtonRef} type="button" className={styles.closeDetail} onClick={onClose} aria-label="Tutup detail rekening"><FiX aria-hidden="true" /></button>
        </header>
        <AccountVisual account={account} detail />
        <div className={styles.detailTitle}>
          <div><h3>{account.name}</h3><p>{typeLabel}<span>•</span>{ownershipLabel}</p></div>
          <div className={styles.detailBadges}><StatusBadge status={account.status || "active"} />{readOnly ? <span className={styles.readOnlyBadge}><FiEye aria-hidden="true" />Hanya lihat</span> : null}</div>
        </div>
        <dl className={styles.detailList}>
          <div><dt><FiHash aria-hidden="true" />No rekening</dt><dd>{account.account_number ? <button type="button" className={styles.copyNumber} onClick={copyAccountNumber} title="Salin nomor rekening"><span>{copied ? "Tersalin" : formatAccountNumber(account.account_number, { placeholder: false })}</span><FiCopy aria-hidden="true" /></button> : "Belum diisi"}</dd></div>
          <div><dt><FiDollarSign aria-hidden="true" />Saldo saat ini</dt><dd className={styles.highlight}><Money value={account.balance || 0} /></dd></div>
          <div><dt><FiFlag aria-hidden="true" />Saldo awal</dt><dd><Money value={account.initial_balance || 0} /></dd></div>
          <div><dt><FiUser aria-hidden="true" />Pemilik rekening</dt><dd>{ownerLabel}</dd></div>
          <div><dt><FiUsers aria-hidden="true" />Kepemilikan</dt><dd>{ownershipLabel}</dd></div>
          <div><dt><FiClock aria-hidden="true" />Terakhir diperbarui</dt><dd>{formatUpdatedAt(account.updated_at)}</dd></div>
        </dl>
        {readOnly ? <p className={styles.readOnlyNotice}>Rekening ini transparan untuk pasangan, tetapi hanya pemilik atau owner yang berwenang dapat melakukan tindakan finansial.</p> : null}
        <div className={styles.detailActions} aria-label={`Aksi rekening ${account.name}`}>
          <Button variant="primary" icon={FiFileText} onClick={() => onViewTransactions?.(account)}>Lihat transaksi</Button>
          {account.status === "active" && canManage ? <Button icon={FiEdit2} onClick={() => onEdit?.(account)}>Edit</Button> : null}
          {account.status === "active" && canManage ? <Button variant="danger" icon={FiArchive} onClick={() => onArchive?.(account)}>Arsipkan</Button> : null}
        </div>
      </aside>
    );
  }

  return (
    <article className={`${styles.accountItem} ${selected ? styles.selected : ""}`}>
      <button ref={buttonRef} type="button" className={styles.accountSelect} onClick={() => onSelect?.(account)} aria-pressed={selected} aria-label={`Lihat detail rekening ${account.name}`}>
        <AccountVisual account={account} templateOverride={templateOverride} />
        <span className={styles.rowSummary}>
          <span className={styles.rowHeader}>
            <span><strong>{account.name}</strong><small>{typeLabel}<i>•</i>{ownershipLabel}</small></span>
            <span className={styles.rowBadges}><StatusBadge status={account.status || "active"} />{readOnly ? <span className={styles.readOnlyDot} title="Hanya lihat"><FiEye aria-hidden="true" /><span className="sr-only">Hanya lihat</span></span> : null}</span>
          </span>
          <span className={styles.rowMetrics}>
            <span><small>Saldo saat ini</small><b><Money value={account.balance || 0} /></b></span>
            <span><small>Saldo awal</small><b><Money value={account.initial_balance || 0} /></b></span>
            <span><small>Terakhir diperbarui</small><b>{formatUpdatedAt(account.updated_at)}</b></span>
          </span>
        </span>
        <FiChevronRight className={styles.chevron} aria-hidden="true" />
      </button>
    </article>
  );
};

export default AccountFinancialCard;
