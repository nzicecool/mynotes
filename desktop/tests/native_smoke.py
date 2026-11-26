#!/usr/bin/env python3
"""Real Tauri/WebKit/OS-keyring smoke test, never mocked IPC or browser storage.

Run with run_linux_smoke.sh in a disposable desktop session. No PIN or recovery
code is printed, screenshotted, or saved to the report. Screenshots use test notes.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.options import BaseOptions
from selenium.webdriver.remote.client_config import ClientConfig
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


class TauriOptions(BaseOptions):
    @property
    def default_capabilities(self):
        return {"browserName": "wry"}

    def to_capabilities(self):
        return self._caps


def stop_disposable_native_children():
    """AppImage's launcher can exit while its native child remains alive.

    Reap only MyNotes processes belonging to this exact disposable XDG directory.
    This helper cannot target the user's normal installed application or vault.
    """
    marker = b"XDG_DATA_HOME=" + os.environ["XDG_DATA_HOME"].encode()
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            executable = (entry / "exe").readlink().name
            environment = (entry / "environ").read_bytes().split(b"\0")
            if executable == "mynotes-desktop" and marker in environment:
                os.kill(int(entry.name), signal.SIGTERM)
                deadline = time.monotonic() + 5
                while (entry / "exe").exists() and time.monotonic() < deadline:
                    time.sleep(0.1)
                if (entry / "exe").exists():
                    raise RuntimeError("Disposable native app did not terminate before restart.")
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--application", required=True)
    parser.add_argument("--screenshot")
    parser.add_argument("--dashboard-screenshot")
    args = parser.parse_args()
    if not os.environ.get("MYNOTES_DISPOSABLE_SMOKE") or not os.environ.get("XDG_DATA_HOME") or not os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
        raise SystemExit("Use run_linux_smoke.sh to create a disposable XDG/DBus session.")
    options = TauriOptions()
    options.set_capability("tauri:options", {"application": str(Path(args.application).resolve())})
    process = subprocess.Popen([str(Path.home() / ".cargo/bin/tauri-driver"), "--port", "4446", "--native-port", "4447"], stdout=subprocess.DEVNULL)
    client = ClientConfig(remote_server_addr="http://127.0.0.1:4446", timeout=45)
    driver = None
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                urllib.request.urlopen("http://127.0.0.1:4446/status", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        driver = webdriver.Remote("http://127.0.0.1:4446", options=options, client_config=client)
        driver.set_script_timeout(30)
        wait = WebDriverWait(driver, 30)
        wait.until(lambda d: d.execute_script("return !!window.__TAURI_INTERNALS__"))

        def invoke(command, arguments=None, fail=False):
            result = driver.execute_async_script(
                "const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1] || {}).then(value=>done({ok:true,value})).catch(error=>done({ok:false,error:String(error)}));",
                command, arguments,
            )
            assert result["ok"] is not fail, (command, result.get("error"))
            return result.get("value")

        def click(css):
            wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, css))).click()

        def fill(css, text):
            element = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, css)))
            element.clear()
            element.send_keys(text)

        def unlock_ui(pin):
            fill("#access-pin", pin)
            click("form button[type='submit']")
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".desktop-dashboard")))

        assert invoke("vault_status")["initialized"] is False
        fill("#access-pin", "001234")
        fill("#access-confirm", "001234")
        click("form button[type='submit']")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".recovery-codes code")) == 5)
        codes = [element.text for element in driver.find_elements(By.CSS_SELECTOR, ".recovery-codes code")]
        assert len(set(codes)) == 5
        click(".codes-card input[type='checkbox']")
        click(".codes-card button.primary")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".desktop-dashboard")))
        print("PASS: first-run UI setup using real OS credential storage and code acknowledgement", flush=True)

        kinds = ("plain", "rich", "markdown", "checklist", "code", "spreadsheet")
        for index, kind in enumerate(kinds):
            click(".new-note")
            wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".type-choice")) == 6)
            click(f".type-choice:nth-child({index + 1})")
            wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, ".type-choice")))
            fill("#note-title", "My " + kind + " note")
            if kind in ("plain", "markdown", "code"):
                fill(".editor-host textarea", "Offline smoke-test body for " + kind)
            elif kind == "rich":
                fill(".editor-host [contenteditable='true']", "Offline rich text")
            elif kind == "checklist":
                fill(".editor-host input[placeholder]", "Remember the offline checklist")
                # Leave the addition pending: Lock must commit it before saving.
            elif kind == "spreadsheet":
                fill(".editor-host input", "Offline cell")
            click(".sidebar-bottom button:last-child")
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#access-pin")))
            assert invoke("vault_status")["unlocked"] is False
            invoke("list_notes", fail=True)
            assert not driver.find_elements(By.CSS_SELECTOR, ".editor-host")
            unlock_ui("001234")
            current = next(note for note in invoke("list_notes") if note["title"] == "My " + kind + " note")
            if kind == "checklist":
                assert "Remember the offline checklist" in current["content"]
                assert isinstance(json.loads(current["content"]), list)
            else:
                assert "Offline" in current["content"]
            assert current["noteType"] == kind
            print("PASS: " + kind + " editor UI and saved content after lock/unlock", flush=True)

        saved = invoke("list_notes")
        assert len(saved) == 6
        if args.dashboard_screenshot:
            driver.save_screenshot(args.dashboard_screenshot)
        click(".sidebar-bottom button:last-child")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#access-pin")))
        # Locked replacement is refused by UI before any file chooser or mutation.
        click(".vault-card button.secondary")
        wait.until(lambda d: "Unlock the current vault" in d.find_element(By.CSS_SELECTOR, ".global-notice").text)
        assert not driver.find_elements(By.CSS_SELECTOR, "#restore-code")
        invoke("save_note", {"note": {"id": None, "title": "Denied", "content": "Denied", "noteType": "plain", "tags": [], "pinned": False, "archived": False, "trashed": False}}, fail=True)
        invoke("unlock_vault", {"pin": "999999"}, fail=True)
        unlock_ui("001234")
        assert len(invoke("list_notes")) == 6
        invoke("change_pin", {"currentPin": "001234", "newPin": "006789"})
        invoke("lock_vault")
        invoke("unlock_vault", {"pin": "001234"}, fail=True)
        invoke("unlock_vault", {"pin": "006789"})
        invoke("lock_vault")
        replacement = invoke("recover_vault", {"code": codes[0], "newPin": "005555"})["codes"]
        assert len(replacement) == 5
        assert len(invoke("list_notes")) == 6
        invoke("lock_vault")
        invoke("recover_vault", {"code": codes[0], "newPin": "007777"}, fail=True)
        invoke("unlock_vault", {"pin": "005555"})
        invoke("delete_note", {"id": saved[0]["id"]})
        assert len(invoke("list_notes")) == 5
        invoke("lock_vault")
        driver.quit()
        driver = None
        stop_disposable_native_children()
        print("PASS: terminated native test process before persistent restart", flush=True)
        driver = webdriver.Remote("http://127.0.0.1:4446", options=options, client_config=client)
        driver.set_script_timeout(30)
        wait = WebDriverWait(driver, 30)
        wait.until(lambda d: d.execute_script("return !!window.__TAURI_INTERNALS__"))
        assert invoke("vault_status")["unlocked"] is False
        unlock_ui("005555")
        assert len(invoke("list_notes")) == 5
        if args.screenshot:
            click(".sidebar-bottom button:last-child")
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#access-pin")))
            driver.save_screenshot(args.screenshot)
        print("PASS: locked CRUD denial, wrong PIN, PIN change, recovery/code rotation, deletion, persistence and restart locked", flush=True)
        print("Native desktop smoke PASSED (real Tauri/WebKit UI + real GNOME Keyring).", flush=True)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        stop_disposable_native_children()


if __name__ == "__main__":
    main()
