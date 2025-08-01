import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getPopByGroups, getRegionHandler } from './game/coordinator';

const CACHE_DURATION = 15; //sec
const app = new Hono<{
	Variables: {
		ouid: string,
		groupNumber: number;
	};
}>();

app.use('*', cors());

app.use('*', (c, next) => {
	const query = c.req.query();
	const ouid = query.ouid ?? "6666666666";
	const groupNumber = parseInt(query.groupNumber) || 6;
	// console.log({ ouid, groupNumber })
	c.set('ouid', ouid);
	c.set('groupNumber', groupNumber);
	return next();
});

type PopMessage = {
	ouid: string;
	count: number;
	group: number;
};

app.post("/game/pop", async (c) => {
	const count = parseInt(await c.req.text());
	if (Number.isNaN(count)) {
		return c.text("nan");
	}
	const group = c.get("groupNumber");
	const ouid = c.get("ouid");
	await env.freshmen68_queues.send({ count, group, ouid } satisfies PopMessage);
	return c.text("queued");
});

type Counts = Record<number | string, number>;

app.get("/game/stats/groups", async (c) => {
	const data = await env.KV.get(`group_count`, "json") as Counts | null;
	return c.json(data);
});

app.get("/game/stats/self", async (c) => {
	const id = c.get("ouid");
	const checksumDigit = id.charAt(8);
	const data = await env.KV.get(`count:${checksumDigit}`, "json") as Counts | null;
	console.log(checksumDigit, data);
	if (!data || !data[id]) {
		return c.text(0..toString());
	}
	return c.text(data[id].toString());
});




app.get("/durable-object/stats/groups", async (c) => {
	const cached = await caches.default.match(c.req.raw);
	if (cached) {
		console.log(`Cache hit for ${c.req.url}`);
		return cached;
	}

	const group = c.get("groupNumber");
	const gameRegion = getRegionHandler(group);
	const response = Response.json(await gameRegion.getTopTen(), {
		headers: {
			"Cache-Control": `max-age=${CACHE_DURATION}`
		}
	});
	c.executionCtx.waitUntil(caches.default.put(new Request(c.req.raw.url, c.req.raw), response.clone()));
	return response;
});

app.get("/durable-object/stats/global", async (c) => {
	// we do this to reduce amount of rpc call to Durable object
	const cached = await caches.default.match(c.req.raw);
	if (cached) {
		console.log(`Cache hit for ${c.req.url}`);
		return cached;
	}

	const pops = await getPopByGroups();
	const response = Response.json(pops, {
		headers: {
			"Cache-Control": `max-age=${CACHE_DURATION}`
		}
	});
	c.executionCtx.waitUntil(caches.default.put(new Request(c.req.raw.url, c.req.raw), response.clone()));
	return response;
});

app.get("/durable-object/stats/self", async (c) => {
	// shuold we cache this???
	const group = c.get("groupNumber");
	const ouid = c.get("ouid");
	const gameRegion = getRegionHandler(group);
	return c.json(await gameRegion.getPlayerScore(ouid));
});

app.get("/durable-object/pop", async (c) => {
	const group = c.get("groupNumber");
	const ouid = c.get("ouid");
	const pop = parseInt(c.req.query().pop) ?? 1;

	const gameRegion = getRegionHandler(group);
	c.executionCtx.waitUntil(gameRegion.addPop(pop, ouid, group));
	return c.text("queued");
});

export { GameServer } from "./game/server";
export { GameRegionHandler } from "./game/region-handler";

export default class Wroker extends WorkerEntrypoint {
	async fetch(request: Request): Promise<Response> {
		return app.fetch(request, {}, this.ctx);
	}

	async queue(batch: MessageBatch<PopMessage>): Promise<void> {
		if (batch.messages.length === 0) return;

		// Prepare the statement once
		const stmt = env.DB.prepare("INSERT INTO pops (timestamp, ouid, amount, group_id) VALUES (?, ?, ?, ?)");

		// Batch all inserts in a transaction for better performance
		const results = await env.DB.batch(
			batch.messages.map(message => {
				const { count, ouid, group } = message.body;
				return stmt.bind(Date.now(), ouid, count, group);
			})
		);

		results.forEach((result, index) => {
			if (result.error) {
				batch.messages[index].retry();
				console.error(result.error, batch.messages[index]);
			} else {
				batch.messages[index].ack();
			}
		});
	}


	async scheduled(controller: ScheduledController): Promise<void> {
		// Get the last processed timestamp from KV storage
		const lastProcessedTimestamp = await env.KV.get("last_processed_timestamp");
		const lastTimestamp = lastProcessedTimestamp ? parseInt(lastProcessedTimestamp) : 0;
		const currentTimestamp = Date.now();

		// Only process new pop events since last update
		const [newPopsByGroup, newPopsByUser] = await env.DB.batch([
			env.DB.prepare("SELECT group_id, SUM(amount) as new_pops FROM pops WHERE timestamp > ? GROUP BY group_id").bind(lastTimestamp),
			env.DB.prepare("SELECT ouid, SUM(amount) as new_pops FROM pops WHERE timestamp > ? GROUP BY ouid").bind(lastTimestamp)
		]);

		// Get current totals from KV
		const currentGroupTotals = await env.KV.get("group_count", "json") as Record<string, number> || {};
		const currentUserChunks = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				env.KV.get(`count:${i}`, "json").then(data => ({ chunk: i.toString(), data: data as Record<string, number> || {} }))
			)
		);

		// Merge current user chunks into one object
		const currentUserTotals: Record<string, number> = {};
		currentUserChunks.forEach(({ data }) => {
			Object.assign(currentUserTotals, data);
		});

		// console.log({ newPopsByGroup, newPopsByUser });
		// set count:{uid} of every user
		type UserPops = {
			ouid: string,
			new_pops: number;
		};
		type GroupPops = {
			group_id: string,
			new_pops: number;
		};

		/**
		 * wait we can put everything into 1 no 10 object ~ limit 25 mb per key
		 * 10 bytes for student_id + pop_count u64 (8 bytes)
		 * count:{subgroup}
		 * {
		 * 	[uid]: popCount
		 * }
		 *
		 * json: 2 + [10 (uid) + 2 quote + 1: + ~8digits] * user_count
		 * 10 objects ~ 120 keys ~ 2 Mb each | limit 25 mb per key
		 * this reduce write but not read
		 *
		*/

		// Update user totals with new pops
		const newUserPops = newPopsByUser.results as UserPops[];
		newUserPops.forEach(userPop => {
			const currentTotal = currentUserTotals[userPop.ouid] || 0;
			currentUserTotals[userPop.ouid] = currentTotal + userPop.new_pops;
		});

		// Group updated user totals by checksum digit for chunked storage
		const userRecords = Object.groupBy(
			Object.entries(currentUserTotals).map(([ouid, total_pops]) => ({ ouid, total_pops })),
			obj => obj.ouid.charAt(8)
		);

		// console.log("userRecords", userRecords);

		for (const [chunkId, users] of Object.entries(userRecords)) {
			if (users) {
				const chunk = Object.fromEntries(users.map(it => [it.ouid, it.total_pops]));
				// console.log({ chunk });
				await env.KV.put(`count:${chunkId}`, JSON.stringify(chunk));
			}
		}

		// Update group totals with new pops
		const newGroupPops = newPopsByGroup.results as GroupPops[];
		newGroupPops.forEach(groupPop => {
			const currentTotal = currentGroupTotals[groupPop.group_id] || 0;
			currentGroupTotals[groupPop.group_id] = currentTotal + groupPop.new_pops;
		});

		await env.KV.put(`group_count`, JSON.stringify(currentGroupTotals));

		// Update the last processed timestamp
		await env.KV.put("last_processed_timestamp", currentTimestamp.toString());

		console.log("Updated", currentGroupTotals);
	}
}

