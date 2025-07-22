
interface TestResults {
	implementation: 'queue' | 'durable';
	concurrentUsers: number;
	totalRequests: number;
	successfulRequests: number;
	failedRequests: number;
	averageResponseTime: number;
	requestsPerSecond: number;
	errorRate: number;
	errors: string[];
}

interface UserStats {
	userId: string;
	groupId: number;
	totalPops: number;
	requestCount: number;
	popRequestCount: number;
	leaderboardRequestCount: number;
	errorCount: number;
	responseTimeSum: number;
}

class LoadTester {
	private results: TestResults[] = [];
	private isRunning = false;
	private domain: string;

	constructor(domain: string = "http://localhost:8787/") {
		this.domain = domain;
	}

	private async getBaselineData(implementation: 'queue' | 'durable') {
		console.log(`🔍 Collecting baseline data for ${implementation} implementation...`);

		try {
			if (implementation === 'queue') {
				// Get current group stats
				const groupResponse = await fetch(`${this.domain}game/stats/groups`);
				const groupStats = groupResponse.ok ? await groupResponse.json() : null;

				console.log(`📊 Current server group stats:`, groupStats);

				return {
					groupStats: groupStats || {},
					totalPops: groupStats ? Object.values(groupStats as Record<string, number>).reduce((sum, pops) => sum + pops, 0) : 0
				};
			} else {
				// Get current durable object data
				const response = await fetch(`${this.domain}durable-object/stats/global`);
				const serverData = response.ok ? await response.json() : {};

				const totalPops = Object.values(serverData as Record<string, number>).reduce((sum, pops) => sum + pops, 0);

				console.log(`📊 Current durable object data: ${Object.keys(serverData).length} groups, Total pops: ${totalPops}`);

				return {
					groupStats: serverData,
					totalPops
				};
			}
		} catch (error) {
			console.log(`⚠️  Failed to collect baseline data: ${error}`);
			return { totalPops: 0 };
		}
	}

	async runTest(implementation: 'queue' | 'durable', maxUsers: number = 1400, testDurationMs: number = 60000) {
		const testStartTime = new Date();
		console.log(`\n🚀 Starting load test for ${implementation} implementation`);
		console.log(`📅 Test started at: ${testStartTime.toLocaleString('sv-SE')}`);
		console.log(`Max users: ${maxUsers}, Test duration: ${testDurationMs / 1000}s\n`);

		// Get baseline data before starting test
		const baseline = await this.getBaselineData(implementation);
		console.log(`📊 Baseline data collected`);

		this.isRunning = true;
		const startTime = Date.now();
		const users: UserStats[] = [];
		const errors: string[] = [];

		// Create users with realistic distribution across groups (1-15)
		for (let i = 0; i < maxUsers; i++) {
			const userId = `6${String(i).padStart(9, '0')}`;
			let groupId = (i % 6) + 1; // Groups 1-6
			if (groupId == 2) {
				groupId = 7;
			}
			users.push({
				userId,
				groupId,
				totalPops: 0,
				requestCount: 0,
				popRequestCount: 0,
				leaderboardRequestCount: 0,
				errorCount: 0,
				responseTimeSum: 0
			});
		}

		// Start all user simulations
		const userPromises = users.map(user => this.simulateUser(user, implementation, errors));

		// Wait for test duration
		await new Promise(resolve => setTimeout(resolve, testDurationMs));
		this.isRunning = false;

		// Wait for all users to finish their current operations
		await Promise.allSettled(userPromises);

		const endTime = Date.now();
		const totalTime = (endTime - startTime) / 1000;

		// Calculate results
		const totalRequests = users.reduce((sum, user) => sum + user.requestCount, 0);
		const successfulRequests = users.reduce((sum, user) => sum + (user.requestCount - user.errorCount), 0);
		const failedRequests = users.reduce((sum, user) => sum + user.errorCount, 0);
		const totalResponseTime = users.reduce((sum, user) => sum + user.responseTimeSum, 0);

		const result: TestResults = {
			implementation,
			concurrentUsers: maxUsers,
			totalRequests,
			successfulRequests,
			failedRequests,
			averageResponseTime: totalResponseTime / totalRequests,
			requestsPerSecond: totalRequests / totalTime,
			errorRate: (failedRequests / totalRequests) * 100,
			errors: Array.from(new Set(errors)).slice(0, 10) // Top 10 unique errors
		};

		this.results.push(result);
		this.printResults(result, users, baseline);
		return result;
	}

	private async simulateUser(user: UserStats, implementation: 'queue' | 'durable', errors: string[]) {
		const popInterval = 15000; // 15 seconds
		const leaderboardInterval = 15000; // 15 seconds

		let lastPopTime = Date.now() - Math.random() * popInterval; // Stagger initial requests
		let lastLeaderboardTime = Date.now() - Math.random() * leaderboardInterval;

		while (this.isRunning) {
			const now = Date.now();
			const promises: Promise<void>[] = [];

			// Check if it's time to pop
			if (now - lastPopTime >= popInterval) {
				promises.push(this.performPop(user, implementation, errors));
				lastPopTime = now;
			}

			// Check if it's time to check leaderboard
			if (now - lastLeaderboardTime >= leaderboardInterval) {
				promises.push(this.checkLeaderboard(user, implementation, errors));
				lastLeaderboardTime = now;
			}

			// Execute requests concurrently
			if (promises.length > 0) {
				await Promise.allSettled(promises);
			}

			// Small delay to prevent tight loop
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}

	private async performPop(user: UserStats, implementation: 'queue' | 'durable', errors: string[]) {
		const popCount = Math.floor(Math.random() * 50) + 1; // 1-50 pops per click
		const startTime = Date.now();

		try {
			let response: Response;

			if (implementation === 'queue') {
				response = await fetch(`${this.domain}game/pop?ouid=${user.userId}&groupNumber=${user.groupId}`, {
					method: 'POST',
					headers: { 'Content-Type': 'text/plain' },
					body: popCount.toString()
				});
			} else {
				response = await fetch(`${this.domain}durable-object/pop?pop=${popCount}&ouid=${user.userId}&groupNumber=${user.groupId}`, {
					method: 'GET'
				});
			}

			const responseTime = Date.now() - startTime;
			user.responseTimeSum += responseTime;
			user.requestCount++;
			user.popRequestCount++;

			if (!response.ok) {
				user.errorCount++;
				errors.push(`Pop request failed: ${response.status} ${response.statusText}`);
			} else {
				user.totalPops += popCount;
			}

		} catch (error) {
			const responseTime = Date.now() - startTime;
			user.responseTimeSum += responseTime;
			user.requestCount++;
			user.popRequestCount++;
			user.errorCount++;
			errors.push(`Pop request error: ${error}`);
		}
	}

	private async checkLeaderboard(user: UserStats, implementation: 'queue' | 'durable', errors: string[]) {
		const startTime = Date.now();

		try {
			let responses: Response[];

			if (implementation === 'queue') {
				// Check both group stats and personal stats
				responses = await Promise.all([
					fetch(`${this.domain}game/stats/groups?groupNumber=${user.groupId}`),
					// fetch(`${this.domain}game/stats/self?ouid=${user.userId}&groupNumber=${user.groupId}`)
				]);
			} else {
				// Check durable object leaderboard and personal stats
				responses = await Promise.all([
					fetch(`${this.domain}durable-object/stats/groups?groupNumber=${user.groupId}`),
					// fetch(`${this.domain}durable-object/stats/self?ouid=${user.userId}&groupNumber=${user.groupId}`)
				]);
			}

			const responseTime = Date.now() - startTime;
			user.responseTimeSum += responseTime;
			user.requestCount += responses.length;
			user.leaderboardRequestCount += responses.length;

			for (const response of responses) {
				if (!response.ok) {
					user.errorCount++;
					errors.push(`Leaderboard request failed: ${response.status} ${response.statusText}`);
				}
			}

		} catch (error) {
			const responseTime = Date.now() - startTime;
			user.responseTimeSum += responseTime;
			user.requestCount++;
			user.leaderboardRequestCount++;
			user.errorCount++;
			errors.push(`Leaderboard request error: ${error}`);
		}
	}

	private printResults(result: TestResults, users: UserStats[], baseline: any) {
		const totalPopsGenerated = users.reduce((sum, user) => sum + user.totalPops, 0);
		const popRequests = users.reduce((sum, user) => sum + user.popRequestCount, 0);
		const leaderboardRequests = users.reduce((sum, user) => sum + user.leaderboardRequestCount, 0);

		console.log(`\n📊 Results for ${result.implementation.toUpperCase()} Implementation:`);
		console.log(`📅 Test completed at: ${new Date().toLocaleString('sv-SE')}`);
		console.log(`${'='.repeat(70)}`);

		// Main metrics table
		const mainMetrics = {
			'Concurrent Users': result.concurrentUsers.toLocaleString(),
			'Total Requests': result.totalRequests.toLocaleString(),
			'Pop Requests': popRequests.toLocaleString(),
			'Leaderboard Requests': leaderboardRequests.toLocaleString(),
			'Successful Requests': result.successfulRequests.toLocaleString(),
			'Failed Requests': result.failedRequests.toLocaleString(),
			'Average Response Time (ms)': result.averageResponseTime.toFixed(2),
			'Requests Per Second': result.requestsPerSecond.toFixed(2),
			'Error Rate (%)': result.errorRate.toFixed(2),
			'Success Rate (%)': ((result.successfulRequests / result.totalRequests) * 100).toFixed(2)
		};

		console.log('\n📈 Main Metrics:');
		console.table(mainMetrics);

		// Pop generation summary
		const popSummary = {
			'Total Pops Generated': totalPopsGenerated.toLocaleString(),
			'Average Pops per User': (totalPopsGenerated / result.concurrentUsers).toFixed(1),
			'Pops per Second': (totalPopsGenerated / (result.totalRequests / result.requestsPerSecond)).toFixed(1)
		};

		console.log('\n🎯 Pop Generation Summary:');
		console.table(popSummary);

		// Group breakdown table
		const popsByGroup = users.reduce((acc, user) => {
			acc[user.groupId] = (acc[user.groupId] || 0) + user.totalPops;
			return acc;
		}, {} as Record<number, number>);

		const groupBreakdown = Object.entries(popsByGroup).map(([groupId, pops]) => {
			const usersInGroup = users.filter(u => u.groupId === parseInt(groupId)).length;
			return {
				'Group ID': groupId,
				'Pops Generated': pops.toLocaleString(),
				'Users in Group': usersInGroup,
				'Avg Pops per User': (pops / usersInGroup).toFixed(1)
			};
		});

		console.log('\n📊 Pops by Group:');
		console.table(groupBreakdown);

		// Print expected leaderboard as JSON
		this.printExpectedLeaderboard(popsByGroup, baseline);

		if (result.errors.length > 0) {
			console.log(`\n❌ Sample Errors:`);
			result.errors.forEach((error, index) => {
				console.log(`  ${index + 1}. ${error}`);
			});
		}
		console.log(`${'='.repeat(50)}\n`);
	}

	getResults(): TestResults[] {
		return this.results;
	}

	printComparison() {
		if (this.results.length < 2) {
			console.log("❌ Need at least 2 test results to compare");
			return;
		}

		console.log(`\n🔄 COMPARISON RESULTS`);
		console.log(`${'='.repeat(60)}`);

		const queueResult = this.results.find(r => r.implementation === 'queue');
		const durableResult = this.results.find(r => r.implementation === 'durable');

		if (queueResult && durableResult) {
			const comparison = [
				{
					'Metric': 'Requests/Second',
					'Queue': queueResult.requestsPerSecond.toFixed(2),
					'Durable': durableResult.requestsPerSecond.toFixed(2),
					'Winner': queueResult.requestsPerSecond > durableResult.requestsPerSecond ? 'Queue' : 'Durable'
				},
				{
					'Metric': 'Avg Response Time (ms)',
					'Queue': queueResult.averageResponseTime.toFixed(2),
					'Durable': durableResult.averageResponseTime.toFixed(2),
					'Winner': queueResult.averageResponseTime < durableResult.averageResponseTime ? 'Queue' : 'Durable'
				},
				{
					'Metric': 'Error Rate (%)',
					'Queue': queueResult.errorRate.toFixed(2),
					'Durable': durableResult.errorRate.toFixed(2),
					'Winner': queueResult.errorRate < durableResult.errorRate ? 'Queue' : 'Durable'
				},
				{
					'Metric': 'Success Rate (%)',
					'Queue': ((queueResult.successfulRequests / queueResult.totalRequests) * 100).toFixed(2),
					'Durable': ((durableResult.successfulRequests / durableResult.totalRequests) * 100).toFixed(2),
					'Winner': (queueResult.successfulRequests / queueResult.totalRequests) > (durableResult.successfulRequests / durableResult.totalRequests) ? 'Queue' : 'Durable'
				}
			];

			console.table(comparison);
		}
		console.log(`${'='.repeat(60)}\n`);
	}

	private printExpectedLeaderboard(popsByGroup: Record<number, number>, baseline: any) {
		console.log('\n📋 Expected Leaderboard (JSON):');
		console.log(`${'='.repeat(50)}`);

		// Merge baseline data with pops added by script
		const expectedLeaderboard: Record<string, number> = {};

		// Add baseline data
		if (baseline.groupStats) {
			Object.entries(baseline.groupStats).forEach(([groupId, pops]) => {
				expectedLeaderboard[groupId] = pops as number;
			});
		}

		// Add pops generated by the script
		Object.entries(popsByGroup).forEach(([groupId, pops]) => {
			const groupIdStr = groupId.toString();
			expectedLeaderboard[groupIdStr] = (expectedLeaderboard[groupIdStr] || 0) + pops;
		});

		// Sort by pops (descending)
		const sortedLeaderboard = Object.entries(expectedLeaderboard)
			.sort(([, a], [, b]) => b - a)
			.reduce((acc, [groupId, pops]) => {
				acc[groupId] = pops;
				return acc;
			}, {} as Record<string, number>);

		console.log(JSON.stringify(sortedLeaderboard, null, 2));
		console.log(`${'='.repeat(50)}\n`);
	}
}

// Test configurations
const testConfigs = [
	{ users: 100, duration: 30000 },   // 100 users for 30s
	{ users: 500, duration: 60000 },   // 500 users for 1 min
	{ users: 1000, duration: 60000 },  // 1000 users for 1 min
	{ users: 1400, duration: 90000 },  // 1400 users for 1.5 min
];

async function runFullTest(domain: string = "http://localhost:8787/") {
	const tester = new LoadTester(domain);

	console.log("🎯 Starting comprehensive load test...\n");

	for (const config of testConfigs) {
		console.log(`\n📈 Testing with ${config.users} users for ${config.duration / 1000}s`);

		// Test Queue implementation
		await tester.runTest('queue', config.users, config.duration);

		// Wait between tests
		console.log("⏳ Waiting 10s between tests...");
		await new Promise(resolve => setTimeout(resolve, 10000));

		// Test Durable Object implementation
		await tester.runTest('durable', config.users, config.duration);

		// Wait between configurations
		if (config !== testConfigs[testConfigs.length - 1]) {
			console.log("⏳ Waiting 30s between configurations...");
			await new Promise(resolve => setTimeout(resolve, 30000));
		}
	}

	// Print final comparison
	tester.printComparison();
}

// Quick test function for single implementation
async function quickTest(implementation: 'queue' | 'durable', users: number = 100, duration: number = 30000, domain: string = "http://localhost:8787/") {
	const tester = new LoadTester(domain);
	await tester.runTest(implementation, users, duration);
	return tester.getResults()[0];
}

// Export functions for use
export { runFullTest, quickTest, LoadTester };

// const domain = "http://localhost:8787/";
const domain = "https://game.freshmen68.ongsa.lt/";

await quickTest("durable", 1200, 120000, domain);
