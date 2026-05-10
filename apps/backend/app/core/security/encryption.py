from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken


class SecretsEncryptionError(RuntimeError):
    pass


def _build_fernet(raw_key: str | None) -> Fernet:
    if not raw_key:
        raise SecretsEncryptionError("SECRETS_ENCRYPTION_KEY is required")

    key = raw_key.strip().encode("utf-8")
    try:
        return Fernet(key)
    except Exception as exc:
        raise SecretsEncryptionError("SECRETS_ENCRYPTION_KEY must be a valid Fernet key") from exc


class SecretsCipher:
    def __init__(self, raw_key: str | None) -> None:
        self._fernet = _build_fernet(raw_key)

    def encrypt(self, plaintext: str) -> str:
        payload = plaintext.encode("utf-8")
        return self._fernet.encrypt(payload).decode("utf-8")

    def decrypt(self, ciphertext: str) -> str:
        try:
            value = self._fernet.decrypt(ciphertext.encode("utf-8"))
        except InvalidToken as exc:
            raise SecretsEncryptionError("Unable to decrypt secret with current key") from exc
        return value.decode("utf-8")
