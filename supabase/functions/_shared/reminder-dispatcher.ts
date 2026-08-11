import {
  readReminderDeliveryEnabled,
} from './reminder-delivery-claim.ts'
import type { ReminderEnvironmentReader } from './reminder-live-config.ts'
import { readReminderLiveConfig } from './reminder-live-config.ts'
import {
  runReminderDryRun,
} from './reminder-dry-run.ts'
import type {
  ReminderDryRunLog,
  ReminderDryRunResult,
} from './reminder-dry-run.ts'
import { runReminderLive } from './reminder-live.ts'
import type {
  ReminderLiveClient,
  ReminderLiveDependencies,
  ReminderLiveResult,
} from './reminder-live.ts'

export type ReminderDispatcherResult = ReminderDryRunResult | ReminderLiveResult

export async function runReminderDispatcher(
  client: ReminderLiveClient,
  readEnvironment: ReminderEnvironmentReader,
  log: (entry: ReminderDryRunLog) => void,
  liveDependencies: ReminderLiveDependencies = {},
): Promise<ReminderDispatcherResult> {
  const liveDeliveryEnabled = await readReminderDeliveryEnabled(client)
  if (!liveDeliveryEnabled) {
    return runReminderDryRun(client, log)
  }

  // Validate every secret and destination before claiming live work. The live
  // runner then rechecks the switch, and the database rechecks it once more
  // immediately before the provider request.
  const config = readReminderLiveConfig(readEnvironment)
  return runReminderLive(client, config, log, liveDependencies)
}
