/** Suppress Offerwall on every top-level page, including output. Load before AdSense. */
(() => {
  if (window.top !== window.self) return;
  const googlefc = window.googlefc = window.googlefc || {};
  googlefc.controlledMessagingFunction = (message) => {
    const offerwall = googlefc.MessageTypeEnum?.OFFERWALL;
    // Do not accidentally suppress consent when the provider has not supplied its enum.
    if (offerwall == null) message.proceed(true);
    else message.proceed(false, [offerwall]);
  };
})();
