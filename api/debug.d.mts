//#region src/debug.d.ts
/**
 * Install diag-flavored `util.inspect.custom` and `toJSON` hooks onto the
 * shared `Cbor` prototype. Idempotent; affects every `Cbor` value in the
 * realm (they share one prototype).
 */
export declare const installDebugHooks: () => void;
//#endregion
//# sourceMappingURL=debug.d.mts.map