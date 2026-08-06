import { useRef } from "react";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import { parseRupiah } from "../../../domain/money.js";
import { BANK_TEMPLATE_OPTIONS } from "../accountPresentation.js";
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
  ["bank", "Bank"],
  ["cash", "Tunai"],
  ["ewallet", "E-wallet"],
  ["savings", "Tabungan"],
  ["emergency_fund", "Dana darurat"],
  ["sinking_fund", "Dana berkala"],
  ["investment", "Investasi"],
  ["other", "Lainnya"],
]);

const AccountEditorDialogs = ({
  createDialogOpen,
  onCloseCreate,
  accountForm,
  setAccountForm,
  onCreateAccount,
  editAccount,
  setEditAccount,
  onSaveAccount,
  dialogState,
  activeUsers,
  currentDatabaseUser,
  currentOwnerLabel,
}) => {
  const createNameInputRef = useRef(null);
  const submitting = dialogState.status === "submitting";
  const defaultOwnerUserId = currentDatabaseUser?.user_id || "";
  const accountPreview = {
    name: accountForm.name || "Nama rekening",
    account_type: accountForm.account_type,
    account_number: accountForm.account_number,
    bank_template: accountForm.account_type === "bank" ? accountForm.bank_template : "generic",
    owner_scope: accountForm.owner_scope,
    owner_user_id: accountForm.owner_scope === "personal"
      ? accountForm.owner_user_id || defaultOwnerUserId
      : "",
    owner_name: accountForm.owner_scope === "personal"
      ? activeUsers.find((item) => item.user_id === (accountForm.owner_user_id || defaultOwnerUserId))?.name || currentOwnerLabel
      : "",
    balance: previewBalance(accountForm.initial_balance),
    status: "active",
  };

  const updateAccountForm = (updates) => {
    setAccountForm((current) => ({ ...current, ...updates }));
  };

  const updateEditAccount = (updates) => {
    setEditAccount((current) => current ? ({ ...current, ...updates }) : current);
  };

  return (
    <>
      <Modal
        open={createDialogOpen}
        onClose={onCloseCreate}
        title="Tambah rekening"
        description="Isi identitas rekening dan saldo awal. Nomor rekening tidak pernah diperlakukan sebagai nomor kartu debit."
        size="lg"
        initialFocusRef={createNameInputRef}
        footer={(
          <>
            <Button onClick={onCloseCreate} disabled={submitting}>Batal</Button>
            <Button variant="primary" type="submit" form="create-account-form" loading={submitting}>Simpan rekening</Button>
          </>
        )}
      >
        <div className={styles.createAccountLayout}>
          <AccountFinancialCard
            account={accountPreview}
            variant="preview"
            templateOverride={accountForm.account_type === "bank" ? accountForm.bank_template : "generic"}
          />
          <form id="create-account-form" className="form-grid" onSubmit={onCreateAccount}>
            <label className="field form-grid__full">
              <span>Nama rekening *</span>
              <input
                ref={createNameInputRef}
                required
                maxLength="100"
                placeholder="Contoh: Tabungan nikah"
                value={accountForm.name}
                onChange={(event) => updateAccountForm({ name: event.target.value })}
              />
              <small>Gunakan nama sesuai tujuan rekening. Nama bank dipilih terpisah melalui template kartu.</small>
            </label>
            {accountForm.account_type === "bank" ? (
              <label className="field form-grid__full">
                <span>No rekening *</span>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength="34"
                  pattern="[0-9 ]{6,34}"
                  placeholder="Contoh: 1234567890123456"
                  value={accountForm.account_number}
                  onChange={(event) => updateAccountForm({ account_number: event.target.value.replace(/\D/g, "").slice(0, 34) })}
                />
                <small>Disimpan sebagai digit saja dan hanya ditampilkan kepada pengguna yang terotorisasi.</small>
              </label>
            ) : null}
            <label className="field">
              <span>Jenis</span>
              <select
                value={accountForm.account_type}
                onChange={(event) => {
                  const accountType = event.target.value;
                  setAccountForm((current) => ({
                    ...current,
                    account_type: accountType,
                    account_number: accountType === "bank" ? current.account_number : "",
                    bank_template: accountType === "bank" ? current.bank_template : "generic",
                  }));
                }}
              >
                {ACCOUNT_TYPE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Kepemilikan</span>
              <select
                value={accountForm.owner_scope}
                onChange={(event) => {
                  const ownerScope = event.target.value;
                  setAccountForm((current) => ({
                    ...current,
                    owner_scope: ownerScope,
                    owner_user_id: ownerScope === "personal" ? current.owner_user_id || defaultOwnerUserId : "",
                  }));
                }}
              >
                <option value="shared">Bersama</option>
                <option value="personal">Pribadi</option>
              </select>
            </label>
            {accountForm.owner_scope === "personal" ? (
              <label className="field">
                <span>Pemilik rekening *</span>
                {activeUsers.length ? (
                  <select
                    required
                    value={accountForm.owner_user_id || defaultOwnerUserId}
                    onChange={(event) => updateAccountForm({ owner_user_id: event.target.value })}
                  >
                    {activeUsers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.name || "Pengguna"}{member.is_current ? " · saya" : ""}
                      </option>
                    ))}
                  </select>
                ) : <input value={currentOwnerLabel} disabled aria-label="Pemilik rekening aktif" />}
                <small>{activeUsers.length ? "Nama pemilik ditampilkan kepada pasangan. Hak transaksi rekening personal tetap mengikuti pemilik." : "Daftar anggota belum dapat dimuat. Rekening pribadi baru akan dimiliki pengguna aktif dan tetap divalidasi oleh server."}</small>
              </label>
            ) : null}
            {accountForm.account_type === "bank" ? (
              <label className="field form-grid__full">
                <span>Template kartu bank</span>
                <select value={accountForm.bank_template} onChange={(event) => updateAccountForm({ bank_template: event.target.value })}>
                  {BANK_TEMPLATE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
                <small>Template hanya mengubah tampilan kartu dan tidak menambahkan nama bank ke nama rekening. PIN, CVV, nomor kartu debit, dan masa berlaku tidak disimpan.</small>
              </label>
            ) : null}
            <MoneyInput
              id="initial-balance"
              label="Saldo awal"
              value={accountForm.initial_balance}
              onChange={(value) => updateAccountForm({ initial_balance: value })}
            />
            <label className="field">
              <span>Tanggal saldo awal</span>
              <input type="date" value={accountForm.initial_balance_date} onChange={(event) => updateAccountForm({ initial_balance_date: event.target.value })} />
            </label>
            <label className="checkbox-field form-grid__full">
              <input type="checkbox" checked={accountForm.allow_negative} onChange={(event) => updateAccountForm({ allow_negative: event.target.checked })} />
              <span>Izinkan saldo negatif</span>
            </label>
            {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
          </form>
        </div>
      </Modal>

      <Modal
        open={Boolean(editAccount)}
        onClose={() => !submitting && setEditAccount(null)}
        title="Edit rekening"
        description="Saldo awal dan jenis rekening tidak dapat diubah melalui form ini."
        footer={(
          <>
            <Button onClick={() => setEditAccount(null)} disabled={submitting}>Batal</Button>
            <Button variant="primary" type="submit" form="edit-account-form" disabled={submitting}>
              {submitting ? "Menyimpan..." : "Simpan perubahan"}
            </Button>
          </>
        )}
      >
        <form id="edit-account-form" className="form-grid" onSubmit={onSaveAccount}>
          <label className="field form-grid__full">
            <span>Nama rekening *</span>
            <input required maxLength="100" value={editAccount?.name || ""} onChange={(event) => updateEditAccount({ name: event.target.value })} />
          </label>
          {editAccount?.account_type === "bank" ? (
            <label className="field form-grid__full">
              <span>No rekening *</span>
              <input
                required
                inputMode="numeric"
                autoComplete="off"
                maxLength="34"
                pattern="[0-9 ]{6,34}"
                value={editAccount?.account_number || ""}
                onChange={(event) => updateEditAccount({ account_number: event.target.value.replace(/\D/g, "").slice(0, 34) })}
              />
            </label>
          ) : null}
          {editAccount?.account_type === "bank" ? (
            <label className="field form-grid__full">
              <span>Template kartu bank</span>
              <select value={editAccount?.bank_template || "generic"} onChange={(event) => updateEditAccount({ bank_template: event.target.value })}>
                {BANK_TEMPLATE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
              <small>Template tersimpan sebagai tampilan kartu dan tidak mengubah nama rekening.</small>
            </label>
          ) : null}
          <label className="field">
            <span>Kepemilikan</span>
            <select
              value={editAccount?.owner_scope || "shared"}
              onChange={(event) => {
                const ownerScope = event.target.value;
                setEditAccount((current) => current ? ({
                  ...current,
                  owner_scope: ownerScope,
                  owner_user_id: ownerScope === "personal" ? current.owner_user_id || defaultOwnerUserId : "",
                }) : current);
              }}
            >
              <option value="shared">Bersama</option>
              <option value="personal">Pribadi</option>
            </select>
          </label>
          {editAccount?.owner_scope === "personal" ? (
            <label className="field">
              <span>Pemilik rekening *</span>
              {activeUsers.length ? (
                <select
                  required
                  value={editAccount?.owner_user_id || defaultOwnerUserId}
                  onChange={(event) => updateEditAccount({ owner_user_id: event.target.value })}
                >
                  {activeUsers.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.name || "Pengguna"}{member.is_current ? " · saya" : ""}
                    </option>
                  ))}
                </select>
              ) : <input value={editAccount?.owner_name || currentOwnerLabel} disabled aria-label="Pemilik rekening saat ini" />}
              <small>{activeUsers.length ? "Kepemilikan hanya dapat dipindahkan bila rekening belum memiliki data terkait." : "Daftar anggota belum dapat dimuat. Pemilik rekening saat ini dipertahankan."}</small>
            </label>
          ) : null}
          <label className="checkbox-field">
            <input type="checkbox" checked={Boolean(editAccount?.allow_negative)} onChange={(event) => updateEditAccount({ allow_negative: event.target.checked })} />
            <span>Izinkan saldo negatif</span>
          </label>
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>
    </>
  );
};

export default AccountEditorDialogs;
