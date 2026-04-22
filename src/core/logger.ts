import { Effect, Logger } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const logFile = path.join(os.tmpdir(), `findfile-${process.pid}.log`)

const fileLogger = Logger.make(({ date, logLevel, message }) => {
  const parts = (message as unknown[]).map((m: unknown) => (typeof m === "string" ? m : JSON.stringify(m)))
  const line = `[${date.toISOString()}] ${logLevel.label}: ${parts.join(" ")}\n`
  try {
    fs.appendFileSync(logFile, line)
  } catch {
    // ignore
  }
})

/** Layer that replaces the default console logger with a file logger.
 *  All Effect.log / Effect.logDebug / Effect.logWarning / Effect.logError
 *  calls write to os.tmpdir()/findfile-<pid>.log instead of stdout.
 */
export const FileLoggerLive = Logger.replace(Logger.defaultLogger, fileLogger)

/** Path to the current process log file (for debugging / diagnostics) */
export const getLogFilePath = (): string => logFile

/** Synchronous log helper for callbacks that don't have an Effect runtime
 *  handy.  Prefer `Effect.log` inside generators; this is a last resort.
 */
export const logToFile = (level: string, ...args: unknown[]): void => {
  const line = `[${new Date().toISOString()}] ${level}: ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`
  try {
    fs.appendFileSync(logFile, line)
  } catch {
    // ignore
  }
}
