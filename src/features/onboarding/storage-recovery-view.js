import { escHtml } from '../../core/escaping.js'
import { getStorageRecoveryPresentation } from '../../state/profile-storage-recovery.js'

export function renderStorageRecovery({ failure, checked, t, renderHeading }) {
  const presentation = getStorageRecoveryPresentation(failure, { checked })
  return `
    ${renderHeading(presentation.titleKey, presentation.bodyKey)}
    ${checked ? `<p role="status">${escHtml(t('onboarding.recovery.checked'))}</p>` : ''}
    <p>${escHtml(t('onboarding.recovery.preserve'))}</p>
    <p>${escHtml(t('onboarding.recovery.otherDevice'))}</p>
    <div class="onboarding-actions onboarding-recovery-actions storage-recovery-actions">
      ${presentation.canCheck ? `<button type="button" class="btn-primary" data-onboarding-recovery-action="retry" data-analytics-action="retryOnboardingRecovery">${escHtml(t('onboarding.recovery.checkStorage'))}</button>` : ''}
      <button type="button" class="${presentation.canCheck ? 'btn-secondary' : 'btn-primary'}" data-onboarding-recovery-action="copy-details">${escHtml(t('onboarding.recovery.copyDetails'))}</button>
      <button type="button" class="btn-secondary" data-onboarding-recovery-action="copy-link" data-analytics-action="copyOnboardingRecoveryLink">${escHtml(t('onboarding.recovery.copyLink'))}</button>
    </div>
    <label class="hidden" id="storageRecoveryDetailsLabel">${escHtml(t('onboarding.recovery.details'))}
      <textarea id="storageRecoveryDetails" readonly rows="7"></textarea>
    </label>
    <p class="onboarding-recovery-status" id="onboardingRecoveryStatus" role="status" aria-live="polite"></p>
  `
}
