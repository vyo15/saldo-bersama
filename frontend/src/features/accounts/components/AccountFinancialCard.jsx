import { useState } from "react";
import {
  FiArchive,
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
  FiUsers,
  FiWifi,
} from "react-icons/fi";
import cashCard from "../../../assets/account-cards/cash.webp";
import savingsCard from "../../../assets/account-cards/savings.webp";
import emergencyFundCard from "../../../assets/account-cards/emergency_fund.webp";
import sinkingFundCard from "../../../assets/account-cards/sinking_fund.webp";
import investmentCard from "../../../assets/account-cards/investment.webp";
import otherCard from "../../../assets/account-cards/other.webp";
import bcaCard from "../../../assets/bank-cards/bca.webp";
import bniCard from "../../../assets/bank-cards/bni.webp";
import btnCard from "../../../assets/bank-cards/btn.webp";
import mandiriCard from "../../../assets/bank-cards/mandiri.webp";
import permataCard from "../../../assets/bank-cards/permata.webp";
import danaCard from "../../../assets/ewallet-cards/dana.webp";
import gopayCard from "../../../assets/ewallet-cards/gopay.webp";
import linkajaCard from "../../../assets/ewallet-cards/linkaja.webp";
import ovoCard from "../../../assets/ewallet-cards/ovo.webp";
import shopeepayCard from "../../../assets/ewallet-cards/shopeepay.webp";
import Button from "../../../components/common/Button.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import {
  accountCardOwnershipLabel,
  accountCardholderName,
  accountCardNumberGroups,
  accountOwnershipLabel,
  accountProviderLabel,
  accountTypeLabel,
  detectBankTemplate,
  detectEwalletTemplate,
  formatAccountNumber,
} from "../../../shared/presentation/account.js";
import styles from "./AccountFinancialCard.module.css";

const BANK_IMAGES = Object.freeze({ bca: bcaCard, bni: bniCard, btn: btnCard, mandiri: mandiriCard, permata: permataCard });
const EWALLET_IMAGES = Object.freeze({ shopeepay: shopeepayCard, dana: danaCard, gopay: gopayCard, ovo: ovoCard, linkaja: linkajaCard });
const ACCOUNT_TYPE_IMAGES = Object.freeze({ cash: cashCard, savings: savingsCard, emergency_fund: emergencyFundCard, sinking_fund: sinkingFundCard, investment: investmentCard, other: otherCard });
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

const visualModel = (account, templateOverride) => {
  const isBank = account.account_type === "bank";
  const isEwallet = account.account_type === "ewallet";
  const template = isBank ? templateOverride || detectBankTemplate(account) : "generic";
  const ewalletTemplate = isEwallet ? templateOverride || detectEwalletTemplate(account) : "generic";
  const hasEwalletImage = isEwallet && Boolean(EWALLET_IMAGES[ewalletTemplate]);
  const image = isBank
    ? BANK_IMAGES[template]
    : hasEwalletImage
      ? EWALLET_IMAGES[ewalletTemplate]
      : ACCOUNT_TYPE_IMAGES[account.account_type];
  return {
    template,
    ewalletTemplate,
    image: image || null,
    Icon: ACCOUNT_ICONS[account.account_type] || FiCreditCard,
    numberGroups: isBank ? accountCardNumberGroups(account.account_number) : [],
    holderName: accountCardholderName(account.name) || "Nama rekening",
    ownershipLabel: accountCardOwnershipLabel(account),
    typeLabel: accountTypeLabel(account.account_type),
    visualKind: isBank ? "bank" : hasEwalletImage ? "ewallet" : image ? account.account_type : "generic",
    isBank,
    hasEwalletImage,
  };
};

const visualClassName = ({ detail, carousel, stack }) => [
  styles.visual,
  detail && styles.detailVisual,
  carousel && styles.carouselVisual,
  stack && styles.stackVisual,
].filter(Boolean).join(" ");

const AccountNumberFace = ({ account, numberGroups }) => (
  <div className={styles.accountNumber} aria-label={account.account_number ? `Nomor rekening ${formatAccountNumber(account.account_number, { placeholder: false })}` : "Nomor rekening belum diisi"}>
    {numberGroups.map((group, index) => <span key={`${group}-${index}`}>{group}</span>)}
  </div>
);

export const AccountVisual = ({ account, templateOverride, detail = false, carousel = false, stack = false }) => {
  const model = visualModel(account, templateOverride);
  const eager = detail || carousel || stack;
  return (
    <div
      className={visualClassName({ detail, carousel, stack })}
      data-bank-template={model.isBank ? model.template : undefined}
      data-ewallet-template={account.account_type === "ewallet" ? model.ewalletTemplate : undefined}
      data-visual-kind={model.visualKind}
      data-has-image={model.image ? "true" : "false"}
    >
      {model.image ? <img className={styles.cardImage} src={model.image} alt="" aria-hidden="true" loading={eager ? "eager" : "lazy"} /> : <div className={styles.genericCard} aria-hidden="true"><model.Icon /></div>}
      <div className={styles.cardFace}>
        {carousel && !model.hasEwalletImage ? <span className={styles.cardOwnership}>{model.ownershipLabel}</span> : null}
        {model.hasEwalletImage ? <span className={styles.ewalletOwnership}>{model.ownershipLabel}</span> : null}
        {model.isBank && model.image ? <FiWifi className={styles.contactless} aria-hidden="true" /> : null}
        {model.isBank ? <AccountNumberFace account={account} numberGroups={model.numberGroups} /> : <div className={styles.accountType}>{model.typeLabel}</div>}
        <strong className={styles.holderName}>{model.holderName}</strong>
        {carousel && !model.hasEwalletImage ? <span className={styles.cardTypeLabel}>{model.typeLabel}</span> : null}
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

const accountCardModel = (account, ownerMode) => ({
    typeLabel: accountTypeLabel(account.account_type),
    ownershipLabel: accountOwnershipLabel(account),
    canManage: Boolean(account.can_manage ?? ownerMode),
    readOnly: Boolean(account.read_only),
    bankLabel: accountProviderLabel(account),
  });

const useAccountNumberCopy = (account) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!account.account_number) return;
    try {
      await navigator.clipboard.writeText(account.account_number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return { copied, copy };
};

const PreviewCard = ({ account, templateOverride }) => (
  <div className={styles.preview}><AccountVisual account={account} templateOverride={templateOverride} detail /></div>
);

const ReadOnlyBadge = () => <span className={styles.readOnlyBadge}><FiEye aria-hidden="true" />Hanya lihat</span>;

const MobileDetailHeading = ({ account, embedded, readOnly }) => (
  embedded ? (
    <><h2 id={`mobile-account-${account.account_id}`} className="sr-only">{account.name}</h2>{readOnly ? <div className={styles.mobileDetailBadges}><span className={styles.readOnlyBadge}><FiEye aria-hidden="true" />Hanya lihat</span></div> : null}</>
  ) : (
    <header className={styles.mobileDetailHeading}>
      <div><p>Detail rekening</p><h2 id={`mobile-account-${account.account_id}`}>{account.name}</h2></div>
      <div className={styles.mobileDetailBadges}><StatusBadge status={account.status || "active"} />{readOnly ? <ReadOnlyBadge /> : null}</div>
    </header>
  )
);

const MobileAccountNumber = ({ account, copied, onCopy }) => {
  if (!account.account_number) return <span>Belum diisi</span>;
  return (
    <button type="button" className={styles.mobileCopyNumber} onClick={onCopy} aria-label="Salin nomor rekening">
      <span>{copied ? "Tersalin" : maskedAccountNumber(account.account_number)}</span><FiCopy aria-hidden="true" />
    </button>
  );
};

const MobileDetailData = ({ account, model, copied, onCopy }) => (
  <dl className={styles.mobileDetailCard}>
    <MobileDetailRow icon={FiList} label="Bank / jenis"><span>{model.bankLabel}</span></MobileDetailRow>
        <MobileDetailRow icon={FiHash} label="No. rekening"><MobileAccountNumber account={account} copied={copied} onCopy={onCopy} /></MobileDetailRow>
    <MobileDetailRow icon={FiUsers} label="Kepemilikan"><span className={styles.detailPill}>{model.ownershipLabel}</span></MobileDetailRow>
    <MobileDetailRow icon={FiDollarSign} label="Saldo rekening"><strong className={styles.mobileMoney}><Money value={account.balance || 0} /></strong></MobileDetailRow>
    <MobileDetailRow icon={FiDollarSign} label="Dana tersedia"><strong className={styles.mobileMoney}><Money value={account.available_balance ?? account.balance ?? 0} /></strong></MobileDetailRow>
    <MobileDetailRow icon={FiDollarSign} label="Dalam kantong"><span><Money value={account.allocated_remaining || 0} /></span></MobileDetailRow>
    <MobileDetailRow icon={FiFlag} label="Saldo awal"><span><Money value={account.initial_balance || 0} /></span></MobileDetailRow>
    <MobileDetailRow icon={FiClock} label="Diperbarui"><span className={styles.mobileUpdatedAt}>{formatUpdatedAt(account.updated_at)}</span></MobileDetailRow>
  </dl>
);

const MobileDetailActions = ({ account, canManage, onEdit, onArchive, onViewTransactions }) => (
  <>
    <div className={`${styles.mobileDetailActions} ${!canManage ? styles.mobileDetailActionsSingle : ""}`}>
      {account.status === "active" && canManage ? <Button icon={FiEdit2} onClick={() => onEdit?.(account)}>Edit rekening</Button> : null}
      <Button variant="primary" icon={FiFileText} onClick={() => onViewTransactions?.(account)}>Lihat transaksi</Button>
    </div>
    {account.status === "active" && canManage ? (
      <div className={styles.mobileSecondaryActions} aria-label={`Tindakan tambahan rekening ${account.name}`}>
        <button type="button" className={styles.mobileDangerAction} onClick={() => onArchive?.(account)}><FiArchive aria-hidden="true" />Hapus / Arsipkan</button>
      </div>
    ) : null}
  </>
);

const MobileDetailCard = ({ account, model, embedded, copied, onCopy, onEdit, onArchive, onViewTransactions }) => (
  <section className={styles.mobileDetail} aria-labelledby={`mobile-account-${account.account_id}`} aria-label={`Detail rekening ${account.name}`}>
    <MobileDetailHeading account={account} embedded={embedded} readOnly={model.readOnly} />
    <MobileDetailData account={account} model={model} copied={copied} onCopy={onCopy} />
    {model.readOnly ? <p className={styles.readOnlyNotice}>Rekening ini transparan untuk pasangan, tetapi tindakan finansial tetap mengikuti capability dari server.</p> : null}
    <MobileDetailActions account={account} canManage={model.canManage} onEdit={onEdit} onArchive={onArchive} onViewTransactions={onViewTransactions} />
  </section>
);

const AccountFinancialCard = ({ account, variant = "preview", ownerMode = false, templateOverride, onEdit, onArchive, onViewTransactions, embedded = false }) => {
  const model = accountCardModel(account, ownerMode);
  const { copied, copy } = useAccountNumberCopy(account);
  if (variant === "preview") return <PreviewCard account={account} templateOverride={templateOverride} />;
  if (variant === "mobileDetail") return <MobileDetailCard account={account} model={model} embedded={embedded} copied={copied} onCopy={copy} onEdit={onEdit} onArchive={onArchive} onViewTransactions={onViewTransactions} />;
  return null;
};

export default AccountFinancialCard;
