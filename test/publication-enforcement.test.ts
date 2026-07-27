import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PUBLICATION_TOOL_ENFORCEMENT,
  assertPublicationToolEnforcementDescriptors,
  publicationToolEnforcementDescriptor,
} from "../src/publication/enforcement.ts";

test("every publication tool has a static enforcement descriptor", () => {
  assertPublicationToolEnforcementDescriptors(
    PUBLICATION_TOOL_ENFORCEMENT.map((descriptor) => descriptor.tool),
  );
});

test("the apply tool is consequential and admits the publication policy version", () => {
  const descriptor = publicationToolEnforcementDescriptor("voila_apply_publication_plan");
  assert.ok(descriptor);
  assert.equal(descriptor.consequential, true);
  assert.equal(descriptor.enforcementOwner, "publication_application");
  assert.ok(descriptor.effects.includes("repository_source_write"));
});

test("the create tool only writes plan artifacts, not the repository", () => {
  const descriptor = publicationToolEnforcementDescriptor("voila_create_publication_plan");
  assert.ok(descriptor);
  assert.equal(descriptor.consequential, false);
  assert.equal(descriptor.enforcementOwner, "publication_plan_creation");
  assert.ok(!descriptor.effects.includes("repository_source_write"));
});
