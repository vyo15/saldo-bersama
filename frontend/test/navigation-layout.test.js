import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("desktop mempertahankan module dock Saldo Bersama melengkung dengan submenu minimal", async () => {
  const source = await read("src/components/navigation/SideNavigation.jsx");

  assert.match(source, /const visibleNavigation = DESKTOP_NAVIGATION/);
  assert.match(source, /visibleNavigation\.map/);
  assert.match(source, /item\.ownerOnly \|\| user\?\.role === "owner"/);
  assert.match(source, /desktop-module-dock/);
  assert.match(source, /sidebar-rail-mask\.svg/);
  assert.match(source, /sidebar-rail-mask-dark\.svg/);
  assert.match(source, /aria-label="Navigasi utama Saldo Bersama"/);
  assert.match(source, /aria-label=\{`Buka \$\{label\}`\}/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /desktop-module-dock__group/);
  assert.match(source, /desktop-module-dock__flyout/);
  assert.doesNotMatch(source, /desktop-module-dock__flyout-close/);
  assert.doesNotMatch(source, /Tutup menu/);
  assert.doesNotMatch(source, /childDescription/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /data-label=\{label\}/);
});

test("dock dirender sebagai sibling shell agar fixed tetap mengikuti viewport", async () => {
  const source = await read("src/layouts/AppShell.jsx");
  const dockIndex = source.indexOf("<SideNavigation />");
  const shellIndex = source.indexOf('<div className={`app-shell');
  const headerIndex = source.indexOf('<header className="desktop-app-header">');
  const actionsIndex = source.indexOf('<div className="desktop-app-header__actions">');

  assert.ok(dockIndex >= 0, "dock harus dirender");
  assert.ok(shellIndex > dockIndex, "dock harus menjadi sibling sebelum shell, bukan child dari elemen backdrop-filter");
  assert.ok(headerIndex > shellIndex, "header tetap berada di dalam shell");
  assert.ok(actionsIndex > headerIndex, "header tetap memiliki action area");
});

test("navigasi mobile dirender sebagai sibling shell agar fixed tetap mengikuti viewport", async () => {
  const source = await read("src/layouts/AppShell.jsx");
  const shellIndex = source.indexOf('<div className={`app-shell');
  const shellEndIndex = source.indexOf("\n      </div>\n\n      {desktopTransactionQuickAddVisible");
  const mobileNavigationIndex = source.indexOf("<MobileNavigation ");

  assert.ok(shellIndex >= 0, "shell aplikasi harus dirender");
  assert.ok(shellEndIndex > shellIndex, "shell harus ditutup sebelum kontrol fixed viewport");
  assert.ok(mobileNavigationIndex > shellEndIndex, "navigasi mobile harus menjadi sibling shell, bukan child dari backdrop-filter");
});

test("tab utama mobile memulihkan scroll per tab, route sekunder mulai dari atas, dan browser Back memulihkan entry sebelumnya", async () => {
  const [shell, restorationHook] = await Promise.all([
    read("src/layouts/AppShell.jsx"),
    read("src/hooks/useMobileTabScrollRestoration.js"),
  ]);

  assert.match(shell, /useNavigationType\(\)/);
  assert.match(shell, /useMobileTabScrollRestoration\(location, navigationType\);/);
  assert.match(restorationHook, /PRIMARY_TAB_PATHS = new Set\(\["\/", "\/transaksi", "\/laporan"\]\)/);
  assert.match(restorationHook, /window\.history\.scrollRestoration = "manual"/);
  assert.match(restorationHook, /rememberHistoryPosition\(previousLocation\.key, previousTop\)/);
  assert.match(restorationHook, /primaryTabScrollPositions\.set\(previousLocation\.pathname, previousTop\)/);
  assert.match(restorationHook, /navigationType === "POP" && location\.key && historyEntryScrollPositions\.has\(location\.key\)/);
  assert.match(restorationHook, /PRIMARY_TAB_PATHS\.has\(location\.pathname\)/);
  assert.match(restorationHook, /return 0;/);
  assert.match(restorationHook, /window\.scrollTo\(\{ top, left: 0, behavior: "auto" \}\)/);
});

test("quick add transaksi mobile selalu tersedia sementara aksi floating desktop tetap menghormati create lokal Administrator", async () => {
  const [shell, mobileNavigation, responsiveCss] = await Promise.all([
    read("src/layouts/AppShell.jsx"),
    read("src/components/navigation/MobileNavigation.jsx"),
    read("src/styles/responsive.css"),
  ]);
  assert.match(shell, /DESKTOP_LOCAL_CREATE_ROUTES = new Set/);
  for (const route of ["/rekening", "/perencanaan", "/target", "/kategori"]) assert.match(shell, new RegExp(`"${route}"`));
  assert.match(shell, /normalizedPath\.startsWith\("\/perencanaan\/"\)/);
  assert.match(shell, /normalizedPath === "\/404"/);
  assert.match(shell, /normalizedPath === "\/anggota"/);
  assert.match(shell, /normalizedPath === "\/pengaturan" \|\| normalizedPath\.startsWith\("\/pengaturan\/"\)/);
  assert.match(shell, /role === "owner" && \(DESKTOP_LOCAL_CREATE_ROUTES\.has\(normalizedPath\) \|\| normalizedPath\.startsWith\("\/perencanaan\/"\)\)/);
  assert.match(shell, /desktopTransactionQuickAddVisible/);
  assert.match(shell, /<MobileNavigation[\s\S]*quickAddDisabled=\{offline\}/);
  assert.match(mobileNavigation, /className="mobile-navigation__add"/);
  assert.match(mobileNavigation, /aria-label="Tambah transaksi"/);
  assert.match(mobileNavigation, /title="Tambah transaksi"/);
  assert.doesNotMatch(mobileNavigation, /quickAddVisible|mobile-navigation--without-add/);
  assert.doesNotMatch(responsiveCss, /mobile-navigation--without-add/);
});

test("navigasi mobile memakai safe area dan menyisakan ruang scroll untuk konten terakhir", async () => {
  const responsiveCss = await read("src/styles/responsive.css");

  assert.match(responsiveCss, /--mobile-navigation-height:\s*72px;/);
  assert.match(responsiveCss, /html \{ scroll-padding-bottom:\s*calc\(var\(--mobile-navigation-height\) \+ env\(safe-area-inset-bottom\) \+ 12px\); \}/);
  assert.match(responsiveCss, /\.app-content,[\s\S]*?\.app-content--wide \{[^}]*padding:\s*16px var\(--mobile-page-gutter\) calc\(var\(--mobile-navigation-height\) \+ env\(safe-area-inset-bottom\) \+ var\(--mobile-navigation-content-gap\)\);/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*position:\s*fixed;[^}]*inset-inline:\s*0;[^}]*bottom:\s*0;/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*safe-area-inset-left/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*safe-area-inset-right/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*safe-area-inset-bottom/);
  assert.match(responsiveCss, /\.app-shell--dashboard \.app-content \{[^}]*safe-area-inset-bottom/);
});


test("desktop memakai shell full-bleed tanpa gap viewport", async () => {
  const [appCss, responsiveCss] = await Promise.all([
    read("src/styles/app.css"),
    read("src/styles/responsive.css"),
  ]);

  assert.match(appCss, /\.app-shell\s*\{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*100vh;[\s\S]*min-height:\s*100dvh;[\s\S]*margin:\s*0;[\s\S]*display:\s*flex;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;/);
  assert.match(appCss, /\.desktop-app-header\s*\{[\s\S]*border-radius:\s*0;/);
  assert.match(appCss, /\.desktop-module-dock\s*\{[\s\S]*position:\s*fixed;[\s\S]*top:\s*50%;[\s\S]*transform:\s*translateY\(-50%\);/);
  assert.match(appCss, /\.desktop-module-dock\s*\{[\s\S]*inset-inline-start:\s*0;/);
  assert.match(appCss, /\.app-content\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;[\s\S]*margin-inline:\s*0;/);
  assert.match(responsiveCss, /@media \(max-width:\s*940px\)[\s\S]*\.app-shell \{ width:\s*100%; min-height:\s*100vh; min-height:\s*100dvh; margin:\s*0; border-radius:\s*0; \}/);
});


test("root, shell, dan route rekening memenuhi dynamic viewport tanpa menghapus ruang aman navigasi", async () => {
  const [resetCss, appCss, responsiveCss, accountCss, componentCss, loginCss] = await Promise.all([
    read("src/styles/reset.css"),
    read("src/styles/app.css"),
    read("src/styles/responsive.css"),
    Promise.all([
      read("src/features/accounts/AccountsPage.module.css"),
      read("src/features/accounts/components/MobileAccountsExperience.module.css"),
    ]).then((parts) => parts.join("\n")),
    read("src/styles/components.css"),
    read("src/features/auth/LoginPage.module.css"),
  ]);

  assert.match(resetCss, /body \{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/);
  assert.match(resetCss, /#root \{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/);
  assert.match(appCss, /\.app-shell__main \{[^}]*flex:\s*1 1 auto;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);
  assert.match(appCss, /\.app-content \{[^}]*flex:\s*1 1 auto;/);
  assert.match(responsiveCss, /--accounts-mobile-background:/);
  assert.match(responsiveCss, /\.app-shell--accounts,\s*\n\s*\.app-shell--accounts \.app-shell__main,\s*\n\s*\.app-shell--accounts \.app-content \{ background:\s*var\(--accounts-mobile-background\); \}/);
  assert.match(responsiveCss, /\.app-shell--accounts \.app-content \{ padding-top:\s*0; color:\s*var\(--on-hero\); \}/);
  assert.match(accountCss, /background:\s*var\(--accounts-mobile-background, var\(--accounts-mobile-surface\)\);/);
  assert.match(componentCss, /\.loading-screen--page, \.fatal-error \{ min-height:\s*100vh; min-height:\s*100dvh; \}/);
  assert.match(componentCss, /\.loading-screen--content \{[^}]*min-height:\s*clamp\(12rem, 42dvh, 24rem\);/);
  assert.match(componentCss, /\.app-content \.loading-screen--page \.brand-lockup \{ display:\s*none; \}/);
  assert.match(responsiveCss, /\.app-content > \.loading-screen--page,\s*\n\s*\.app-content > \.loading-screen--content \{[^}]*min-height:\s*min\(54dvh, 28rem\);/s);
  assert.match(responsiveCss, /\.app-content > \.fatal-error,\s*\n\s*\.app-content > \.centered-page \{[^}]*min-height:\s*calc\(100dvh - var\(--mobile-topbar-height\)/);
  assert.match(accountCss, /min-height:\s*calc\(100vh - env\(safe-area-inset-top\) - var\(--mobile-navigation-height\)/);
  assert.match(accountCss, /min-height:\s*calc\(100dvh - env\(safe-area-inset-top\) - var\(--mobile-navigation-height\)/);
  assert.match(loginCss, /\.login-page \{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100svh;/);
});


test("shell terautentikasi menjadi satu-satunya main landmark untuk route internal", async () => {
  const [shell, loading, dashboard, notFound] = await Promise.all([
    read("src/layouts/AppShell.jsx"),
    read("src/components/feedback/LoadingScreen.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/features/settings/NotFoundPage.jsx"),
  ]);

  assert.match(shell, /<main className=\{`app-content \${wideContentRoute \? "app-content--wide" : "app-content--standard"}`\}>/);
  assert.doesNotMatch(loading, /<main\b/);
  assert.doesNotMatch(dashboard, /<main\b/);
  assert.doesNotMatch(notFound, /<main\b/);
  assert.match(notFound, /<section className="centered-page" aria-labelledby="not-found-title">/);
});

test("geometri rail Saldo Bersama menyisakan navigasi mobile", async () => {
  const [appCss, responsiveCss, mobileNavigation] = await Promise.all([
    read("src/styles/app.css"),
    read("src/styles/responsive.css"),
    read("src/components/navigation/MobileNavigation.jsx"),
  ]);

  assert.match(appCss, /\.desktop-module-dock\s*\{[\s\S]*--desktop-dock-width:\s*108px;[\s\S]*width:\s*var\(--desktop-dock-width\);[\s\S]*height:\s*clamp\(480px, 68dvh, 600px\);/);
  assert.match(appCss, /\.desktop-module-dock__navigation\s*\{[\s\S]*inset-inline-start:\s*var\(--desktop-dock-nav-left\);[\s\S]*top:\s*50%;[\s\S]*gap:\s*12px;[\s\S]*transform:\s*translateY\(-50%\);/);
  assert.match(appCss, /\.desktop-module-dock__group\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*48px;[\s\S]*height:\s*48px;/);
  assert.match(appCss, /\.desktop-module-dock__flyout\s*\{[\s\S]*top:\s*50%;[\s\S]*transform:\s*translateY\(-50%\);/);
  assert.doesNotMatch(appCss, /\.desktop-module-dock__navigation\s*\{[^}]*justify-content:\s*space-between;/);
  assert.match(appCss, /\.desktop-module-dock__link\s*\{[\s\S]*width:\s*48px;[\s\S]*height:\s*48px;/);
  assert.match(appCss, /\.desktop-module-dock__link\.is-active::after/);
  assert.match(appCss, /height:\s*26px;/);
  assert.match(responsiveCss, /@media \(max-width:\s*820px\)[\s\S]*\.desktop-module-dock \{ display:\s*none; \}/);
  assert.match(responsiveCss, /\.app-shell__main \{[^}]*padding-inline-start:\s*0;/);
  assert.match(mobileNavigation, /MOBILE_PRIMARY_NAVIGATION/);
});

test("asset rail light dan dark mempertahankan path organik Saldo Bersama", async () => {
  const [light, dark] = await Promise.all([
    read("src/assets/layout/sidebar-rail-mask.svg"),
    read("src/assets/layout/sidebar-rail-mask-dark.svg"),
  ]);
  const organicPath = "M0 0C0 28 15 48 56 66C80 81 91 100 92 128V352C91 380 80 399 56 414C15 432 0 452 0 480V0Z";

  assert.match(light, /width="92" height="480"/);
  assert.match(dark, /width="92" height="480"/);
  assert.ok(light.includes(organicPath));
  assert.ok(dark.includes(organicPath));
});

test("layout mobile compact mempertahankan safe area dan target sentuh", async () => {
  const [responsiveCss, dashboardCss] = await Promise.all([
    read("src/styles/responsive.css"),
    read("src/features/dashboard/DashboardPage.module.css"),
  ]);

  assert.match(responsiveCss, /--mobile-navigation-height:\s*72px;/);
  assert.match(responsiveCss, /\.mobile-navigation a,\s*\n\s*\.mobile-navigation__more \{[^}]*height:\s*var\(--mobile-navigation-height\);[^}]*min-height:\s*var\(--mobile-navigation-height\);/);
  assert.match(responsiveCss, /--mobile-navigation-label-size:\s*12px;/);
  assert.match(responsiveCss, /--mobile-navigation-icon-size:\s*24px;/);
  assert.match(responsiveCss, /--mobile-navigation-add-size:\s*52px;/);
  assert.match(responsiveCss, /--mobile-navigation-add-lift:\s*26px;/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\);/);
  assert.match(responsiveCss, /\.mobile-navigation__add \{[^}]*margin-top:\s*calc\(var\(--mobile-navigation-add-lift\) \* -1\);/);
  assert.match(responsiveCss, /--mobile-topbar-height:\s*calc\(var\(--mobile-topbar-content-height\) \+ env\(safe-area-inset-top\)\);/);
  assert.match(responsiveCss, /\.topbar \{[^}]*height:\s*var\(--mobile-topbar-height\);[^}]*padding:\s*env\(safe-area-inset-top\) var\(--mobile-page-gutter\) 0;/);
  assert.match(responsiveCss, /\.mobile-navigation a::before,[\s\S]*\.mobile-navigation__more::before \{[^}]*height:\s*3px;[^}]*opacity:\s*0;/);
  assert.match(responsiveCss, /\.mobile-navigation a\.active::before,[^}]*opacity:\s*1;/);
  assert.match(dashboardCss, /\.mobile-hero-button,\s*\n\s*\.mobile-finance-hero :global\(\.theme-toggle\) \{[^}]*min-height:\s*var\(--mobile-control-height\);/);
  assert.doesNotMatch(dashboardCss, /\.mobile-hero-button[^\{]*\{[^}]*width:\s*38px;/);
  assert.match(dashboardCss, /\.mobile-quick-action > span \{ width:\s*44px; height:\s*44px;/);
  assert.match(dashboardCss, /\.mobile-account-scroller \{[^}]*scroll-snap-type:\s*x mandatory;[^}]*touch-action:\s*pan-x pan-y;/);
  assert.match(dashboardCss, /\.mobile-account-preview \{[^}]*scroll-snap-align:\s*start;[^}]*scroll-snap-stop:\s*always;/);
  assert.doesNotMatch(responsiveCss, /\.app-shell--dashboard \.topbar \{ display:\s*flex; \}/);
  assert.match(responsiveCss, /\.app-shell--dashboard \.topbar \{ display:\s*none; \}/);
});

test("logout tetap tersedia sampai navigasi mobile mengambil alih pada breakpoint 820/821/940/941", async () => {
  const [responsiveCss, mobileNavigation, navigationConfig] = await Promise.all([
    read("src/styles/responsive.css"),
    read("src/components/navigation/MobileNavigation.jsx"),
    read("src/config/navigation.js"),
  ]);

  const tabletBlock = responsiveCss.match(/@media \(max-width:\s*940px\) \{[\s\S]*?\n\}/)?.[0] || "";
  const mobileBlock = responsiveCss.match(/@media \(max-width:\s*820px\) \{[\s\S]*?\.mobile-navigation \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(tabletBlock, /\.desktop-user-avatar \{ display:\s*none; \}/);
  assert.doesNotMatch(tabletBlock, /desktop-logout-button[^}]*display:\s*none/);
  assert.match(mobileBlock, /\.desktop-app-header \{ display:\s*none; \}/);
  assert.match(mobileBlock, /\.mobile-navigation \{[^}]*display:\s*grid;/);
  assert.match(navigationConfig, /isMobileSecondaryNavigationPath/);
  assert.match(mobileNavigation, /secondaryRouteActive/);
  assert.match(mobileNavigation, /aria-current=\{secondaryRouteActive \? "page"/);
  assert.match(mobileNavigation, /mobile-navigation__more\$\{moreActive \? " active"/);
});

test("navigasi Perencanaan mengekspos Anggaran overview tanpa menghidupkan kembali route legacy", async () => {
  const source = await read("src/config/navigation.js");
  assert.match(source, /FiList/);
  assert.match(source, /FiPieChart/);
  assert.match(source, /FiCreditCard/);
  assert.match(source, /FiTag/);
  assert.match(source, /FiCheckCircle/);
  assert.match(source, /to: "\/kategori", label: "Kategori"/);
  assert.match(source, /to: "\/rekonsiliasi", label: "Cocokkan saldo"/);
  assert.match(source, /to: "\/anggota", label: "Anggota"[\s\S]*ownerOnly: true/);
  assert.match(source, /label: "Perencanaan"/);
  assert.match(source, /to: "\/perencanaan", label: "Perencanaan"/);
  assert.match(source, /to: "\/anggaran", label: "Anggaran"/);
  assert.doesNotMatch(source, /to: "\/(?:alokasi|tagihan)"/);
  assert.match(source, /items: pickNavigation\("\/perencanaan", "\/anggaran", "\/target"\)/);
  assert.match(source, /label: "Data keuangan"/);
  assert.match(source, /items: pickNavigation\("\/rekening", "\/kategori"\)/);
  assert.match(source, /label: "Kontrol saldo"/);
  assert.match(source, /items: pickNavigation\("\/rekonsiliasi"\)/);
  assert.match(source, /label: "Akses"[\s\S]*items: pickNavigation\("\/anggota", "\/persetujuan"\)/);
  assert.doesNotMatch(source, /label: "Kelola"/);
  assert.match(source, /MOBILE_SECONDARY_GROUPS/);
  assert.match(source, /pickNavigation\("\/", "\/transaksi", "\/laporan"\)/);
  assert.doesNotMatch(source, /PRIMARY_NAVIGATION\[\d+\]/);
});

test("responsive mobile tidak menyembunyikan two-column-grid dan breakpoint sempit menang", async () => {
  const [source, settings] = await Promise.all([
    read("src/styles/responsive.css"),
    read("src/features/settings/SettingsOverview.module.css"),
  ]);
  assert.doesNotMatch(source, /\.two-column-grid,\s*\n\s*\.app-shell--dashboard \.topbar/);
  assert.doesNotMatch(source, /\.two-column-grid\s*\{[^}]*display:\s*none/);
  const width820 = source.indexOf("@media (max-width: 820px)");
  const width680 = source.indexOf("@media (max-width: 680px)");
  const width580 = source.indexOf("@media (max-width: 580px)");
  const width340 = source.indexOf("@media (max-width: 340px)");
  assert.ok(width820 >= 0 && width680 > width820 && width580 > width680 && width340 > width580, "Breakpoint global harus terurut 820px → 680px → 580px → 340px.");
  assert.match(settings, /@media \(max-width: 580px\)[\s\S]*\.settingsCard > :last-child\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?width:\s*100%;/);
  assert.match(source.slice(width340), /:root \{ --mobile-page-gutter:\s*12px; --mobile-card-padding:\s*14px; \}/);
});

test("selector responsive tidak boleh menggantung sebelum selector berikutnya", async () => {
  const source = await read("src/styles/responsive.css");
  assert.doesNotMatch(source, /[^,{]+,\s*\n\s*\n\s*[^@]/, "Selector yang berakhir koma tidak boleh dipisahkan baris kosong.");
});


test("menu mobile tidak menduplikasi kontrol tema, aman saat route berubah, dan memakai swipe canonical", async () => {
  const [shell, components, modal, modalStyles] = await Promise.all([
    read("src/layouts/AppShell.jsx"),
    read("src/styles/components.css"),
    Promise.all([read("src/components/common/Modal.jsx"), read("src/components/common/useMobileSwipeDismiss.js")]).then((parts) => parts.join("\n")),
    read("src/components/common/Modal.module.css"),
  ]);
  assert.match(shell, /item\.ownerOnly \|\| user\?\.role === "owner"/);
  assert.doesNotMatch(shell, /ThemeToggle showLabel/);
  assert.doesNotMatch(shell, /mobile-menu-quick-add/);
  assert.match(shell, /!dashboardRoute && !transactionsRoute/);
  assert.match(shell, /mobileMenuRoute === location\.pathname/);
  assert.match(shell, /setMobileMenuRoute\(location\.pathname\)/);
  assert.match(shell, /key=\{`mobile-more-\$\{location\.pathname\}`\}/);
  assert.match(shell, /initialFocusRef=\{mobileMenuInitialFocusRef\}/);
  assert.match(shell, /mobileSwipeToClose/);
  assert.match(shell, /handleMobileLogout/);
  assert.match(shell, /mobile-menu-footer/);
  assert.match(shell, /mobile-menu-logout/);
  assert.match(components, /\.mobile-menu-link \{[^}]*border:\s*0;/);
  assert.match(components, /\.mobile-menu-footer \{[^}]*safe-area-inset-bottom/);
  assert.doesNotMatch(components, /mobile-menu-theme/);
  assert.match(modal, /mobileSwipeToClose = true/);
  assert.match(modal, /data-mobile-swipe-to-close/);
  assert.match(modal, /onPointerDown|swipeHandlers/);
  assert.match(modal, /SWIPE_DISMISS_RATIO/);
  assert.match(modalStyles, /@keyframes mobile-sheet-in/);
  assert.match(modalStyles, /animation-name:\s*mobile-sheet-in/);
  assert.match(modalStyles, /\.mobileDragHandle/);
  assert.match(modalStyles, /\.swipeHeader \{[\s\S]*touch-action:\s*pan-x pinch-zoom;/);
});
