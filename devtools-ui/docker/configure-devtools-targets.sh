#!/bin/sh

set -eu

targets_yaml="${DEVTOOLS_TARGETS:-}"

if [ -z "$targets_yaml" ]; then
	echo "DEVTOOLS_TARGETS is required" >&2
	exit 1
fi

root_tag="$(printf '%s\n' "$targets_yaml" | yq eval 'tag' -)"
target_count="$(printf '%s\n' "$targets_yaml" | yq eval 'length' -)"

if [ "$root_tag" != "!!seq" ] || [ "$target_count" -eq 0 ]; then
	echo "DEVTOOLS_TARGETS must be a non-empty YAML list" >&2
	exit 1
fi

locations_file="/etc/nginx/devtools-targets.locations"
: > "$locations_file"
seen_service_names=" "
index=0

while [ "$index" -lt "$target_count" ]; do
	service_name_tag="$(printf '%s\n' "$targets_yaml" | yq eval ".[$index].serviceName | tag" -)"
	url_tag="$(printf '%s\n' "$targets_yaml" | yq eval ".[$index].url | tag" -)"

	if [ "$service_name_tag" != "!!str" ] || [ "$url_tag" != "!!str" ]; then
		echo "Each target must contain string serviceName and url values" >&2
		exit 1
	fi

	service_name="$(printf '%s\n' "$targets_yaml" | yq eval -r ".[$index].serviceName" -)"
	url="$(printf '%s\n' "$targets_yaml" | yq eval -r ".[$index].url" -)"
	url="${url%/}"

	case "$service_name" in
		"" | *[!a-z0-9-]* | -* | *- | *--*)
			echo "Service names must contain lowercase letters, numbers, and single hyphens only" >&2
			exit 1
			;;
	esac

	case "$seen_service_names" in
		*" $service_name "*)
			echo "Service names must be unique" >&2
			exit 1
			;;
	esac

	case "$url" in
		http://*) authority="${url#http://}" ;;
		https://*) authority="${url#https://}" ;;
		*)
			echo "Target URLs must use HTTP or HTTPS" >&2
			exit 1
			;;
	esac

	case "$authority" in
		"" | */* | *[!a-zA-Z0-9._:-]*)
			echo "Target URLs must contain only a host and optional port" >&2
			exit 1
			;;
	esac

	seen_service_names="$seen_service_names$service_name "

	{
		echo "location ^~ /__devtools/$service_name/app/ {"
		echo "	rewrite ^/__devtools/$service_name/app/(.*)\$ /\$1 break;"
		echo "	proxy_pass $url;"
		echo '	proxy_http_version 1.1;'
		echo '	proxy_set_header Host $proxy_host;'
		echo '	proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'
		echo '	proxy_set_header X-Forwarded-Host $host;'
		echo '	proxy_set_header X-Forwarded-Proto $scheme;'
		echo "}"
		echo
		echo "location ^~ /__devtools/$service_name/api/ {"
		echo "	rewrite ^/__devtools/$service_name/api/(.*)\$ /__devtools/\$1 break;"
		echo "	proxy_pass $url;"
		echo '	proxy_http_version 1.1;'
		echo '	proxy_set_header Host $proxy_host;'
		echo '	proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'
		echo '	proxy_set_header X-Forwarded-Host $host;'
		echo '	proxy_set_header X-Forwarded-Proto $scheme;'
		echo "}"
	} >> "$locations_file"

	index=$((index + 1))
done

{
	printf 'window.__AWILIXIFY_DEVTOOLS_TARGETS__ = '
	printf '%s\n' "$targets_yaml" | yq eval -o=json -I=0 \
		'map({"serviceName": .serviceName, "basePath": "/__devtools/" + .serviceName + "/api"})' -
	printf ';\n'
} > /usr/share/nginx/html/devtools-targets.js
