import { net, protocol } from "electron";
import url from "node:url";

function withCors(response: Promise<Response> | Response): Promise<Response> | Response {
  // Adiciona CORS para que o canvas do renderer (ex.: color.js → cor dominante
  // das capas em cache) consiga ler os pixels via getImageData.
  const apply = (res: Response): Response => {
    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(res.body, { status: res.status, headers });
  };
  if (response instanceof Promise) return response.then(apply);
  return apply(response);
}

export function registerProtocols() {
  protocol.handle("local", (request) => {
    const filePath = request.url.slice("local:".length);
    return withCors(
      net.fetch(url.pathToFileURL(decodeURI(filePath)).toString())
    );
  });

  protocol.handle("gradient", (request) => {
    const gradientCss = decodeURIComponent(
      request.url.slice("gradient:".length)
    );

    let direction = "45deg";
    let color1 = "#4a90e2";
    let color2 = "#7b68ee";

    if (
      gradientCss.startsWith("linear-gradient(") &&
      gradientCss.endsWith(")")
    ) {
      const content = gradientCss.slice(16, -1);
      const parts = content.split(",").map((part) => part.trim());

      if (parts.length >= 3) {
        direction = parts[0];
        color1 = parts[1];
        color2 = parts[2];
      }
    }

    let x1 = "0%", y1 = "0%", x2 = "100%", y2 = "100%";

    if (direction === "to right") {
      y2 = "0%";
    } else if (direction === "to bottom") {
      x2 = "0%";
    } else if (direction === "45deg") {
      y1 = "100%";
      y2 = "0%";
    } else if (direction === "225deg") {
      x1 = "100%";
      x2 = "0%";
    } else if (direction === "315deg") {
      x1 = "100%";
      y1 = "100%";
      x2 = "0%";
      y2 = "0%";
    }

    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <defs>
          <linearGradient id="grad" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
            <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)" />
      </svg>
    `;

    return new Response(svgContent, {
      headers: { "Content-Type": "image/svg+xml" },
    });
  });
}
