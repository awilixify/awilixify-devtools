export function getServiceColor(serviceName: string): string {
	let hash = 2166136261;

	for (const character of serviceName) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}

	const hue = Math.abs(hash) % 360;
	return `hsl(${hue} 58% 46%)`;
}

export function getServiceBackgroundColor(serviceName: string): string {
	return `color-mix(in srgb, ${getServiceColor(serviceName)} 6%, transparent)`;
}

export function getServiceBorderColor(serviceName: string): string {
	return `color-mix(in srgb, ${getServiceColor(serviceName)} 42%, transparent)`;
}
