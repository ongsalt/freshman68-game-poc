type LeaderboardEntry = {
	playerId: string;
	score: number;
};

export class InGroupLeaderboard {
	#db: SqlStorage;
	#totalScore = 0;

	constructor(db: SqlStorage) {
		this.#db = db;
		this.initialize();
	}

	initialize() {
		this.#db.exec(`
                CREATE TABLE IF NOT EXISTS leaderboard (
                    playerId TEXT PRIMARY KEY,
                    score INTEGER NOT NULL
                );
            `);

		this.#db.exec(`
                CREATE INDEX IF NOT EXISTS idx_score ON leaderboard (score DESC);
            `);

		const result = this.#db.exec<{ total_score: number; }>(`SELECT SUM(score) as total_score FROM leaderboard`).one();
		this.#totalScore = result?.total_score || 0;
	}

	addScore(playerId: string, score: number) {
		this.#totalScore += score;
		this.#db.exec(
			`INSERT INTO leaderboard (playerId, score)
             VALUES (?, ?)
             ON CONFLICT(playerId) DO UPDATE SET
                score = leaderboard.score + EXCLUDED.score`,
			playerId,
			score
		);
	}

	getPlayerScore(playerId: string): number {
		const score = this.#db.exec(
			`SELECT score FROM leaderboard WHERE playerId = ?`,
			playerId
		).toArray();
		if (score.length > 0) {
			return score[0].score as number;
		}
		return 0;
	}

	getTopScores(limit: number = 10): LeaderboardEntry[] {
		const rows = this.#db.exec<LeaderboardEntry>(
			`SELECT playerId, score
             FROM leaderboard
             ORDER BY score DESC
             LIMIT ?`,
			limit
		).toArray();
		return rows;
	}

	getTotalPlayers() {
		const result = this.#db.exec<{ count: number; }>(`SELECT COUNT(*) as count FROM leaderboard`).one();
		return result.count;
	}

	get totalScore() {
		return this.#totalScore;
	}
}
