import { env } from "cloudflare:workers";
import type { GameRegionHandler } from "./region-handler";

export type GameRegion = {
	groupNumber: number;
	handler: DurableObjectStub<GameRegionHandler>;
};

export const groupNumbers = [1, 3, 4, 5, 6, 7];

export function getRegionHandler(groupNumber: number) {
	if (!groupNumbers.includes(groupNumber)) {
		throw new Error(`${groupNumber} dont exist`);
	}
	return env.GAME_REGION_HANDLER.get(env.GAME_REGION_HANDLER.idFromName(`group:${groupNumber}`));
}

export function getAllRegionHandlers(): GameRegion[] {
	return groupNumbers.map(i => ({
		groupNumber: i,
		handler: getRegionHandler(i)
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
