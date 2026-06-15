/** Minimal structured (JSON-line) logger for stdout — k8s-log friendly, no deps. */
type Fields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', msg: string, fields?: Fields): void {
	const line = { level, time: new Date().toISOString(), msg, ...fields };
	const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
	out(JSON.stringify(line));
}

export const log = {
	info: (msg: string, fields?: Fields) => emit('info', msg, fields),
	warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
	error: (msg: string, fields?: Fields) => emit('error', msg, fields)
};
