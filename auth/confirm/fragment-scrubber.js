(() => {
  window.EDENIA_AUTH_CONFIRM_FRAGMENT = window.location.hash
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search
  )
})()
