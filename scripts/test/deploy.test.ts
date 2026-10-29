/**
 * Where the server runs (src/lib/deploy): the real site never shows sample
 * data, a workbench does.
 *
 *   npx tsx --conditions=react-server --test scripts/test/deploy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLive, sampleAllowed } from "../../src/lib/deploy";

const env = process.env as Record<string, string | undefined>;

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, env[k]]));
  Object.assign(env, vars);
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete env[k];
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete env[k];
    else env[k] = v;
  }
}

test("the real site, and its previews, never show sample data", () => {
  withEnv({ NODE_ENV: "production", SITE_URL: "https://elliotmoreau.fr", EM_NO_FIXTURES: undefined }, () => {
    assert.equal(isLive(), true);
    assert.equal(sampleAllowed(), false);
  });
  withEnv({ NODE_ENV: "production", SITE_URL: "https://pr-21-site.elliotmoreau.fr" }, () => assert.equal(sampleAllowed(), false));
});

test("a workbench does, unless asked not to", () => {
  withEnv({ NODE_ENV: "development", SITE_URL: "https://elliotmoreau.fr", EM_NO_FIXTURES: undefined }, () => assert.equal(sampleAllowed(), true));
  withEnv({ NODE_ENV: "production", SITE_URL: undefined, EM_NO_FIXTURES: undefined }, () => assert.equal(sampleAllowed(), true));
  withEnv({ NODE_ENV: "production", SITE_URL: "http://localhost:3000", EM_NO_FIXTURES: undefined }, () => assert.equal(sampleAllowed(), true));
  withEnv({ NODE_ENV: "production", SITE_URL: "http://localhost:3000", EM_NO_FIXTURES: "1" }, () => assert.equal(sampleAllowed(), false));
});
