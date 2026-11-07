import { recordConsentAction } from '../app/consent/actions';
import { getActionSession } from '../lib/action-session';
import { apiMutate } from '../lib/api';
import { redirect } from 'next/navigation';
import { CURRENT_CONSENT_VERSION } from '../lib/constants';

jest.mock('../lib/action-session', () => ({ getActionSession: jest.fn() }));
jest.mock('../lib/auth', () => ({ authOptions: {} }));
jest.mock('../lib/api', () => ({ apiMutate: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }) }));
const session = jest.mocked(getActionSession);
const mutate = jest.mocked(apiMutate);

beforeEach(() => { jest.clearAllMocks(); });
it('shows a retryable failure without claiming consent was recorded', async () => {
  session.mockResolvedValue({ accessToken: 'synthetic', expires: 'future' });
  mutate.mockResolvedValue(null);
  expect(await recordConsentAction()).toEqual({ error: 'Persetujuan belum tersimpan. Periksa koneksi lalu coba lagi.' });
  expect(redirect).not.toHaveBeenCalled();
});
it('records the official version and redirects only after confirmation', async () => {
  session.mockResolvedValue({ accessToken: 'synthetic', expires: 'future' });
  mutate.mockResolvedValue({ id: 'synthetic', consentVersion: CURRENT_CONSENT_VERSION });
  await expect(recordConsentAction()).rejects.toThrow('REDIRECT:/dashboard');
  expect(mutate).toHaveBeenCalledWith('/auth/consent', 'synthetic', {
    method: 'POST', body: { version: CURRENT_CONSENT_VERSION },
  });
});
it('denies unauthenticated consent and stops before mutation when cookie persistence fails', async () => {
  session.mockResolvedValue(null);
  await expect(recordConsentAction()).rejects.toThrow('REDIRECT:/login?reason=session');
  expect(mutate).not.toHaveBeenCalled();
  session.mockRejectedValueOnce(new Error('cookie storage unavailable'));
  await expect(recordConsentAction()).rejects.toThrow('cookie storage unavailable');
  expect(mutate).not.toHaveBeenCalled();
});
