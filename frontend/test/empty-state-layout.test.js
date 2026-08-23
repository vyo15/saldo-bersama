import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectionEmptyState, EMPTY_COLLECTION_STATE } from "../src/shared/presentation/emptyState.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("collection empty state membedakan initial, filtered, dan content", () => {
  assert.equal(collectionEmptyState(), EMPTY_COLLECTION_STATE.INITIAL);
  assert.equal(collectionEmptyState({ visibleCount: 0, totalCount: 0, filtersActive: true }), EMPTY_COLLECTION_STATE.FILTERED);
  assert.equal(collectionEmptyState({ visibleCount: 0, totalCount: 2 }), EMPTY_COLLECTION_STATE.FILTERED);
  assert.equal(collectionEmptyState({ visibleCount: 1, totalCount: 2, filtersActive: true }), EMPTY_COLLECTION_STATE.CONTENT);
});

test("empty state mobile memusatkan true-empty tanpa menjauhkan hasil filter", async () => {
  const [accountsPage, accountsCss, categoriesPage, categoriesCss, transactionsPage, transactionsCss] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/AccountsPage.module.css"),
    read("src/features/categories/CategoriesPage.jsx"),
    read("src/features/categories/CategoriesPage.module.css"),
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/transactions/TransactionsPage.css"),
  ]);

  assert.match(accountsPage, /accountSectionInitialEmpty/);
  assert.match(accountsCss, /\.accountSectionInitialEmpty \{[\s\S]*min-height:\s*calc\(100dvh - env\(safe-area-inset-top\) - var\(--mobile-navigation-height\)[\s\S]*padding-block:\s*env\(safe-area-inset-top\)[\s\S]*align-content:\s*center;/);
  assert.match(accountsCss, /\.emptyPanelInitial \{ width:\s*100%; max-width:\s*40rem; justify-self:\s*center; \}/);

  assert.match(categoriesPage, /emptyPanelInitial/);
  assert.match(categoriesCss, /\.emptyPanelInitial \{ min-height:\s*clamp\(14rem, 38dvh, 22rem\); \}/);

  assert.match(transactionsPage, /transaction-empty-state--filtered/);
  assert.match(transactionsPage, /transaction-empty-state--initial/);
  assert.match(transactionsCss, /\.transactions-page \.transaction-empty-state \{[^}]*min-height:\s*clamp\(11rem, 28dvh, 16rem\);/);
  assert.match(transactionsCss, /\.transactions-page \.transaction-empty-state--filtered \{ min-height:\s*9rem; \}/);
});
