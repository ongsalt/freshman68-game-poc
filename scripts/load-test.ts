const domain = "https://game.freshmen68.ongsa.lt/";

interface TestConfig {
  concurrentUsers: number;
  requestsPerUser: number;
  delayBetweenRequests: number; // ms
  testDuration?: number; // ms, if set, ignores requestsPerUser
}

interface TestResult {
  implementation: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  requestsPerSecond: number;
  testDuration: number;
  errors: string[];
}

// Generate random user IDs in the format expected by your system
function generateUserId(): string {
  return Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
}

// Generate random group number (1-6 based on your system)
function generateGroupNumber(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// Generate random pop count (1-50 for realistic clicking)
function generatePopCount(): number {
  return Math.floor(Math.random() * 50) + 1;
}

async function makeRequest(url: string, method: string, body?: string): Promise<{ latency: number; success: boolean; error?: string }> {
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method,
      body,
      headers: {
        'Content-Type': 'text/plain',
      },
    });

    const latency = Date.now() - startTime;
    const success = response.ok;

    if (!success) {
      const errorText = await response.text();
      return { latency, success: false, error: `${response.status}: ${errorText}` };
    }

    return { latency, success: true };
  } catch (error) {
    const latency = Date.now() - startTime;
    return { latency, success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function testQueue(config: TestConfig): Promise<TestResult> {
  console.log(`🟦 Starting Queue implementation test...`);
  console.log(`   Concurrent users: ${config.concurrentUsers}`);
  console.log(`   Requests per user: ${config.requestsPerUser}`);
  console.log(`   Delay between requests: ${config.delayBetweenRequests}ms`);

  const startTime = Date.now();
  const results: { latency: number; success: boolean; error?: string }[] = [];

  const userTasks = Array.from({ length: config.concurrentUsers }, async (_, userIndex) => {
    const userId = generateUserId();
    const groupNumber = generateGroupNumber();

    for (let i = 0; i < config.requestsPerUser; i++) {
      if (config.testDuration && Date.now() - startTime > config.testDuration) {
        break;
      }

      const popCount = generatePopCount();
      const url = `${domain}game/pop?ouid=${userId}&groupNumber=${groupNumber}`;

      const result = await makeRequest(url, 'POST', popCount.toString());
      results.push(result);

      if (config.delayBetweenRequests > 0) {
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
      }
    }
  });

  await Promise.all(userTasks);

  const endTime = Date.now();
  const testDuration = endTime - startTime;

  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.filter(r => !r.success).length;
  const latencies = results.map(r => r.latency);
  const errors = results.filter(r => r.error).map(r => r.error!);

  return {
    implementation: 'Queue',
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    minLatency: Math.min(...latencies),
    maxLatency: Math.max(...latencies),
    requestsPerSecond: (results.length / testDuration) * 1000,
    testDuration,
    errors: [...new Set(errors)], // unique errors
  };
}

async function testDurableObject(config: TestConfig): Promise<TestResult> {
  console.log(`🟨 Starting Durable Object implementation test...`);
  console.log(`   Concurrent users: ${config.concurrentUsers}`);
  console.log(`   Requests per user: ${config.requestsPerUser}`);
  console.log(`   Delay between requests: ${config.delayBetweenRequests}ms`);

  const startTime = Date.now();
  const results: { latency: number; success: boolean; error?: string }[] = [];

  const userTasks = Array.from({ length: config.concurrentUsers }, async (_, userIndex) => {
    const userId = generateUserId();
    const groupNumber = generateGroupNumber();

    for (let i = 0; i < config.requestsPerUser; i++) {
      if (config.testDuration && Date.now() - startTime > config.testDuration) {
        break;
      }

      const popCount = generatePopCount();
      const url = `${domain}durable-object/pop?ouid=${userId}&groupNumber=${groupNumber}&pop=${popCount}`;

      const result = await makeRequest(url, 'GET');
      results.push(result);

      if (config.delayBetweenRequests > 0) {
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
      }
    }
  });

  await Promise.all(userTasks);

  const endTime = Date.now();
  const testDuration = endTime - startTime;

  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.filter(r => !r.success).length;
  const latencies = results.map(r => r.latency);
  const errors = results.filter(r => r.error).map(r => r.error!);

  return {
    implementation: 'Durable Object',
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    minLatency: Math.min(...latencies),
    maxLatency: Math.max(...latencies),
    requestsPerSecond: (results.length / testDuration) * 1000,
    testDuration,
    errors: [...new Set(errors)],
  };
}

function printResults(result: TestResult): void {
  console.log(`\n📊 ${result.implementation} Test Results:`);
  console.log(`   Total Requests: ${result.totalRequests}`);
  console.log(`   Successful: ${result.successfulRequests} (${((result.successfulRequests/result.totalRequests)*100).toFixed(1)}%)`);
  console.log(`   Failed: ${result.failedRequests} (${((result.failedRequests/result.totalRequests)*100).toFixed(1)}%)`);
  console.log(`   Average Latency: ${result.averageLatency.toFixed(0)}ms`);
  console.log(`   Min Latency: ${result.minLatency}ms`);
  console.log(`   Max Latency: ${result.maxLatency}ms`);
  console.log(`   Requests/sec: ${result.requestsPerSecond.toFixed(2)}`);
  console.log(`   Test Duration: ${(result.testDuration/1000).toFixed(1)}s`);

  if (result.errors.length > 0) {
    console.log(`   Unique Errors: ${result.errors.length}`);
    result.errors.slice(0, 5).forEach(error => console.log(`     - ${error}`));
    if (result.errors.length > 5) {
      console.log(`     ... and ${result.errors.length - 5} more`);
    }
  }
}

async function runComparison(config: TestConfig): Promise<void> {
  console.log(`🚀 Starting load test comparison...`);
  console.log(`=`.repeat(50));

  // Test Queue first
  console.log(`\nTesting Queue implementation first...`);
  const queueResult = await testQueue(config);

  // Wait a bit before testing Durable Object
  console.log(`\nWaiting 5 seconds before testing Durable Object...`);
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log(`\nTesting Durable Object implementation...`);
  const durableObjectResult = await testDurableObject(config);

  console.log(`\n` + `=`.repeat(50));
  console.log(`📈 COMPARISON SUMMARY`);
  console.log(`=`.repeat(50));

  printResults(queueResult);
  printResults(durableObjectResult);

  console.log(`\n🏆 WINNER ANALYSIS:`);

  const queueRPS = queueResult.requestsPerSecond;
  const doRPS = durableObjectResult.requestsPerSecond;
  const queueLatency = queueResult.averageLatency;
  const doLatency = durableObjectResult.averageLatency;
  const queueSuccessRate = queueResult.successfulRequests / queueResult.totalRequests;
  const doSuccessRate = durableObjectResult.successfulRequests / durableObjectResult.totalRequests;

  console.log(`   Throughput: ${queueRPS > doRPS ? 'Queue' : 'Durable Object'} (${Math.max(queueRPS, doRPS).toFixed(2)} req/s)`);
  console.log(`   Latency: ${queueLatency < doLatency ? 'Queue' : 'Durable Object'} (${Math.min(queueLatency, doLatency).toFixed(0)}ms avg)`);
  console.log(`   Reliability: ${queueSuccessRate > doSuccessRate ? 'Queue' : 'Durable Object'} (${(Math.max(queueSuccessRate, doSuccessRate)*100).toFixed(1)}% success)`);
}

async function testStats(): Promise<void> {
  console.log(`\n🔍 Testing stats endpoints...`);

  try {
    const [groupStats, selfStats, doList] = await Promise.all([
      fetch(`${domain}game/stats/groups`),
      fetch(`${domain}game/stats/self?ouid=1234567890`),
      fetch(`${domain}durable-object/list-pop`)
    ]);

    console.log(`   Group stats: ${groupStats.ok ? '✅' : '❌'} (${groupStats.status})`);
    console.log(`   Self stats: ${selfStats.ok ? '✅' : '❌'} (${selfStats.status})`);
    console.log(`   DO list: ${doList.ok ? '✅' : '❌'} (${doList.status})`);

    if (groupStats.ok) {
      const data = await groupStats.json();
      console.log(`   Group data sample:`, Object.keys(data || {}).length, 'groups');
    }
  } catch (error) {
    console.log(`   ❌ Error testing stats:`, error);
  }
}

// Preset configurations
const LIGHT_LOAD: TestConfig = {
  concurrentUsers: 5,
  requestsPerUser: 10,
  delayBetweenRequests: 100
};

const MEDIUM_LOAD: TestConfig = {
  concurrentUsers: 20,
  requestsPerUser: 25,
  delayBetweenRequests: 50
};

const HEAVY_LOAD: TestConfig = {
  concurrentUsers: 50,
  requestsPerUser: 20,
  delayBetweenRequests: 10
};

const BURST_LOAD: TestConfig = {
  concurrentUsers: 100,
  requestsPerUser: 5,
  delayBetweenRequests: 0
};

// Realistic test configurations based on actual usage patterns
// Users pop every 30s and poll leaderboard every 30s
const REALISTIC_LIGHT: TestConfig = {
  concurrentUsers: 100,    // 100 concurrent users
  requestsPerUser: 20,     // 10 minutes of activity
  delayBetweenRequests: 30000  // 30 second intervals
};

const REALISTIC_MEDIUM: TestConfig = {
  concurrentUsers: 500,    // 500 concurrent users
  requestsPerUser: 20,     // 10 minutes of activity
  delayBetweenRequests: 30000  // 30 second intervals
};

const REALISTIC_HEAVY: TestConfig = {
  concurrentUsers: 1400,   // Max user capacity
  requestsPerUser: 20,     // 10 minutes of activity
  delayBetweenRequests: 30000  // 30 second intervals
};

// Simulate mixed traffic: pops + leaderboard polling
async function realisticTest(implementation: 'queue' | 'durable', userCount: number, durationMinutes: number = 5): Promise<TestResult> {
  const implName = implementation === 'queue' ? 'Queue' : 'Durable Object';
  console.log(`\n🎯 Realistic ${implName} test: ${userCount} users for ${durationMinutes} minutes`);
  console.log(`   Pattern: Pop every 30s + Leaderboard poll every 30s (offset by 15s)`);

  const startTime = Date.now();
  const testDuration = durationMinutes * 60 * 1000; // Convert to ms
  const results: { latency: number; success: boolean; error?: string; type: 'pop' | 'poll' }[] = [];

  // Each user makes both pop requests and leaderboard requests
  const userTasks = Array.from({ length: userCount }, async (_, userIndex) => {
    const userId = generateUserId();
    const groupNumber = generateGroupNumber();

    // Stagger user start times to simulate realistic arrival
    const userStartDelay = (userIndex * 100) % 30000; // Spread over 30 seconds
    await new Promise(resolve => setTimeout(resolve, userStartDelay));

    let requestCount = 0;

    while (Date.now() - startTime < testDuration) {
      const currentTime = Date.now() - startTime;

      // Pop request every 30 seconds
      if (currentTime % 30000 < 1000 && requestCount % 2 === 0) {
        const popCount = generatePopCount();
        let url: string;
        let method: string;
        let body: string | undefined;

        if (implementation === 'queue') {
          url = `${domain}game/pop?ouid=${userId}&groupNumber=${groupNumber}`;
          method = 'POST';
          body = popCount.toString();
        } else {
          url = `${domain}durable-object/pop?ouid=${userId}&groupNumber=${groupNumber}&pop=${popCount}`;
          method = 'GET';
        }

        const result = await makeRequest(url, method, body);
        results.push({ ...result, type: 'pop' });
      }

      // Leaderboard poll every 30 seconds (offset by 15s)
      if ((currentTime + 15000) % 30000 < 1000 && requestCount % 2 === 1) {
        // Randomly choose between group stats and self stats
        const isGroupStats = Math.random() > 0.3; // 70% group stats, 30% self stats
        const url = isGroupStats
          ? `${domain}game/stats/groups`
          : `${domain}game/stats/self?ouid=${userId}`;

        const result = await makeRequest(url, 'GET');
        results.push({ ...result, type: 'poll' });
      }

      requestCount++;

      // Small delay to prevent tight loop
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  await Promise.all(userTasks);

  const endTime = Date.now();
  const actualDuration = endTime - startTime;

  const popResults = results.filter(r => r.type === 'pop');
  const pollResults = results.filter(r => r.type === 'poll');

  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.filter(r => !r.success).length;
  const latencies = results.map(r => r.latency);
  const errors = results.filter(r => r.error).map(r => r.error!);

  console.log(`   Pop requests: ${popResults.length}, Poll requests: ${pollResults.length}`);
  console.log(`   Expected ~${Math.floor((durationMinutes * 60 / 30) * userCount * 2)} total requests`);

  return {
    implementation: `${implName} (Realistic)`,
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    averageLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
    maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
    requestsPerSecond: (results.length / actualDuration) * 1000,
    testDuration: actualDuration,
    errors: [...new Set(errors)],
  };
}

async function realisticCapacityTest(): Promise<void> {
  console.log(`\n🎯 REALISTIC CAPACITY TEST`);
  console.log(`=`.repeat(60));
  console.log(`Simulating actual user behavior:`);
  console.log(`- Users pop every 30 seconds`);
  console.log(`- Users check leaderboard every 30 seconds (offset)`);
  console.log(`- Mixed traffic pattern`);

  const testConfigs = [
    { users: 100, duration: 3, description: "Light load (7% capacity)" },
    { users: 350, duration: 3, description: "Medium load (25% capacity)" },
    { users: 700, duration: 2, description: "Heavy load (50% capacity)" },
    { users: 1000, duration: 2, description: "Very heavy load (71% capacity)" },
    { users: 1400, duration: 2, description: "Peak load (100% capacity)" },
  ];

  for (const config of testConfigs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${config.description}: ${config.users} users`);

    // Test Queue first
    console.log(`\nTesting Queue implementation...`);
    const queueResult = await realisticTest('queue', config.users, config.duration);

    // Wait before testing Durable Object
    console.log(`\nWaiting 10 seconds before testing Durable Object...`);
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log(`\nTesting Durable Object implementation...`);
    const doResult = await realisticTest('durable', config.users, config.duration);

    console.log(`\n📊 ${config.description.toUpperCase()} RESULTS:`);
    console.log(`Queue:          ${queueResult.requestsPerSecond.toFixed(1)} req/s | ${((queueResult.successfulRequests/queueResult.totalRequests)*100).toFixed(1)}% success | ${queueResult.averageLatency.toFixed(0)}ms avg`);
    console.log(`Durable Object: ${doResult.requestsPerSecond.toFixed(1)} req/s | ${((doResult.successfulRequests/doResult.totalRequests)*100).toFixed(1)}% success | ${doResult.averageLatency.toFixed(0)}ms avg`);

    // Brief pause between test levels
    if (config !== testConfigs[testConfigs.length - 1]) {
      console.log(`\nWaiting 15 seconds before next test level...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }
}

// Stress test to find maximum req/s capacity
async function findMaxCapacity(implementation: 'queue' | 'durable'): Promise<void> {
  console.log(`\n🔥 Finding maximum capacity for ${implementation.toUpperCase()} implementation...`);
  console.log(`=`.repeat(60));

  const testFunction = implementation === 'queue' ? testQueue : testDurableObject;
  const results: { rps: number; successRate: number; avgLatency: number }[] = [];

  // Start with low load and gradually increase
  const testConfigs = [
    { concurrentUsers: 10, requestsPerUser: 20, delayBetweenRequests: 0 },   // ~200 req/s target
    { concurrentUsers: 20, requestsPerUser: 25, delayBetweenRequests: 0 },   // ~500 req/s target
    { concurrentUsers: 50, requestsPerUser: 20, delayBetweenRequests: 0 },   // ~1000 req/s target
    { concurrentUsers: 100, requestsPerUser: 15, delayBetweenRequests: 0 },  // ~1500 req/s target
    { concurrentUsers: 200, requestsPerUser: 10, delayBetweenRequests: 0 },  // ~2000 req/s target
    { concurrentUsers: 350, requestsPerUser: 8, delayBetweenRequests: 0 },   // ~2800 req/s target
    { concurrentUsers: 500, requestsPerUser: 6, delayBetweenRequests: 0 },   // ~3000 req/s target
    { concurrentUsers: 750, requestsPerUser: 4, delayBetweenRequests: 0 },   // ~3000 req/s target
  ];

  let previousSuccessRate = 1.0;
  let maxStableRPS = 0;

  for (const config of testConfigs) {
    console.log(`\n🧪 Testing: ${config.concurrentUsers} users × ${config.requestsPerUser} requests...`);

    const result = await testFunction(config);
    const successRate = result.successfulRequests / result.totalRequests;

    console.log(`   RPS: ${result.requestsPerSecond.toFixed(1)}, Success: ${(successRate * 100).toFixed(1)}%, Latency: ${result.averageLatency.toFixed(0)}ms`);

    results.push({
      rps: result.requestsPerSecond,
      successRate,
      avgLatency: result.averageLatency
    });

    // Consider stable if success rate > 95%
    if (successRate > 0.95) {
      maxStableRPS = Math.max(maxStableRPS, result.requestsPerSecond);
    }

    // Stop if success rate drops significantly or latency gets too high
    if (successRate < 0.80 || result.averageLatency > 10000) {
      console.log(`\n⚠️  Stopping test - performance degraded significantly`);
      break;
    }

    // Brief pause between tests to let server recover
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n📊 ${implementation.toUpperCase()} CAPACITY ANALYSIS:`);
  console.log(`=`.repeat(60));
  console.log(`🏆 Maximum stable RPS (>95% success): ${maxStableRPS.toFixed(1)} req/s`);

  const maxRPS = Math.max(...results.map(r => r.rps));
  const maxRPSResult = results.find(r => r.rps === maxRPS);
  console.log(`🚀 Peak RPS achieved: ${maxRPS.toFixed(1)} req/s (${(maxRPSResult?.successRate! * 100).toFixed(1)}% success)`);

  console.log(`\n📈 Performance breakdown:`);
  results.forEach((result, index) => {
    const config = testConfigs[index];
    console.log(`   ${config.concurrentUsers.toString().padStart(3)} users: ${result.rps.toFixed(1).padStart(7)} req/s | ${(result.successRate * 100).toFixed(1).padStart(5)}% | ${result.avgLatency.toFixed(0).padStart(6)}ms`);
  });
}

async function stressTestBoth(): Promise<void> {
  console.log(`\n🔥 STRESS TEST: Finding maximum capacity for both implementations`);
  console.log(`=`.repeat(80));

  await findMaxCapacity('queue');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Waiting 5 seconds before testing Durable Object...`);
  await new Promise(resolve => setTimeout(resolve, 5000));

  await findMaxCapacity('durable');

  console.log(`\n✅ Stress test completed!`);
}

// Quick capacity test with fixed high load
async function quickCapacityTest(): Promise<void> {
  console.log(`\n⚡ QUICK CAPACITY TEST`);
  console.log(`=`.repeat(50));

  const highLoadConfig: TestConfig = {
    concurrentUsers: 200,
    requestsPerUser: 10,
    delayBetweenRequests: 0
  };

  console.log(`Testing both implementations with high load:`);
  console.log(`${highLoadConfig.concurrentUsers} concurrent users × ${highLoadConfig.requestsPerUser} requests`);

  // Test Queue first
  console.log(`\nTesting Queue implementation...`);
  const queueResult = await testQueue(highLoadConfig);

  // Wait before testing Durable Object
  console.log(`\nWaiting 10 seconds before testing Durable Object...`);
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log(`\nTesting Durable Object implementation...`);
  const doResult = await testDurableObject(highLoadConfig);

  console.log(`\n📊 QUICK CAPACITY RESULTS:`);
  console.log(`Queue:          ${queueResult.requestsPerSecond.toFixed(1)} req/s (${((queueResult.successfulRequests/queueResult.totalRequests)*100).toFixed(1)}% success)`);
  console.log(`Durable Object: ${doResult.requestsPerSecond.toFixed(1)} req/s (${((doResult.successfulRequests/doResult.totalRequests)*100).toFixed(1)}% success)`);

  const winner = queueResult.requestsPerSecond > doResult.requestsPerSecond ? 'Queue' : 'Durable Object';
  const maxRPS = Math.max(queueResult.requestsPerSecond, doResult.requestsPerSecond);
  console.log(`\n🏆 Winner: ${winner} with ${maxRPS.toFixed(1)} req/s`);
}

// Main execution function - call manually or modify as needed
async function main(testType: string = 'medium'): Promise<void> {
  console.log(`🎮 Freshman68 Game Load Test`);
  console.log(`Target: ${domain}`);

  // Test stats endpoints first
  await testStats();

  let config: TestConfig;
  switch (testType.toLowerCase()) {
    case 'light':
      config = LIGHT_LOAD;
      break;
    case 'medium':
      config = MEDIUM_LOAD;
      break;
    case 'heavy':
      config = HEAVY_LOAD;
      break;
    case 'burst':
      config = BURST_LOAD;
      break;
    case 'queue':
      config = MEDIUM_LOAD;
      console.log(`\n🟦 Testing Queue implementation only...`);
      const queueResult = await testQueue(config);
      printResults(queueResult);
      return;
    case 'do':
    case 'durable':
      config = MEDIUM_LOAD;
      console.log(`\n🟨 Testing Durable Object implementation only...`);
      const doResult = await testDurableObject(config);
      printResults(doResult);
      return;
    case 'stress':
      await stressTestBoth();
      return;
    case 'capacity':
    case 'quick':
      await quickCapacityTest();
      return;
    case 'max-queue':
      await findMaxCapacity('queue');
      return;
    case 'max-do':
    case 'max-durable':
      await findMaxCapacity('durable');
      return;
    case 'realistic':
      await realisticCapacityTest();
      return;
    case 'realistic-light':
      console.log(`\n📊 REALISTIC LIGHT TEST:`);
      console.log(`Testing Queue implementation first...`);
      const lightQueueResult = await realisticTest('queue', 100, 3);
      printResults(lightQueueResult);

      console.log(`\nWaiting 10 seconds before testing Durable Object...`);
      await new Promise(resolve => setTimeout(resolve, 10000));

      console.log(`\nTesting Durable Object implementation...`);
      const lightDoResult = await realisticTest('durable', 100, 3);
      printResults(lightDoResult);
      return;
    case 'realistic-heavy':
      console.log(`\n📊 REALISTIC HEAVY TEST (1400 users - max capacity):`);
      console.log(`Testing Queue implementation first...`);
      const heavyQueueResult = await realisticTest('queue', 1400, 2);
      printResults(heavyQueueResult);

      console.log(`\nWaiting 15 seconds before testing Durable Object...`);
      await new Promise(resolve => setTimeout(resolve, 15000));

      console.log(`\nTesting Durable Object implementation...`);
      const heavyDoResult = await realisticTest('durable', 1400, 2);
      printResults(heavyDoResult);
      return;
    default:
      config = MEDIUM_LOAD;
  }

  await runComparison(config);

  console.log(`\n✅ Load test completed!`);
  console.log(`💡 Available test types:`);
  console.log(`   REALISTIC TESTS (recommended for 1400 max users):`);
  console.log(`   - 'realistic': Full capacity test with realistic user patterns`);
  console.log(`   - 'realistic-light': 100 users for 3 minutes`);
  console.log(`   - 'realistic-heavy': 1400 users for 2 minutes (max capacity)`);
  console.log(`   `);
  console.log(`   STRESS TESTS (max capacity):`);
  console.log(`   - 'stress': Find max capacity for both (takes ~5-10 min)`);
  console.log(`   - 'capacity'/'quick': Quick high-load test`);
  console.log(`   - 'max-queue', 'max-do': Find max capacity for single implementation`);
  console.log(`   `);
  console.log(`   BASIC TESTS:`);
  console.log(`   - 'light', 'medium', 'heavy', 'burst': Standard load tests`);
  console.log(`   - 'queue', 'do': Test single implementation`);
}

// Export functions for manual use
export { main, testQueue, testDurableObject, runComparison, testStats, findMaxCapacity, stressTestBoth, quickCapacityTest, realisticTest, realisticCapacityTest };

// Auto-run with realistic capacity test
main('realistic').catch(console.error);

