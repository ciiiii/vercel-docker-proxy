import { Hono } from "hono";
import { handle } from "hono/vercel";
import { env } from "hono/adapter";
import { appendTrailingSlash } from "hono/trailing-slash";
import { fetchToken, parseAuthenticate } from "./util";
import { routeByHosts, routes } from "./route";

export const config = {
  runtime: "edge",
};
type Variables = {
  url: URL;
  upstream: string;
  debug: boolean;
};

const app = new Hono<{ Variables: Variables }>({ strict: true }).basePath(
  "/v2/"
);

app.use(appendTrailingSlash());
app.use(async (c, next) => {
  const { DEBUG, UPSTREAM } = env(c);
  const url = new URL(c.req.url);
  if (DEBUG && UPSTREAM) {
    c.set("debug", true);
    c.set("url", url);
    c.set("upstream", UPSTREAM as string);
  } else {
    const hostname = url.hostname;
    const upstream = routeByHosts(hostname);
    if (upstream === "") {
      return new Response(
        JSON.stringify({
          routes: routes,
          message: `no upstream defined in routes for the host "${hostname}"`,
        }),
        {
          status: 404,
        }
      );
    }
    c.set("debug", false);
    c.set("url", url);
    c.set("upstream", upstream);
  }
  await next();
});

app.all("/", async (c) => {
  const newUrl = new URL(c.get("upstream") + "/v2/");
  const resp = await fetch(newUrl.toString(), {
    method: "GET",
    redirect: "follow",
  });
  if (resp.status === 200) {
    return resp;
  } else if (resp.status === 401) {
    const headers = new Headers();
    const realm = `${c.get("url").origin}/v2/auth`;
    headers.set(
      "Www-Authenticate",
      `Bearer realm="${realm}",service="vercel-docker-proxy"`
    );
    return new Response(JSON.stringify({ message: "UNAUTHORIZED" }), {
      status: 401,
      headers: headers,
    });
  } else {
    return resp;
  }
});

app.all("/auth", async (c) => {
  const newUrl = new URL(c.get("upstream") + "/v2/");
  const resp = await fetch(newUrl.toString(), {
    method: "GET",
    redirect: "follow",
  });
  if (resp.status !== 401) {
    return resp;
  }
  const authenticateStr = resp.headers.get("WWW-Authenticate");
  if (authenticateStr === null) {
    return resp;
  }
  const wwwAuthenticate = parseAuthenticate(authenticateStr);
  return await fetchToken(wwwAuthenticate, c.get("url").searchParams);
});

app.all("*", async (c) => {
  console.log(c.req.url.toString());
  const newUrl = new URL(c.get("upstream") + c.get("url").pathname);
  let headers = new Headers();
  const authHeader = c.req.raw.headers.get("Authorization");
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }
  const acceptHeader = c.req.raw.headers.get("Accept");
  if (acceptHeader) {
    headers.set("Accept", acceptHeader);
  }
  const contentTypeHeader = c.req.raw.headers.get("Content-Type");
  if (contentTypeHeader) {
    headers.set("Content-Type", contentTypeHeader);
  }
  const newReq = new Request(newUrl, {
    method: c.req.method,
    headers: headers,
    redirect: "follow",
  });
  return await fetch(newReq);
});

app.notFound(async (c) => {
  return new Response("Page Not Found", { status: 404 });
});

export default handle(app);
