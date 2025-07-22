import type { SqliteLeaderboard } from "./sqlite-leaderboard";
import { SortedMap } from "./sorted-map";

type LeaderboardEntry = {
	playerId: string;
	score: number;
};

export class InMemoryInGroupLeaderboard {
	#db: DurableObjectStorage;
	#totalScore = 0;
	scoreByUser = new Map<string, number>;
	usersByScore = new SortedMap<number, Set<string>>();

	constructor(db: DurableObjectStorage) {
		this.#db = db;
		this.initialize();
	}

	async initialize(fresh = false) {
		if (fresh) {
			// aggregated from `pops`
			const result = this.#db.sql.exec<{ total_score: number; }>(`SELECT SUM(score) as total_score FROM leaderboard`).one();
			this.#totalScore = result?.total_score || 0;
		} else {
			this.#totalScore = parseInt(await this.#db.get("totalScore") ?? "0");
		}
	}

	addScore(ouid: string, score: number) {
		this.#totalScore += score;
		const previousScore = this.scoreByUser.get(ouid);
		const newScore = previousScore ?? 0 + score;
		this.scoreByUser.set(ouid, newScore);
		if (previousScore) {
			this.usersByScore.get(previousScore)?.delete(ouid);
		}
		const users = this.usersByScore.get(newScore);
		if (!users) {
			this.usersByScore.set(newScore, new Set([ouid]));
		} else {
			users.add(ouid);
		}
	}

	getPlayerScore(playerId: string): number {
		return this.scoreByUser.get(playerId) ?? 0;
	}

	getTopScores(limit: number = 10): LeaderboardEntry[] {
	}

	getTotalPlayers() {

	}

	get totalScore() {
		return this.#totalScore;
	}
}
