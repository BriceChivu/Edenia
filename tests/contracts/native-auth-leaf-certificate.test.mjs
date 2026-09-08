import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { X509Certificate, createHash } from 'node:crypto'
import { validateNativeAuthLeaf } from '../../scripts/native-auth-leaf-certificate.mjs'

for (const basic of ['critical,CA:FALSE', null, 'critical,CA:TRUE']) {
  test(`native trust requires explicit non-CA constraints: ${basic}`, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'native-leaf-'))
    t.after(() => rm(dir, { recursive: true, force: true }))
    const config = join(dir, 'openssl.cnf'), certFile = join(dir, 'leaf.crt')
    await writeFile(config, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=local.example.invalid\n[ext]\nsubjectAltName=DNS:local.example.invalid\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' + (basic ? `basicConstraints=${basic}\n` : ''))
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-config', config, '-keyout', join(dir, 'leaf.key'), '-out', certFile, '-days', '1'], { stdio: 'ignore' })
    const cert = await readFile(certFile), leaf = new X509Certificate(cert)
    const material = { cert, sha256: createHash('sha256').update(leaf.raw).digest('hex') }
    if (basic === 'critical,CA:FALSE') {
      assert.equal(validateNativeAuthLeaf(material, 'local.example.invalid').ca, false)
      assert.throws(() => validateNativeAuthLeaf(material, 'other.example.invalid'))
      assert.throws(() => validateNativeAuthLeaf(material, 'local.example.invalid', Date.parse(leaf.validTo)))
    } else {
      if (basic === null) assert.equal(leaf.ca, false)
      assert.throws(() => validateNativeAuthLeaf(material, 'local.example.invalid'), /Explicit critical CA:FALSE/)
    }
  })
}
