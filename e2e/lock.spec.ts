import { expect, test, type Page } from '@playwright/test';
import { netWorthValue, onboard } from './helpers';
import { EMAIL, MOCK_PASSWORD, mockSupabase } from './supabaseMock';

/**
 * Face ID and Forgot PIN. Playwright's WebKit has no Face ID, so a stand-in platform
 * authenticator is injected: it answers like iOS does (our rpIdHash, user-verified flag).
 * Supabase is mocked (no real network, no real credentials); service workers are blocked
 * so every request hits the mock.
 */
test.use({ serviceWorkers: 'block' });

async function fakeFaceId(page: Page) {
  await page.addInitScript(() => {
    const rawId = new Uint8Array([7, 7, 7, 7]).buffer;
    const creds = {
      create: async () => ({ rawId }),
      get: async (o: CredentialRequestOptions) => {
        if (localStorage.getItem('test:face-fail') === '1') throw new DOMException('cancelled', 'NotAllowedError');
        const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(o.publicKey!.rpId!)));
        const a = new Uint8Array(37);
        a.set(h);
        a[32] = 0x05; // user present + user verified
        return { rawId, response: { authenticatorData: a.buffer } };
      },
    };
    // WebKitGTK may have no WebAuthn at all: define both from scratch
    Object.defineProperty(Navigator.prototype, 'credentials', { configurable: true, get: () => creds });
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      writable: true,
      value: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true },
    });
  });
}

async function pin(page: Page, digits: string) {
  const pad = page.getByRole('group', { name: 'PIN keypad' }).last();
  for (const d of digits) await pad.getByRole('button', { name: d, exact: true }).click();
}

async function turnOnLock(page: Page, digits = '135790') {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /^App Lock/ }).click();
  const sheet = page.getByRole('dialog', { name: 'App Lock' });
  await sheet.getByRole('button', { name: 'Turn On App Lock' }).click();
  await pin(page, digits);
  await expect(sheet.getByText('Enter it again')).toBeVisible();
  await pin(page, digits);
  await expect(page.getByText('App Lock is on')).toBeVisible();
  return sheet;
}

const lockScreen = (page: Page) => page.getByRole('dialog', { name: 'Dreams is locked' });

test('Face ID: turn on, unlocks on launch; when it fails the PIN still works', async ({ page }) => {
  await fakeFaceId(page);
  await onboard(page);
  const sheet = await turnOnLock(page);
  await sheet.getByRole('switch', { name: 'Lock with Face ID' }).click();
  await expect(page.getByText('Face ID is on')).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('Face ID')).toBeVisible();

  // relaunch: Face ID is asked for at once and unlocks
  await page.reload();
  await expect(page.getByTestId('net-worth')).toBeVisible();
  await expect(lockScreen(page)).toBeHidden();

  // Face ID refuses: the lock screen stays, the button explains, the PIN unlocks
  await page.evaluate(() => localStorage.setItem('test:face-fail', '1'));
  await page.reload();
  await expect(lockScreen(page)).toBeVisible();
  await expect(page.getByTestId('net-worth')).toHaveCount(0);
  await lockScreen(page).getByRole('button', { name: 'Unlock with Face ID' }).click();
  await expect(lockScreen(page).getByText('Face ID was cancelled. Use your PIN or try again.')).toBeVisible();
  await pin(page, '135790');
  await expect(page.getByTestId('net-worth')).toBeVisible();
});

test('Forgot PIN: re-auth with the sync account, choose a new PIN, no local data lost', async ({ page }) => {
  const m = await mockSupabase(page);
  await onboard(page, { balance: '12345' });
  const before = await netWorthValue(page);
  const sheet = await turnOnLock(page);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();

  await page.reload();
  await expect(lockScreen(page)).toBeVisible();
  await lockScreen(page).getByRole('button', { name: 'Forgot PIN?' }).click();
  await page.getByRole('button', { name: 'Reset PIN with Sync Account' }).click();
  await lockScreen(page).getByLabel('Email').fill(EMAIL);
  await lockScreen(page).getByLabel('Password').fill('wrong password');
  await lockScreen(page).getByRole('button', { name: 'Continue' }).click();
  await expect(lockScreen(page).getByText('That email and password don’t match.')).toBeVisible();
  await lockScreen(page).getByLabel('Password').fill(MOCK_PASSWORD);
  await lockScreen(page).getByRole('button', { name: 'Continue' }).click();

  await expect(lockScreen(page).getByText('Choose a new PIN')).toBeVisible();
  await pin(page, '246802');
  await expect(lockScreen(page).getByText('Enter it again')).toBeVisible();
  await pin(page, '246802');
  await expect(page.getByTestId('net-worth')).toBeVisible();
  expect(await netWorthValue(page)).toBe(before);

  // the old PIN is gone, the new one works, data still there
  await page.reload();
  await pin(page, '135790');
  await expect(lockScreen(page).getByText(/Wrong PIN/)).toBeVisible();
  await pin(page, '246802');
  await expect(page.getByTestId('net-worth')).toBeVisible();
  expect(await netWorthValue(page)).toBe(before);
  expect(m.unexpected).toEqual([]);
});
