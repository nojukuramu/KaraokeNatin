fn main() {
  println!("cargo:rerun-if-changed=remote-ui/index.html");
  tauri_build::build()
}
