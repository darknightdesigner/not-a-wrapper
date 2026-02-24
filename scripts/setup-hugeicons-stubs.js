#!/usr/bin/env node
/**
 * Creates stub packages for @hugeicons-pro/* when HUGEICONS_LICENSE_KEY is not available.
 * These stubs provide icon data in the format expected by @hugeicons/react's HugeiconsIcon
 * component: arrays of [tagName, svgAttributes] tuples.
 *
 * Run after `bun install` if the install fails due to missing HugeIcons Pro credentials.
 */
const fs = require("fs")
const path = require("path")

const NODE_MODULES = path.join(__dirname, "..", "node_modules")

function findIconNames(rootDir) {
  const icons = { stroke: new Set(), solid: new Set() }
  const exts = [".ts", ".tsx"]

  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== ".next" &&
        entry.name !== ".git"
      ) {
        walk(fullPath)
      } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
        const content = fs.readFileSync(fullPath, "utf8")
        for (const m of content.matchAll(
          /(?:import|export)\s*\{([^}]+)\}\s*from\s*['"]@hugeicons-pro\/core-stroke-rounded['"]/g
        )) {
          m[1].split(",").forEach((n) => {
            const name = n.trim().split(/\s+as\s+/)[0].trim()
            if (name) icons.stroke.add(name)
          })
        }
        for (const m of content.matchAll(
          /(?:import|export)\s*\{([^}]+)\}\s*from\s*['"]@hugeicons-pro\/core-solid-rounded['"]/g
        )) {
          m[1].split(",").forEach((n) => {
            const name = n.trim().split(/\s+as\s+/)[0].trim()
            if (name) icons.solid.add(name)
          })
        }
      }
    }
  }

  walk(rootDir)
  return { stroke: [...icons.stroke].sort(), solid: [...icons.solid].sort() }
}

function generateFiles(pkgDir, iconNames, fillType) {
  fs.mkdirSync(pkgDir, { recursive: true })

  const pkgName =
    fillType === "stroke"
      ? "@hugeicons-pro/core-stroke-rounded"
      : "@hugeicons-pro/core-solid-rounded"
  const attr =
    fillType === "stroke"
      ? '{ d: "M12 12h.01", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }'
      : '{ d: "M12 12h.01", fill: "currentColor" }'

  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify(
      { name: pkgName, version: "3.1.0", main: "index.js", module: "index.mjs", types: "index.d.ts" },
      null,
      2
    )
  )

  let cjs = `"use strict";\nconst stubIcon = [["path", ${attr}]];\n`
  let mjs = `const stubIcon = [["path", ${attr}]];\n`
  let dts = `type IconData = readonly (readonly [string, { readonly [key: string]: string | number }])[];\n`

  for (const name of iconNames) {
    cjs += `exports.${name} = stubIcon;\n`
    mjs += `export const ${name} = stubIcon;\n`
    dts += `export declare const ${name}: IconData;\n`
  }

  fs.writeFileSync(path.join(pkgDir, "index.js"), cjs)
  fs.writeFileSync(path.join(pkgDir, "index.mjs"), mjs)
  fs.writeFileSync(path.join(pkgDir, "index.d.ts"), dts)
}

const rootDir = path.join(__dirname, "..")
const { stroke, solid } = findIconNames(rootDir)

const strokeDir = path.join(NODE_MODULES, "@hugeicons-pro", "core-stroke-rounded")
const solidDir = path.join(NODE_MODULES, "@hugeicons-pro", "core-solid-rounded")

const strokeExists =
  fs.existsSync(path.join(strokeDir, "package.json")) &&
  !fs.readFileSync(path.join(strokeDir, "package.json"), "utf8").includes('"main": "index.js"')

if (strokeExists) {
  console.log("[hugeicons-stubs] Real @hugeicons-pro packages detected, skipping stub generation.")
  process.exit(0)
}

generateFiles(strokeDir, stroke, "stroke")
generateFiles(solidDir, solid, "fill")

console.log(
  `[hugeicons-stubs] Created stubs: ${stroke.length} stroke icons, ${solid.length} solid icons.`
)
