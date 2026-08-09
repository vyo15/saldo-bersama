import { useRef } from "react";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import { parseRupiah } from "../../../domain/money.js";
import { BANK_TEMPLATE_OPTIONS, EWALLET_PROVIDER_OPTIONS } from "../../../shared/presentation/account.js";
import styles from "../AccountsPage.module.css";
import AccountFinancialCard from "./AccountFinancialCard.jsx";

const previewBalance = (value) => {
  try {
    return parseRupiah(value || "0");
  } catch {
    return 0;
  }
};

const ACCOUNT_TYPE_OPTIONS = Object.freeze([
  ["bank", "Bank"], ["cash", "Tunai"], ["ewallet", "E-wallet"], ["savings", "Tabungan"],
  ["emergency_fund", "Dana darurat"], ["sinking_fund", "Dana berkala"], ["investment", "Investasi"], ["other", "Lainnya"],
]);

const AccountOwnerOptions = ({ activeUsers }) => activeUsers.map((member) => (
  <option key={member.user_id} value={member.user_id}>{member.name || "Pengguna"}{member.is_current ? " · saya" : ""}</option>
));

const buildAccountPreview = ({ accountForm, activeUsers, defaultOwnerUserId, currentOwnerLabel }) => {
  const personal = accountForm.owner_scope === "personal";
  const ownerUserId = personal ? accountForm.owner_user_id || defaultOwnerUserId : "";
  return {
    name: accountForm.name || "Nama rekening",
    account_type: accountForm.account_type,
    account_number: accountForm.account_number,
    bank_template: accountForm.account_type === "bank" ? accountForm.bank_template : "generic",
    ewallet_template: accountForm.account_type === "ewallet" ? accountForm.ewallet_template : "generic",
    owner_scope: accountForm.owner_scope,
    owner_user_id: ownerUserId,
    owner_name: personal ? activeUsers.find((item) => item.user_id === ownerUserId)?.name || currentOwnerLabel : "",
    balance: previewBalance(accountForm.initial_balance),
    status: "active",
  };
};

const BankNumberField = ({ value, onChange }) => (
  <label className="field form-grid__full">
    <span>No rekening *</span>
    <input required inputMode="numeric" autoComplete="off" maxLength="34" pattern="[0-9 ]{6,34}" placeholder="Contoh: 1234567890123456" value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 34))} />
    <small>Disimpan sebagai digit saja dan hanya ditampilkan kepada pengguna yang terotorisasi.</small>
  </label>
);

const BankTemplateField = ({ value, onChange, compact = false }) => (
  <label className="field form-grid__full">
    <span>Template kartu bank</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>{BANK_TEMPLATE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
    <small>{compact ? "Template tersimpan sebagai tampilan kartu dan tidak mengubah nama rekening." : "Template hanya mengubah tampilan kartu dan tidak menambahkan nama bank ke nama rekening. PIN, CVV, nomor kartu debit, dan masa berlaku tidak disimpan."}</small>
  </label>
);

const EwalletProviderField = ({ value, onChange, compact = false }) => (
  <label className="field form-grid__full">
    <span>Provider E-wallet</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>{EWALLET_PROVIDER_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
    <small>{compact ? "Provider tersimpan terpisah dari nama rekening dan hanya menentukan identitas visual E-wallet." : "Pilih provider agar kartu memakai asset yang sesuai. Provider tidak mengubah nama, saldo, kepemilikan, atau aturan transaksi."}</small>
  </label>
);

const OwnerField = ({ activeUsers, value, fallbackLabel, ariaLabel, help, onChange }) => (
  <label className="field">
    <span>Pemilik rekening *</span>
    {activeUsers.length ? (
      <select required value={value} onChange={(event) => onChange(event.target.value)}><AccountOwnerOptions activeUsers={activeUsers} /></select>
    ) : <input value={fallbackLabel} disabled aria-label={ariaLabel} />}
    <small>{help}</small>
  </label>
);

const CreateIdentityFields = ({ accountForm, updateAccountForm, setAccountForm, defaultOwnerUserId, createNameInputRef }) => (
  <>
    <label className="field form-grid__full">
      <span>Nama rekening *</span>
      <input ref={createNameInputRef} required maxLength="100" placeholder="Contoh: Tabungan nikah" value={accountForm.name} onChange={(event) => updateAccountForm({ name: event.target.value })} />
      <small>{accountForm.account_type === "bank" ? "Gunakan nama sesuai tujuan rekening. Nama bank dipilih terpisah melalui template kartu." : accountForm.account_type === "ewallet" ? "Gunakan nama sesuai tujuan rekening. Provider E-wallet dipilih terpisah." : "Gunakan nama sesuai tujuan rekening."}</small>
    </label>
    {accountForm.account_type === "bank" ? <BankNumberField value={accountForm.account_number} onChange={(accountNumber) => updateAccountForm({ account_number: accountNumber })} /> : null}
    <label className="field">
      <span>Jenis</span>
      <select value={accountForm.account_type} onChange={(event) => {
        const accountType = event.target.value;
        setAccountForm((current) => ({
          ...current,
          account_type: accountType,
          account_number: accountType === "bank" ? current.account_number : "",
          bank_template: accountType === "bank" ? current.bank_template : "generic",
          ewallet_template: accountType === "ewallet" ? current.ewallet_template : "generic",
        }));
      }}>
        {ACCOUNT_TYPE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
    </label>
    <label className="field">
      <span>Kepemilikan</span>
      <select value={accountForm.owner_scope} onChange={(event) => {
        const ownerScope = event.target.value;
        setAccountForm((current) => ({ ...current, owner_scope: ownerScope, owner_user_id: ownerScope === "personal" ? current.owner_user_id || defaultOwnerUserId : "" }));
      }}>
        <option value="shared">Bersama</option><option value="personal">Pribadi</option>
      </select>
    </label>
  </>
);

const CreateOwnershipFields = ({ accountForm, activeUsers, defaultOwnerUserId, currentOwnerLabel, updateAccountForm }) => (
  <>
    {accountForm.owner_scope === "personal" ? (
      <OwnerField
        activeUsers={activeUsers}
        value={accountForm.owner_user_id || defaultOwnerUserId}
        fallbackLabel={currentOwnerLabel}
        ariaLabel="Pemilik rekening aktif"
        help={activeUsers.length ? "Nama pemilik ditampilkan kepada pasangan. Hak transaksi rekening personal tetap mengikuti pemilik." : "Daftar anggota belum dapat dimuat. Rekening pribadi baru akan dimiliki pengguna aktif dan tetap divalidasi oleh server."}
        onChange={(ownerUserId) => updateAccountForm({ owner_user_id: ownerUserId })}
      />
    ) : null}
    {accountForm.account_type === "bank" ? <BankTemplateField value={accountForm.bank_template} onChange={(bankTemplate) => updateAccountForm({ bank_template: bankTemplate })} /> : null}
    {accountForm.account_type === "ewallet" ? <EwalletProviderField value={accountForm.ewallet_template} onChange={(ewalletTemplate) => updateAccountForm({ ewallet_template: ewalletTemplate })} /> : null}
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

const CreateAccountModal = ({ open, onClose, submitting, accountPreview, accountForm, createNameInputRef, formProps }) => (
  <Modal open={open} onClose={onClose} title="Tambah rekening" description="Isi identitas rekening dan saldo awal. Nomor rekening tidak pernah diperlakukan sebagai nomor kartu debit." size="lg" initialFocusRef={createNameInputRef} footer={<><Button onClick={onClose} disabled={submitting}>Batal</Button><Button variant="primary" type="submit" form="create-account-form" loading={submitting}>Simpan rekening</Button></>}>
    <div className={styles.createAccountLayout}>
      <AccountFinancialCard account={accountPreview} variant="preview" templateOverride={accountForm.account_type === "bank" ? accountForm.bank_template : accountForm.account_type === "ewallet" ? accountForm.ewallet_template : "generic"} />
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

const EditOwnerField = ({ editAccount, activeUsers, defaultOwnerUserId, currentOwnerLabel, updateEditAccount }) => {
  if (editAccount?.owner_scope !== "personal") return null;
  const help = activeUsers.length ? "Kepemilikan hanya dapat dipindahkan bila rekening belum memiliki data terkait." : "Daftar anggota belum dapat dimuat. Pemilik rekening saat ini dipertahankan.";
  return <OwnerField activeUsers={activeUsers} value={editAccount?.owner_user_id || defaultOwnerUserId} fallbackLabel={editAccount?.owner_name || currentOwnerLabel} ariaLabel="Pemilik rekening saat ini" help={help} onChange={(ownerUserId) => updateEditAccount({ owner_user_id: ownerUserId })} />;
};

const EditAccountFields = ({ editAccount, updateEditAccount, setEditAccount, activeUsers, defaultOwnerUserId, currentOwnerLabel }) => (
  <>
    <label className="field form-grid__full"><span>Nama rekening *</span><input required maxLength="100" value={editAccount?.name || ""} onChange={(event) => updateEditAccount({ name: event.target.value })} /></label>
    <EditBankFields editAccount={editAccount} updateEditAccount={updateEditAccount} />
    <EditEwalletFields editAccount={editAccount} updateEditAccount={updateEditAccount} />
    <label className="field">
      <span>Kepemilikan</span>
      <select value={editAccount?.owner_scope || "shared"} onChange={(event) => {
        const ownerScope = event.target.value;
        setEditAccount((current) => current ? ({ ...current, owner_scope: ownerScope, owner_user_id: ownerScope === "personal" ? current.owner_user_id || defaultOwnerUserId : "" }) : current);
      }}><option value="shared">Bersama</option><option value="personal">Pribadi</option></select>
    </label>
    <EditOwnerField editAccount={editAccount} activeUsers={activeUsers} defaultOwnerUserId={defaultOwnerUserId} currentOwnerLabel={currentOwnerLabel} updateEditAccount={updateEditAccount} />
    <label className="checkbox-field"><input type="checkbox" checked={Boolean(editAccount?.allow_negative)} onChange={(event) => updateEditAccount({ allow_negative: event.target.checked })} /><span>Izinkan saldo negatif</span></label>
  </>
);

const EditAccountModal = ({ editAccount, setEditAccount, onSaveAccount, submitting, dialogState, fieldProps }) => (
  <Modal open={Boolean(editAccount)} onClose={() => !submitting && setEditAccount(null)} title="Edit rekening" description="Saldo awal dan jenis rekening tidak dapat diubah melalui form ini." footer={<><Button onClick={() => setEditAccount(null)} disabled={submitting}>Batal</Button><Button variant="primary" type="submit" form="edit-account-form" disabled={submitting}>{submitting ? "Menyimpan..." : "Simpan perubahan"}</Button></>}>
    <form id="edit-account-form" className="form-grid" onSubmit={onSaveAccount}>
      <EditAccountFields {...fieldProps} />
      {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
    </form>
  </Modal>
);

const AccountEditorDialogs = ({ createDialogOpen, onCloseCreate, accountForm, setAccountForm, onCreateAccount, editAccount, setEditAccount, onSaveAccount, dialogState, activeUsers, currentDatabaseUser, currentOwnerLabel }) => {
  const createNameInputRef = useRef(null);
  const submitting = dialogState.status === "submitting";
  const defaultOwnerUserId = currentDatabaseUser?.user_id || "";
  const accountPreview = buildAccountPreview({ accountForm, activeUsers, defaultOwnerUserId, currentOwnerLabel });
  const updateAccountForm = (updates) => setAccountForm((current) => ({ ...current, ...updates }));
  const updateEditAccount = (updates) => setEditAccount((current) => current ? ({ ...current, ...updates }) : current);
  const shared = { activeUsers, defaultOwnerUserId, currentOwnerLabel };
  return <><CreateAccountModal open={createDialogOpen} onClose={onCloseCreate} submitting={submitting} accountPreview={accountPreview} accountForm={accountForm} createNameInputRef={createNameInputRef} formProps={{ accountForm, setAccountForm, updateAccountForm, onCreateAccount, dialogState, createNameInputRef, ...shared }} /><EditAccountModal editAccount={editAccount} setEditAccount={setEditAccount} onSaveAccount={onSaveAccount} submitting={submitting} dialogState={dialogState} fieldProps={{ editAccount, setEditAccount, updateEditAccount, ...shared }} /></>;
};

export default AccountEditorDialogs;
