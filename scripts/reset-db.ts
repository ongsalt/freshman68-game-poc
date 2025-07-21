import { $ } from "bun";

const target: "remote" | "local" = "remote";

console.log(`🚨 Resetting database in ${target} mode...`);
console.log("⚠️  This will DROP ALL TABLES and DATA!");

const targetFlag = target === "remote" ? "--remote" : "--local";

try {
	// Drop the pops table (main table from migrations)
	console.log("\n⏳ Dropping 'pops' table...");
	await $`wrangler d1 execute freshmen68-game --command "DROP TABLE IF EXISTS pops;" ${targetFlag}`;
	console.log("✅ Dropped 'pops' table");

	// Drop any indexes that might exist
	console.log("\n⏳ Dropping indexes...");
	await $`wrangler d1 execute freshmen68-game --command "DROP INDEX IF EXISTS idx_pops_timestamp;" ${targetFlag}`;
	await $`wrangler d1 execute freshmen68-game --command "DROP INDEX IF EXISTS idx_pops_ouid;" ${targetFlag}`;
	await $`wrangler d1 execute freshmen68-game --command "DROP INDEX IF EXISTS idx_pops_group_id;" ${targetFlag}`;
	console.log("✅ Dropped indexes");

	console.log("\n⏳ Cleaning up KV store...");
	try {
		// List all KV keys
		const kvListResult = await $`wrangler kv key list --binding KV ${targetFlag}`.text();
		const keys = JSON.parse(kvListResult);

		if (keys.length > 0) {
			console.log(`📋 Found ${keys.length} KV keys to delete:`);
			keys.forEach((key: any) => console.log(`  - ${key.name}`));

			// Delete each key
			for (const key of keys) {
				await $`wrangler kv key delete "${key.name}" --binding KV ${targetFlag}`;
			}
			console.log(`✅ Deleted ${keys.length} KV keys`);
		} else {
			console.log("✅ KV store is already empty");
		}
	} catch (error) {
		console.log("⚠️  Failed to clean KV store (might be empty or not accessible):", error);
	}

	console.log("\n🎉 Database and KV reset completed!");
	console.log("💡 Run 'bun run scripts/migrate.ts' to recreate the database structure");

} catch (error) {
	console.error("❌ Error during database reset:", error);
	process.exit(1);
}
