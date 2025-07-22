import { DurableObject } from "cloudflare:workers";
import { SqliteLeaderboard } from "./sqlite-leaderboard";

export type UserPops = {
	ouid: string,
	total_pops: number;
};
export type GroupPops = {
	group_id: number,
	total_pops: number;
};

export class GameRegionHandler extends DurableObject<Env> {
	leaderboard!: SqliteLeaderboard;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		ctx.blockConcurrencyWhile(async () => {
			this.#applyMigration();
			this.leaderboard = new SqliteLeaderboard(ctx.storage.sql);
		});
	}

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

	addPop(count: number, ouid: string, groupNumber: number) {
		console.log(`Add score ${count} to ${ouid} in ${groupNumber}`);
		this.leaderboard.addScore(ouid, count);
		this.ctx.storage.sql.exec("INSERT INTO pops (timestamp, ouid, amount, group_id) VALUES (?, ?, ?, ?)", Date.now(), ouid, count, groupNumber);
	}

	getTotalScore() {
		return this.leaderboard.totalScore;
	}

	getTopTen() {
		return this.leaderboard.getTopScores(10);
	}

	getPlayerScore(ouid: string) {
		const score = this.leaderboard.getPlayerScore(ouid);
		return score;
	}
}
