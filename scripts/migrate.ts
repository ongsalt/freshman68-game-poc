import { $ } from "bun"
import { readdirSync } from "node:fs"
import { join } from "node:path"

const target: "remote" | "local" = "remote"
const startFrom: number | null = null // Set to migration number like 1 to start from "001_..."
const migrationsDir = "./src/migrations"

console.log(`🚀 Running migrations in ${target} mode...`)
if (startFrom !== null) {
  console.log(`📍 Starting from migration number: ${startFrom}`)
}

try {
  // Read all files in migrations directory
  const allFiles = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort() // Sort alphabetically to ensure correct order (000_, 001_, etc.)

  // Filter files based on startFrom option
  let files = allFiles
  if (startFrom !== null) {
    const prefix = String(startFrom).padStart(3, "0")
    const startIndex = allFiles.findIndex(file => file.startsWith(`${prefix}_`))

    if (startIndex === -1) {
      console.log(`❌ Start migration number '${startFrom}' not found!`)
      console.log(`Available files: ${allFiles.join(", ")}`)
      process.exit(1)
    }
    const startFile = allFiles[startIndex]
    files = allFiles.slice(startIndex)
    console.log(`📋 Skipping ${startIndex} migration(s), starting from ${startFile}`)
  }

  console.log(`📁 Found ${allFiles.length} total migration files, running ${files.length}:`)
  files.forEach(file => console.log(`  - ${file}`))

  if (files.length === 0) {
    console.log("❌ No migration files found!")
    process.exit(1)
  }

  // Apply each migration
  for (const file of files) {
    const filePath = join(migrationsDir, file)
    const targetFlag = target === "remote" ? "--remote" : "--local"

    console.log(`
⏳ Applying migration: ${file}`)

    try {
      await $`wrangler d1 execute freshmen68-game --file ${filePath} ${targetFlag}`
      console.log(`✅ Successfully applied: ${file}`)
    } catch (error) {
      console.error(`❌ Failed to apply migration ${file}:`, error)
      console.log("🛑 Stopping migration process due to error")
      process.exit(1)
    }
  }

  console.log(`
🎉 Migration process completed!`)

} catch (error) {
  console.error("❌ Error reading migrations directory:", error)
  process.exit(1)
}

