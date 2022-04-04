// @flow
import test from "ava";
import mockRequire from "mock-require";
import { waitForCondition } from "libs/utils";

import "test/sagas/saga_integration.mock";
import { __setupOxalis, createBucketResponseFunction } from "test/helpers/apiHelpers";
import { restartSagaAction, wkReadyAction } from "oxalis/model/actions/actions";
import Store from "oxalis/store";
import { hasRootSagaCrashed } from "oxalis/model/sagas/root_saga";

import { testLabelingManyBuckets } from "./bucket_eviction_helper";

const { discardSaveQueuesAction } = mockRequire.reRequire("oxalis/model/actions/save_actions");

test.beforeEach(async t => {
  // Setup oxalis, this will execute model.fetch(...) and initialize the store with the tracing, etc.
  Store.dispatch(restartSagaAction());
  Store.dispatch(discardSaveQueuesAction());

  await __setupOxalis(t, "volume");

  // Dispatch the wkReadyAction, so the sagas are started
  Store.dispatch(wkReadyAction());
});

test.serial(
  "Brushing/Tracing should not crash when a lot of buckets are labeled at once without saving inbetween",
  async t => {
    await t.context.api.tracing.save();

    t.context.mocks.Request.sendJSONReceiveArraybufferWithHeaders = createBucketResponseFunction(
      Uint16Array,
      0,
      0,
    );
    // In earlier versions of webKnossos, buckets could be evicted forcefully when
    // too many were dirty at the same time. This led to a crash in earlier versions.
    // Now, the code should not crash, anymore.
    t.plan(2);
    t.false(hasRootSagaCrashed());
    const failedSagaPromise = waitForCondition(hasRootSagaCrashed, 500);
    await Promise.race([testLabelingManyBuckets(t, false), failedSagaPromise]);
    t.false(hasRootSagaCrashed());
  },
);