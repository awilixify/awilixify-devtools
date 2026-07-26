import type { ReactNode } from "react";

type IconProps = {
	color?: string;
	size?: number;
};

function Icon({
	children,
	color,
	size = 20,
}: IconProps & { children: ReactNode }) {
	return (
		<svg
			aria-hidden="true"
			color={color}
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width={size}
		>
			{children}
		</svg>
	);
}

export function GraphIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<circle cx="6" cy="6" r="3" />
			<circle cx="18" cy="6" r="3" />
			<circle cx="12" cy="18" r="3" />
			<path d="M8.7 7.4 10.8 15" />
			<path d="m15.3 7.4-2.1 7.6" />
		</Icon>
	);
}

export function RoutesIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M4 7h16" />
			<path d="M4 17h16" />
			<path d="M7 4v6" />
			<path d="M17 14v6" />
		</Icon>
	);
}

export function TargetsIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<rect height="6" rx="1" width="18" x="3" y="3" />
			<rect height="6" rx="1" width="18" x="3" y="15" />
			<path d="M7 6h.01M7 18h.01" />
		</Icon>
	);
}

export function CheckIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="m5 12 4 4L19 6" />
		</Icon>
	);
}

export function RefreshIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M20 11a8 8 0 0 0-14.8-4M4 4v5h5" />
			<path d="M4 13a8 8 0 0 0 14.8 4M20 20v-5h-5" />
		</Icon>
	);
}

export function ServerIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<rect height="7" rx="1" width="18" x="3" y="3" />
			<rect height="7" rx="1" width="18" x="3" y="14" />
			<path d="M7 6.5h.01M7 17.5h.01" />
		</Icon>
	);
}

export function ServerOffIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M5 5h13a3 3 0 0 1 3 3v1H9M3 8v1h2" />
			<path d="M3 15v1a3 3 0 0 0 3 3h13" />
			<path d="m3 3 18 18" />
		</Icon>
	);
}

export function FilterIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M4 5h16" />
			<path d="M7 12h10" />
			<path d="M10 19h4" />
		</Icon>
	);
}
