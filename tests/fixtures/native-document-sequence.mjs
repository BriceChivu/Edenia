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

export async function stopOwnedNativeBrowser(browser, hasExited, waitForExit) {
  if (!browser || hasExited()) return
  browser.kill('SIGTERM')
  try { await waitForExit(5000) } catch {
    if (!hasExited()) browser.kill('SIGKILL')
    await waitForExit(3000)
  }
  if (!hasExited()) throw Error('Owned browser exit unverified')
}

export async function cleanupNativeDocumentFixture({ stopBrowser, closeTransport, removePrivate }) {
  let browserStopped = false, transportClosed = false
  try { await stopBrowser(); browserStopped = true } catch {}
  try { await closeTransport(); transportClosed = true } catch {}
  if (!browserStopped) return false
  try { await removePrivate() } catch { return false }
  return transportClosed
}
