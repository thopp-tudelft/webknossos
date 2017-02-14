/**
 * temporal_bucket_manager.js
 * @flow weak
 */

import _ from "lodash";
import PullQueue, { PullQueueConstants } from "oxalis/model/binary/pullqueue";
import PushQueue from "oxalis/model/binary/pushqueue";


class TemporalBucketManager {
  // Manages temporal buckets (i.e., buckets created for annotation where
  // the original bucket has not arrived from the server yet) and handles
  // their special treatment.

  pullQueue: PullQueue;
  pushQueue: PushQueue;
  loadedPromises: Array<Promise<void>>;

  constructor(pullQueue, pushQueue) {
    this.pullQueue = pullQueue;
    this.pushQueue = pushQueue;
    this.loadedPromises = [];
  }


  getCount() {
    return this.loadedPromises.length;
  }


  addBucket(bucket) {
    this.pullBucket(bucket);
    return this.loadedPromises.push(this.makeLoadedPromise(bucket));
  }


  pullBucket(bucket) {
    this.pullQueue.add({
      bucket: bucket.zoomedAddress,
      priority: PullQueueConstants.PRIORITY_HIGHEST,
    });
    return this.pullQueue.pull();
  }


  makeLoadedPromise(bucket) {
    const loadedPromise = new Promise(
      (resolve, _reject) => bucket.on("bucketLoaded", () => {
        if (bucket.dirty) {
          this.pushQueue.insert(bucket.zoomedAddress);
        }

        this.loadedPromises = _.without(this.loadedPromises, loadedPromise);
        return resolve();
      },
    ));
    return loadedPromise;
  }


  getAllLoadedPromise() {
    return Promise.all(this.loadedPromises);
  }
}


export default TemporalBucketManager;
