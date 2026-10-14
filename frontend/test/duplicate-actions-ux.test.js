import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("Wishlist initial empty state has one add action and no zero-value dashboard or filters", async () => {
  const page = await read("src/features/wishlist/WishlistPage.jsx");
  assert.match(page, /const wishlistCreateAction = \(hasItems, onCreate\) => hasItems/);
  assert.match(page, /wishlistCreateAction\(items\.length > 0/);
  assert.match(page, /const WishlistOverview = [\s\S]*?if \(!active\.length\) return null;/);
  assert.match(page, /\{urgent\.length \? <div><span>Prioritas segera/);
  assert.match(page, /const WishlistToolbar = \(\{ active, showArchive, \.\.\.props \}\) => active\.length \|\| showArchive/);
  assert.match(page, /<WishlistToolbar active=\{active\}/);
  assert.match(page, /const WishlistFooter = [\s\S]*?if \(!hasItems\) return null;/);
  assert.match(page, /const action = firstItem[\s\S]*?onClick=\{onCreate\}>Tambah keinginan/);
});

test("Wishlist archived-only state offers a direct history path instead of an irrelevant reset", async () => {
  const page = await read("src/features/wishlist/WishlistPage.jsx");
  assert.match(page, /const historyOnly = !firstItem && active\.length === 0 && !showArchive;/);
  assert.match(page, /Barang yang dibeli atau diarsipkan ada di riwayat\./);
  assert.match(page, /onClick=\{onShowHistory\}>Lihat riwayat/);
  assert.match(page, /onShowHistory=\{\(\) => \{ setScope\("all"\); setPriority\("all"\); setShowArchive\(true\); \}\}/);
});

test("Shopping add has one clear target per screen size, never a faux search with two buttons", async () => {
  const [page, css] = await Promise.all([read("src/features/shopping/ShoppingPage.jsx"), read("src/features/shopping/ShoppingPage.module.css")]);
  assert.match(page, /mode === "planning" && counts\.active \? <Button icon=\{FiPlus\}/);
  assert.match(page, /activeItems\.length && canManage \? <button type="button" className=\{styles\.quickAdd\} onClick=\{onAdd\}/);
  assert.doesNotMatch(page, /Cari \/ tambah barang|addSquare|<FiSearch/);
  assert.match(css, /\.quickAdd \{ display:none;/);
  assert.match(css, /@media \(max-width: 900px\) \{[^\n]*\.header > :global\(\.button\) \{ display:none; \} \.quickAdd \{ display:flex; \}/);
  assert.match(css, /\.quickAdd:focus-visible/);
});

test("Shopping shows one start action on desktop and keeps its only checkout action", async () => {
  const [page, css] = await Promise.all([read("src/features/shopping/ShoppingPage.jsx"), read("src/features/shopping/ShoppingPage.module.css")]);
  assert.match(page, /styles\.stickyAction\} \$\{mode === "planning" \? styles\.shoppingFlowAction : ""\}/);
  assert.match(css, /\.shoppingFlowAction \{ display:none; \}/);
  assert.match(css, /@media \(max-width: 900px\) \{[^\n]*\.shoppingFlowAction \{ display:flex; \}/);
  assert.match(page, /if \(mode === "planning" && !activeItems\.length\) return null;/);
  assert.match(page, /onClick=\{onCheckout\}>Selesai Belanja/);
  assert.match(page, /onClick=\{submit\}>\{mutation\.outcomeUnknown \? "Coba lagi data yang sama"/);
});

test("Notifications does not repeat the active segmented filter as an extra heading", async () => {
  const [page, css] = await Promise.all([read("src/features/notifications/NotificationsPage.jsx"), read("src/features/notifications/NotificationsPage.module.css")]);
  assert.match(page, /data-active=\{filter === item\.id/);
  assert.doesNotMatch(page, /<span>\{filter === "action" \? "Tindakan" : "Pengingat"\}<\/span>/);
  assert.match(css, /\.listToolbar \{[^}]*justify-content: flex-end;/);
  assert.match(page, /<button type="button" className=\{styles\.unreadOnly\}/);
});
