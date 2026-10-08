import { strToU8, zipSync } from 'fflate'
import { createPortableLearnerProfileEnvelope } from './portable-learner-profile.js'

export async function createPortableLearnerProfileConflictArchive(
  { device, cloud }, { dateKey, now, maxBytes } = {}
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) throw new TypeError('Invalid archive date')
  const options = { ...(now ? { now } : {}), ...(maxBytes !== undefined ? { maxBytes } : {}) }
  const envelopes = await Promise.all([
    createPortableLearnerProfileEnvelope(device, options),
    createPortableLearnerProfileEnvelope(cloud, options)
  ])
  const files = {
    [`edenia-sync-this-device-${dateKey}.json`]: strToU8(envelopes[0].serialized),
    [`edenia-sync-cloud-${dateKey}.json`]: strToU8(envelopes[1].serialized)
  }
  // One download preserves both alternatives on browsers that coalesce multiple downloads.
  return { bytes: zipSync(files, { level: 0 }), filename: `edenia-sync-both-${dateKey}.zip` }
}
