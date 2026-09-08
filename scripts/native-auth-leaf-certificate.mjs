import { X509Certificate, createHash } from 'node:crypto'

// Node's .ca false also covers an absent basicConstraints extension. Chrome's
// imported trust classification distinguishes that omission from CA:FALSE.
// Parse only DER structure, never certificate text or localized OpenSSL output.
function field(bytes, offset) {
  const start = offset, tag = bytes[offset++], first = bytes[offset++]
  if (first === undefined) throw new Error('Truncated certificate DER')
  let length = first
  if (first & 128) {
    const count = first & 127
    if (count < 1 || count > 4 || bytes[offset] === 0) throw new Error('Invalid certificate DER length')
    length = 0
    for (let i = 0; i < count; i++) { if (bytes[offset] === undefined) throw new Error('Truncated certificate DER'); length = length * 256 + bytes[offset++] }
    if (length < 128) throw new Error('Noncanonical certificate DER length')
  }
  const end = offset + length
  if (end > bytes.length) throw new Error('Truncated certificate DER')
  return { tag, start, end, value: bytes.subarray(offset, end) }
}
function children(bytes) {
  const result = []; let offset = 0
  while (offset < bytes.length) { const value = field(bytes, offset); result.push(value); offset = value.end }
  return result
}
export function validateNativeAuthLeaf({ cert, sha256 }, hostname, now = Date.now()) {
  const leaf = new X509Certificate(cert)
  const root = field(leaf.raw, 0)
  const tbs = children(root.value)[0]
  const containers = children(tbs.value).filter(item => item.tag === 0xa3)
  if (root.tag !== 0x30 || root.end !== leaf.raw.length || tbs.tag !== 0x30 || containers.length !== 1) throw new Error('Native certificate extensions required')
  const list = field(containers[0].value, 0)
  const extensions = children(list.value).map(item => children(item.value))
  const basic = extensions.filter(parts => parts[0]?.tag === 6 && parts[0].value.equals(Buffer.from([0x55, 0x1d, 0x13])))
  if (basic.length !== 1 || basic[0].length !== 3 || basic[0][1].tag !== 1 || !basic[0][1].value.equals(Buffer.from([0xff]))
    || basic[0][2].tag !== 4 || !basic[0][2].value.equals(Buffer.from([0x30, 0]))) throw new Error('Explicit critical CA:FALSE required')
  const usage = extensions.filter(parts => parts[0]?.tag === 6 && parts[0].value.equals(Buffer.from([0x55, 0x1d, 0x0f])))
  if (usage.length !== 1 || usage[0].length !== 3 || usage[0][1].tag !== 1 || !usage[0][1].value.equals(Buffer.from([0xff]))
    || usage[0][2].tag !== 4 || !usage[0][2].value.equals(Buffer.from([3, 2, 5, 0xa0]))) throw new Error('Native RSA server key usage required')
  if (leaf.ca || leaf.subjectAltName !== 'DNS:' + hostname || leaf.subject !== leaf.issuer || !leaf.verify(leaf.publicKey)
    || leaf.publicKey.asymmetricKeyType !== 'rsa' || leaf.keyUsage?.length !== 1 || leaf.keyUsage[0] !== '1.3.6.1.5.5.7.3.1'
    || now < Date.parse(leaf.validFrom) || now >= Date.parse(leaf.validTo)
    || Date.parse(leaf.validTo) - Date.parse(leaf.validFrom) > 48 * 3600000
    || createHash('sha256').update(leaf.raw).digest('hex') !== sha256) throw new Error('Native leaf certificate does not match manifest')
  return leaf
}
