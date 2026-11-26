import { expect, test } from '@playwright/test';

const USER_ROUTES = [
  {
    path: '/',
    heading: /Dashboard · |Panel · |You are not part|Todavía no participas/i,
  },
  { path: '/leagues', heading: /Private Leagues|Mis ligas privadas/i },
  { path: '/teams', heading: /Franchises & Squads|Franquicias y plantillas/i },
  { path: '/lineup', heading: /Starting Five Lineup|Alineación titular/i },
  { path: '/players', heading: /Player Explorer|Explorador de jugadores/i },
  { path: '/market', heading: /League Dynamic Market|Mercado dinámico/i },
  { path: '/transfers', heading: /Transfer & Trade Desk|Mesa de traspasos y fichajes/i },
  { path: '/rankings', heading: /Standings · |Standings|Clasificación · |Clasificación/i },
  { path: '/matches', heading: /Match Center/i },
  { path: '/mail', heading: /League Mail|Mail de Liga/i },
  { path: '/profile', heading: /Manager Profile|Perfil/i },
  { path: '/settings', heading: /Panel Settings|Ajustes del panel/i },
];

test.describe('DreamFive UI smoke', () => {
  test('defaults to English dark theme, hides Simulation from regular users, and renders all routes cleanly', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page).toHaveTitle('DreamFive');
    await expect(page.getByRole('button', { name: 'Sign in to DreamFive' })).toBeVisible();
    const logoImg = page.getByRole('img', { name: 'DreamFive' }).first();
    await expect(logoImg).toBeVisible();
    expect(
      await logoImg.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0)),
    ).toBeGreaterThan(0);

    const faviconRes = await page.request.get('/favicon.ico');
    expect(faviconRes.status()).toBe(200);
    const pngLogoRes = await page.request.get('/dreamfive-logo.png');
    expect(pngLogoRes.status()).toBe(200);

    await page.locator('#auth-email').fill('maria.s@dreamfive.local');
    await page.locator('#auth-password').fill('DreamFiveDemo!2026');
    await page.getByRole('button', { name: 'Sign in to DreamFive' }).click();

    await expect(page.getByRole('link', { name: /My Leagues|Mis ligas/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('link', { name: /Simulation|Simulación/i })).toHaveCount(0);

    for (const route of USER_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible({
        timeout: 15_000,
      });
    }

    // Direct access to /simulation must remain blocked for non-admin accounts
    await page.goto('/simulation');
    await expect(page.getByRole('heading', { name: /Consola de simulación/i })).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });

  test('exposes Spanish untranslated simulation console strictly to ivan.k@dreamfive.local', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.locator('#auth-email').fill('ivan.k@dreamfive.local');
    await page.locator('#auth-password').fill('DreamFiveDemo!2026');
    await page.getByRole('button', { name: 'Sign in to DreamFive' }).click();

    const simNav = page.getByRole('link', { name: 'Simulation', exact: true }).first();
    await expect(simNav).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Engine & Control')).toBeVisible();
    await simNav.click();

    await expect(page.getByRole('heading', { name: /Consola de simulación/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /Simular siguiente jornada/i })).toBeVisible();
  });

  test('mobile drawer navigates across English routes cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.locator('#auth-email').fill('maria.s@dreamfive.local');
    await page.locator('#auth-password').fill('DreamFiveDemo!2026');
    await page.getByRole('button', { name: 'Sign in to DreamFive' }).click();

    const openMenuBtn = page.getByRole('button', {
      name: /Open navigation menu|Abrir menú de navegación/i,
    });
    await expect(openMenuBtn).toBeVisible({ timeout: 20_000 });
    await openMenuBtn.click();

    await expect(
      page
        .getByRole('button', { name: /Close navigation menu|Cerrar menú de navegación/i })
        .first(),
    ).toBeVisible();
    await page
      .getByRole('link', { name: /Lineup|Alineación/i })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: /Starting Five Lineup|Alineación titular/i }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });
});
