//! Cross-validates the @blockchaincommons/dcbor golden vectors against the Rust
//! reference implementation (`dcbor` crate, bc-dcbor-rust).
//!
//! Usage (run both; the reference's `num-bigint` feature changes how tags 2
//! and 3 are named and which recipes it can materialize):
//!
//!   cargo run --release -- <path-to-tests/vectors>
//!   cargo run --release --features bignum -- <path-to-tests/vectors>
//!
//! Reads the five fixture files and compares the reference's outcome with the
//! committed expectation:
//!
//!   encode-vectors.json  recipe -> bytes (or a CborError code)
//!   decode-vectors.json  bytes -> re-encoded bytes, or a code AND message
//!   format-vectors.json  value + tags store -> diagnostic (plain, annotated,
//!                        flat, summary) and annotated hex
//!   date-vectors.json    tag-1 bytes / date recipe -> bytes + Display, or code
//!   uint-vectors.json    bytes -> u8/u16/u32/u64::try_from
//!
//! Every vector is classified as:
//!
//!   match            - the reference produces exactly the fixture outcome
//!   reference-throw  - the reference itself rejects the input
//!                      (`Date::from_string`), with the fixture's code
//!   emulated-throw   - a TS guard the harness mirrors because the reference
//!                      cannot express the input (`cbor(bigint)` outside the
//!                      CBOR integer range, a negative `biguintToCbor`) or
//!                      would panic on it (`Date::from_timestamp` on ±Infinity
//!                      or whole seconds outside chrono's range - probed with
//!                      chrono's own `timestamp_opt` before the call)
//!   skipped          - JS-only input shape (Symbol, function, malformed bare
//!                      node), a tombstoned recipe, a row pinned to the other
//!                      build, or a bignum recipe in the default build
//!   expected-divergence - a documented TS<->Rust difference allowlisted by
//!                      vector name in `expected_divergences()` (empty today)
//!   MISMATCH         - anything else; fails the run
//!
//! Exit code 0 iff there are no MISMATCHes.

use std::collections::BTreeMap;
use std::process::ExitCode;

use chrono::{LocalResult, TimeZone, Utc};
use dcbor::prelude::*;
use dcbor::{register_tags_in, DiagFormatOpts, HexFormatOpts, Simple, TagsStoreOpt};
use serde_json::Value;
use sha2::{Digest, Sha256};

/// The build this binary was compiled as; format rows may be pinned to one.
const BUILD: &str = if cfg!(feature = "bignum") { "bignum" } else { "default" };

/// Known, documented TS↔Rust divergences: vector name -> (expected Rust
/// outcome, reason). Anything diverging outside this list is a MISMATCH.
///
/// Empty: every recorded divergence is closed. The mechanism stays so a
/// future, deliberate divergence is allowlisted by name here and recorded in
/// RUST_DIVERGENCES.md rather than hidden.
fn expected_divergences() -> BTreeMap<&'static str, (&'static str, &'static str)> {
    BTreeMap::new()
}

enum Materialized {
    Value(CBOR),
    /// The reference rejected the input itself (a real `dcbor::Error`).
    ReferenceThrow(&'static str),
    /// TS-side input guard reproduced by the harness (see module docs).
    EmulatedThrow(&'static str),
    Skip(&'static str),
}

use Materialized::{EmulatedThrow, ReferenceThrow, Skip, Value as Mat};

fn parse_f64(v: &str) -> f64 {
    match v {
        "NaN" => f64::NAN,
        "Infinity" => f64::INFINITY,
        "-Infinity" => f64::NEG_INFINITY,
        "-0" => -0.0,
        _ => v.parse::<f64>().expect("bad number literal"),
    }
}

const U64_MAX_I128: i128 = u64::MAX as i128;
const CBOR_INT_MIN_I128: i128 = -(1i128 << 64);

/// Mirrors cbor(bigint): integers in [-(2^64), 2^64-1]; outside throws.
fn cbor_from_i128(v: i128) -> Materialized {
    if v >= 0 && v <= U64_MAX_I128 {
        Mat(CBORCase::Unsigned(v as u64).into())
    } else if v < 0 && v >= CBOR_INT_MIN_I128 {
        Mat(CBORCase::Negative((-1 - v) as u64).into())
    } else {
        EmulatedThrow("OutOfRange")
    }
}

fn tag_from_str(s: &str) -> u64 {
    s.parse::<u64>().expect("bad tag literal")
}

fn cycle_bytes(start: u64, count: u64) -> Vec<u8> {
    (0..count).map(|i| ((start + i) & 0xff) as u8).collect()
}

/// `Date::from_timestamp` is `Utc.timestamp_opt(trunc as i64, (fract * 1e9)
/// as u32).unwrap()`: it panics where chrono has no such instant (±inf
/// saturate to the i64 bounds; whole seconds outside ±262143 years), and TS
/// throws InvalidDate there. Probe chrono with the reference's own
/// arithmetic and emulate the throw. NaN is NOT guarded: `trunc() as i64`
/// saturates it to 0, the epoch, on both sides.
fn date_from_timestamp(secs: f64) -> Result<Date, Materialized> {
    let whole = secs.trunc() as i64;
    let nsecs = (secs.fract() * 1_000_000_000.0) as u32;
    if matches!(Utc.timestamp_opt(whole, nsecs), LocalResult::None) {
        return Err(EmulatedThrow("InvalidDate"));
    }
    Ok(Date::from_timestamp(secs))
}

/// SameValueZero-style dedup key for the jsset emulation (JS Set semantics:
/// numbers by value with NaN==NaN and +0==-0; bigints/strings/bools/null by
/// value but distinct across kinds; objects by identity - never deduped).
fn jsset_key(item: &Value) -> Option<String> {
    let k = item["k"].as_str()?;
    match k {
        "n" => {
            let f = parse_f64(item["v"].as_str()?);
            let bits = if f.is_nan() {
                f64::NAN.to_bits()
            } else if f == 0.0 {
                0u64 // +0 and -0 are SameValueZero-equal
            } else {
                f.to_bits()
            };
            Some(format!("n:{bits}"))
        }
        "bi" => Some(format!("bi:{}", item["v"].as_str()?)),
        "s" => Some(format!("s:{}", item["v"].as_str()?)),
        "b" => Some(format!("b:{}", item["v"].as_bool()?)),
        "null" | "undef" => Some(k.to_string()),
        _ => None, // object-like: identity semantics, never dedups
    }
}

fn materialize(recipe: &Value) -> Materialized {
    let kind = recipe["k"].as_str().expect("recipe without kind");
    match kind {
        "n" => Mat(CBOR::from(parse_f64(recipe["v"].as_str().unwrap()))),
        "bi" => cbor_from_i128(recipe["v"].as_str().unwrap().parse::<i128>().unwrap()),
        "s" => Mat(CBOR::from(recipe["v"].as_str().unwrap())),
        "sr" => {
            let unit = recipe["unit"].as_str().unwrap();
            let count = recipe["count"].as_u64().unwrap() as usize;
            Mat(CBOR::from(unit.repeat(count)))
        }
        "b" => Mat(CBOR::from(recipe["v"].as_bool().unwrap())),
        "null" => Mat(CBORCase::Simple(Simple::Null).into()),
        // JS-only: undefined maps to null in cbor(); validate the target.
        "undef" => Mat(CBORCase::Simple(Simple::Null).into()),
        "bytes" => Mat(CBOR::to_byte_string(
            hex::decode(recipe["hex"].as_str().unwrap()).unwrap(),
        )),
        "br" => Mat(CBOR::to_byte_string(cycle_bytes(
            recipe["start"].as_u64().unwrap(),
            recipe["count"].as_u64().unwrap(),
        ))),
        "arr" => {
            let mut items: Vec<CBOR> = Vec::new();
            for item in recipe["items"].as_array().unwrap() {
                match materialize(item) {
                    Mat(c) => items.push(c),
                    other => return other,
                }
            }
            Mat(items.into())
        }
        "intarr" => {
            let count = recipe["count"].as_u64().unwrap();
            let items: Vec<CBOR> = (0..count).map(|i| CBOR::from(i % 24)).collect();
            Mat(items.into())
        }
        "intmap" => {
            let count = recipe["count"].as_u64().unwrap();
            let mut map = Map::new();
            for i in 0..count {
                map.insert(i, format!("v{i}"));
            }
            Mat(map.into())
        }
        "obj" => {
            let mut map = Map::new();
            for entry in recipe["entries"].as_array().unwrap() {
                let key = entry[0].as_str().unwrap();
                match materialize(&entry[1]) {
                    Mat(v) => map.insert(key, v),
                    other => return other,
                }
            }
            Mat(map.into())
        }
        "jsmap" | "map" => {
            let mut map = Map::new();
            for entry in recipe["entries"].as_array().unwrap() {
                let k = match materialize(&entry[0]) {
                    Mat(c) => c,
                    other => return other,
                };
                let v = match materialize(&entry[1]) {
                    Mat(c) => c,
                    other => return other,
                };
                map.insert(k, v);
            }
            Mat(map.into())
        }
        // JS Set: insertion order preserved on the wire, SameValueZero dedup.
        "jsset" => {
            let mut seen = std::collections::HashSet::new();
            let mut items: Vec<CBOR> = Vec::new();
            for item in recipe["items"].as_array().unwrap() {
                if let Some(key) = jsset_key(item) {
                    if !seen.insert(key) {
                        continue;
                    }
                }
                match materialize(item) {
                    Mat(c) => items.push(c),
                    other => return other,
                }
            }
            Mat(items.into())
        }
        "set" => {
            let mut set = Set::new();
            for item in recipe["items"].as_array().unwrap() {
                match materialize(item) {
                    Mat(c) => set.insert(c),
                    other => return other,
                }
            }
            Mat(set.into())
        }
        "tagged" => {
            let tag = tag_from_str(recipe["tag"].as_str().unwrap());
            match materialize(&recipe["content"]) {
                Mat(c) => Mat(CBOR::to_tagged_value(tag, c)),
                other => other,
            }
        }
        // Removed input shapes (a `{tag, value}` object literal, a
        // `taggedCbor`-only object): their fixtures expect a TS directive
        // error and are skipped before materialization (see run_encode).
        "tagobjlit" | "taggedproto" => Skip("tombstoned JS-only input shape"),
        "date" => match date_from_timestamp(parse_f64(recipe["seconds"].as_str().unwrap())) {
            Ok(d) => Mat(d.into()),
            Err(m) => m,
        },
        "datestr" => match Date::from_string(recipe["v"].as_str().unwrap()) {
            Ok(d) => Mat(d.into()),
            Err(_) => ReferenceThrow("InvalidDate"),
        },
        "bytestring" => Mat(CBOR::to_byte_string(
            hex::decode(recipe["hex"].as_str().unwrap()).unwrap(),
        )),
        "biguint" => {
            let v = recipe["v"].as_str().unwrap();
            if v.starts_with('-') {
                return EmulatedThrow("OutOfRange"); // TS biguintToCbor(<0)
            }
            #[cfg(feature = "bignum")]
            {
                Mat(CBOR::from(v.parse::<num_bigint::BigUint>().unwrap()))
            }
            #[cfg(not(feature = "bignum"))]
            {
                Skip("needs num-bigint")
            }
        }
        "bignum" => {
            #[cfg(feature = "bignum")]
            {
                Mat(CBOR::from(
                    recipe["v"].as_str().unwrap().parse::<num_bigint::BigInt>().unwrap(),
                ))
            }
            #[cfg(not(feature = "bignum"))]
            {
                Skip("needs num-bigint")
            }
        }
        // Protocol wrappers: byte-equivalent to their underlying values.
        "tocbor" => materialize(&recipe["inner"]),
        // Dispatch precedence: toCbor() wins over taggedCbor(), so bothproto
        // encodes as the toCbor side's marker array.
        "bothproto" => match materialize(&recipe["inner"]) {
            Mat(c) => Mat(vec![CBOR::from("toCbor-won"), c].into()),
            other => other,
        },
        // Inherited tag/value falls through to plain-object→map of OWN keys.
        "protoobj" => {
            let mut map = Map::new();
            for entry in recipe["ownEntries"].as_array().unwrap() {
                let key = entry[0].as_str().unwrap();
                match materialize(&entry[1]) {
                    Mat(v) => map.insert(key, v),
                    other => return other,
                }
            }
            Mat(map.into())
        }
        // Bare Cbor nodes - direct CBORCase construction.
        "floatsimple" => Mat(CBORCase::Simple(Simple::Float(parse_f64(
            recipe["v"].as_str().unwrap(),
        )))
        .into()),
        "rawuint" => Mat(CBORCase::Unsigned(recipe["v"].as_str().unwrap().parse().unwrap()).into()),
        // Bare Text node: the string is stored verbatim and NFC-normalized by
        // `cbor_data` at encode time (cbor.rs), exactly like the TS node.
        "rawtext" => Mat(CBORCase::Text(recipe["v"].as_str().unwrap().to_string()).into()),
        "rawnegmag" => {
            Mat(CBORCase::Negative(recipe["v"].as_str().unwrap().parse().unwrap()).into())
        }
        // JS-only inputs with no Rust analog.
        "rawbad" => Skip("malformed bare node is a JS-only input"),
        "symbol" => Skip("Symbol input is JS-only"),
        "fn" => Skip("function input is JS-only"),
        other => panic!("unknown recipe kind: {other}"),
    }
}

fn error_code(e: &dcbor::Error) -> &'static str {
    use dcbor::Error as E;
    match e {
        E::Underrun => "Underrun",
        E::UnsupportedHeaderValue(_) => "UnsupportedHeaderValue",
        E::NonCanonicalNumeric => "NonCanonicalNumeric",
        E::InvalidSimpleValue => "InvalidSimpleValue",
        E::InvalidString(_) => "InvalidString",
        E::NonCanonicalString => "NonCanonicalString",
        E::UnusedData(_) => "UnusedData",
        E::MisorderedMapKey => "MisorderedMapKey",
        E::DuplicateMapKey => "DuplicateMapKey",
        E::MissingMapKey => "MissingMapKey",
        E::OutOfRange => "OutOfRange",
        E::WrongType => "WrongType",
        E::WrongTag(_, _) => "WrongTag",
        E::InvalidUtf8(_) => "InvalidUtf8",
        E::InvalidDate(_) => "InvalidDate",
        E::Custom(_) => "Custom",
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

#[derive(Clone, Copy)]
enum ThrowClass {
    Reference,
    Emulated,
}

#[derive(Default)]
struct Tally {
    matched: usize,
    reference_throw: usize,
    emulated: usize,
    skipped: usize,
    expected_divergence: usize,
    mismatches: Vec<String>,
}

impl Tally {
    fn mismatch(&mut self, name: &str, detail: String) {
        self.mismatches.push(format!("{name}: {detail}"));
    }

    /// Compare a Rust outcome string with the fixture's, honouring the
    /// allowlist; `throw_class` says which throw tally a matching throw feeds.
    fn judge(
        &mut self,
        name: &str,
        rust: &str,
        ts: &str,
        throw_class: ThrowClass,
        divergences: &BTreeMap<&str, (&str, &str)>,
    ) {
        if rust == ts {
            if rust.starts_with("throw") {
                match throw_class {
                    ThrowClass::Reference => self.reference_throw += 1,
                    ThrowClass::Emulated => self.emulated += 1,
                }
            } else {
                self.matched += 1;
            }
        } else if let Some((allowed, _why)) = divergences.get(name) {
            if rust == *allowed {
                self.expected_divergence += 1;
            } else {
                self.mismatch(
                    name,
                    format!("divergence allowlisted as '{allowed}' but Rust gave '{rust}'"),
                );
            }
        } else {
            self.mismatch(name, format!("TS {ts} != Rust {rust}"));
        }
    }
}

/// The Rust-side outcome of a recipe, as a comparable string.
fn outcome_string(m: Materialized) -> Result<(String, ThrowClass), &'static str> {
    match m {
        Mat(c) => Ok((format!("bytes {}", hex::encode(c.to_cbor_data())), ThrowClass::Reference)),
        ReferenceThrow(code) => Ok((format!("throw {code}"), ThrowClass::Reference)),
        EmulatedThrow(code) => Ok((format!("throw {code}"), ThrowClass::Emulated)),
        Skip(reason) => Err(reason),
    }
}

fn run_encode(vectors: &[Value], tally: &mut Tally, divergences: &BTreeMap<&str, (&str, &str)>) {
    for vector in vectors {
        let name = vector["name"].as_str().unwrap();
        let expect = &vector["expect"];

        // Tombstone fixtures that expect a throw exercise TS-only directive
        // errors (a `{tag, value}` object literal, a `taggedCbor`-only
        // object) - there is no Rust analog to compare.
        if vector["tombstone"].is_string() && expect["ok"].as_bool() == Some(false) {
            tally.skipped += 1;
            continue;
        }

        let (rust_outcome, throw_class) = match outcome_string(materialize(&vector["recipe"])) {
            Ok(o) => o,
            Err(_reason) => {
                tally.skipped += 1;
                continue;
            }
        };

        // Fixture expectation as the same comparable string.
        let ts_outcome = if expect["ok"].as_bool().unwrap() {
            if let Some(digest) = expect["sha256"].as_str() {
                // Digest-form fixture: compare digest+length of Rust bytes.
                let Some(rust_hex) = rust_outcome.strip_prefix("bytes ") else {
                    tally.mismatch(name, format!("expected bytes, Rust gave {rust_outcome}"));
                    continue;
                };
                let rust_bytes = hex::decode(rust_hex).unwrap();
                if rust_bytes.len() == expect["byteLength"].as_u64().unwrap() as usize
                    && sha256_hex(&rust_bytes) == digest
                {
                    tally.matched += 1;
                } else {
                    tally.mismatch(name, "digest/length differs from fixture".into());
                }
                continue;
            }
            format!("bytes {}", expect["hex"].as_str().unwrap())
        } else {
            format!("throw {}", expect["code"].as_str().unwrap())
        };

        tally.judge(name, &rust_outcome, &ts_outcome, throw_class, divergences);
    }
}

fn run_decode(vectors: &[Value], tally: &mut Tally, divergences: &BTreeMap<&str, (&str, &str)>) {
    for vector in vectors {
        let name = vector["name"].as_str().unwrap();
        let bytes = hex::decode(vector["hex"].as_str().unwrap()).unwrap();
        let expect = &vector["expect"];

        let rust_outcome = match CBOR::try_from_data(&bytes) {
            Ok(c) => format!("bytes {}", hex::encode(c.to_cbor_data())),
            // Rejections compare by code AND by the error's Display text: the
            // message is part of the contract the port keeps.
            Err(e) => format!("throw {} / {}", error_code(&e), e),
        };
        let ts_outcome = if expect["ok"].as_bool().unwrap() {
            // An accept fixture may pin a re-encoding that differs from the
            // input (whole-valued f32/f64 heads decode to integer nodes);
            // otherwise the accept must round-trip byte-identically.
            let hex = expect["hex"]
                .as_str()
                .unwrap_or_else(|| vector["hex"].as_str().unwrap());
            format!("bytes {hex}")
        } else {
            format!(
                "throw {} / {}",
                expect["code"].as_str().unwrap(),
                expect["message"].as_str().unwrap_or("<no message in fixture>")
            )
        };

        tally.judge(name, &rust_outcome, &ts_outcome, ThrowClass::Reference, divergences);
    }
}

/// The tags store a format row asks for, as the reference's `TagsStoreOpt`.
fn tags_store_for(config: &str) -> Option<TagsStore> {
    match config {
        "none" => None,
        "standard" | "standard+bignum" => {
            // `register_tags_in` registers whatever this build supports: the
            // date tag, plus tags 2/3 under `num-bigint`. Rows are pinned to
            // the build whose store they describe.
            let mut store = TagsStore::default();
            register_tags_in(&mut store);
            Some(store)
        }
        other => panic!("unknown format config: {other}"),
    }
}

fn run_format(vectors: &[Value], tally: &mut Tally, divergences: &BTreeMap<&str, (&str, &str)>) {
    for vector in vectors {
        let name = vector["name"].as_str().unwrap();
        if let Some(build) = vector["build"].as_str() {
            if build != BUILD {
                tally.skipped += 1;
                continue;
            }
        }
        let input = &vector["input"];
        let value = if let Some(h) = input["hex"].as_str() {
            match CBOR::try_from_data(&hex::decode(h).unwrap()) {
                Ok(c) => c,
                Err(e) => {
                    tally.mismatch(name, format!("input bytes do not decode: {e}"));
                    continue;
                }
            }
        } else {
            match materialize(&input["recipe"]) {
                Mat(c) => c,
                Skip(_) => {
                    tally.skipped += 1;
                    continue;
                }
                ReferenceThrow(code) | EmulatedThrow(code) => {
                    tally.mismatch(name, format!("input recipe throws {code}"));
                    continue;
                }
            }
        };
        let store = tags_store_for(vector["config"].as_str().unwrap());
        let opt = || match &store {
            None => TagsStoreOpt::None,
            Some(s) => TagsStoreOpt::Custom(s),
        };
        let expect = &vector["expect"];
        let rendered: [(&str, String); 6] = [
            ("hex", value.hex()),
            ("diagnostic", value.diagnostic_opt(&DiagFormatOpts::default().tags(opt()))),
            (
                "annotated",
                value.diagnostic_opt(&DiagFormatOpts::default().annotate(true).tags(opt())),
            ),
            ("flat", value.diagnostic_opt(&DiagFormatOpts::default().flat(true).tags(opt()))),
            (
                "summary",
                value.diagnostic_opt(&DiagFormatOpts::default().summarize(true).tags(opt())),
            ),
            (
                "hexAnnotated",
                value.hex_opt(&HexFormatOpts::default().annotate(true).context(opt())),
            ),
        ];
        let mut rust = String::new();
        let mut ts = String::new();
        for (field, actual) in &rendered {
            let expected = expect[*field].as_str().unwrap_or("<missing>");
            rust.push_str(&format!("{field}={actual:?}\n"));
            ts.push_str(&format!("{field}={expected:?}\n"));
        }
        tally.judge(name, &rust, &ts, ThrowClass::Reference, divergences);
    }
}

/// Whether `Date::from_tagged_cbor` on this value would panic inside
/// `from_timestamp` (±inf, whole seconds outside chrono's range). Anything
/// else runs the real decoder, so the real error (WrongType, WrongTag,
/// OutOfRange) is reported with its message.
fn date_decode_panics(cbor: &CBOR) -> bool {
    if let CBORCase::Tagged(tag, item) = cbor.as_case() {
        if tag.value() == 1 {
            if let Ok(secs) = f64::try_from(item.clone()) {
                return date_from_timestamp(secs).is_err();
            }
        }
    }
    false
}

fn run_date(vectors: &[Value], tally: &mut Tally, divergences: &BTreeMap<&str, (&str, &str)>) {
    for vector in vectors {
        let name = vector["name"].as_str().unwrap();
        let expect = &vector["expect"];
        let kind = vector["kind"].as_str().unwrap();

        // Rust outcome: "bytes <hex> display <text>" or "throw <code>[ / <message>]".
        let (rust_outcome, throw_class) = if kind == "decode" {
            let bytes = hex::decode(vector["hex"].as_str().unwrap()).unwrap();
            match CBOR::try_from_data(&bytes) {
                Err(e) => (format!("throw {} / {}", error_code(&e), e), ThrowClass::Reference),
                Ok(cbor) if date_decode_panics(&cbor) => {
                    ("throw InvalidDate".to_string(), ThrowClass::Emulated)
                }
                Ok(cbor) => match Date::from_tagged_cbor(cbor) {
                    Ok(d) => (
                        format!("bytes {} display {}", hex::encode(d.to_cbor_data()), d),
                        ThrowClass::Reference,
                    ),
                    Err(e) => (format!("throw {} / {}", error_code(&e), e), ThrowClass::Reference),
                },
            }
        } else {
            let recipe = &vector["recipe"];
            let date = match recipe["k"].as_str().unwrap() {
                "date" => date_from_timestamp(parse_f64(recipe["seconds"].as_str().unwrap())),
                "datestr" => Date::from_string(recipe["v"].as_str().unwrap())
                    .map_err(|_| ReferenceThrow("InvalidDate")),
                other => panic!("date display recipe must be date/datestr, got {other}"),
            };
            match date {
                Ok(d) => (
                    format!("bytes {} display {}", hex::encode(d.to_cbor_data()), d),
                    ThrowClass::Reference,
                ),
                Err(EmulatedThrow(code)) => (format!("throw {code}"), ThrowClass::Emulated),
                Err(ReferenceThrow(code)) => (format!("throw {code}"), ThrowClass::Reference),
                Err(_) => unreachable!(),
            }
        };

        let ts_outcome = if expect["ok"].as_bool().unwrap() {
            format!(
                "bytes {} display {}",
                expect["hex"].as_str().unwrap(),
                expect["display"].as_str().unwrap()
            )
        } else if let (Some(message), ThrowClass::Reference) =
            (expect["message"].as_str(), throw_class)
        {
            format!("throw {} / {}", expect["code"].as_str().unwrap(), message)
        } else {
            // The reference panics here (emulated), or the row pins the code only.
            format!("throw {}", expect["code"].as_str().unwrap())
        };

        tally.judge(name, &rust_outcome, &ts_outcome, throw_class, divergences);
    }
}

fn run_uint(vectors: &[Value], tally: &mut Tally, divergences: &BTreeMap<&str, (&str, &str)>) {
    for vector in vectors {
        let name = vector["name"].as_str().unwrap();
        let bytes = hex::decode(vector["hex"].as_str().unwrap()).unwrap();
        let cbor = CBOR::try_from_data(&bytes).expect("uint vector must decode");
        let width = vector["width"].as_u64().unwrap();
        let result: Result<String, dcbor::Error> = match width {
            8 => u8::try_from(cbor).map(|v| v.to_string()),
            16 => u16::try_from(cbor).map(|v| v.to_string()),
            32 => u32::try_from(cbor).map(|v| v.to_string()),
            64 => u64::try_from(cbor).map(|v| v.to_string()),
            other => panic!("unsupported width {other}"),
        };
        let rust_outcome = match result {
            Ok(v) => format!("value {v}"),
            Err(e) => format!("throw {}", error_code(&e)),
        };
        let expect = &vector["expect"];
        let ts_outcome = if expect["ok"].as_bool().unwrap() {
            format!("value {}", expect["value"].as_str().unwrap())
        } else {
            format!("throw {}", expect["code"].as_str().unwrap())
        };
        tally.judge(name, &rust_outcome, &ts_outcome, ThrowClass::Reference, divergences);
    }
}

fn main() -> ExitCode {
    let dir = std::env::args().nth(1).expect("usage: <path-to-tests/vectors>");
    let load = |file: &str| -> Vec<Value> {
        let raw = std::fs::read_to_string(format!("{dir}/{file}"))
            .unwrap_or_else(|e| panic!("cannot read {dir}/{file}: {e}"));
        // Node's JSON.stringify escapes lone surrogates (\ud800), which
        // serde_json rejects. The only vectors using them exercise the
        // JS-only TextEncoder→U+FFFD replacement, which is exactly the byte
        // the fixture pins - so substituting U+FFFD preserves semantics.
        let raw = raw.replace("\\ud800", "\u{fffd}");
        serde_json::from_str::<Value>(&raw).expect("bad JSON")["vectors"]
            .as_array()
            .unwrap()
            .clone()
    };

    let divergences = expected_divergences();
    let mut encode_tally = Tally::default();
    let mut decode_tally = Tally::default();
    let mut format_tally = Tally::default();
    let mut date_tally = Tally::default();
    let mut uint_tally = Tally::default();

    let encode_vectors = load("encode-vectors.json");
    let decode_vectors = load("decode-vectors.json");
    let format_vectors = load("format-vectors.json");
    let date_vectors = load("date-vectors.json");
    let uint_vectors = load("uint-vectors.json");
    run_encode(&encode_vectors, &mut encode_tally, &divergences);
    run_decode(&decode_vectors, &mut decode_tally, &divergences);
    run_format(&format_vectors, &mut format_tally, &divergences);
    run_date(&date_vectors, &mut date_tally, &divergences);
    run_uint(&uint_vectors, &mut uint_tally, &divergences);

    println!("build: {BUILD}");
    println!(
        "encode: {} vectors - {} match, {} reference-throw, {} emulated-throw, {} skipped, {} expected-divergence, {} MISMATCH",
        encode_vectors.len(),
        encode_tally.matched,
        encode_tally.reference_throw,
        encode_tally.emulated,
        encode_tally.skipped,
        encode_tally.expected_divergence,
        encode_tally.mismatches.len()
    );
    println!(
        "decode: {} vectors - {} match, {} reference-throw, {} expected-divergence, {} MISMATCH",
        decode_vectors.len(),
        decode_tally.matched,
        decode_tally.reference_throw,
        decode_tally.expected_divergence,
        decode_tally.mismatches.len()
    );
    println!(
        "format: {} vectors - {} match, {} skipped, {} expected-divergence, {} MISMATCH",
        format_vectors.len(),
        format_tally.matched,
        format_tally.skipped,
        format_tally.expected_divergence,
        format_tally.mismatches.len()
    );
    println!(
        "date: {} vectors - {} match, {} reference-throw, {} emulated-throw, {} expected-divergence, {} MISMATCH",
        date_vectors.len(),
        date_tally.matched,
        date_tally.reference_throw,
        date_tally.emulated,
        date_tally.expected_divergence,
        date_tally.mismatches.len()
    );
    println!(
        "uint: {} vectors - {} match, {} reference-throw, {} expected-divergence, {} MISMATCH",
        uint_vectors.len(),
        uint_tally.matched,
        uint_tally.reference_throw,
        uint_tally.expected_divergence,
        uint_tally.mismatches.len()
    );

    let all: Vec<&String> = encode_tally
        .mismatches
        .iter()
        .chain(decode_tally.mismatches.iter())
        .chain(format_tally.mismatches.iter())
        .chain(date_tally.mismatches.iter())
        .chain(uint_tally.mismatches.iter())
        .collect();
    if !all.is_empty() {
        println!("\nMISMATCHES:");
        for m in &all {
            println!("  - {m}");
        }
        return ExitCode::FAILURE;
    }
    println!("\nAll vectors validated against dcbor (Rust) 0.25.2 ({BUILD} build)");
    ExitCode::SUCCESS
}
