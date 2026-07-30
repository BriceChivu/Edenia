import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, relative, resolve } from 'node:path'

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
}

function argumentValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : String(process.argv[index + 1] || fallback)
}

const host = argumentValue('--host', 'localhost')
const port = Number(argumentValue('--port', '8000'))
const root = resolve(argumentValue('--root', '_site'))

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid port: ${port}`)
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' })
    response.end()
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', `http://${host}`).pathname)
  } catch {
    response.writeHead(400)
    response.end('Bad request')
    return
  }

  const requestedPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname
  const filePath = resolve(root, `.${requestedPath}`)
  const relativePath = relative(root, filePath)
  if (relativePath.startsWith('..') || relativePath === '') {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error('Not a file')
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': String((await stat(filePath)).size),
    'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(filePath).pipe(response)
})

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}/`)
})

function shutdown() {
  server.close(error => {
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
