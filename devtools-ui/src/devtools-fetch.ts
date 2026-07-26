import { getActiveTargetBasePath } from "./modules/targets/target-routing";

const DEVTOOLS_API_PATH = "/__devtools";
const DEVTOOLS_BASE_PATH = Symbol("devtoolsBasePath");

type DevtoolsRequestInit = RequestInit & {
	[DEVTOOLS_BASE_PATH]?: string;
};

export function withDevtoolsBasePath(
	basePath: string,
	init: RequestInit = {},
): DevtoolsRequestInit {
	return {
		...init,
		[DEVTOOLS_BASE_PATH]: basePath,
	};
}

export async function devtoolsFetch<T>(
	url: string,
	options: RequestInit = {},
): Promise<T> {
	const requestOptions = options as DevtoolsRequestInit;
	const { [DEVTOOLS_BASE_PATH]: requestedBasePath, ...fetchOptions } =
		requestOptions;
	const basePath = requestedBasePath ?? getActiveTargetBasePath();
	const requestUrl = url.startsWith(DEVTOOLS_API_PATH)
		? `${basePath}${url.slice(DEVTOOLS_API_PATH.length)}`
		: url;
	const response = await fetch(requestUrl, fetchOptions);
	const body = [204, 205, 304].includes(response.status)
		? null
		: await response.text();

	if (!response.ok) {
		throw new Error(
			`DevTools request to ${requestUrl} failed with ${response.status} ${response.statusText}`,
		);
	}

	return (body ? JSON.parse(body) : {}) as T;
}
