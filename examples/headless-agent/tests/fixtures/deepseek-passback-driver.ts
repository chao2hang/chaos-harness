#!/usr/bin/env node
/** Loader driver for two DeepSeek turns in one persisted session. */

import type { Context } from '@deepseek-ai/cordis'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'

const NAME = 'headless-deepseek-passback-driver'
const [configPath, firstTask, secondTask] = process.argv.slice(2)
if (configPath === undefined || firstTask === undefined || secondTask === undefined) {
  throw new Error(NAME + ': expected <config-path> <first-task> <second-task>')
}

const uninstallFailLoud = installFailLoud(NAME)
let ctx: Context | undefined
try {
  loadEnv(NAME)
  ctx = await boot(NAME, resolveConfigPath(configPath, undefined))
  const first = await runFixtureTurn(ctx, { task: firstTask })
  const second = await runFixtureTurn(ctx, { task: secondTask })
  process.stdout.write(JSON.stringify({ first, second }) + '\n')
} catch (error: unknown) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n')
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
  uninstallFailLoud()
}
