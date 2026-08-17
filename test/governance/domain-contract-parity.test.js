import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ACCOUNT_TYPE_VALUES,
  BANK_TEMPLATE_VALUES,
  CATEGORY_ICON_VALUES,
  CATEGORY_NATURE_VALUES,
  CATEGORY_TYPE_VALUES,
  CURRENT_EXPENSE_CATEGORY_NATURE_VALUES,
  DEFAULT_CATEGORY_ICON_BY_TYPE as BACKEND_DEFAULT_CATEGORY_ICON_BY_TYPE,
  EWALLET_TEMPLATE_VALUES,
  NOTIFICATION_TYPE_VALUES,
  TRANSACTION_TYPE_VALUES,
} from "../../api/_lib/domainConstants.js";
import {
  ACCOUNT_TYPES,
  BANK_TEMPLATES,
  CATEGORY_ICON_KEYS,
  CATEGORY_NATURES,
  CATEGORY_TYPES,
  DEFAULT_CATEGORY_ICON_BY_TYPE as FRONTEND_DEFAULT_CATEGORY_ICON_BY_TYPE,
  EWALLET_TEMPLATES,
  NOTIFICATION_TYPES,
  TRANSACTION_TYPES,
} from "../../frontend/src/domain/constants.js";
import { ACCOUNT_TYPE_LABELS, BANK_TEMPLATE_OPTIONS, EWALLET_PROVIDER_OPTIONS } from "../../frontend/src/shared/presentation/account.js";
import { CATEGORY_TYPE_OPTIONS, EXPENSE_NATURE_OPTIONS } from "../../frontend/src/shared/presentation/category.js";

const sorted = (values) => [...values].sort();

const objectValues = (value) => Object.values(value);

test("kontrak enum domain frontend dan backend tetap parity tanpa shared runtime package", () => {
  assert.deepEqual(sorted(objectValues(TRANSACTION_TYPES)), sorted(TRANSACTION_TYPE_VALUES));
  assert.deepEqual(sorted(objectValues(ACCOUNT_TYPES)), sorted(ACCOUNT_TYPE_VALUES));
  assert.deepEqual(sorted(objectValues(BANK_TEMPLATES)), sorted(BANK_TEMPLATE_VALUES));
  assert.deepEqual(sorted(objectValues(EWALLET_TEMPLATES)), sorted(EWALLET_TEMPLATE_VALUES));
  assert.deepEqual(sorted(objectValues(CATEGORY_TYPES)), sorted(CATEGORY_TYPE_VALUES));
  assert.deepEqual(sorted(objectValues(CATEGORY_NATURES)), sorted(CATEGORY_NATURE_VALUES));
  assert.deepEqual(sorted(CATEGORY_ICON_KEYS), sorted(CATEGORY_ICON_VALUES));
  assert.deepEqual(FRONTEND_DEFAULT_CATEGORY_ICON_BY_TYPE, BACKEND_DEFAULT_CATEGORY_ICON_BY_TYPE);
  assert.deepEqual(sorted(objectValues(NOTIFICATION_TYPES)), sorted(NOTIFICATION_TYPE_VALUES));
});

test("presentation frontend menurunkan pilihan dari kontrak domain canonical", () => {
  assert.deepEqual(sorted(Object.keys(ACCOUNT_TYPE_LABELS)), sorted(ACCOUNT_TYPE_VALUES));
  assert.deepEqual(sorted(BANK_TEMPLATE_OPTIONS.map((item) => item.value)), sorted(BANK_TEMPLATE_VALUES));
  assert.deepEqual(sorted(EWALLET_PROVIDER_OPTIONS.map((item) => item.value)), sorted(EWALLET_TEMPLATE_VALUES));
  assert.deepEqual(sorted(CATEGORY_TYPE_OPTIONS.map((item) => item.value)), sorted(CATEGORY_TYPE_VALUES));
  assert.deepEqual(
    sorted(EXPENSE_NATURE_OPTIONS.map((item) => item.value)),
    sorted(CURRENT_EXPENSE_CATEGORY_NATURE_VALUES),
  );
});

test("daftar icon kategori presentation tetap parity dengan domain contract", async () => {
  const source = await readFile(new URL("../../frontend/src/shared/presentation/transaction.js", import.meta.url), "utf8");
  const block = source.match(/export const CATEGORY_ICON_OPTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const keys = [...block.matchAll(/key:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sorted(keys), sorted(CATEGORY_ICON_VALUES));
});
