import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import VisualChoiceGroup from "../../../components/common/VisualChoiceGroup.jsx";
import { AdminIcon, BankIcon, CashIcon, EmergencyFundIcon, EwalletIcon, InvestmentIcon, OtherIcon, PersonIcon, SavingsIcon, SharedIcon, SinkingFundIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import { ACCOUNT_TYPES } from "../../../domain/constants.js";
import { ACCOUNT_TYPE_LABELS, BANK_TEMPLATE_OPTIONS, EWALLET_PROVIDER_OPTIONS, accountTypeUsesAutomaticName } from "../../../shared/presentation/account.js";
import styles from "./AccountEditorDialogs.module.css";

const ACCOUNT_TYPE_OPTIONS = Object.freeze([
  [ACCOUNT_TYPES.BANK, BankIcon],
  [ACCOUNT_TYPES.CASH, CashIcon],
  [ACCOUNT_TYPES.EWALLET, EwalletIcon],
  [ACCOUNT_TYPES.SAVINGS, SavingsIcon],
  [ACCOUNT_TYPES.EMERGENCY_FUND, EmergencyFundIcon],
  [ACCOUNT_TYPES.SINKING_FUND, SinkingFundIcon],
  [ACCOUNT_TYPES.INVESTMENT, InvestmentIcon],
  [ACCOUNT_TYPES.OTHER, OtherIcon],
].map(([value, icon]) => ({ value, label: ACCOUNT_TYPE_LABELS[value], icon })));

const ownershipSelectValue = (entity, fallbackUserId = "") => entity?.owner_scope === "personal"
  ? `user:${entity.owner_user_id || fallbackUserId}`
  : "shared";

const ownershipUpdates = (value, fallbackUserId = "") => {
  if (value === "shared") return { owner_scope: "shared", owner_user_id: "" };
  const userId = String(value || "").replace(/^user:/, "") || fallbackUserId;
  return { owner_scope: "personal", owner_user_id: userId };
};

const shortPersonLabel = (value, fallback = "Pengguna") => String(value || fallback).trim().split(/\s+/).filter(Boolean)[0] || fallback;

const AccountOwnershipField = ({ entity, activeUsers, defaultOwnerUserId, currentOwnerLabel, onChange }) => {
  const users = activeUsers.length ? activeUsers : defaultOwnerUserId ? [{ user_id: defaultOwnerUserId, name: currentOwnerLabel, role: "owner", is_current: true }] : [];
  const options = [
    { value: "shared", label: "Bersama", icon: SharedIcon },
    ...users.map((member) => ({
      value: `user:${member.user_id}`,
      label: member.is_current ? "Saya" : shortPersonLabel(member.name || member.email),
      icon: member.role === "owner" ? AdminIcon : PersonIcon,
    })),
  ];
  return <VisualChoiceGroup className="form-grid__full" legend="Kepemilikan *" name="account-ownership" value={ownershipSelectValue(entity, defaultOwnerUserId)} onChange={(value) => onChange(ownershipUpdates(value, defaultOwnerUserId))} options={options} columns={Math.min(options.length, 3)} mobileColumns={Math.min(options.length, 3)} compact wrapLabels required />;
};

const BankNumberField = ({ value, onChange, showHelper = true }) => (
  <label className="field form-grid__full">
    <span>No rekening *</span>
    <input required inputMode="numeric" autoComplete="off" maxLength="34" pattern="[0-9 ]{6,34}" placeholder="Contoh: 1234567890123456" value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 34))} />
    {showHelper ? <small>Hanya digit. Data tampil untuk pengguna yang terotorisasi.</small> : null}
  </label>
);

const BankTemplateField = ({ value, onChange, compact = false, showHelper = true }) => (
  <label className="field form-grid__full">
    <span>Template kartu bank</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>{BANK_TEMPLATE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
    {showHelper ? <small>{compact ? "Template tersimpan sebagai tampilan kartu dan tidak mengubah nama rekening." : "Template hanya mengubah tampilan. PIN, CVV, nomor kartu debit, dan masa berlaku tidak disimpan."}</small> : null}
  </label>
);

const EwalletProviderField = ({ value, onChange, compact = false, showHelper = true }) => (
  <label className="field form-grid__full">
    <span>Provider E-wallet</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>{EWALLET_PROVIDER_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
    {showHelper ? <small>{compact ? "Provider tersimpan terpisah dari nama rekening dan hanya menentukan identitas visual E-wallet." : "Provider hanya menentukan identitas visual E-wallet."}</small> : null}
  </label>
);

const CreateIdentityFields = ({ accountForm, updateAccountForm, setAccountForm }) => (
  <>
    <VisualChoiceGroup className="form-grid__full" legend="Jenis rekening" name="account-type" value={accountForm.account_type} onChange={(accountType) => {
      setAccountForm((current) => ({
        ...current,
        account_type: accountType,
        name: accountTypeUsesAutomaticName(accountType) ? "" : current.name,
        account_number: accountType === "bank" ? current.account_number : "",
        bank_template: accountType === "bank" ? current.bank_template : "generic",
        ewallet_template: accountType === "ewallet" ? current.ewallet_template : "generic",
      }));
    }} options={ACCOUNT_TYPE_OPTIONS} columns={4} mobileColumns={2} compact wrapLabels />
    {accountTypeUsesAutomaticName(accountForm.account_type) ? <div className={`${styles.autoNameGroup} form-grid__full`}>
      <p className={styles.autoNameNote}>Nama rekening dibuat otomatis dari jenis atau provider. Kepemilikan tetap menentukan apakah rekening Bersama atau Pribadi.</p>
      <details className={styles.qualifierDisclosure}>
        <summary>Butuh lebih dari satu? Tambah nama pembeda</summary>
        <label className="field">
          <span>Nama pembeda (opsional)</span>
          <input maxLength="60" placeholder="Contoh: Rumah" value={accountForm.name} onChange={(event) => updateAccountForm({ name: event.target.value })} />
          <small>Biarkan kosong bila satu rekening jenis ini sudah cukup.</small>
        </label>
      </details>
    </div> : <label className="field form-grid__full">
      <span>Nama rekening *</span>
      <input required maxLength="100" placeholder="Contoh: Tabungan nikah" value={accountForm.name} onChange={(event) => updateAccountForm({ name: event.target.value })} />
    </label>}
    {accountForm.account_type === "bank" ? <BankNumberField showHelper={false} value={accountForm.account_number} onChange={(accountNumber) => updateAccountForm({ account_number: accountNumber })} /> : null}
  </>
);

const CreateOwnershipFields = ({ accountForm, activeUsers, defaultOwnerUserId, currentOwnerLabel, updateAccountForm }) => (
  <>
    <AccountOwnershipField entity={accountForm} activeUsers={activeUsers} defaultOwnerUserId={defaultOwnerUserId} currentOwnerLabel={currentOwnerLabel} onChange={updateAccountForm} />
    {accountForm.account_type === "bank" ? <BankTemplateField showHelper={false} value={accountForm.bank_template} onChange={(bankTemplate) => updateAccountForm({ bank_template: bankTemplate })} /> : null}
    {accountForm.account_type === "ewallet" ? <EwalletProviderField showHelper={false} value={accountForm.ewallet_template} onChange={(ewalletTemplate) => updateAccountForm({ ewallet_template: ewalletTemplate })} /> : null}
    <MoneyInput id="initial-balance" label="Saldo awal" value={accountForm.initial_balance} onChange={(value) => updateAccountForm({ initial_balance: value })} />
    <label className="field"><span>Tanggal saldo awal</span><input type="date" value={accountForm.initial_balance_date} onChange={(event) => updateAccountForm({ initial_balance_date: event.target.value })} /></label>
    <label className="checkbox-field form-grid__full"><input type="checkbox" checked={accountForm.allow_negative} onChange={(event) => updateAccountForm({ allow_negative: event.target.checked })} /><span>Izinkan saldo negatif</span></label>
  </>
);

const CreateAccountForm = (props) => (
  <form id="create-account-form" className="form-grid" onSubmit={props.onCreateAccount}>
    <CreateIdentityFields {...props} />
    <CreateOwnershipFields {...props} />
    {props.dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{props.dialogState.error.message}</div> : null}
  </form>
);

const CreateAccountModal = ({ open, onClose, submitting, formProps, requestMode }) => (
  <Modal open={open} onClose={onClose} dismissible={!submitting} title={requestMode ? "Ajukan rekening" : "Tambah rekening"} description={requestMode ? "Rekening menjadi aktif setelah Administrator menyetujui pengajuan." : "Pilih jenis rekening."} size="md" footer={<><Button onClick={onClose} disabled={submitting}>Batal</Button><Button variant="primary" type="submit" form="create-account-form" loading={submitting}>{requestMode ? "Kirim pengajuan" : "Simpan rekening"}</Button></>}>
    <div className={styles.createAccountLayout}>
      <CreateAccountForm {...formProps} />
    </div>
  </Modal>
);

const EditBankFields = ({ editAccount, updateEditAccount }) => {
  if (editAccount?.account_type !== "bank") return null;
  return <>
    <BankNumberField value={editAccount?.account_number || ""} onChange={(accountNumber) => updateEditAccount({ account_number: accountNumber })} />
    <BankTemplateField compact value={editAccount?.bank_template || "generic"} onChange={(bankTemplate) => updateEditAccount({ bank_template: bankTemplate })} />
  </>;
};

const EditEwalletFields = ({ editAccount, updateEditAccount }) => {
  if (editAccount?.account_type !== "ewallet") return null;
  return <EwalletProviderField compact value={editAccount?.ewallet_template || "generic"} onChange={(ewalletTemplate) => updateEditAccount({ ewallet_template: ewalletTemplate })} />;
};

const EditAccountFields = ({ editAccount, updateEditAccount, activeUsers, defaultOwnerUserId, currentOwnerLabel }) => (
  <>
    <label className="field form-grid__full"><span>Nama rekening *</span><input required maxLength="100" value={editAccount?.name || ""} onChange={(event) => updateEditAccount({ name: event.target.value })} /></label>
    <EditBankFields editAccount={editAccount} updateEditAccount={updateEditAccount} />
    <EditEwalletFields editAccount={editAccount} updateEditAccount={updateEditAccount} />
    <AccountOwnershipField entity={editAccount} activeUsers={activeUsers} defaultOwnerUserId={defaultOwnerUserId} currentOwnerLabel={currentOwnerLabel} onChange={updateEditAccount} />
    <label className="checkbox-field"><input type="checkbox" checked={Boolean(editAccount?.allow_negative)} onChange={(event) => updateEditAccount({ allow_negative: event.target.checked })} /><span>Izinkan saldo negatif</span></label>
  </>
);

const EditAccountModal = ({ editAccount, setEditAccount, onSaveAccount, submitting, dialogState, fieldProps }) => (
  <Modal open={Boolean(editAccount)} onClose={() => setEditAccount(null)} dismissible={!submitting} title="Edit rekening" description="Saldo awal dan jenis rekening tidak dapat diubah melalui form ini." footer={<><Button onClick={() => setEditAccount(null)} disabled={submitting}>Batal</Button><Button variant="primary" type="submit" form="edit-account-form" disabled={submitting}>{submitting ? "Menyimpan..." : "Simpan perubahan"}</Button></>}>
    <form id="edit-account-form" className="form-grid" onSubmit={onSaveAccount}>
      <EditAccountFields {...fieldProps} />
      {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
    </form>
  </Modal>
);

const AccountEditorDialogs = ({ createDialogOpen, onCloseCreate, accountForm, setAccountForm, onCreateAccount, editAccount, setEditAccount, onSaveAccount, dialogState, activeUsers, currentDatabaseUser, currentOwnerLabel, requestMode = false }) => {
  const submitting = dialogState.status === "submitting";
  const defaultOwnerUserId = currentDatabaseUser?.user_id || "";
  const updateAccountForm = (updates) => setAccountForm((current) => ({ ...current, ...updates }));
  const updateEditAccount = (updates) => setEditAccount((current) => current ? ({ ...current, ...updates }) : current);
  const shared = { activeUsers, defaultOwnerUserId, currentOwnerLabel };
  return <><CreateAccountModal open={createDialogOpen} onClose={onCloseCreate} submitting={submitting} requestMode={requestMode} formProps={{ accountForm, setAccountForm, updateAccountForm, onCreateAccount, dialogState, ...shared }} /><EditAccountModal editAccount={editAccount} setEditAccount={setEditAccount} onSaveAccount={onSaveAccount} submitting={submitting} dialogState={dialogState} fieldProps={{ editAccount, setEditAccount, updateEditAccount, ...shared }} /></>;
};

export default AccountEditorDialogs;
