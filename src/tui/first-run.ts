import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const SENTINEL = path.join(os.homedir(), ".local", "share", "findfile", "first-run")

export const isFirstRun = (): boolean => {
  try {
    fs.accessSync(SENTINEL)
    return false
  } catch {
    return true
  }
}

export const markFirstRun = (): void => {
  try {
    fs.mkdirSync(path.dirname(SENTINEL), { recursive: true })
    fs.writeFileSync(SENTINEL, "")
  } catch {
    // best effort
  }
}
