import { sql } from './db';
import type { TrainingDriverInput, TrainingPass } from '../domain/training';

export type TrainingConfig = {
	gate_id: string | null;
	cooldown_ms: number;
	started_at: number | null;
};

export async function fetchTrainingConfig(): Promise<TrainingConfig> {
	const [row] = await sql<TrainingConfig[]>`
		SELECT gate_id, cooldown_ms, started_at FROM training WHERE id = 1
	`;
	if (!row) throw new Error('Training row missing');
	return {
		gate_id: row.gate_id,
		cooldown_ms: row.cooldown_ms,
		started_at: row.started_at !== null ? Number(row.started_at) : null
	};
}

// Loads every gate pass at the configured training gate since started_at,
// joined to drivers (by tag), and shapes them into per-driver inputs ready
// for the domain functions. Passes without a known driver are skipped.
export async function fetchTrainingDriverInputs(
	cfg: TrainingConfig
): Promise<TrainingDriverInput[]> {
	if (!cfg.gate_id || cfg.started_at === null) return [];

	type PassRow = {
		gate_event_id: number;
		timestamp: string;
		tag: string;
		driver_id: number | null;
		driver_name: string | null;
		class_id: number | null;
		class_name: string | null;
	};

	const rows = await sql<PassRow[]>`
		SELECT ge.id        AS gate_event_id,
		       ge.timestamp AS timestamp,
		       ge.tag       AS tag,
		       d.id         AS driver_id,
		       d.name       AS driver_name,
		       d.class_id   AS class_id,
		       c.name       AS class_name
		FROM gate_events ge
		LEFT JOIN drivers d ON d.tag = ge.tag
		LEFT JOIN classes c ON c.id = d.class_id
		WHERE ge.gate_id = ${cfg.gate_id}
		  AND ge.timestamp >= ${cfg.started_at}
		ORDER BY ge.timestamp ASC
	`;

	const byDriver = new Map<number, TrainingDriverInput>();
	for (const r of rows) {
		if (r.driver_id === null) continue;
		let input = byDriver.get(r.driver_id);
		if (!input) {
			input = {
				driver_id: r.driver_id,
				driver_name: r.driver_name ?? '—',
				class_id: r.class_id,
				class_name: r.class_name,
				tag: r.tag,
				passes: []
			};
			byDriver.set(r.driver_id, input);
		}
		const p: TrainingPass = {
			gate_event_id: r.gate_event_id,
			timestamp: Number(r.timestamp)
		};
		input.passes.push(p);
	}
	return [...byDriver.values()];
}
