(function initializeAnalytics() {
  function capture(eventName, properties) {
    if (!window.EDENIA_ANALYTICS_ENABLED) return;
    if (!window.posthog || typeof window.posthog.capture !== 'function') return;
    window.posthog.capture(eventName, properties);
  }

  window.trackEdeniaEvent = capture;

  document.addEventListener('click', event => {
    const control = event.target.closest('button, a');
    if (!control || control.disabled) return;

    const action = control.dataset.analyticsAction
      || control.id
      || control.dataset.i18n;

    if (!action) return;

    capture('button_clicked', {
      action,
      control_type: control.tagName.toLowerCase()
    });
  });
})();
