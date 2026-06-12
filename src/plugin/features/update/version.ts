import { readFile } from "node:fs/promises"
import * as path from "node:path"

export type CurrentVersionResult = {
  name: string
  version: string
  packageJsonPath: string
}

type PackageJson = {
  name?: unknown
  version?: unknown
}

async function readPackageJson(filePath: string): Promise<PackageJson | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as PackageJson
  } catch (error: any) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return undefined
    throw error
  }
}

async function findNearestPackageJson(startDir: string) {
  let currentDir = startDir

  while (true) {
    const candidate = path.join(currentDir, "package.json")
    const packageJson = await readPackageJson(candidate)
    if (packageJson?.version) return { path: candidate, packageJson }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) return undefined
    currentDir = parentDir
  }
}

export async function getCurrentVersion(startDir = __dirname): Promise<CurrentVersionResult> {
  const found = await findNearestPackageJson(startDir)
  const version = found?.packageJson.version

  if (!found || typeof version !== "string" || version.length === 0) {
    throw new Error("Unable to read OpenCube package version.")
  }

  return {
    name: typeof found.packageJson.name === "string" && found.packageJson.name.length > 0 ? found.packageJson.name : "opencube",
    version,
    packageJsonPath: found.path,
  }
}
