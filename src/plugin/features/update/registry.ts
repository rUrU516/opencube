import * as https from "node:https"

const DEFAULT_NPM_REGISTRY_TIMEOUT_MS = 5000

export type LatestNpmVersionResult = {
  name: string
  version: string
  registryUrl: string
  tarball?: string
}

type NpmLatestResponse = {
  name?: unknown
  version?: unknown
  dist?: {
    tarball?: unknown
  }
}

function getJson(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          accept: "application/json",
          "user-agent": "opencube-update-check",
        },
        timeout: timeoutMs,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        let body = ""

        response.setEncoding("utf8")
        response.on("data", (chunk) => {
          body += chunk
        })
        response.on("end", () => {
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`npm registry returned HTTP ${statusCode}.`))
            return
          }

          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error("npm registry returned invalid JSON."))
          }
        })
      },
    )

    request.on("timeout", () => {
      request.destroy(new Error("npm registry request timed out."))
    })
    request.on("error", reject)
  })
}

export async function getLatestNpmVersion(packageName: string, timeoutMs = DEFAULT_NPM_REGISTRY_TIMEOUT_MS): Promise<LatestNpmVersionResult> {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`
  const response = (await getJson(registryUrl, timeoutMs)) as NpmLatestResponse

  if (typeof response.version !== "string" || response.version.length === 0) {
    throw new Error("Unable to read latest npm package version.")
  }

  return {
    name: typeof response.name === "string" && response.name.length > 0 ? response.name : packageName,
    version: response.version,
    registryUrl,
    tarball: typeof response.dist?.tarball === "string" && response.dist.tarball.length > 0 ? response.dist.tarball : undefined,
  }
}
