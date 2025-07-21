const domain = "https://game.freshmen68.ongsa.lt/";

interface TestResults {
  implementation: string;
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

  private async getBaselineData(implementation: 'queue' | 'durable') {
    console.log(`🔍 Collecting baseline data for ${implementation} implementation...`);

    try {
      if (implementation === 'queue') {
        // Get current group stats
        const groupResponse = await fetch(`${domain}game/stats/groups`);
        const groupStats = groupResponse.ok ? await groupResponse.json() : null;

        console.log(`📊 Current server group stats:`, groupStats);

        return {
          groupStats: groupStats || {},
          totalPops: groupStats ? Object.values(groupStats as Record<string, number>).reduce((sum, pops) => sum + pops, 0) : 0
        };
      } else {
        // Get current durable object data
        const response = await fetch(`${domain}durable-object/list-pop`);
        const serverData = response.ok ? await response.json() : [];

        const totalPops = Array.isArray(serverData) ?
          serverData.reduce((sum: number, record: any) => sum + (record.amount || 0), 0) : 0;

        console.log(`📊 Current durable object records: ${Array.isArray(serverData) ? serverData.length : 0}, Total pops: ${totalPops}`);

        return {
          records: serverData,
          totalPops
        };
      }
    } catch (error) {
      console.log(`⚠️  Failed to collect baseline data: ${error}`);
      return { totalPops: 0 };
    }
  }

  async runTest(implementation: 'queue' | 'durable', maxUsers: number = 1400, testDurationMs: number = 60000) {
    console.log(`\n🚀 Starting load test for ${implementation} implementation`);
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
      const groupId = (i % 15) + 1; // Groups 1-15
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
        response = await fetch(`${domain}game/pop?ouid=${user.userId}&groupNumber=${user.groupId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: popCount.toString()
        });
      } else {
        response = await fetch(`${domain}durable-object/pop?pop=${popCount}&ouid=${user.userId}&groupNumber=${user.groupId}`, {
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
          fetch(`${domain}game/stats/groups?ouid=${user.userId}&groupNumber=${user.groupId}`),
          fetch(`${domain}game/stats/self?ouid=${user.userId}&groupNumber=${user.groupId}`)
        ]);
      } else {
        // Check durable object leaderboard
        responses = [
          await fetch(`${domain}durable-object/list-pop?ouid=${user.userId}&groupNumber=${user.groupId}`)
        ];
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
    console.log(`${'='.repeat(50)}`);
    console.log(`Concurrent Users: ${result.concurrentUsers}`);
    console.log(`Total Requests: ${result.totalRequests}`);
    console.log(`  ├─ Pop Requests: ${popRequests}`);
    console.log(`  └─ Leaderboard Requests: ${leaderboardRequests}`);
    console.log(`Successful Requests: ${result.successfulRequests}`);
    console.log(`Failed Requests: ${result.failedRequests}`);
    console.log(`Average Response Time: ${result.averageResponseTime.toFixed(2)}ms`);
    console.log(`Requests Per Second: ${result.requestsPerSecond.toFixed(2)} RPS`);
    console.log(`Error Rate: ${result.errorRate.toFixed(2)}%`);
    console.log(`\n🎯 Pop Verification:`);
    console.log(`Total Pops Generated: ${totalPopsGenerated.toLocaleString()}`);
    console.log(`Average Pops per User: ${(totalPopsGenerated / result.concurrentUsers).toFixed(1)}`);

    // Group breakdown
    const popsByGroup = users.reduce((acc, user) => {
      acc[user.groupId] = (acc[user.groupId] || 0) + user.totalPops;
      return acc;
    }, {} as Record<number, number>);

    console.log(`\n📈 Pops by Group:`);
    Object.entries(popsByGroup).forEach(([groupId, pops]) => {
      console.log(`  Group ${groupId}: ${pops.toLocaleString()} pops`);
    });

    // Verify with server data
    this.verifyServerData(result.implementation, popsByGroup, totalPopsGenerated, baseline).catch(err => {
      console.log(`⚠️  Server verification failed: ${err.message}`);
    });

    if (result.errors.length > 0) {
      console.log(`\n❌ Sample Errors:`);
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    console.log(`${'='.repeat(50)}\n`);
  }

  private async verifyServerData(implementation: string, expectedPopsByGroup: Record<number, number>, expectedTotal: number, baseline: any) {
    try {
      console.log(`\n🔍 Verifying server data for ${implementation} implementation...`);

      if (implementation === 'queue') {
        // Check group stats from server
        const response = await fetch(`${domain}game/stats/groups`);
        if (response.ok) {
          const serverStats = await response.json();
          console.log(`\n📊 Server vs Expected Group Stats (accounting for baseline):`);

          let serverTotal = 0;
          let baselineTotal = baseline.totalPops || 0;

          for (const [groupId, expectedPops] of Object.entries(expectedPopsByGroup)) {
            const currentServerPops = serverStats?.[groupId] || 0;
            const baselinePops = baseline.groupStats?.[groupId] || 0;
            const actualNewPops = currentServerPops - baselinePops;
            serverTotal += currentServerPops;

            // Allow for some tolerance due to cron updates and async processing
            const match = Math.abs(actualNewPops - expectedPops) < Math.max(expectedPops * 0.1, 50);
            console.log(`  Group ${groupId}: Expected +${expectedPops}, Baseline ${baselinePops}, Current ${currentServerPops}, Actual +${actualNewPops} ${match ? '✅' : '❌'}`);
          }

          const actualNewTotal = serverTotal - baselineTotal;
          const totalMatch = Math.abs(actualNewTotal - expectedTotal) < Math.max(expectedTotal * 0.1, 100);
          console.log(`\n📈 Total: Expected +${expectedTotal}, Baseline ${baselineTotal}, Current ${serverTotal}, Actual +${actualNewTotal} ${totalMatch ? '✅' : '❌'}`);

          if (totalMatch) {
            console.log(`✅ Server data verification PASSED (within tolerance due to cron updates)`);
          } else {
            const difference = Math.abs(actualNewTotal - expectedTotal);
            console.log(`❌ Server data verification FAILED - ${difference} difference`);
            console.log(`💡 Note: Leaderboard updates every minute via cron, some discrepancy is expected`);
          }
        } else {
          console.log(`❌ Failed to fetch server stats: ${response.status}`);
        }
      } else {
        // For durable object, check the list-pop endpoint
        const response = await fetch(`${domain}durable-object/list-pop`);
        if (response.ok) {
          const serverData = await response.json();
          console.log(`📊 Durable Object has ${Array.isArray(serverData) ? serverData.length : 'unknown'} pop records`);

          if (Array.isArray(serverData)) {
            const currentTotal = serverData.reduce((sum: number, record: any) => sum + (record.amount || 0), 0);
            const baselineTotal = baseline.totalPops || 0;
            const actualNewPops = currentTotal - baselineTotal;

            // Allow for tolerance
            const match = Math.abs(actualNewPops - expectedTotal) < Math.max(expectedTotal * 0.1, 100);
            console.log(`📈 Total: Expected +${expectedTotal}, Baseline ${baselineTotal}, Current ${currentTotal}, Actual +${actualNewPops} ${match ? '✅' : '❌'}`);

            if (match) {
              console.log(`✅ Server data verification PASSED`);
            } else {
              const difference = Math.abs(actualNewPops - expectedTotal);
              console.log(`❌ Server data verification FAILED - ${difference} difference`);
            }
          }
        } else {
          console.log(`❌ Failed to fetch durable object data: ${response.status}`);
        }
      }
    } catch (error) {
      throw error;
    }
  }  getResults(): TestResults[] {
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
      console.log(`| Metric                    | Queue      | Durable    | Winner   |`);
      console.log(`|---------------------------|------------|------------|----------|`);
      console.log(`| Requests/Second           | ${queueResult.requestsPerSecond.toFixed(2).padStart(10)} | ${durableResult.requestsPerSecond.toFixed(2).padStart(10)} | ${queueResult.requestsPerSecond > durableResult.requestsPerSecond ? 'Queue' : 'Durable'.padStart(8)} |`);
      console.log(`| Avg Response Time (ms)    | ${queueResult.averageResponseTime.toFixed(2).padStart(10)} | ${durableResult.averageResponseTime.toFixed(2).padStart(10)} | ${queueResult.averageResponseTime < durableResult.averageResponseTime ? 'Queue' : 'Durable'.padStart(8)} |`);
      console.log(`| Error Rate (%)            | ${queueResult.errorRate.toFixed(2).padStart(10)} | ${durableResult.errorRate.toFixed(2).padStart(10)} | ${queueResult.errorRate < durableResult.errorRate ? 'Queue' : 'Durable'.padStart(8)} |`);
      console.log(`| Success Rate (%)          | ${((queueResult.successfulRequests / queueResult.totalRequests) * 100).toFixed(2).padStart(10)} | ${((durableResult.successfulRequests / durableResult.totalRequests) * 100).toFixed(2).padStart(10)} | ${(queueResult.successfulRequests / queueResult.totalRequests) > (durableResult.successfulRequests / durableResult.totalRequests) ? 'Queue' : 'Durable'.padStart(8)} |`);
    }
    console.log(`${'='.repeat(60)}\n`);
  }
}

// Test configurations
const testConfigs = [
  { users: 100, duration: 30000 },   // 100 users for 30s
  { users: 500, duration: 60000 },   // 500 users for 1 min
  { users: 1000, duration: 60000 },  // 1000 users for 1 min
  { users: 1400, duration: 90000 },  // 1400 users for 1.5 min
];

async function runFullTest() {
  const tester = new LoadTester();

  console.log("🎯 Starting comprehensive load test...\n");

  for (const config of testConfigs) {
    console.log(`\n📈 Testing with ${config.users} users for ${config.duration/1000}s`);

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
async function quickTest(implementation: 'queue' | 'durable', users: number = 100, duration: number = 30000) {
  const tester = new LoadTester();
  await tester.runTest(implementation, users, duration);
  return tester.getResults()[0];
}

// Export functions for use
export { runFullTest, quickTest, LoadTester };

// Run the test if this file is executed directly
// Uncomment the line below to run automatically
// runFullTest().catch(console.error);
quickTest("queue").catch(console.error)
