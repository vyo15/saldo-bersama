import { useEffect, useMemo, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { accountOptionVisual, allocationOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel, accountOwnershipLabel } from "../../shared/presentation/account.js";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { allocationAssigneeLabel } from "./allocationPresentation.js";
import { allocationClass } from "./allocationStyles.js";
import { allocationAvailableBalance, allocationFundingImpact, allocationTargetsForAccount, fundingAccountsForItems, initialAllocationFundingForm } from "./allocationFundingModel.js";

const initialForm = () => ({ sourceAccountId: "", envelopePeriodId: "", amount: "", reason: "" });

const FundingLockedContext = ({ selectedAccount, target }) => <>
  <div className={allocationClass("allocation-funding-lock form-grid__full")}>
    <span>Dari rekening</span>
    <strong>{accountDisplayLabel(selectedAccount)}</strong>
    <small>{accountOwnershipLabel(selectedAccount)} · Dana tersedia {formatRupiah(allocationAvailableBalance(selectedAccount))}</small>
  </div>
  <div className={allocationClass("allocation-funding-lock form-grid__full")}>
    <span>Ke Alokasi</span>
    <strong>{target?.name || "Alokasi tidak tersedia"}</strong>
    <small>{target ? `${allocationAssigneeLabel(target)} · sisa ${formatRupiah(target.remaining_amount || 0)}` : "Konteks Alokasi tidak ditemukan"}</small>
  </div>
</>;

const FundingFields = ({ accounts, envelopes, selectedAccount, target, form, setForm, changeSource, available, invalidAmount, amountNumber, lockSelection }) => {
  if (!accounts.length) return <div className="notice notice--info form-grid__full" role="status">Belum ada kombinasi rekening dan Alokasi Dana aktif yang dapat ditambah. Periksa rekening sumber atau buat Alokasi Dana terlebih dahulu.</div>;
  return <>
    {lockSelection
      ? <FundingLockedContext selectedAccount={selectedAccount} target={target} />
      : <>
        <InlineSelectionPicker className="form-grid__full" label="Dari rekening mana?" required value={form.sourceAccountId} onChange={changeSource} placeholder="Pilih rekening" placeholderOption={{ icon: AccountIcon }} searchable={accounts.length > 8} searchPlaceholder="Cari rekening…" options={accounts.map((account) => ({ value: account.account_id, label: accountDisplayLabel(account), meta: `${accountOwnershipLabel(account)} · tersedia ${formatRupiah(allocationAvailableBalance(account))}`, ...accountOptionVisual(account) }))} />
        <InlineSelectionPicker className="form-grid__full" label="Ke Alokasi" required value={form.envelopePeriodId} onChange={(envelopePeriodId) => setForm((current) => ({ ...current, envelopePeriodId }))} placeholder={form.sourceAccountId ? "Pilih Alokasi" : "Pilih rekening terlebih dahulu"} placeholderOption={allocationOptionVisual()} searchable={envelopes.length > 8} searchPlaceholder="Cari Alokasi Dana…" options={envelopes.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: `${allocationAssigneeLabel(item)} · sisa ${formatRupiah(item.remaining_amount || 0)}`, ...allocationOptionVisual() }))} />
        {selectedAccount && envelopes.length === 0 ? <div className="notice notice--info form-grid__full" role="status">Belum ada Alokasi yang memakai rekening ini. Buat Alokasi baru dari rekening tersebut jika dana ini ingin diarahkan tanpa memindahkan rekening.</div> : null}
      </>}
    <MoneyInput id="funding-flow-amount" label="Nominal" required value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} />
    {selectedAccount && invalidAmount && amountNumber > available ? <div className="notice notice--warning form-grid__full" role="status">Dana tersedia kurang {formatRupiah(amountNumber - available)}. Pilih nominal yang tidak melebihi dana bebas rekening ini.</div> : null}
    <label className="field form-grid__full"><span>Catatan</span><input maxLength="180" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Contoh: alokasi pemasukan bulan ini" /></label>
  </>;
};

const FundingImpact = ({ selectedAccount, target, amountNumber }) => {
  if (!selectedAccount || !target || amountNumber <= 0) return null;
  const impact = allocationFundingImpact({ account: selectedAccount, target, amount: amountNumber });
  if (!impact.valid) return null;
  const { beforeAvailable, afterAvailable, beforeAllocation, afterAllocation } = impact;
  return <section className={allocationClass("allocation-funding-impact form-grid__full")} aria-label="Dampak setelah disimpan">
    <span className={allocationClass("allocation-funding-impact__title")}>Setelah disimpan</span>
    <div><span>Dana bebas {accountDisplayLabel(selectedAccount, { includeOwner: false })}</span><strong>{formatRupiah(beforeAvailable)} → {formatRupiah(afterAvailable)}</strong></div>
    <div><span>{target.name}</span><strong>{formatRupiah(beforeAllocation)} → {formatRupiah(afterAllocation)}</strong></div>
    <div><span>Saldo rekening</span><strong>tidak berubah</strong></div>
  </section>;
};

const fundingModalCopy = ({ lockSelection, target, amountNumber, invalidAmount }) => ({
  title: lockSelection && target ? `Tambah dana ke ${target.name}` : "Alokasikan dana",
  description: lockSelection
    ? "Sumber rekening mengikuti Alokasi ini dan tidak dapat diganti dari flow ini."
    : "Pilih rekening sumber terlebih dahulu. Saldo rekening tidak berubah saat dana dialokasikan.",
  submitLabel: amountNumber > 0 && !invalidAmount
    ? `${lockSelection ? "Tambah" : "Alokasikan"} ${formatRupiah(amountNumber)}`
    : lockSelection ? "Tambah dana" : "Alokasikan dana",
});

const useAllocationFundingForm = ({ open, accounts, items, initialSourceAccountId, initialEnvelopePeriodId, suggestedAmount, lockSelection }) => {
  const [form, setForm] = useState(initialForm);
  const [ready, setReady] = useState(false);
  const eligibleAccounts = useMemo(() => fundingAccountsForItems(accounts, items, { requestedAccountId: initialSourceAccountId, locked: lockSelection }), [accounts, initialSourceAccountId, items, lockSelection]);
  const envelopes = useMemo(() => allocationTargetsForAccount(items, form.sourceAccountId), [form.sourceAccountId, items]);

  useEffect(() => {
    if (!open) { setReady(false); return; }
    setForm(initialAllocationFundingForm({ accounts: eligibleAccounts, items, requestedAccountId: initialSourceAccountId, requestedEnvelopePeriodId: initialEnvelopePeriodId, suggestedAmount }));
    setReady(true);
  }, [eligibleAccounts, initialEnvelopePeriodId, initialSourceAccountId, items, open, suggestedAmount]);

  const changeSource = (sourceAccountId) => {
    const matching = allocationTargetsForAccount(items, sourceAccountId);
    setForm((current) => ({ ...current, sourceAccountId, envelopePeriodId: matching.length === 1 ? matching[0].envelope_period_id : "" }));
  };
  return { form, setForm, ready, eligibleAccounts, envelopes, changeSource };
};

const AllocationFundingFlow = ({ open, accounts, items, initialSourceAccountId = "", initialEnvelopePeriodId = "", suggestedAmount = 0, lockSelection = false, busy = false, error = null, onClose, onSubmit }) => {
  const fundingForm = useAllocationFundingForm({ open, accounts, items, initialSourceAccountId, initialEnvelopePeriodId, suggestedAmount, lockSelection });
  const { form, setForm, ready, eligibleAccounts, envelopes, changeSource } = fundingForm;
  const selectedAccount = eligibleAccounts.find((item) => item.account_id === form.sourceAccountId) || null;
  const target = envelopes.find((item) => item.envelope_period_id === form.envelopePeriodId) || null;
  const available = allocationAvailableBalance(selectedAccount);
  const amountNumber = Number(String(form.amount || "").replace(/\D/g, "")) || 0;
  const invalidAmount = amountNumber <= 0 || amountNumber > available;
  const submit = (event) => { event.preventDefault(); if (target && !invalidAmount && !busy) onSubmit?.({ target, amount: form.amount, reason: form.reason }); };
  const guard = useUnsavedChangesGuard({ open: open && ready, value: form, onClose, blocked: busy });
  const copy = fundingModalCopy({ lockSelection, target, amountNumber, invalidAmount });

  return <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="alokasi dana" dismissible={!busy} title={copy.title} description={copy.description} size="sm" footer={<><Button type="button" disabled={busy} onClick={guard.discardAndClose}>Batal</Button><Button type="submit" form="allocation-funding-form" variant="primary" loading={busy} disabled={!target || invalidAmount || busy}>{copy.submitLabel}</Button></>}>
    <form id="allocation-funding-form" className="form-grid" onSubmit={submit}>
      <FundingFields accounts={eligibleAccounts} envelopes={envelopes} selectedAccount={selectedAccount} target={target} form={form} setForm={setForm} changeSource={changeSource} available={available} invalidAmount={invalidAmount} amountNumber={amountNumber} lockSelection={lockSelection} />
      <FundingImpact selectedAccount={selectedAccount} target={target} amountNumber={amountNumber} />
      {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
    </form>
  </Modal>;
};

export default AllocationFundingFlow;
