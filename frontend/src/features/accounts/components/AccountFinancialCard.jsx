import { FiArchive, FiCheckCircle, FiCreditCard, FiDollarSign, FiEdit2, FiShield, FiSmartphone } from "react-icons/fi";
import bcaCard from "../../../assets/bank-cards/bca.webp";
import bniCard from "../../../assets/bank-cards/bni.webp";
import btnCard from "../../../assets/bank-cards/btn.webp";
import mandiriCard from "../../../assets/bank-cards/mandiri.webp";
import permataCard from "../../../assets/bank-cards/permata.webp";
import Button from "../../../components/common/Button.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import { accountScopeLabel, accountTypeLabel, detectBankTemplate } from "../accountPresentation.js";
import styles from "./AccountFinancialCard.module.css";

const BANK_IMAGES = Object.freeze({
  bca: bcaCard,
  bni: bniCard,
  btn: btnCard,
  mandiri: mandiriCard,
  permata: permataCard,
});

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

const AccountFinancialCard = ({
  account,
  ownerMode = false,
  preview = false,
  templateOverride,
  onReconcile,
  onEdit,
  onArchive,
}) => {
  const detectedTemplate = templateOverride || detectBankTemplate(account);
  const image = account.account_type === "bank" ? BANK_IMAGES[detectedTemplate] : null;
  const Icon = ACCOUNT_ICONS[account.account_type] || FiCreditCard;
  const typeLabel = accountTypeLabel(account.account_type);
  const scopeLabel = accountScopeLabel(account.owner_scope);

  return (
    <article className={`${styles.accountItem} ${preview ? styles.preview : ""}`} data-bank-template={detectedTemplate}>
      <div className={styles.visual}>
        {image ? (
          <img className={styles.cardImage} src={image} alt="" aria-hidden="true" loading={preview ? "eager" : "lazy"} />
        ) : (
          <div className={styles.genericCard} aria-hidden="true">
            <Icon />
            <span>{typeLabel}</span>
          </div>
        )}
        <div className={styles.accountOverlay}>
          <div className={styles.identity}>
            <span>{typeLabel} · {scopeLabel}</span>
            <strong>{account.name || "Nama rekening"}</strong>
          </div>
          <div className={styles.balance}>
            <span>Saldo saat ini</span>
            <Money value={account.balance || 0} />
          </div>
          <div className={styles.status}><StatusBadge status={account.status || "active"} /></div>
        </div>
      </div>

      {!preview ? (
        <footer className={styles.actions}>
          {account.status === "active" ? (
            <Button className={styles.reconcileButton} icon={FiCheckCircle} onClick={() => onReconcile?.(account)}>
              Rekonsiliasi
            </Button>
          ) : null}
          {ownerMode && account.status === "active" ? (
            <button type="button" className="icon-button" onClick={() => onEdit?.(account)} aria-label={`Edit rekening ${account.name}`}>
              <FiEdit2 aria-hidden="true" />
            </button>
          ) : null}
          {ownerMode && account.status === "active" ? (
            <button type="button" className="icon-button icon-button--danger" onClick={() => onArchive?.(account)} aria-label={`Arsipkan rekening ${account.name}`}>
              <FiArchive aria-hidden="true" />
            </button>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
};

export default AccountFinancialCard;
