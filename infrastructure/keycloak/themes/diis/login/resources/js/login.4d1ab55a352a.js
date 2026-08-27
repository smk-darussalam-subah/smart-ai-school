(function () {
  'use strict';

  function initLocaleMenu() {
    var dropdown = document.getElementById('kc-locale-dropdown');
    var trigger = document.getElementById('kc-current-locale-link');
    var menu = dropdown ? dropdown.querySelector('ul') : null;
    if (!dropdown || !trigger || !menu) return;

    var close = function (restoreFocus) {
      dropdown.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-hidden', 'true');
      if (restoreFocus) trigger.focus();
    };
    var open = function () {
      dropdown.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      menu.setAttribute('aria-hidden', 'false');
      var first = menu.querySelector('a');
      if (first) first.focus();
    };
    var focusAfterTrigger = function () {
      var focusable = Array.prototype.slice.call(document.querySelectorAll([
        'a[href]:not([tabindex="-1"])',
        'button:not([disabled]):not([tabindex="-1"])',
        'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
        'select:not([disabled]):not([tabindex="-1"])',
        'textarea:not([disabled]):not([tabindex="-1"])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(','))).filter(function (element) {
        return !menu.contains(element) &&
          !element.hasAttribute('hidden') &&
          element.getAttribute('aria-hidden') !== 'true';
      });
      var triggerIndex = focusable.indexOf(trigger);
      var next = triggerIndex >= 0 ? focusable[triggerIndex + 1] : null;
      (next || trigger).focus();
    };

    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    if (!menu.id) menu.id = 'kc-locale-list';
    trigger.setAttribute('aria-controls', menu.id);
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call(menu.querySelectorAll('a'), function (item) {
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '-1');
    });

    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      if (dropdown.classList.contains('is-open')) close(false);
      else open();
    });
    trigger.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
    });
    menu.addEventListener('keydown', function (event) {
      var items = Array.prototype.slice.call(menu.querySelectorAll('a'));
      var current = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'ArrowDown' && items.length > 0) {
        event.preventDefault();
        items[(current + 1) % items.length].focus();
      } else if (event.key === 'ArrowUp' && items.length > 0) {
        event.preventDefault();
        items[(current - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Home' && items.length > 0) {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End' && items.length > 0) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(false);
        if (event.shiftKey) trigger.focus();
        else focusAfterTrigger();
      }
    }, true);
    document.addEventListener('click', function (event) {
      if (!dropdown.contains(event.target)) close(false);
    });
    dropdown.addEventListener('focusout', function () {
      window.setTimeout(function () {
        if (!dropdown.contains(document.activeElement)) close(false);
      }, 0);
    });
    window.addEventListener('blur', function () { close(false); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLocaleMenu, { once: true });
  } else {
    initLocaleMenu();
  }
})();
