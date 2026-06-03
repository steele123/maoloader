fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let module_def = std::path::Path::new(&manifest_dir).join("module.def");

    println!("cargo:rustc-link-arg-cdylib=/DEF:{}", module_def.display());
    println!("cargo:rerun-if-changed={}", module_def.display());
}
