function parseAuthenticate(authenticateStr: string) {
  // sample: Bearer realm="https://auth.ipv6.docker.com/token",service="registry.docker.io"
  // match strings after =" and before "
  const re = /(?<=\=")(?:\\.|[^"\\])*(?=")/g;
  const matches = authenticateStr.match(re);
  if (matches === null || matches.length < 2) {
    throw new Error(`invalid Www-Authenticate Header: ${authenticateStr}`);
  }
  return {
    realm: matches[0],
    service: matches[1],
  } as WwwAuthenticate;
}

interface WwwAuthenticate {
    realm: string;
    service: string;
}

async function fetchToken(wwwAuthenticate: WwwAuthenticate, searchParams: URLSearchParams) {
  const url = new URL(wwwAuthenticate.realm);
  if (wwwAuthenticate.service.length) {
    url.searchParams.set("service", wwwAuthenticate.service);
  }
  const scope = searchParams.get("scope")
  if (scope) {
    url.searchParams.set("scope", scope);
  }
  return await fetch(url, { method: "GET", headers: {} });
}

export { parseAuthenticate, fetchToken };