import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const themeRoot = resolve(__dirname, '../../../../infrastructure/keycloak/themes/diis/login');

function readThemeFile(path: string): string {
  return readFileSync(resolve(themeRoot, path), 'utf8');
}

describe('DIIS Keycloak login theme', () => {
  it('keeps password inputs readable on the dark login theme', () => {
    const css = readThemeFile('resources/css/login.css');

    expect(css).toContain("#password");
    expect(css).toContain("#password-new");
    expect(css).toContain("-webkit-text-fill-color: #f8fafc");
    expect(css).toContain("input.pf-c-form-control:-webkit-autofill");
  });

  it('positions the locale menu without covering the login form', () => {
    const css = readThemeFile('resources/css/login.css');

    expect(css).toContain("#kc-locale-dropdown ul");
    expect(css).toContain("position: absolute");
    expect(css).toContain("right: 0");
    expect(css).toContain("z-index: 20");
  });

  it('documents the first-login password policy in the update password view', () => {
    const css = readThemeFile('resources/css/login.css');
    const idMessages = readThemeFile('messages/messages_id.properties');
    const enMessages = readThemeFile('messages/messages_en.properties');

    expect(css).toContain(".form-group:has(#password-new)::after");
    expect(css).toContain("Minimal 8 karakter");
    expect(idMessages).toContain("invalidPasswordMinSpecialCharsMessage");
    expect(enMessages).toContain("invalidPasswordMinSpecialCharsMessage");
  });
});
