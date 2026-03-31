export type RankedDriverRally = {
	rally_id: string;
	rally_name: string;
	driver_uuid: string;
	driver_name: string;
	class_id: number;
	class_name: string;
	position: number;
};

export type RallyPointsEntry = {
	rally_id: string;
	rally_name: string;
	points: number;
	position: number;
};

export type DriverStanding = {
	driver_uuid: string;
	driver_name: string;
	class_id: number;
	class_name: string;
	total_points: number;
	rally_points: RallyPointsEntry[];
};

export function calculateStandings(
	ranked: RankedDriverRally[],
	getPoints: (position: number) => number
): DriverStanding[] {
	const map = new Map<string, DriverStanding>();

	for (const row of ranked) {
		const { driver_uuid, driver_name, class_id, class_name, rally_id, rally_name, position } = row;
		const points = getPoints(position);

		if (!map.has(driver_uuid)) {
			map.set(driver_uuid, {
				driver_uuid,
				driver_name,
				class_id,
				class_name,
				total_points: 0,
				rally_points: []
			});
		}

		const standing = map.get(driver_uuid)!;
		standing.total_points += points;
		standing.rally_points.push({ rally_id, rally_name, points, position });
	}

	return [...map.values()].sort((a, b) => {
		if (a.class_name !== b.class_name) return a.class_name.localeCompare(b.class_name);
		return b.total_points - a.total_points;
	});
}
