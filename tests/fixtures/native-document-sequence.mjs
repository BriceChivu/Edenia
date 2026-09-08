// Synthetic local test content only. No production page injection or endpoint.
export const nativeDocumentSequenceScript = `
requestAnimationFrame(() => requestAnimationFrame(async () => {
  const status = document.querySelector('#status');
  status.textContent = 'Page script ran. Starting the deliberate local failure check…';
  try {
    const response = await fetch('/fixture/rendered', { cache: 'no-store' });
    if (!response.ok || await response.text() !== 'reset-armed') throw Error('Local check not armed');
    location.reload();
  } catch {
    status.textContent = 'Local sequence could not continue. No pass is recorded.';
  }
}));
`

export function nativeDocumentSequenceComplete(result) {
  return result.fixtureIncomplete !== true && result.browserStarted === true && result.documentRequests === 2
    && result.renderedReports === 1 && result.injectedResets === 1
    && result.diagnostic?.documentDelivered === true
    && result.diagnostic?.failure === 'upstream-reset'
    && result.cleanupVerified === true
}
