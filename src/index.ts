import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
}>();

app.use(
	'*', // or replace with "*" to enable cors for all routes
	cors({
		origin: [env.FRONTEND_URL || 'http://localhost:5173', env.PUBLIC_BETTER_AUTH_URL || 'http://localhost:8787'],
		allowHeaders: ['Content-Type', 'Authorization'],
		allowMethods: ['POST', 'GET', 'OPTIONS'],
		exposeHeaders: ['Content-Length'],
		maxAge: 600,
		credentials: true,
	}),
);

app.use('*', async (c, next) => {

	// TODO: get from req header or smth
	c.set('user', session.user);
	c.set('session', session.session);
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
	const group = 3;
	const ouid = getItFromRequestSomehow();
	await env.freshmen68_queues.send({ count, group, ouid } satisfies PopMessage);
	return c.text("queued");
});

type Counts = Record<number | string, number>;

app.get("/game/stats/groups", async (c) => {
	const data = await env.KV.get(`group_count`, "json") as Counts | null;
	return c.json(data);
});

function getItFromRequestSomehow() {
	return "6666666666";
}

app.get("/game/stats/self", async (c) => {
	const id = getItFromRequestSomehow();
	const checksumDigit = id.charAt(8);
	const data = await env.KV.get(`count:${checksumDigit}`, "json") as Counts | null;
	console.log(checksumDigit, data);
	if (!data) {
		return c.text(0..toString());
	}
	return c.text(data[id].toString());
});


app.get("/game/", c => {
	return c.text("ok");
});

// we can actually make a instance of this for each groups
app.get("/durable-object/list-pop", async (c) => {
	const id = env.GAME_SERVER.idFromName("global");
	const server = env.GAME_SERVER.get(id);
	return c.json(await server.listPop());
});

app.get("/durable-object/pop", (c) => {
	const id = env.GAME_SERVER.idFromName("global");
	const server = env.GAME_SERVER.get(id);
	const ouid = getItFromRequestSomehow();
	const checksumDigit = ouid.charAt(8);

	server.addPop(8, ouid, 3);
	return c.text("queue");
});


// redirect all other requests to the frontend URL
// app.all('*', (c) => {
// 	return c.redirect(`${env.FRONTEND_URL || 'http://localhost:5173'}${c.req.path}`, 302);
// });

export { GameServer } from "./game";

export default class TRPCCloudflareWorkerExample extends WorkerEntrypoint {
	async fetch(request: Request): Promise<Response> {
		return app.fetch(request);
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
		const [popByGroup, popByUser] = await env.DB.batch([
			env.DB.prepare("SELECT group_id, SUM(amount) as total_pops FROM pops GROUP BY group_id"),
			env.DB.prepare("SELECT ouid, SUM(amount) as total_pops FROM pops")
		]);
		// set count:{uid} of every user
		type UserPops = {
			ouid: string,
			total_pops: number;
		};
		type GroupPops = {
			group_id: string,
			total_pops: number;
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


		// 24h * 60mins * 1 sum/minutes * 4 days * 10 objects = 57600 write
		const userRecords = Object.groupBy(
			popByUser.results as UserPops[],
			obj => obj.ouid.charAt(8)
		);

		for (const [chunkId, users] of Object.entries(userRecords)) {
			if (users) {
				const chunk = Object.fromEntries(users.map(it => [it.ouid, it.total_pops]));
				// console.log({ chunk });
				await env.KV.put(`count:${chunkId}`, JSON.stringify(chunk));
			}
		}

		const groups = popByGroup.results as GroupPops[];
		const record = Object.fromEntries(
			groups.map(it => [it.group_id, it.total_pops])
		);

		await env.KV.put(`group_count`, JSON.stringify(record));
		console.log("Pop stats by group:", record, userRecords);
	}
}
;
