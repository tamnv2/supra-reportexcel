import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import worker from "../src/worker.mjs";
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", {value:webcrypto});
const env = {RELEASES: {head: async () => null}};
const req = (path, method = "GET", token) => new Request("https://example.invalid" + path, {method, headers:token ? {Authorization:"Bearer " + token} : {}});
test("healthy with R2 available", async () => {
  const r = await worker.fetch(req("/health"), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {service:"supra-reportexcel",status:"ok",storage:"ready",channel:"acceptance",worker_version:1,updates_enabled:false});
});
test("missing binding", async () => assert.equal((await worker.fetch(req("/health"), {})).status, 503));
test("R2 failure", async () => assert.equal((await worker.fetch(req("/health"), {RELEASES:{head:async()=>{throw Error("offline")}}})).status,503));
test("HEAD", async () => assert.equal(await (await worker.fetch(req("/health","HEAD"),env)).text(),""));
test("no releases even if storage has a manifest", async () => assert.equal((await worker.fetch(req("/manifest.json"),{RELEASES:{head:async()=>({})}})).status,404));
test("artifact not exposed", async () => assert.equal((await worker.fetch(req("/releases/example.bin"),env)).status,404));
test("reject writes", async () => assert.equal((await worker.fetch(req("/health","POST"),env)).status,405));

// Synthetic fixtures only; never use real access credentials in tests.
const token = "A".repeat(43), object = "a".repeat(64);
function fixture() {
  const keys = [];
  const bodies = {"acceptance/manifest.json":"test-manifest",["acceptance/objects/"+object]:"test-object"};
  const env = {ACCEPTANCE_ENABLED:"1",ACCEPTANCE_ACCESS_SHA256:createHash("sha256").update(token).digest("hex"),RELEASES:{
    async head(k) {keys.push(k);return k in bodies ? {size:bodies[k].length} : null;},
    async get(k) {keys.push(k);return k in bodies ? {size:bodies[k].length,body:new Response(bodies[k]).body} : null;}
  }};
  return {env,keys};
}
test("missing secret or disabled channel fails closed", async () => {
  for (const field of ["ACCEPTANCE_ENABLED","ACCEPTANCE_ACCESS_SHA256"]) {
    const f = fixture(); delete f.env[field];
    for (const path of ["/manifest.json","/objects/"+object]) assert.equal((await worker.fetch(req(path,"GET",token),f.env)).status,404);
    assert.deepEqual(f.keys,[]);
  }
});
test("unauthorized requests never read R2", async () => {
  const f = fixture();
  for (const path of ["/manifest.json","/objects/"+object]) for (const t of [undefined,"B".repeat(43)]) assert.equal((await worker.fetch(req(path,"GET",t),f.env)).status,401);
  assert.deepEqual(f.keys,[]);
});
test("authenticated reads only acceptance keys", async () => {
  const f = fixture();
  for (const [path,body] of [["/manifest.json","test-manifest"],["/objects/"+object,"test-object"]]) {
    const r = await worker.fetch(req(path,"GET",token),f.env);
    assert.equal(r.status,200); assert.equal(await r.text(),body); assert.equal(r.headers.get("cache-control"),"no-store");
  }
  assert.deepEqual(f.keys,["acceptance/manifest.json","acceptance/objects/"+object]);
});
test("authenticated HEAD and missing object", async () => {
  const f = fixture(); const r = await worker.fetch(req("/objects/"+object,"HEAD",token),f.env);
  assert.equal(r.status,200); assert.equal(r.headers.get("content-length"),"11"); assert.equal(await r.text(),"");
  assert.equal((await worker.fetch(req("/objects/"+"b".repeat(64),"GET",token),f.env)).status,404);
});
test("oversize and invalid paths rejected", async () => {
  const f = fixture(); f.env.RELEASES.head=async()=>({size:65*1024*1024});
  assert.equal((await worker.fetch(req("/objects/"+object,"HEAD",token),f.env)).status,503);
  assert.equal((await worker.fetch(req("/objects/manifest.json","GET",token),f.env)).status,404);
  assert.equal((await worker.fetch(req("/publish/manifest.json","PUT",token),f.env)).status,405);
});
test("health confirms active acceptance manifest", async () => {
  const f = fixture(); const r = await worker.fetch(req("/health"),f.env);
  assert.deepEqual(await r.json(),{service:"supra-reportexcel",status:"ok",storage:"ready",channel:"acceptance",worker_version:1,updates_enabled:true});
  assert.deepEqual(f.keys,["acceptance/manifest.json"]);
});
