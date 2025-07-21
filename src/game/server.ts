// unused

import { DurableObject } from "cloudflare:workers";

export type UserPops = {
	ouid: string,
	total_pops: number;
};
export type GroupPops = {
	group_id: number,
	total_pops: number;
};

// this is basiccally an actor model, all operation (with side effect e.g. IO) are queue automatically
export class GameServer extends DurableObject<Env> {
	lastUpdated: number = 0;
	popByUser!: Map<string, number>;
	popByGroup!: Map<number, number>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.#applyMigration();

		this.ctx.blockConcurrencyWhile(async () => {
			this.popByUser = new Map(
				ctx.storage.sql.exec("SELECT ouid, SUM(amount) as new_pops FROM pops GROUP BY ouid").raw() as any
			);

			// this.popByGroup = Object.fromEntries(
			// 	ctx.storage.sql.exec("SELECT group_id, SUM(amount) as total_pops FROM pops GROUP BY group_id").raw()
			// );
		});
	}

	// TODO: add index
	#applyMigration() {
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS pops (
				timestamp INTEGER NOT NULL,
				ouid TEXT NOT NULL,
				amount INTEGER NOT NULL,
				group_id INTEGER NOT NULL
			);`
		);
	}

	listPop() {
		const pops = this.ctx.storage.sql.exec("SELECT * FROM pops").toArray();

		return pops;
	}

	addPop(count: number, ouid: string, group: number) {
		this.popByUser[ouid] = this.popByUser[ouid];
		this.ctx.storage.sql.exec("INSERT INTO pops (timestamp, ouid, amount, group_id) VALUES (?, ?, ?, ?)", Date.now(), ouid, count, group);
	}

	getPopByUser(ouid: string) {
		return this.popByUser[ouid];
	}

	// updateGroupTotalPops() {
	// 	const popByGroup = this.ctx.storage.sql.exec("SELECT group_id, SUM(amount) as total_pops FROM pops GROUP BY group_id")
	// 		.toArray() as GroupPops[];

	// 	this.ctx.storage.put(Object.fromEntries(popByGroup.map(it => [it.group_id, it.total_pops])));
	// }

	// updateInGroupLeaderboard() {
	// 	const result = this.ctx.storage.sql.exec(`
	//       SELECT
	//           group_id,
	//           ouid,
	//           total_pops
	//       FROM (
	//           SELECT
	//               group_id,
	//               ouid,
	//               SUM(amount) as total_pops,
	//               ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY SUM(amount) DESC) as rank
	//           FROM pops
	//           GROUP BY group_id, ouid
	//       ) ranked
	//       WHERE rank <= 10
	//       ORDER BY group_id, total_pops DESC
	//   `).toArray() as (UserPops & { group_id: number; })[];

	// 	const grouped: Record<number, UserPops[]> = {};
	// 	for (const row of result) {
	// 		if (!grouped[row.group_id]) {
	// 			grouped[row.group_id] = [];
	// 		}
	// 		grouped[row.group_id].push({
	// 			ouid: row.ouid,
	// 			total_pops: row.total_pops
	// 		});
	// 	}

	// 	return grouped;
	// }


	async process() {
		const popByGroup = this.ctx.storage.sql.exec("SELECT group_id, SUM(amount) as total_pops FROM pops GROUP BY group_id")
			.toArray() as GroupPops[];
		const popByUser = this.ctx.storage.sql.exec("SELECT ouid, SUM(amount) as total_pops FROM pops")
			.toArray() as UserPops[];

		this.ctx.storage.put(Object.fromEntries(popByGroup.map(it => [it.group_id, it.total_pops])));
	}

}
