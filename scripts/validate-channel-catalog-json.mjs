import { readdir, readFile } from 'node:fs/promises'

const DATA_DIRECTORY = new URL('../data/', import.meta.url)
const CATALOG_FILE_PATTERN = /^channel-catalog(?:\.[a-z-]+)?\.json$/

const fileNames = (await readdir(DATA_DIRECTORY))
  .filter(fileName => CATALOG_FILE_PATTERN.test(fileName))
  .sort()

if (!fileNames.length) {
  throw new Error('No channel catalog JSON files were found')
}

for (const fileName of fileNames) {
  const fileUrl = new URL(fileName, DATA_DIRECTORY)
  const catalog = JSON.parse(await readFile(fileUrl, 'utf8'))

  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error(`${fileName} must contain a JSON object`)
  }
  if (catalog.schemaVersion !== 1) {
    throw new Error(`${fileName} must use schemaVersion 1`)
  }
  if (!Array.isArray(catalog.channels)) {
    throw new Error(`${fileName} must contain a channels array`)
  }

  const catalogIds = new Set()
  catalog.channels.forEach((channel, index) => {
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
      throw new Error(`${fileName} channel ${index + 1} must be an object`)
    }

    const catalogId = String(channel.catalogId || '').trim()
    if (!catalogId) {
      throw new Error(`${fileName} channel ${index + 1} must contain a catalogId`)
    }
    const normalizedCatalogId = catalogId.toLocaleLowerCase('en')
    if (catalogIds.has(normalizedCatalogId)) {
      throw new Error(`${fileName} contains duplicate catalogId ${catalogId}`)
    }
    catalogIds.add(normalizedCatalogId)
  })

  console.log(`Validated ${fileName} (${catalog.channels.length} channels)`)
}
