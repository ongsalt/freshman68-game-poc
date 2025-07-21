import { env } from "cloudflare:workers";
import type { GameRegionHandler } from "./region-handler";

export type GameRegion = {
	groupNumber: number;
	handler: DurableObjectStub<GameRegionHandler>;
};

export function getAllRegionHandlers(): GameRegion[] {
	return [1, 3, 4, 5, 6, 7].map(i => ({
		groupNumber: i,
		handler: env.GAME_REGION_HANDLER.get(env.GAME_REGION_HANDLER.idFromName(`group:${i}`))
	}));
}

export async function getPopByGroups() {
	const scores = await Promise.all(
		getAllRegionHandlers()
			.map(async (it) => {
				return [
					it.groupNumber,
					await it.handler.getTotalScore()
				];
			})
	);

	return Object.fromEntries(scores) as Record<number, number>;
}
