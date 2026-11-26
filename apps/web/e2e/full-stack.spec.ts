import { expect, test } from '@playwright/test';

test.describe('DreamFive Full Stack E2E', () => {
  test('guards /change-password, persists league/lineup/settings/transfers/mail without Mailpit, and verifies stats modal stability + CPU avatar suppression + simulation', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // 1. Direct access to /change-password without token is blocked and pops bottom-right error toast
    await page.goto('/change-password');
    await expect(page.getByRole('heading', { name: 'Direct access unavailable' })).toBeVisible({
      timeout: 15_000,
    });
    const blockedToast = page.getByTestId('toast-notification').last();
    await expect(blockedToast).toBeVisible({ timeout: 5_000 });
    await expect(blockedToast).toHaveAttribute('data-toast-tone', 'error');

    // 2. Auth errors render in bottom-right popup dialog without inline error alerts, then sign in cleanly
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator('#auth-email').fill('maria.s@dreamfive.local');
    await page.locator('#auth-password').fill('WrongPass123!');
    await page.getByRole('button', { name: 'Sign in to DreamFive' }).click();
    const authErrToast = page.getByTestId('toast-notification').last();
    await expect(authErrToast).toBeVisible({ timeout: 10_000 });
    await expect(authErrToast).toHaveAttribute('data-toast-tone', 'error');
    const authToastBox = await authErrToast.boundingBox();
    expect(authToastBox).not.toBeNull();
    if (authToastBox) {
      expect(authToastBox.x + authToastBox.width / 2).toBeGreaterThan(720);
      expect(authToastBox.y + authToastBox.height / 2).toBeGreaterThan(450);
    }

    await page.locator('#auth-password').fill('DreamFiveDemo!2026');
    await page.getByRole('button', { name: 'Sign in to DreamFive' }).click();

    // Wait for authenticated shell regardless of previously saved user locale
    await expect(page.locator('a[href="/leagues"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('a[href="/mail"]').first()).toBeVisible();
    await expect(page.locator('a[href="/simulation"]')).toHaveCount(0);

    // Normalize panel preferences to Dark + Orange + English before running English assertions
    await page.locator('a[href="/settings"]').first().click();
    await expect(
      page.getByRole('heading', { name: /Panel Settings|Ajustes del panel/i }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /Dark|Oscuro/i }).click();
    await page.getByRole('button', { name: /Orange|Naranja/i }).click();
    await page.getByRole('button', { name: /English|Inglés/i }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'orange');

    // 3. Create a fresh private league when presidency slot is free
    const uniqueSuffix = Date.now().toString().slice(-6);
    const leagueName = `E2E League ${uniqueSuffix}`;
    await page.locator('a[href="/leagues"]').first().click();
    await expect(page.getByRole('heading', { name: /Private Leagues/i })).toBeVisible();

    const createHeaderBtn = page.getByRole('button', { name: 'Create new league' }).first();
    await expect(createHeaderBtn).toBeEnabled();
    // If no active presidency yet create league, otherwise verify clicking triggers bottom-right error toast
    await createHeaderBtn.click();
    const createDialogVisible = await page
      .getByRole('dialog')
      .isVisible()
      .catch(() => false);
    if (createDialogVisible) {
      await page.getByLabel('League name').fill(leagueName);
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^Create league$/i })
        .click();
      await expect(page.getByText(/League created cleanly/i)).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(
        page
          .getByTestId('toast-notification')
          .filter({ hasText: /already preside/i })
          .last(),
      ).toBeVisible({ timeout: 10_000 });
    }

    // 4. Lineup: equal height "Squad options" header across all 5 slots & reload persistence
    await page.locator('a[href="/lineup"]').first().click();
    await expect(page.getByRole('heading', { name: /Starting Five Lineup/i })).toBeVisible({
      timeout: 15_000,
    });

    const squadHeaders = page.getByText(/^Squad options \(\d+\)$/);
    await expect(squadHeaders).toHaveCount(5);
    const headerCount = await squadHeaders.count();
    const headerTops: number[] = [];
    for (let i = 0; i < headerCount; i++) {
      const box = await squadHeaders.nth(i).boundingBox();
      expect(box).not.toBeNull();
      if (!box) {
        throw new Error('Expected bounding box for Squad options heading');
      }
      headerTops.push(box.y);
    }
    expect(Math.max(...headerTops) - Math.min(...headerTops)).toBeLessThanOrEqual(2);

    const saveLineupBtn = page.getByRole('button', { name: 'Save lineup' });
    await expect(saveLineupBtn).toBeDisabled();

    // Change PG starter so lineup diff activates the Save button, save, then verify it disables again
    const pgSlot = page.getByTestId('lineup-slot-PG');
    const unselectedPgOption = pgSlot.locator('button[aria-pressed="false"]').first();
    await unselectedPgOption.click();
    await expect(saveLineupBtn).toBeEnabled({ timeout: 5_000 });

    await saveLineupBtn.click();
    await expect(page.getByText(/Starters saved cleanly/i)).toBeVisible({ timeout: 15_000 });
    await expect(saveLineupBtn).toBeDisabled({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole('heading', { name: /Starting Five Lineup/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Save lineup' })).toBeDisabled();

    // 5. Settings persistence (theme, accent, bilingual i18n)
    await page.locator('a[href="/settings"]').first().click();
    await expect(page.getByRole('heading', { name: /Panel Settings/i })).toBeVisible();

    await page.getByRole('button', { name: 'White' }).click();
    await page.getByRole('button', { name: 'Blue' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');

    await page.getByRole('button', { name: 'Spanish' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { name: /Ajustes del panel/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');

    // Switch back to English dark orange
    await page.getByRole('button', { name: /Oscuro|Dark/i }).click();
    await page.getByRole('button', { name: /Naranja|Orange/i }).click();
    await page.getByRole('button', { name: /Inglés|English/i }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'orange');

    // 6. Profile: inline pencil username edit (X cancel & tick save), NO old input in account details, and 3-step delete account flow
    await page.locator('a[href="/profile"]').first().click();
    await expect(page.getByRole('heading', { name: /Manager Profile/i })).toBeVisible();
    await expect(page.locator('#reset-new-password')).toHaveCount(0);
    await expect(page.locator('#profile-username')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit username' }).click();
    const inlineInput = page.locator('#profile-inline-username');
    await expect(inlineInput).toBeVisible();
    const previousManagerName = await inlineInput.inputValue();
    await inlineInput.fill(`CancelTry_${uniqueSuffix}`);
    await page.getByRole('button', { name: 'Cancel username edit' }).click();
    await expect(page.locator('#profile-inline-username')).toHaveCount(0);
    await expect(page.getByText(previousManagerName).first()).toBeVisible();

    await page.getByRole('button', { name: 'Edit username' }).click();
    await page.locator('#profile-inline-username').fill(`Maria_${uniqueSuffix}`);
    await page.getByRole('button', { name: 'Confirm new username' }).click();
    await expect(page.getByText('Manager name updated.')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Edit username' }).click();
    await page.locator('#profile-inline-username').fill(previousManagerName);
    await page.getByRole('button', { name: 'Confirm new username' }).click();
    await expect(page.getByText('Manager name updated.')).toBeVisible({ timeout: 10_000 });

    // Verify 3-step delete confirmation dialog button placement (Step 1: Cancel left / Accept right; Step 2: Accept left / Cancel right)
    await page.getByRole('button', { name: 'Delete account' }).click();
    const step1Dialog = page.getByRole('dialog');
    await expect(step1Dialog).toContainText(/You are about to delete your account/i);
    const s1Btns = step1Dialog.locator('button');
    // Skip close X icon button at index 0 -> Cancel is left (index 1), Accept is right (index 2)
    await expect(s1Btns.nth(1)).toHaveText(/Cancel/i);
    await expect(s1Btns.nth(2)).toHaveText(/Accept/i);
    await s1Btns.nth(2).click();

    await expect(step1Dialog).toContainText(/Are you sure\?/i);
    const s2Btns = step1Dialog.locator('button');
    await expect(s2Btns.nth(1)).toHaveText(/Accept/i);
    await expect(s2Btns.nth(2)).toHaveText(/Cancel/i);
    await s2Btns.nth(1).click();

    await expect(step1Dialog).toContainText(/Confirm account deletion/i);
    await expect(step1Dialog.locator('#delete-confirm-username')).toBeVisible();
    await page
      .getByRole('button', { name: /Cancel/i })
      .last()
      .click();
    await expect(step1Dialog).toBeHidden();

    // 7. Transfer desk: empty default cash inputs, 0.1M decimal cash support, green accepted banner
    await page.locator('a[href="/transfers"]').first().click();
    await expect(page.getByRole('heading', { name: /Transfer & Trade Desk/i })).toBeVisible({
      timeout: 15_000,
    });
    const cashOfferedInput = page.locator('#cash-offered');
    const cashRequestedInput = page.locator('#cash-requested');
    await expect(cashOfferedInput).toHaveValue('');
    await expect(cashRequestedInput).toHaveValue('');
    await cashOfferedInput.fill('0.4');
    await expect(cashOfferedInput).toHaveValue('0.4');

    const rosterCheckLists = page.locator('div.max-h-72');
    const myPgBtn = rosterCheckLists
      .nth(0)
      .locator('button:not([disabled]):has-text("PG")')
      .first();
    const theirPgBtn = rosterCheckLists
      .nth(1)
      .locator('button:not([disabled]):has-text("PG")')
      .last();
    const extractMillions = (txt: string): number => {
      const m = /\$?(\d+(?:\.\d+)?)M/.exec(txt);
      return m?.[1] ? Number.parseFloat(m[1]) : 10;
    };
    const myPrice = extractMillions(await myPgBtn.innerText());
    const theirPrice = extractMillions(await theirPgBtn.innerText());
    const fairSurplusCash = Math.max(
      0.4,
      Math.ceil((theirPrice - myPrice + 3.0) * 10) / 10,
    ).toFixed(1);

    await myPgBtn.click();
    await theirPgBtn.click();
    await cashOfferedInput.fill(fairSurplusCash);
    const submitOfferBtn = page.getByRole('button', { name: /Submit proposal/i });
    await expect(submitOfferBtn).toBeEnabled({ timeout: 10_000 });
    await submitOfferBtn.click();
    await expect(page.getByText(/Transfer locks active|Bloqueos de traspaso activos/i)).toHaveCount(
      0,
    );
    const tradeToast = page
      .getByTestId('toast-notification')
      .filter({ hasText: /Congratulations|Enhorabuena|Offer delivered/i })
      .last();
    await expect(tradeToast).toBeVisible({ timeout: 15_000 });
    await expect(cashOfferedInput).toHaveValue('');
    await expect(cashRequestedInput).toHaveValue('');

    // 8. League Mail inbox renders transfer notification for human team
    await page.locator('a[href="/mail"]').first().click();
    await expect(page.getByRole('heading', { name: /League Mail/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Transfers', exact: true }).click();
    await expect(page.getByText(/Offer Sent|Trade Completed/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // 9. Sign out and sign in as admin ivan.k@dreamfive.local to simulate round & inspect UI improvements
    const [logoutResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/auth/logout')),
      page.getByRole('button', { name: 'Sign out' }).click(),
    ]);
    expect(logoutResponse.status()).toBeLessThan(400);
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 15_000 });
    await page.locator('#auth-email').fill('ivan.k@dreamfive.local');
    await page.locator('#auth-password').fill('DreamFiveDemo!2026');
    await page.getByRole('button', { name: 'Sign in to DreamFive' }).click();

    const simLink = page.locator('a[href="/simulation"]').first();
    await expect(simLink).toBeVisible({ timeout: 20_000 });
    await simLink.click();
    await expect(
      page.getByRole('heading', { name: /Simulation Console|Consola de simulación/i }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: /Simulate next round|Simular siguiente jornada/i })
      .click();
    await expect(page.getByText(/Round \d+ simulated|Jornada \d+ simulada/i)).toBeVisible({
      timeout: 25_000,
    });

    // Ensure admin session is in English for predictable UI heading assertions
    await page.locator('a[href="/settings"]').first().click();
    await expect(
      page.getByRole('heading', { name: /Panel Settings|Ajustes del panel/i }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /English|Inglés/i }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // 10. Players page: NO PTS/REB/AST headers in table; PlayerDetailModal opens with zero layout shift & shows franchise/player switcher + DP breakdown
    await page.locator('a[href="/players"]').first().click();
    await expect(page.getByRole('heading', { name: /Player Explorer/i })).toBeVisible({
      timeout: 15_000,
    });
    const tableHeadersText = await page.locator('table thead').first().innerText();
    expect(tableHeadersText).not.toMatch(/\bPTS\b/);
    expect(tableHeadersText).not.toMatch(/\bREB\b/);
    expect(tableHeadersText).not.toMatch(/\bAST\b/);

    const inspectBtn = page.getByRole('button', { name: /Inspect match stats/i });
    await expect(inspectBtn).toBeEnabled({ timeout: 15_000 });
    const headingBeforeBox = await page
      .getByRole('heading', { name: /Player Explorer/i })
      .boundingBox();
    const scrollBefore = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));

    await inspectBtn.click();
    const playerDialog = page.getByRole('dialog');
    await expect(playerDialog).toBeVisible({ timeout: 10_000 });

    const headingAfterBox = await page
      .getByRole('heading', { name: /Player Explorer/i })
      .boundingBox();
    const scrollAfter = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    expect(scrollAfter).toEqual(scrollBefore);
    if (headingBeforeBox && headingAfterBox) {
      expect(Math.abs(headingAfterBox.x - headingBeforeBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(headingAfterBox.y - headingBeforeBox.y)).toBeLessThanOrEqual(1);
    }

    await expect(playerDialog.getByLabel('Switch franchise')).toBeVisible();
    await expect(playerDialog.getByLabel('Switch player')).toBeVisible();
    await expect(
      playerDialog.getByText(/Dream Points Breakdown|Desglose de Dream Points/i),
    ).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(playerDialog).toBeHidden({ timeout: 5_000 });

    // 11. Rankings: no #D5-xxxx tag, updated team names, NO avatars on CPU rows
    await page.locator('a[href="/rankings"]').first().click();
    await expect(page.getByText(/Los Angeles Rivers|Chicago Bisons/i).first()).toBeVisible({
      timeout: 15_000,
    });
    const standingsTableText = await page.locator('table').first().innerText();
    expect(standingsTableText).not.toMatch(/#D5-\d{4}/);

    const cpuRowsWithAvatars = await page
      .locator('tbody tr')
      .filter({ has: page.locator('td:nth-child(3)', { hasText: /^\s*CPU\s*$/ }) })
      .locator('[data-default-avatar="true"], td:nth-child(3) img')
      .count();
    expect(cpuRowsWithAvatars).toBe(0);

    // 12. Mail inbox for simulated round notifications & mark read action
    await page.locator('a[href="/mail"]').first().click();
    await expect(page.getByRole('heading', { name: /League Mail/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Match Result/i).first()).toBeVisible({ timeout: 10_000 });
    const markReadBtn = page.getByRole('button', { name: /Mark read/i }).first();
    if (await markReadBtn.isVisible()) {
      await markReadBtn.click();
    }

    // 13. Dashboard: Recent League Transfers card visible + click opens modal cleanly
    await page.locator('a[href="/"]').first().click();
    const recentTradesCard = page.getByTestId('dashboard-recent-trades-card');
    await expect(recentTradesCard).toBeVisible({ timeout: 15_000 });
    await recentTradesCard.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog').getByRole('heading')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5_000 });

    // 14. Matches: Round 1 winner reward + DP
    await page.locator('a[href="/matches"]').first().click();
    await expect(page.getByRole('heading', { name: /Match Center/i })).toBeVisible({
      timeout: 15_000,
    });
    const roundFilter = page.getByLabel(/Filter by round|Filtrar por jornada/i);
    await expect(roundFilter).toBeVisible({ timeout: 10_000 });
    await roundFilter.selectOption('1');
    const winnerRewardBtn = page.getByText(/Winner reward|Premio victoria/i).first();
    await expect(winnerRewardBtn).toBeVisible({ timeout: 15_000 });
    await winnerRewardBtn.click();
    await expect(page.getByText(/\bDP\b/).first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    // 15. Mobile responsive layout & horizontal table scrollbar verification (375x812)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/teams');
    await page.waitForLoadState('networkidle');
    const tableViewBtn = page.getByRole('button', { name: /Table view|Vista en lista/i });
    const cardsViewBtn = page.getByRole('button', { name: /Cards view|Vista en cajas/i });
    await expect(tableViewBtn).toBeVisible();
    await expect(cardsViewBtn).toBeVisible();
    const cardsBtnBox = await cardsViewBtn.boundingBox();
    expect(cardsBtnBox).not.toBeNull();
    if (cardsBtnBox) {
      expect(cardsBtnBox.x + cardsBtnBox.width).toBeLessThanOrEqual(376);
    }
    await expect(page.getByText(/\bCR\b/)).toHaveCount(0);

    const mobileRoutes = [
      { path: '/', expectsTable: true },
      { path: '/players', expectsTable: true },
      { path: '/lineup', expectsTable: false },
      { path: '/market', expectsTable: true },
      { path: '/rankings', expectsTable: true },
      { path: '/transfers', expectsTable: false },
      { path: '/matches', expectsTable: false },
      { path: '/mail', expectsTable: false },
      { path: '/teams', expectsTable: true },
      { path: '/leagues', expectsTable: false },
      { path: '/profile', expectsTable: false },
    ] as const;

    for (const routeCheck of mobileRoutes) {
      await page.goto(routeCheck.path);
      await page.waitForLoadState('networkidle');
      const overflowCheck = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
        tableContainers: Array.from(document.querySelectorAll('.dreamfive-table-scroll')).map(
          (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return {
              overflowX: style.overflowX,
              right: rect.right,
              width: rect.width,
            };
          },
        ),
      }));
      expect(
        overflowCheck.scrollWidth,
        `Horizontal overflow detected on mobile route ${routeCheck.path}`,
      ).toBeLessThanOrEqual(overflowCheck.clientWidth);
      if (routeCheck.expectsTable) {
        expect(overflowCheck.tableContainers.length).toBeGreaterThanOrEqual(1);
        for (const container of overflowCheck.tableContainers) {
          expect(container.overflowX).toBe('auto');
          expect(container.right).toBeLessThanOrEqual(overflowCheck.innerWidth + 1);
        }
      }
    }

    expect(pageErrors).toEqual([]);
  });
});
