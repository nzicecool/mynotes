fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "vault_status",
            "setup_vault",
            "unlock_vault",
            "lock_vault",
            "recover_vault",
            "change_pin",
            "regenerate_codes",
            "list_notes",
            "save_note",
            "delete_note",
            "export_backup",
            "restore_backup",
        ]),
    ))
    .expect("Tauri build configuration is invalid");
}
