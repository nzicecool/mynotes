use crate::{Result, VaultError};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

pub(crate) const VERSION: u32 = 1;
pub(crate) const KDF_VERSION: u32 = 1;
pub(crate) const CODE_COUNT: usize = 5;
pub(crate) type Key = Zeroizing<[u8; 32]>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Sealed {
    pub version: u32,
    pub nonce: String,
    pub ciphertext: String,
}

pub(crate) fn random<const N: usize>() -> Result<[u8; N]> {
    let mut value = [0; N];
    OsRng
        .try_fill_bytes(&mut value)
        .map_err(|_| VaultError::Storage)?;
    Ok(value)
}

pub(crate) fn pin_key(pin: &str, device_secret: &[u8], salt: &[u8]) -> Result<Key> {
    if device_secret.len() != 32 || salt.len() != 16 {
        return Err(VaultError::SecureStore);
    }
    let mut password = Zeroizing::new(Vec::with_capacity(pin.len() + 32));
    password.extend_from_slice(pin.as_bytes());
    password.extend_from_slice(device_secret);
    // KDF v1 is fixed, not attacker-selected: Argon2id v0x13, 64 MiB, t=3, p=1.
    let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|_| VaultError::Storage)?;
    let mut key = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(&password, salt, key.as_mut())
        .map_err(|_| VaultError::Storage)?;
    Ok(key)
}

pub(crate) fn seal(key: &[u8], plaintext: &[u8], aad: &[u8]) -> Result<Sealed> {
    let nonce = random::<12>()?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| VaultError::Corrupt)?;
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| VaultError::Storage)?;
    Ok(Sealed {
        version: VERSION,
        nonce: STANDARD.encode(nonce),
        ciphertext: STANDARD.encode(ciphertext),
    })
}

pub(crate) fn unseal(
    key: &[u8],
    sealed: &Sealed,
    aad: &[u8],
    max: usize,
) -> Result<Zeroizing<Vec<u8>>> {
    if sealed.version != VERSION {
        return Err(VaultError::UnsupportedVersion);
    }
    // Reject oversized encoded ciphertext before allocating decoded buffers.
    if sealed.nonce.len() != 16 || sealed.ciphertext.len() > (max + 16).div_ceil(3) * 4 {
        return Err(VaultError::Corrupt);
    }
    let nonce = STANDARD
        .decode(&sealed.nonce)
        .map_err(|_| VaultError::Corrupt)?;
    let ciphertext = STANDARD
        .decode(&sealed.ciphertext)
        .map_err(|_| VaultError::Corrupt)?;
    if nonce.len() != 12 || ciphertext.len() < 16 || ciphertext.len() > max + 16 {
        return Err(VaultError::Corrupt);
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| VaultError::Corrupt)?;
    cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &ciphertext,
                aad,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| VaultError::Authentication)
}

pub(crate) fn recovery_aad(vault_id: &str) -> Vec<u8> {
    format!("mynotes:recovery:v1:{vault_id}").into_bytes()
}

pub(crate) fn pin_aad(vault_id: &str, credential_id: &str) -> Vec<u8> {
    format!("mynotes:pin:v1:kdf1:{vault_id}:{credential_id}").into_bytes()
}

pub(crate) fn record_aad(vault_id: &str, record_id: &str) -> Vec<u8> {
    format!("mynotes:record:v1:{vault_id}:{record_id}:note").into_bytes()
}

pub(crate) fn new_codes(vault_id: &str, vault_key: &[u8]) -> Result<(Vec<String>, Vec<Sealed>)> {
    let mut codes = Vec::with_capacity(CODE_COUNT);
    let mut wrappers = Vec::with_capacity(CODE_COUNT);
    for _ in 0..CODE_COUNT {
        let secret = Zeroizing::new(random::<32>()?);
        let mut text = String::with_capacity(71);
        for (i, byte) in secret.iter().enumerate() {
            if i > 0 && i % 4 == 0 {
                text.push('-');
            }
            use std::fmt::Write;
            write!(&mut text, "{byte:02X}").map_err(|_| VaultError::Storage)?;
        }
        wrappers.push(seal(secret.as_ref(), vault_key, &recovery_aad(vault_id))?);
        codes.push(text);
    }
    Ok((codes, wrappers))
}

pub(crate) fn parse_code(code: &str) -> Result<Key> {
    if code.len() > 256 {
        return Err(VaultError::Authentication);
    }
    let normalized = Zeroizing::new(
        code.chars()
            .filter(|c| !c.is_ascii_whitespace() && *c != '-')
            .collect::<String>(),
    );
    if normalized.len() != 64 || !normalized.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(VaultError::Authentication);
    }
    let mut key = Zeroizing::new([0u8; 32]);
    for (i, pair) in normalized.as_bytes().chunks_exact(2).enumerate() {
        fn value(b: u8) -> u8 {
            if b.is_ascii_digit() {
                b - b'0'
            } else {
                b.to_ascii_uppercase() - b'A' + 10
            }
        }
        key[i] = value(pair[0]) * 16 + value(pair[1]);
    }
    Ok(key)
}

pub(crate) fn recover_key(code: &str, vault_id: &str, wrappers: &[Sealed]) -> Result<Key> {
    let secret = parse_code(code)?;
    let aad = recovery_aad(vault_id);
    for wrapper in wrappers {
        match unseal(secret.as_ref(), wrapper, &aad, 32) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut key = Zeroizing::new([0u8; 32]);
                key.copy_from_slice(&bytes);
                return Ok(key);
            }
            Ok(_) => return Err(VaultError::Corrupt),
            Err(VaultError::Authentication) => (),
            Err(error) => return Err(error),
        }
    }
    Err(VaultError::Authentication)
}
