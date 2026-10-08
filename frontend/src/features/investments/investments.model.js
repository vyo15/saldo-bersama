import { isMutualFundInstrument } from "./investmentInstrumentType.js";
import { investmentOpeningPositionPreview } from "./investmentOpeningPositionPreview.js";
import { positiveIntegerError, positiveDecimalError, nonNegativeIntegerError, signedIntegerError, todayJakarta } from "./investmentValidationPrimitives.js";
export { investmentOpeningPositionPreview } from "./investmentOpeningPositionPreview.js";

const investmentQuantityError = (value, instrument, label) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return `${label} harus lebih dari 0.`;
  if (isMutualFundInstrument(instrument || {})) {
    if (positiveDecimalError(value, label)) return `${label} maksimal dua angka desimal.`;
    return "";
  }
  const lotSize = Number(instrument?.lot_size || 100);
  const shares = quantity * lotSize;
  if (!Number.isSafeInteger(shares)) return `${label} harus sesuai kelipatan minimum 1 saham (${(1 / lotSize).toLocaleString("id-ID", { maximumFractionDigits: 6 })} lot).`;
  return "";
};

const requiredDateError = (value, label, today = todayJakarta()) => {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${label} wajib dipilih.`;
  if (date > today) return `${label} tidak boleh di masa depan.`;
  return "";
};

export const selectInvestmentInstruments = (instruments = [], holdings = [], mode = "buy") => {
  const holdingsById = new Map(holdings.map((item) => [item.instrument_id, item]));
  const heldIds = new Set(holdingsById.keys());
  if (mode === "buy") return instruments.filter((item) => item.status === "active");
  if (mode === "sell") return instruments.filter((item) => {
    const holding = holdingsById.get(item.instrument_id);
    const lotSize = Number(item.lot_size || holding?.lot_size || 100);
    return holding && Number(holding.shares || 0) >= (isMutualFundInstrument(item) ? 0.01 : lotSize);
  });
  if (mode === "price") return instruments.filter((item) => heldIds.has(item.instrument_id));
  if (mode === "reconcile") return instruments.filter((item) => item.status === "active" || heldIds.has(item.instrument_id));
  if (mode === "opening_position") return instruments.filter((item) => item.status === "active" && !heldIds.has(item.instrument_id));
  return instruments;
};

export const investmentTradePreview = (mode, form = {}, instruments = []) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const lotSize = Number(instrument?.lot_size || 100);
  const lots = Number(form.lots || 0);
  const pricePerShare = Number(form.price_per_share || 0);
  const feeAmount = 0;
  const shares = lots * lotSize;
  const grossAmount = Math.round(shares * pricePerShare);
  const rdnAmount = mode === "sell" ? grossAmount - feeAmount : grossAmount + feeAmount;
  return { instrument, lotSize, lots, shares, pricePerShare, feeAmount, grossAmount, rdnAmount };
};

export const investmentProjectedAverage = (form = {}, instruments = [], portfolio = {}) => {
  const preview = investmentTradePreview("buy", form, instruments);
  const holding = (portfolio?.holdings || []).find((item) => item.instrument_id === preview.instrument?.instrument_id) || null;
  const currentShares = Number(holding?.shares || 0);
  const currentCostBasis = Number(holding?.cost_basis || 0);
  const currentAverage = currentShares > 0 ? currentCostBasis / currentShares : 0;
  const nextShares = currentShares + Number(preview.shares || 0);
  const nextCostBasis = currentCostBasis + Number(preview.grossAmount || 0);
  const nextAverage = nextShares > 0 ? nextCostBasis / nextShares : 0;
  return { currentAverage, nextAverage, currentShares, nextShares, holding, ...preview };
};




export {
  investmentActivityForInstrument,
  investmentActivityLabel,
  investmentOwnershipLabel,
  investmentPriceSourceLabel,
  investmentProfitLossLabel,
  investmentReturnPercent,
} from "./investmentPresentation.js";

const instrumentForMode = (mode, form, instruments, portfolio) => {
  const selectionMode = mode === "price" ? "price" : mode;
  const options = selectInvestmentInstruments(instruments, portfolio?.holdings || [], selectionMode);
  return options.find((item) => item.instrument_id === form.instrument_id) || null;
};

const tradeInstrumentLabels = (instrument) => isMutualFundInstrument(instrument || {})
  ? { quantity: "Unit", price: "Nilai per unit", availability: "unit" }
  : { quantity: "Lot", price: "Harga per saham", availability: "lot" };

const sharesAvailableForTrade = (holding, goalId = "") => {
  if (!holding) return 0;
  if (goalId) {
    const allocation = (holding.goal_allocations || []).find((item) => item.goal_id === goalId);
    return Math.max(0, Number(allocation?.shares || 0));
  }
  return Math.max(0, Number(holding.unallocated_shares ?? holding.shares ?? 0));
};

const availableTradeQuantity = (instrument, holding, goalId = "") => {
  const shares = sharesAvailableForTrade(holding, goalId);
  if (isMutualFundInstrument(instrument || {})) return shares;
  const lotSize = Number(instrument?.lot_size || holding?.lot_size || 100);
  return Math.floor(shares / lotSize);
};

const validateTradeGoal = (mode, form, context, holding, errors) => {
  const goalId = String(form.goal_id || "");
  if (!goalId) return;
  if (mode === "buy") {
    const goal = (context.goals || []).find((item) => item.goal_id === goalId);
    if (!goal || goal.status !== "active" || !["investment", "mixed"].includes(goal.funding_mode) || goal.can_invest === false) {
      errors.goal_id = "Target tidak dapat menerima investasi baru.";
    }
    return;
  }
  const allocation = (holding?.goal_allocations || []).find((item) => item.goal_id === goalId && Number(item.shares || 0) > 0);
  if (!allocation) errors.goal_id = "Aset ini tidak memiliki porsi yang terhubung ke Target tersebut.";
};

const validateTrade = (mode, form, context) => {
  const { instruments, portfolio, today } = context;
  const errors = {};
  const instrument = instrumentForMode(mode, form, instruments, portfolio);
  const labels = tradeInstrumentLabels(instrument);
  if (!instrument) errors.instrument_id = "Pilih aset yang tersedia.";

  const fund = isMutualFundInstrument(instrument || {});
  const lotsError = fund ? positiveDecimalError(form.lots, labels.quantity) : positiveIntegerError(form.lots, labels.quantity);
  const priceError = fund ? positiveDecimalError(form.price_per_share, labels.price) : positiveIntegerError(form.price_per_share, labels.price);
  const dateError = requiredDateError(form.trade_date, "Tanggal transaksi", today);
  if (lotsError) errors.lots = lotsError;
  if (priceError) errors.price_per_share = priceError;
  if (dateError) errors.trade_date = dateError;
  if (String(form.notes || "").length > 500) errors.notes = "Catatan maksimal 500 karakter.";

  const holding = instrument ? (portfolio?.holdings || []).find((item) => item.instrument_id === instrument.instrument_id) : null;
  validateTradeGoal(mode, form, context, holding, errors);
  if (mode !== "sell" || !instrument || lotsError || errors.goal_id) return errors;
  const availableQuantity = availableTradeQuantity(instrument, holding, String(form.goal_id || ""));
  if (Number(form.lots) > availableQuantity) {
    errors.lots = form.goal_id
      ? `Maksimal ${availableQuantity.toLocaleString("id-ID")} ${labels.availability} yang terhubung ke Target ini.`
      : `Maksimal ${availableQuantity.toLocaleString("id-ID")} ${labels.availability} yang belum terhubung ke Target.`;
  }
  return errors;
};

const validatePrice = (form, context) => {
  const errors = {};
  if (!instrumentForMode("price", form, context.instruments, context.portfolio)) errors.instrument_id = "Pilih saham yang tersedia.";
  const instrument = instrumentForMode("price", form, context.instruments, context.portfolio);
  const priceError = isMutualFundInstrument(instrument || {}) ? positiveDecimalError(form.price_per_share, "NAB per unit") : positiveIntegerError(form.price_per_share, "Harga per saham");
  const marketValueError = form.market_value === "" || form.market_value == null ? "" : nonNegativeIntegerError(form.market_value, "Total nilai aktual");
  const dateError = requiredDateError(form.valuation_date, "Tanggal harga", context.today);
  if (priceError) errors.price_per_share = priceError;
  if (marketValueError) errors.market_value = marketValueError;
  if (dateError) errors.valuation_date = dateError;
  return errors;
};

const reconcileQuantityError = ({ form, item, holdings }) => {
  const key = `quantity:${item.instrument_id}`;
  const holding = holdings.find((candidate) => candidate.instrument_id === item.instrument_id);
  const lotSize = Number(item.lot_size || holding?.lot_size || 100);
  const mutualFund = isMutualFundInstrument(item);
  const holdingShares = Number(holding?.shares || 0);
  const fallback = mutualFund ? holdingShares : holdingShares / lotSize;
  const quantity = Number(form[key] ?? fallback);
  const shares = mutualFund ? quantity : quantity * lotSize;
  const valid = Number.isFinite(quantity) && quantity >= 0 && (mutualFund ? /^\d+(?:\.\d{1,2})?$/.test(String(form[key] ?? fallback)) : Number.isSafeInteger(shares));
  return valid ? null : [key, `${item.ticker || item.name} · ${mutualFund ? "unit" : "lot"} aktual tidak valid.`];
};

const validateReconcile = (form, context) => {
  const { instruments, portfolio, today } = context;
  const errors = {};
  const cashError = nonNegativeIntegerError(form.actual_cash, "Saldo RDN aktual");
  const dateError = requiredDateError(form.reconciliation_date, "Tanggal pencocokan", today);
  if (cashError) errors.actual_cash = cashError;
  if (dateError) errors.reconciliation_date = dateError;

  const holdings = portfolio?.holdings || [];
  for (const item of selectInvestmentInstruments(instruments, holdings, "reconcile")) {
    const quantityError = reconcileQuantityError({ form, item, holdings });
    if (quantityError) errors[quantityError[0]] = quantityError[1];
  }
  return errors;
};

const correctionIntegerErrors = (form, instruments) => {
  const errors = {};
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const quantity = Number(form.quantity_delta || 0);
  const lotSize = Number(instrument?.lot_size || 100);
  const shares = isMutualFundInstrument(instrument || {}) ? quantity : quantity * lotSize;
  const shareError = !Number.isFinite(quantity) || !Number.isSafeInteger(shares) ? "Delta lot/unit tidak valid." : "";
  const costError = signedIntegerError(form.cost_basis_delta || 0, "Delta cost basis");
  const cashError = signedIntegerError(form.cash_delta || 0, "Delta saldo RDN");
  if (shareError) errors.quantity_delta = shareError;
  if (costError) errors.cost_basis_delta = costError;
  if (cashError) errors.cash_delta = cashError;
  return errors;
};

const validateCorrectionHolding = (form, instruments, errors) => {
  const shareDelta = Number(form.quantity_delta || 0);
  const costDelta = Number(form.cost_basis_delta || 0);
  const cashDelta = Number(form.cash_delta || 0);
  if (!shareDelta && !costDelta && !cashDelta) errors._form = "Koreksi harus mengubah lot/unit, cost basis, atau saldo RDN.";

  if (!shareDelta && !costDelta) {
    if (form.instrument_id) errors.instrument_id = "Kosongkan saham bila koreksi hanya mengubah saldo RDN.";
    return;
  }

  if (!shareDelta || !costDelta || Math.sign(shareDelta) !== Math.sign(costDelta)) {
    errors.quantity_delta = "Delta lot/unit dan cost basis harus sama-sama diisi dan searah.";
    errors.cost_basis_delta = "Delta lot/unit dan cost basis harus sama-sama diisi dan searah.";
  }
  if (!instruments.some((item) => item.instrument_id === form.instrument_id)) errors.instrument_id = "Pilih saham untuk koreksi kepemilikan.";
};

const validateCorrection = (form, context) => {
  const { instruments, userRole, today } = context;
  const errors = {};
  if (userRole !== "owner") return { _form: "Koreksi investasi hanya tersedia untuk Administrator." };

  const dateError = requiredDateError(form.correction_date, "Tanggal koreksi", today);
  if (dateError) errors.correction_date = dateError;
  if (String(form.reason || "").trim().length < 5) errors.reason = "Alasan koreksi minimal 5 karakter.";

  const integerErrors = correctionIntegerErrors(form, instruments);
  Object.assign(errors, integerErrors);
  if (Object.keys(integerErrors).length) return errors;

  validateCorrectionHolding(form, instruments, errors);
  return errors;
};

const openingPositionOverflowErrors = (form, instruments, { quantityError, averageError, priceError }) => {
  if (quantityError || (averageError && priceError)) return {};
  const preview = investmentOpeningPositionPreview(form, instruments);
  const errors = {};
  if (!averageError && preview.costBasis <= 0) errors.average_price = "Total modal hasil perhitungan melampaui batas nominal aman.";
  if (!priceError && preview.marketValue <= 0) errors.reference_price = "Nilai sekarang hasil perhitungan melampaui batas nominal aman.";
  return errors;
};

const openingPositionCashError = (form, portfolio, cashOnly) => {
  const cashMissing = form.actual_cash === "" || form.actual_cash === undefined || form.actual_cash === null;
  if (cashMissing) return cashOnly ? "Saldo RDN awal wajib diisi." : "";

  const cashError = nonNegativeIntegerError(form.actual_cash, "Saldo RDN awal");
  if (cashError) return cashError;
  if (cashOnly && Number(form.actual_cash) === Number(portfolio?.rdn_cash || 0)) {
    return "Saldo RDN awal sudah sama dengan saldo tercatat; tidak ada baseline baru untuk disimpan.";
  }
  return "";
};

const openingPositionAssetErrors = (form, context) => {
  const errors = {};
  const instrument = instrumentForMode("opening_position", form, context.instruments, context.portfolio);
  if (!instrument) errors.instrument_id = "Pilih aset untuk kondisi awal.";

  const quantityError = investmentQuantityError(
    form.opening_quantity,
    instrument || {},
    isMutualFundInstrument(instrument || {}) ? "Jumlah unit" : "Jumlah lot",
  );
  const averageError = positiveDecimalError(form.average_price, "Harga rata-rata beli");
  const priceError = isMutualFundInstrument(instrument || {}) ? positiveDecimalError(form.reference_price, "NAB saat ini") : positiveIntegerError(form.reference_price, "Harga sekarang");
  if (quantityError) errors.opening_quantity = quantityError;
  if (averageError) errors.average_price = averageError;
  if (priceError) errors.reference_price = priceError;
  return Object.assign(errors, openingPositionOverflowErrors(form, context.instruments, { quantityError, averageError, priceError }));
};

const validateOpeningPosition = (form, context) => {
  const errors = {};
  const cashOnly = Boolean(form.opening_cash_only);
  const dateError = requiredDateError(form.position_date, "Tanggal kondisi awal", context.today);
  if (dateError) errors.position_date = dateError;

  const cashError = openingPositionCashError(form, context.portfolio, cashOnly);
  if (cashError) errors.actual_cash = cashError;
  if (!cashOnly) Object.assign(errors, openingPositionAssetErrors(form, context));
  if (String(form.notes || "").length > 500) errors.notes = "Catatan maksimal 500 karakter.";
  return errors;
};

const operationValidators = {
  buy: (form, context) => validateTrade("buy", form, context),
  sell: (form, context) => validateTrade("sell", form, context),
  price: validatePrice,
  reconcile: validateReconcile,
  correction: validateCorrection,
  opening_position: validateOpeningPosition,
};

export const validateInvestmentOperation = (mode, form = {}, options = {}) => {
  const context = {
    instruments: options.instruments || [],
    portfolio: options.portfolio || null,
    goals: options.goals || [],
    userRole: options.userRole || "",
    today: options.today || todayJakarta(),
  };
  return operationValidators[mode]?.(form, context) || {};
};

const optionalIntegerError = (value, label, validator) => value === "" || value === undefined || value === null ? "" : validator(value, label);

const assetPositionNumericErrors = (form, instrument) => {
  const mutualFund = isMutualFundInstrument(instrument || {});
  return {
    opening_quantity: investmentQuantityError(form.opening_quantity, instrument || {}, mutualFund ? "Jumlah unit" : "Jumlah lot"),
    average_price: positiveDecimalError(form.average_price, mutualFund ? "Nilai rata-rata per unit" : "Harga rata-rata per saham"),
    reference_price: mutualFund ? positiveDecimalError(form.reference_price, "Nilai per unit saat ini") : positiveIntegerError(form.reference_price, "Harga saham saat ini"),
    cost_basis: optionalIntegerError(form.cost_basis, "Total modal aktual", positiveIntegerError),
    market_value: optionalIntegerError(form.market_value, "Total nilai aktual", nonNegativeIntegerError),
  };
};

const assetPositionFieldErrors = (form, instrument, today) => {
  const errors = Object.fromEntries(Object.entries(assetPositionNumericErrors(form, instrument)).filter(([, message]) => Boolean(message)));
  if (!instrument || !String(form.ticker || instrument?.ticker || "").trim()) errors.ticker = "Pilih saham atau reksa dana yang ingin dicatat.";
  const dateError = requiredDateError(form.position_date, "Tanggal posisi", today);
  if (dateError) errors.position_date = dateError;
  if (String(form.notes || "").length > 500) errors.notes = "Catatan maksimal 500 karakter.";
  return errors;
};

const assetPositionOverflow = (form, instrument, errors) => {
  if (!instrument || errors.opening_quantity || errors.average_price || errors.reference_price || errors.cost_basis || errors.market_value) return false;
  const quantity = Number(form.opening_quantity);
  const shares = isMutualFundInstrument(instrument) ? quantity : quantity * Number(instrument.lot_size || 100);
  const costBasis = form.cost_basis !== "" && form.cost_basis !== undefined ? Number(form.cost_basis) : Math.round(shares * Number(form.average_price));
  const marketValue = form.market_value !== undefined && String(form.market_value).trim() !== ""
    ? Number(form.market_value) : Math.round(shares * Number(form.reference_price));
  return !Number.isFinite(shares) || shares <= 0 || !Number.isSafeInteger(costBasis) || !Number.isSafeInteger(marketValue);
};

export const validateInvestmentAssetPosition = (form = {}, instrument = null, options = {}) => {
  const errors = assetPositionFieldErrors(form, instrument, options.today || todayJakarta());
  if (assetPositionOverflow(form, instrument, errors)) errors._form = "Jumlah atau nilai investasi terlalu besar untuk disimpan dengan aman.";
  return errors;
};

// A first purchase is a cash movement, not an opening balance. Never infer its
// cost from historical average/market-value fields.
const purchaseNumericErrors = (form, asset) => {
  const fund = isMutualFundInstrument(asset || {});
  const quantity = fund ? positiveDecimalError(form.opening_quantity, "Jumlah unit") : positiveIntegerError(form.opening_quantity, "Jumlah lot");
  const price = fund ? positiveDecimalError(form.average_price, "NAB pembelian") : positiveIntegerError(form.average_price, "Harga beli per saham");
  const fee = nonNegativeIntegerError(form.fee_amount || 0, "Biaya pembelian");
  return Object.fromEntries(Object.entries({ opening_quantity: quantity, average_price: price, fee_amount: fee }).filter(([, message]) => Boolean(message)));
};

const purchaseTotalError = (form, asset, goalId) => {
  const fund = isMutualFundInstrument(asset || {});
  const shares = Number(form.opening_quantity) * (fund ? 1 : Number(asset.lot_size || 100));
  const total = Math.round(shares * Number(form.average_price)) + Number(form.fee_amount || 0);
  if (!Number.isSafeInteger(total) || total <= 0) return ["_form", "Nilai pembelian tidak valid atau terlalu kecil."];
  if (goalId && !Number.isInteger(shares)) return ["opening_quantity", "Unit pecahan belum dapat dihubungkan langsung ke Target."];
  return null;
};

export const validateInvestmentAssetPurchase = (form = {}, asset = null, accounts = [], options = {}) => {
  const errors = purchaseNumericErrors(form, asset);
  if (!asset || !form.ticker) errors.ticker = "Pilih aset yang ingin dibeli.";
  const dateError = requiredDateError(form.position_date, "Tanggal pembelian", options.today || todayJakarta());
  if (dateError) errors.position_date = dateError;
  if (!accounts.some((account) => account.account_id === form.rdn_account_id && account.account_type === "investment" && account.status === "active")) errors.rdn_account_id = "Pilih rekening RDN aktif yang dapat Anda gunakan.";
  if (String(form.notes || "").length > 500) errors.notes = "Catatan maksimal 500 karakter.";
  if (!Object.keys(errors).length) {
    const totalError = purchaseTotalError(form, asset, options.goalId);
    if (totalError) errors[totalError[0]] = totalError[1];
  }
  return errors;
};
