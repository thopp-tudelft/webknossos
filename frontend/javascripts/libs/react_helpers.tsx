import React, { useState, useEffect, useRef } from "react";
import { useStore } from "react-redux";
import type { OxalisState } from "oxalis/store";

// From https://overreacted.io/making-setinterval-declarative-with-react-hooks/
export function useInterval(
  callback: Function,
  delay: number | null | undefined,
  ...additionalDependencies: Array<any>
) {
  const savedCallback = useRef<Function>();
  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  });
  // Set up the interval.
  useEffect(() => {
    function tick() {
      if (savedCallback.current != null) savedCallback.current();
    }

    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }

    return undefined;
  }, [delay, ...additionalDependencies]);
}
export function useFetch<T>(
  fetchFn: () => Promise<T>,
  defaultValue: T,
  dependencies: Array<any>,
): T {
  const [value, setValue] = useState(defaultValue);

  const fetchValue = async () => {
    const fetchedValue = await fetchFn();
    setValue(fetchedValue);
  };

  useEffect(() => {
    fetchValue();
  }, dependencies);
  return value;
}

/*
  Instead of recomputing derived values on every store change,
  this hook throttles such computations at a given interval.
  This is done by checking whether the store changed in a polling
  manner.
  Only use this if your component doesn't need high frequency
  updates.
 */
export function usePolledState(callback: (arg0: OxalisState) => void, interval: number = 1000) {
  const store = useStore();
  const oldState = useRef(null);
  useInterval(() => {
    const state = store.getState();

    if (oldState.current === state) {
      return;
    }

    oldState.current = state;
    callback(state);
  }, interval);
}

export function makeComponentLazy<T extends { isOpen: boolean }>(
  ComponentFn: React.ComponentType<T>,
): React.ComponentType<T> {
  return function LazyModalWrapper(props: T) {
    const [hasBeenInitialized, setHasBeenInitialized] = useState(false);
    const isOpen = props.isOpen;
    useEffect(() => {
      setHasBeenInitialized(hasBeenInitialized || isOpen);
    }, [isOpen]);

    if (isOpen || hasBeenInitialized) {
      return <ComponentFn {...props} />;
    }
    return null;
  };
}

export default {};
