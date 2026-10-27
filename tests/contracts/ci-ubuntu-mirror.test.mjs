import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const helper = fileURLToPath(new URL('../../scripts/ci/prefer-ubuntu-archive.py', import.meta.url))
const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const invoke = (path, mode = 'import') => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('ci_ubuntu_mirror', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
if sys.argv[3] == 'default':
    print(json.dumps(str(module.prefer_ubuntu_archive.__defaults__[0])))
else:
    print(json.dumps(module.prefer_ubuntu_archive(Path(sys.argv[2]))))
`, helper, path, mode], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

function withMirrors(content, check) {
  const folder = mkdtempSync(join(tmpdir(), 'edenia-ci-mirror-'))
  const path = join(folder, 'apt-mirrors.txt')
  try {
    if (content !== null) writeFileSync(path, content)
    check(path)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

test('APT helper prefers the existing official archive and retains every fallback', () => {
  const original = '# runner mirrors\n'
    + 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n'
    + 'https://archive.ubuntu.com/ubuntu/\tpriority:2\n'
    + 'https://security.ubuntu.com/ubuntu/\tpriority:3\n'
  withMirrors(original, path => {
    assert.equal(invoke(path), true)
    assert.equal(readFileSync(path, 'utf8'), original
      .replace('azure.archive.ubuntu.com/ubuntu/\tpriority:1', 'azure.archive.ubuntu.com/ubuntu/\tpriority:2')
      .replace('https://archive.ubuntu.com/ubuntu/\tpriority:2', 'https://archive.ubuntu.com/ubuntu/\tpriority:1'))
    const preferred = readFileSync(path, 'utf8')
    assert.equal(invoke(path), false)
    assert.equal(readFileSync(path, 'utf8'), preferred)
  })
})

test('APT helper preserves security, architecture and package-selection metadata', () => {
  const original = 'https://azure.archive.ubuntu.com/ubuntu\tpriority:0 arch:amd64 type:deb\n'
    + 'http://archive.ubuntu.com/ubuntu\tarch:amd64 priority:9 component:main\n'
    + 'https://security.ubuntu.com/ubuntu/\tpriority:3 suite:noble-security\n\n# keep this\n'
  withMirrors(original, path => {
    assert.equal(invoke(path), true)
    assert.equal(readFileSync(path, 'utf8'),
      'https://azure.archive.ubuntu.com/ubuntu\tpriority:2 arch:amd64 type:deb\n'
      + 'http://archive.ubuntu.com/ubuntu\tpriority:1 arch:amd64 component:main\n'
      + 'https://security.ubuntu.com/ubuntu/\tpriority:3 suite:noble-security\n\n# keep this\n')
  })
})

test('APT helper leaves missing lists and incomplete or unrelated mirror pairs untouched', () => {
  withMirrors(null, path => {
    assert.equal(invoke(path), false)
    assert.throws(() => readFileSync(path), { code: 'ENOENT' })
  })
  for (const original of [
    '',
    'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n',
    'https://archive.ubuntu.com/ubuntu/\tpriority:2\n',
    'https://security.ubuntu.com/ubuntu/\tpriority:3\n',
    'https://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com.example/ubuntu/\tpriority:2\n'
  ]) withMirrors(original, path => {
    assert.equal(invoke(path), false)
    assert.equal(readFileSync(path, 'utf8'), original)
  })
})

test('APT helper uses the standard runner list by default without running on import', () => {
  assert.equal(invoke('', 'default'), '/etc/apt/apt-mirrors.txt')
})

test('browser and game jobs apply the same mirror helper before bounded dependency installation', () => {
  const browser = workflow.split('\n  browser:\n')[1].split('\n  tiny-swords:\n')[0]
  const game = workflow.split('\n  tiny-swords:\n')[1]
  for (const [job, browsers] of [[browser, 'chromium webkit firefox'], [game, '${{ matrix.browsers }}']]) {
    const expected = 'timeout-minutes: 10\n        run: |\n'
      + '          sudo python3 scripts/ci/prefer-ubuntu-archive.py\n'
      + '          apt-config dump Acquire::Retries Acquire::http::Timeout Acquire::https::Timeout\n'
      + `          npx playwright install-deps ${browsers}\n`
    assert.ok(job.includes(expected))
    assert.ok(job.includes(`run: npx playwright install ${browsers}\n`))
    assert.ok(job.includes('run: node scripts/run-ci-browser.mjs\n'))
    assert.ok(!job.includes('playwright install --with-deps'))
  }
})
