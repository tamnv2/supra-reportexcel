import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.mjs";
const env = {RELEASES: {head: async () => null}};
const req = (path, method = "GET") => new Request("https://updatereportexcel.supra.cc.cd" + path, {method});
test("healthy with R2 available", async () => {
  const r = await worker.fetch(req("/health"), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {service:"supra-reportexcel",status:"ok",storage:"ready",updates_enabled:false});
});
test("missing binding", async () => assert.equal((await worker.fetch(req("/health"), {})).status, 503));
test("R2 failure", async () => assert.equal((await worker.fetch(req("/health"), {RELEASES:{head:async()=>{throw Error("offline")}}})).status,503));
test("HEAD", async () => assert.equal(await (await worker.fetch(req("/health","HEAD"),env)).text(),""));
test("no releases even if storage has a manifest", async () => assert.equal((await worker.fetch(req("/manifest.json"),{RELEASES:{head:async()=>({})}})).status,404));
test("artifact not exposed", async () => assert.equal((await worker.fetch(req("/releases/1.7.0/_SupraCore.exe"),env)).status,404));
test("reject writes", async () => assert.equal((await worker.fetch(req("/health","POST"),env)).status,405));
