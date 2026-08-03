import { useState } from "react";
import {
  FiArchive,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiCopy,
  FiCreditCard,
  FiDollarSign,
  FiEdit2,
  FiShield,
  FiSmartphone,
  FiUser,
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
  accountNumberGroups,
  accountScopeLabel,
  accountTypeLabel,
  detectBankTemplate,
  formatAccountNumber,
} from "../accountPresentation.js";
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

const AccountVisual = ({ account, templateOverride, detail = false }) => {
  const detectedTemplate = templateOverride || detectBankTemplate(account);
  const image = account.account_type === "bank" ? BANK_IMAGES[detectedTemplate] : null;
  const Icon = ACCOUNT_ICONS[account.account_type] || FiCreditCard;
  const numberGroups = account.account_type === "bank" ? accountNumberGroups(account.account_number) : [];
  const holderName = accountCardholderName(account.name) || "Nama rekening";
  return (
    <div className={`${styles.visual} ${detail ? styles.detailVisual : ""}`} data-bank-template={detectedTemplate}>
      {image ? <img className={styles.cardImage} src={image} alt="" aria-hidden="true" loading={detail ? "eager" : "lazy"} /> : <div className={styles.genericCard} aria-hidden="true"><Icon /></div>}
      <div className={styles.cardFace}>
        {image ? <FiWifi className={styles.contactless} aria-hidden="true" /> : null}
        {account.account_type === "bank" ? (
          <div className={styles.accountNumber} aria-label={account.account_number ? `Nomor rekening ${formatAccountNumber(account.account_number, { placeholder: false })}` : "Nomor rekening belum diisi"}>
            {numberGroups.map((group, index) => <span key={`${group}-${index}`}>{group}</span>)}
          </div>
        ) : <div className={styles.accountType}>{accountTypeLabel(account.account_type)}</div>}
        <strong className={styles.holderName}>{holderName}</strong>
      </div>
    </div>
  );
};

const AccountFinancialCard = ({
  account,
  variant = "list",
  selected = false,
  ownerMode = false,
  templateOverride,
  onSelect,
  onClose,
  onReconcile,
  onEdit,
  onArchive,
}) => {
  const [copied, setCopied] = useState(false);
  const typeLabel = accountTypeLabel(account.account_type);
  const scopeLabel = accountScopeLabel(account.owner_scope);

  if (variant === "preview") return <div className={styles.preview}><AccountVisual account={account} templateOverride={templateOverride} detail /></div>;

  if (variant === "detail") {
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
    return (
      <aside className={styles.detailPanel} aria-label={`Detail rekening ${account.name}`}>
        <header className={styles.detailHeader}>
          <strong>Detail rekening</strong>
          <button type="button" className={styles.closeDetail} onClick={onClose} aria-label="Tutup detail rekening"><FiX aria-hidden="true" /></button>
        </header>
        <AccountVisual account={account} detail />
        <div className={styles.detailTitle}><div><h3>{account.name}</h3><p>{typeLabel}<span>•</span>{scopeLabel}</p></div><StatusBadge status={account.status || "active"} /></div>
        <dl className={styles.detailList}>
          <div><dt><FiCreditCard aria-hidden="true" />No rekening</dt><dd>{account.account_number ? <button type="button" className={styles.copyNumber} onClick={copyAccountNumber} title="Salin nomor rekening"><span>{copied ? "Tersalin" : formatAccountNumber(account.account_number, { placeholder: false })}</span><FiCopy aria-hidden="true" /></button> : "Belum diisi"}</dd></div>
          <div><dt><FiDollarSign aria-hidden="true" />Saldo saat ini</dt><dd className={styles.highlight}><Money value={account.balance || 0} /></dd></div>
          <div><dt><FiCreditCard aria-hidden="true" />Saldo awal</dt><dd><Money value={account.initial_balance || 0} /></dd></div>
          <div><dt><FiUser aria-hidden="true" />Kepemilikan</dt><dd>{scopeLabel}</dd></div>
          <div><dt><FiClock aria-hidden="true" />Terakhir diperbarui</dt><dd>{formatUpdatedAt(account.updated_at)}</dd></div>
        </dl>
        <div className={styles.detailActions} aria-label={`Aksi rekening ${account.name}`}>
          {account.status === "active" ? <Button icon={FiCheckCircle} onClick={() => onReconcile?.(account)}>Rekonsiliasi</Button> : null}
          {ownerMode && account.status === "active" ? <Button icon={FiEdit2} onClick={() => onEdit?.(account)}>Edit</Button> : null}
          {ownerMode && account.status === "active" ? <Button variant="danger" icon={FiArchive} onClick={() => onArchive?.(account)}>Arsipkan</Button> : null}
        </div>
      </aside>
    );
  }

  return (
    <article className={`${styles.accountItem} ${selected ? styles.selected : ""}`}>
      <button type="button" className={styles.accountSelect} onClick={() => onSelect?.(account)} aria-pressed={selected} aria-label={`Lihat detail rekening ${account.name}`}>
        <AccountVisual account={account} templateOverride={templateOverride} />
        <span className={styles.rowSummary}>
          <span className={styles.rowHeader}><span><strong>{account.name}</strong><small>{typeLabel}<i>•</i>{scopeLabel}</small></span><StatusBadge status={account.status || "active"} /></span>
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
