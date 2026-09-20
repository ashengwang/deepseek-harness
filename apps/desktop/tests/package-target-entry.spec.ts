import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { withMacOSSigningKeychain } from '../scripts/macos-signing-keychain.mjs'

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: vi.fn(() => { throw new Error('fixture build reached') }),
}))
vi.mock('../scripts/desktop-package-environment.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/desktop-package-environment.mjs')>(),
  loadDesktopPackageEnvironment: () => ({
    DSH_DESKTOP_APP_ID: 'com.example.desktop.local-test',
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
  }),
}))
vi.mock('../scripts/macos-signing-keychain.mjs', () => ({
  withMacOSSigningKeychain: vi.fn(() => { throw new Error('fixture signing requested') }),
}))

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); vi.resetModules() })

it('dispatches unsigned macOS packaging to the build without opening a release keychain', async () => {
  vi.stubEnv('npm_execpath', 'fixture-pnpm.cjs')
  vi.stubGlobal('process', {
    ...process, platform: 'darwin', arch: 'arm64',
    argv: [process.execPath, fileURLToPath(new URL('../scripts/package-target.ts', import.meta.url)), 'mac-arm64', '--unsigned'],
  })
  await expect(import('../scripts/package-target.ts')).rejects.toThrow('fixture build reached')
  expect(spawn).toHaveBeenCalledOnce()
  expect(withMacOSSigningKeychain).not.toHaveBeenCalled()
})
