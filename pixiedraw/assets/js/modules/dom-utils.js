(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function disableImageLongPress(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return;
    }
    element.setAttribute('draggable', 'false');
    ['pointerdown', 'touchstart', 'mousedown'].forEach((type) => {
      element.addEventListener(type, (event) => {
        event.stopPropagation();
      }, { passive: false });
    });
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
  }

  function isInputControlElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.matches('input, textarea, select')) return true;
    if (node instanceof Element && node.hasAttribute('contenteditable') && node.getAttribute('contenteditable') !== 'false') {
      return true;
    }
    return false;
  }

  function isLabelForElement(label, control) {
    if (!label || !control || label.nodeType !== Node.ELEMENT_NODE || control.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (label.tagName !== 'LABEL') {
      return false;
    }
    if (label.contains(control)) {
      return true;
    }
    const htmlFor = label.getAttribute('for');
    return Boolean(htmlFor && control.id && htmlFor === control.id);
  }

  root.domUtils = Object.freeze({
    disableImageLongPress,
    isInputControlElement,
    isLabelForElement,
  });
})();
