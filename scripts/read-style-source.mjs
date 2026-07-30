import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STYLE_IMPORT_PATTERN = /^@import "\.\/([0-9]{2}-[a-z0-9-]+\.css)";$/

export async function readOrderedStyleSource(indexPath) {
  const resolvedIndexPath = indexPath instanceof URL
    ? fileURLToPath(indexPath)
    : resolve(indexPath)
  const stylesDir = dirname(resolvedIndexPath)
  const indexSource = await readFile(resolvedIndexPath, 'utf8')

  if (indexSource.includes('\r') || !indexSource.endsWith('\n')) {
    throw new Error('Style index must use LF line endings and end with a newline')
  }

  const importLines = indexSource.slice(0, -1).split('\n')
  const files = importLines.map((line, index) => {
    const match = line.match(STYLE_IMPORT_PATTERN)
    if (!match) {
      throw new Error(
        `Invalid style index line ${index + 1}: ${JSON.stringify(line)}`
      )
    }
    return match[1]
  })

  if (new Set(files).size !== files.length) {
    throw new Error('Style index contains a duplicate section import')
  }

  if (files.some((file, index) => index > 0 && file <= files[index - 1])) {
    throw new Error('Style section imports must be in ascending filename order')
  }

  const sectionFiles = (await readdir(stylesDir))
    .filter(file => file.endsWith('.css') && file !== 'index.css')
    .sort()

  if (JSON.stringify(sectionFiles) !== JSON.stringify(files)) {
    throw new Error(
      `Style index and section files differ: imports=${JSON.stringify(files)} `
      + `files=${JSON.stringify(sectionFiles)}`
    )
  }

  const sections = await Promise.all(
    files.map(file => readFile(join(stylesDir, file)))
  )

  return {
    files,
    source: Buffer.concat(sections)
  }
}
