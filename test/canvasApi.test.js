import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCanvasJson, fetchFolderPath, createCachedLookup } from "../lib/canvasApi.js";

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = routes[url];
    if (r instanceof Error) throw r;
    if (!r) return { ok: false, status: 404, text: async () => "" };
    return { ok: r.status ? r.status < 400 : true, status: r.status ?? 200, text: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

const API = "https://cool.ntu.edu.tw/api/v1";

describe("parseCanvasJson", () => {
  test("去掉 while(1); 前綴", () => {
    assert.deepEqual(parseCanvasJson('while(1);{"a":1}'), { a: 1 });
  });
  test("沒有前綴也能解析", () => {
    assert.deepEqual(parseCanvasJson('{"a":1}'), { a: 1 });
  });
});

describe("fetchFolderPath", () => {
  test("正常流程：file → folder → full_name", async () => {
    const f = fakeFetch({
      [`${API}/files/5`]: { body: 'while(1);{"id":5,"folder_id":77,"display_name":"hw1.pdf"}' },
      [`${API}/folders/77`]: { body: 'while(1);{"id":77,"full_name":"course files/作業"}' },
    });
    assert.equal(await fetchFolderPath("5", { fetch: f }), "course files/作業");
    assert.equal(f.calls.length, 2);
    for (const c of f.calls) {
      assert.equal(c.init.method, "GET");
      assert.equal(c.init.credentials, "include");
      assert.ok(c.url.startsWith("https://cool.ntu.edu.tw/"), "只能打 COOL 網域");
    }
  });

  test("非數字 fileId 直接拒絕，不發請求", async () => {
    const f = fakeFetch({});
    for (const bad of ["../users/self", "5?x=1", "", "1e3", 5, null]) {
      assert.equal(await fetchFolderPath(bad, { fetch: f }), null, String(bad));
    }
    assert.equal(f.calls.length, 0);
  });

  test("未登入或沒權限（401/403）→ null", async () => {
    const f = fakeFetch({ [`${API}/files/5`]: { status: 401, body: '{"errors":[]}' } });
    assert.equal(await fetchFolderPath("5", { fetch: f }), null);
  });

  test("網路錯誤 → null", async () => {
    const f = fakeFetch({ [`${API}/files/5`]: new TypeError("Failed to fetch") });
    assert.equal(await fetchFolderPath("5", { fetch: f }), null);
  });

  test("回傳不是 JSON（例如被導到登入頁 HTML）→ null", async () => {
    const f = fakeFetch({ [`${API}/files/5`]: { body: "<html>login</html>" } });
    assert.equal(await fetchFolderPath("5", { fetch: f }), null);
  });

  test("folder_id 格式異常不會拿去組網址", async () => {
    const f = fakeFetch({ [`${API}/files/5`]: { body: '{"folder_id":"../../users/self"}' } });
    assert.equal(await fetchFolderPath("5", { fetch: f }), null);
    assert.equal(f.calls.length, 1);
  });

  test("full_name 不是字串 → null", async () => {
    const f = fakeFetch({
      [`${API}/files/5`]: { body: '{"folder_id":1}' },
      [`${API}/folders/1`]: { body: '{"full_name":null}' },
    });
    assert.equal(await fetchFolderPath("5", { fetch: f }), null);
  });

  test("逾時 → null", async () => {
    const hang = (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const t0 = Date.now();
    assert.equal(await fetchFolderPath("5", { fetch: hang, timeoutMs: 50 }), null);
    assert.ok(Date.now() - t0 < 1000);
  });
});

describe("createCachedLookup", () => {
  test("成功結果會快取，失敗不快取", async () => {
    let n = 0;
    const lookup = createCachedLookup(async (id) => {
      n++;
      return id === "ok" ? "course files/講義" : null;
    });
    await lookup("ok");
    await lookup("ok");
    await lookup("bad");
    await lookup("bad");
    assert.equal(n, 3);
  });

  test("超過上限時淘汰最舊的", async () => {
    let n = 0;
    const lookup = createCachedLookup(async (id) => {
      n++;
      return `p${id}`;
    }, 2);
    await lookup("1");
    await lookup("2");
    await lookup("3"); // 淘汰 1
    await lookup("1");
    assert.equal(n, 4);
  });
});
