# Blockchain Commons Deterministic CBOR ("dCBOR")

### _by Leonardo Custodio_

**`bc-dcbor-ts`** is a [CBOR](https://cbor.io) codec for TypeScript that focuses on writing and parsing _deterministic_ CBOR per IETF [draft-mcnally-deterministic-cbor](https://datatracker.ietf.org/doc/draft-mcnally-deterministic-cbor). It deliberately does **not** support the parts of the CBOR spec that are forbidden by deterministic encoding (such as indefinite-length arrays and maps), and it is strict in both what it writes and what it reads: it returns decoding errors when variable-length integers are not encoded in their minimal form, when CBOR map keys are not in lexicographic order, or when there is extra data past the end of the decoded item.

## Installation Instructions

[@blockchaincommons/dcbor](https://www.npmjs.com/package/@blockchaincommons/dcbor) is published to npm. Install it with your package manager of choice:

```sh
npm install @blockchaincommons/dcbor
# or
pnpm add @blockchaincommons/dcbor
# or
yarn add @blockchaincommons/dcbor
# or
bun add @blockchaincommons/dcbor
```

## Usage Instructions

The entire public surface can be introduced in about a minute:

```typescript
import {
  cbor, encodeCbor, decodeCbor, tryDecode, taggedValue,
  isMap, asText, expectArray, extractCbor, CborMap, CborDate,
} from "@blockchaincommons/dcbor";
import { diagnostic, hexAnnotated } from "@blockchaincommons/dcbor/diagnostic";

// Construct: cbor() is the single polymorphic constructor.
const value = cbor({ name: "Alice", scores: [98, 87], active: true });
const dated = taggedValue(1, 1675854714); // the only tagged-value constructor

// Encode: deterministic bytes - equal values always encode identically.
const bytes = encodeCbor(value); // Uint8Array<ArrayBuffer>

// Decode: decodeCbor throws CborError; tryDecode returns a Result.
const decoded = decodeCbor(bytes);
const result = tryDecode(bytes); // { ok: true, value } | { ok: false, error }

// Read: fixed prefix semantics.
isMap(decoded);          // is*     -> type-narrowing boolean guard
asText(decoded);         // as*     -> T | undefined
expectArray(decoded);    // expect* -> T, or throws CborError
extractCbor(decoded);    // explicit native extraction (CborNative)

// Format (subpath - never rides on the value prototype):
diagnostic(decoded, { annotate: true });
hexAnnotated(decoded);
```

Runnable examples live in the [`examples/`](https://github.com/BlockchainCommons/bc-dcbor-ts/tree/master/examples) directory.

## Status - Beta

`bc-dcbor-ts` is currently under active development and in beta testing. It should not be used for production tasks until it has had further testing and auditing. See [Blockchain Commons' Development Phases](https://github.com/BlockchainCommons/Community/blob/master/release-path.md).

### Version History

- **Unreleased** - Closes every observable difference from `dcbor` 0.25.2: decoding keeps a leading U+FEFF; `cbor(string)` keeps the string and the encoder normalizes to NFC; `InvalidUtf8` messages mirror `core::str::Utf8Error`; float heads follow the reference's canonicality predicates (a whole f32 head at or beyond 2^31 decodes to an integer); float diagnostics round exact decimal ties like Rust; `CborDate` holds seconds plus nanoseconds (leap seconds display as `:60`, `NaN` is the epoch); `WrongTag` names both tags; `cborEquals` is structural; `registerStandardTags` registers unconditionally, tags are frozen and the global store is one per process across ESM and CJS; `expectUnsigned` gains fixed-width extraction and `TagsStore.clone()` is added. The Rust harness runs two builds over encode, decode (with messages), format, date and unsigned vectors, in CI. See `CHANGELOG.md` and `RUST_DIVERGENCES.md`.
- **1.0.0-beta.2 (September 13, 2026)** - Diagnostic line breaking measures strings in UTF-8 bytes as the reference does; dates outside the reference's representable range are `InvalidDate` (an integer `f64` cannot hold is `OutOfRange` on decode) instead of a late `RangeError`; `registerStandardTags` names the bignum tags only on request, as the reference names them only under `num-bigint`; a tag-registration conflict is a `CborError`; `CborDate.fromString` parses exactly as `Date::from_string` (nanosecond fractions, leap seconds, chrono's bare-date forms), the component constructors validate instead of rolling over, and `toString()` prints years outside 0–9999 as the reference does.
- **1.0.0-beta.1 (July 21, 2026)** - Initial beta implementation.

### Roadmap

- Continued testing and auditing on the path from beta to a stable **1.0.0** release.
- Continued parity with the Rust reference implementation as it evolves (see [`RUST_DIVERGENCES.md`](./RUST_DIVERGENCES.md)).

### Dependencies

`@blockchaincommons/dcbor` has **zero runtime dependencies**. To build and work on it, you'll need the following tools:

- [Node.js](https://nodejs.org/) >= 22.12 - JavaScript runtime.
- [Bun](https://bun.sh/) - used to install dependencies and run scripts (any node package manager works).
- [TypeScript](https://www.typescriptlang.org/) >= 5.7 - language and type checker.

### Derived from ...

This `bc-dcbor-ts` project is either derived from or was inspired by:

- [BlockchainCommons/bc-dcbor-rust](https://github.com/BlockchainCommons/bc-dcbor-rust) - The reference rust implementation, by [Wolf McNally](https://github.com/wolfmcnally).
- [paritytech/bcts](https://github.com/paritytech/bcts) - A TypeScript port of many Blockchain Commons' specs, by [Parity Technologies](https://github.com/paritytech).

## Financial Support

`bc-dcbor-ts` is a project of [Blockchain Commons](https://www.blockchaincommons.com/). We are proudly a "not-for-profit" social benefit corporation committed to open source & open development. Our work is funded entirely by donations and collaborative partnerships with people like you. Every contribution will be spent on building open tools, technologies, and techniques that sustain and advance blockchain and internet security infrastructure and promote an open web.

To financially support further development of `bc-dcbor-ts` and other projects, please consider becoming a Patron of Blockchain Commons through ongoing monthly patronage as a [GitHub Sponsor](https://github.com/sponsors/BlockchainCommons). You can also support Blockchain Commons with bitcoins at our [BTCPay Server](https://btcpay.blockchaincommons.com/).

## Contributing

We encourage public contributions through issues and pull requests! Please review [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our development process. All contributions to this repository require a GPG signed [Contributor License Agreement](./CLA.md).

### Discussions

The best place to talk about Blockchain Commons and its projects is in our GitHub Discussions areas.

[**Gordian Developer Community**](https://github.com/BlockchainCommons/Gordian-Developer-Community/discussions). For standards and open-source developers who want to talk about interoperable wallet specifications, please use the Discussions area of the [Gordian Developer Community repo](https://github.com/BlockchainCommons/Gordian-Developer-Community/discussions). This is where you talk about Gordian specifications such as [Gordian Envelope](https://github.com/BlockchainCommons/Gordian/tree/master/Envelope#articles), [bc-shamir](https://github.com/BlockchainCommons/bc-shamir), [Sharded Secret Key Reconstruction](https://github.com/BlockchainCommons/bc-sskr), and [bc-ur](https://github.com/BlockchainCommons/bc-ur) as well as the larger [Gordian Architecture](https://github.com/BlockchainCommons/Gordian/blob/master/Docs/Overview-Architecture.md), its [Principles](https://github.com/BlockchainCommons/Gordian#gordian-principles) of independence, privacy, resilience, and openness, and its macro-architectural ideas such as functional partition (including airgapping, the original name of this community).

[**Gordian User Community**](https://github.com/BlockchainCommons/Gordian/discussions). For users of the Gordian reference apps, including [Gordian Coordinator](https://github.com/BlockchainCommons/iOS-GordianCoordinator), [Gordian Seed Tool](https://github.com/BlockchainCommons/GordianSeedTool-iOS), [Gordian Server](https://github.com/BlockchainCommons/GordianServer-macOS), [Gordian Wallet](https://github.com/BlockchainCommons/GordianWallet-iOS), and [SpotBit](https://github.com/BlockchainCommons/spotbit) as well as our whole series of [CLI apps](https://github.com/BlockchainCommons/Gordian/blob/master/Docs/Overview-Apps.md#cli-apps). This is a place to talk about bug reports and feature requests as well as to explore how our reference apps embody the [Gordian Principles](https://github.com/BlockchainCommons/Gordian#gordian-principles).

[**Blockchain Commons Discussions**](https://github.com/BlockchainCommons/Community/discussions). For developers, interns, and patrons of Blockchain Commons, please use the discussions area of the [Community repo](https://github.com/BlockchainCommons/Community) to talk about general Blockchain Commons issues, the intern program, or topics other than those covered by the [Gordian Developer Community](https://github.com/BlockchainCommons/Gordian-Developer-Community/discussions) or the 
[Gordian User Community](https://github.com/BlockchainCommons/Gordian/discussions).

### Other Questions & Problems

As an open-source, open-development community, Blockchain Commons does not have the resources to provide direct support of our projects. Please consider the discussions area as a locale where you might get answers to questions. Alternatively, please use this repository's [issues](https://github.com/BlockchainCommons/bc-dcbor-ts/issues) feature. Unfortunately, we can not make any promises on response time.

If your company requires support to use our projects, please feel free to contact us directly about options. We may be able to offer you a contract for support from one of our contributors, or we might be able to point you to another entity who can offer the contractual support that you need.

### Credits

The following people directly contributed to this repository. You can add your name here by getting involved. The first step is learning how to contribute from our [CONTRIBUTING.md](./CONTRIBUTING.md) documentation.

| Name              | Role                | Github                                            | Email                                 | GPG Fingerprint                                    |
| ----------------- | ------------------- | ------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| Christopher Allen | Principal Architect | [@ChristopherA](https://github.com/ChristopherA) | \<ChristopherA@LifeWithAlacrity.com\> | FDFE 14A5 4ECB 30FC 5D22  74EF F8D3 6C91 3574 05ED |
| Wolf McNally      | Lead Researcher/Engineer | [@wolfmcnally](https://github.com/wolfmcnally) | \<Wolf@WolfMcNally.com\> | 9436 52EE 3844 1760 C3DC  3536 4B6C 2FCF 8947 80AE |
| Leonardo Custodio | Software Engineer   | [@leonardocustodio](https://github.com/leonardocustodio) | \<leonardo@snowpine.io\> | 59DA D997 67EF 3BAB 2B90 D057 5384 DEF3 B582 450D |

### Contributing Sponsor

**Blockchain Commons Deterministic CBOR for TypeScript** was produced as a collaboration between Blockchain Commons and one of our patrons, [Parity Technologies](https://parity.io): Parity wrote the wrappers based on Blockchain Commons' specifications and reference libraries. Blockchain Commons is dedicated to not just creating open infrastructure on our own, but also coordinating the work of other companies in benefiting the Commons. Thanks to Parity for working directly with us in this manner.

![](.github/assets/parity.svg)

## Responsible Disclosure

We want to keep all of our software safe for everyone. If you have discovered a security vulnerability, we appreciate your help in disclosing it to us in a responsible manner. We are unfortunately not able to offer bug bounties at this time.

We do ask that you offer us good faith and use best efforts not to leak information or harm any user, their data, or our developer community. Please give us a reasonable amount of time to fix the issue before you publish it. Do not defraud our users or us in the process of discovery. We promise not to bring legal action against researchers who point out a problem provided they do their best to follow the these guidelines.

### Reporting a Vulnerability

Please report suspected security vulnerabilities in private via email to ChristopherA@BlockchainCommons.com (do not use this email for support). Please do NOT create publicly viewable issues for suspected security vulnerabilities.

The following keys may be used to communicate sensitive information to developers:

| Name              | Fingerprint                                        |
| ----------------- | -------------------------------------------------- |
| Christopher Allen | FDFE 14A5 4ECB 30FC 5D22  74EF F8D3 6C91 3574 05ED |

You can import a key by running the following command with that individual’s fingerprint: `gpg --recv-keys "<fingerprint>"` Ensure that you put quotes around fingerprints that contain spaces.
