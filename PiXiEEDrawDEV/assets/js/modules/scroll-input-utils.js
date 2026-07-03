(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createScrollInputUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function getScrollableAncestor(node) {
    let current = node instanceof Element ? node : null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 1;
      if (canScrollY) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getScrollableMaxTop(element) {
    if (!(element instanceof HTMLElement)) {
      return 0;
    }
    return Math.max(0, element.scrollHeight - element.clientHeight);
  }

  function canScrollElementByDeltaY(element, deltaY) {
    if (!(element instanceof HTMLElement) || !Number.isFinite(deltaY) || Math.abs(deltaY) < 0.01) {
      return false;
    }
    const maxScrollTop = getScrollableMaxTop(element);
    if (maxScrollTop <= 1) {
      return false;
    }
    if (deltaY > 0) {
      return element.scrollTop < maxScrollTop - 1;
    }
    return element.scrollTop > 1;
  }

  function scrollElementByDeltaY(element, deltaY) {
    if (!(element instanceof HTMLElement) || !Number.isFinite(deltaY) || Math.abs(deltaY) < 0.01) {
      return false;
    }
    const maxScrollTop = getScrollableMaxTop(element);
    if (maxScrollTop <= 0) {
      return false;
    }
    const previous = element.scrollTop;
    const next = Math.min(Math.max(previous + deltaY, 0), maxScrollTop);
    if (Math.abs(next - previous) < 0.5) {
      return false;
    }
    element.scrollTop = next;
    return true;
  }

  function getScrollableAncestorForDeltaY(node, deltaY) {
    let current = node instanceof Element ? node : null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll')
        && current.scrollHeight > current.clientHeight + 1;
      if (canScrollY && canScrollElementByDeltaY(current, deltaY)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function normalizeWheelDeltaY(event) {
    if (!(event instanceof WheelEvent)) {
      return 0;
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 16;
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      return event.deltaY * Math.max(1, target?.clientHeight || window.innerHeight || 1);
    }
    return event.deltaY;
  }

  function getDirectionalScrollableAncestor(node, deltaY = 0) {
    let current = node instanceof Element ? node : null;
    let fallback = null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll')
        && current.scrollHeight > current.clientHeight + 1;
      if (!canScrollY) {
        current = current.parentElement;
        continue;
      }
      if (!fallback) {
        fallback = current;
      }
      if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.01) {
        return current;
      }
      const atTop = current.scrollTop <= 0;
      const atBottom = current.scrollTop + current.clientHeight >= current.scrollHeight - 1;
      const canConsumeInDirection = deltaY > 0 ? !atTop : !atBottom;
      if (canConsumeInDirection) {
        return current;
      }
      current = current.parentElement;
    }
    return fallback;
  }

  function isEditableTouchTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable]'
      )
    );
  }

  function isSoftKeyboardInputTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    if (target instanceof HTMLTextAreaElement) {
      return true;
    }
    if (target instanceof HTMLInputElement) {
      const type = String(target.type || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    }
    return Boolean(target.isContentEditable);
  }

  function isEditableTarget(target) {
    return Boolean(
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
    );
  }

        return Object.freeze({
          getScrollableAncestor,
          canScrollElementByDeltaY,
          scrollElementByDeltaY,
          getScrollableAncestorForDeltaY,
          normalizeWheelDeltaY,
          getDirectionalScrollableAncestor,
          isEditableTouchTarget,
          isSoftKeyboardInputTarget,
          isEditableTarget,
        });
      }
    })(scope);
  }

  root.scrollInputUtils = Object.freeze({
    createScrollInputUtils,
  });
})();
