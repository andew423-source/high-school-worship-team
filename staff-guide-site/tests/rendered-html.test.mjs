import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("스탭 운영 가이드 핵심 흐름을 렌더링한다", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /고등부 찬양팀 스탭 운영 가이드/);
  assert.match(html, /604호 앞에서 계속 대기/);
  assert.match(html, /복귀자 확인 후/);
  assert.match(html, /길하진/);
  assert.match(html, /수련회팀/);
  assert.match(html, /주사위 1개와 말 8개/);
  assert.match(html, /뒤로 한 칸/);
  assert.doesNotMatch(html, /김하진|한 번 패스 가능|10–20초/);
});
