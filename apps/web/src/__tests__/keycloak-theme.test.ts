import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const themeRoot = resolve(__dirname, '../../../../infrastructure/keycloak/themes/diis/login');

function readThemeFile(path: string): string {
  return readFileSync(resolve(themeRoot, path), 'utf8');
}

describe('DIIS Keycloak login theme', () => {
  it('keeps password inputs readable on the institutional light theme', () => {
    const css = readThemeFile('resources/css/login.css');

    expect(css).toContain('#password');
    expect(css).toContain('#password-new');
    expect(css).toContain('background: #ffffff !important');
    expect(css).toContain('color: var(--diis-ink) !important');
    expect(css).toContain('-webkit-text-fill-color: var(--diis-ink) !important');
    expect(css).toContain('input.pf-c-form-control:-webkit-autofill');
  });

  it('keeps the locale menu closed until the explicit accessible trigger opens it', () => {
    const css = readThemeFile('resources/css/login.css');
    const script = readThemeFile('resources/js/login.js');
    const properties = readThemeFile('theme.properties');

    expect(css).toContain("#kc-locale-dropdown ul");
    expect(css).toContain("position: static");
    expect(css).toContain("flex-direction: column");
    expect(css).toContain("z-index: 20");
    expect(css).toContain("display: none !important");
    expect(css).toContain("#kc-locale-dropdown.is-open ul");
    expect(css).toContain("min-height: 44px");
    expect(properties).toContain('scripts=js/login.js');
    expect(script).toContain("trigger.setAttribute('aria-expanded', 'false')");
    expect(script).toContain("event.key === 'Escape'");
    expect(script).toContain("!dropdown.contains(event.target)");
    expect(script).toContain("dropdown.addEventListener('focusout'");
    expect(script).toContain("window.addEventListener('blur'");
  });

  it('keeps locale menu state and forward/backward Tab focus deterministic', () => {
    type Handler = (event: {
      key?: string;
      shiftKey?: boolean;
      target?: unknown;
      preventDefault(): void;
      stopImmediatePropagation(): void;
    }) => void;
    const handlers = new Map<string, Handler[]>();
    const classNames = new Set<string>();
    const attributes = new Map<string, string>();
    let activeElement: unknown = null;

    const on = (scope: string, type: string, handler: Handler) => {
      const key = `${scope}:${type}`;
      handlers.set(key, [...(handlers.get(key) ?? []), handler]);
    };
    const emit = (scope: string, type: string, event: Partial<Parameters<Handler>[0]> = {}) => {
      const payload = {
        preventDefault: jest.fn(),
        stopImmediatePropagation: jest.fn(),
        ...event,
      } as Parameters<Handler>[0];
      for (const handler of handlers.get(`${scope}:${type}`) ?? []) handler(payload);
      return payload;
    };
    const item = (name: string) => ({
      name,
      setAttribute: (attribute: string, value: string) => attributes.set(`${name}:${attribute}`, value),
      focus: () => { activeElement = name; },
    });
    const items = [item('Bahasa Indonesia'), item('English')];
    const menu = {
      id: '',
      setAttribute: (name: string, value: string) => attributes.set(`menu:${name}`, value),
      querySelector: () => items[0],
      querySelectorAll: () => items,
      contains: (target: unknown) => items.includes(target as never),
      addEventListener: (type: string, handler: Handler) => on('menu', type, handler),
    };
    const trigger = {
      hasAttribute: () => false,
      getAttribute: () => null,
      setAttribute: (name: string, value: string) => attributes.set(`trigger:${name}`, value),
      addEventListener: (type: string, handler: Handler) => on('trigger', type, handler),
      focus: () => { activeElement = trigger; },
    };
    const username = {
      hasAttribute: () => false,
      getAttribute: () => null,
      focus: () => { activeElement = 'Username'; },
    };
    const password = {
      hasAttribute: () => false,
      getAttribute: () => null,
      focus: () => { activeElement = 'Password'; },
    };
    const dropdown = {
      classList: {
        add: (name: string) => classNames.add(name),
        remove: (name: string) => classNames.delete(name),
        contains: (name: string) => classNames.has(name),
      },
      querySelector: () => menu,
      contains: (target: unknown) => target === trigger || target === menu || items.includes(target as never),
      addEventListener: (type: string, handler: Handler) => on('dropdown', type, handler),
    };
    const document = {
      readyState: 'complete',
      get activeElement() { return activeElement; },
      getElementById: (id: string) => id === 'kc-locale-dropdown' ? dropdown : id === 'kc-current-locale-link' ? trigger : null,
      querySelectorAll: () => [trigger, username, password],
      addEventListener: (type: string, handler: Handler) => on('document', type, handler),
    };
    const window = {
      addEventListener: (type: string, handler: Handler) => on('window', type, handler),
      setTimeout: (handler: () => void) => handler(),
    };

    runInNewContext(readThemeFile('resources/js/login.js'), { document, window });
    expect(attributes.get('trigger:aria-expanded')).toBe('false');
    expect(attributes.get('trigger:aria-controls')).toBe('kc-locale-list');
    expect(attributes.get('menu:aria-hidden')).toBe('true');
    expect(attributes.get('Bahasa Indonesia:role')).toBe('menuitem');
    expect(attributes.get('English:role')).toBe('menuitem');
    expect(attributes.get('Bahasa Indonesia:tabindex')).toBe('-1');

    emit('trigger', 'click', { target: trigger });
    expect(classNames.has('is-open')).toBe(true);
    expect(attributes.get('trigger:aria-expanded')).toBe('true');
    expect(activeElement).toBe('Bahasa Indonesia');

    emit('document', 'click', { target: {} });
    expect(classNames.has('is-open')).toBe(false);
    expect(attributes.get('menu:aria-hidden')).toBe('true');

    emit('trigger', 'keydown', { key: 'Enter', target: trigger });
    emit('menu', 'keydown', { key: 'End', target: menu });
    expect(activeElement).toBe('English');
    emit('menu', 'keydown', { key: 'Home', target: menu });
    expect(activeElement).toBe('Bahasa Indonesia');
    const forwardTab = emit('menu', 'keydown', { key: 'Tab', target: menu });
    expect(forwardTab.preventDefault).toHaveBeenCalled();
    expect(forwardTab.stopImmediatePropagation).toHaveBeenCalled();
    expect(classNames.has('is-open')).toBe(false);
    expect(activeElement).toBe('Username');

    emit('trigger', 'keydown', { key: 'Enter', target: trigger });
    const backwardTab = emit('menu', 'keydown', { key: 'Tab', shiftKey: true, target: menu });
    expect(backwardTab.preventDefault).toHaveBeenCalled();
    expect(backwardTab.stopImmediatePropagation).toHaveBeenCalled();
    expect(classNames.has('is-open')).toBe(false);
    expect(activeElement).toBe(trigger);

    emit('trigger', 'keydown', { key: 'Enter', target: trigger });
    emit('menu', 'keydown', { key: 'Escape', target: menu });
    expect(classNames.has('is-open')).toBe(false);
    expect(activeElement).toBe(trigger);

    emit('trigger', 'click', { target: trigger });
    activeElement = {};
    emit('dropdown', 'focusout', { target: menu });
    expect(classNames.has('is-open')).toBe(false);
  });

  it('uses clear locale labels in both supported languages', () => {
    expect(readThemeFile('messages/messages_id.properties')).toContain('locale_id=Bahasa Indonesia');
    expect(readThemeFile('messages/messages_en.properties')).toContain('locale_en=English');
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
